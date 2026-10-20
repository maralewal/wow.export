# wow.export MCP server

This local MCP server lets a coding agent search WoW assets, import a public Armory character, export the displayed character or a model, convert a texture, and check job status. It uses the same import and export paths as the wow.export UI. Scene editing in Blender remains in the Blender add-on.

## Set up

1. Build or run this fork of wow.export and pass `--enable-mcp` to the app. Select a WoW installation or CDN source in the app.
2. In `mcp/`, run `npm ci` with Node.js 20 or newer.
3. Configure your MCP host to launch `node` with the absolute path to `mcp/server.mjs` as its argument. For example:

   ```json
   {
     "mcpServers": {
       "wow-export": {
         "command": "node",
         "args": ["C:\\path\\to\\wow.export\\mcp\\server.mjs"]
       }
     }
   }
   ```

The server finds the app's bridge file in the platform's usual `wow.export/User Data/Default` directory. If wow.export uses another data directory, set `WOW_EXPORT_BRIDGE_FILE` to the absolute path of `mcp-bridge.json` in `nw.App.dataPath`. The file is created only while the app runs with `--enable-mcp`.

## Agent workflow

1. Call `import_armory_character` with region, realm slug, and character name. The app opens the Characters tab, retrieves customization choices through its configured Character Appearance API endpoint, and reads `characterProfileInitialState` from Blizzard's public Armory page for visible transmog item IDs (including hidden appearances). It applies appearance modifiers and independent shoulder appearances. If the page is unavailable, it uses the API result and reports `armoryPageApplied: false`.
2. Poll `get_job_status` until the import succeeds. Its result lists the applied equipment and modifiers so the agent can check them before exporting.
3. Call `export_current_character` with `GLB` or `GLTF` and poll its job. The result contains the export path. Import that file with Blender's glTF importer.

`search_assets`, `export_model`, and `convert_texture` also use job status for exports. Only one MCP import or export runs at a time. The app must have a source selected; search also requires a loaded listfile. Outputs go to the export directory configured in wow.export.

The Armory character must be public and available to the configured endpoint. The default endpoint is `marlam.in/we/api.php`, already used by the app's Battle.net import button. The page's `modified_appearance_id` describes the worn item, so it is not substituted for wow.export's item appearance modifier. The MCP server needs no Blizzard credentials. If the endpoint is unavailable, wow.export's Character Appearance API setting can point to a compatible service.

The bridge binds only to `127.0.0.1`, uses a random token in the local discovery file, and is disabled unless the app starts with `--enable-mcp`. Treat the discovery file as a local credential.

## Verify

Run `npm test` in `mcp/`. It checks appearance mapping, bridge authentication, and job tracking. These tests do not require WoW assets or Blender. A full appearance and Blender export check needs a running wow.export installation and a public Armory character.
