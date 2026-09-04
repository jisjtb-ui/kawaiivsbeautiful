/**
 * game-session.js - ゲームのルール層。
 *
 *   Game Event  ->  GameSession (ここ)  ->  GameEngine  ->  Renderer
 *
 * ここが持つのは「TikTok を知らないゲームのルール」だけです:
 *
 *   - コメントの A / B によるチーム所属 (ラウンド中は変更不可)
 *   - 未所属ユーザーが GIFT / LIKE をしたときのランダム所属
 *   - LIKE の累積と 100 LIKE 到達
 *   - FOLLOW による FEVER の開始 / 延長 (A/B 共通)
 *   - ポイント -> 板の枚数 への換算 (FEVER 倍率込み)
 *
 * 1 セッション = 1 ゲーム。将来 LIVE を増やすときは、
 * LIVE ごとに GameEngine + GameSession を 1 組ずつ作って
 * EventRouter に登録すれば、そのまま複数ゲームが並走します。
 */
(function (global) {
  'use strict';

  function Emitter() { this._handlers = {}; }

  Emitter.prototype.on = function (event, handler) {
    (this._handlers[event] || (this._handlers[event] = [])).push(handler);
    return this;
  };

  Emitter.prototype.off = function (event, handler) {
    var list = this._handlers[event];
    if (!list) return this;
    var index = list.indexOf(handler);
    if (index !== -1) list.splice(index, 1);
    return this;
  };

  Emitter.prototype.emit = function (event, payload) {
    var list = this._handlers[event];
    if (list) list.slice().forEach(function (handler) { handler(payload); });
    var any = this._handlers['*'];
    if (any) any.slice().forEach(function (handler) { handler(event, payload); });
    return this;
  };

  function normalizeComment(text) {
    return String(text == null ? '' : text).trim().toLowerCase();
  }

  /**
   * @param {object} engine   GameEngine (game.js)
   * @param {object} [options] { config, liveId, now, random }
   */
  function GameSession(engine, options) {
    Emitter.call(this);
    options = options || {};

    this.engine = engine;
    this.config = options.config || (global.KVB && global.KVB.CONFIG);
    if (!this.config) throw new Error('GameSession: config が渡されていません');

    this.liveId = options.liveId || 'live-1';
    this.now = options.now || function () { return Date.now(); };
    this.random = options.random || Math.random;

    this.teamA = this.config.teams.a;
    this.teamB = this.config.teams.b;

    this.members = {};       // user -> team (ラウンド中は固定)
    this.likeBuckets = {};   // 貯まっている LIKE の端数
    this.fever = { active: false, endsAt: 0 };

    this.stats = { gifts: 0, attacks: 0, likes: 0, milestones: 0, follows: 0, joins: 0 };

    this._bindEngine();
  }

  GameSession.prototype = Object.create(Emitter.prototype);
  GameSession.prototype.constructor = GameSession;

  GameSession.prototype._bindEngine = function () {
    var self = this;
    if (!this.engine || !this.engine.on) return;
    this.engine.on('round:start', function () {
      if (self.config.resetTeamsEachRound) self.resetRound();
    });
  };

  /** ラウンドが変わったら所属・LIKE の貯金・FEVER を白紙に戻す。 */
  GameSession.prototype.resetRound = function () {
    this.members = {};
    this.likeBuckets = {};
    this._endFever();
    return this;
  };

  // ----------------------------------------------------------- チーム所属

  GameSession.prototype.teamOf = function (user) {
    return this.members[user] || null;
  };

  /** 未所属ならランダムに決めて所属させる。所属済みならそのまま返す。 */
  GameSession.prototype.resolveTeam = function (user) {
    var existing = this.members[user];
    if (existing) return existing;
    return this.joinTeam(user, this.random() < 0.5 ? this.teamA : this.teamB, 'random');
  };

  /**
   * ユーザーをチームに所属させる。すでに所属していれば何もしません
   * (ラウンド中のチーム変更は不可)。
   */
  GameSession.prototype.joinTeam = function (user, team, reason) {
    if (this.members[user]) return this.members[user];
    this.members[user] = team;
    this.stats.joins += 1;
    this.emit('team:join', { user: user, team: team, reason: reason || 'comment' });
    return team;
  };

  // ------------------------------------------------------------- FEVER

  GameSession.prototype.isFeverActive = function () {
    return this.fever.active;
  };

  /** 板の加算に掛かる倍率。FEVER 中でなければ 1。 */
  GameSession.prototype.multiplier = function () {
    return this.fever.active ? Number(this.config.fever.multiplier) : 1;
  };

  /** 画面表示用のスナップショット。 */
  GameSession.prototype.getFever = function (now) {
    now = typeof now === 'number' ? now : this.now();
    return {
      active: this.fever.active,
      multiplier: Number(this.config.fever.multiplier),
      remainingMs: this.fever.active ? Math.max(0, this.fever.endsAt - now) : 0
    };
  };

  GameSession.prototype._startFever = function (user) {
    var cfg = this.config.fever;
    this.fever.active = true;
    this.fever.endsAt = this.now() + cfg.durationMs;
    this.emit('fever:start', { user: user, durationMs: cfg.durationMs, multiplier: cfg.multiplier });
    this._notice({ kind: 'fever', user: user, effect: 'FEVER START' });
  };

  GameSession.prototype._extendFever = function (user) {
    var cfg = this.config.fever;
    var now = this.now();
    var endsAt = this.fever.endsAt + cfg.extendMs;

    // maxDurationMs が 0 のときは上限なし (何度でも延長できる)。
    if (cfg.maxDurationMs > 0) endsAt = Math.min(endsAt, now + cfg.maxDurationMs);
    this.fever.endsAt = endsAt;

    var seconds = Math.round(cfg.extendMs / 1000);
    this.emit('fever:extend', { user: user, extendMs: cfg.extendMs, remainingMs: endsAt - now });
    this._notice({ kind: 'fever', user: user, effect: 'FEVER +' + seconds + 's' });
  };

  GameSession.prototype._endFever = function () {
    if (!this.fever.active) return;
    this.fever.active = false;
    this.fever.endsAt = 0;
    this.emit('fever:end', null);
  };

  /** FEVER の期限切れを見るため、毎フレーム呼んでください。 */
  GameSession.prototype.update = function (now) {
    now = typeof now === 'number' ? now : this.now();
    if (this.fever.active && now >= this.fever.endsAt) this._endFever();
    return this;
  };

  // -------------------------------------------------------------- 通知

  GameSession.prototype._notice = function (notice) {
    notice.priority = (this.config.notice.priority || {})[notice.kind] || 0;
    notice.at = this.now();
    this.emit('notice', notice);
  };

  // ------------------------------------------------------ ゲームイベント

  /**
   * EventRouter から渡されたゲームイベントを 1 件処理する。
   * ラウンド進行中でないとき (ラウンド間・試合終了後) は何もしません。
   *
   * @param {object} event { type:'GIFT'|'LIKE'|'FOLLOW'|'COMMENT', user, ... }
   */
  GameSession.prototype.handle = function (event) {
    if (!event || !event.user) return false;
    if (this.engine && !this.engine.isLive()) return false;

    switch (event.type) {
      case 'COMMENT': return this._handleComment(event);
      case 'GIFT':    return this._handleGift(event);
      case 'LIKE':    return this._handleLike(event);
      case 'FOLLOW':  return this._handleFollow(event);
      default:        return false;
    }
  };

  GameSession.prototype._handleComment = function (event) {
    var text = normalizeComment(event.text);
    var cfg = this.config.comment;

    var team = null;
    if (cfg.a.indexOf(text) !== -1) team = this.teamA;
    else if (cfg.b.indexOf(text) !== -1) team = this.teamB;
    if (!team) return false;               // 普通のコメントは無視

    // すでに所属していれば変更されない (joinTeam が握りつぶす)
    this.joinTeam(event.user, team, 'comment');
    return true;
  };

  GameSession.prototype._handleGift = function (event) {
    var team = this.resolveTeam(event.user);
    if (event.effect === 'attack') return this._handleAttack(event, team);

    var boards = Math.floor(event.points * this.config.gifts.boardsPerPoint * this.multiplier());
    if (boards <= 0) return false;

    this.stats.gifts += 1;
    var applied = this._addBoards(team, boards, 'gift', event.user);
    // 上限に達していて 1 枚も入らなかったときは「+0」を出さずに黙る
    if (applied <= 0) return false;

    this._notice({ kind: 'gift', user: event.user, team: team, effect: '+' + applied });
    return true;
  };

  /**
   * 攻撃ギフト。自分のチームを伸ばすのではなく、相手の板を剥がします。
   *
   * カウントダウン中の相手を勝利ラインより下へ落とせば維持を妨害できるので、
   * 少ない枚数でも効きます。FEVER の倍率は既定では掛かりません
   * (FEVER は「板の加算」を強化するもの、という切り分け)。
   */
  GameSession.prototype._handleAttack = function (event, team) {
    var cfg = this.config;
    var multiplier = cfg.fever.multiplyAttack ? this.multiplier() : 1;
    var boards = Math.floor(event.points * cfg.gifts.attackBoardsPerPoint * multiplier);
    if (boards <= 0) return false;

    var victim = team === this.teamA ? this.teamB : this.teamA;
    var before = this.engine.boards[victim];
    this.engine.attack(team, boards, {
      source: 'tiktok',
      liveId: this.liveId,
      kind: 'attack',
      user: event.user
    });
    var applied = before - this.engine.boards[victim];
    if (applied <= 0) return false;      // 相手が 0 枚なら何も起きない

    this.stats.attacks += 1;
    this._notice({ kind: 'attack', user: event.user, team: victim, effect: '-' + applied });
    return true;
  };

  GameSession.prototype._handleLike = function (event) {
    var cfg = this.config.likes;
    var team = this.resolveTeam(event.user);
    var key = cfg.scope === 'team' ? ('team:' + team) : ('user:' + event.user);

    this.stats.likes += event.count;
    var total = (this.likeBuckets[key] || 0) + event.count;

    // 100 LIKE ちょうどで区切り、端数はそのまま次のカウントへ繰り越す。
    var milestones = Math.floor(total / cfg.perBoard);
    this.likeBuckets[key] = total % cfg.perBoard;
    if (milestones <= 0) return false;

    var boards = Math.floor(milestones * cfg.boardsPerMilestone * this.multiplier());
    if (boards <= 0) return false;

    this.stats.milestones += milestones;
    var applied = this._addBoards(team, boards, 'like', event.user);
    if (applied <= 0) return false;

    this._notice({
      kind: 'like',
      user: event.user,
      team: team,
      detail: (milestones * cfg.perBoard) + ' LIKE',
      effect: '+' + applied
    });
    return true;
  };

  GameSession.prototype._handleFollow = function (event) {
    this.stats.follows += 1;
    // FOLLOW はチームを有利にせず、A/B 共通の FEVER を動かす。
    if (this.fever.active) this._extendFever(event.user);
    else this._startFever(event.user);
    return true;
  };

  /**
   * 板を積み、「実際に積まれた枚数」を返す。
   *
   * タワーには上限 (既定では勝利ラインと同じ) があるので、要求した枚数が
   * そのまま入るとは限りません。通知には必ずこの戻り値を使ってください。
   * 990 枚のときに 100 ポイントのギフトが来たら、入るのは 10 枚だけです。
   */
  GameSession.prototype._addBoards = function (team, boards, kind, user) {
    if (!this.engine) return 0;
    var before = this.engine.boards[team];
    this.engine.addBoards(team, boards, {
      source: 'tiktok',
      liveId: this.liveId,
      kind: kind,
      user: user
    });
    return this.engine.boards[team] - before;
  };

  global.KVB = global.KVB || {};
  global.KVB.GameSession = GameSession;

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { GameSession: GameSession };
  }
})(typeof window !== 'undefined' ? window : this);
