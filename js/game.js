/**
 * game.js - KAWAII vs BEAUTIFUL / core game logic
 *
 * This file is intentionally free of DOM code, of rendering code and of
 * any TikTok specific code. It only knows about:
 *
 *   - two teams
 *   - "boards" (板) that get added / removed
 *   - rounds, the 10 second hold countdown and the match score
 *
 * Everything else (screen, buttons, TikTok LIVE gifts, ...) talks to this
 * engine through its public methods and listens to its events.
 *
 * Public API (see README.md):
 *   startMatch()
 *   startRound()
 *   addBoards(team, amount, meta)
 *   removeBoards(team, amount, meta)
 *   attack(team, amount, meta)     // convenience: team removes from opponent
 *   winRound(team)
 *   winMatch(team)
 *   resetRound()
 *   resetMatch()
 *   update(now)                    // called every frame by the render loop
 *   on(event, handler) / off(event, handler)
 */
(function (global) {
  'use strict';

  /** Team identifiers. Use these constants instead of raw strings. */
  var TEAM = {
    KAWAII: 'kawaii',
    BEAUTIFUL: 'beautiful'
  };

  /** Round / match phases. */
  var PHASE = {
    IDLE: 'idle',             // nothing running yet
    PLAYING: 'playing',       // boards are being stacked
    COUNTDOWN: 'countdown',   // someone is holding >= target
    ROUND_END: 'round_end',   // round winner shown, next round pending
    MATCH_END: 'match_end'    // match winner shown
  };

  var DEFAULTS = {
    targetBoards: 1000,       // boards needed to trigger the countdown
    holdSeconds: 10,          // seconds the target has to be held
    roundsToWinMatch: 10,     // rounds needed to win the whole match
    nextRoundDelayMs: 4000,   // pause after a round before the next one starts
    autoStartNextRound: true, // rounds chain automatically
    // Hard cap on a tower. null means "same as targetBoards", so a tower can
    // never bank a buffer above the win line: the moment the opponent strips a
    // board the countdown drops below the target and cancels. Set a number to
    // allow overshoot on purpose.
    maxBoards: null
  };

  function otherTeam(team) {
    return team === TEAM.KAWAII ? TEAM.BEAUTIFUL : TEAM.KAWAII;
  }

  function clamp(value, min, max) {
    return value < min ? min : (value > max ? max : value);
  }

  /**
   * Minimal event emitter. Kept local so the engine has no dependencies.
   */
  function Emitter() {
    this._handlers = {};
  }

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
    if (list) {
      // copy: a handler may unsubscribe while we iterate
      list.slice().forEach(function (handler) { handler(payload); });
    }
    var any = this._handlers['*'];
    if (any) {
      any.slice().forEach(function (handler) { handler(event, payload); });
    }
    return this;
  };

  /**
   * @param {object} [options] overrides for DEFAULTS. `now` can be injected
   *        (a function returning milliseconds) which makes the engine
   *        testable without a browser clock.
   */
  function GameEngine(options) {
    Emitter.call(this);

    var config = {};
    Object.keys(DEFAULTS).forEach(function (key) { config[key] = DEFAULTS[key]; });
    if (options) {
      Object.keys(options).forEach(function (key) { config[key] = options[key]; });
    }

    if (config.maxBoards == null) config.maxBoards = config.targetBoards;

    this.config = config;
    this.now = (options && options.now) || function () { return Date.now(); };

    this.phase = PHASE.IDLE;
    this.round = 0;
    this.boards = {};
    this.boards[TEAM.KAWAII] = 0;
    this.boards[TEAM.BEAUTIFUL] = 0;
    this.score = {};
    this.score[TEAM.KAWAII] = 0;
    this.score[TEAM.BEAUTIFUL] = 0;

    this.countdown = null;   // { team, endsAt, remainingMs }
    this.roundWinner = null;
    this.matchWinner = null;
    this._nextRoundAt = 0;   // timestamp for the automatic next round
  }

  GameEngine.prototype = Object.create(Emitter.prototype);
  GameEngine.prototype.constructor = GameEngine;

  // ---------------------------------------------------------------- state

  /** Immutable-ish snapshot, handy for renderers. */
  GameEngine.prototype.getState = function () {
    return {
      phase: this.phase,
      round: this.round,
      boards: {
        kawaii: this.boards[TEAM.KAWAII],
        beautiful: this.boards[TEAM.BEAUTIFUL]
      },
      score: {
        kawaii: this.score[TEAM.KAWAII],
        beautiful: this.score[TEAM.BEAUTIFUL]
      },
      countdown: this.countdown
        ? { team: this.countdown.team, remainingMs: this.countdown.remainingMs }
        : null,
      roundWinner: this.roundWinner,
      matchWinner: this.matchWinner,
      config: this.config
    };
  };

  GameEngine.prototype._emitState = function () {
    this.emit('state', this.getState());
  };

  /** True while boards may be added or removed. */
  GameEngine.prototype.isLive = function () {
    return this.phase === PHASE.PLAYING || this.phase === PHASE.COUNTDOWN;
  };

  // ------------------------------------------------------------ lifecycle

  /** Resets the score and starts round 1. */
  GameEngine.prototype.startMatch = function () {
    this.score[TEAM.KAWAII] = 0;
    this.score[TEAM.BEAUTIFUL] = 0;
    this.round = 0;
    this.matchWinner = null;
    this.emit('match:start', this.getState());
    this.startRound();
    return this;
  };

  /** Clears both towers and opens a fresh round. */
  GameEngine.prototype.startRound = function () {
    if (this.matchWinner) return this;

    this.round += 1;
    this.boards[TEAM.KAWAII] = 0;
    this.boards[TEAM.BEAUTIFUL] = 0;
    this.countdown = null;
    this.roundWinner = null;
    this._nextRoundAt = 0;
    this.phase = PHASE.PLAYING;

    this.emit('round:start', { round: this.round });
    this._emitState();
    return this;
  };

  // --------------------------------------------------------------- boards

  /**
   * Adds boards to a team. This is the single entry point for every kind of
   * "gift" - test buttons, TikTok gifts, a replay file, anything.
   *
   * @param {string} team   TEAM.KAWAII or TEAM.BEAUTIFUL
   * @param {number} amount number of boards (rounded down, must be > 0)
   * @param {object} [meta] free-form info about the source of the boards,
   *                        e.g. { source:'tiktok', user:'foo', gift:'Rose' }.
   *                        The engine never reads it, it only passes it on.
   */
  GameEngine.prototype.addBoards = function (team, amount, meta) {
    if (!this._acceptsInput(team, amount)) return this;

    amount = Math.floor(amount);
    var before = this.boards[team];
    this.boards[team] = clamp(before + amount, 0, this.config.maxBoards);
    var applied = this.boards[team] - before;

    this.emit('boards:add', {
      team: team,
      amount: applied,
      total: this.boards[team],
      meta: meta || null
    });

    this._evaluate();
    this._emitState();
    return this;
  };

  /**
   * Removes boards from a team ("板を剥がす"). Never goes below 0.
   * Same signature as addBoards.
   */
  GameEngine.prototype.removeBoards = function (team, amount, meta) {
    if (!this._acceptsInput(team, amount)) return this;

    amount = Math.floor(amount);
    var before = this.boards[team];
    this.boards[team] = clamp(before - amount, 0, this.config.maxBoards);
    var applied = before - this.boards[team];

    if (applied > 0) {
      this.emit('boards:remove', {
        team: team,
        amount: applied,
        total: this.boards[team],
        meta: meta || null
      });
      this.emit('board:break', { team: team, amount: applied });
    }

    this._evaluate();
    this._emitState();
    return this;
  };

  /**
   * `attacker` strips boards off the opposing tower.
   * Convenience wrapper so callers do not have to know who the opponent is.
   */
  GameEngine.prototype.attack = function (attacker, amount, meta) {
    var target = otherTeam(attacker);
    this.emit('attack', { attacker: attacker, target: target, amount: amount });
    return this.removeBoards(target, amount, meta);
  };

  GameEngine.prototype._acceptsInput = function (team, amount) {
    if (!this.isLive()) return false;
    if (team !== TEAM.KAWAII && team !== TEAM.BEAUTIFUL) return false;
    return typeof amount === 'number' && isFinite(amount) && amount > 0;
  };

  // ------------------------------------------------------------ countdown

  /**
   * Called after every board change. Starts the hold countdown when a team
   * reaches the target, and cancels it when that team drops back below.
   */
  GameEngine.prototype._evaluate = function () {
    var target = this.config.targetBoards;

    if (this.countdown) {
      // Only the team that owns the countdown matters here: the countdown is
      // cancelled the moment its own tower falls under the target.
      if (this.boards[this.countdown.team] < target) {
        var cancelled = this.countdown;

        // The opponent may have been sitting on the target the whole time.
        // Knocking the holder down does not stop the round: whoever is still
        // holding the line picks the countdown up. They start a fresh hold of
        // their own rather than inheriting the seconds the other team earned.
        //
        // Who takes over is resolved before the cancel is announced, so a
        // listener can tell "the hold collapsed" from "the hold changed hands"
        // and show the right thing.
        var challenger = otherTeam(cancelled.team);
        var takenBy = this.boards[challenger] >= target ? challenger : null;

        this.countdown = null;
        this.phase = PHASE.PLAYING;
        this.emit('countdown:cancel', {
          team: cancelled.team,
          boards: this.boards[cancelled.team],
          takenBy: takenBy
        });

        if (takenBy) this._startCountdown(takenBy, cancelled.team);
      }
      return;
    }

    if (this.phase !== PHASE.PLAYING) return;

    // Nobody is counting down yet: the first team at or above the target
    // takes the lead. If both crossed within the same update, the bigger
    // tower gets it (and KAWAII wins a perfect tie).
    var candidates = [TEAM.KAWAII, TEAM.BEAUTIFUL].filter(function (team) {
      return this.boards[team] >= target;
    }, this);

    if (!candidates.length) return;

    var leader = candidates.length === 1
      ? candidates[0]
      : (this.boards[TEAM.BEAUTIFUL] > this.boards[TEAM.KAWAII] ? TEAM.BEAUTIFUL : TEAM.KAWAII);

    this._startCountdown(leader);
  };

  /**
   * @param {string} team
   * @param {string} [takenFrom] set when this countdown was handed over
   *        because the previous holder was knocked below the target.
   */
  GameEngine.prototype._startCountdown = function (team, takenFrom) {
    var durationMs = this.config.holdSeconds * 1000;
    this.countdown = {
      team: team,
      endsAt: this.now() + durationMs,
      remainingMs: durationMs
    };
    this.phase = PHASE.COUNTDOWN;
    this.emit('countdown:start', {
      team: team,
      seconds: this.config.holdSeconds,
      boards: this.boards[team],
      takenFrom: takenFrom || null
    });
  };

  /**
   * Drives the clock. Call this once per animation frame (or on a timer).
   * @param {number} [now] milliseconds; defaults to the engine clock.
   */
  GameEngine.prototype.update = function (now) {
    now = typeof now === 'number' ? now : this.now();

    if (this.countdown) {
      var previousSecond = Math.ceil(this.countdown.remainingMs / 1000);
      this.countdown.remainingMs = Math.max(0, this.countdown.endsAt - now);
      var currentSecond = Math.ceil(this.countdown.remainingMs / 1000);

      if (currentSecond !== previousSecond) {
        this.emit('countdown:tick', {
          team: this.countdown.team,
          secondsLeft: currentSecond
        });
      }

      if (this.countdown.remainingMs <= 0) {
        this.winRound(this.countdown.team);
      }
      return this;
    }

    if (this.phase === PHASE.ROUND_END &&
        this.config.autoStartNextRound &&
        this._nextRoundAt &&
        now >= this._nextRoundAt) {
      this.startRound();
    }

    return this;
  };

  // ---------------------------------------------------------- round/match

  /** Awards the round to `team`. Also called directly by the engine clock. */
  GameEngine.prototype.winRound = function (team) {
    if (this.phase === PHASE.ROUND_END || this.phase === PHASE.MATCH_END) return this;

    this.countdown = null;
    this.roundWinner = team;
    this.score[team] += 1;
    this.phase = PHASE.ROUND_END;

    this.emit('round:win', {
      team: team,
      round: this.round,
      score: {
        kawaii: this.score[TEAM.KAWAII],
        beautiful: this.score[TEAM.BEAUTIFUL]
      }
    });

    if (this.score[team] >= this.config.roundsToWinMatch) {
      this.winMatch(team);
    } else {
      this._nextRoundAt = this.now() + this.config.nextRoundDelayMs;
    }

    this._emitState();
    return this;
  };

  /** Ends the match. The engine stops until resetMatch()/startMatch(). */
  GameEngine.prototype.winMatch = function (team) {
    this.matchWinner = team;
    this.phase = PHASE.MATCH_END;
    this.countdown = null;
    this._nextRoundAt = 0;

    this.emit('match:win', {
      team: team,
      score: {
        kawaii: this.score[TEAM.KAWAII],
        beautiful: this.score[TEAM.BEAUTIFUL]
      }
    });
    this._emitState();
    return this;
  };

  /** Replays the current round from 0 boards. Score is untouched. */
  GameEngine.prototype.resetRound = function () {
    if (this.matchWinner) return this;
    this.round -= 1;             // startRound() increments it again
    this.emit('round:reset', { round: this.round + 1 });
    return this.startRound();
  };

  /** Wipes score and towers, then starts over at round 1. */
  GameEngine.prototype.resetMatch = function () {
    this.emit('match:reset', null);
    return this.startMatch();
  };

  // ---------------------------------------------------------------- export

  global.KVB = global.KVB || {};
  global.KVB.TEAM = TEAM;
  global.KVB.PHASE = PHASE;
  global.KVB.GameEngine = GameEngine;
  global.KVB.otherTeam = otherTeam;

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { TEAM: TEAM, PHASE: PHASE, GameEngine: GameEngine, otherTeam: otherTeam };
  }
})(typeof window !== 'undefined' ? window : this);
