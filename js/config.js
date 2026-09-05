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
     * 対戦テーマ。**ここだけを書き換えれば別の対戦に差し替えられます。**
     *
     *   A / B          … システム共通のチーム ID。ゲームロジックはこれしか見ません
     *   displayName    … 画面に出す名前。今回のテーマ
     *   keyword        … 視聴者がコメントして参加するときの合言葉
     *
     * 例えば次のように書き換えれば、ゲームロジックを 1 行も触らずに
     * 別の対戦になります。
     *
     *   title: 'MRBEAST VS ISHOWSPEED',
     *   teamA: { id:'A', displayName:'MRBEAST',   keyword:'mrbeast'   , ... },
     *   teamB: { id:'B', displayName:'ISHOWSPEED', keyword:'ishowspeed', ... }
     *
     * ゲームロジックの中で 'KAWAII' / 'BEAUTIFUL' という文字列を
     * 判定に使ってはいけません。判定は必ず id ('A' / 'B') で行います。
     */
    theme: {
      /**
       * 中央のタイトルとタブ名。
       * 省略すると「<A の名前> VS <B の名前>」が自動で使われます。
       */
      title: null,

      teamA: {
        id: 'A',
        /**
         * ここを変えれば、参加の合言葉もタイトルも通知も全部変わります。
         * 変えるのは基本この 1 行だけです。
         */
        displayName: 'KAWAII',
        /**
         * 参加の合言葉。完全一致 (大文字小文字は無視)。
         * **省略すると displayName の小文字**が使われます。
         * 表示名と違う言葉で参加させたいときだけ書いてください。
         */
        keyword: null,
        /** keyword の別名。['a'] を足せば「a」でも参加できるようになります。 */
        aliases: [],
        /** テーマカラー。起動時に CSS 変数へ流し込まれます。 */
        colors: { base: '#ff4f9d', light: '#ff9ecb', dark: '#7a0b3d' },
        /**
         * このチームがリードしているときに流す BGM。
         * index.html から見た相対パス、または http:// の URL。
         * 例: 'bgm/kawaii.mp3'
         *
         * 空でも構いません。画面の設定欄からその場で選ぶこともできます
         * (そちらは開いている間だけ有効で、保存はされません)。
         */
        bgm: null,

        /** 将来用。アイコン / 画像を差し替えたいときにここへ URL を入れます。 */
        icon: null,
        image: null
      },

      teamB: {
        id: 'B',
        displayName: 'BEAUTIFUL',
        keyword: null,
        aliases: [],
        colors: { base: '#26d7ff', light: '#9be9ff', dark: '#06405a' },
        bgm: null,
        icon: null,
        image: null
      }
    },

    /**
     * BGM の鳴らし方。
     *
     * リードしているチームの曲をループで流し、**リードが変わったときだけ**
     * 切り替えます。板が動くたびに鳴らし直すと曲の頭が繰り返されるだけで、
     * 「どちらが勝っているか」も伝わりません。
     */
    audio: {
      /** 0.0 〜 1.0。 */
      volume: 0.6,
      /** 切り替えのフェード時間 (ミリ秒)。0 で即切り替え。 */
      fadeMs: 400,
      /** false にすると BGM 機能自体を使いません。 */
      enabled: true
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
      maxDurationMs: 0,

      /**
       * FEVER の倍率を攻撃ギフトにも掛けるか。
       * 既定は false (FEVER は「板の加算」だけを強化する)。
       */
      multiplyAttack: false
    },

    gifts: {
      /**
       * giftId -> ゲーム内ポイント。最優先で参照されます。
       *
       * 空でかまいません。ダイヤ数は GIFT イベント本体に乗ってくるので、
       * 表に無いギフトは下の diamondsToPoints で自動換算されます
       * (JP だけで 689 種あり、全部書き出す意味はありません)。
       * ここに書くのは「ダイヤ数と違う価値を意図的に付けたい」ギフトだけです。
       *
       * 一覧は  npm run gifts -- JP  で取得できます。
       */
      byId: {},

      /**
       * ギフト名 (小文字) -> ゲーム内ポイント。byId に無いときに参照されます。
       *
       * 注意: 同じ名前で giftId も価値も違うギフトが実在します
       * (例: Red Lightning は 1 ダイヤと 12000 ダイヤの 2 種類)。
       * 名前で書くと両方に当たってしまうので、特別扱いは byId を使ってください。
       *   npm run gifts -- JP --dupes  で重複している名前を確認できます。
       */
      byName: {},

      /**
       * 上のどちらにも無いギフトは、ダイヤ数 x この係数をポイントにします。
       * ダイヤ数も取れない場合だけ defaultPoints を使います。
       */
      diamondsToPoints: 1,
      defaultPoints: 1,

      /**
       * ポイント -> 板の枚数。
       *
       * ┌──────────────────────────────────────────────────────────────┐
       * │ この 1:1 換算による「不均衡」は意図的です。バグではありません。 │
       * └──────────────────────────────────────────────────────────────┘
       *
       * ダイヤ数がそのまま枚数になります:
       *
       *      1 diamond  Rose          ->    1 枚
       *      5 diamond  Finger Heart  ->    5 枚
       *     20 diamond  Perfume       ->   20 枚
       *   1000 diamond  Galaxy        -> 1000 枚  = 即ラウンド勝利
       *
       * つまり 1000 ダイヤ以上のギフト (JP に 215 種) は 1 個でラウンドを取れます。
       * FEVER 中は倍率が掛かるため 500 ダイヤでも同じことが起きます。
       * 安いギフトとの差が極端に開きますが、それでよいと判断しています。
       * 高額ギフトに見合う手応えを持たせるのが狙いです。
       *
       * 唯一の対抗手段が攻撃ギフト (下の attackGiftIds) です。
       * 10 ダイヤの Rosa 1 個でカウントダウンを解除できるので、
       * 高額ギフトを「10 秒守り切れるタイミングで出す」駆け引きになります。
       *
       * 弱めたくなった場合、この値を 1 未満にするのは避けてください。
       * 板の枚数は切り捨てなので、0.2 にすると 1 ダイヤのギフトが 0 枚になり、
       * 安いギフトを送った人に何も起きなくなります。
       * 上限を設けるか、byId で個別に価値を下げるほうが安全です。
       *
       * 実プレイでの調整は未了です (テストプレイ後に再検討)。
       */
      boardsPerPoint: 1,

      /**
       * 相手の板を剥がす「攻撃ギフト」。名前ではなく giftId で指定します。
       *   8913 = Rosa (10 ダイヤ / 連打可 / JP・US 共通)
       *
       * 攻撃はカウントダウンを解除させる唯一の手段です。板を 1 枚でも剥がせば
       * 保持側が勝利ラインを割るため、10 秒の維持を妨害できます。
       */
      attackGiftIds: [8913],
      attackGiftNames: [],

      /** 攻撃ギフトの ポイント -> 剥がす枚数。 */
      attackBoardsPerPoint: 1
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
        attack: 3,
        fever: 3,
        gift: 2,
        team: 2,
        like: 1
      }
    },

    /**
     * チーム所属は **LIVE セッション単位**です。ラウンドが変わっても維持され、
     * 一度所属したユーザーはその LIVE が終わるまでチームを変更できません。
     *
     * 次の LIVE のために消すときは session.endSession() を呼びます。
     *
     * 所属が決まるのは合言葉のコメントだけです。ギフトやいいねでは所属しません
     * (未所属のまま送られた効果は 1 件ごとに抽選して A / B へ振り分けます)。
     */
    resetTeamsOnRound: false
  };

  global.KVB = global.KVB || {};
  global.KVB.CONFIG = CONFIG;

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { CONFIG: CONFIG };
  }
})(typeof window !== 'undefined' ? window : this);
