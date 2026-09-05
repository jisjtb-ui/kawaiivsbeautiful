const test = require('node:test');
const assert = require('node:assert');
const { setup } = require('./helpers.js');

// ------------------------------------------------------------ チーム所属

test('合言葉のコメントでチームに所属する', () => {
  const t = setup();
  t.send({ type: 'chat', user: { uniqueId: 'taro' }, text: 'kawaii' });
  t.send({ type: 'chat', user: { uniqueId: 'hanako' }, text: 'beautiful' });
  assert.strictEqual(t.session.teamOf('taro'), 'A');
  assert.strictEqual(t.session.teamOf('hanako'), 'B');
});

test('合言葉を含むだけのコメントは所属に影響しない', () => {
  const t = setup();
  t.send({ type: 'chat', user: { uniqueId: 'taro' }, text: 'kawaii最高' });
  t.send({ type: 'chat', user: { uniqueId: 'taro' }, text: 'かわいい' });
  assert.strictEqual(t.session.teamOf('taro'), null);
});

test('一度所属したらそのラウンド中は変更できない', () => {
  const t = setup();
  t.send({ type: 'chat', user: { uniqueId: 'taro' }, text: 'kawaii' });
  t.send({ type: 'chat', user: { uniqueId: 'taro' }, text: 'beautiful' });
  assert.strictEqual(t.session.teamOf('taro'), 'A');
});

test('ラウンドが変わっても所属は維持される (LIVE セッション単位)', () => {
  const t = setup();
  t.send({ type: 'chat', user: { uniqueId: 'taro' }, text: 'kawaii' });
  t.send({ type: 'like', user: { uniqueId: 'taro' }, count: 50 });

  t.engine.startRound();
  t.engine.startRound();
  assert.strictEqual(t.session.teamOf('taro'), 'A', 'ラウンドをまたいでも A のまま');
  assert.strictEqual(t.session.likeBuckets['user:taro'], 50, 'LIKE の端数も残る');
});

test('endSession() を呼ぶと次の LIVE のために白紙に戻る', () => {
  const t = setup();
  t.send({ type: 'chat', user: { uniqueId: 'taro' }, text: 'kawaii' });
  t.session.endSession();
  assert.strictEqual(t.session.teamOf('taro'), null);
  assert.deepStrictEqual(t.session.likeBuckets, {});
});

test('未所属ユーザーの GIFT はランダムなチームへ入るが、所属はさせない', () => {
  const toB = setup({ random: () => 0.9 });   // 0.5 以上なら B
  toB.send({ type: 'gift', user: { uniqueId: 'taro' }, giftId: 5655, diamondCount: 1 });

  assert.strictEqual(toB.engine.getState().boards.B, 1, '効果は入る');
  assert.strictEqual(toB.engine.getState().boards.A, 0);
  assert.strictEqual(toB.session.teamOf('taro'), null, '所属はしない');
  assert.deepStrictEqual(toB.session.members, {});
});

test('未所属ユーザーの LIKE も同じく、効果だけがランダムに入る', () => {
  const t = setup({ random: () => 0.9 });
  t.send({ type: 'like', user: { uniqueId: 'taro' }, count: 100 });

  assert.strictEqual(t.engine.getState().boards.B, 1);
  assert.strictEqual(t.session.teamOf('taro'), null, '所属はしない');
});

test('未所属ユーザーのギフトは 1 件ごとに抽選され、両チームへばらける', () => {
  // 0.1 -> A, 0.9 -> B を交互に返す
  let flip = 0;
  const t = setup({ random: () => (flip++ % 2 === 0 ? 0.1 : 0.9) });

  for (let i = 0; i < 4; i++) {
    t.send({ type: 'gift', user: { uniqueId: 'taro' }, giftId: 5658, diamondCount: 20 });
  }
  assert.deepStrictEqual(t.engine.getState().boards, { A: 40, B: 40 });
  assert.strictEqual(t.session.teamOf('taro'), null, '何回送っても所属はしない');
});

test('コメントで所属したあとは、ギフトが必ずそのチームへ入る', () => {
  const t = setup({ random: () => 0.9 });     // 抽選なら必ず B になる条件
  t.send({ type: 'gift', user: { uniqueId: 'taro' }, giftId: 5658, diamondCount: 20 });
  assert.strictEqual(t.engine.getState().boards.B, 20, '所属前は抽選');

  t.send({ type: 'chat', user: { uniqueId: 'taro' }, text: 'kawaii' });
  t.send({ type: 'gift', user: { uniqueId: 'taro' }, giftId: 5658, diamondCount: 20 });
  assert.strictEqual(t.engine.getState().boards.A, 20, '所属後は抽選されない');
  assert.strictEqual(t.engine.getState().boards.B, 20, 'B は増えていない');
});

test('所属前に貯めた LIKE の端数は、所属後もそのまま引き継がれる', () => {
  const t = setup({ random: () => 0.9 });
  t.send({ type: 'like', user: { uniqueId: 'taro' }, count: 90 });   // 未所属で 90 貯める
  assert.strictEqual(t.engine.getState().boards.A, 0);

  t.send({ type: 'chat', user: { uniqueId: 'taro' }, text: 'kawaii' });
  t.send({ type: 'like', user: { uniqueId: 'taro' }, count: 10 });   // 合計 100
  assert.strictEqual(t.engine.getState().boards.A, 1, '所属先の A へ入る');
});

// -------------------------------------------------------------- GIFT

test('GIFT はポイントを板の枚数へ換算して積む', () => {
  const t = setup();
  t.send({ type: 'chat', user: { uniqueId: 'taro' }, text: 'kawaii' });
  t.send({ type: 'gift', user: { uniqueId: 'taro' }, giftId: 11046, diamondCount: 100 });   // 100 point
  assert.strictEqual(t.engine.getState().boards.A, 100);
});

test('GIFT の通知はユーザー名と枚数だけで、ギフト名を含まない', () => {
  const t = setup();
  t.send({ type: 'gift', user: { uniqueId: 'Taro' }, giftId: 5658, giftName: 'Perfume', diamondCount: 20 });
  const notice = t.notices.at(-1);
  assert.strictEqual(notice.kind, 'gift');
  assert.strictEqual(notice.user, 'Taro');
  assert.strictEqual(notice.effect, '+20');
  assert.ok(!('gift' in notice) && !('giftId' in notice));
  const dump = JSON.stringify(notice).toLowerCase();
  assert.ok(!dump.includes('perfume') && !dump.includes('5658'), '名前も giftId も漏れていない');
});

// -------------------------------------------------------------- LIKE

test('100 LIKE で板 1 枚、端数は次へ繰り越す (87 -> +20 -> 107)', () => {
  const t = setup();
  t.send({ type: 'chat', user: { uniqueId: 'ken' }, text: 'kawaii' });

  t.send({ type: 'like', user: { uniqueId: 'ken' }, count: 87 });
  assert.strictEqual(t.engine.getState().boards.A, 0, '87 ではまだ積まれない');

  t.send({ type: 'like', user: { uniqueId: 'ken' }, count: 20 });
  assert.strictEqual(t.engine.getState().boards.A, 1, '107 で 1 枚');
  assert.strictEqual(t.session.likeBuckets['user:ken'], 7, '7 が繰り越される');
});

test('100 LIKE 到達時だけ貢献者が表示される', () => {
  const t = setup();
  t.send({ type: 'like', user: { uniqueId: 'ken' }, count: 99 });
  assert.strictEqual(t.notices.length, 0, '未到達では何も表示しない');

  t.send({ type: 'like', user: { uniqueId: 'ken' }, count: 1 });
  assert.deepStrictEqual(
    { user: t.notices[0].user, detail: t.notices[0].detail, effect: t.notices[0].effect },
    { user: 'ken', detail: '100 LIKE', effect: '+1' }
  );
});

test('まとめて 250 LIKE 来ても 2 枚ぶんだけ積み、50 を繰り越す', () => {
  const t = setup();
  t.send({ type: 'like', user: { uniqueId: 'ken' }, count: 250 });
  assert.strictEqual(t.engine.getState().boards.A, 2);
  assert.strictEqual(t.session.likeBuckets['user:ken'], 50);
});

test('LIKE の貯金はユーザーごとに独立している', () => {
  const t = setup();
  t.send({ type: 'like', user: { uniqueId: 'a' }, count: 60 });
  t.send({ type: 'like', user: { uniqueId: 'b' }, count: 60 });
  assert.strictEqual(t.engine.getState().boards.A, 0, '合算されない');
});

test('scope を team にするとチーム単位で合算される', () => {
  const t = setup({ config: { likes: { scope: 'team' } } });
  t.send({ type: 'like', user: { uniqueId: 'a' }, count: 60 });
  t.send({ type: 'like', user: { uniqueId: 'b' }, count: 60 });
  assert.strictEqual(t.engine.getState().boards.A, 1);
});

// ------------------------------------------------------- FOLLOW / FEVER

test('FOLLOW で FEVER が始まる', () => {
  const t = setup();
  assert.strictEqual(t.session.getFever().active, false);

  t.send({ type: 'follow', user: { uniqueId: 'hanako' } });
  const fever = t.session.getFever();
  assert.strictEqual(fever.active, true);
  assert.strictEqual(fever.remainingMs, 30000);
  assert.strictEqual(t.notices.at(-1).effect, 'FEVER START');
});

test('FEVER はどちらのチームも有利にしない (板は動かない)', () => {
  const t = setup();
  t.send({ type: 'follow', user: { uniqueId: 'hanako' } });
  assert.deepStrictEqual(t.engine.getState().boards, { A: 0, B: 0 });
});

test('FEVER 中の FOLLOW は残り時間を 15 秒延長する (30 -> 45 -> 60)', () => {
  const t = setup();
  t.send({ type: 'follow', user: { uniqueId: 'a' } });
  assert.strictEqual(t.session.getFever().remainingMs, 30000);

  t.send({ type: 'follow', user: { uniqueId: 'b' } });
  assert.strictEqual(t.session.getFever().remainingMs, 45000);
  assert.strictEqual(t.notices.at(-1).effect, 'FEVER +15s');

  t.send({ type: 'follow', user: { uniqueId: 'c' } });
  assert.strictEqual(t.session.getFever().remainingMs, 60000);
});

test('延長は何度でもできる', () => {
  const t = setup();
  for (let i = 0; i < 20; i++) t.send({ type: 'follow', user: { uniqueId: 'u' + i } });
  assert.strictEqual(t.session.getFever().remainingMs, 30000 + 19 * 15000);
});

test('時間が経つと FEVER は終わる', () => {
  const t = setup();
  t.send({ type: 'follow', user: { uniqueId: 'a' } });

  t.advance(29000);
  assert.strictEqual(t.session.getFever().active, true);

  t.advance(2000);
  assert.strictEqual(t.session.getFever().active, false);
  assert.strictEqual(t.session.multiplier(), 1);
});

test('延長すればその分だけ FEVER が続く', () => {
  const t = setup();
  t.send({ type: 'follow', user: { uniqueId: 'a' } });
  t.advance(20000);
  t.send({ type: 'follow', user: { uniqueId: 'b' } });   // 残り 10s + 15s = 25s

  t.advance(24000);
  assert.strictEqual(t.session.getFever().active, true);
  t.advance(2000);
  assert.strictEqual(t.session.getFever().active, false);
});

test('FEVER 中は板の加算が設定倍率で強化される', () => {
  const t = setup();
  t.send({ type: 'gift', user: { uniqueId: 'taro' }, giftId: 5658, diamondCount: 20 });   // 20 point
  assert.strictEqual(t.engine.getState().boards.A, 20);

  t.send({ type: 'follow', user: { uniqueId: 'x' } });
  t.send({ type: 'gift', user: { uniqueId: 'taro' }, giftId: 5658, diamondCount: 20 });
  assert.strictEqual(t.engine.getState().boards.A, 60, 'FEVER 中は 2 倍');
});

test('FEVER 中は 100 LIKE の板も倍率が掛かる', () => {
  const t = setup();
  t.send({ type: 'follow', user: { uniqueId: 'x' } });
  t.send({ type: 'like', user: { uniqueId: 'ken' }, count: 100 });
  assert.strictEqual(t.engine.getState().boards.A, 2);
  assert.strictEqual(t.notices.at(-1).effect, '+2');
});

test('倍率・初期時間・延長時間は設定で変えられる', () => {
  const t = setup({ config: { fever: { durationMs: 5000, extendMs: 1000, multiplier: 10 } } });
  t.send({ type: 'follow', user: { uniqueId: 'a' } });
  assert.strictEqual(t.session.getFever().remainingMs, 5000);

  t.send({ type: 'follow', user: { uniqueId: 'b' } });
  assert.strictEqual(t.session.getFever().remainingMs, 6000);
  assert.strictEqual(t.notices.at(-1).effect, 'FEVER +1s');

  t.send({ type: 'gift', user: { uniqueId: 'taro' }, giftId: 5655, diamondCount: 1 });
  assert.strictEqual(t.engine.getState().boards.A, 10);
});

// ------------------------------------------------------------- その他

test('ラウンド進行中でなければイベントは効かない', () => {
  const t = setup();
  t.engine.winRound('A');    // ラウンド終了 = 受付停止
  t.send({ type: 'gift', user: { uniqueId: 'taro' }, giftId: 11046, diamondCount: 100 });
  t.send({ type: 'follow', user: { uniqueId: 'a' } });
  assert.strictEqual(t.engine.getState().boards.A, 0);
  assert.strictEqual(t.session.getFever().active, false);
});

test('TikTok 由来だと分かる meta を付けて板を積む', () => {
  const t = setup();
  const seen = [];
  t.engine.on('boards:add', (d) => seen.push(d.meta));
  t.send({ type: 'gift', user: { uniqueId: 'taro' }, giftId: 5655, diamondCount: 1 });
  assert.deepStrictEqual(seen[0], { source: 'tiktok', liveId: 'live-1', kind: 'gift', user: 'taro' });
});

// ------------------------------------------------------------- 板の上限

test('板は勝利ライン (1000) を超えて積み上がらない', () => {
  const t = setup();
  for (let i = 0; i < 15; i++) {
    t.send({ type: 'gift', user: { uniqueId: 'taro' }, giftId: 11046, diamondCount: 100 });   // 100 point x 15
  }
  assert.strictEqual(t.engine.getState().boards.A, 1000);
});

test('上限をまたぐギフトは、通知も実際に入った枚数になる', () => {
  const t = setup();
  t.engine.addBoards('A', 990, { source: 'setup' });
  t.send({ type: 'chat', user: { uniqueId: 'taro' }, text: 'kawaii' });
  t.send({ type: 'gift', user: { uniqueId: 'taro' }, giftId: 11046, diamondCount: 100 });   // 100 point

  assert.strictEqual(t.engine.getState().boards.A, 1000);
  assert.strictEqual(t.notices.at(-1).effect, '+10', '要求は +100 でも実際に入るのは +10');
});

test('上限に達していたら通知を出さない (+0 を表示しない)', () => {
  const t = setup();
  t.send({ type: 'chat', user: { uniqueId: 'taro' }, text: 'kawaii' });
  t.engine.addBoards('A', 1000, { source: 'setup' });
  const before = t.notices.length;

  t.send({ type: 'gift', user: { uniqueId: 'taro' }, giftId: 11046, diamondCount: 100 });
  t.send({ type: 'like', user: { uniqueId: 'taro' }, count: 100 });
  assert.strictEqual(t.notices.length, before);
});

test('上限があるので、板を 1 枚でも剥がせばカウントダウンが解除される', () => {
  const t = setup();
  t.send({ type: 'chat', user: { uniqueId: 'taro' }, text: 'kawaii' });

  // 1000 を大きく超える量のギフトを送っても貯金はできない
  for (let i = 0; i < 15; i++) t.send({ type: 'gift', user: { uniqueId: 'taro' }, giftId: 11046, diamondCount: 100 });
  assert.ok(t.engine.getState().countdown, 'カウントダウン中');

  t.engine.attack('B', 1);
  assert.strictEqual(t.engine.getState().countdown, null, '1 枚剥がすだけで解除される');
});

test('maxBoards を明示すれば、これまでどおり超過も許せる', () => {
  const t = setup({ engine: { maxBoards: 9999 } });
  for (let i = 0; i < 15; i++) t.send({ type: 'gift', user: { uniqueId: 'taro' }, giftId: 11046, diamondCount: 100 });
  assert.strictEqual(t.engine.getState().boards.A, 1500);
});


// --------------------------------------------------------- 攻撃ギフト

const ROSA = { giftId: 8913, giftName: 'Rosa', diamondCount: 10 };   // 攻撃ギフト
const ROSE   = { giftId: 5655,  giftName: 'Rose',        diamondCount: 1 };

test('攻撃ギフトは自分の板を積まず、相手の板を剥がす', () => {
  const t = setup();
  t.send({ type: 'chat', user: { uniqueId: 'taro' }, text: 'kawaii' });
  t.engine.addBoards('B', 500, { source: 'setup' });

  t.send(Object.assign({ type: 'gift', user: { uniqueId: 'taro' } }, ROSA));
  assert.deepStrictEqual(t.engine.getState().boards, { A: 0, B: 490 });
});

test('攻撃ギフトの通知は -N になる', () => {
  const t = setup();
  t.send({ type: 'chat', user: { uniqueId: 'Taro' }, text: 'kawaii' });
  t.engine.addBoards('B', 500, { source: 'setup' });

  t.send(Object.assign({ type: 'gift', user: { uniqueId: 'Taro' } }, ROSA));
  const notice = t.notices.at(-1);
  assert.strictEqual(notice.kind, 'attack');
  assert.strictEqual(notice.user, 'Taro');
  assert.strictEqual(notice.effect, '-10');
  assert.strictEqual(notice.team, 'B', '剥がされた側を指す');
});

test('攻撃ギフト以外はこれまでどおり板を積む', () => {
  const t = setup();
  t.send({ type: 'chat', user: { uniqueId: 'taro' }, text: 'kawaii' });
  t.send(Object.assign({ type: 'gift', user: { uniqueId: 'taro' } }, ROSE));
  assert.strictEqual(t.engine.getState().boards.A, 1);
});

test('未所属ユーザーの攻撃ギフトも、抽選した側の相手を剥がす (所属はしない)', () => {
  const t = setup({ random: () => 0.9 });          // 抽選は B
  t.engine.addBoards('A', 500, { source: 'setup' });

  t.send(Object.assign({ type: 'gift', user: { uniqueId: 'taro' } }, ROSA));
  assert.strictEqual(t.engine.getState().boards.A, 490, 'B の相手 = A が剥がされる');
  assert.strictEqual(t.session.teamOf('taro'), null, '所属はしない');
});

test('攻撃ギフトはカウントダウンを解除できる', () => {
  const t = setup();
  t.send({ type: 'chat', user: { uniqueId: 'taro' }, text: 'kawaii' });
  t.engine.addBoards('B', 1000, { source: 'setup' });
  assert.ok(t.engine.getState().countdown, 'BEAUTIFUL がカウントダウン中');

  t.send(Object.assign({ type: 'gift', user: { uniqueId: 'taro' } }, ROSA));
  assert.strictEqual(t.engine.getState().countdown, null, '10 枚剥がして解除');
});

test('相手が 0 枚なら攻撃しても通知を出さない', () => {
  const t = setup();
  t.send({ type: 'chat', user: { uniqueId: 'taro' }, text: 'kawaii' });
  const before = t.notices.length;

  t.send(Object.assign({ type: 'gift', user: { uniqueId: 'taro' } }, ROSA));
  assert.strictEqual(t.notices.length, before);
});

test('FEVER の倍率は既定では攻撃に掛からない', () => {
  const t = setup();
  t.send({ type: 'chat', user: { uniqueId: 'taro' }, text: 'kawaii' });
  t.engine.addBoards('B', 500, { source: 'setup' });
  t.send({ type: 'follow', user: { uniqueId: 'x' } });

  t.send(Object.assign({ type: 'gift', user: { uniqueId: 'taro' } }, ROSA));
  assert.strictEqual(t.engine.getState().boards.B, 490, 'x2 されず -10 のまま');
});

test('fever.multiplyAttack を true にすれば攻撃にも倍率が掛かる', () => {
  const t = setup({ config: { fever: { multiplyAttack: true } } });
  t.send({ type: 'chat', user: { uniqueId: 'taro' }, text: 'kawaii' });
  t.engine.addBoards('B', 500, { source: 'setup' });
  t.send({ type: 'follow', user: { uniqueId: 'x' } });

  t.send(Object.assign({ type: 'gift', user: { uniqueId: 'taro' } }, ROSA));
  assert.strictEqual(t.engine.getState().boards.B, 480, '-20');
});

test('攻撃ギフトの判定は giftId で行う (同名の別ギフトを巻き込まない)', () => {
  const t = setup();
  t.send({ type: 'chat', user: { uniqueId: 'taro' }, text: 'kawaii' });
  t.engine.addBoards('B', 500, { source: 'setup' });

  // 名前だけ Rosa で giftId が違うものは、攻撃にならない
  t.send({ type: 'gift', user: { uniqueId: 'taro' }, giftId: 999999, giftName: 'Rosa', diamondCount: 10 });
  assert.deepStrictEqual(t.engine.getState().boards, { A: 10, B: 500 });
});

test('攻撃ギフトは設定で差し替えられる', () => {
  const t = setup({ config: { gifts: { attackGiftIds: [5655], attackBoardsPerPoint: 5 } } });
  t.send({ type: 'chat', user: { uniqueId: 'taro' }, text: 'kawaii' });
  t.engine.addBoards('B', 500, { source: 'setup' });

  t.send(Object.assign({ type: 'gift', user: { uniqueId: 'taro' } }, ROSE));   // 1 point x 5
  assert.strictEqual(t.engine.getState().boards.B, 495);
  t.send(Object.assign({ type: 'gift', user: { uniqueId: 'taro' } }, ROSA)); // もう攻撃ではない
  assert.strictEqual(t.engine.getState().boards.A, 10);
});


// ---------------------------------------- FEVER 倍率がどこまで効くか

test('FEVER 中、実配信と同じ経路なら GIFT も LIKE も倍になる', () => {
  const t = setup();
  const U = { id: '1', uniqueId: 'taro' };
  t.send({ type: 'chat', user: U, comment: 'kawaii' });

  const gift = () => t.send({ type: 'gift', user: U, giftId: 5658, diamondCount: 20 });
  const like = () => t.send({ type: 'like', user: U, count: 100 });
  const A = () => t.engine.getState().boards.A;

  let before = A(); gift(); const giftPlain = A() - before;
  before = A(); like(); const likePlain = A() - before;

  t.send({ type: 'follow', user: { id: '9', uniqueId: 'x' } });
  assert.strictEqual(t.session.getFever().active, true);

  before = A(); gift(); const giftFever = A() - before;
  before = A(); like(); const likeFever = A() - before;

  assert.deepStrictEqual(
    { giftPlain, giftFever, likePlain, likeFever },
    { giftPlain: 20, giftFever: 40, likePlain: 1, likeFever: 2 },
    'GIFT も LIKE も 2 倍になる'
  );
});

test('engine.addBoards() を直接呼ぶ経路には FEVER 倍率が掛からない', () => {
  const t = setup();
  t.send({ type: 'follow', user: { id: '9', uniqueId: 'x' } });
  assert.strictEqual(t.session.getFever().active, true);

  // テストパネルの「板を直接動かす」ボタンと同じ呼び方。
  // 枚数を直接指定する操作なので、ポイントからの換算に掛かる倍率は通らない。
  const before = t.engine.getState().boards.A;
  t.engine.addBoards('A', 50, { source: 'test-panel' });
  assert.strictEqual(t.engine.getState().boards.A - before, 50);
});
