#!/usr/bin/env node
/**
 * TikTok のギフトカタログを取得して一覧にする。
 *
 *   npm run gifts                    JP のカタログを安い順に表示
 *   npm run gifts -- US              地域を変える
 *   npm run gifts -- JP --max=10     10 ダイヤ以下だけ
 *   npm run gifts -- JP --find=rose  名前で絞り込む
 *   npm run gifts -- JP --json       config.gifts.byId に貼れる形で出す
 *   npm run gifts -- JP --dupes      名前が重複しているギフトだけ
 *
 * 取得元は Euler Stream の公開エンドポイントで、API キーは要りません。
 * ギフトは TikTok 側で増減するので、設定を見直すときに実行してください。
 *
 * なお config.gifts の表を埋めるのは「ダイヤ数と違う価値を付けたいギフト」だけで
 * 十分です。表に無いギフトはイベントに乗ってくるダイヤ数から自動換算されます。
 */
'use strict';

const REGIONS = ['US', 'GB', 'DE', 'ES', 'BE', 'FR', 'CA', 'JP', 'BR', 'MX'];
const BASE = process.env.SIGN_API_URL || 'https://tiktok.eulerstream.com';

function parseArgs(argv) {
  const opts = { region: 'JP', max: Infinity, find: null, json: false, dupes: false };
  for (const arg of argv) {
    if (arg.startsWith('--max=')) opts.max = Number(arg.slice(6));
    else if (arg.startsWith('--find=')) opts.find = arg.slice(7).toLowerCase();
    else if (arg === '--json') opts.json = true;
    else if (arg === '--dupes') opts.dupes = true;
    else if (!arg.startsWith('-')) opts.region = arg.toUpperCase();
  }
  return opts;
}

async function getJson(url, label) {
  const res = await fetch(url, { signal: AbortSignal.timeout(60_000) });
  if (!res.ok) throw new Error(`${label} の取得に失敗しました (HTTP ${res.status})`);
  return res.json();
}

async function fetchGifts(region) {
  // このエンドポイントはカタログ本体ではなく、署名付きの取得 URL を返す
  const index = await getJson(`${BASE}/webcast/gifts?region=${region}`, 'ギフト一覧');
  if (!index.url) throw new Error(`ギフト一覧の URL が返りませんでした: ${JSON.stringify(index)}`);

  const catalog = await getJson(index.url, 'ギフトカタログ');
  const seen = new Map();
  for (const gift of catalog.data.gifts) {
    if (!seen.has(gift.id)) {
      seen.set(gift.id, {
        id: gift.id,
        name: gift.name,
        diamonds: gift.diamond_count || 0,
        combo: Boolean(gift.combo)
      });
    }
  }
  return [...seen.values()].sort((a, b) => a.diamonds - b.diamonds || a.name.localeCompare(b.name));
}

function printTable(gifts) {
  console.log('  giftId  name                             diamond  連打');
  console.log('  ' + '-'.repeat(58));
  for (const g of gifts) {
    const name = g.name.replace(/\s+/g, ' ').trim();
    console.log(
      `${String(g.id).padStart(8)}  ${name.padEnd(30).slice(0, 30)} ${String(g.diamonds).padStart(8)}  ${g.combo ? '◯' : '-'}`
    );
  }
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  if (!REGIONS.includes(opts.region)) {
    console.error(`地域は次のいずれかにしてください: ${REGIONS.join(', ')}`);
    process.exitCode = 1;
    return;
  }

  const all = await fetchGifts(opts.region);

  if (opts.dupes) {
    // 同じ名前で giftId が違うギフトがある。名前で設定すると両方に当たるので、
    // 特別扱いしたいギフトは giftId で指定する必要がある。
    const byName = new Map();
    for (const g of all) {
      const key = g.name.toLowerCase();
      byName.set(key, [...(byName.get(key) || []), g]);
    }
    const dupes = [...byName.values()].filter((list) => list.length > 1);
    console.log(`${opts.region}: 名前が重複しているギフト ${dupes.length} 組`);
    console.log('(名前で設定すると全部に当たります。giftId で指定してください)\n');
    for (const list of dupes) {
      console.log(`  ${list[0].name}  ->  ${list.map((g) => `${g.id} (${g.diamonds}d)`).join(' , ')}`);
    }
    return;
  }

  let gifts = all.filter((g) => g.diamonds <= opts.max);
  if (opts.find) gifts = gifts.filter((g) => g.name.toLowerCase().includes(opts.find));

  if (opts.json) {
    console.log('// js/config.js の gifts.byId に貼れます (値はゲーム内ポイント)');
    console.log('byId: {');
    for (const g of gifts) console.log(`  '${g.id}': ${g.diamonds},   // ${g.name}`);
    console.log('}');
    return;
  }

  const buckets = { '1': 0, '2-10': 0, '11-100': 0, '101-1000': 0, '1001+': 0 };
  for (const g of all) {
    const k = g.diamonds <= 1 ? '1' : g.diamonds <= 10 ? '2-10'
            : g.diamonds <= 100 ? '11-100' : g.diamonds <= 1000 ? '101-1000' : '1001+';
    buckets[k] += 1;
  }

  console.log(`${opts.region} のギフト: ${all.length} 種`);
  console.log('ダイヤ数の分布: ' + Object.entries(buckets).map(([k, v]) => `${k}=${v}`).join('  '));
  console.log(`表示: ${gifts.length} 種\n`);
  printTable(gifts);
}

main().catch((err) => {
  console.error(err.message);
  process.exitCode = 1;
});
