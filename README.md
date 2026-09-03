# KAWAII vs BEAUTIFUL

TikTok LIVE 用「ギフト連動型 対抗戦ゲーム」の MVP。

このリポジトリは **TikTok API を一切使っていません**。
外部ライブラリ・ビルド・サーバーなしで、ブラウザだけで完全に動作します。
後から TikTok LIVE のギフトイベントを差し込めるように、
**ゲームロジックと入力処理が完全に分離**されています。

---

## 1. 動かす

```
git clone <this repo>
cd kawaiivsbeautiful
```

`index.html` をブラウザで開くだけです（`file://` で動きます）。

| URL | 用途 |
| --- | --- |
| `index.html` | テストボタン付き（開発・動作確認用） |
| `index.html?obs=1` | 配信画面のみ（OBS 用） |

ローカルサーバーで開きたい場合:

```
python3 -m http.server 8000
# → http://localhost:8000/index.html
```

---

## 2. ゲームルール

| 項目 | 値 | 設定場所 |
| --- | --- | --- |
| チーム | KAWAII / BEAUTIFUL | `js/game.js` の `TEAM` |
| ラウンド開始時の板 | 両チーム 0 枚 | `startRound()` |
| 勝利ライン | 1000 枚 | `targetBoards` |
| 維持時間 | 10 秒 | `holdSeconds` |
| 試合勝利 | 先に 10 ラウンド | `roundsToWinMatch` |
| 次ラウンド自動開始 | 4 秒後 | `nextRoundDelayMs` |

進行:

1. 先に **1000 枚**に到達したチームが勝利候補になり、10 秒カウントダウン開始
2. 10 秒間 1000 枚以上を維持 → そのラウンドの勝利、+1 ポイント
3. 10 秒以内に相手に板を剥がされ 1000 枚未満になる → **カウントダウン解除**
4. ラウンド終了後、自動的に次のラウンドが始まる
5. 先に 10 ラウンド取ったチームが試合全体の勝者

補足（仕様の隙間をどう埋めたか）:

- カウントダウンは**先に 1000 枚に到達したチームのもの**です。
  相手が後から 1000 枚を超えてもカウントダウンは奪われません。
  解除されるのは「カウントダウン中のチーム自身が 1000 枚未満に落ちたとき」だけです。
- ラウンド終了中・試合終了後は板の増減を受け付けません（`isLive()` で判定）。
- 板は 0 枚未満にはなりません。

設定値を変えたいときは `js/main.js` の `new KVB.GameEngine({...})` を編集してください。

---

## 3. 画面

- 上部: `KAWAII 0 - 0 BEAUTIFUL` とラウンド表示
- 中央: `KAWAII VS BEAUTIFUL`
- 左右: 板が積み上がるタワー（板が増えるほど高くなる）
- 各タワーの下: 現在の板数 `640 / 1000`
- 1000 枚到達時: 中央に**大きな 10 秒カウントダウン**（リング + 数字）
- 板を剥がされたとき: `BOARD BREAK` / `COUNTDOWN CANCELLED` + 画面フラッシュ + タワーの揺れ
- ラウンド勝利時: `KAWAII WIN ROUND` / `BEAUTIFUL WIN ROUND` + 紙吹雪
- 試合勝利時: `KAWAII WIN MATCH` / `BEAUTIFUL WIN MATCH`

画面は **1920x1080 固定**で組み、表示領域に合わせて自動で拡大縮小します。
そのため OBS でもスマホ縦画面でも同じレイアウトが崩れずに出ます。

---

## 4. テスト用操作

TikTok API の代わりに、画面下のパネルから同じゲーム処理を叩けます。

| ボタン | 処理 |
| --- | --- |
| `KAWAII +1 / +10 / +50` | `engine.addBoards('kawaii', n)` |
| `BEAUTIFUL +1 / +10 / +50` | `engine.addBoards('beautiful', n)` |
| `KAWAII ATTACK` | `engine.attack('kawaii', 10)` → BEAUTIFUL の板を 10 枚減らす |
| `BEAUTIFUL ATTACK` | `engine.attack('beautiful', 10)` → KAWAII の板を 10 枚減らす |
| `RESET ROUND` | `engine.resetRound()`（スコアは維持） |
| `RESET MATCH` | `engine.resetMatch()`（全リセット） |

キーボード:

| キー | 処理 |
| --- | --- |
| `Q` / `W` / `E` | KAWAII +1 / +10 / +50 |
| `A` | KAWAII ATTACK |
| `I` / `O` / `P` | BEAUTIFUL +1 / +10 / +50 |
| `L` | BEAUTIFUL ATTACK |
| `R` / `M` | RESET ROUND / RESET MATCH |
| `H` | テストパネルの表示切替 |

ブラウザのコンソールからも直接叩けます:

```js
KVB.engine.addBoards('kawaii', 500);
KVB.engine.attack('beautiful', 10);
KVB.engine.getState();
```

---

## 5. OBS ブラウザソース設定

1. ソース → **ブラウザ** を追加
2. **ローカルファイル** にチェック → `index.html` を選択
3. **カスタムフレームURL** を使う場合は末尾に `?obs=1` を付ける
   （ローカルファイル指定時は「カスタム CSS」欄は空のままで OK）
4. 幅 `1920` / 高さ `1080`
5. 「表示されていないときにソースをシャットダウンする」は **オフ**推奨
   （オンだとシーン切替のたびに試合がリセットされます）

`?obs=1` を付けるとテストパネルが消え、配信画面だけになります。
配信中でも `H` キーでパネルを出し入れできます。

---

## 6. ファイル構成

```
index.html                # 1920x1080 のステージ + テストパネル
css/style.css             # 見た目・アニメーション
js/game.js                # ★ゲームロジック（DOM も TikTok も知らない）
js/renderer.js            # 画面描画（engine を読むだけ）
js/controls.js            # テスト入力（ボタン・キーボード）
js/tiktok-adapter.js      # ★TikTok 接続ポイント（現在はスタブ）
js/main.js                # 起動と 1 本のループ
```

依存の向きは一方向です:

```
controls.js  ─┐
              ├─→  game.js (GameEngine)  ─→ イベント ─→ renderer.js
tiktok-adapter.js ┘
```

`game.js` は他のどのファイルにも依存しません。Node からもそのまま読めます
（`require('./js/game.js')`）ので、ルールだけをテストすることもできます。

---

## 7. TikTok LIVE のギフトイベントを接続する

### 結論（どのファイルのどの関数か）

**`js/tiktok-adapter.js` の `TikTokAdapter.prototype.handleGift(gift)`**

ここが TikTok とゲームの唯一の接続点です。
ギフトが 1 件届くたびに `handleGift()` を呼べば、それだけで動きます。
`js/game.js` も `js/renderer.js` も**一切変更する必要はありません**。

```js
KVB.tiktok.handleGift({ name: 'Rose', count: 5, user: 'someone' });
```

`handleGift()` の中身は次の 3 行だけです:

```js
var rule   = this.rules[gift.name.toLowerCase()];   // ギフト → ルール
var amount = rule.boards * gift.count;              // 板の枚数に変換
rule.attack ? this.engine.attack(rule.team, amount, meta)
            : this.engine.addBoards(rule.team, amount, meta);
```

### 手順 1: ギフトと板の対応を決める

`js/tiktok-adapter.js` 冒頭の `GIFT_RULES` を、実際に使うギフト名に書き換えます。

```js
var GIFT_RULES = {
  'rose':           { team: TEAM.KAWAII,    boards: 1  },
  'finger heart':   { team: TEAM.KAWAII,    boards: 10 },
  'sunglasses':     { team: TEAM.KAWAII,    boards: 50 },
  'gg':             { team: TEAM.BEAUTIFUL, boards: 1  },
  'perfume':        { team: TEAM.BEAUTIFUL, boards: 10 },
  'galaxy':         { team: TEAM.BEAUTIFUL, boards: 50 },

  // attack: true なら「相手の板を剥がす」ギフトになる
  'lightning bolt': { team: TEAM.KAWAII,    boards: 10, attack: true },
  'thunder':        { team: TEAM.BEAUTIFUL, boards: 10, attack: true }
};
```

キーは**小文字**にしてください（`handleGift()` 側で小文字化して照合します）。
`GIFT_RULES` に無いギフトは無視されます。

### 手順 2: ギフトの受信口をつなぐ

ブラウザから TikTok に直接つなぐことはできないので、
小さなローカルサーバーを 1 つ挟み、WebSocket でブラウザに流します。

**サーバー側**（Node、`tiktok-live-connector` を使う例）:

```js
// server.js  ※このリポジトリには含まれていません
const { WebcastPushConnection } = require('tiktok-live-connector');
const { WebSocketServer } = require('ws');

const wss = new WebSocketServer({ port: 21213 });
const tiktok = new WebcastPushConnection('あなたのTikTokユーザー名');

tiktok.on('gift', (data) => {
  // 連打ギフトは終了時だけ数える
  if (data.giftType === 1 && !data.repeatEnd) return;

  const payload = JSON.stringify({
    name:  data.giftName,
    count: data.repeatCount || 1,
    user:  data.uniqueId
  });
  wss.clients.forEach((client) => client.send(payload));
});

tiktok.connect();
```

**ブラウザ側** — `js/tiktok-adapter.js` の `connect()` を実装します:

```js
TikTokAdapter.prototype.connect = function (url) {
  var self = this;
  this.socket = new WebSocket(url || 'ws://localhost:21213');

  this.socket.onopen  = function () { self.connected = true; };
  this.socket.onclose = function () { self.connected = false; };

  this.socket.onmessage = function (event) {
    self.handleGift(JSON.parse(event.data));   // ← ここが接続点
  };

  return Promise.resolve(true);
};
```

最後に `js/main.js` の末尾で呼び出します:

```js
tiktok.connect();     // engine.startMatch(); の後ろに 1 行足すだけ
```

### 接続先の一覧（ギフト以外も足したいとき）

`js/game.js` の以下のメソッドが公開 API です。
TikTok 側のどのイベントをどれに割り当てても構いません。

| 関数 | 用途 | 例 |
| --- | --- | --- |
| `addBoards(team, amount, meta)` | 板を積む | 通常ギフト |
| `removeBoards(team, amount, meta)` | 板を剥がす | ペナルティ |
| `attack(attacker, amount, meta)` | 相手の板を剥がす | 攻撃ギフト |
| `startRound()` | ラウンド開始 | 手動進行にしたいとき |
| `winRound(team)` | ラウンド勝利を確定 | 演出テスト |
| `startMatch()` / `winMatch(team)` | 試合の開始 / 終了 | 配信開始時など |
| `resetRound()` / `resetMatch()` | やり直し | モデレーターコマンド |

第 3 引数の `meta` はゲームロジックからは一切参照されず、
そのままイベントに乗って流れてきます。
`{ source:'tiktok', user:'...', gift:'Rose', count:5 }` のように入れておくと、
後から「誰のギフトか」を画面に出すのが簡単になります。

### イベント（画面や集計をつなぎたいとき）

```js
KVB.engine.on('boards:add',        (d) => {});  // { team, amount, total, meta }
KVB.engine.on('boards:remove',     (d) => {});  // { team, amount, total, meta }
KVB.engine.on('board:break',       (d) => {});  // { team, amount }
KVB.engine.on('attack',            (d) => {});  // { attacker, target, amount }
KVB.engine.on('countdown:start',   (d) => {});  // { team, seconds, boards }
KVB.engine.on('countdown:tick',    (d) => {});  // { team, secondsLeft }
KVB.engine.on('countdown:cancel',  (d) => {});  // { team, boards }
KVB.engine.on('round:start',       (d) => {});  // { round }
KVB.engine.on('round:win',         (d) => {});  // { team, round, score }
KVB.engine.on('match:win',         (d) => {});  // { team, score }
KVB.engine.on('state',             (s) => {});  // 状態が変わるたび
KVB.engine.on('*',            (e, d) => {});    // 全イベント（デバッグ用）
```

---

## 8. 未実装 / 今後

- TikTok への実接続（`connect()` はスタブのままです）
- 効果音
- いいね・コメント・フォローのイベント割り当て
- 複数ラウンドをまたぐ集計や、視聴者ランキング表示
