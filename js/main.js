/**
 * main.js - 起動と 1 本のループ。
 *
 * 組み立ての向きは一方向です:
 *
 *   TikTokAdapter -> EventRouter -> GameSession -> GameEngine -> Renderer
 *
 * GameEngine は TikTok を知らず、GameSession も TikTok を知りません
 * (知っているのは TikTokAdapter と EventRouter だけ)。
 *
 * LIVE を増やすときは、LIVE ごとに engine + session を 1 組作って
 * router.attach(liveId, session) するだけで並走させられます。
 */
(function (global) {
  'use strict';

  var LIVE_ID = 'live-1';

  document.addEventListener('DOMContentLoaded', function () {
    var KVB = global.KVB;
    var config = KVB.CONFIG;

    // --- ゲームのルール (TikTok を知らない)
    var engine = new KVB.GameEngine({
      // maxBoards を指定していないので、タワーの上限は targetBoards と同じ 1000 枚。
      // 超過を貯められると、剥がされてもカウントダウンが解除されなくなるため。
      targetBoards: 1000,
      holdSeconds: 10,
      roundsToWinMatch: 10,
      nextRoundDelayMs: 4000,
      autoStartNextRound: true
    });

    // --- 1 LIVE = 1 セッション。チーム所属 / LIKE 累積 / FEVER を持つ。
    var session = new KVB.GameSession(engine, { config: config, liveId: LIVE_ID });

    // --- TikTok イベント -> ゲームイベント の翻訳と振り分け
    var router = new KVB.EventRouter({ config: config });
    router.attach(LIVE_ID, session);

    // --- 画面
    var renderer = new KVB.Renderer(engine, { notice: config.notice });
    var controls = new KVB.Controls(engine, { session: session, router: router, liveId: LIVE_ID });
    var tiktok = new KVB.TikTokAdapter(router, { liveId: LIVE_ID });

    // セッションが出す「重要イベントの一時通知」だけを画面へ渡す。
    // Renderer はセッションの中身を知らず、通知を受け取って描くだけ。
    session.on('notice', function (notice) { renderer.showNotice(notice); });

    // 開発確認用のログ。ブラウザのコンソールにだけ出し、ゲーム画面には出さない。
    // 内部 ID と表示名の両方を出すので、テーマを差し替えても対応が追える。
    //
    //   [COMMENT] @Taro: kawaii
    //   [TEAM] @Taro → A / KAWAII
    //   [TEAM] @Taro → ALREADY A / KAWAII   (所属済みでチームが変わらなかった)
    session.on('team:select', function (data) {
      var name = '@' + data.member.uniqueId;
      var team = data.member.team + ' / ' + session.teamLabel(data.member.team);
      console.log('[COMMENT] ' + name + ': ' + data.text);
      console.log('[TEAM] ' + name + ' \u2192 ' + (data.joined ? team : 'ALREADY ' + team));
    });

    // コンソール / OBS スクリプト / 将来の TikTok 接続から触れるように公開する
    global.KVB.engine = engine;
    global.KVB.session = session;
    global.KVB.router = router;
    global.KVB.renderer = renderer;
    global.KVB.controls = controls;
    global.KVB.tiktok = tiktok;
    global.KVB.LIVE_ID = LIVE_ID;

    // 何度でも試せるように、全部やり直す入口をひとつ用意しておく。
    // 画面の RESET MATCH ボタン / M キーと同じ動きで、チーム所属も消える。
    global.KVB.reset = function () { return controls.resetAll(); };

    // 全部を 1 本の時計で回す
    function loop() {
      engine.update();
      session.update();
      renderer.renderCountdown(engine.countdown, engine.config.holdSeconds);
      renderer.renderFever(session.getFever());
      global.requestAnimationFrame(loop);
    }
    global.requestAnimationFrame(loop);

    engine.startMatch();

    // --- TikTok への接続
    //
    // 中継サーバー (tikhub) へ自動でつなぎます。コンソールを開いて
    // コマンドを打つ必要はありません。接続先は URL から決まります:
    //
    //   http://127.0.0.1:8787/         tikhub がゲームごと配信している -> 同じ場所へ
    //   index.html を直接開いた場合     -> http://127.0.0.1:8787/events
    //   ?bridge=http://... を付けた場合 -> その URL へ
    //
    // ?offline=1 を付けると接続しません (完全オフラインで動かしたいとき)。
    var params = new URLSearchParams(global.location.search);
    tiktok.onStatus(function (status) { renderer.setLink(status); });

    if (params.get('offline') === '1' || params.has('offline')) {
      renderer.setLink('connected');          // 出さない
      console.info('[KVB] オフラインモードです (TikTok へ接続しません)');
    } else {
      renderer.setLink('disconnected');
      void tiktok.connect();
    }
  });
})(window);
