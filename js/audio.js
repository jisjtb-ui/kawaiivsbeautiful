/**
 * audio.js - リードしているチームの BGM を鳴らす。
 *
 *   Game State  ->  leadingTeam  ->  AudioManager (ここ)  ->  再生
 *
 * ゲームロジックは音を一切知りません。ここが受け取るのは「今どちらが
 * リードしているか」だけで、板の数もイベントも見ません。
 *
 * 切り替えの決まり:
 *
 *   - **リードしているチームが変わったときだけ**切り替えます。
 *     板が動くたびに鳴らし直すと、曲の頭が延々と繰り返されて聞けたものではありません。
 *   - 同点のときは**今鳴っている曲をそのまま続けます**。
 *     同点は板が拮抗しているときに何度も跨ぐ状態なので、止めると
 *     数秒おきに無音が挟まって、かえって落ち着きません。
 *     (まだ何も鳴っていない状態＝ラウンド開始直後は、無音のままです)
 *   - 曲はループします。
 *
 * ブラウザは操作なしの再生を拒否することがあります。そのときは待って、
 * 最初のクリックやキー操作で鳴らし始めます (needsGesture が true になります)。
 */
(function (global) {
  'use strict';

  /** 既定の音量とフェード時間。config.audio で変えられます。 */
  var DEFAULTS = { volume: 0.6, fadeMs: 400 };

  /**
   * @param {object} [options]
   *   volume, fadeMs
   *   createAudio … Audio 要素を作る関数。差し替えるとブラウザ無しで試せる
   *   onNeedsGesture … 操作待ちになったとき / 解けたときに呼ばれる
   */
  function AudioManager(options) {
    options = options || {};
    this.volume = options.volume != null ? options.volume : DEFAULTS.volume;
    this.fadeMs = options.fadeMs != null ? options.fadeMs : DEFAULTS.fadeMs;
    this.createAudio = options.createAudio || function (src) {
      var el = new global.Audio(src);
      el.loop = true;
      el.preload = 'auto';
      return el;
    };
    this.onNeedsGesture = options.onNeedsGesture || function () {};

    this.tracks = {};        // teamId -> Audio (配信に乗る音)
    this.monitors = {};      // teamId -> Audio (自分だけが聞く音)
    this.sources = {};       // teamId -> 元の指定 (URL / File 名)

    /**
     * 出力の設定。
     *
     *   stream  … 配信に乗る側。OBS が拾う出力先を選ぶ
     *   monitor … 自分の耳だけで聞く側。既定では鳴らさない
     *
     * 同じ曲を 2 つの Audio 要素で鳴らし、それぞれ別のデバイスへ出します。
     * 1 つの要素は 1 つの出力先にしか出せないためです。
     */
    this.outputs = {
      stream: { sinkId: '', volume: this.volume, enabled: true },
      monitor: { sinkId: '', volume: 0.4, enabled: false },
    };
    this.current = null;     // 今鳴らしているチーム
    this.wanted = null;      // 鳴らしたいチーム (操作待ちのときズレる)
    this.needsGesture = false;
    this.muted = false;
  }

  /**
   * チームの曲を設定する。src が空なら解除。
   * 鳴っている最中に差し替えた場合は、その場で新しい曲に切り替えます。
   */
  AudioManager.prototype.setTrack = function (team, src, label) {
    [this.tracks, this.monitors].forEach(function (bag) {
      if (bag[team]) {
        bag[team].pause();
        delete bag[team];
      }
    });
    delete this.sources[team];

    if (src) {
      this.tracks[team] = this.createAudio(src);
      this.sources[team] = label || src;
      if (this.outputs.monitor.enabled) {
        this.monitors[team] = this.createAudio(src);
        this._applySink('monitor', this.monitors[team]);
      }
      this._applySink('stream', this.tracks[team]);
    }

    // 差し替えたのが今鳴らすべきチームなら、鳴らし直す
    if (this.wanted === team) {
      this.current = null;
      this._apply();
    }
    return this;
  };

  AudioManager.prototype.hasTrack = function (team) {
    return Boolean(this.tracks[team]);
  };

  /**
   * リードしているチームを伝える。null は同点。
   * **同じチームが続いている間は何もしません** (鳴らし直さない)。
   */
  AudioManager.prototype.setLeader = function (team) {
    // 同点は「変化なし」として扱い、今の曲を続ける
    if (team == null) return this;
    if (team === this.wanted) return this;

    this.wanted = team;
    this._apply();
    return this;
  };

  /** 全部止める (ラウンド終了や試合終了で無音に戻したいとき)。 */
  AudioManager.prototype.stop = function () {
    var self = this;
    [this.tracks, this.monitors].forEach(function (bag) {
      Object.keys(bag).forEach(function (team) { self._fadeOut(bag[team]); });
    });
    this.current = null;
    this.wanted = null;
    return this;
  };

  AudioManager.prototype.setMuted = function (muted) {
    this.muted = Boolean(muted);
    var self = this;
    ['stream', 'monitor'].forEach(function (which) {
      var el = self.current && self._bag(which)[self.current];
      if (el) el.volume = self.muted ? 0 : self.outputs[which].volume;
    });
    return this;
  };

  /** 操作待ちだったものを、クリックなどのあとに鳴らし始める。 */
  AudioManager.prototype.resume = function () {
    if (!this.needsGesture) return this;
    this.needsGesture = false;
    this.current = null;
    this._apply();
    return this;
  };

  /** 出力先のデバイスを要素に反映する。setSinkId が無いブラウザでは何もしない。 */
  AudioManager.prototype._applySink = function (which, el) {
    var sinkId = this.outputs[which].sinkId;
    if (!el || !sinkId || typeof el.setSinkId !== 'function') return;
    el.setSinkId(sinkId).catch(function (err) {
      console.warn('[KVB] 出力先を変更できませんでした:', err && err.message);
    });
  };

  /**
   * 出力の設定を変える。
   *
   * @param {'stream'|'monitor'} which
   * @param {object} patch { sinkId, volume, enabled }
   */
  AudioManager.prototype.setOutput = function (which, patch) {
    var out = this.outputs[which];
    if (!out) return this;
    Object.keys(patch).forEach(function (k) { out[k] = patch[k]; });

    var self = this;
    if (which === 'monitor') {
      // 有効にした / 無効にしたタイミングで、聞く側の要素を作り直す
      Object.keys(this.sources).forEach(function (team) {
        if (out.enabled && !self.monitors[team]) {
          self.monitors[team] = self.createAudio(self.tracks[team].src || self.sources[team]);
        }
        if (!out.enabled && self.monitors[team]) {
          self.monitors[team].pause();
          delete self.monitors[team];
        }
      });
    }

    Object.keys(this._bag(which)).forEach(function (team) {
      self._applySink(which, self._bag(which)[team]);
    });

    // 今鳴らしている曲があれば、音量をその場で反映する
    var playing = this.current && this._bag(which)[this.current];
    if (playing) playing.volume = this.muted ? 0 : out.volume;
    else if (out.enabled && this.current) this._apply(true);
    return this;
  };

  AudioManager.prototype._bag = function (which) {
    return which === 'monitor' ? this.monitors : this.tracks;
  };

  AudioManager.prototype._apply = function (force) {
    var team = this.wanted;
    if (team === this.current && !force) return;

    var next = this.tracks[team];
    if (!next) return;                    // そのチームの曲が未設定なら何もしない

    var self = this;
    var started = false;

    ['stream', 'monitor'].forEach(function (which) {
      var out = self.outputs[which];
      var bag = self._bag(which);
      var previous = self.current && bag[self.current];
      if (previous && previous !== bag[team]) self._fadeOut(previous);

      var el = bag[team];
      if (!el || !out.enabled) return;

      el.currentTime = 0;
      el.volume = 0;
      var played = el.play();
      started = true;

      if (played && typeof played.catch === 'function') {
        played.then(function () {
          self.needsGesture = false;
          self.onNeedsGesture(false);
        }).catch(function () {
          // ブラウザに止められた。最初の操作を待つ。
          self.needsGesture = true;
          self.current = null;
          self.onNeedsGesture(true);
        });
      }
      self._fade(el, self.muted ? 0 : out.volume);
    });

    if (started) this.current = team;
  };

  AudioManager.prototype._fadeOut = function (el) {
    var self = this;
    this._fade(el, 0, function () { el.pause(); });
  };

  /** 音量を滑らかに動かす。急に切り替えると耳に痛いため。 */
  AudioManager.prototype._fade = function (el, to, done) {
    if (el._fadeTimer) clearInterval(el._fadeTimer);

    // fadeMs が 0 ならその場で反映する。待たされないことを期待する設定なので、
    // タイマーを 1 回挟むとフェード無しにした意味がなくなる。
    if (!(this.fadeMs > 0)) {
      el.volume = Math.min(1, Math.max(0, to));
      if (done) done();
      return;
    }

    var steps = Math.max(1, Math.round(this.fadeMs / 40));
    var from = typeof el.volume === 'number' ? el.volume : 0;
    var step = 0;

    el._fadeTimer = setInterval(function () {
      step += 1;
      var v = from + (to - from) * (step / steps);
      el.volume = Math.min(1, Math.max(0, v));
      if (step >= steps) {
        clearInterval(el._fadeTimer);
        el._fadeTimer = null;
        if (done) done();
      }
    }, 40);
  };

  global.KVB = global.KVB || {};
  global.KVB.AudioManager = AudioManager;

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { AudioManager: AudioManager };
  }
})(typeof window !== 'undefined' ? window : this);
