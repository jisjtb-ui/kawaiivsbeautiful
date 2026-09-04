/**
 * tiktok-adapter.js - TikTok の受信口。
 *
 *   TikTok Connector  ->  TikTokAdapter (ここ)  ->  EventRouter  ->  GameSession
 *
 * このファイルは受け取ったイベントを EventRouter へ渡すだけで、
 * ゲームのルールを一切持ちません。ギフトの価値づけもチーム分けも
 * ここではなく config.js / event-router.js / game-session.js の仕事です。
 *
 * connect() を呼ばない限りネットワークアクセスは発生しません。
 * 呼ばなければ従来どおり完全オフラインで動きます。
 */
(function (global) {
  'use strict';

  /**
   * @param {object} router   EventRouter
   * @param {object} [options] { liveId, url }
   */
  function TikTokAdapter(router, options) {
    this.router = router;
    this.options = options || {};
    this.liveId = this.options.liveId || 'live-1';
    this.socket = null;
    this.connected = false;
  }

  /**
   * TikTok のイベントを 1 件流し込む唯一の入口。
   * 手で叩いて動作確認もできます:
   *
   *   KVB.tiktok.handleEvent({ type:'gift', user:{ uniqueId:'taro' }, giftName:'Rose' });
   *   KVB.tiktok.handleEvent({ type:'like', user:{ uniqueId:'taro' }, count:100 });
   *   KVB.tiktok.handleEvent({ type:'follow', user:{ uniqueId:'taro' } });
   *   KVB.tiktok.handleEvent({ type:'chat', user:{ uniqueId:'taro' }, text:'A' });
   */
  TikTokAdapter.prototype.handleEvent = function (raw) {
    return this.router.dispatch(this.liveId, raw);
  };

  /**
   * 旧 API との互換。{ name, count, user } 形式のギフトも受け付けます。
   */
  TikTokAdapter.prototype.handleGift = function (gift) {
    return this.handleEvent({
      type: 'gift',
      user: gift.user,
      giftId: gift.giftId,
      giftName: gift.giftName || gift.name,
      repeatCount: gift.repeatCount || gift.count,
      diamondCount: gift.diamondCount || gift.diamonds
    });
  };

  /**
   * WebSocket でイベントを受け取る。呼び出しは任意です。
   *
   * ブラウザから TikTok へ直接つなぐことはできないため、
   * 別プロセス (tikhub の TikTok LIVE Event Server など) が受信した
   * イベントを JSON 1 行ずつ中継してくる前提です。期待する形は
   * handleEvent() のコメントと同じで、type は gift / like / follow / chat。
   *
   * @param {string} [url] 既定 ws://localhost:21213
   */
  TikTokAdapter.prototype.connect = function (url) {
    var self = this;
    var target = url || this.options.url || 'ws://localhost:21213';

    return new Promise(function (resolve) {
      var socket;
      try {
        socket = new global.WebSocket(target);
      } catch (err) {
        console.warn('[KVB] WebSocket を開けませんでした:', err.message);
        resolve(false);
        return;
      }
      self.socket = socket;

      socket.onopen = function () {
        self.connected = true;
        console.info('[KVB] TikTok イベントの受信を開始しました:', target);
        resolve(true);
      };

      socket.onmessage = function (event) {
        var payload;
        try {
          payload = JSON.parse(event.data);
        } catch (err) {
          return;                       // 壊れた行は捨てる
        }
        // 1 件でも配列でも受け付ける
        if (Array.isArray(payload)) payload.forEach(function (e) { self.handleEvent(e); });
        else self.handleEvent(payload);
      };

      socket.onerror = function () {
        if (!self.connected) resolve(false);
      };

      socket.onclose = function () {
        self.connected = false;
      };
    });
  };

  TikTokAdapter.prototype.disconnect = function () {
    if (this.socket) this.socket.close();
    this.socket = null;
    this.connected = false;
  };

  global.KVB = global.KVB || {};
  global.KVB.TikTokAdapter = TikTokAdapter;
})(window);
