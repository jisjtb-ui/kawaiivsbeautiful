/**
 * テスト用の足場。ブラウザ無しで engine / router / session を組み立てる。
 */
const { GameEngine } = require('../js/game.js');
const { CONFIG } = require('../js/config.js');
const { EventRouter } = require('../js/event-router.js');
const { GameSession } = require('../js/game-session.js');

/** CONFIG を壊さないように毎回コピーしてから上書きする。 */
function makeConfig(overrides = {}) {
  const clone = JSON.parse(JSON.stringify(CONFIG));
  for (const [key, value] of Object.entries(overrides)) {
    clone[key] = (value && typeof value === 'object' && !Array.isArray(value))
      ? Object.assign(clone[key] || {}, value)
      : value;
  }
  return clone;
}

/** 時計を手で進められるセットアップ。実時間に依存しないテストが書ける。 */
function setup(options = {}) {
  const config = makeConfig(options.config);
  let clock = options.startTime || 1_000_000;
  const now = () => clock;

  const engine = new GameEngine(Object.assign({ now }, options.engine));
  const session = new GameSession(engine, {
    config,
    now,
    random: options.random || (() => 0.1)   // 既定では必ずチーム A を引く
  });
  const router = new EventRouter({ config, now });
  router.attach('live-1', session);

  const notices = [];
  session.on('notice', (n) => notices.push(n));

  engine.startMatch();

  return {
    config, engine, session, router, notices,
    now,
    /** 時計を進めて engine / session を追随させる。 */
    advance(ms) {
      clock += ms;
      engine.update(clock);
      session.update(clock);
    },
    send(raw) { return router.dispatch('live-1', raw); }
  };
}

module.exports = { setup, makeConfig };
