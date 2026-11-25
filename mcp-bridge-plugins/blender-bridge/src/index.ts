#!/usr/bin/env node
/**
 * HSA Blender Bridge — MCP server over stdio.
 *
 * The only process in the chain that lives outside Blender. It owns the socket,
 * the tool schemas, and the byte budget; the add-on owns the scene.
 *
 * Tool descriptions carry the byte budget on purpose. A caller that does not
 * know a scene read can cost 24kB will ask for a full list and only find out
 * from the response, which is one turn too late.
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';

import { BlenderClient, BlenderError, publishConfig, resolveConfig, DEFAULT_TIMEOUT_MS } from './client.js';
import { BlenderTools, EXEC_OUTPUT_CAP } from './tools.js';
import { DEFAULT_BYTE_BUDGET, DEFAULT_PAGE_LIMIT, errorEnvelope } from './envelope.js';

const VERSION = '1.0.0';
const NAME = 'blender-hsa-bridge';
// How long the bridge keeps trying for a first connection before it starts
// serving. A Blender the IDE launched has no way to click "Start", and the
// add-on polls for the config file on its own — but that poll is in Blender,
// and Blender may not be open yet, or may need the user to enable the add-on,
// which takes as long as it takes. Six seconds is enough to cover a Blender
// that is already running and nothing else, so the bound is the startup
// complaint's, not the handshake's.
const HANDSHAKE_RETRY_MS = 6_000;
// After that, the port is polled for the life of the process. The context is
// only ever read once, so a Blender that arrives later would otherwise leave
// it empty permanently and every scene report would call it "unknown".
const CONNECTION_POLL_MS = 2_000;

const PAGE_SCHEMA = {
  offset: {
    type: 'number',
    description: `Zero-based index of the first item to return. Use meta.next_offset from the previous call to continue.`,
    default: 0,
  },
  limit: {
    type: 'number',
    description: `Maximum items to return (capped at 500). The byte budget can cut this lower.`,
    default: DEFAULT_PAGE_LIMIT,
  },
} as const;

interface ToolSpec {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  mutates?: boolean;
  run: (args: Record<string, unknown>) => Promise<unknown>;
}

function buildTools(tools: BlenderTools): ToolSpec[] {
  return [
    {
      name: 'blender_health',
      description: `Check the add-on is listening and report its protocol version and stdout cap. Costs nothing and runs no code.`,
      inputSchema: { type: 'object', properties: {} },
      run: () => tools.health(),
    },
    {
      name: 'blender_get_scene_info',
      description: `Blender version, active scene, current frame, and one page of object summaries (name, type, parent, transform, dimensions, modifier and material counts). Paged; check meta.truncated and meta.next_offset before treating it as the whole scene. Response is bounded to about ${DEFAULT_BYTE_BUDGET} bytes.`,
      inputSchema: { type: 'object', properties: { ...PAGE_SCHEMA } },
      run: (a) => tools.getSceneInfo(a.offset as number, a.limit as number),
    },
    {
      name: 'blender_list_objects',
      description: `List object summaries, optionally filtered by Blender type (MESH, CAMERA, LIGHT, EMPTY, CURVE). Paged the same way as blender_get_scene_info.`,
      inputSchema: {
        type: 'object',
        properties: {
          ...PAGE_SCHEMA,
          type: { type: 'string', description: 'Blender object type to filter by.' },
        },
      },
      run: (a) => tools.listObjects(a.offset as number, a.limit as number, a.type as string | undefined),
    },
    {
      name: 'blender_describe_object',
      description: `Full detail for one object: transform, modifiers, materials, mesh counts, children, and custom properties. Fails loudly if the object does not exist.`,
      inputSchema: {
        type: 'object',
        properties: { name: { type: 'string', description: 'Exact object name.' } },
        required: ['name'],
      },
      run: (a) => tools.describeObject(a.name as string),
    },
    {
      name: 'blender_get_selection',
      description: `Currently selected objects, the active object, and the interaction mode.`,
      inputSchema: { type: 'object', properties: {} },
      run: () => tools.getSelection(),
    },
    {
      name: 'blender_scene_diff',
      description: `What changed since the previous call in this bridge process: objects added, modified (transform, modifiers or materials), or removed. Costs what changed rather than the size of the scene, so it stays cheap on large files. The first call reports first_call: true and establishes the baseline.`,
      inputSchema: { type: 'object', properties: { ...PAGE_SCHEMA } },
      run: (a) => tools.sceneDiff(a.offset as number, a.limit as number),
    },
    {
      name: 'blender_execute_python',
      description: `Run arbitrary Python inside Blender with bpy in scope. Assign to _result to return a value. stdout is capped at the source and reported with stdout_truncated and stdout_bytes_dropped. Prefer the named tools for reads: they are cheaper and their output is structured.`,
      inputSchema: {
        type: 'object',
        properties: {
          code: { type: 'string', description: 'Python source to run.' },
          stdout_cap_bytes: { type: 'number', description: 'Lower the stdout cap for this call.', default: EXEC_OUTPUT_CAP },
        },
        required: ['code'],
      },
      mutates: true,
      run: (a) => tools.executePython(a.code as string, (a.stdout_cap_bytes as number) ?? EXEC_OUTPUT_CAP),
    },
    {
      name: 'blender_run_headless',
      description: `Run Python inside a background Blender process (blender --background) without requiring an open GUI session or add-on connection. Assign to _result to return structured JSON, and optionally load blend_file or save_to a .blend path.`,
      inputSchema: {
        type: 'object',
        properties: {
          code: { type: 'string', description: 'Python source to execute with bpy in scope.' },
          blend_file: { type: 'string', description: 'Optional .blend file to open before running code. Omit for --factory-startup.' },
          save_to: { type: 'string', description: 'Optional .blend destination path saved after code succeeds.' },
          timeout_ms: { type: 'number', description: 'Hard process timeout in milliseconds (default 60000, max 180000).', default: 60_000 },
          stdout_cap_bytes: { type: 'number', description: 'Maximum user stdout bytes returned.', default: EXEC_OUTPUT_CAP },
        },
        required: ['code'],
      },
      mutates: true,
      run: (a) =>
        tools.runHeadless({
          code: a.code as string,
          blendFile: a.blend_file as string | undefined,
          saveTo: a.save_to as string | undefined,
          timeoutMs: a.timeout_ms as number | undefined,
          stdoutCapBytes: a.stdout_cap_bytes as number | undefined,
        }),
    },
    {
      name: 'blender_render_views',
      description: `Render orthographic/perspective QA views (BLENDER_WORKBENCH + transparent RGBA) of target MESH objects into a composite PNG at output_path, compute world dimensions_m, viewport fill_ratio, and optional silhouette_iou against reference_mask_path, then restore all scene/render state.`,
      inputSchema: {
        type: 'object',
        properties: {
          output_path: { type: 'string', description: 'Destination PNG file path for the rendered view or 2x2 composite.' },
          target_objects: {
            type: 'array',
            items: { type: 'string' },
            description: 'Object names to frame. Defaults to all visible MESH objects.',
          },
          resolution: {
            type: 'number',
            description: 'Per-quadrant resolution in pixels (default 512 -> 1024x1024 for 4 views).',
            default: 512,
          },
          views: {
            type: 'array',
            items: { type: 'string' },
            description: 'View angles to render (front, right, top, persp, left, back, bottom).',
            default: ['front', 'right', 'top', 'persp'],
          },
          reference_mask_path: {
            type: 'string',
            description: 'Optional reference RGBA image path to compute alpha silhouette IoU against.',
          },
        },
        required: ['output_path'],
      },
      run: (a) =>
        tools.renderViews({
          outputPath: a.output_path as string,
          targetObjects: a.target_objects as string[] | undefined,
          resolution: a.resolution as number | undefined,
          views: a.views as string[] | undefined,
          referenceMaskPath: a.reference_mask_path as string | undefined,
        }),
    },
    {
      name: 'blender_asset_qa',
      description: `Non-destructively inspect MESH geometry, UVs, materials, ARMATURE weights, ARKit 52 blendshapes, and optional GLB export/import roundtrip fidelity. Returns { passed, issues, metrics, objects_checked }.`,
      inputSchema: {
        type: 'object',
        properties: {
          target_objects: {
            type: 'array',
            items: { type: 'string' },
            description: 'Object names to inspect. Defaults to all visible MESH objects.',
          },
          max_tris: { type: 'number', description: 'Maximum allowed total triangle count.' },
          require_uv: { type: 'boolean', description: 'Fail QA if any checked mesh lacks a UV layer.' },
          require_manifold: { type: 'boolean', description: 'Fail QA if non-manifold edges or loose vertices exist.' },
          require_arkit52: { type: 'boolean', description: 'Verify all 52 Apple ARKit blendshapes exist.' },
          roundtrip_glb_path: {
            type: 'string',
            description: 'Optional temporary .glb path to verify export/import height and bone preservation.',
          },
        },
      },
      run: (a) =>
        tools.assetQa({
          targetObjects: a.target_objects as string[] | undefined,
          maxTris: a.max_tris as number | undefined,
          requireUv: a.require_uv as boolean | undefined,
          requireManifold: a.require_manifold as boolean | undefined,
          requireArkit52: a.require_arkit52 as boolean | undefined,
          roundtripGlbPath: a.roundtrip_glb_path as string | undefined,
        }),
    },
  ];
}

function content(value: unknown) {
  return { content: [{ type: 'text' as const, text: JSON.stringify(value, null, 2) }] };
}

/**
 * Keep trying after the startup wait has run out.
 *
 * The context cache is filled once, so a bridge that gave up and served anyway
 * reported "unknown" for the version, the scene and the frame from then on —
 * next to a real object list, which makes the header look wrong rather than
 * the connection. Polling is what turns "no Blender at startup" into "no
 * Blender yet".
 *
 * Deliberately not unref'd: an MCP server that exits while a Blender is still
 * to be launched is a tool that never appears in the client's list again.
 */
function watchForBlender(tools: BlenderTools): void {
  const timer = setInterval(() => {
    tools.primeContext().then(
      () => {
        clearInterval(timer);
        process.stderr.write(
          `[blender-bridge] Blender ${tools.blenderVersion()} on "${tools.sceneName()}" — context loaded\n`,
        );
      },
      // Expected for as long as no Blender is open, so it stays off stderr.
      // A real failure — the port taken, the token refused — surfaces on the
      // next call, which is the one that has to report it.
      () => {},
    );
  }, CONNECTION_POLL_MS);
}

async function main(): Promise<void> {
  const config = resolveConfig();
  const path = publishConfig(config);
  process.stderr.write(`[blender-bridge] config published to ${path} (port ${config.port})\n`);

  const client = new BlenderClient(config, DEFAULT_TIMEOUT_MS);
  const tools = new BlenderTools(client);
  const specs = buildTools(tools);

  // Retry rather than probe once. A Blender that was already open learns the
  // port and token from the file this process just published, and its own poll
  // runs on a 2s interval — so a single attempt reports "no add-on" for a
  // Blender that is answering a moment later. The bounded wait is what makes
  // the line below a statement about the connection rather than about timing.
  const deadline = Date.now() + HANDSHAKE_RETRY_MS;
  let lastError: unknown = null;
  for (;;) {
    try {
      await tools.primeContext();
      process.stderr.write(`[blender-bridge] Blender ${tools.blenderVersion()} on "${tools.sceneName()}"\n`);
      lastError = null;
      break;
    } catch (err) {
      lastError = err;
      if (Date.now() >= deadline) break;
      await new Promise((r) => setTimeout(r, 500));
    }
  }

  if (lastError) {
    process.stderr.write(
      `[blender-bridge] no add-on on 127.0.0.1:${config.port}: ${(lastError as Error).message}\n` +
        '[blender-bridge] install src/addon/hsa_blender_addon.py, or set HSA_BLENDER_TOKEN to the add-on\'s token\n',
    );
    watchForBlender(tools);
  }

  const server = new Server(
    { name: NAME, version: VERSION },
    { capabilities: { tools: {} } },
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: specs.map((s) => ({
      name: s.name,
      description: s.description,
      inputSchema: s.inputSchema,
      annotations: { title: s.name, readOnlyHint: !s.mutates, destructiveHint: Boolean(s.mutates) },
    })),
  }));

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const spec = specs.find((s) => s.name === request.params.name);
    if (!spec) {
      return content(errorEnvelope(`unknown tool ${request.params.name}`));
    }
    try {
      return content(await spec.run((request.params.arguments ?? {}) as Record<string, unknown>));
    } catch (err) {
      if (err instanceof BlenderError) {
        return content(errorEnvelope(err.message));
      }
      return content(errorEnvelope(`unexpected: ${(err as Error)?.message ?? String(err)}`));
    }
  });

  await server.connect(new StdioServerTransport());
  process.stderr.write('[blender-bridge] ready on stdio\n');
}

main().catch((err) => {
  process.stderr.write(`[blender-bridge] fatal: ${(err as Error).stack ?? String(err)}\n`);
  process.exit(1);
});
