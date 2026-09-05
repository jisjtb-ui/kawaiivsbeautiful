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

    this.tracks = {};        // teamId -> Audio
    this.sources = {};       // teamId -> 元の指定 (URL / File 名)
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
    var old = this.tracks[team];
    if (old) {
      old.pause();
      delete this.tracks[team];
    }
    delete this.sources[team];

    if (src) {
      this.tracks[team] = this.createAudio(src);
      this.sources[team] = label || src;
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
    Object.keys(this.tracks).forEach(function (team) {
      self._fadeOut(self.tracks[team]);
    });
    this.current = null;
    this.wanted = null;
    return this;
  };

  AudioManager.prototype.setMuted = function (muted) {
    this.muted = Boolean(muted);
    var playing = this.current && this.tracks[this.current];
    if (playing) playing.volume = this.muted ? 0 : this.volume;
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

  AudioManager.prototype._apply = function () {
    var team = this.wanted;
    if (team === this.current) return;

    var next = this.tracks[team];
    if (!next) return;                    // その チームの曲が未設定なら何もしない

    var previous = this.current && this.tracks[this.current];
    if (previous) this._fadeOut(previous);

    next.currentTime = 0;
    next.volume = 0;
    var self = this;
    var played = next.play();

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
    this._fadeIn(next);
    this.current = team;
  };

  AudioManager.prototype._fadeIn = function (el) {
    this._fade(el, this.muted ? 0 : this.volume);
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
