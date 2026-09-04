const test = require('node:test');
const assert = require('node:assert');
const { GameEngine } = require('../js/game.js');

/** 時計を手で進められるエンジン。 */
function makeEngine(overrides = {}) {
  let clock = 1_000_000;
  const engine = new GameEngine(Object.assign({ now: () => clock }, overrides));
  const events = [];
  engine.on('*', (name, data) => events.push({ name, data }));
  engine.startMatch();
  return {
    engine, events,
    advance(ms) { clock += ms; engine.update(clock); },
    last(name) { return events.filter((e) => e.name === name).at(-1); }
  };
}

/** 両チームを 1000 枚にし、KAWAII 側にカウントダウンを持たせる。 */
function bothAtTarget() {
  const t = makeEngine();
  t.engine.addBoards('kawaii', 1000);          // KAWAII が先に到達 -> カウントダウン取得
  t.engine.addBoards('beautiful', 1000);       // BEAUTIFUL も到達 (奪わない)
  assert.strictEqual(t.engine.countdown.team, 'kawaii');
  return t;
}

test('後から相手が 1000 に到達してもカウントダウンは奪われない', () => {
  const t = bothAtTarget();
  assert.strictEqual(t.engine.countdown.team, 'kawaii');
});

test('保持側が剥がされたら、1000 を維持している相手へカウントダウンが移る', () => {
  const t = bothAtTarget();
  t.advance(4000);                              // KAWAII が 4 秒消化

  t.engine.attack('beautiful', 1);              // KAWAII 999, BEAUTIFUL 1000
  assert.ok(t.engine.countdown, 'カウントダウンは止まらない');
  assert.strictEqual(t.engine.countdown.team, 'beautiful');
});

test('受け取った側は 10 秒を最初から数え直す (相手が稼いだ秒数は引き継がない)', () => {
  const t = bothAtTarget();
  t.advance(9000);                              // KAWAII は残り 1 秒まで進んだ
  assert.strictEqual(Math.round(t.engine.countdown.remainingMs / 1000), 1);

  t.engine.attack('beautiful', 1);
  assert.strictEqual(t.engine.countdown.team, 'beautiful');
  assert.strictEqual(t.engine.countdown.remainingMs, 10000, '10 秒から再スタート');
});

test('受け渡しは takenFrom / takenBy 付きで通知される', () => {
  const t = bothAtTarget();
  t.engine.attack('beautiful', 1);

  assert.deepStrictEqual(
    { team: t.last('countdown:start').data.team, takenFrom: t.last('countdown:start').data.takenFrom },
    { team: 'beautiful', takenFrom: 'kawaii' }
  );
  // 「解除された」のか「相手へ移った」のかを聞き分けられること
  assert.strictEqual(t.last('countdown:cancel').data.takenBy, 'beautiful');
});

test('相手が 1000 未満なら takenBy は null (ただの解除)', () => {
  const t = makeEngine();
  t.engine.addBoards('kawaii', 1000);
  t.engine.addBoards('beautiful', 500);
  t.engine.attack('beautiful', 1);
  assert.strictEqual(t.last('countdown:cancel').data.takenBy, null);
});

test('受け取った側が 10 秒維持すればラウンドを取る', () => {
  const t = bothAtTarget();
  t.engine.attack('beautiful', 1);
  t.advance(10000);
  assert.strictEqual(t.engine.getState().score.beautiful, 1);
  assert.strictEqual(t.engine.getState().score.kawaii, 0);
});

test('相手が 1000 に届いていなければ、従来どおり解除で止まる', () => {
  const t = makeEngine();
  t.engine.addBoards('kawaii', 1000);
  t.engine.addBoards('beautiful', 500);

  t.engine.attack('beautiful', 1);
  assert.strictEqual(t.engine.countdown, null);
  assert.strictEqual(t.engine.phase, 'playing');
});

test('剥がし合いになると受け渡しが繰り返され、どちらも勝ちきれない', () => {
  const t = bothAtTarget();
  const owners = [t.engine.countdown.team];

  for (let i = 0; i < 4; i++) {
    t.advance(3000);
    const holder = t.engine.countdown.team;
    // 保持していない側が 1 枚積み直してから、保持側を 1 枚剥がす
    t.engine.addBoards(holder === 'kawaii' ? 'beautiful' : 'kawaii', 1);
    t.engine.attack(holder === 'kawaii' ? 'beautiful' : 'kawaii', 1);
    owners.push(t.engine.countdown.team);
  }

  assert.deepStrictEqual(owners, ['kawaii', 'beautiful', 'kawaii', 'beautiful', 'kawaii']);
  assert.deepStrictEqual(t.engine.getState().score, { kawaii: 0, beautiful: 0 });
});

test('受け渡しの直後に相手も落ちれば、カウントダウンは止まる', () => {
  const t = bothAtTarget();
  t.engine.attack('beautiful', 1);              // BEAUTIFUL へ移る
  assert.strictEqual(t.engine.countdown.team, 'beautiful');

  t.engine.attack('kawaii', 1);                 // BEAUTIFUL も 999 に。KAWAII は 999 のまま
  assert.strictEqual(t.engine.countdown, null);
});
