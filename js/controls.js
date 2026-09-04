/**
 * controls.js - the local test input layer.
 *
 * This file stands in for the TikTok LIVE gift feed. Every button here does
 * nothing but call a public engine method, which is exactly what the real
 * TikTok adapter will do later (see js/tiktok-adapter.js).
 *
 * If you delete this file the game still works - it just has no input.
 */
(function (global) {
  'use strict';

  var TEAM = global.KVB.TEAM;

  /** key -> [action, team, amount] */
  var KEY_MAP = {
    q: ['add', TEAM.KAWAII, 1],
    w: ['add', TEAM.KAWAII, 10],
    e: ['add', TEAM.KAWAII, 50],
    a: ['attack', TEAM.KAWAII, 10],
    i: ['add', TEAM.BEAUTIFUL, 1],
    o: ['add', TEAM.BEAUTIFUL, 10],
    p: ['add', TEAM.BEAUTIFUL, 50],
    l: ['attack', TEAM.BEAUTIFUL, 10],
    r: ['reset-round'],
    m: ['reset-match']
  };

  /** TikTok イベント再現用のキー。押し手はランダムに選ばれます。 */
  var TIKTOK_KEY_MAP = {
    '1': ['comment', { text: 'A' }],
    '2': ['comment', { text: 'B' }],
    g:   ['gift',    { giftId: 5658, diamonds: 20 }],    // Perfume
    x:   ['gift',    { giftId: 59314, diamonds: 10 }],   // Banana Peel = 攻撃
    k:   ['like',    { count: 20 }],
    f:   ['follow',  {}]
  };

  /** TikTok イベントを再現するときの押し手。実配信での「@名前」に相当します。 */
  var TEST_USERS = ['taro', 'hanako', 'ken', 'newbie', 'lurker'];

  /**
   * @param {object} engine   GameEngine (板の直接操作用)
   * @param {object} [options] { router, liveId } TikTok イベントの再現用
   */
  function Controls(engine, options) {
    options = options || {};
    this.engine = engine;
    this.router = options.router || null;
    this.liveId = options.liveId || 'live-1';
    this.panel = document.getElementById('controls');
    this._bindButtons();
    this._bindKeyboard();
    this._applyObsFlag();
  }

  /**
   * TikTok から来たことにしてイベントを 1 件流す。
   * ゲーム側から見ると、実配信のイベントとまったく区別がつきません。
   */
  Controls.prototype.simulate = function (type, opts) {
    if (!this.router) return null;
    opts = opts || {};
    var user = { uniqueId: opts.user || TEST_USERS[Math.floor(Math.random() * TEST_USERS.length)] };

    switch (type) {
      case 'gift':
        return this.router.dispatch(this.liveId, {
          type: 'gift',
          user: user,
          // 実配信の GIFT イベントと同じ形。ダイヤ数は本体に乗ってくる。
          giftId: opts.giftId != null ? Number(opts.giftId) : 5655,     // 既定は Rose
          giftName: opts.gift || null,
          diamondCount: opts.diamonds != null ? Number(opts.diamonds) : 1,
          repeatCount: opts.repeat || 1
        });
      case 'like':
        return this.router.dispatch(this.liveId, {
          type: 'like', user: user, count: Number(opts.count) || 20
        });
      case 'follow':
        return this.router.dispatch(this.liveId, { type: 'follow', user: user });
      case 'comment':
        return this.router.dispatch(this.liveId, {
          type: 'chat', user: user, text: opts.text || 'A'
        });
      default:
        return null;
    }
  };

  /**
   * 実配信の混み具合を再現する。通知が点滅せず 1 件ずつ読めるかの確認用。
   */
  Controls.prototype.burst = function (count) {
    var self = this;
    var total = count || 15;
    for (var i = 0; i < total; i++) {
      (function (index) {
        setTimeout(function () {
          var roll = Math.random();
          if (roll < 0.40) self.simulate('like', { count: 100 });
          else if (roll < 0.70) self.simulate('gift', { giftId: 5655, diamonds: 1 });
          else if (roll < 0.85) self.simulate('gift', { giftId: 5658, diamonds: 20 });
          else if (roll < 0.95) self.simulate('gift', { giftId: 59314, diamonds: 10 });
          else self.simulate('follow', {});
        }, index * 120);
      })(i);
    }
  };

  /**
   * Single dispatch point for every test input.
   * `meta` marks where the boards came from, so the overlay/log can tell a
   * test click apart from a real gift.
   */
  Controls.prototype.dispatch = function (action, team, amount) {
    var meta = { source: 'test-panel' };

    switch (action) {
      case 'add':          this.engine.addBoards(team, amount, meta); break;
      case 'remove':       this.engine.removeBoards(team, amount, meta); break;
      case 'attack':       this.engine.attack(team, amount, meta); break;
      case 'reset-round':  this.engine.resetRound(); break;
      case 'reset-match':  this.engine.resetMatch(); break;
      case 'burst':        this.burst(); break;
      default: break;
    }
  };

  Controls.prototype._bindButtons = function () {
    var self = this;
    if (!this.panel) return;

    this.panel.addEventListener('click', function (event) {
      var tiktokButton = event.target.closest('[data-tiktok]');
      if (tiktokButton) {
        self.simulate(tiktokButton.dataset.tiktok, {
          user: tiktokButton.dataset.user,
          giftId: tiktokButton.dataset.giftId,
          diamonds: tiktokButton.dataset.diamonds,
          count: tiktokButton.dataset.count,
          text: tiktokButton.dataset.text
        });
        return;
      }

      var button = event.target.closest('[data-action]');
      if (!button) return;
      self.dispatch(
        button.dataset.action,
        button.dataset.team,
        Number(button.dataset.amount)
      );
    });

    var toggle = document.getElementById('toggle-controls');
    if (toggle) toggle.addEventListener('click', function () { self.togglePanel(); });
  };

  Controls.prototype._bindKeyboard = function () {
    var self = this;
    global.addEventListener('keydown', function (event) {
      if (event.metaKey || event.ctrlKey || event.altKey) return;

      var key = event.key.toLowerCase();
      if (key === 'h') { self.togglePanel(); return; }
      if (key === 'b') { event.preventDefault(); self.burst(); return; }

      var tiktokKey = TIKTOK_KEY_MAP[key];
      if (tiktokKey) {
        event.preventDefault();
        self.simulate(tiktokKey[0], tiktokKey[1]);
        return;
      }

      var mapped = KEY_MAP[key];
      if (!mapped) return;
      event.preventDefault();
      self.dispatch(mapped[0], mapped[1], mapped[2]);
    });
  };

  Controls.prototype.togglePanel = function () {
    document.body.classList.toggle('obs-mode');
    if (global.KVB.renderer) global.KVB.renderer.fit();
  };

  /** index.html?obs=1 boots straight into the clean broadcast layout. */
  Controls.prototype._applyObsFlag = function () {
    var params = new URLSearchParams(global.location.search);
    if (params.get('obs') === '1' || params.has('obs')) {
      document.body.classList.add('obs-mode');
    }
  };

  global.KVB.Controls = Controls;
})(window);
