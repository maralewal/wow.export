import { McpServer } from '@modelcontextprotocol/server';
import { serveStdio } from '@modelcontextprotocol/server/stdio';
import * as z from 'zod/v4';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { callBridge } from './client.mjs';

const modelFormat = z.enum(['OBJ', 'GLTF', 'GLB', 'STL']);

export function createServer() {
  const server = new McpServer({ name: 'wow-export', version: '0.1.0' });
  const register = (name, description, inputSchema) => {
    server.registerTool(name, { description, inputSchema }, async params => {
      try {
        const result = await callBridge(name, params);
        return { content: [{ type: 'text', text: JSON.stringify(result) }] };
      } catch (error) {
        return { content: [{ type: 'text', text: error.message }], isError: true };
      }
    });
  };

  register('search_assets', 'Search the loaded WoW listfile by filename. Returns fileDataIDs for export.', z.object({
    query: z.string().min(3).max(200),
    type: z.enum(['any', 'model', 'texture']),
    limit: z.number().int().min(1).max(50)
  }));
  register('import_armory_character', 'Load a public Battle.net Armory character and its visible equipment appearance into the wow.export Characters tab. Returns a jobId; poll get_job_status before export_current_character. Realm must be a slug, such as argent-dawn.', z.object({
    region: z.enum(['us', 'eu', 'kr', 'tw', 'classic-us', 'classic-eu', 'classic-kr', 'classic-tw']),
    realm: z.string().min(1).max(80),
    name: z.string().min(2).max(24)
  }));
  register('export_current_character', 'Export the character currently loaded in wow.export, including its current appearance and equipment. For Blender use GLB or GLTF. Returns a jobId; poll get_job_status.', z.object({
    format: modelFormat
  }));
  register('export_model', 'Export a model fileDataID from the loaded WoW installation. Returns a jobId; poll get_job_status.', z.object({
    fileDataID: z.number().int().positive(),
    format: modelFormat
  }));
  register('convert_texture', 'Convert a WoW texture fileDataID to PNG, WEBP, or raw BLP. Returns a jobId; poll get_job_status.', z.object({
    fileDataID: z.number().int().positive(),
    format: z.enum(['PNG', 'WEBP', 'BLP'])
  }));
  register('get_job_status', 'Read status and result of an MCP import or export job. Poll until succeeded or failed.', z.object({
    jobId: z.string().uuid()
  }));
  return server;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href)
  void serveStdio(createServer);
