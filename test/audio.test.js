const test = require('node:test');
const assert = require('node:assert');
const { AudioManager } = require('../js/audio.js');
const { GameEngine } = require('../js/game.js');

/** ブラウザ無しで鳴らし方だけを見るための偽 Audio。 */
function fakeAudio(log) {
  return function (src) {
    return {
      src,
      volume: 0,
      currentTime: 0,
      loop: true,
      plays: 0,
      play() { this.plays += 1; log.push('play:' + src); return Promise.resolve(); },
      pause() { log.push('pause:' + src); },
    };
  };
}

function setup() {
  const log = [];
  const audio = new AudioManager({ fadeMs: 0, createAudio: fakeAudio(log) });
  audio.setTrack('A', 'kawaii.mp3');
  audio.setTrack('B', 'beautiful.mp3');
  log.length = 0;
  return { audio, log };
}

test('リードしているチームの曲を鳴らす', () => {
  const { audio, log } = setup();
  audio.setLeader('B');
  assert.deepStrictEqual(log, ['play:beautiful.mp3']);
  assert.strictEqual(audio.current, 'B');
});

test('リードが変わったら止めて切り替える', () => {
  const { audio, log } = setup();
  audio.setLeader('B');
  log.length = 0;

  audio.setLeader('A');
  assert.deepStrictEqual(log, ['pause:beautiful.mp3', 'play:kawaii.mp3'],
    '前の曲を止めてから新しい曲を鳴らす');
  assert.strictEqual(audio.current, 'A');
});

test('同じチームがリードし続けている間は鳴らし直さない', () => {
  const { audio, log } = setup();
  audio.setLeader('A');
  log.length = 0;

  for (let i = 0; i < 10; i++) audio.setLeader('A');
  assert.deepStrictEqual(log, [], '板が動いても再生し直さない');
  assert.strictEqual(audio.tracks.A.plays, 1);
});

test('同点になっても今の曲を続ける', () => {
  const { audio, log } = setup();
  audio.setLeader('A');
  log.length = 0;

  audio.setLeader(null);
  assert.deepStrictEqual(log, [], '止めない');
  assert.strictEqual(audio.current, 'A');

  // 同点を挟んで元のチームがリードし直しても、鳴らし直さない
  audio.setLeader('A');
  assert.deepStrictEqual(log, []);
});

test('曲はループする', () => {
  const { audio } = setup();
  assert.strictEqual(audio.tracks.A.loop, true);
  assert.strictEqual(audio.tracks.B.loop, true);
});

test('曲が設定されていないチームがリードしても、何も鳴らさない', () => {
  const log = [];
  const audio = new AudioManager({ fadeMs: 0, createAudio: fakeAudio(log) });
  audio.setTrack('A', 'kawaii.mp3');
  log.length = 0;

  audio.setLeader('B');
  assert.deepStrictEqual(log, []);
  assert.strictEqual(audio.current, null);

  // A に戻れば鳴る
  audio.setLeader('A');
  assert.deepStrictEqual(log, ['play:kawaii.mp3']);
});

test('曲を差し替えると、鳴っている側なら即座に反映される', () => {
  const { audio, log } = setup();
  audio.setLeader('A');
  log.length = 0;

  audio.setTrack('A', 'kawaii2.mp3');
  assert.ok(log.includes('play:kawaii2.mp3'));
});

test('stop() で全部止まる', () => {
  const { audio, log } = setup();
  audio.setLeader('A');
  log.length = 0;

  audio.stop();
  assert.ok(log.some((l) => l.startsWith('pause:')));
  assert.strictEqual(audio.current, null);
});

test('ブラウザに再生を止められたら操作待ちになる', async () => {
  const audio = new AudioManager({
    fadeMs: 0,
    createAudio: () => ({
      volume: 0, currentTime: 0, loop: true,
      play() { return Promise.reject(new Error('NotAllowedError')); },
      pause() {},
    }),
  });
  audio.setTrack('A', 'kawaii.mp3');
  audio.setLeader('A');
  await new Promise((r) => setImmediate(r));

  assert.strictEqual(audio.needsGesture, true);
  assert.strictEqual(audio.current, null, '鳴っていない扱いにする');
});

// ------------------------------------------------- エンジンとの繋がり

test('engine.leadingTeam() が板の差からリードを返す', () => {
  const e = new GameEngine({});
  e.startMatch();
  assert.strictEqual(e.leadingTeam(), null, '0-0 は同点');

  e.addBoards('B', 517);
  assert.strictEqual(e.leadingTeam(), 'B');

  e.addBoards('A', 600);
  assert.strictEqual(e.leadingTeam(), 'A');

  e.addBoards('B', 83);
  assert.strictEqual(e.leadingTeam(), null, '600-600');
});

test('板が動くたびに leadingTeam を渡しても、切り替わるのはリード交代のときだけ', () => {
  const log = [];
  const audio = new AudioManager({ fadeMs: 0, createAudio: fakeAudio(log) });
  audio.setTrack('A', 'kawaii.mp3');
  audio.setTrack('B', 'beautiful.mp3');
  log.length = 0;

  const e = new GameEngine({});
  e.on('state', (s) => audio.setLeader(s.leadingTeam));
  e.startMatch();

  // ギフトを 30 回。途中でリードが 2 回入れ替わる
  for (let i = 0; i < 10; i++) e.addBoards('B', 10);   // B リード
  for (let i = 0; i < 10; i++) e.addBoards('A', 25);   // 途中で A へ交代
  for (let i = 0; i < 10; i++) e.addBoards('B', 30);   // 途中で B へ交代

  const plays = log.filter((l) => l.startsWith('play:'));
  assert.deepStrictEqual(plays, ['play:beautiful.mp3', 'play:kawaii.mp3', 'play:beautiful.mp3'],
    '30 回の加算で再生は 3 回だけ');
});
