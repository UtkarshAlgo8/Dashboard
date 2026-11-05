import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { liveRunningSkusQuery, LIVE_RUNNING_SKU_TABLES } from './live-running-skus.js';

test('snapshot SQL uses Athena functions and schema-qualified Silver sources only', () => {
  const sql = liveRunningSkusQuery();
  assert.equal(LIVE_RUNNING_SKU_TABLES.length, 7);
  for (const table of LIVE_RUNNING_SKU_TABLES) {
    assert.ok(table.startsWith('silver.'));
    assert.ok(sql.includes(table), `Missing source ${table}`);
  }
  assert.match(sql, /current_timestamp AT TIME ZONE 'Asia\/Kolkata'/);
  assert.match(sql, /CAST\(format_datetime\(current_timestamp/);
  assert.match(sql, /CAST\(p\.event_time AS timestamp\)/);
  assert.match(sql, /INTERVAL '168' HOUR/);
  assert.match(sql, /to_unixtime\(/);
  assert.match(sql, /regexp_like\(/);
  assert.doesNotMatch(sql, /databricks|\bbronze\.|\b(?:timezone|epoch|strftime|regexp_matches)\(/i);
  assert.doesNotMatch(sql, /\b(?:FROM|JOIN)\s+(?:fct_|dim_)/i);
});

test('Gold handoff exports the canonical read-only Athena query without environment configuration', () => {
  const result = spawnSync(process.execPath, [
    fileURLToPath(new URL('../../tools/live-running-sku-gold/export-query.js', import.meta.url)),
  ], { encoding: 'utf8', env: { PATH: process.env.PATH } });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout, `${liveRunningSkusQuery()};\n`);
});

// Execute the complete production query. The Python helper only adapts SQL
// dialect syntax; expected statuses and machine identities are literal fixtures.
function snapshot(overrides = {}, asOf = '2026-10-21 15:00:00') {
  const tables = {
    fct_o_production: [], fct_tbmpcr: [], fct_curingpcr: [],
    dim_wcmaster: [], dim_recipemaster: [], dim_tblitemmaster: [], dim_bom: [],
    ...overrides,
  };
  const result = spawnSync('python3', [fileURLToPath(new URL('./test-support/live-running-skus-sqlite.py', import.meta.url))], {
    input: JSON.stringify({ sql: liveRunningSkusQuery(), asOf, tables }), encoding: 'utf8',
  });
  assert.equal(result.status, 0, result.stderr);
  return JSON.parse(result.stdout);
}

const op = (machine_no, event_time, extra = {}) => ({
  source_machine: 'mm', machine_no, event_time, item_code: 'SKU', item_name: 'SKU', record_id: '1', ...extra,
});
const pcr = (wc_id, event_time, extra = {}) => ({ wc_id, recipe_id: 'r1', event_time, barcode: '1', ...extra });

test('each production family applies its own source window at the feed boundary', () => {
  const windows = [
    ['mm', 20], ['frc', 45], ['trc', 45], ['trcnew', 45], ['duplex', 45],
    ['dualex', 90], ['triplex', 45], ['quadraplex', 60], ['quintuplex', 45], ['coldfeed', 180],
    ['wbc', 60], ['wbcnew', 60], ['htbc', 120], ['ltbc', 90], ['ltbcnew', 60], ['mbc', 90],
    ['chaffer', 120], ['chafferslitter', 120], ['capstrip', 120], ['capstripnew', 120],
    ['fws', 240], ['fwsnew', 240], ['camroon', 240], ['camroonnew', 240],
    ['vipobeadwinding', 120], ['oldwell', 120], ['allwell', 120], ['beadapexnew', 120],
    ['vmibeadapex', 120], ['tbmstage1', 15],
  ];
  const beforeHead = minutes => new Date(Date.parse('2026-10-21T15:00:00Z') - minutes * 60_000).toISOString().slice(0, 19).replace('T', ' ');
  const rows = snapshot({ fct_o_production: [op('head', '2026-10-21 15:00:00'), ...windows.flatMap(([source_machine, window]) => [
    op(`${source_machine}-boundary`, beforeHead(window), { source_machine }),
    op(`${source_machine}-silent`, beforeHead(window + 1), { source_machine }),
  ])] });
  assert.equal(rows.length, 61);
  for (const [source] of windows) {
    assert.equal(rows.find(r => r.machine_id === `${source}-boundary`).machine_status, 'Running', source);
    assert.equal(rows.find(r => r.machine_id === `${source}-silent`).machine_status, 'Idle', source);
  }
});

test('freshness uses each table feed head; exact running and stale boundaries remain inclusive', () => {
  const rows = snapshot({ fct_o_production: [
    op('0201', '2026-10-21 13:30:00'),
    op('0202', '2026-10-21 13:10:00'),
    op('0203', '2026-10-21 13:09:54'),
  ] });
  assert.deepEqual(rows.map(r => [r.machine_id, r.machine_status, r.minutes_behind_feed]).sort(), [
    ['0201', 'Running', 0], ['0202', 'Running', 20], ['0203', 'Idle', 20.1],
  ]);
  const idle = rows.find(r => r.machine_id === '0203');
  assert.equal(idle.live_sku, null);
  assert.equal(idle.live_sku_description, null);
  assert.equal(idle.last_sku, 'SKU');
  assert.equal(idle.last_updated, '2026-10-21 13:09:54');
  assert.equal(idle.minutes_since_update, 110.1);
  assert.equal(idle.feed_last_event, '2026-10-21 13:30:00');
  const stale = snapshot({ fct_o_production: [op('0201', '2026-10-21 13:29:54')] });
  assert.equal(stale[0].machine_status, 'Unknown');
  assert.equal(stale[0].live_sku, null);
  assert.match(stale[0].status_reason, /Feed stale/);
});

test('roster excludes future, seven-day boundary, pseudo-machines, Reset and duplicate Stage 2', () => {
  const rows = snapshot({ fct_o_production: [
    op('0201', '2026-10-21 14:59:00'),
    op('future', '2026-10-21 15:01:00'),
    op('expired', '2026-10-14 15:00:00'),
    op('within', '2026-10-14 15:00:01'),
    op('NCMD2', '2026-10-21 15:00:00'),
    op('FWS', '2026-10-21 15:00:00', { source_machine: 'fws', item_code: 'Reset' }),
    op('BJ4', '2026-10-21 15:00:00', { source_machine: 'tbmstage2' }),
  ] });
  assert.deepEqual(rows.map(r => r.machine_id).sort(), ['0201', 'within']);
  assert.equal(rows.find(r => r.machine_id === '0201').minutes_behind_feed, 1);
});

test('TRC winders merge while Duplex stays separate; record id resolves latest SKU ties', () => {
  const rows = snapshot({ fct_o_production: [
    op('TRC_winder 1', '2026-10-21 15:00:00', { source_machine: 'trc', item_code: 'old', record_id: '9' }),
    op('TRC_winder 2', '2026-10-21 15:00:00', { source_machine: 'trc', item_code: 'new', record_id: '10' }),
    op('Duplex_winder 1', '2026-10-21 15:00:00', { source_machine: 'duplex' }),
    op('Duplex_winder 2', '2026-10-21 15:00:00', { source_machine: 'duplex' }),
  ] });
  assert.equal(rows.length, 3);
  assert.equal(rows.find(r => r.machine_id === 'TRC').live_sku, 'new');
  assert.deepEqual(rows.filter(r => r.source_machine === 'duplex').map(r => r.machine_id).sort(), ['Duplex_winder 1', 'Duplex_winder 2']);
});

test('Building and curing resolve recipes, collapse cavities and keep missing recipes Unknown', () => {
  const rows = snapshot({
    dim_wcmaster: [
      { record_id: 'b', name: 'VMI1' }, { record_id: 's', name: 'bj2stage1' },
      { record_id: 'u', name: 'unknown' }, { record_id: 'm', name: 'VMI2' },
      { record_id: 'l', name: '14801LH' }, { record_id: 'r', name: '14801RH' },
      { record_id: 'bom', name: '4401LH' },
    ],
    dim_recipemaster: [{ record_id: 'r1', description: 'TYRE-1', name: 'Tyre one' }, { record_id: 'r2', description: 'TYRE-2', name: 'Tyre two' }],
    fct_tbmpcr: [pcr('b', '2026-10-21 15:00:00'), pcr('s', '2026-10-21 15:00:00'), pcr('u', '2026-10-21 15:00:00'), pcr('m', '2026-10-21 15:00:00', { recipe_id: 'missing' })],
    fct_curingpcr: [pcr('l', '2026-10-21 15:00:00'), pcr('r', '2026-10-21 15:00:00', { recipe_id: 'r2', barcode: '2' }), pcr('bom', '2026-10-21 14:25:00')],
  });
  assert.equal(rows.length, 4);
  assert.equal(rows.find(r => r.machine_id === 'VMI1').live_sku_description, 'Tyre one');
  assert.equal(rows.find(r => r.machine_id === 'VMI2').machine_status, 'Unknown');
  assert.deepEqual(rows.filter(r => r.section === 'Curing').map(r => [r.machine_id, r.sub_section, r.live_sku, r.machine_status]).sort(), [
    ['14801', 'Trench 1', 'TYRE-2', 'Running'], ['4401', 'BOM Presses', 'TYRE-1', 'Running'],
  ]);
});

test('current item descriptions win; latest BOM revision supplies the fallback without duplicate machines', () => {
  const rows = snapshot({
    fct_o_production: [op('0201', '2026-10-21 15:00:00', { item_code: 'A\r\n' }), op('0202', '2026-10-21 15:00:00', { item_code: 'B' })],
    dim_tblitemmaster: [
      { item_code: 'A', description: 'Current A', is_current: 'true' },
      { item_code: 'A', description: 'Historic A', is_current: 'false' },
      { item_code: 'M1', description: 'Old revision', is_current: 'true' },
      { item_code: 'M2', description: 'Latest revision', is_current: '1' },
    ],
    dim_bom: [{ plcbomname: 'B', materialcode_o: 'M1', revision: '1' }, { plcbomname: 'B', materialcode_o: 'M2', revision: '2' }],
  });
  assert.deepEqual(rows.map(r => [r.machine_id, r.last_sku_description]).sort(), [['0201', 'Current A'], ['0202', 'Latest revision']]);
});

test('one stale source never overrides freshness of the other source tables', () => {
  const rows = snapshot({
    fct_o_production: [op('0201', '2026-10-21 13:00:00')],
    dim_wcmaster: [{ record_id: 'b', name: 'VMI1' }, { record_id: 'l', name: '4401LH' }],
    dim_recipemaster: [{ record_id: 'r1', description: 'TYRE', name: 'Tyre' }],
    fct_tbmpcr: [pcr('b', '2026-10-21 14:59:00')],
    fct_curingpcr: [pcr('l', '2026-10-21 13:30:00')],
  });
  assert.deepEqual(rows.map(r => [r.machine_id, r.machine_status]).sort(), [
    ['0201', 'Unknown'], ['4401', 'Running'], ['VMI1', 'Running'],
  ]);
});
