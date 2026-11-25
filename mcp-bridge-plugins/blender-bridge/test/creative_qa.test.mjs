import { spawn } from 'child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

import { findBlenderExecutable, runBlenderHeadless } from '../dist/headless.js';
import { McpClient, call, counter, freePort, init, parse } from './harness.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const BRIDGE_DIR = join(HERE, '..');
const FAKE_BLENDER = join(HERE, 'fake_blender.py');
const PYTHON = process.env.HSA_TEST_PYTHON || 'python';

async function main() {
  const t = counter();
  const check = t.check;
  const scratch = mkdtempSync(join(tmpdir(), 'bb-creative-qa-'));
  const origBlenderPath = process.env.BLENDER_PATH;

  try {
    console.log('headless.ts — missing binary & executable discovery');
    process.env.BLENDER_PATH = join(scratch, 'definitely-missing-blender-bin');
    check('missing BLENDER_PATH resolves to null', findBlenderExecutable() === null);

    let missingErr = null;
    try {
      await runBlenderHeadless({ code: '_result = 1' });
    } catch (err) {
      missingErr = err;
    }
    check(
      'missing executable throws BlenderError with BLENDER_PATH guidance',
      missingErr !== null &&
        missingErr.name === 'BlenderError' &&
        String(missingErr.message).includes('BLENDER_PATH'),
      missingErr?.message,
    );

    console.log('headless.ts — mock subprocess execution, marker isolation, saveTo & timeout');
    process.env.BLENDER_PATH = FAKE_BLENDER;
    check('BLENDER_PATH pointing to stand-in resolves', findBlenderExecutable() === FAKE_BLENDER);

    const savedBlend = join(scratch, 'saved', 'out_scene.blend');
    const headlessOk = await runBlenderHeadless({
      code: 'print("user line 1")\n_result = {"version": bpy.app.version_string, "objs": len(bpy.data.objects)}',
      blendFile: 'input_char.blend',
      saveTo: savedBlend,
      stdoutCapBytes: 200,
    });
    check('headless parses _result JSON after marker', headlessOk.result?.version === '4.2.1' && headlessOk.result?.objs === 3, headlessOk);
    check('headless startup banner is kept in stdout while marker line is stripped', headlessOk.stdout.includes('Read blend: input_char.blend') && !headlessOk.stdout.includes('__HSA_BLENDER_RESULT__:'), headlessOk.stdout);
    check('headless saves .blend when saveTo is provided', existsSync(savedBlend) && readFileSync(savedBlend, 'utf8').startsWith('BLENDER-v402'), savedBlend);

    const capped = await runBlenderHeadless({
      code: 'print("z" * 4000)\n_result = "capped-ok"',
      stdoutCapBytes: 120,
    });
    check('headless respects stdoutCapBytes', capped.stdout_truncated === true && capped.stdout_bytes <= 120 && capped.stdout_bytes_dropped > 3800 && capped.result === 'capped-ok', capped);

    let timeoutErr = null;
    try {
      await runBlenderHeadless({
        code: 'import time\ntime.sleep(5)\n_result = "late"',
        timeoutMs: 150,
      });
    } catch (err) {
      timeoutErr = err;
    }
    check(
      'headless kills runaway process on hard timeout',
      timeoutErr !== null && /timed out/i.test(String(timeoutErr.message)),
      timeoutErr?.message,
    );

    console.log('MCP tools — blender_run_headless, blender_render_views, blender_asset_qa');
    const port = await freePort();
    const token = 'qa-suite-token-xyz';
    const blender = spawn(PYTHON, [FAKE_BLENDER, String(port), token, '6'], {
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    await new Promise((resolve, reject) => {
      let buf = '';
      const timer = setTimeout(() => reject(new Error('fake blender did not start')), 15000);
      blender.stdout.on('data', (c) => {
        buf += c.toString();
        if (buf.includes('FAKE_BLENDER_READY')) {
          clearTimeout(timer);
          resolve(true);
        }
      });
      blender.stderr.on('data', (c) => process.stderr.write(`[blender] ${c}`));
    });

    const bridge = spawn(process.execPath, ['--no-warnings', join(BRIDGE_DIR, 'dist', 'index.js')], {
      stdio: ['pipe', 'pipe', 'pipe'],
      env: {
        ...process.env,
        BLENDER_PATH: FAKE_BLENDER,
        HSA_BLENDER_PORT: String(port),
        HSA_BLENDER_TOKEN: token,
        HSA_DASHBOARD: 'false',
      },
    });
    const client = new McpClient(bridge);

    try {
      await init(client);

      const mcpHeadless = parse(
        await call(client, 'blender_run_headless', {
          code: '_result = {"headless_mcp": True, "count": len(bpy.data.objects)}',
        }),
      );
      check('blender_run_headless returns ok envelope', mcpHeadless.status === 'ok' && mcpHeadless.data?.result?.headless_mcp === true, mcpHeadless);

      const singleRefMask = join(scratch, 'ref_mask.png');
      const firstSingle = parse(
        await call(client, 'blender_render_views', {
          output_path: singleRefMask,
          target_objects: ['Obj_001'],
          resolution: 64,
          views: ['front'],
        }),
      );
      check('single-view render writes reference PNG', firstSingle.status === 'ok' && existsSync(singleRefMask), firstSingle);

      const compositePng = join(scratch, 'views_composite.png');
      const rendered = parse(
        await call(client, 'blender_render_views', {
          output_path: compositePng,
          target_objects: ['Obj_001'],
          resolution: 64,
          views: ['front', 'right', 'top', 'persp'],
          reference_mask_path: singleRefMask,
        }),
      );
      check('blender_render_views writes 2x2 composite PNG', rendered.status === 'ok' && existsSync(compositePng), rendered);
      check('composite resolution is 2x quadrant resolution', rendered.data?.resolution?.[0] === 128 && rendered.data?.resolution?.[1] === 128, rendered.data?.resolution);
      check('dimensions_m matches 1x1x1 cube', JSON.stringify(rendered.data?.dimensions_m) === JSON.stringify([1, 1, 1]), rendered.data?.dimensions_m);
      check('fill_ratio is computed from alpha channel', rendered.data?.fill_ratio === 0.25, rendered.data?.fill_ratio);
      check('silhouette_iou against identical mask is 1.0', rendered.data?.silhouette_iou === 1, rendered.data?.silhouette_iou);

      const afterRenderState = parse(
        await call(client, 'blender_execute_python', {
          code: '_result = {"engine": bpy.context.scene.render.engine, "film_transparent": bpy.context.scene.render.film_transparent, "cameras": len(bpy.data.cameras), "images": len(bpy.data.images)}',
        }),
      );
      check(
        'blender_render_views restores render settings and cleans temp cameras/images',
        afterRenderState.data?.result?.engine === 'BLENDER_EEVEE' &&
          afterRenderState.data?.result?.film_transparent === false &&
          afterRenderState.data?.result?.cameras === 0 &&
          afterRenderState.data?.result?.images === 0,
        afterRenderState.data?.result,
      );

      const roundtripGlb = join(scratch, 'qa_roundtrip.glb');
      const qaClean = parse(
        await call(client, 'blender_asset_qa', {
          target_objects: ['Obj_001'],
          max_tris: 100,
          require_uv: true,
          require_manifold: true,
          roundtrip_glb_path: roundtripGlb,
        }),
      );
      check('clean manifold cube passes blender_asset_qa', qaClean.status === 'ok' && qaClean.data?.passed === true, qaClean);
      check(
        'mesh geometry counts are accurate',
        qaClean.data?.metrics?.vertices === 8 &&
          qaClean.data?.metrics?.triangles === 12 &&
          qaClean.data?.metrics?.quads === 6 &&
          qaClean.data?.metrics?.ngons === 0 &&
          qaClean.data?.metrics?.non_manifold_edges === 0 &&
          qaClean.data?.metrics?.uv_layers_count === 1,
        qaClean.data?.metrics,
      );
      check(
        'roundtrip GLB preserves height and bone count',
        qaClean.data?.metrics?.height_error_pct === 0 && qaClean.data?.metrics?.bones_match === true,
        qaClean.data?.metrics,
      );

      const afterRtClean = parse(
        await call(client, 'blender_execute_python', {
          code: '_result = {"objects": len(bpy.data.objects), "collections": len(bpy.data.collections)}',
        }),
      );
      check(
        'roundtrip GLB leaves zero temp objects or collections in scene',
        afterRtClean.data?.result?.objects === 6 && afterRtClean.data?.result?.collections === 0,
        afterRtClean.data?.result,
      );

      // Mutate Obj_002 in-memory to exercise rigging weights, non-manifold edge, missing UV, and ARKit52 checks.
      await call(client, 'blender_execute_python', {
        code: [
          'import types',
          'o = bpy.data.objects.get("Obj_002")',
          'o.data.uv_layers.clear()',
          'o.data.polygons.pop()',
          'arm_data = bpy.data.armatures.new("TestArmData")',
          'arm_data.bones = [types.SimpleNamespace(name="Root", use_deform=True)]',
          'arm_obj = bpy.data.objects.new("TestArm", object_data=arm_data)',
          'o.parent = arm_obj',
          'o.vertex_groups = [types.SimpleNamespace(name="Root", index=0)]',
          'for idx, v in enumerate(o.data.vertices):',
          '    if idx == 0:',
          '        v.groups = []',
          '    elif idx == 1:',
          '        v.groups = [types.SimpleNamespace(group=0, weight=0.5)]',
          '    else:',
          '        v.groups = [types.SimpleNamespace(group=0, weight=1.0)]',
          'o.data.shape_keys = types.SimpleNamespace(key_blocks=[types.SimpleNamespace(name="Basis"), types.SimpleNamespace(name="eyeBlinkLeft")])',
          '_result = "mutated"',
        ].join('\n'),
      });

      const qaBad = parse(
        await call(client, 'blender_asset_qa', {
          target_objects: ['Obj_002'],
          max_tris: 6,
          require_uv: true,
          require_manifold: true,
          require_arkit52: true,
        }),
      );
      check('flawed rigged mesh fails QA with issues', qaBad.status === 'ok' && qaBad.data?.passed === false && qaBad.data?.issues?.length >= 5, qaBad.data);
      check('non-manifold edges detected on open cube (4 boundary edges)', qaBad.data?.metrics?.non_manifold_edges === 4, qaBad.data?.metrics);
      check('rigging weight defects counted accurately', qaBad.data?.metrics?.bones_count === 1 && qaBad.data?.metrics?.unweighted_vertices === 1 && qaBad.data?.metrics?.unnormalized_vertices === 1, qaBad.data?.metrics);
      check('ARKit 52 check reports exact 51 missing shapes', qaBad.data?.metrics?.missing_arkit_shapes?.length === 51 && !qaBad.data?.metrics?.missing_arkit_shapes?.includes('eyeBlinkLeft'), qaBad.data?.metrics?.missing_arkit_shapes?.length);

      blender.kill();
      await new Promise((r) => setTimeout(r, 400));
      const guiDownRender = parse(
        await call(client, 'blender_render_views', {
          output_path: join(scratch, 'should_fail.png'),
        }),
      );
      check(
        'blender_render_views suggests blender_run_headless when GUI add-on is offline',
        guiDownRender.status === 'error' && /blender_run_headless/i.test(String(guiDownRender.meta?.note)),
        guiDownRender.meta,
      );
    } finally {
      bridge.stdin.end();
      bridge.kill();
      blender.kill();
    }
  } finally {
    if (origBlenderPath === undefined) delete process.env.BLENDER_PATH;
    else process.env.BLENDER_PATH = origBlenderPath;
    rmSync(scratch, { recursive: true, force: true });
  }

  console.log(`\n${t.summary()}`);
  process.exitCode = t.failed === 0 ? 0 : 1;
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
