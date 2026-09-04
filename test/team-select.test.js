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

test('"A" / "B" の完全一致だけをチーム選択として扱う', () => {
  const t = setup();
  t.send(comment(TARO, 'A'));
  t.send(comment(HANAKO, 'B'));
  assert.strictEqual(t.session.teamOf(TARO), 'kawaii');
  assert.strictEqual(t.session.teamOf(HANAKO), 'beautiful');
});

test('小文字・全角・前後の空白も拾う', () => {
  for (const [text, team] of [['a', 'kawaii'], ['Ａ', 'kawaii'], ['  b  ', 'beautiful'], ['Ｂ', 'beautiful']]) {
    const t = setup();
    t.send(comment(TARO, text));
    assert.strictEqual(t.session.teamOf(TARO), team, `"${text}" -> ${team}`);
  }
});

test('文章は判定対象外 (MVP)', () => {
  for (const text of ['Aでいく', 'Bチーム', '私はA', 'A!', 'AA']) {
    const t = setup();
    t.send(comment(TARO, text));
    assert.strictEqual(t.session.teamOf(TARO), null, `"${text}" は無視`);
  }
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
  t.send(comment(TARO, 'A'));
  assert.deepStrictEqual(t.session.getMember(TARO), {
    userId: '7543090864705487880',
    uniqueId: 'Taro',
    displayName: 'タロー',
    team: 'kawaii'
  });
});

test('userId をキーにして team を引ける', () => {
  const t = setup();
  t.send(comment(TARO, 'A'));
  // 将来 GIFT / LIKE / FOLLOW を同じ userId で紐付けるための参照
  assert.strictEqual(t.session.members['7543090864705487880'].team, 'kawaii');
  assert.strictEqual(t.session.teamOf('7543090864705487880'), 'kawaii');
  assert.strictEqual(t.session.teamOf('Taro'), 'kawaii', '@名前からも引ける');
});

test('userId が取れないイベントは uniqueId で代用する', () => {
  const t = setup();
  t.send(comment({ uniqueId: 'noid' }, 'A'));
  assert.strictEqual(t.session.teamOf('noid'), 'kawaii');
  assert.strictEqual(t.session.getMember('noid').userId, null);
});

test('ユーザー名が変わっても userId が同じなら同じ所属のまま', () => {
  const t = setup();
  t.send(comment(TARO, 'A'));
  t.send(comment({ id: TARO.id, uniqueId: 'Taro2', nickname: '改名' }, 'B'));
  assert.strictEqual(t.session.teamOf(TARO.id), 'kawaii', 'B へは移らない');
  assert.strictEqual(Object.keys(t.session.members).length, 1, '重複登録もしない');
});

test('一度所属したらそのラウンド中は変更できない', () => {
  const t = setup();
  t.send(comment(TARO, 'A'));
  t.send(comment(TARO, 'B'));
  t.send(comment(TARO, 'B'));
  assert.strictEqual(t.session.teamOf(TARO), 'kawaii');
  assert.strictEqual(t.session.stats.joins, 1, '登録は 1 回だけ');
});

test('重複登録しない', () => {
  const t = setup();
  for (let i = 0; i < 5; i++) t.send(comment(TARO, 'A'));
  assert.strictEqual(Object.keys(t.session.members).length, 1);
  assert.strictEqual(t.session.stats.joins, 1);
});

// ------------------------------------------------------------ 画面通知

test('振り分け成功時に "@username → A TEAM" の通知を出す', () => {
  const t = setup();
  t.send(comment(TARO, 'A'));

  const notice = t.notices.at(-1);
  assert.strictEqual(notice.kind, 'team');
  assert.strictEqual(notice.user, 'Taro');
  assert.strictEqual(notice.effect, 'A TEAM');
  assert.strictEqual(notice.team, 'kawaii');
});

test('B は "B TEAM" の通知になる', () => {
  const t = setup();
  t.send(comment(HANAKO, 'B'));
  assert.strictEqual(t.notices.at(-1).effect, 'B TEAM');
});

test('通知に userId などの内部情報を含めない', () => {
  const t = setup();
  t.send(comment(TARO, 'A'));

  const notice = t.notices.at(-1);
  assert.ok(!('userId' in notice) && !('member' in notice) && !('displayName' in notice));
  assert.ok(!JSON.stringify(notice).includes('7543090864705487880'), 'userId が漏れていない');
});

test('所属済みユーザーが再コメントしても通知は出さない', () => {
  const t = setup();
  t.send(comment(TARO, 'A'));
  const after = t.notices.length;

  t.send(comment(TARO, 'B'));
  t.send(comment(TARO, 'A'));
  assert.strictEqual(t.notices.length, after, '所属は変わらないので画面も変わらない');
});

test('表示名は設定で変えられる', () => {
  const t = setup({ config: { teams: { labelA: 'KAWAII', labelB: 'BEAUTIFUL' } } });
  t.send(comment(TARO, 'A'));
  assert.strictEqual(t.notices.at(-1).effect, 'KAWAII');
});

// --------------------------------------------------------- 開発用ログ

test('team:select で開発ログに必要な情報が流れる', () => {
  const t = setup();
  const seen = [];
  t.session.on('team:select', (d) => seen.push(d));

  t.send(comment(TARO, 'A'));
  t.send(comment(TARO, 'B'));

  assert.deepStrictEqual(
    seen.map((d) => [d.member.uniqueId, d.text, t.session.teamLetter(d.member.team), d.joined]),
    [['Taro', 'A', 'A', true], ['Taro', 'B', 'A', false]]
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
  t.send(comment(TARO, 'A'));
  t.send({ type: 'gift', user: TARO, giftId: 5658, diamondCount: 20 });
  assert.strictEqual(t.engine.getState().boards.kawaii, 20, 'ランダムではなく所属先へ');
});

test('所属済みユーザーの LIKE も所属チームへ入る', () => {
  const t = setup({ random: () => 0.9 });
  t.send(comment(TARO, 'B'));
  t.send({ type: 'like', user: TARO, count: 100 });
  assert.strictEqual(t.engine.getState().boards.beautiful, 1);
});

test('ラウンドが変わると所属はリセットされる', () => {
  const t = setup();
  t.send(comment(TARO, 'A'));
  t.engine.startRound();
  assert.strictEqual(t.session.teamOf(TARO), null);
  assert.deepStrictEqual(t.session.members, {});
  assert.deepStrictEqual(t.session.membersByUniqueId, {});
});
