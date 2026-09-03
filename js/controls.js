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

  function Controls(engine) {
    this.engine = engine;
    this.panel = document.getElementById('controls');
    this._bindButtons();
    this._bindKeyboard();
    this._applyObsFlag();
  }

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
      default: break;
    }
  };

  Controls.prototype._bindButtons = function () {
    var self = this;
    if (!this.panel) return;

    this.panel.addEventListener('click', function (event) {
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
