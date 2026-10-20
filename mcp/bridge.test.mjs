import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import net from 'node:net';
import { test } from 'node:test';
import { createRequire } from 'node:module';
import { callBridge } from './client.mjs';

const require = createRequire(import.meta.url);
const { startBridge } = require('../src/js/mcp-bridge.js');
const { parseArmoryEquipment } = require('../src/js/armory-equipment.js');
const { extractProfileState, mergeVisibleGear } = require('../src/js/armory-profile.js');

test('Armory appearance import preserves independent shoulder transmogs', () => {
  const parsed = parseArmoryEquipment([
    { internal_slot_id: 2, id: 101, item_appearance_modifier_id: 3, secondary_id: 202, secondary_item_appearance_modifier_id: 4 },
    { internal_slot_id: 4, id: 303, item_appearance_modifier_id: 5 }
  ]);
  assert.deepEqual(parsed.equipment, { 3: 101, 5: 303, 30: 202 });
  assert.deepEqual(parsed.appearanceModifiers, { 3: 3, 5: 5, 30: 4 });
  assert.deepEqual(parseArmoryEquipment([{ internal_slot_id: 2, id: 101 }]).equipment, { 3: 101, 30: 101 });
});

test('embedded Armory state supplies visible and hidden transmog item IDs', () => {
  const embedded = { character: { gear: {
    head: { slot: { type: 'HEAD' }, id: 900, modified_appearance_id: 3000, transmog: { item: { id: 134110, name: 'Hidden Helm' } } },
    shoulder: { slot: { type: 'SHOULDER' }, id: 901, transmog: { item: { id: 117407 } } }
  } } };
  const html = `<script>var characterProfileInitialState = ${JSON.stringify(embedded)};window.other = {};</script>`;
  const parsed = extractProfileState(html);
  const source = { items: [
    { slot: { type: 'HEAD' }, internal_slot_id: 0, id: 900, item_appearance_modifier_id: 8 },
    { slot: { type: 'SHOULDER' }, internal_slot_id: 2, id: 117407, item_appearance_modifier_id: 4 }
  ] };
  const merged = mergeVisibleGear(source, parsed);
  assert.equal(merged.matchedSlots, 2);
  assert.equal(merged.changedSlots, 1);
  assert.equal(merged.appearance.items[0].id, 134110);
  assert.equal(merged.appearance.items[0].item_appearance_modifier_id, undefined);
  assert.equal(merged.appearance.items[1].item_appearance_modifier_id, 4);
});

test('bridge authenticates requests and reports import/export jobs', async () => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'wow-export-mcp-test-'));
  let resolveExport;
  const bridge = await startBridge({
    dataPath: temp,
    isReady: () => true,
    isBusy: () => false,
    search: (query, type, limit) => [{ query, type, limit }],
    exportModel: () => new Promise(resolve => { resolveExport = resolve; }),
    convertTexture: async () => ({ succeeded: [{ file: 'texture.png' }], failed: [] }),
    exportCurrentCharacter: async () => ({ succeeded: true, file: 'character.glb' }),
    importArmoryCharacter: async () => ({ name: 'Test', equipment: { 3: 101 } })
  });
  try {
    assert.deepEqual(await callBridge('search_assets', { query: 'sword', type: 'model', limit: 5 }, bridge.discoveryPath), [{ query: 'sword', type: 'model', limit: 5 }]);
    await assert.rejects(callBridge('search_assets', { query: 'a', type: 'model', limit: 5 }, bridge.discoveryPath), /query must/);
    const job = await callBridge('export_model', { fileDataID: 42, format: 'GLB' }, bridge.discoveryPath);
    assert.equal(job.status, 'running');
    await assert.rejects(callBridge('convert_texture', { fileDataID: 43, format: 'PNG' }, bridge.discoveryPath), /already running/);
    resolveExport({ succeeded: [{ file: 'model.glb' }], failed: [] });
    await new Promise(resolve => setTimeout(resolve, 0));
    const status = await callBridge('get_job_status', { jobId: job.jobId }, bridge.discoveryPath);
    assert.equal(status.status, 'succeeded');
    assert.equal(status.result.succeeded[0].file, 'model.glb');

    const unauthorized = await new Promise((resolve, reject) => {
      const socket = net.createConnection({ host: '127.0.0.1', port: bridge.port });
      let data = '';
      socket.on('connect', () => socket.write(JSON.stringify({ token: 'wrong', method: 'get_job_status', params: { jobId: job.jobId } }) + '\n'));
      socket.on('data', chunk => { data += chunk; });
      socket.on('end', () => resolve(JSON.parse(data.trim())));
      socket.on('error', reject);
    });
    assert.equal(unauthorized.ok, false);
    assert.equal(unauthorized.error, 'Unauthorized.');
  } finally {
    bridge.close();
    fs.rmdirSync(temp);
  }
});
