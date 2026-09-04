/**
 * config.js - すべての調整値をここ 1 箇所に集約する。
 *
 * ゲームのルールを変えたいときに触るのはこのファイルだけです。
 * game.js / event-router.js / game-session.js はここから値を受け取るだけで、
 * 数値をハードコードしません。
 *
 * Node からも読めます:  require('./js/config.js').CONFIG
 */
(function (global) {
  'use strict';

  var CONFIG = {

    /**
     * コメントの「A」「B」がどちらのチームに対応するか。
     * 値は game.js の TEAM と同じ文字列にしてください。
     */
    teams: {
      a: 'kawaii',
      b: 'beautiful'
    },

    /**
     * チーム選択に使うコメント。前後の空白を除いた「完全一致」で判定します。
     * 全角のＡ/Ｂ、小文字の a/b も拾います。
     * 部分一致にすると「Aさんかわいい」のような普通のコメントまで
     * チーム選択として拾ってしまうため、完全一致にしています。
     */
    comment: {
      a: ['a', 'ａ'],
      b: ['b', 'ｂ']
    },

    likes: {
      /** 何 LIKE で板 1 枚ぶんの区切りに到達するか。端数は次へ繰り越されます。 */
      perBoard: 100,
      /** 到達 1 回あたり何枚積むか。 */
      boardsPerMilestone: 1,
      /**
       * 'user' : ユーザーごとに 100 LIKE 貯める (表示される貢献者 = 本当にその人が 100 LIKE した)
       * 'team' : チーム単位で合算する (到達しやすいが、貢献者表示は「とどめを刺した人」になる)
       */
      scope: 'user'
    },

    fever: {
      /** FOLLOW で始まる FEVER の長さ。 */
      durationMs: 30000,
      /** FEVER 中の FOLLOW 1 回あたりの延長。何度でも延長できます。 */
      extendMs: 15000,
      /** FEVER 中、板の加算に掛かる倍率。 */
      multiplier: 2,
      /** 残り時間の上限。0 = 上限なし (延長し放題)。 */
      maxDurationMs: 0
    },

    gifts: {
      /**
       * giftId -> ゲーム内ポイント。最優先で参照されます。
       * TikTok のギフト ID は配信で実際に飛んできたものを見て埋めてください。
       */
      byId: {},

      /**
       * ギフト名 (小文字) -> ゲーム内ポイント。byId に無いときに参照されます。
       */
      byName: {
        'rose': 1,
        'tiktok': 1,
        'heart me': 1,
        'finger heart': 5,
        'perfume': 20,
        'sunglasses': 30,
        'galaxy': 100
      },

      /**
       * 上のどちらにも無いギフトは、ダイヤ数 x この係数をポイントにします。
       * ダイヤ数も取れない場合だけ defaultPoints を使います。
       */
      diamondsToPoints: 1,
      defaultPoints: 1,

      /** ポイント -> 板の枚数。 */
      boardsPerPoint: 1
    },

    notice: {
      /** 1 件の通知を表示し続ける時間。 */
      durationMs: 1600,
      /**
       * 次の通知に差し替えるまでの最低表示時間。
       * これが無いと、イベントが多い配信で表示が点滅して読めなくなります。
       */
      minVisibleMs: 700,
      /** 大きい方が優先。優先度が高い通知は最低表示時間を待たずに割り込みます。 */
      priority: {
        fever: 3,
        gift: 2,
        like: 1
      }
    },

    /**
     * true ならラウンドが変わるたびにチーム所属と LIKE の貯金をリセットします。
     * (「一度所属したらそのラウンド中は変更不可」という仕様に対応)
     */
    resetTeamsEachRound: true
  };

  global.KVB = global.KVB || {};
  global.KVB.CONFIG = CONFIG;

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { CONFIG: CONFIG };
  }
})(typeof window !== 'undefined' ? window : this);
