# KAWAII vs BEAUTIFUL

TikTok LIVE 連動の対抗戦ゲーム。
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

ローカルサーバーで開きたい場合:

```
python3 -m http.server 8000
# → http://localhost:8000/index.html
```

ルールのテスト:

```
npm test        # 35 件。ブラウザ不要
```

---

## 2. 視聴者から見たルール

| 操作 | 起きること |
| --- | --- |
| コメントに **`A`** | KAWAII に参加 |
| コメントに **`B`** | BEAUTIFUL に参加 |
| **ギフト** | 自分のチームの板が増える（ギフトの価値ぶん） |
| **いいね 100 回** | 自分のチームの板が 1 枚増える |
| **フォロー** | **FEVER** 発動。A/B 両方の板の増え方が 2 倍になる |

補足:

- 一度チームに入ると、**そのラウンド中は変更できません**。
  `A` のあとに `B` とコメントしても移動しません。
- まだどちらにも入っていない人がギフト・いいねをした場合は、
  **A/B をランダムに決めて**その効果を適用し、そのままそのチームに所属させます。
- いいねは**累積**します。`87 → +20 → 107` で 1 枚積み、余った `7` は次に繰り越します。
- FEVER 中のフォローは**残り時間を +15 秒**します。何度でも延長できます
  （`30s → 45s → 60s …`）。FEVER は片方を有利にせず、両チーム共通です。
- ラウンドが変わると、チーム所属・いいねの貯金・FEVER はリセットされます。

試合の進行そのもの（1000 枚 → 10 秒維持 → ラウンド勝利 → 先に 10 ラウンドで試合勝利）は
これまでどおりです。

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
   @Taro              @Hanako              @Ken
    +25              FEVER +15s          100 LIKE
                                             +1
```

- 通知は常に 1 件だけです。積み上がりません。
- 新しい通知は古い通知を置き換えます。
- ただしイベントが多い配信で点滅して読めなくならないよう、
  **最低表示時間（既定 0.7 秒）** は守ります。
- 優先度が高い通知（FEVER > GIFT > LIKE）は、それを待たずに割り込みます。
- 通知の色でどちらのチームに入ったかが分かります（KAWAII=ピンク / BEAUTIFUL=水色 / FEVER=黄）。
  文字数を増やさずに「どっちに影響したか」を伝えるためです。

ラウンド勝利や 1000 枚到達のカウントダウンなど、試合の節目の演出は従来どおりです。

---

## 4. 設定を変える

**触るのは `js/config.js` だけ**です。ほかのファイルに数値は書かれていません。

| 設定 | 既定値 | 意味 |
| --- | --- | --- |
| `teams.a` / `teams.b` | `kawaii` / `beautiful` | コメントの A / B がどちらのチームか |
| `comment.a` / `comment.b` | `['a','ａ']` / `['b','ｂ']` | チーム参加とみなすコメント（完全一致） |
| `likes.perBoard` | `100` | 何 LIKE で 1 区切りか |
| `likes.boardsPerMilestone` | `1` | 区切り 1 回で積む枚数 |
| `likes.scope` | `'user'` | `'user'` = 人ごとに 100 / `'team'` = チーム合算 |
| `fever.durationMs` | `30000` | FEVER の初期時間 |
| `fever.extendMs` | `15000` | フォロー 1 回あたりの延長 |
| `fever.multiplier` | `2` | FEVER 中の板の倍率 |
| `fever.maxDurationMs` | `0` | 残り時間の上限（0 = 上限なし） |
| `gifts.byId` | `{}` | **giftId → ゲーム内ポイント**（最優先） |
| `gifts.byName` | Rose=1, Galaxy=100 … | ギフト名 → ポイント |
| `gifts.diamondsToPoints` | `1` | 表に無いギフトは ダイヤ数 × これ |
| `gifts.boardsPerPoint` | `1` | ポイント → 板の枚数 |
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
実配信で飛んできたギフト ID を `byId` に足していけば、
ほかのコードを触らずに価値を調整できます。

試合そのものの設定（1000 枚 / 10 秒 / 10 ラウンド）は `js/main.js` の
`new KVB.GameEngine({...})` にあります。

---

## 5. 設計

TikTok の処理とゲームのルールは**直接つながっていません**。

```
TikTok Connector      js/tiktok-adapter.js   受信するだけ
        ↓
Event Router          js/event-router.js     TikTok の語彙をここで捨てる
        ↓  Game Event  { GIFT | LIKE | FOLLOW | COMMENT }
Game Session          js/game-session.js     チーム / LIKE 累積 / FEVER
        ↓
Game Logic            js/game.js             板・ラウンド・試合
        ↓
UI                    js/renderer.js         描くだけ
```

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

## 6. ファイル構成

```
index.html                # 1920x1080 のステージ + テストパネル
css/style.css             # 見た目・アニメーション
js/config.js              # ★設定値はすべてここ
js/game.js                # ゲームロジック（DOM も TikTok も知らない）
js/game-session.js        # ★ルール層：チーム / LIKE 累積 / FEVER
js/event-router.js        # ★TikTok イベント → ゲームイベント + LIVE ごとの振り分け
js/tiktok-adapter.js      # TikTok の受信口
js/renderer.js            # 画面描画（engine とセッションの通知を読むだけ）
js/controls.js            # テスト入力（TikTok イベントの再現 + 板の直接操作）
js/main.js                # 起動と 1 本のループ
test/                     # ルールのテスト（node --test）
```

---

## 7. テスト用操作

画面下のパネル（`H` キーで開閉、`?obs=1` で非表示）から、
**実際の TikTok イベントとまったく同じ経路**で動作確認できます。

| 操作 | キー | 起きること |
| --- | --- | --- |
| コメント `A` / `B` | `1` / `2` | チームに参加 |
| ギフト | `G` | 板が増える + `@user +N` の通知 |
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

## 8. OBS ブラウザソース設定

1. ソース → **ブラウザ** を追加
2. **ローカルファイル** にチェック → `index.html` を選択
3. 幅 `1920` / 高さ `1080`
4. 「表示されていないときにソースをシャットダウンする」は **オフ**推奨
   （オンだとシーン切替のたびに試合がリセットされます）

`?obs=1` を付けるとテストパネルが消え、配信画面だけになります。
配信中でも `H` キーでパネルを出し入れできます。

---

## 9. TikTok LIVE につなぐ

ブラウザから TikTok へ直接つなぐことはできません。
別プロセスでイベントを受信し、WebSocket でブラウザへ中継します。

受信側は別リポジトリ [`jisjtb-ui/tikhub`](https://github.com/jisjtb-ui/tikhub) の
TikTok LIVE Event Server がそのまま使えます（GIFT / LIKE / FOLLOW / COMMENT を
実配信で受信できることを確認済みです）。中継サーバーがイベントを
次の形の JSON で 1 件ずつ送れば、ブラウザ側は次の 1 行で繋がります。

```js
KVB.tiktok.connect('ws://localhost:21213');
```

送る JSON:

```json
{ "type": "gift",   "user": { "uniqueId": "taro" }, "giftId": 5655, "giftName": "Rose",
  "repeatCount": 5, "diamondCount": 1 }
{ "type": "like",   "user": { "uniqueId": "taro" }, "count": 15 }
{ "type": "follow", "user": { "uniqueId": "taro" } }
{ "type": "chat",   "user": { "uniqueId": "taro" }, "text": "A" }
```

`connect()` を呼ばなければネットワークアクセスは一切発生せず、
これまでどおり完全オフラインで動きます。

---

## 10. 未実装 / 今後

- 中継サーバー（tikhub → WebSocket）は別リポジトリ側の作業
- 効果音
- マルチ LIVE の実際の運用（構造は用意済み）

## ライセンス

MIT
