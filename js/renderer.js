/**
 * renderer.js - draws the game state on the 1920x1080 stage.
 *
 * The renderer only *reads* from the engine (through events and getState()).
 * It never decides anything about the rules, so the look of the show can be
 * rewritten without touching game.js.
 */
(function (global) {
  'use strict';

  var TEAM = global.KVB.TEAM;
  var PHASE = global.KVB.PHASE;

  var STAGE_WIDTH = 1920;
  var STAGE_HEIGHT = 1080;
  var RING_LENGTH = 578;          // 2 * PI * r(92), matches the CSS dasharray
  var BANNER_MAX_FONT = 150;      // headline sizing, in stage pixels
  var BANNER_MIN_FONT = 60;
  var BANNER_MAX_WIDTH = 1700;
  var BANNER_MAX_HEIGHT = 420;

  var TEAM_LABEL = {};
  TEAM_LABEL[TEAM.KAWAII] = 'KAWAII';
  TEAM_LABEL[TEAM.BEAUTIFUL] = 'BEAUTIFUL';

  var CONFETTI_COLORS = {};
  CONFETTI_COLORS[TEAM.KAWAII] = ['#ff4f9d', '#ff9ecb', '#ffffff', '#ffd6e9'];
  CONFETTI_COLORS[TEAM.BEAUTIFUL] = ['#26d7ff', '#9be9ff', '#ffffff', '#c9f4ff'];

  function $(id) { return document.getElementById(id); }

  function Renderer(engine, options) {
    this.engine = engine;
    this.el = {
      stage: $('stage'),
      wrap: $('stage-wrap'),
      scoreKawaii: $('score-kawaii'),
      scoreBeautiful: $('score-beautiful'),
      roundNumber: $('round-number'),
      roundsToWin: $('rounds-to-win'),
      countKawaii: $('count-kawaii'),
      countBeautiful: $('count-beautiful'),
      fillKawaii: $('fill-kawaii'),
      fillBeautiful: $('fill-beautiful'),
      teamKawaii: $('team-kawaii'),
      teamBeautiful: $('team-beautiful'),
      floatersKawaii: $('floaters-kawaii'),
      floatersBeautiful: $('floaters-beautiful'),
      countdown: $('countdown'),
      countdownLabel: $('countdown-label'),
      countdownNumber: $('countdown-number'),
      countdownRing: $('countdown-ring'),
      banner: $('banner'),
      bannerMain: $('banner-main'),
      bannerSub: $('banner-sub'),
      flash: $('flash'),
      confetti: $('confetti'),
      notice: $('notice'),
      noticeUser: $('notice-user'),
      noticeDetail: $('notice-detail'),
      noticeEffect: $('notice-effect'),
      fever: $('fever'),
      feverMult: $('fever-mult'),
      feverTime: $('fever-time')
    };

    this.noticeConfig = (options && options.notice) ||
      ((global.KVB.CONFIG && global.KVB.CONFIG.notice) || { durationMs: 1600, minVisibleMs: 700 });

    this._bannerTimer = null;
    this._bannerPriority = -1;
    this._lastSecond = null;

    this._noticeTimer = null;
    this._noticePending = null;
    this._noticeShownAt = 0;
    this._noticePriority = -1;
    this._lastFeverSecond = null;
    this._lastBreak = null;

    this._bindStageScaling();
    this._bindEngine();
    this.renderState(engine.getState());
  }

  // ------------------------------------------------------- stage scaling

  /** Keeps the 1920x1080 stage fitted inside whatever box the page gives it. */
  Renderer.prototype._bindStageScaling = function () {
    var self = this;
    function fit() {
      var box = self.el.wrap.getBoundingClientRect();
      var scale = Math.min(box.width / STAGE_WIDTH, box.height / STAGE_HEIGHT);
      var left = (box.width - STAGE_WIDTH * scale) / 2;
      var top = (box.height - STAGE_HEIGHT * scale) / 2;
      self.el.stage.style.transform =
        'translate(' + left + 'px,' + top + 'px) scale(' + scale + ')';
    }
    this.fit = fit;
    fit();
    global.addEventListener('resize', fit);
    global.addEventListener('orientationchange', fit);
    if (global.ResizeObserver) new ResizeObserver(fit).observe(this.el.wrap);
  };

  // ------------------------------------------------------- engine wiring

  Renderer.prototype._bindEngine = function () {
    var self = this;
    var engine = this.engine;

    engine.on('state', function (state) { self.renderState(state); });

    engine.on('round:start', function (data) {
      self.showBanner('ROUND ' + data.round, 'FIGHT', { variant: 'neutral', duration: 1100, priority: 1 });
    });

    engine.on('boards:add', function (data) {
      self.pulseCount(data.team, false);
      self.spawnFloater(data.team, '+' + data.amount, 'add');
    });

    engine.on('boards:remove', function (data) {
      self.pulseCount(data.team, true);
      self.spawnFloater(data.team, '-' + data.amount, 'remove');
      self.shakeTeam(data.team);
    });

    engine.on('board:break', function (data) {
      self.fireFlash(true);

      // 攻撃ギフトによる剥がしは「@誰が -N」の通知で見せる。
      // ここでバナーも出すと同じ出来事が 2 か所に出て、通知が隠れてしまう。
      if (data.meta && data.meta.source === 'tiktok') {
        // ただしカウントダウン解除まで起きた場合は、バナーが通知を覆って
        // 「誰の攻撃で止まったのか」が見えなくなる。直後の解除で使えるよう控える。
        self._lastBreak = { user: data.meta.user, amount: data.amount, at: Date.now() };
        return;
      }

      self._lastBreak = null;
      self.showBanner('BOARD BREAK', TEAM_LABEL[data.team] + ' -' + data.amount,
        { variant: 'danger', duration: 900, priority: 1 });
    });

    engine.on('countdown:start', function (data) {
      self.el.stage.classList.add('counting');
      self.el.countdown.classList.add('is-on');
      self.el.countdown.classList.remove('team-kawaii', 'team-beautiful');
      self.el.countdown.classList.add('team-' + data.team);
      self.el.countdownLabel.textContent = TEAM_LABEL[data.team] + ' HOLDING';
      self._lastSecond = null;

      if (data.takenFrom) {
        // 受け渡し。直前に出た「COUNTDOWN CANCELLED」より強い優先度で上書きし、
        // 「止まった」ではなく「相手に移った」と読めるようにする。
        self.showBanner(TEAM_LABEL[data.team] + ' TAKES OVER',
          'HOLD ' + engine.config.holdSeconds + ' SECONDS',
          { variant: data.team, duration: 1600, priority: 4 });
        self.fireFlash(false);
      } else {
        self.showBanner(TEAM_LABEL[data.team] + ' ' + engine.config.targetBoards + '!',
          'HOLD ' + engine.config.holdSeconds + ' SECONDS',
          { variant: data.team, duration: 1200, priority: 2 });
      }
    });

    engine.on('countdown:cancel', function (data) {
      self.hideCountdown();
      // 相手へ受け渡される場合は「解除」ではないので、赤いフラッシュも
      // CANCELLED の表示も出さない。続く countdown:start 側で見せる。
      if (data.takenBy) return;

      // 直前の剥がしが原因なら、その攻撃者を副題に出す。
      // board:break -> countdown:cancel は同じ操作の中で続けて飛んでくる。
      var cause = self._lastBreak && (Date.now() - self._lastBreak.at) < 500 ? self._lastBreak : null;
      self.showBanner('COUNTDOWN CANCELLED',
        cause ? '@' + cause.user + ' -' + cause.amount : TEAM_LABEL[data.team] + ' ' + data.boards,
        { variant: 'danger', duration: 1500, priority: 3 });
      self.fireFlash(true);
    });

    engine.on('round:win', function (data) {
      self.hideCountdown();
      self.showBanner(TEAM_LABEL[data.team] + ' WIN ROUND',
        data.score.kawaii + ' - ' + data.score.beautiful,
        { variant: data.team, duration: 3400, priority: 8 });
      self.fireFlash(false);
      self.burstConfetti(data.team);
      self.bumpScore(data.team);
    });

    engine.on('match:win', function (data) {
      self.showBanner(TEAM_LABEL[data.team] + ' WIN MATCH',
        'FINAL ' + data.score.kawaii + ' - ' + data.score.beautiful,
        { variant: data.team, duration: 0, priority: 10 });
      self.burstConfetti(data.team, 160);
    });

    engine.on('match:reset', function () {
      self.hideBanner(true);
      self.hideNotice();
    });
  };

  // --------------------------------------------------------------- render

  Renderer.prototype.renderState = function (state) {
    var target = state.config.targetBoards;

    this.el.scoreKawaii.textContent = state.score.kawaii;
    this.el.scoreBeautiful.textContent = state.score.beautiful;
    this.el.roundNumber.textContent = state.round || 1;
    this.el.roundsToWin.textContent = state.config.roundsToWinMatch;

    this.el.countKawaii.textContent = state.boards.kawaii;
    this.el.countBeautiful.textContent = state.boards.beautiful;

    this._renderTower(this.el.fillKawaii, this.el.teamKawaii, state.boards.kawaii, target);
    this._renderTower(this.el.fillBeautiful, this.el.teamBeautiful, state.boards.beautiful, target);

    this.el.stage.classList.toggle('lead-kawaii', state.boards.kawaii > state.boards.beautiful);
    this.el.stage.classList.toggle('lead-beautiful', state.boards.beautiful > state.boards.kawaii);

    if (!state.countdown) this.hideCountdown();
  };

  Renderer.prototype._renderTower = function (fillEl, teamEl, boards, target) {
    var ratio = Math.min(1, boards / target);
    fillEl.style.height = (ratio * 100).toFixed(2) + '%';
    fillEl.classList.toggle('is-empty', boards <= 0);
    teamEl.classList.toggle('charged', boards >= target);
  };

  /** Called every frame so the countdown reads smoothly. */
  Renderer.prototype.renderCountdown = function (countdown, holdSeconds) {
    if (!countdown) return;

    var totalMs = holdSeconds * 1000;
    var secondsLeft = Math.ceil(countdown.remainingMs / 1000);

    if (secondsLeft !== this._lastSecond) {
      this._lastSecond = secondsLeft;
      this.el.countdownNumber.textContent = secondsLeft;
      // restart the tick animation
      this.el.countdownNumber.classList.remove('tick');
      void this.el.countdownNumber.offsetWidth;
      this.el.countdownNumber.classList.add('tick');
    }

    var progress = 1 - (countdown.remainingMs / totalMs);
    this.el.countdownRing.style.strokeDashoffset = (RING_LENGTH * progress).toFixed(1);
  };

  Renderer.prototype.hideCountdown = function () {
    this.el.stage.classList.remove('counting');
    this.el.countdown.classList.remove('is-on');
    this.el.countdownRing.style.strokeDashoffset = 0;
    this._lastSecond = null;
  };

  // --------------------------------------------------------------- notice

  /**
   * 重要イベントの一時通知。常に 1 件だけ出し、短時間で消えます。
   *
   * ログのように積み上げません。新しい通知は古い通知を置き換えます。
   * ただしイベントの多い配信で表示が点滅して読めなくならないよう、
   * 最低表示時間 (notice.minVisibleMs) だけは守ります。
   * 優先度が高い通知 (FEVER > GIFT > LIKE) はそれを待たずに割り込みます。
   *
   * @param {object} notice { kind, user, detail, effect, team, priority }
   */
  Renderer.prototype.showNotice = function (notice) {
    if (!notice || !this.el.notice) return;

    var priority = notice.priority || 0;
    var visibleMs = this._noticeShownAt ? (Date.now() - this._noticeShownAt) : Infinity;

    if (priority <= this._noticePriority && visibleMs < this.noticeConfig.minVisibleMs) {
      // まだ読めていないので保留。保留が競合したら優先度の高い方を残す。
      if (!this._noticePending || priority >= this._noticePending.priority) {
        this._noticePending = notice;
      }
      this._scheduleNotice(this.noticeConfig.minVisibleMs - visibleMs);
      return;
    }

    this._paintNotice(notice);
  };

  Renderer.prototype._paintNotice = function (notice) {
    var el = this.el;
    this._noticePending = null;
    this._noticePriority = notice.priority || 0;
    this._noticeShownAt = Date.now();

    el.noticeUser.textContent = '@' + notice.user;
    el.noticeDetail.textContent = notice.detail || '';
    el.noticeDetail.style.display = notice.detail ? '' : 'none';
    el.noticeEffect.textContent = notice.effect || '';

    // クラスを付け直して、毎回ポップのアニメーションを最初から再生させる
    var className = 'notice notice--' + (notice.kind || 'gift');
    if (notice.team) className += ' notice--' + notice.team;
    el.notice.className = className;
    void el.notice.offsetWidth;
    el.notice.classList.add('is-on');
    el.stage.classList.add('noticed');

    this._scheduleNotice(this.noticeConfig.durationMs);
  };

  Renderer.prototype._scheduleNotice = function (delay) {
    var self = this;
    clearTimeout(this._noticeTimer);
    this._noticeTimer = setTimeout(function () {
      if (self._noticePending) {
        var next = self._noticePending;
        self._noticePending = null;
        self._paintNotice(next);
      } else {
        self.hideNotice();
      }
    }, Math.max(0, delay));
  };

  Renderer.prototype.hideNotice = function () {
    clearTimeout(this._noticeTimer);
    this._noticePending = null;
    this._noticePriority = -1;
    this._noticeShownAt = 0;
    if (!this.el.notice) return;
    this.el.notice.classList.remove('is-on');
    this.el.stage.classList.remove('noticed');
  };

  // ---------------------------------------------------------------- fever

  /**
   * FEVER の状態表示。毎フレーム呼ばれます。
   * 常時表示されるのは「FEVER 中かどうか」と「残り秒数」だけです。
   */
  Renderer.prototype.renderFever = function (fever) {
    if (!this.el.fever) return;

    var active = !!(fever && fever.active);
    this.el.fever.classList.toggle('is-on', active);
    this.el.stage.classList.toggle('fevered', active);

    if (!active) { this._lastFeverSecond = null; return; }

    var seconds = Math.ceil(fever.remainingMs / 1000);
    if (seconds !== this._lastFeverSecond) {
      this._lastFeverSecond = seconds;
      this.el.feverTime.textContent = seconds + 's';
    }
    this.el.feverMult.textContent = '\u00d7' + fever.multiplier;
  };

  // -------------------------------------------------------------- effects

  /**
   * @param {string} main   big line
   * @param {string} sub    small line under it
   * @param {object} opts   { variant, duration (0 = stay), priority }
   */
  Renderer.prototype.showBanner = function (main, sub, opts) {
    opts = opts || {};
    var priority = opts.priority || 0;
    if (priority < this._bannerPriority) return;   // do not cover a bigger moment

    this._bannerPriority = priority;
    clearTimeout(this._bannerTimer);

    this.el.bannerMain.textContent = main;
    this.el.bannerSub.textContent = sub || '';
    this.el.banner.className = 'banner is-on banner--' + (opts.variant || 'neutral');
    this.el.stage.classList.add('bannered');
    this._fitBannerText();

    if (opts.duration) {
      var self = this;
      this._bannerTimer = setTimeout(function () { self.hideBanner(); }, opts.duration);
    }
  };

  Renderer.prototype.hideBanner = function (force) {
    if (force) clearTimeout(this._bannerTimer);
    this.el.banner.classList.remove('is-on');
    this.el.stage.classList.remove('bannered');
    this._bannerPriority = -1;
  };

  /**
   * Headlines vary a lot in length ("ROUND 3" vs "BEAUTIFUL WIN MATCH") and
   * the font differs between machines, so shrink until the line fits the stage.
   */
  Renderer.prototype._fitBannerText = function () {
    var el = this.el.bannerMain;
    var size = BANNER_MAX_FONT;
    el.style.fontSize = size + 'px';
    while (size > BANNER_MIN_FONT &&
           (el.scrollWidth > BANNER_MAX_WIDTH || el.scrollHeight > BANNER_MAX_HEIGHT)) {
      size -= 8;
      el.style.fontSize = size + 'px';
    }
  };

  Renderer.prototype.spawnFloater = function (team, text, kind) {
    var host = team === TEAM.KAWAII ? this.el.floatersKawaii : this.el.floatersBeautiful;
    var node = document.createElement('div');
    node.className = 'floater floater--' + kind;
    node.textContent = text;
    node.style.left = (30 + Math.random() * 40) + '%';
    host.appendChild(node);
    setTimeout(function () { node.remove(); }, 1150);
  };

  Renderer.prototype.pulseCount = function (team, hurt) {
    var el = team === TEAM.KAWAII ? this.el.countKawaii : this.el.countBeautiful;
    el.classList.add('pop');
    if (hurt) el.classList.add('hurt');
    setTimeout(function () { el.classList.remove('pop', 'hurt'); }, 220);
  };

  Renderer.prototype.shakeTeam = function (team) {
    var el = team === TEAM.KAWAII ? this.el.teamKawaii : this.el.teamBeautiful;
    el.classList.remove('shake');
    void el.offsetWidth;
    el.classList.add('shake');
    setTimeout(function () { el.classList.remove('shake'); }, 460);
  };

  Renderer.prototype.bumpScore = function (team) {
    var el = team === TEAM.KAWAII ? this.el.scoreKawaii : this.el.scoreBeautiful;
    el.classList.remove('bump');
    void el.offsetWidth;
    el.classList.add('bump');
  };

  Renderer.prototype.fireFlash = function (danger) {
    var el = this.el.flash;
    el.className = 'flash';
    void el.offsetWidth;
    el.className = 'flash fire' + (danger ? ' fire--danger' : '');
  };

  Renderer.prototype.burstConfetti = function (team, count) {
    var colors = CONFETTI_COLORS[team] || CONFETTI_COLORS[TEAM.KAWAII];
    var total = count || 90;
    var host = this.el.confetti;

    for (var i = 0; i < total; i++) {
      var piece = document.createElement('div');
      var duration = 2 + Math.random() * 2;
      piece.className = 'confetti__piece';
      piece.style.left = (Math.random() * 100) + '%';
      piece.style.background = colors[i % colors.length];
      piece.style.animationDuration = duration + 's';
      piece.style.animationDelay = (Math.random() * 0.6) + 's';
      piece.style.transform = 'rotate(' + (Math.random() * 360) + 'deg)';
      host.appendChild(piece);
      /* jshint loopfunc:true */
      (function (node, ms) {
        setTimeout(function () { node.remove(); }, ms);
      })(piece, (duration + 0.8) * 1000);
    }
  };

  global.KVB.Renderer = Renderer;
  global.KVB.PHASE_REF = PHASE;
})(window);
