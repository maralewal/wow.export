import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import os from 'node:os';
import path from 'node:path';
import readline from 'node:readline';
import { test } from 'node:test';

test('stdio MCP advertises tools and returns a useful error when the app is closed', async () => {
  const child = spawn(process.execPath, [path.join(import.meta.dirname, 'server.mjs')], {
    env: { ...process.env, WOW_EXPORT_BRIDGE_FILE: path.join(os.tmpdir(), randomUUID() + '.json') },
    stdio: ['pipe', 'pipe', 'pipe']
  });
  const lines = readline.createInterface({ input: child.stdout });
  const messages = [];
  let wake;
  lines.on('line', line => { messages.push(JSON.parse(line)); wake?.(); });
  const send = (id, method, params) => child.stdin.write(JSON.stringify({ jsonrpc: '2.0', ...(id === null ? {} : { id }), method, params }) + '\n');
  const response = async id => {
    for (let attempt = 0; attempt < 100; attempt++) {
      const found = messages.find(message => message.id === id);
      if (found) return found;
      await new Promise((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error(`Timed out waiting for MCP response ${id}`)), 5000);
        wake = () => { clearTimeout(timeout); resolve(); };
      });
      wake = null;
    }
    throw new Error(`Missing MCP response ${id}`);
  };
  try {
    send(1, 'initialize', { protocolVersion: '2025-11-25', capabilities: {}, clientInfo: { name: 'test', version: '1.0' } });
    assert.equal((await response(1)).result.serverInfo.name, 'wow-export');
    send(null, 'notifications/initialized', {});
    send(2, 'tools/list', {});
    const tools = (await response(2)).result.tools;
    assert.ok(tools.some(tool => tool.name === 'import_armory_character'));
    send(3, 'tools/call', { name: 'search_assets', arguments: { query: 'sword', type: 'model', limit: 5 } });
    const missingApp = (await response(3)).result;
    assert.equal(missingApp.isError, true);
    assert.match(missingApp.content[0].text, /Start wow.export with --enable-mcp/);
  } finally {
    child.kill();
    lines.close();
  }
});
