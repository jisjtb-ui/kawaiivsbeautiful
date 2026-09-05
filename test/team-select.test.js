const test = require('node:test');
const assert = require('node:assert');
const { setup } = require('./helpers.js');

/** 実配信の COMMENT イベントと同じ形。 */
function comment(user, text) {
  return { type: 'chat', user: user, text: text };
}
const TARO   = { id: '7543090864705487880', uniqueId: 'Taro',   nickname: 'タロー' };
const HANAKO = { id: '7543090864705487881', uniqueId: 'Hanako', nickname: 'はなこ' };

// ------------------------------------------------------------ 判定

test('合言葉の完全一致だけをチーム選択として扱う', () => {
  const t = setup();
  t.send(comment(TARO, 'kawaii'));
  t.send(comment(HANAKO, 'beautiful'));
  assert.strictEqual(t.session.teamOf(TARO), 'A');
  assert.strictEqual(t.session.teamOf(HANAKO), 'B');
});

test('大文字小文字は区別しない / 前後の空白は許容する', () => {
  for (const [text, team] of [
    ['kawaii', 'A'], ['KAWAII', 'A'], ['Kawaii', 'A'], ['  kawaii  ', 'A'],
    ['beautiful', 'B'], ['BEAUTIFUL', 'B'], ['Beautiful', 'B'],
  ]) {
    const t = setup();
    t.send(comment(TARO, text));
    assert.strictEqual(t.session.teamOf(TARO), team, `"${text}" -> ${team}`);
  }
});

test('完全一致のみ。合言葉を含む文章は判定しない', () => {
  for (const text of ['kawaii最高', 'I love kawaii', 'beautiful team', 'kawaii!', 'kawaiii']) {
    const t = setup();
    t.send(comment(TARO, text));
    assert.strictEqual(t.session.teamOf(TARO), null, `"${text}" は無視`);
  }
});

test('別名を設定すれば増やせる (既定は空)', () => {
  const t = setup({ config: { theme: { teamA: { aliases: ['a', 'かわいい'] } } } });
  t.send(comment(TARO, 'かわいい'));
  assert.strictEqual(t.session.teamOf(TARO), 'A');
});

test('通常のコメントは無視する', () => {
  const t = setup();
  for (const text of ['こんにちは', 'かわいい', '頑張れ']) t.send(comment(TARO, text));
  assert.strictEqual(t.session.teamOf(TARO), null);
  assert.strictEqual(t.notices.length, 0, '通知も出さない');
});

// -------------------------------------------------------- ユーザー管理

test('userId / uniqueId / displayName / team を保持する', () => {
  const t = setup();
  t.send(comment(TARO, 'kawaii'));
  assert.deepStrictEqual(t.session.getMember(TARO), {
    userId: '7543090864705487880',
    uniqueId: 'Taro',
    displayName: 'タロー',
    team: 'A'
  });
});

test('userId をキーにして team を引ける', () => {
  const t = setup();
  t.send(comment(TARO, 'kawaii'));
  // 将来 GIFT / LIKE / FOLLOW を同じ userId で紐付けるための参照
  assert.strictEqual(t.session.members['7543090864705487880'].team, 'A');
  assert.strictEqual(t.session.teamOf('7543090864705487880'), 'A');
  assert.strictEqual(t.session.teamOf('Taro'), 'A', '@名前からも引ける');
});

test('userId が取れないイベントは uniqueId で代用する', () => {
  const t = setup();
  t.send(comment({ uniqueId: 'noid' }, 'kawaii'));
  assert.strictEqual(t.session.teamOf('noid'), 'A');
  assert.strictEqual(t.session.getMember('noid').userId, null);
});

test('ユーザー名が変わっても userId が同じなら同じ所属のまま', () => {
  const t = setup();
  t.send(comment(TARO, 'kawaii'));
  t.send(comment({ id: TARO.id, uniqueId: 'Taro2', nickname: '改名' }, 'beautiful'));
  assert.strictEqual(t.session.teamOf(TARO.id), 'A', 'B へは移らない');
  assert.strictEqual(Object.keys(t.session.members).length, 1, '重複登録もしない');
});

test('一度所属したらそのラウンド中は変更できない', () => {
  const t = setup();
  t.send(comment(TARO, 'kawaii'));
  t.send(comment(TARO, 'beautiful'));
  t.send(comment(TARO, 'beautiful'));
  assert.strictEqual(t.session.teamOf(TARO), 'A');
  assert.strictEqual(t.session.stats.joins, 1, '登録は 1 回だけ');
});

test('重複登録しない', () => {
  const t = setup();
  for (let i = 0; i < 5; i++) t.send(comment(TARO, 'kawaii'));
  assert.strictEqual(Object.keys(t.session.members).length, 1);
  assert.strictEqual(t.session.stats.joins, 1);
});

// ------------------------------------------------------------ 画面通知

test('振り分け成功時に "@username → KAWAII" の通知を出す', () => {
  const t = setup();
  t.send(comment(TARO, 'kawaii'));

  const notice = t.notices.at(-1);
  assert.strictEqual(notice.kind, 'team');
  assert.strictEqual(notice.user, 'Taro');
  assert.strictEqual(notice.effect, 'KAWAII', '画面には表示名を出す');
  assert.strictEqual(notice.team, 'A', '内部では ID');
});

test('B は "BEAUTIFUL" の通知になる', () => {
  const t = setup();
  t.send(comment(HANAKO, 'beautiful'));
  assert.strictEqual(t.notices.at(-1).effect, 'BEAUTIFUL');
});

test('通知に userId などの内部情報を含めない', () => {
  const t = setup();
  t.send(comment(TARO, 'kawaii'));

  const notice = t.notices.at(-1);
  assert.ok(!('userId' in notice) && !('member' in notice) && !('displayName' in notice));
  assert.ok(!JSON.stringify(notice).includes('7543090864705487880'), 'userId が漏れていない');
});

test('所属済みユーザーが再コメントしても通知は出さない', () => {
  const t = setup();
  t.send(comment(TARO, 'kawaii'));
  const after = t.notices.length;

  t.send(comment(TARO, 'beautiful'));
  t.send(comment(TARO, 'kawaii'));
  assert.strictEqual(t.notices.length, after, '所属は変わらないので画面も変わらない');
});

test('テーマを差し替えれば表示名も合言葉も変わる (ロジックは無変更)', () => {
  const t = setup({ config: { theme: {
    teamA: { displayName: 'MRBEAST', keyword: 'mrbeast' },
    teamB: { displayName: 'ISHOWSPEED', keyword: 'ishowspeed' }
  } } });

  t.send(comment(TARO, 'mrbeast'));
  assert.strictEqual(t.session.teamOf(TARO), 'A', 'ID は A のまま');
  assert.strictEqual(t.notices.at(-1).effect, 'MRBEAST');

  t.send(comment(HANAKO, 'ishowspeed'));
  assert.strictEqual(t.session.teamOf(HANAKO), 'B');
  assert.strictEqual(t.notices.at(-1).effect, 'ISHOWSPEED');

  // 前のテーマの合言葉はもう効かない
  const other = setup({ config: { theme: { teamA: { keyword: 'mrbeast' } } } });
  other.send(comment(TARO, 'kawaii'));
  assert.strictEqual(other.session.teamOf(TARO), null);
});

// --------------------------------------------------------- 開発用ログ

test('team:select で開発ログに必要な情報が流れる', () => {
  const t = setup();
  const seen = [];
  t.session.on('team:select', (d) => seen.push(d));

  t.send(comment(TARO, 'kawaii'));
  t.send(comment(TARO, 'beautiful'));

  // 内部 ID と表示名の両方が取れること (ログは "→ A / KAWAII" の形にする)
  assert.deepStrictEqual(
    seen.map((d) => [d.member.uniqueId, d.text, d.member.team, t.session.teamLabel(d.member.team), d.joined]),
    [['Taro', 'kawaii', 'A', 'KAWAII', true], ['Taro', 'beautiful', 'A', 'KAWAII', false]]
  );
});

test('通常のコメントでは team:select が流れない (ログを汚さない)', () => {
  const t = setup();
  const seen = [];
  t.session.on('team:select', (d) => seen.push(d));
  t.send(comment(TARO, 'こんにちは'));
  assert.strictEqual(seen.length, 0);
});

// --------------------------------------------- 将来のイベントとの紐付け

test('所属済みユーザーの GIFT は所属チームへ入る', () => {
  const t = setup({ random: () => 0.9 });        // ランダムなら B になる条件
  t.send(comment(TARO, 'kawaii'));
  t.send({ type: 'gift', user: TARO, giftId: 5658, diamondCount: 20 });
  assert.strictEqual(t.engine.getState().boards.A, 20, 'ランダムではなく所属先へ');
});

test('所属済みユーザーの LIKE も所属チームへ入る', () => {
  const t = setup({ random: () => 0.9 });
  t.send(comment(TARO, 'beautiful'));
  t.send({ type: 'like', user: TARO, count: 100 });
  assert.strictEqual(t.engine.getState().boards.B, 1);
});

test('ラウンドをまたいでも所属は変わらず、別チームの合言葉も効かない', () => {
  const t = setup();
  t.send(comment(TARO, 'kawaii'));

  t.engine.startRound();                       // Round 2
  assert.strictEqual(t.session.teamOf(TARO), 'A');

  t.send(comment(TARO, 'beautiful'));          // 別チームの合言葉
  assert.strictEqual(t.session.teamOf(TARO), 'A', 'B には変わらない');

  t.engine.startRound();                       // Round 3
  assert.strictEqual(t.session.teamOf(TARO), 'A');
});

test('endSession() のあとは、もう一度どちらでも選べる', () => {
  const t = setup();
  t.send(comment(TARO, 'kawaii'));
  t.session.endSession();

  t.send(comment(TARO, 'beautiful'));
  assert.strictEqual(t.session.teamOf(TARO), 'B', '次の LIVE では選び直せる');
});


// ------------------------------------------------- 何度でもやり直せること

test('やり直しても同じユーザーがもう一度チームを選べる', () => {
  const t = setup();

  // 1 回目
  t.send(comment(TARO, 'kawaii'));
  t.engine.addBoards('A', 500, { source: 'setup' });
  assert.strictEqual(t.session.teamOf(TARO), 'A');

  // やり直し (画面の RESET ALL と同じ操作)
  t.session.endSession();
  t.engine.resetMatch();

  assert.strictEqual(t.session.teamOf(TARO), null, '所属が消える');
  assert.deepStrictEqual(t.engine.getState().boards, { A: 0, B: 0 });
  assert.deepStrictEqual(t.engine.getState().score, { A: 0, B: 0 });

  // 2 回目。今度は逆のチームを選べる
  t.send(comment(TARO, 'beautiful'));
  assert.strictEqual(t.session.teamOf(TARO), 'B');
});

test('やり直しを何度繰り返しても状態が残らない', () => {
  const t = setup();
  for (let i = 0; i < 5; i++) {
    t.send(comment(TARO, i % 2 === 0 ? 'kawaii' : 'beautiful'));
    t.send({ type: 'like', user: TARO, count: 250 });
    t.send({ type: 'follow', user: TARO });

    t.session.endSession();
    t.engine.resetMatch();

    assert.deepStrictEqual(t.session.members, {}, `${i + 1} 回目`);
    assert.deepStrictEqual(t.session.likeBuckets, {});
    assert.strictEqual(t.session.getFever().active, false);
    assert.deepStrictEqual(t.engine.getState().boards, { A: 0, B: 0 });
  }
});


// -------------------------------------- 表示名 1 行でテーマが変わること

test('displayName だけ変えれば、合言葉も自動で変わる', () => {
  // keyword を書かない。config の既定と同じ状態。
  const t = setup({ config: { theme: {
    teamA: { displayName: 'MRBEAST', keyword: null },
    teamB: { displayName: 'ISHOWSPEED', keyword: null }
  } } });

  t.send(comment(TARO, 'mrbeast'));
  assert.strictEqual(t.session.teamOf(TARO), 'A', '表示名の小文字が合言葉になる');
  assert.strictEqual(t.notices.at(-1).effect, 'MRBEAST');

  t.send(comment(HANAKO, 'ISHOWSPEED'));
  assert.strictEqual(t.session.teamOf(HANAKO), 'B', '大文字小文字は問わない');

  // 前のテーマの合言葉は効かない
  const other = setup({ config: { theme: { teamA: { displayName: 'MRBEAST', keyword: null } } } });
  other.send(comment(TARO, 'kawaii'));
  assert.strictEqual(other.session.teamOf(TARO), null);
});

test('既定のテーマでも合言葉は表示名から導かれている', () => {
  const t = setup();
  assert.strictEqual(t.session.teamKeyword(t.session.theme.teamA), 'kawaii');
  assert.strictEqual(t.session.teamKeyword(t.session.theme.teamB), 'beautiful');
});

test('表示名と違う合言葉にしたいときは keyword で上書きできる', () => {
  const t = setup({ config: { theme: {
    teamA: { displayName: '大会Aチーム', keyword: 'a-team' }
  } } });

  t.send(comment(TARO, 'a-team'));
  assert.strictEqual(t.session.teamOf(TARO), 'A');
  assert.strictEqual(t.notices.at(-1).effect, '大会Aチーム');
});
