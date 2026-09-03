/**
 * tiktok-adapter.js - THE ONLY FILE THAT SHOULD EVER KNOW ABOUT TIKTOK.
 *
 * Right now it is a stub: no network code, no dependency, nothing runs
 * unless you call KVB.TikTokAdapter.connect() yourself. It exists so the
 * shape of the real integration is already decided:
 *
 *     TikTok gift event  ->  toBoards()  ->  engine.addBoards() / attack()
 *
 * See README.md ("TikTok LIVE を接続する") for the wiring instructions.
 */
(function (global) {
  'use strict';

  var TEAM = global.KVB.TEAM;

  /**
   * Gift rules. `team` decides which tower the gift feeds; `boards` is how
   * many boards one gift is worth; `attack` means it strips the opponent
   * instead of stacking your own tower.
   *
   * Replace the gift names with the ones you actually use on stream.
   */
  var GIFT_RULES = {
    // name (lowercase)   team                boards  attack
    'rose':             { team: TEAM.KAWAII,    boards: 1 },
    'finger heart':     { team: TEAM.KAWAII,    boards: 10 },
    'sunglasses':       { team: TEAM.KAWAII,    boards: 50 },
    'gg':               { team: TEAM.BEAUTIFUL, boards: 1 },
    'perfume':          { team: TEAM.BEAUTIFUL, boards: 10 },
    'galaxy':           { team: TEAM.BEAUTIFUL, boards: 50 },
    'lightning bolt':   { team: TEAM.KAWAII,    boards: 10, attack: true },
    'thunder':          { team: TEAM.BEAUTIFUL, boards: 10, attack: true }
  };

  function TikTokAdapter(engine, options) {
    this.engine = engine;
    this.options = options || {};
    this.rules = this.options.rules || GIFT_RULES;
    this.connected = false;
  }

  /**
   * The single hand-off point between TikTok and the game.
   * Feed it a normalised gift and it does the right thing.
   *
   * @param {object} gift { name, count, user }
   */
  TikTokAdapter.prototype.handleGift = function (gift) {
    var rule = this.rules[String(gift.name || '').toLowerCase()];
    if (!rule) return false;                       // unmapped gift: ignore

    var repeat = Math.max(1, Number(gift.count) || 1);
    var amount = rule.boards * repeat;
    var meta = { source: 'tiktok', user: gift.user || null, gift: gift.name, count: repeat };

    if (rule.attack) {
      this.engine.attack(rule.team, amount, meta);
    } else {
      this.engine.addBoards(rule.team, amount, meta);
    }
    return true;
  };

  /**
   * Not implemented on purpose - the MVP runs offline.
   *
   * To go live, open a connection here (TikTok Live Connector via a small
   * local server, a webhook, a WebSocket, ...) and call this.handleGift()
   * for every incoming gift event. Nothing else in the project changes.
   */
  TikTokAdapter.prototype.connect = function () {
    console.warn('[KVB] TikTokAdapter.connect() is a stub. ' +
                 'See README.md for how to wire a real gift feed.');
    return Promise.resolve(false);
  };

  TikTokAdapter.prototype.disconnect = function () {
    this.connected = false;
  };

  global.KVB.TikTokAdapter = TikTokAdapter;
  global.KVB.GIFT_RULES = GIFT_RULES;
})(window);
