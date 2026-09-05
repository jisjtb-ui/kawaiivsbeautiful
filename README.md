# KAWAII vs BEAUTIFUL

TikTok LIVE 連動の対抗戦ゲーム。

> **これは「A VS B」の汎用対戦エンジンです。**
> ゲームロジックが知っているのはチーム ID の `A` / `B` だけで、
> `KAWAII` / `BEAUTIFUL` は `js/config.js` の `theme` に書かれた今回のテーマです。
> テーマを差し替えれば `MRBEAST VS ISHOWSPEED` にも `Team Red VS Team Blue` にもなります
> （→ [テーマを差し替える](#41-テーマを差し替える)）。
視聴者の **ギフト / いいね / フォロー / コメント** がそのまま試合を動かします。

外部ライブラリ・ビルド・サーバーなしで、ブラウザだけで動きます
（TikTok に実接続するときだけ中継が 1 つ要ります → 「9. TikTok LIVE につなぐ」）。

---

## 1. 動かす

`index.html` をブラウザで開くだけです（`file://` で動きます）。

| URL | 用途 |
| --- | --- |
| `index.html` | テストパネル付き（開発・動作確認用） |
| `index.html?obs=1` | 配信画面のみ（OBS 用） |
| `index.html?offline=1` | TikTok に繋がない |

**TikTok の実配信と繋ぐ場合**は、tikhub を起動して出てくる
`http://127.0.0.1:8787/` を開くだけです。コンソール操作は要りません
（→ [11. TikTok LIVE につなぐ](#11-tiktok-live-につなぐ)）。

ルールのテスト:

```
npm test        # 86 件。ブラウザ不要
npm run gifts   # TikTok のギフト一覧を取得（後述）
```

---

## 2. 視聴者から見たルール

| 操作 | 起きること |
| --- | --- |
| コメントに **`kawaii`** | Team **A** に参加。画面に `@username → KAWAII` が出る |
| コメントに **`beautiful`** | Team **B** に参加。画面に `@username → BEAUTIFUL` が出る |
| **ギフト** | 自分のチームの板が増える（ギフトの価値ぶん） |
| **Banana Peel**（攻撃ギフト） | **相手チームの板を 10 枚剥がす** |
| **いいね 100 回** | 自分のチームの板が 1 枚増える |
| **フォロー** | **FEVER** 発動。A/B 両方の板の増え方が 2 倍になる |

補足:

- 判定は**合言葉の完全一致**です。大文字小文字は区別せず、前後の空白は無視します。
  `kawaii` `KAWAII` `Kawaii` はすべて Team A です。
  `kawaii最高` `I love kawaii` `beautiful team` のように**含むだけの文章は対象外**です。
  `こんにちは` などの通常コメントも無視します。
- 所属したあとは抽選されません。ギフトもいいねも必ず自分のチームへ入ります。
  所属前に貯めたいいねの端数も、そのまま引き継がれます。
- 一度チームに入ると、**その LIVE が終わるまで変更できません**。
  ラウンドが変わっても維持されます。`kawaii` のあとに `beautiful` とコメントしても
  移動しません。重複登録もしません。
- 所属は **TikTok の userId** に紐付きます。ユーザー名を変えても所属は変わりません。
- 次の LIVE のために消すときは `KVB.session.endSession()` を呼びます。
- **所属が決まるのは `A` / `B` のコメントだけです。**
  まだどちらにも入っていない人のギフト・いいねは、**1 件ごとに A/B を抽選**して
  そちらへ効果を入れますが、**その人を所属させることはしません**。
  そのため、先にいいねを押していた人があとから `A` とコメントしても、
  ちゃんと A TEAM に入れます。抽選は毎回独立なので、未所属のまま送られた
  ぶんは両チームへばらけていきます。
- いいねは**累積**します。`87 → +20 → 107` で 1 枚積み、余った `7` は次に繰り越します。
- FEVER 中のフォローは**残り時間を +15 秒**します。何度でも延長できます
  （`30s → 45s → 60s …`）。FEVER は片方を有利にせず、両チーム共通です。
- ラウンドが変わると、チーム所属・いいねの貯金・FEVER はリセットされます。

試合の進行そのもの（1000 枚 → 10 秒維持 → ラウンド勝利 → 先に 10 ラウンドで試合勝利）は
これまでどおりです。

攻撃ギフト（`Banana Peel` / 10 ダイヤ / 連打可）だけは、自分の板を増やさず
**相手の板を剥がします**。カウントダウンを止められる唯一の手段です。
どのギフトを攻撃にするかは `js/config.js` の `gifts.attackGiftIds` で変えられます。

カウントダウンの取り合いは次のようになります。

- 先に 1000 枚に到達したチームがカウントダウンを持ちます。
  相手が後から 1000 枚に到達しても**奪われません**。
- 保持側が板を剥がされて 1000 枚を割ったとき、
  **相手がそのとき 1000 枚を維持していれば、カウントダウンはその相手へ移ります**
  （`BEAUTIFUL TAKES OVER`）。受け取った側は 10 秒を**最初から**数え直します。
  相手が稼いだ秒数は引き継ぎません。
- 相手も 1000 枚に届いていなければ、従来どおりカウントダウンは解除されます
  （`COUNTDOWN CANCELLED`）。

つまり両者が 1000 枚で張り合っている間は、剥がすたびに保持者が入れ替わり、
**10 秒を守り切ったほうがラウンドを取ります**。

**タワーの上限は勝利ラインと同じ 1000 枚です。** 超過分は積まれません
（990 枚のときに 100 ポイントのギフトが来たら、入るのは 10 枚で、通知も `+10` と出ます）。
上限が無いと超過分が「貯金」になり、板を剥がされてもカウントダウンが解除されなくなるためです。
上限は `js/game.js` の `maxBoards` で、意図的に超過を許すこともできます
（未指定なら `targetBoards` と同じ値になります）。

---

## 3. 画面

**常に見えているのは 4 つだけ**です。

```
        KAWAII 3 - 2 BEAUTIFUL      ROUND 6

  KAWAII                                   BEAUTIFUL
  ███████                                  ████████
    482                                      517

                  FEVER ×2
                    18s
```

1. KAWAII の板数
2. BEAUTIFUL の板数
3. 現在のラウンド
4. FEVER の状態（発動中のみ表示。倍率と残り秒数）

イベントログや統計は**画面に出しません**。
イベントが起きたときだけ、中央に**一時通知が 1 件**出て、すぐ消えます。

```
   @Taro         @Hanako          @Ken          @Yuki
    +25         FEVER +15s      100 LIKE      → KAWAII
                                    +1
```

- 通知は常に 1 件だけです。積み上がりません。
- 新しい通知は古い通知を置き換えます。
- ただしイベントが多い配信で点滅して読めなくならないよう、
  **最低表示時間（既定 0.7 秒）** は守ります。
- 優先度が高い通知（FEVER > GIFT > LIKE）は、それを待たずに割り込みます。
- 通知の色でどちらのチームに入ったかが分かります（KAWAII=ピンク / BEAUTIFUL=水色 /
  FEVER=黄 / 攻撃=赤）。文字数を増やさずに「どっちに影響したか」を伝えるためです。
- チーム振り分けの通知は**新しく振り分けられたときだけ**出ます。
  所属済みの人が再度コメントしても所属は変わらないので、画面も変わりません。
- 画面には **`@ユーザー名` と所属先しか出しません。** userId・表示名・コメント本文などの
  内部情報は出しません。ユーザー一覧やコメントログも表示しません。

ラウンド勝利や 1000 枚到達のカウントダウンなど、試合の節目の演出は従来どおりです。

---

## 4. 設定を変える

**触るのは `js/config.js` だけ**です。ほかのファイルに数値は書かれていません。

| 設定 | 既定値 | 意味 |
| --- | --- | --- |
| `theme.title` | `KAWAII VS BEAUTIFUL` | 中央のタイトルとブラウザのタブ名 |
| `theme.teamA.displayName` | `KAWAII` | 画面に出す名前（内部 ID は常に `A`） |
| `theme.teamA.keyword` | `kawaii` | 参加の合言葉 |
| `theme.teamA.aliases` | `[]` | 合言葉の別名。`['a']` を足せば `a` でも参加できる |
| `theme.teamA.colors` | ピンク3色 | テーマカラー。起動時に CSS 変数へ流し込まれる |
| `theme.teamA.icon` / `image` | `null` | 将来用の差し替え口 |
| `theme.teamB.*` | 同上 | 内部 ID は常に `B` |
| `comment.a` / `comment.b` | `['a','ａ']` / `['b','ｂ']` | チーム参加とみなすコメント（完全一致） |
| `likes.perBoard` | `100` | 何 LIKE で 1 区切りか |
| `likes.boardsPerMilestone` | `1` | 区切り 1 回で積む枚数 |
| `likes.scope` | `'user'` | `'user'` = 人ごとに 100 / `'team'` = チーム合算 |
| `fever.durationMs` | `30000` | FEVER の初期時間 |
| `fever.extendMs` | `15000` | フォロー 1 回あたりの延長 |
| `fever.multiplier` | `2` | FEVER 中の板の倍率 |
| `fever.maxDurationMs` | `0` | 残り時間の上限（0 = 上限なし） |
| `gifts.byId` | `{}` | **giftId → ゲーム内ポイント**（最優先。空でよい） |
| `gifts.byName` | `{}` | ギフト名 → ポイント（重複名があるので非推奨） |
| `gifts.diamondsToPoints` | `1` | 表に無いギフトは ダイヤ数 × これ |
| `gifts.boardsPerPoint` | `1` | ポイント → 板の枚数 |
| `gifts.attackGiftIds` | `[59314]` | 相手の板を剥がすギフト（Banana Peel） |
| `gifts.attackBoardsPerPoint` | `1` | 攻撃の ポイント → 剥がす枚数 |
| `fever.multiplyAttack` | `false` | FEVER の倍率を攻撃にも掛けるか |
| `notice.durationMs` | `1600` | 通知の表示時間 |
| `notice.minVisibleMs` | `700` | 次の通知に差し替えるまでの最低表示時間 |
| `notice.priority` | fever 3 / gift 2 / like 1 | 割り込みの強さ |

ギフトは **「1 ギフト = ○枚」で固定していません**。

```
giftId  →  gamePoint  →  board amount
        ↑              ↑
   config.gifts    config.gifts
   .byId/.byName   .boardsPerPoint
```

`byId` → `byName` → `ダイヤ数 × 係数` → `defaultPoints` の順に解決します。

**表は空のままで構いません。** ダイヤ数は GIFT イベント本体に乗ってくるので、
JP の 689 種すべてが自動的に正しい価値になります。`byId` に書くのは
「ダイヤ数と違う価値を意図的に付けたい」ギフトだけです。

**ダイヤ数がそのまま枚数になる（1 ダイヤ = 1 枚）のは意図的です。**
1000 ダイヤの Galaxy は 1 個で即ラウンド勝利になります（JP に 1000 ダイヤ以上が 215 種）。
安いギフトとの差が極端に開きますが、高額ギフトに見合う手応えを持たせるための設計です。
対抗手段は攻撃ギフトで、10 ダイヤの `Banana Peel` 1 個でカウントダウンを解除できます。
詳しい理由と、弱めたくなったときの注意は `js/config.js` の `boardsPerPoint` に書いてあります。

> **`byName` は避けてください。** 同じ名前で価値が全く違うギフトが実在します。
> 例: `Red Lightning` は **1 ダイヤ**（59313）と **12000 ダイヤ**（8419）の 2 種類。
> `npm run gifts -- JP --dupes` で重複している 26 組を確認できます。

試合そのものの設定（1000 枚 / 10 秒 / 10 ラウンド）は `js/main.js` の
`new KVB.GameEngine({...})` にあります。

---

### 4.1 テーマを差し替える

`js/config.js` の `theme` だけを書き換えます。**ゲームロジックは 1 行も触りません。**

```js
theme: {
  title: 'MRBEAST VS ISHOWSPEED',
  teamA: {
    id: 'A',                       // ← ID は固定。変えない
    displayName: 'MRBEAST',
    keyword: 'mrbeast',
    aliases: [],
    colors: { base: '#ff7a29', light: '#ffc08a', dark: '#5c2600' },
    icon: null, image: null
  },
  teamB: {
    id: 'B',
    displayName: 'ISHOWSPEED',
    keyword: 'ishowspeed',
    aliases: [],
    colors: { base: '#7cff5a', light: '#c6ffb8', dark: '#1d4a10' },
    icon: null, image: null
  }
}
```

これだけで、スコアボード・中央タイトル・タワーの見出し・振り分け通知・配色・
参加の合言葉・ブラウザのタブ名がすべて入れ替わります。
チーム ID は `A` / `B` のままなので、板・ラウンド・カウントダウン・FEVER・
攻撃ギフトのルールは何も影響を受けません。

**守るべき分離:**

| | 何 | どこ |
| --- | --- | --- |
| `A` / `B` | システム共通のチーム ID。**判定に使うのは常にこれ** | `js/game.js` の `TEAM` |
| `KAWAII` / `BEAUTIFUL` | 今回のテーマの表示名 | `js/config.js` の `theme` |

ゲームロジックの中で `'KAWAII'` のような表示名を条件に使わないでください。
DOM の id と CSS のクラスも `-a` / `-b` のスロット名にしてあり、
配色は `--team-a-*` / `--team-b-*` に起動時へ流し込まれます。

---

## 5. 開発用の確認表示

チーム振り分けはブラウザのコンソールにも出ます。**ゲーム画面には出しません。**

```
[COMMENT] @Taro: kawaii
[TEAM] @Taro → A / KAWAII
[COMMENT] @Taro: beautiful
[TEAM] @Taro → ALREADY A / KAWAII      ← 所属済みなので変わらない
[COMMENT] @Hanako: BEAUTIFUL
[TEAM] @Hanako → B / BEAUTIFUL
```

内部 ID と表示名の両方を出すので、テーマを差し替えても対応が追えます。
合言葉以外のコメントでは何も出ません（ログが埋もれないように）。
配信を受けている側（tikhub のターミナル）には、これまでどおり受信したイベントが出ます。

---

## 6. 設計

TikTok の処理とゲームのルールは**直接つながっていません**。

```
TikTok Connector      js/tiktok-adapter.js   受信するだけ
        ↓
Event Router          js/event-router.js     TikTok の語彙をここで捨てる
        ↓  Game Event  { GIFT | LIKE | FOLLOW | COMMENT }
Game Session          js/game-session.js     チーム所属 / LIKE 累積 / FEVER
        ↓  team = 'A' | 'B'
Game Logic            js/game.js             板・ラウンド・試合
        ↓
UI                    js/renderer.js         描くだけ (表示名は theme から)
```

例: `COMMENT "kawaii"` → `TEAM_SELECT` → `team = 'A'` → UI が `theme.teamA.displayName`
を引いて `@username → KAWAII` と表示する。TikTok の受信口が画面を直接触ることはありません。

- **`js/game.js` と `js/game-session.js` は TikTok を一切参照しません。**
  Event Router を通った時点で `giftId` も `diamondCount` も `uniqueId` も消え、
  下流に流れるのは `{ type:'GIFT', user:'taro', points:25 }` のような
  ゲーム用の形だけになります（テストで検証しています）。
- ギフトの**価値づけ**（giftId → ポイント）は TikTok 側の知識なので Event Router、
  ポイントの**板への換算**はゲーム側の知識なので Game Session が持ちます。

### 複数 LIVE への拡張

イベント処理（Router）とゲームセッションは分離してあります。
Router は `liveId` ごとにセッションを持てるので、増やすときは組を足すだけです。

```js
router.attach('live-a', new KVB.GameSession(engineA, { config, liveId: 'live-a' }));
router.attach('live-b', new KVB.GameSession(engineB, { config, liveId: 'live-b' }));

router.dispatch('live-a', eventFromLiveA);   // → Game A だけが動く
router.dispatch('live-b', eventFromLiveB);   // → Game B だけが動く
```

今回はマルチ LIVE 機能そのものは実装していません（構造だけ用意してあります）。

---

## 7. ファイル構成

```
index.html                # 1920x1080 のステージ + テストパネル
css/style.css             # 見た目・アニメーション
js/config.js              # ★設定値とテーマ (A/B の表示名・合言葉・色) はすべてここ
js/game.js                # ゲームロジック（DOM も TikTok も知らない）
js/game-session.js        # ★ルール層：チーム所属 / LIKE 累積 / FEVER
js/event-router.js        # ★TikTok イベント → ゲームイベント + LIVE ごとの振り分け
js/tiktok-adapter.js      # TikTok の受信口
js/renderer.js            # 画面描画（engine とセッションの通知を読むだけ）
js/controls.js            # テスト入力（TikTok イベントの再現 + 板の直接操作）
js/main.js                # 起動と 1 本のループ + 開発用コンソールログ
tools/fetch-gifts.js      # ギフトカタログの取得（giftId / 名前 / ダイヤ数）
test/                     # ルールのテスト（node --test）
```

---

## 8. テスト用操作

画面下のパネル（`H` キーで開閉、`?obs=1` で非表示）から、
**実際の TikTok イベントとまったく同じ経路**で動作確認できます。

| 操作 | キー | 起きること |
| --- | --- | --- |
| 合言葉のコメント | `1` / `2` | チームに参加（テーマの `keyword` を送ります） |
| ギフト | `G` | 板が増える + `@user +N` の通知 |
| 攻撃ギフト | `X` | 相手の板が減る + `@user -N` の通知（赤） |
| いいね +20 | `K` | 5 回で 100 に到達 → `100 LIKE +1` の通知 |
| フォロー | `F` | FEVER 開始 / +15 秒延長 |
| バースト | `B` | 15 件を連続で流す（通知が点滅しないかの確認用） |

板を直接動かす従来のボタン・キー（`Q/W/E`、`A`、`I/O/P`、`L`、`R`、`M`）も
そのまま残してあります。

コンソールからも叩けます:

```js
KVB.tiktok.handleEvent({ type:'chat',   user:{ uniqueId:'taro' }, text:'A' });
KVB.tiktok.handleEvent({ type:'gift',   user:{ uniqueId:'taro' }, giftName:'Galaxy' });
KVB.tiktok.handleEvent({ type:'like',   user:{ uniqueId:'taro' }, count:100 });
KVB.tiktok.handleEvent({ type:'follow', user:{ uniqueId:'taro' } });

KVB.session.getFever();     // { active, multiplier, remainingMs }
KVB.session.teamOf('taro'); // 'kawaii' | 'beautiful' | null
KVB.engine.getState();
```

---

## 9. ギフト一覧を調べる

TikTok のギフトは増減するので、設定を見直すときは実物を取得してください。
Euler Stream の公開エンドポイントを使うので **API キーは不要**です。

```bash
npm run gifts                    # JP のカタログを安い順に表示（689 種）
npm run gifts -- US              # 地域を変える（US/GB/DE/ES/BE/FR/CA/JP/BR/MX）
npm run gifts -- JP --max=10     # 10 ダイヤ以下だけ
npm run gifts -- JP --find=rose  # 名前で絞り込む
npm run gifts -- JP --dupes      # 名前が重複しているギフト
npm run gifts -- JP --json       # config.gifts.byId に貼れる形で出力
```

```
JP のギフト: 689 種
ダイヤ数の分布: 1=49  2-10=46  11-100=52  101-1000=327  1001+=215

  giftId  name                             diamond  連打
    5655  Rose                                   1  ◯
    5487  Finger Heart                           5  ◯
   59314  Banana Peel                           10  ◯
    5658  Perfume                               20  ◯
   11046  Galaxy                              1000  ◯
```

**地域によってギフトが違います。** JP 限定が 63 種、US 限定が 91 種あります。

---

## 10. OBS ブラウザソース設定

1. ソース → **ブラウザ** を追加
2. **ローカルファイル** にチェック → `index.html` を選択
3. 幅 `1920` / 高さ `1080`
4. 「表示されていないときにソースをシャットダウンする」は **オフ**推奨
   （オンだとシーン切替のたびに試合がリセットされます）

`?obs=1` を付けるとテストパネルが消え、配信画面だけになります。
配信中でも `H` キーでパネルを出し入れできます。

---

## 11. TikTok LIVE につなぐ

ブラウザから TikTok へ直接つなぐことはできません。
別リポジトリ [`jisjtb-ui/tikhub`](https://github.com/jisjtb-ui/tikhub) の
TikTok LIVE Event Server が受信して、ブラウザへ中継します。

**やることは 2 つだけです。**

**1.** tikhub のフォルダでコマンドを 1 行（Windows は `npm` を `npm.cmd` に）

```bash
npm start -- https://www.tiktok.com/@username/live
```

**2.** 出てきた URL をブラウザで開く

```
  ゲーム画面はこの URL をブラウザで開いてください
      http://127.0.0.1:8787/
```

以上です。**コンソールにコマンドを打つ必要はありません。**
ゲーム画面は読み込まれた時点で自動的に中継サーバーへ繋ぎます。

### フォルダの置き方

tikhub とゲームを**並べて**置くと、tikhub がゲームを見つけて配信します。

```
Downloads\
  ├── tikhub-.../              ← ここで npm start
  └── kawaiivsbeautiful-.../   ← 自動で見つかる
```

並べていなくても構いません。その場合は `index.html` を直接開いてください。
やはり自動で `http://127.0.0.1:8787` へ繋ぎにいきます。

### 繋がっていないとき

画面の右上に **`TIKTOK 未接続`** と出ます。これが出ている間はイベントが届いていません。

tikhub をあとから起動すれば、**ゲーム画面を開き直さなくても自動で繋がります**
（表示も自動で消えます）。tikhub を止めると再び出ます。

### URL で変えられること

| URL | 動き |
| --- | --- |
| `index.html` | 自動で `http://127.0.0.1:8787/events` に繋ぐ |
| `index.html?obs=1` | 配信画面のみ（テストパネルを隠す） |
| `index.html?offline=1` | TikTok に繋がない（完全オフラインで動かす） |
| `index.html?bridge=http://192.168.0.5:8787/events` | 別の PC の tikhub に繋ぐ |

組み合わせも使えます（`index.html?obs=1&offline=1` など）。

手動で繋ぎ直したいときはコンソールから叩けます。

```js
KVB.tiktok.connect();                                  // 自動で決めた接続先へ
KVB.tiktok.connect('http://192.168.0.5:8787/events');  // 明示指定
```

### 受け付けるイベントの形

```json
{ "type": "chat",   "user": { "id": "7543...", "uniqueId": "taro", "nickname": "タロー" }, "comment": "kawaii" }
{ "type": "gift",   "user": { "id": "7543...", "uniqueId": "taro" }, "giftId": 5655, "diamondCount": 1, "repeatCount": 5 }
{ "type": "like",   "user": { "id": "7543...", "uniqueId": "taro" }, "count": 15 }
{ "type": "follow", "user": { "id": "7543...", "uniqueId": "taro" } }
```

`user.id`（TikTok の userId）が所属の鍵です。取れない場合は `uniqueId` で代用します。

---

## 12. 未実装 / 今後

- 中継サーバー（tikhub → WebSocket）は別リポジトリ側の作業
- 効果音
- マルチ LIVE の実際の運用（構造は用意済み）

## ライセンス

MIT
