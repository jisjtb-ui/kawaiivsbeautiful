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

    // --- BGM
    //
    // ゲームロジックは音を知りません。engine が出す leadingTeam を
    // そのまま渡すだけで、いつ切り替えるかは AudioManager が決めます。
    var audio = new KVB.AudioManager({
      volume: config.audio.volume,
      fadeMs: config.audio.fadeMs,
      onNeedsGesture: function (needs) {
        var badge = document.getElementById('muted');
        if (badge) badge.hidden = !needs;
      }
    });

    [['A', config.theme.teamA], ['B', config.theme.teamB]].forEach(function (pair) {
      if (config.audio.enabled && pair[1].bgm) audio.setTrack(pair[0], pair[1].bgm);
    });

    if (config.audio.enabled) {
      engine.on('state', function (state) { audio.setLeader(state.leadingTeam); });
      // ブラウザに自動再生を止められている場合、最初の操作で鳴らし始める
      ['click', 'keydown', 'touchstart'].forEach(function (name) {
        global.addEventListener(name, function () { audio.resume(); }, { passive: true });
      });
    }
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
    global.KVB.audio = audio;
    global.KVB.reset = function () { return controls.resetAll(); };

    // --- BGM の設定欄 (テストパネル内)
    //
    // 選んだファイルはこのページを開いている間だけ有効です。配信で使うなら
    // config.theme.teamX.bgm にパスを書いておくほうが確実です。
    [['A', 'bgm-file-a', 'bgm-name-a', config.theme.teamA],
      ['B', 'bgm-file-b', 'bgm-name-b', config.theme.teamB]].forEach(function (row) {
      var team = row[0];
      var input = document.getElementById(row[1]);
      var label = document.getElementById(row[2]);
      if (label) label.textContent = row[3].displayName;
      if (!input) return;

      input.addEventListener('change', function () {
        var file = input.files && input.files[0];
        if (!file) return;
        audio.setTrack(team, URL.createObjectURL(file), file.name);
        var hint = document.getElementById('bgm-hint');
        if (hint) hint.textContent = row[3].displayName + ': ' + file.name + ' を設定しました';
      });
    });

    // 配信に乗る音と、自分が聞く音を別々に設定できるようにする。
    // 出力先を分けておくと、OBS には BGM を渡しつつ手元では小さく聞く、
    // といった使い方ができる。
    function bindVolume(id, which) {
      var el = document.getElementById(id);
      if (!el) return;
      el.value = String(Math.round(audio.outputs[which].volume * 100));
      el.addEventListener('input', function () {
        audio.setOutput(which, { volume: Number(el.value) / 100 });
      });
    }
    bindVolume('bgm-volume', 'stream');
    bindVolume('bgm-monitor-volume', 'monitor');

    // 「自分でも聞く」を入れるまで、その下の 2 つは触っても意味がない。
    // 押せない見た目にしておくと、どこから設定するのか迷わない。
    var monitorOn = document.getElementById('bgm-monitor-on');
    var monitorRows = ['bgm-monitor-volume', 'bgm-sink-monitor'];
    if (monitorOn) {
      monitorOn.addEventListener('change', function () {
        audio.setOutput('monitor', { enabled: monitorOn.checked });
        monitorRows.forEach(function (id) {
          var el = document.getElementById(id);
          if (el) el.disabled = !monitorOn.checked;
        });
      });
    }

    // 出力先の切り替えは Chrome 系だけの機能。使えないブラウザで黙って
    // 効かないより、その場に書いてあるほうが親切。
    if (typeof global.HTMLMediaElement === 'undefined'
        || typeof global.HTMLMediaElement.prototype.setSinkId !== 'function') {
      Array.prototype.forEach.call(document.querySelectorAll('.bgm__row--sink'), function (row) {
        row.hidden = true;
      });
      var sinkNote = document.getElementById('bgm-devices');
      if (sinkNote) sinkNote.hidden = true;
      var sinkHint = document.getElementById('bgm-hint');
      if (sinkHint) sinkHint.textContent = 'このブラウザは出力先を切り替えられません。Chrome か Edge をお使いください。';
    }

    ['stream', 'monitor'].forEach(function (which) {
      var sel = document.getElementById('bgm-sink-' + which);
      if (!sel) return;
      sel.addEventListener('change', function () {
        audio.setOutput(which, { sinkId: sel.value });
      });
    });

    // デバイス名は許可を得るまで空欄になるので、押されたときに読み込む
    var devicesBtn = document.getElementById('bgm-devices');
    if (devicesBtn) {
      devicesBtn.addEventListener('click', function () {
        var hint = document.getElementById('bgm-hint');
        navigator.mediaDevices.getUserMedia({ audio: true })
          .then(function (stream) {
            stream.getTracks().forEach(function (t) { t.stop(); });
            return navigator.mediaDevices.enumerateDevices();
          })
          .then(function (devices) {
            var outs = devices.filter(function (d) { return d.kind === 'audiooutput'; });
            ['stream', 'monitor'].forEach(function (which) {
              var sel = document.getElementById('bgm-sink-' + which);
              if (!sel) return;
              sel.innerHTML = '<option value="">既定のデバイス</option>';
              outs.forEach(function (d) {
                var o = document.createElement('option');
                o.value = d.deviceId;
                o.textContent = d.label || d.deviceId;
                sel.appendChild(o);
              });
            });
            if (hint) hint.textContent = outs.length + ' 個の出力先が見つかりました。1 と 2 で別のものを選ぶと音を分けられます。';
          })
          .catch(function (err) {
            if (hint) hint.textContent = '出力先を取得できませんでした: ' + err.message;
          });
      });
    }

    // 待機をやめて別の配信を指定できるようにする
    var cancel = document.getElementById('setup-cancel');
    if (cancel) {
      cancel.addEventListener('click', function () {
        var base = (tiktok.url || '').replace(/\/events$/, '');
        fetch(base + '/disconnect', { method: 'POST' }).then(function () { refresh(); });
      });
    }

    var stopBtn = document.getElementById('bgm-stop');
    if (stopBtn) stopBtn.addEventListener('click', function () { audio.stop(); });

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
    var offline = params.get('offline') === '1' || params.has('offline');

    /**
     * 画面の出し分け。見るのは 2 段階です。
     *
     *   中継サーバーに繋がっているか  … 繋がっていなければ右上に「TIKTOK 未接続」
     *   配信に繋がっているか          … 繋がっていなければ URL の貼り付け欄
     */
    function refresh() {
      if (offline) { renderer.setLink('connected'); renderer.setSetup(false); return; }

      var linked = tiktok.connected;
      renderer.setLink(linked ? 'connected' : 'disconnected');

      var live = tiktok.live || {};
      var needsTarget = linked && tiktok.control && live.status !== 'connected';

      // 'waiting' は失敗ではなく「配信の開始待ち」。始まれば自動で繋がるので、
      // エラーとは別の見せ方にして、入力欄も伏せる。
      if (live.status === 'waiting') {
        renderer.setSetup(true, live.message || '配信の開始を待っています…', false, 'waiting');
        return;
      }
      renderer.setSetup(needsTarget, live.status === 'error' || live.status === 'ended'
        ? live.message
        : '短縮 URL (vt.tiktok.com/...) や @ユーザー名 でも繋がります',
      live.status === 'error');
    }

    tiktok.onStatus(refresh);

    if (offline) {
      refresh();
      console.info('[KVB] オフラインモードです (TikTok へ接続しません)');
    } else {
      refresh();
      void tiktok.connect().then(refresh);
    }

    // 貼り付けられた URL を中継サーバーへ渡す。ゲームは TikTok を直接触らない。
    var form = document.getElementById('setup-form');
    var input = document.getElementById('setup-input');
    if (form && input) {
      form.addEventListener('submit', function (event) {
        event.preventDefault();
        var target = input.value.trim();
        if (!target) return;

        renderer.setSetupBusy(true);
        renderer.setSetup(true, '接続しています…', false);
        tiktok.connectLive(target).then(function (result) {
          renderer.setSetupBusy(false);
          var status = result && result.live && result.live.status;
          if (status === 'waiting') {
            input.value = '';
            renderer.setSetup(true, result.message || '配信の開始を待っています…', false, 'waiting');
          } else if (result && result.ok) {
            input.value = '';
            renderer.setSetup(false);
          } else {
            var why = (result && result.message)
              || (result && result.live && result.live.message)
              || '接続できませんでした';
            renderer.setSetup(true, why, true);
          }
        });
      });
    }
  });
})(window);
