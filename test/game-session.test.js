const test = require('node:test');
const assert = require('node:assert');
const { setup } = require('./helpers.js');

// ------------------------------------------------------------ チーム所属

test('コメント A / B でチームに所属する', () => {
  const t = setup();
  t.send({ type: 'chat', user: { uniqueId: 'taro' }, text: 'A' });
  t.send({ type: 'chat', user: { uniqueId: 'hanako' }, text: 'b' });
  assert.strictEqual(t.session.teamOf('taro'), 'kawaii');
  assert.strictEqual(t.session.teamOf('hanako'), 'beautiful');
});

test('全角のＡ / Ｂ も拾う', () => {
  const t = setup();
  t.send({ type: 'chat', user: { uniqueId: 'taro' }, text: 'Ａ' });
  assert.strictEqual(t.session.teamOf('taro'), 'kawaii');
});

test('A / B 以外のコメントは所属に影響しない', () => {
  const t = setup();
  t.send({ type: 'chat', user: { uniqueId: 'taro' }, text: 'Aチーム頑張れ' });
  t.send({ type: 'chat', user: { uniqueId: 'taro' }, text: 'かわいい' });
  assert.strictEqual(t.session.teamOf('taro'), null);
});

test('一度所属したらそのラウンド中は変更できない', () => {
  const t = setup();
  t.send({ type: 'chat', user: { uniqueId: 'taro' }, text: 'A' });
  t.send({ type: 'chat', user: { uniqueId: 'taro' }, text: 'B' });
  assert.strictEqual(t.session.teamOf('taro'), 'kawaii');
});

test('ラウンドが変わると所属と LIKE の貯金がリセットされる', () => {
  const t = setup();
  t.send({ type: 'chat', user: { uniqueId: 'taro' }, text: 'A' });
  t.send({ type: 'like', user: { uniqueId: 'taro' }, count: 50 });
  assert.strictEqual(t.session.teamOf('taro'), 'kawaii');

  t.engine.startRound();
  assert.strictEqual(t.session.teamOf('taro'), null);
  assert.deepStrictEqual(t.session.likeBuckets, {});
});

test('未所属ユーザーの GIFT はランダムに所属が決まり、そのチームに入る', () => {
  const toB = setup({ random: () => 0.9 });   // 0.5 以上なら B
  toB.send({ type: 'gift', user: { uniqueId: 'taro' }, giftName: 'Rose' });
  assert.strictEqual(toB.session.teamOf('taro'), 'beautiful');
  assert.strictEqual(toB.engine.getState().boards.beautiful, 1);
  assert.strictEqual(toB.engine.getState().boards.kawaii, 0);
});

test('未所属ユーザーの LIKE も同じくランダム所属になる', () => {
  const t = setup({ random: () => 0.9 });
  t.send({ type: 'like', user: { uniqueId: 'taro' }, count: 10 });
  assert.strictEqual(t.session.teamOf('taro'), 'beautiful');
});

// -------------------------------------------------------------- GIFT

test('GIFT はポイントを板の枚数へ換算して積む', () => {
  const t = setup();
  t.send({ type: 'chat', user: { uniqueId: 'taro' }, text: 'A' });
  t.send({ type: 'gift', user: { uniqueId: 'taro' }, giftName: 'Galaxy' });   // 100 point
  assert.strictEqual(t.engine.getState().boards.kawaii, 100);
});

test('GIFT の通知はユーザー名と枚数だけで、ギフト名を含まない', () => {
  const t = setup();
  t.send({ type: 'gift', user: { uniqueId: 'Taro' }, giftName: 'Perfume', giftId: 999 });
  const notice = t.notices.at(-1);
  assert.strictEqual(notice.kind, 'gift');
  assert.strictEqual(notice.user, 'Taro');
  assert.strictEqual(notice.effect, '+20');
  assert.ok(!('gift' in notice) && !('giftId' in notice));
  assert.ok(!JSON.stringify(notice).toLowerCase().includes('perfume'));
});

// -------------------------------------------------------------- LIKE

test('100 LIKE で板 1 枚、端数は次へ繰り越す (87 -> +20 -> 107)', () => {
  const t = setup();
  t.send({ type: 'chat', user: { uniqueId: 'ken' }, text: 'A' });

  t.send({ type: 'like', user: { uniqueId: 'ken' }, count: 87 });
  assert.strictEqual(t.engine.getState().boards.kawaii, 0, '87 ではまだ積まれない');

  t.send({ type: 'like', user: { uniqueId: 'ken' }, count: 20 });
  assert.strictEqual(t.engine.getState().boards.kawaii, 1, '107 で 1 枚');
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
  assert.strictEqual(t.engine.getState().boards.kawaii, 2);
  assert.strictEqual(t.session.likeBuckets['user:ken'], 50);
});

test('LIKE の貯金はユーザーごとに独立している', () => {
  const t = setup();
  t.send({ type: 'like', user: { uniqueId: 'a' }, count: 60 });
  t.send({ type: 'like', user: { uniqueId: 'b' }, count: 60 });
  assert.strictEqual(t.engine.getState().boards.kawaii, 0, '合算されない');
});

test('scope を team にするとチーム単位で合算される', () => {
  const t = setup({ config: { likes: { scope: 'team' } } });
  t.send({ type: 'like', user: { uniqueId: 'a' }, count: 60 });
  t.send({ type: 'like', user: { uniqueId: 'b' }, count: 60 });
  assert.strictEqual(t.engine.getState().boards.kawaii, 1);
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
  assert.deepStrictEqual(t.engine.getState().boards, { kawaii: 0, beautiful: 0 });
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
  t.send({ type: 'gift', user: { uniqueId: 'taro' }, giftName: 'Perfume' });   // 20 point
  assert.strictEqual(t.engine.getState().boards.kawaii, 20);

  t.send({ type: 'follow', user: { uniqueId: 'x' } });
  t.send({ type: 'gift', user: { uniqueId: 'taro' }, giftName: 'Perfume' });
  assert.strictEqual(t.engine.getState().boards.kawaii, 60, 'FEVER 中は 2 倍');
});

test('FEVER 中は 100 LIKE の板も倍率が掛かる', () => {
  const t = setup();
  t.send({ type: 'follow', user: { uniqueId: 'x' } });
  t.send({ type: 'like', user: { uniqueId: 'ken' }, count: 100 });
  assert.strictEqual(t.engine.getState().boards.kawaii, 2);
  assert.strictEqual(t.notices.at(-1).effect, '+2');
});

test('倍率・初期時間・延長時間は設定で変えられる', () => {
  const t = setup({ config: { fever: { durationMs: 5000, extendMs: 1000, multiplier: 10 } } });
  t.send({ type: 'follow', user: { uniqueId: 'a' } });
  assert.strictEqual(t.session.getFever().remainingMs, 5000);

  t.send({ type: 'follow', user: { uniqueId: 'b' } });
  assert.strictEqual(t.session.getFever().remainingMs, 6000);
  assert.strictEqual(t.notices.at(-1).effect, 'FEVER +1s');

  t.send({ type: 'gift', user: { uniqueId: 'taro' }, giftName: 'Rose' });
  assert.strictEqual(t.engine.getState().boards.kawaii, 10);
});

// ------------------------------------------------------------- その他

test('ラウンド進行中でなければイベントは効かない', () => {
  const t = setup();
  t.engine.winRound('kawaii');    // ラウンド終了 = 受付停止
  t.send({ type: 'gift', user: { uniqueId: 'taro' }, giftName: 'Galaxy' });
  t.send({ type: 'follow', user: { uniqueId: 'a' } });
  assert.strictEqual(t.engine.getState().boards.kawaii, 0);
  assert.strictEqual(t.session.getFever().active, false);
});

test('TikTok 由来だと分かる meta を付けて板を積む', () => {
  const t = setup();
  const seen = [];
  t.engine.on('boards:add', (d) => seen.push(d.meta));
  t.send({ type: 'gift', user: { uniqueId: 'taro' }, giftName: 'Rose' });
  assert.deepStrictEqual(seen[0], { source: 'tiktok', liveId: 'live-1', kind: 'gift', user: 'taro' });
});
