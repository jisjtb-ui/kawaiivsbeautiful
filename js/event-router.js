/**
 * event-router.js - TikTok のイベントを「ゲームイベント」へ翻訳する層。
 *
 *   TikTok Connector  ->  EventRouter  ->  Game Event  ->  GameSession
 *
 * ここが TikTok の語彙 (giftId, diamondCount, uniqueId, ...) を知っている
 * 最後の場所です。ここから先へ流れるゲームイベントには TikTok 固有の情報が
 * 一切含まれないため、ゲーム側は TikTok を直接参照しません。
 *
 * ルーターは liveId ごとにゲームセッションを持てます。今は 1 本しか繋ぎませんが、
 * 将来 2 LIVE / 5 LIVE へ増やすときはセッションを足すだけで済みます。
 *
 *   router.attach('live-a', sessionA);
 *   router.attach('live-b', sessionB);
 *   router.dispatch('live-a', tiktokEvent);
 */
(function (global) {
  'use strict';

  /** ルーターが下流へ流すゲームイベントの種類。 */
  var GAME_EVENT = {
    GIFT: 'GIFT',
    LIKE: 'LIKE',
    FOLLOW: 'FOLLOW',
    COMMENT: 'COMMENT'
  };

  function toPositiveInt(value, fallback) {
    var n = Math.floor(Number(value));
    return isFinite(n) && n > 0 ? n : fallback;
  }

  /**
   * TikTok 側のユーザー表現はライブラリやバージョンで揺れるので、
   * ゲームが使う 3 つだけに均す。
   *
   *   id          … TikTok の userId。チームの紐付けはこれを鍵にする
   *   uniqueId    … @ 抜きのユーザー名。画面に出すのはこれだけ
   *   displayName … 表示名 (ニックネーム)。画面には出さないが保持する
   *
   * userId が取れない配信・イベントもあるので、その場合は uniqueId で代用します。
   */
  function readUser(raw) {
    var user = raw.user || raw;
    var id = user.id != null && user.id !== '' ? String(user.id) : null;
    var uniqueId = user.uniqueId || user.displayId || user.username || raw.username || null;
    var displayName = user.nickname || user.displayName || null;

    uniqueId = uniqueId ? String(uniqueId) : (id || 'unknown');
    return {
      id: id,
      uniqueId: uniqueId,
      displayName: displayName ? String(displayName) : uniqueId
    };
  }

  function readText(raw) {
    var text = raw.text != null ? raw.text : (raw.comment != null ? raw.comment : raw.message);
    return text == null ? '' : String(text);
  }

  /**
   * @param {object} [options] { config, now }
   */
  function EventRouter(options) {
    options = options || {};
    this.config = options.config || (global.KVB && global.KVB.CONFIG);
    if (!this.config) throw new Error('EventRouter: config が渡されていません');
    this.now = options.now || function () { return Date.now(); };

    this.sessions = {};      // liveId -> session
    this._listeners = [];    // 監視用 (デバッグ・ログ)
    this.stats = { received: 0, routed: 0, dropped: 0 };
  }

  // ------------------------------------------------------------- sessions

  /** liveId にゲームセッションを結びつける。 */
  EventRouter.prototype.attach = function (liveId, session) {
    this.sessions[String(liveId)] = session;
    return this;
  };

  EventRouter.prototype.detach = function (liveId) {
    delete this.sessions[String(liveId)];
    return this;
  };

  EventRouter.prototype.getSession = function (liveId) {
    return this.sessions[String(liveId)] || null;
  };

  /** 変換後のゲームイベントを覗きたいとき用 (画面には影響しません)。 */
  EventRouter.prototype.onGameEvent = function (handler) {
    this._listeners.push(handler);
    return this;
  };

  // ------------------------------------------------------------ gift 変換

  /**
   * giftId -> ゲーム内ポイント。
   *
   * 優先順位:  giftId 指定  ->  ギフト名指定  ->  ダイヤ数 x 係数  ->  既定値
   * 「1 ギフト = 何枚」を固定しないための変換テーブルです。板の枚数への換算は
   * ゲーム側 (game-session.js) が行うため、ここではポイントまでで止めます。
   */
  EventRouter.prototype.giftToPoints = function (raw) {
    var gifts = this.config.gifts;
    var repeat = toPositiveInt(raw.repeatCount != null ? raw.repeatCount : raw.count, 1);

    var id = raw.giftId != null ? String(raw.giftId) : null;
    var name = String(raw.giftName || raw.name || '').trim().toLowerCase();

    var unit;
    if (id && gifts.byId && gifts.byId[id] != null) {
      unit = Number(gifts.byId[id]);
    } else if (name && gifts.byName && gifts.byName[name] != null) {
      unit = Number(gifts.byName[name]);
    } else {
      var diamonds = Number(raw.diamondCount != null ? raw.diamondCount : raw.diamonds);
      unit = isFinite(diamonds) && diamonds > 0
        ? diamonds * Number(gifts.diamondsToPoints)
        : Number(gifts.defaultPoints);
    }

    if (!isFinite(unit) || unit <= 0) return 0;
    return unit * repeat;
  };

  /**
   * このギフトが「攻撃ギフト」かどうか。
   *
   * giftId で持つ判断なので、TikTok を知っているこの層で決めます。
   * 下流には 'attack' / 'add' という結果だけを渡し、giftId は流しません。
   */
  EventRouter.prototype.giftEffect = function (raw) {
    var gifts = this.config.gifts;
    var ids = gifts.attackGiftIds || [];
    var names = gifts.attackGiftNames || [];

    var id = raw.giftId != null ? Number(raw.giftId) : null;
    if (id != null && ids.indexOf(id) !== -1) return 'attack';

    var name = String(raw.giftName || raw.name || '').trim().toLowerCase();
    if (name && names.indexOf(name) !== -1) return 'attack';

    return 'add';
  };

  // ------------------------------------------------------------ dispatch

  /**
   * TikTok の生イベントを 1 件受け取り、ゲームイベントへ翻訳して
   * 対象セッションへ渡す。
   *
   * @param {string} liveId
   * @param {object} raw  { type:'gift'|'like'|'follow'|'chat', user, ... }
   * @returns {object|null} 流したゲームイベント (無視した場合は null)
   */
  EventRouter.prototype.dispatch = function (liveId, raw) {
    this.stats.received += 1;
    if (!raw) { this.stats.dropped += 1; return null; }

    var event = this.translate(raw);
    if (!event) { this.stats.dropped += 1; return null; }

    event.liveId = String(liveId);

    var session = this.getSession(liveId);
    if (session) {
      this.stats.routed += 1;
      session.handle(event);
    } else {
      this.stats.dropped += 1;
    }

    this._listeners.slice().forEach(function (handler) { handler(event); });
    return event;
  };

  /**
   * 翻訳だけを行う (セッションへは渡さない)。テストから直接叩けます。
   * ゲームで使わない種類 (share / member / viewer など) は null を返します。
   */
  EventRouter.prototype.translate = function (raw) {
    var type = String(raw.type || raw.event || '').toLowerCase();
    var at = this.now();

    switch (type) {
      case 'gift': {
        var points = this.giftToPoints(raw);
        if (points <= 0) return null;
        return {
          type: GAME_EVENT.GIFT,
          user: readUser(raw),
          points: points,
          effect: this.giftEffect(raw),
          at: at
        };
      }
      case 'like': {
        var count = toPositiveInt(raw.count != null ? raw.count : raw.likeCount, 1);
        return { type: GAME_EVENT.LIKE, user: readUser(raw), count: count, at: at };
      }
      case 'follow':
        return { type: GAME_EVENT.FOLLOW, user: readUser(raw), at: at };

      case 'chat':
      case 'comment': {
        var text = readText(raw);
        if (!text) return null;
        return { type: GAME_EVENT.COMMENT, user: readUser(raw), text: text, at: at };
      }
      default:
        return null;
    }
  };

  global.KVB = global.KVB || {};
  global.KVB.EventRouter = EventRouter;
  global.KVB.GAME_EVENT = GAME_EVENT;

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { EventRouter: EventRouter, GAME_EVENT: GAME_EVENT };
  }
})(typeof window !== 'undefined' ? window : this);
