const test = require('node:test');
const assert = require('node:assert');
const { EventRouter } = require('../js/event-router.js');
const { makeConfig, setup } = require('./helpers.js');

function router(overrides) {
  return new EventRouter({ config: makeConfig(overrides), now: () => 1000 });
}

test('giftId が最優先でポイントに変換される', () => {
  const r = router({ gifts: { byId: { '5655': 7 }, byName: { rose: 1 } } });
  const e = r.translate({ type: 'gift', user: { uniqueId: 'taro' }, giftId: 5655, giftName: 'Rose' });
  assert.strictEqual(e.points, 7);
});

test('giftId が無ければギフト名 (大文字小文字を問わない) で引く', () => {
  const e = router().translate({ type: 'gift', user: { uniqueId: 'taro' }, giftName: 'Finger Heart' });
  assert.strictEqual(e.points, 5);
});

test('表に無いギフトはダイヤ数から換算する', () => {
  const e = router().translate({
    type: 'gift', user: { uniqueId: 'taro' }, giftName: 'Unknown Gift', diamondCount: 42
  });
  assert.strictEqual(e.points, 42);
});

test('ダイヤ数も無ければ既定値を使う', () => {
  const e = router().translate({ type: 'gift', user: { uniqueId: 'taro' }, giftName: 'Unknown Gift' });
  assert.strictEqual(e.points, 1);
});

test('連打ギフトは回数ぶん掛け算される', () => {
  const e = router().translate({
    type: 'gift', user: { uniqueId: 'taro' }, giftName: 'Rose', repeatCount: 5
  });
  assert.strictEqual(e.points, 5);
});

test('ゲームイベントに TikTok 固有の情報が残らない', () => {
  const e = router().translate({
    type: 'gift', user: { uniqueId: 'taro' }, giftId: 5655, giftName: 'Rose', diamondCount: 1
  });
  assert.deepStrictEqual(Object.keys(e).sort(), ['at', 'points', 'type', 'user']);
  assert.strictEqual(e.user, 'taro');
});

test('like / follow / comment を翻訳する', () => {
  const r = router();
  assert.deepStrictEqual(
    r.translate({ type: 'like', user: { uniqueId: 'a' }, count: 15 }),
    { type: 'LIKE', user: 'a', count: 15, at: 1000 }
  );
  assert.deepStrictEqual(
    r.translate({ type: 'follow', user: { uniqueId: 'b' } }),
    { type: 'FOLLOW', user: 'b', at: 1000 }
  );
  assert.deepStrictEqual(
    r.translate({ type: 'chat', user: { uniqueId: 'c' }, text: 'A' }),
    { type: 'COMMENT', user: 'c', text: 'A', at: 1000 }
  );
});

test('ゲームで使わないイベントは捨てる', () => {
  const r = router();
  assert.strictEqual(r.translate({ type: 'share', user: { uniqueId: 'a' } }), null);
  assert.strictEqual(r.translate({ type: 'member', user: { uniqueId: 'a' } }), null);
  assert.strictEqual(r.translate({ type: 'viewer', count: 100 }), null);
  assert.strictEqual(r.translate({ type: 'chat', user: { uniqueId: 'a' }, text: '' }), null);
});

test('liveId ごとに別のセッションへ振り分けられる', () => {
  const a = setup();
  const b = setup();
  a.router.attach('live-2', b.session);

  a.router.dispatch('live-1', { type: 'gift', user: { uniqueId: 'taro' }, giftName: 'Galaxy' });
  a.router.dispatch('live-2', { type: 'gift', user: { uniqueId: 'hanako' }, giftName: 'Rose' });

  assert.strictEqual(a.engine.getState().boards.kawaii, 100);
  assert.strictEqual(b.engine.getState().boards.kawaii, 1);
});

test('宛先セッションが無いイベントは捨てられ、例外にならない', () => {
  const a = setup();
  assert.doesNotThrow(() => a.router.dispatch('live-nope', { type: 'gift', user: { uniqueId: 'x' } }));
  assert.strictEqual(a.router.stats.dropped, 1);
});
