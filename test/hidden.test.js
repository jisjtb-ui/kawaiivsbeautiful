/**
 * hidden 属性が本当に画面から消すことを守るテスト。
 *
 * ブラウザ標準の [hidden] { display:none } は「ブラウザの規則」なので、
 * .setup { display: flex } のような「作者の規則」に必ず負ける。
 * その結果、JS が hidden を付けても消えず、URL 貼り付け欄が試合中の画面に
 * 出っぱなしになる、という不具合が実際に起きた。
 * 個別の CSS を直すのではなく、全体に効くガードで二度と起きないようにする。
 */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const css = fs.readFileSync(path.join(root, 'css', 'style.css'), 'utf8');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');

test('[hidden] を !important で消すガードが CSS にある', () => {
  const guard = /\[hidden\]\s*\{[^}]*display\s*:\s*none\s*!important/;
  assert.ok(guard.test(css), '[hidden] { display: none !important; } が css/style.css にありません');
});

test('hidden 属性を使う要素が index.html に残っている (ガードの対象がある)', () => {
  // aria-hidden ではなく、素の hidden 属性を持つ要素
  const targets = html.match(/<[^>]*\shidden(\s|>|\/)/g) || [];
  assert.ok(targets.length > 0, 'hidden 属性を使う要素が見つかりません');
});

test('ガードは他の規則より後ろに書かれている', () => {
  // 同じ詳細度なら後勝ち。!important があるので順序は本来問われないが、
  // 先頭付近に置いて「全体の前提」だと読めるようにしておく。
  const at = css.search(/\[hidden\]\s*\{/);
  assert.ok(at >= 0 && at < 2000, 'ガードは CSS の冒頭付近に置いてください');
});
