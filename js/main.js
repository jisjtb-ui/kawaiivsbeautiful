/**
 * main.js - boots the game and runs the clock.
 *
 * Wiring order:
 *   GameEngine (rules)  ->  Renderer (screen)  ->  Controls (test input)
 *   and an idle TikTokAdapter waiting to be connected.
 */
(function (global) {
  'use strict';

  document.addEventListener('DOMContentLoaded', function () {
    var engine = new global.KVB.GameEngine({
      targetBoards: 1000,
      holdSeconds: 10,
      roundsToWinMatch: 10,
      nextRoundDelayMs: 4000,
      autoStartNextRound: true
    });

    var renderer = new global.KVB.Renderer(engine);
    var controls = new global.KVB.Controls(engine);
    var tiktok = new global.KVB.TikTokAdapter(engine);

    // Exposed for the console, for OBS scripts and for the future TikTok feed.
    global.KVB.engine = engine;
    global.KVB.renderer = renderer;
    global.KVB.controls = controls;
    global.KVB.tiktok = tiktok;

    // One clock for everything: the engine advances, the renderer redraws.
    // The engine keeps its own Date.now() based clock, so no time is passed in.
    function loop() {
      engine.update();
      renderer.renderCountdown(engine.countdown, engine.config.holdSeconds);
      global.requestAnimationFrame(loop);
    }
    global.requestAnimationFrame(loop);

    engine.startMatch();
  });
})(window);
