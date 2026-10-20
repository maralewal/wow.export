import fs from 'node:fs/promises';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';

export function defaultDiscoveryPath() {
  if (process.env.WOW_EXPORT_BRIDGE_FILE)
    return process.env.WOW_EXPORT_BRIDGE_FILE;
  if (process.platform === 'win32')
    return path.join(process.env.LOCALAPPDATA ?? path.join(os.homedir(), 'AppData', 'Local'), 'wow.export', 'User Data', 'Default', 'mcp-bridge.json');
  if (process.platform === 'darwin')
    return path.join(os.homedir(), 'Library', 'Application Support', 'wow.export', 'User Data', 'Default', 'mcp-bridge.json');
  return path.join(os.homedir(), '.config', 'wow.export', 'User Data', 'Default', 'mcp-bridge.json');
}

export async function callBridge(method, params = {}, discoveryPath = defaultDiscoveryPath()) {
  let info;
  try {
    info = JSON.parse(await fs.readFile(discoveryPath, 'utf8'));
  } catch {
    throw new Error(`Could not find wow.export MCP bridge at ${discoveryPath}. Start wow.export with --enable-mcp.`);
  }
  if (!Number.isInteger(info.port) || info.port < 1 || info.port > 65535 || !/^[0-9a-f]{64}$/.test(info.token))
    throw new Error('Invalid wow.export MCP bridge discovery file.');

  return new Promise((resolve, reject) => {
    const socket = net.createConnection({ host: '127.0.0.1', port: info.port });
    let response = '';
    let settled = false;
    const finish = (error, result) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      if (error) reject(error);
      else resolve(result);
    };
    socket.setTimeout(30000, () => finish(new Error('wow.export MCP bridge timed out.')));
    socket.on('error', error => finish(new Error(`Could not connect to wow.export MCP bridge: ${error.message}`)));
    socket.on('connect', () => socket.write(JSON.stringify({ token: info.token, method, params }) + '\n'));
    socket.on('data', chunk => {
      response += chunk.toString('utf8');
      if (Buffer.byteLength(response) > 4 * 1024 * 1024)
        return finish(new Error('wow.export MCP response was too large.'));
      const end = response.indexOf('\n');
      if (end < 0) return;
      try {
        const packet = JSON.parse(response.slice(0, end));
        if (!packet.ok) finish(new Error(packet.error ?? 'wow.export MCP bridge error.'));
        else finish(null, packet.result);
      } catch (error) {
        finish(error);
      }
    });
    socket.on('end', () => finish(new Error('wow.export MCP bridge closed without a response.')));
  });
}
