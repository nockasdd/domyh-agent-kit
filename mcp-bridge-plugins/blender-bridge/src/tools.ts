/**
 * Schema-based tools.
 *
 * The alternative is `execute_blender_code` for everything, which is why most
 * Blender MCP setups are expensive: the model writes a script, the script
 * prints a repr, and the model reads a repr. Each of those steps loses
 * structure and adds prose. Naming the shape instead makes the common reads
 * cheap and leaves `exec` for the genuinely open-ended case.
 *
 * Pagination is decided inside the generated script rather than after the fact.
 * The socket would otherwise carry the whole scene first and cut it second,
 * which bounds the response but not the cost of producing it.
 */

import { BlenderClient, BlenderError } from './client.js';
import { HeadlessOptions, runBlenderHeadless } from './headless.js';
import {
  Budget,
  DEFAULT_PAGE_LIMIT,
  Envelope,
  MAX_PAGE_LIMIT,
  byteLength,
  clipText,
  errorEnvelope,
  measure,
  page,
  withPage,
} from './envelope.js';

export const EXEC_OUTPUT_CAP = 8_000;

export const ARKIT_52_SHAPES = [
  'eyeBlinkLeft',
  'eyeLookDownLeft',
  'eyeLookInLeft',
  'eyeLookOutLeft',
  'eyeLookUpLeft',
  'eyeSquintLeft',
  'eyeWideLeft',
  'eyeBlinkRight',
  'eyeLookDownRight',
  'eyeLookInRight',
  'eyeLookOutRight',
  'eyeLookUpRight',
  'eyeSquintRight',
  'eyeWideRight',
  'jawForward',
  'jawLeft',
  'jawRight',
  'jawOpen',
  'mouthClose',
  'mouthFunnel',
  'mouthPucker',
  'mouthLeft',
  'mouthRight',
  'mouthSmileLeft',
  'mouthSmileRight',
  'mouthFrownLeft',
  'mouthFrownRight',
  'mouthDimpleLeft',
  'mouthDimpleRight',
  'mouthStretchLeft',
  'mouthStretchRight',
  'mouthRollLower',
  'mouthRollUpper',
  'mouthShrugLower',
  'mouthShrugUpper',
  'mouthPressLeft',
  'mouthPressRight',
  'mouthLowerDownLeft',
  'mouthLowerDownRight',
  'mouthUpperUpLeft',
  'mouthUpperUpRight',
  'browDownLeft',
  'browDownRight',
  'browInnerUp',
  'browOuterUpLeft',
  'browOuterUpRight',
  'cheekPuff',
  'cheekSquintLeft',
  'cheekSquintRight',
  'noseSneerLeft',
  'noseSneerRight',
  'tongueOut',
] as const;

export interface RenderViewsOptions {
  outputPath: string;
  targetObjects?: string[];
  resolution?: number;
  views?: string[];
  referenceMaskPath?: string;
}

export interface AssetQaOptions {
  targetObjects?: string[];
  maxTris?: number;
  requireUv?: boolean;
  requireManifold?: boolean;
  requireArkit52?: boolean;
  roundtripGlbPath?: string;
}

function buildRenderViewsScript(opts: {
  outputPath: string;
  targetObjects: string[] | null;
  resolution: number;
  views: string[];
  referenceMaskPath: string | null;
}): string {
  return [
    'import bpy',
    'import json',
    'import math',
    'import os',
    'import shutil',
    'import tempfile',
    '',
    `_output_path = json.loads(${JSON.stringify(JSON.stringify(opts.outputPath))})`,
    `_target_names = json.loads(${JSON.stringify(JSON.stringify(opts.targetObjects))})`,
    `_res = int(${opts.resolution})`,
    `_views = json.loads(${JSON.stringify(JSON.stringify(opts.views))})`,
    `_ref_mask_path = json.loads(${JSON.stringify(JSON.stringify(opts.referenceMaskPath))})`,
    '',
    'def _run_render_views():',
    '    _scene = bpy.context.scene',
    '    if _target_names:',
    '        _missing = [_n for _n in _target_names if bpy.data.objects.get(_n) is None]',
    '        if _missing:',
    '            return {"error": "target_objects not found: " + ", ".join(_missing)}',
    '        _targets = [bpy.data.objects.get(_n) for _n in _target_names]',
    '        _mesh_targets = [_o for _o in _targets if _o is not None and _o.type == "MESH"]',
    '        if _mesh_targets:',
    '            _targets = _mesh_targets',
    '    else:',
    '        _scene_objs = getattr(_scene, "objects", bpy.data.objects)',
    '        _targets = [',
    '            _o for _o in _scene_objs',
    '            if _o.type == "MESH"',
    '            and not getattr(_o, "hide_viewport", False)',
    '            and not getattr(_o, "hide_render", False)',
    '        ]',
    '    if not _targets:',
    '        return {"error": "no visible MESH objects to render"}',
    '    if _ref_mask_path and not os.path.isfile(_ref_mask_path):',
    '        return {"error": "reference_mask_path does not exist: " + str(_ref_mask_path)}',
    '',
    '    _xs, _ys, _zs = [], [], []',
    '    for _o in _targets:',
    '        _bb = getattr(_o, "bound_box", None)',
    '        _mw = getattr(_o, "matrix_world", None)',
    '        if _bb is not None and _mw is not None:',
    '            for _c in _bb:',
    '                _cx, _cy, _cz = float(_c[0]), float(_c[1]), float(_c[2])',
    '                _wx = float(_mw[0][0]) * _cx + float(_mw[0][1]) * _cy + float(_mw[0][2]) * _cz + float(_mw[0][3])',
    '                _wy = float(_mw[1][0]) * _cx + float(_mw[1][1]) * _cy + float(_mw[1][2]) * _cz + float(_mw[1][3])',
    '                _wz = float(_mw[2][0]) * _cx + float(_mw[2][1]) * _cy + float(_mw[2][2]) * _cz + float(_mw[2][3])',
    '                _xs.append(_wx)',
    '                _ys.append(_wy)',
    '                _zs.append(_wz)',
    '        else:',
    '            _loc = getattr(_o, "location", (0.0, 0.0, 0.0))',
    '            _dim = getattr(_o, "dimensions", (1.0, 1.0, 1.0))',
    '            for _sx in (-0.5, 0.5):',
    '                for _sy in (-0.5, 0.5):',
    '                    for _sz in (-0.5, 0.5):',
    '                        _xs.append(float(_loc[0]) + _sx * float(_dim[0]))',
    '                        _ys.append(float(_loc[1]) + _sy * float(_dim[1]))',
    '                        _zs.append(float(_loc[2]) + _sz * float(_dim[2]))',
    '',
    '    _dx = max(_xs) - min(_xs)',
    '    _dy = max(_ys) - min(_ys)',
    '    _dz = max(_zs) - min(_zs)',
    '    _dimensions_m = [round(_dx, 4), round(_dy, 4), round(_dz, 4)]',
    '    _center_x = (min(_xs) + max(_xs)) * 0.5',
    '    _center_y = (min(_ys) + max(_ys)) * 0.5',
    '    _center_z = (min(_zs) + max(_zs)) * 0.5',
    '    _span = max(_dx, _dy, _dz, 1e-3)',
    '    _dist = _span * 2.2',
    '',
    '    _render = _scene.render',
    '    _img_settings = _render.image_settings',
    '    _orig_camera = getattr(_scene, "camera", None)',
    '    _orig_engine = _render.engine',
    '    _orig_filepath = _render.filepath',
    '    _orig_film_transparent = _render.film_transparent',
    '    _orig_res_x = _render.resolution_x',
    '    _orig_res_y = _render.resolution_y',
    '    _orig_res_pct = getattr(_render, "resolution_percentage", 100)',
    '    _orig_file_format = _img_settings.file_format',
    '    _orig_color_mode = _img_settings.color_mode',
    '',
    '    _tmp_dir = tempfile.mkdtemp(prefix="hsa_views_")',
    '    _temp_images = []',
    '    _cam_data = None',
    '    _cam_obj = None',
    '    try:',
    '        _cam_data = bpy.data.cameras.new(name="__hsa_qa_cam_data__")',
    '        _cam_data.clip_start = max(0.001, _dist * 0.005)',
    '        _cam_data.clip_end = max(100.0, _dist * 10.0)',
    '        _cam_obj = bpy.data.objects.new(name="__hsa_qa_cam__", object_data=_cam_data)',
    '        _scene.collection.objects.link(_cam_obj)',
    '        if hasattr(_cam_obj, "rotation_mode"):',
    '            _cam_obj.rotation_mode = "XYZ"',
    '',
    '        _scene.camera = _cam_obj',
    '        _render.engine = "BLENDER_WORKBENCH"',
    '        _render.film_transparent = True',
    '        _render.resolution_x = _res',
    '        _render.resolution_y = _res',
    '        if hasattr(_render, "resolution_percentage"):',
    '            _render.resolution_percentage = 100',
    '        _img_settings.file_format = "PNG"',
    '        _img_settings.color_mode = "RGBA"',
    '',
    '        _view_buffers = []',
    '        _view_files = []',
    '        _per_view_fill = {}',
    '',
    '        for _idx, _vname in enumerate(_views):',
    '            _vl = str(_vname).lower()',
    '            if _vl == "front":',
    '                _pos = (_center_x, _center_y - _dist, _center_z)',
    '                _cam_data.type = "ORTHO"',
    '                _cam_data.ortho_scale = max(_dx, _dz, 1e-3) * 1.25',
    '            elif _vl == "back":',
    '                _pos = (_center_x, _center_y + _dist, _center_z)',
    '                _cam_data.type = "ORTHO"',
    '                _cam_data.ortho_scale = max(_dx, _dz, 1e-3) * 1.25',
    '            elif _vl == "right":',
    '                _pos = (_center_x + _dist, _center_y, _center_z)',
    '                _cam_data.type = "ORTHO"',
    '                _cam_data.ortho_scale = max(_dy, _dz, 1e-3) * 1.25',
    '            elif _vl == "left":',
    '                _pos = (_center_x - _dist, _center_y, _center_z)',
    '                _cam_data.type = "ORTHO"',
    '                _cam_data.ortho_scale = max(_dy, _dz, 1e-3) * 1.25',
    '            elif _vl == "top":',
    '                _pos = (_center_x, _center_y, _center_z + _dist)',
    '                _cam_data.type = "ORTHO"',
    '                _cam_data.ortho_scale = max(_dx, _dy, 1e-3) * 1.25',
    '            elif _vl == "bottom":',
    '                _pos = (_center_x, _center_y, _center_z - _dist)',
    '                _cam_data.type = "ORTHO"',
    '                _cam_data.ortho_scale = max(_dx, _dy, 1e-3) * 1.25',
    '            else:',
    '                _pos = (_center_x + _dist * 0.75, _center_y - _dist * 0.75, _center_z + _dist * 0.55)',
    '                _cam_data.type = "PERSP"',
    '                _cam_data.lens = 50.0',
    '',
    '            _vx = _center_x - _pos[0]',
    '            _vy = _center_y - _pos[1]',
    '            _vz = _center_z - _pos[2]',
    '            _vlen = math.sqrt(_vx * _vx + _vy * _vy + _vz * _vz) or 1.0',
    '            _dxn, _dyn, _dzn = _vx / _vlen, _vy / _vlen, _vz / _vlen',
    '            _horiz = math.hypot(_dxn, _dyn)',
    '            _rx = math.atan2(_horiz, -_dzn)',
    '            _rz = math.atan2(-_dxn, _dyn) if _horiz > 1e-8 else 0.0',
    '            _cam_obj.location = _pos',
    '            _cam_obj.rotation_euler = (_rx, 0.0, _rz)',
    '',
    '            _vfile = os.path.join(_tmp_dir, "view_%d_%s.png" % (_idx, _vl))',
    '            _render.filepath = _vfile',
    '            bpy.ops.render.render(write_still=True)',
    '            _view_files.append(_vfile)',
    '',
    '            _vimg = bpy.data.images.load(_vfile)',
    '            _temp_images.append(_vimg)',
    '            _px = list(_vimg.pixels)',
    '            bpy.data.images.remove(_vimg)',
    '            _temp_images.remove(_vimg)',
    '',
    '            _alpha_ch = _px[3::4]',
    '            _fg_count = sum(1 for _a in _alpha_ch if _a > 0.5)',
    '            _per_view_fill[_vl] = round(_fg_count / max(1, len(_alpha_ch)), 4)',
    '            _view_buffers.append(_px)',
    '',
    '        _out_abs = os.path.abspath(_output_path)',
    '        _out_dir = os.path.dirname(_out_abs)',
    '        if _out_dir:',
    '            os.makedirs(_out_dir, exist_ok=True)',
    '',
    '        _n_views = len(_view_buffers)',
    '        if _n_views == 1:',
    '            shutil.copyfile(_view_files[0], _out_abs)',
    '            _comp_w, _comp_h = _res, _res',
    '            _comp_px = _view_buffers[0]',
    '        else:',
    '            _cols = 2',
    '            _rows = (_n_views + 1) // 2',
    '            _comp_w = _cols * _res',
    '            _comp_h = _rows * _res',
    '            _comp_px = [0.0] * (_comp_w * _comp_h * 4)',
    '            _src_stride = _res * 4',
    '            _dst_stride = _comp_w * 4',
    '            for _idx, _src in enumerate(_view_buffers):',
    '                _col = _idx % _cols',
    '                _row_top = _idx // _cols',
    '                _base_y = (_rows - 1 - _row_top) * _res',
    '                _base_x = _col * _res',
    '                for _ry in range(_res):',
    '                    _s0 = _ry * _src_stride',
    '                    _d0 = (_base_y + _ry) * _dst_stride + _base_x * 4',
    '                    _comp_px[_d0 : _d0 + _src_stride] = _src[_s0 : _s0 + _src_stride]',
    '            _comp_img = bpy.data.images.new("__hsa_qa_composite__", width=_comp_w, height=_comp_h, alpha=True)',
    '            _temp_images.append(_comp_img)',
    '            _comp_img.pixels = _comp_px',
    '            _comp_img.filepath_raw = _out_abs',
    '            _comp_img.file_format = "PNG"',
    '            _comp_img.save()',
    '            bpy.data.images.remove(_comp_img)',
    '            _temp_images.remove(_comp_img)',
    '',
    '        _silhouette_iou = None',
    '        if _ref_mask_path:',
    '            _ref_img = bpy.data.images.load(_ref_mask_path)',
    '            _temp_images.append(_ref_img)',
    '            _rw, _rh = int(_ref_img.size[0]), int(_ref_img.size[1])',
    '            _ref_alpha = list(_ref_img.pixels)[3::4]',
    '            bpy.data.images.remove(_ref_img)',
    '            _temp_images.remove(_ref_img)',
    '',
    '            if _n_views > 1 and _rw == _comp_w and _rh == _comp_h:',
    '                _cand_alpha = _comp_px[3::4]',
    '                _cw, _ch = _comp_w, _comp_h',
    '            else:',
    '                _cand_alpha = _view_buffers[0][3::4]',
    '                _cw, _ch = _res, _res',
    '',
    '            if (_cw, _ch) != (_rw, _rh) and _rw > 0 and _rh > 0:',
    '                _cand_alpha = [',
    '                    _cand_alpha[min(_ch - 1, (_y * _ch) // _rh) * _cw + min(_cw - 1, (_x * _cw) // _rw)]',
    '                    for _y in range(_rh)',
    '                    for _x in range(_rw)',
    '                ]',
    '',
    '            _inter = 0',
    '            _union = 0',
    '            for _a, _b in zip(_cand_alpha, _ref_alpha):',
    '                _ma = _a > 0.5',
    '                _mb = _b > 0.5',
    '                if _ma or _mb:',
    '                    _union += 1',
    '                    if _ma and _mb:',
    '                        _inter += 1',
    '            _silhouette_iou = round(_inter / _union, 4) if _union > 0 else 0.0',
    '',
    '        _avg_fill = round(sum(_per_view_fill.values()) / max(1, len(_per_view_fill)), 4)',
    '        return {',
    '            "output_path": _out_abs,',
    '            "views": [str(_v).lower() for _v in _views],',
    '            "resolution": [_comp_w, _comp_h],',
    '            "quadrant_resolution": _res,',
    '            "target_objects": [_o.name for _o in _targets],',
    '            "dimensions_m": _dimensions_m,',
    '            "fill_ratio": _avg_fill,',
    '            "per_view_fill_ratio": _per_view_fill,',
    '            "silhouette_iou": _silhouette_iou,',
    '        }',
    '    finally:',
    '        _scene.camera = _orig_camera',
    '        _render.engine = _orig_engine',
    '        _render.filepath = _orig_filepath',
    '        _render.film_transparent = _orig_film_transparent',
    '        _render.resolution_x = _orig_res_x',
    '        _render.resolution_y = _orig_res_y',
    '        if hasattr(_render, "resolution_percentage"):',
    '            _render.resolution_percentage = _orig_res_pct',
    '        _img_settings.file_format = _orig_file_format',
    '        _img_settings.color_mode = _orig_color_mode',
    '        for _img in list(_temp_images):',
    '            try:',
    '                bpy.data.images.remove(_img)',
    '            except Exception:',
    '                pass',
    '        if _cam_obj is not None:',
    '            try:',
    '                bpy.data.objects.remove(_cam_obj, do_unlink=True)',
    '            except Exception:',
    '                pass',
    '        if _cam_data is not None:',
    '            try:',
    '                bpy.data.cameras.remove(_cam_data)',
    '            except Exception:',
    '                pass',
    '        shutil.rmtree(_tmp_dir, ignore_errors=True)',
    '',
    '_result = _run_render_views()',
  ].join('\n');
}

function buildAssetQaScript(opts: {
  targetObjects: string[] | null;
  maxTris: number | null;
  requireUv: boolean;
  requireManifold: boolean;
  requireArkit52: boolean;
  roundtripGlbPath: string | null;
}): string {
  return [
    'import bpy',
    'import bmesh',
    'import json',
    'import os',
    '',
    `_target_names = json.loads(${JSON.stringify(JSON.stringify(opts.targetObjects))})`,
    `_max_tris = json.loads(${JSON.stringify(JSON.stringify(opts.maxTris))})`,
    `_req_uv = json.loads(${JSON.stringify(JSON.stringify(opts.requireUv))})`,
    `_req_manifold = json.loads(${JSON.stringify(JSON.stringify(opts.requireManifold))})`,
    `_req_arkit52 = json.loads(${JSON.stringify(JSON.stringify(opts.requireArkit52))})`,
    `_rt_glb = json.loads(${JSON.stringify(JSON.stringify(opts.roundtripGlbPath))})`,
    `_arkit52 = json.loads(${JSON.stringify(JSON.stringify(ARKIT_52_SHAPES))})`,
    '',
    'def _world_height(objs):',
    '    _zs = []',
    '    for _o in objs:',
    '        _bb = getattr(_o, "bound_box", None)',
    '        _mw = getattr(_o, "matrix_world", None)',
    '        if _bb is not None and _mw is not None:',
    '            for _c in _bb:',
    '                _cx, _cy, _cz = float(_c[0]), float(_c[1]), float(_c[2])',
    '                _wz = float(_mw[2][0]) * _cx + float(_mw[2][1]) * _cy + float(_mw[2][2]) * _cz + float(_mw[2][3])',
    '                _zs.append(_wz)',
    '        else:',
    '            _loc = getattr(_o, "location", (0.0, 0.0, 0.0))',
    '            _dim = getattr(_o, "dimensions", (1.0, 1.0, 1.0))',
    '            _zs.append(float(_loc[2]) - 0.5 * float(_dim[2]))',
    '            _zs.append(float(_loc[2]) + 0.5 * float(_dim[2]))',
    '    return (max(_zs) - min(_zs)) if _zs else 0.0',
    '',
    'def _find_layer_col(layer_col, col):',
    '    if getattr(layer_col, "collection", None) == col:',
    '        return layer_col',
    '    for _child in getattr(layer_col, "children", []):',
    '        _found = _find_layer_col(_child, col)',
    '        if _found is not None:',
    '            return _found',
    '    return None',
    '',
    'def _run_asset_qa():',
    '    _issues = []',
    '    _scene = bpy.context.scene',
    '    _explicit_arms = []',
    '    if _target_names:',
    '        _missing = [_n for _n in _target_names if bpy.data.objects.get(_n) is None]',
    '        if _missing:',
    '            _issues.append("Target objects not found: " + ", ".join(_missing))',
    '        _resolved = [bpy.data.objects.get(_n) for _n in _target_names if bpy.data.objects.get(_n) is not None]',
    '        _meshes = [_o for _o in _resolved if _o.type == "MESH"]',
    '        _explicit_arms = [_o for _o in _resolved if _o.type == "ARMATURE"]',
    '    else:',
    '        _scene_objs = getattr(_scene, "objects", bpy.data.objects)',
    '        _meshes = [_o for _o in _scene_objs if _o.type == "MESH" and not getattr(_o, "hide_viewport", False)]',
    '',
    '    if not _meshes:',
    '        _issues.append("No MESH objects found to inspect")',
    '',
    '    _tot_verts = 0',
    '    _tot_tris = 0',
    '    _tot_quads = 0',
    '    _tot_ngons = 0',
    '    _tot_polys = 0',
    '    _tot_non_manifold = 0',
    '    _tot_loose_verts = 0',
    '    _tot_zero_faces = 0',
    '    _tot_unweighted = 0',
    '    _tot_unnormalized = 0',
    '    _uv_counts = []',
    '    _mat_names = set()',
    '    _mat_slots_non_null = 0',
    '    _shape_keys = []',
    '    _shape_key_set = set()',
    '    _linked_arms = []',
    '    for _a in _explicit_arms:',
    '        if _a not in _linked_arms:',
    '            _linked_arms.append(_a)',
    '',
    '    for _o in _meshes:',
    '        _me = _o.data',
    '        if _me is None:',
    '            _issues.append("Mesh object %s has no mesh datablock" % _o.name)',
    '            continue',
    '',
    '        _polys = getattr(_me, "polygons", [])',
    '        _verts = getattr(_me, "vertices", [])',
    '        _v_cnt = len(_verts)',
    '        _t_cnt = sum(max(0, len(_p.vertices) - 2) for _p in _polys)',
    '        _q_cnt = sum(1 for _p in _polys if len(_p.vertices) == 4)',
    '        _n_cnt = sum(1 for _p in _polys if len(_p.vertices) > 4)',
    '        _p_cnt = len(_polys)',
    '',
    '        _bm = bmesh.new()',
    '        try:',
    '            _bm.from_mesh(_me)',
    '            _nm_cnt = sum(1 for _e in _bm.edges if not _e.is_manifold)',
    '            _lv_cnt = sum(1 for _v in _bm.verts if len(_v.link_edges) == 0)',
    '            _zf_cnt = sum(1 for _f in _bm.faces if _f.calc_area() <= 1e-8)',
    '        finally:',
    '            _bm.free()',
    '',
    '        _uv_cnt = len(getattr(_me, "uv_layers", []))',
    '        _uv_counts.append(_uv_cnt)',
    '        if _req_uv and _uv_cnt == 0:',
    '            _issues.append("Mesh %s has no UV layers" % _o.name)',
    '',
    '        for _m in getattr(_me, "materials", []):',
    '            if _m is not None:',
    '                _mat_slots_non_null += 1',
    '                _mat_names.add(_m.name)',
    '',
    '        _sk = getattr(_me, "shape_keys", None)',
    '        if _sk is not None and getattr(_sk, "key_blocks", None):',
    '            for _kb in _sk.key_blocks:',
    '                if _kb.name != "Basis" and _kb.name not in _shape_key_set:',
    '                    _shape_key_set.add(_kb.name)',
    '                    _shape_keys.append(_kb.name)',
    '',
    '        _obj_arms = []',
    '        if getattr(_o, "parent", None) is not None and _o.parent.type == "ARMATURE":',
    '            _obj_arms.append(_o.parent)',
    '        for _mod in getattr(_o, "modifiers", []):',
    '            if getattr(_mod, "type", None) == "ARMATURE" and getattr(_mod, "object", None) is not None:',
    '                if _mod.object not in _obj_arms:',
    '                    _obj_arms.append(_mod.object)',
    '        for _a in _obj_arms:',
    '            if _a not in _linked_arms:',
    '                _linked_arms.append(_a)',
    '',
    '        _vgs = list(getattr(_o, "vertex_groups", []))',
    '        if _obj_arms or _vgs:',
    '            _bone_names = set()',
    '            for _a in _obj_arms:',
    '                for _b in getattr(getattr(_a, "data", None), "bones", []):',
    '                    if getattr(_b, "use_deform", True):',
    '                        _bone_names.add(_b.name)',
    '            _deform_indices = {_vg.index for _vg in _vgs if _vg.name in _bone_names}',
    '            if not _deform_indices:',
    '                _deform_indices = {_vg.index for _vg in _vgs}',
    '            if _obj_arms and not _deform_indices:',
    '                _tot_unweighted += _v_cnt',
    '            elif _deform_indices:',
    '                for _v in _verts:',
    '                    _ws = [',
    '                        float(_g.weight)',
    '                        for _g in getattr(_v, "groups", [])',
    '                        if _g.group in _deform_indices and float(_g.weight) > 0.0',
    '                    ]',
    '                    if not _ws:',
    '                        _tot_unweighted += 1',
    '                    else:',
    '                        _sum_w = sum(_ws)',
    '                        if abs(_sum_w - 1.0) > 0.01:',
    '                            _tot_unnormalized += 1',
    '',
    '        _tot_verts += _v_cnt',
    '        _tot_tris += _t_cnt',
    '        _tot_quads += _q_cnt',
    '        _tot_ngons += _n_cnt',
    '        _tot_polys += _p_cnt',
    '        _tot_non_manifold += _nm_cnt',
    '        _tot_loose_verts += _lv_cnt',
    '        _tot_zero_faces += _zf_cnt',
    '',
    '    _bones_count = sum(len(getattr(getattr(_a, "data", None), "bones", [])) for _a in _linked_arms)',
    '    _ngon_ratio = round(_tot_ngons / _tot_polys, 4) if _tot_polys > 0 else 0.0',
    '    _uv_layers_count = min(_uv_counts) if _uv_counts else 0',
    '    _materials_count = len(_mat_names) if _mat_names else _mat_slots_non_null',
    '',
    '    if _max_tris is not None and _tot_tris > int(_max_tris):',
    '        _issues.append("Triangle count %d exceeds max_tris %d" % (_tot_tris, int(_max_tris)))',
    '    if _req_manifold and _tot_non_manifold > 0:',
    '        _issues.append("Found %d non-manifold edges" % _tot_non_manifold)',
    '    if _req_manifold and _tot_loose_verts > 0:',
    '        _issues.append("Found %d loose vertices" % _tot_loose_verts)',
    '    if _tot_zero_faces > 0:',
    '        _issues.append("Found %d zero-area faces" % _tot_zero_faces)',
    '    if _linked_arms and _tot_unweighted > 0:',
    '        _issues.append("Found %d unweighted vertices on rigged mesh" % _tot_unweighted)',
    '    if _linked_arms and _tot_unnormalized > 0:',
    '        _issues.append("Found %d unnormalized vertex weight sums (|sum - 1.0| > 0.01)" % _tot_unnormalized)',
    '',
    '    _missing_arkit = []',
    '    if _req_arkit52:',
    '        _missing_arkit = [_s for _s in _arkit52 if _s not in _shape_key_set]',
    '        if _missing_arkit:',
    '            _issues.append("Missing %d of 52 ARKit blendshapes" % len(_missing_arkit))',
    '',
    '    _metrics = {',
    '        "vertices": _tot_verts,',
    '        "triangles": _tot_tris,',
    '        "quads": _tot_quads,',
    '        "ngons": _tot_ngons,',
    '        "ngon_ratio": _ngon_ratio,',
    '        "non_manifold_edges": _tot_non_manifold,',
    '        "loose_verts": _tot_loose_verts,',
    '        "zero_area_faces": _tot_zero_faces,',
    '        "uv_layers_count": _uv_layers_count,',
    '        "materials_count": _materials_count,',
    '        "bones_count": _bones_count,',
    '        "unweighted_vertices": _tot_unweighted,',
    '        "unnormalized_vertices": _tot_unnormalized,',
    '        "shape_keys": _shape_keys,',
    '        "missing_arkit_shapes": _missing_arkit,',
    '    }',
    '',
    '    if _rt_glb and _meshes:',
    '        _orig_height = _world_height(_meshes)',
    '        _orig_obj_names = {x.name for x in bpy.data.objects}',
    '        _orig_mesh_names = {x.name for x in getattr(bpy.data, "meshes", [])}',
    '        _orig_arm_names = {x.name for x in getattr(bpy.data, "armatures", [])}',
    '        _orig_mat_names = {x.name for x in getattr(bpy.data, "materials", [])}',
    '        _orig_img_names = {x.name for x in getattr(bpy.data, "images", [])}',
    '        _orig_act_names = {x.name for x in getattr(bpy.data, "actions", [])}',
    '        _orig_cam_names = {x.name for x in getattr(bpy.data, "cameras", [])}',
    '        _vl = getattr(bpy.context, "view_layer", None)',
    '        _orig_active_lc = getattr(_vl, "active_layer_collection", None) if _vl else None',
    '        _orig_active_name = _vl.objects.active.name if (_vl and getattr(_vl.objects, "active", None) is not None) else None',
    '        _orig_selected_names = {',
    '            _o.name for _o in (getattr(_vl, "objects", []) if _vl else [])',
    '            if hasattr(_o, "select_get") and _o.select_get()',
    '        }',
    '        _tmp_col = None',
    '        try:',
    '            _rt_abs = os.path.abspath(_rt_glb)',
    '            _rt_dir = os.path.dirname(_rt_abs)',
    '            if _rt_dir:',
    '                os.makedirs(_rt_dir, exist_ok=True)',
    '            _tmp_col = bpy.data.collections.new("__hsa_qa_roundtrip__")',
    '            _scene.collection.children.link(_tmp_col)',
    '            if _vl is not None and hasattr(_vl, "layer_collection"):',
    '                _tmp_lc = _find_layer_col(_vl.layer_collection, _tmp_col)',
    '                if _tmp_lc is not None:',
    '                    _vl.active_layer_collection = _tmp_lc',
    '',
    '            _export_use_sel = False',
    '            if _target_names and _vl is not None:',
    '                _export_names = {_o.name for _o in _meshes} | {_a.name for _a in _linked_arms}',
    '                for _o in getattr(_vl, "objects", []):',
    '                    if hasattr(_o, "select_set"):',
    '                        _o.select_set(_o.name in _export_names)',
    '                _export_use_sel = True',
    '',
    '            bpy.ops.export_scene.gltf(filepath=_rt_abs, export_format="GLB", use_selection=_export_use_sel)',
    '            bpy.ops.import_scene.gltf(filepath=_rt_abs)',
    '',
    '            _imp_objs = [_o for _o in bpy.data.objects if _o.name not in _orig_obj_names]',
    '            _imp_meshes = [_o for _o in _imp_objs if _o.type == "MESH"]',
    '            _imp_arms = [_o for _o in _imp_objs if _o.type == "ARMATURE"]',
    '            _imp_height = _world_height(_imp_meshes)',
    '            _imp_bones = sum(len(getattr(getattr(_a, "data", None), "bones", [])) for _a in _imp_arms)',
    '            if _orig_height <= 1e-6 and _imp_height <= 1e-6:',
    '                _h_err = 0.0',
    '            else:',
    '                _h_err = round(abs(_imp_height - _orig_height) / max(_orig_height, 1e-6) * 100.0, 4)',
    '            _b_match = (_imp_bones == _bones_count)',
    '            _metrics["height_error_pct"] = _h_err',
    '            _metrics["bones_match"] = _b_match',
    '            if _h_err > 1.0:',
    '                _issues.append("GLB roundtrip height error %.4f%% exceeds 1%%" % _h_err)',
    '            if not _b_match:',
    '                _issues.append("GLB roundtrip bone count mismatch: expected %d, got %d" % (_bones_count, _imp_bones))',
    '        finally:',
    '            for _o in [x for x in list(bpy.data.objects) if x.name not in _orig_obj_names]:',
    '                try:',
    '                    bpy.data.objects.remove(_o, do_unlink=True)',
    '                except Exception:',
    '                    pass',
    '            for _db_attr, _orig_names in [',
    '                ("meshes", _orig_mesh_names),',
    '                ("armatures", _orig_arm_names),',
    '                ("materials", _orig_mat_names),',
    '                ("images", _orig_img_names),',
    '                ("actions", _orig_act_names),',
    '                ("cameras", _orig_cam_names),',
    '            ]:',
    '                _db = getattr(bpy.data, _db_attr, None)',
    '                if _db is not None and hasattr(_db, "remove"):',
    '                    for _item in [x for x in list(_db) if x.name not in _orig_names]:',
    '                        try:',
    '                            _db.remove(_item)',
    '                        except Exception:',
    '                            pass',
    '            if _tmp_col is not None:',
    '                try:',
    '                    bpy.data.collections.remove(_tmp_col)',
    '                except Exception:',
    '                    pass',
    '            if _vl is not None:',
    '                if _orig_active_lc is not None:',
    '                    try:',
    '                        _vl.active_layer_collection = _orig_active_lc',
    '                    except Exception:',
    '                        pass',
    '                for _o in getattr(_vl, "objects", []):',
    '                    if hasattr(_o, "select_set"):',
    '                        try:',
    '                            _o.select_set(_o.name in _orig_selected_names)',
    '                        except Exception:',
    '                            pass',
    '                if hasattr(_vl, "objects"):',
    '                    try:',
    '                        _vl.objects.active = bpy.data.objects.get(_orig_active_name) if _orig_active_name else None',
    '                    except Exception:',
    '                        pass',
    '',
    '    _checked = [_o.name for _o in _meshes]',
    '    return {',
    '        "passed": len(_issues) == 0,',
    '        "issues": _issues,',
    '        "metrics": _metrics,',
    '        "objects_checked": _checked,',
    '    }',
    '',
    '_result = _run_asset_qa()',
  ].join('\n');
}

export interface ObjectSummary {
  name: string;
  type: string;
  parent: string | null;
  location: number[];
  dimensions: number[];
  modifiers: number;
  materials: string[];
  hidden: boolean;
}

function pyList(values: number[]): string {
  return `[${values.map((v) => Number(v.toFixed(6))).join(', ')}]`;
}

function pyStr(value: string): string {
  return `'${value.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;
}

/**
 * The fields a diff is computed over.
 *
 * Name and type identify; the rest is what a modelling step actually changes.
 * A diff over names alone would report "nothing changed" for a moved object,
 * which is the case that matters most here.
 */
const FINGERPRINT_KEYS = ['type', 'location', 'dimensions', 'scale', 'rotation', 'modifiers', 'materials'] as const;

function fingerprint(o: ObjectSummary): string {
  return JSON.stringify(FINGERPRINT_KEYS.map((k) => (o as unknown as Record<string, unknown>)[k]));
}

/**
 * Where the next page starts, or null when this one reached the end.
 *
 * The real total, not the page length: reporting a next_offset when the page
 * happened to be the last one makes a caller loop for a page that never comes.
 */
function nextOffset(offset: number, returned: number, total: number): number | null {
  const end = offset + returned;
  return end < total ? end : null;
}

export function keyOf(o: ObjectSummary): string {
  return `${o.type}:${o.name}`;
}

export class SceneSnapshot {
  private baseline: Map<string, string> | null = null;
  private baselineScene: string | null = null;

  get hasBaseline(): boolean {
    return this.baseline !== null;
  }

  get capturedAt(): string | null {
    return this.baselineScene;
  }

  /**
   * Compare against the previous call, then become the new baseline.
   *
   * First call has nothing to compare against and says so rather than
   * reporting an empty diff, which would read as "nothing changed".
   */
  diff(objects: ObjectSummary[]): {
    first_call: boolean;
    added: ObjectSummary[];
    removed: ObjectSummary[];
    changed: ObjectSummary[];
    unchanged_count: number;
    total_items: number;
  } {
    const next = new Map(objects.map((o) => [keyOf(o), fingerprint(o)]));

    if (this.baseline === null) {
      this.baseline = next;
      this.baselineScene = new Date().toISOString();
      return { first_call: true, added: [], removed: [], changed: [], unchanged_count: 0, total_items: next.size };
    }

    const added: ObjectSummary[] = [];
    const changed: ObjectSummary[] = [];
    let unchanged = 0;

    for (const o of objects) {
      const before = this.baseline.get(keyOf(o));
      if (before === undefined) added.push(o);
      else if (before !== fingerprint(o)) changed.push(o);
      else unchanged += 1;
    }

    const removedKeys = [...this.baseline.keys()].filter((k) => !next.has(k));
    const removed = removedKeys
      .map((k) => {
        const [type, ...rest] = k.split(':');
        return { name: rest.join(':'), type } as ObjectSummary;
      })
      .filter((o) => this.baseline!.has(keyOf(o)));

    this.baseline = next;
    this.baselineScene = new Date().toISOString();

    return { first_call: false, added, removed, changed, unchanged_count: unchanged, total_items: next.size };
  }

  reset(): void {
    this.baseline = null;
    this.baselineScene = null;
  }
}

export class BlenderTools {
  private readonly client: BlenderClient;
  readonly snapshot = new SceneSnapshot();

  constructor(client: BlenderClient) {
    this.client = client;
  }

  /**
   * Run a generated script and reject a failed one.
   *
   * `{ok: false}` inside a successful call is the shape that turns a failed
   * script into a silent wrong answer, so it is raised at the only place every
   * tool passes through.
   */
  private async run(code: string, cap = EXEC_OUTPUT_CAP): Promise<{ result: unknown; stdout: string; stdout_truncated: boolean; stdout_bytes_dropped: number; elapsed_ms?: number }> {
    const reply = await this.client.exec(code, cap);
    if (!reply.ok) {
      throw new BlenderError(reply.error ?? 'script failed', reply.stdout?.trim() || reply.traceback);
    }
    return {
      result: reply.result,
      stdout: reply.stdout,
      stdout_truncated: reply.stdout_truncated,
      stdout_bytes_dropped: reply.stdout_bytes_dropped,
      elapsed_ms: reply.elapsed_ms,
    };
  }

  private objectScript(where: string, offset: number, limit: number): string {
    // Substituted, not string-concatenated at the top: exec() requires the
    // import at column 0, and an indented one is a SyntaxError the caller
    // would see as a Blender problem.
    return [
      'import bpy',
      where,
      '_rows = [',
      '    {',
      '        "name": o.name,',
      '        "type": o.type,',
      '        "parent": o.parent.name if o.parent else None,',
      '        "location": [round(v, 6) for v in o.location],',
      '        "dimensions": [round(v, 6) for v in o.dimensions],',
      '        "scale": [round(v, 6) for v in o.scale],',
      '        "rotation": [round(v, 6) for v in o.rotation_euler],',
      '        "modifiers": len(o.modifiers),',
      '        "materials": [m.name if m else None for m in getattr(o.data, "materials", [])],',
      '        "hidden": o.hide_viewport,',
      '    }',
      '    for o in _src',
      ']',
      `_result = {"objects": _rows[${offset}:${offset + limit}], "total_items": len(_rows)}`,
    ].join('\n');
  }

  async health(): Promise<Envelope<Record<string, unknown>>> {
    const health = await this.client.health();
    return withPage({ ...health }, 1, 1, null, measure(health));
  }

  async getSceneInfo(offset = 0, limit = DEFAULT_PAGE_LIMIT): Promise<Envelope<Record<string, unknown>>> {
    const all = await this.run(this.objectScript('_src = list(bpy.data.objects)', offset, Math.min(limit, MAX_PAGE_LIMIT)));
    const rows = (all.result as { objects: ObjectSummary[]; total_items: number }).objects;
    const total = (all.result as { total_items: number }).total_items;

    // The object list above already proves an add-on is answering, so an empty
    // context here means this Blender arrived after the startup handshake gave
    // up — not that there is nothing to report. Filling it on the read is what
    // keeps the version and the scene from staying "unknown" beside a real
    // object list, and costs one extra call only on the first read of a session.
    if (this.version === null) {
      await this.primeContext();
    }

    const info = {
      blender: this.blenderVersion(),
      scene: this.sceneName(),
      frame_current: this.frameCurrent(),
      objects_in_page: rows,
    };

    return withPage(info, total, rows.length, nextOffset(offset, rows.length, total), measure(info));
  }

  async listObjects(offset = 0, limit = DEFAULT_PAGE_LIMIT, type?: string): Promise<Envelope<{ objects: ObjectSummary[] }>> {
    const where = type
      ? `_src = [o for o in bpy.data.objects if o.type == ${pyStr(type)}]`
      : '_src = list(bpy.data.objects)';
    const all = await this.run(this.objectScript(where, offset, limit));
    const rows = (all.result as { objects: ObjectSummary[]; total_items: number }).objects;
    const total = (all.result as { total_items: number }).total_items;

    const budget: Budget = { bytes: byteLength(JSON.stringify(rows)), truncated: false, bytes_returned: byteLength(JSON.stringify(rows)) };
    return withPage({ objects: rows }, total, rows.length, nextOffset(offset, rows.length, total), budget);
  }

  async describeObject(name: string): Promise<Envelope<Record<string, unknown>>> {
    const out = await this.run([
      'import bpy',
      `_obj = bpy.data.objects.get(${pyStr(name)})`,
      'if _obj is None:',
      `    _result = {"error": "no object named " + ${pyStr(name)}}`,
      'else:',
      '    _data = getattr(_obj, "data", None)',
      '    _result = {',
      '        "name": _obj.name,',
      '        "type": _obj.type,',
      '        "parent": _obj.parent.name if _obj.parent else None,',
      '        "location": [round(v, 6) for v in _obj.location],',
      '        "rotation_euler": [round(v, 6) for v in _obj.rotation_euler],',
      '        "scale": [round(v, 6) for v in _obj.scale],',
      '        "dimensions": [round(v, 6) for v in _obj.dimensions],',
      '        "hidden": _obj.hide_viewport,',
      '        "modifiers": [{"name": m.name, "type": m.type} for m in _obj.modifiers],',
      '        "materials": [m.name if m else None for m in getattr(_data, "materials", [])],',
      '        "custom_properties": {k: str(_obj[k])[:200] for k in _obj.keys() if not k.startswith("_RNA")},',
      '        "mesh": None if _data is None or not hasattr(_data, "vertices") else {',
      '            "vertices": len(_data.vertices),',
      '            "edges": len(_data.edges),',
      '            "polygons": len(_data.polygons),',
      '        },',
      '        "children": [c.name for c in _obj.children],',
      '    }',
    ].join('\n'));
    const data = out.result as Record<string, unknown>;
    if (data && typeof data === 'object' && 'error' in data) {
      throw new BlenderError(String(data.error));
    }
    return { status: 'ok', data, meta: { truncated: false, bytes_returned: byteLength(JSON.stringify(data)) } };
  }

  async getSelection(): Promise<Envelope<{ selected: string[]; active: string | null; mode: string }>> {
    const out = await this.run([
      'import bpy',
      '_view = bpy.context.view_layer',
      '_active = _view.objects.active',
      '_result = {',
      '    "selected": [o.name for o in _view.objects if o.select_get()],',
      '    "active": _active.name if _active else None,',
      '    "mode": bpy.context.mode,',
      '}',
    ].join('\n'));
    const data = out.result as { selected: string[]; active: string | null; mode: string };
    return withPage(data, data.selected.length, data.selected.length, null, measure(data));
  }

  /**
   * What changed since the last call.
   *
   * Costs O(changed) to read instead of O(scene), which is the difference
   * between checking a 4000-object file and being unable to check one.
   */
  async sceneDiff(offset = 0, limit = DEFAULT_PAGE_LIMIT): Promise<Envelope<Record<string, unknown>>> {
    const listed = await this.listObjects(0, MAX_PAGE_LIMIT);
    const all = (listed.data as { objects: ObjectSummary[] }).objects;
    const diff = this.snapshot.diff(all);

    const changes = [
      ...diff.added.map((o) => ({ change: 'added', object: o })),
      ...diff.changed.map((o) => ({ change: 'modified', object: o })),
      ...diff.removed.map((o) => ({ change: 'removed', object: o })),
    ];

    const p = page(changes, offset, limit);
    const data = {
      first_call: diff.first_call,
      baseline: this.snapshot.capturedAt,
      changes: p.items,
      unchanged_count: diff.unchanged_count,
      note: diff.first_call
        ? 'no previous snapshot in this bridge process; this call established the baseline'
        : undefined,
    };
    return withPage(data, changes.length, p.items.length, p.nextOffset, {
      bytes: byteLength(JSON.stringify(data)),
      truncated: p.truncated,
      bytes_returned: byteLength(JSON.stringify(data)),
    });
  }

  /**
   * The escape hatch.
   *
   * Marked as mutating in the manifest so the caller has to say it means it,
   * and the stdout is capped at the source with what was dropped reported.
   */
  async executePython(code: string, stdoutCapBytes = EXEC_OUTPUT_CAP): Promise<Envelope<Record<string, unknown>>> {
    if (!code || !code.trim()) {
      throw new BlenderError('code is required');
    }
    const out = await this.run(code, stdoutCapBytes);
    const clipped = clipText(out.stdout, stdoutCapBytes);
    const data = {
      result: out.result ?? null,
      stdout: clipped.text,
      stdout_truncated: out.stdout_truncated,
      stdout_bytes: clipped.bytes_returned,
      stdout_bytes_dropped: out.stdout_bytes_dropped,
      elapsed_ms: out.elapsed_ms,
    };
    return withPage(data, 1, 1, null, measure(data));
  }

  private async runWithHeadlessHint(code: string, cap = EXEC_OUTPUT_CAP) {
    try {
      return await this.run(code, cap);
    } catch (err) {
      if (
        err instanceof BlenderError &&
        /nothing is listening|no reply from Blender|connection closed|ECONNREFUSED/i.test(err.message)
      ) {
        throw new BlenderError(
          `${err.message} — Blender GUI add-on is not reachable; open Blender with HSA Blender Bridge enabled or use blender_run_headless.`,
          err.detail,
        );
      }
      throw err;
    }
  }

  async runHeadless(opts: HeadlessOptions): Promise<Envelope<Record<string, unknown>>> {
    const out = await runBlenderHeadless(opts);
    const data = out as unknown as Record<string, unknown>;
    return withPage(data, 1, 1, null, measure(data));
  }

  async renderViews(opts: RenderViewsOptions): Promise<Envelope<Record<string, unknown>>> {
    if (!opts.outputPath || !opts.outputPath.trim()) {
      throw new BlenderError('output_path is required');
    }
    const resolution = Math.min(Math.max(32, Math.floor(opts.resolution ?? 512)), 2048);
    const views =
      Array.isArray(opts.views) && opts.views.length > 0
        ? opts.views.map((v) => String(v))
        : ['front', 'right', 'top', 'persp'];
    const targetObjects =
      Array.isArray(opts.targetObjects) && opts.targetObjects.length > 0
        ? opts.targetObjects.map((n) => String(n))
        : null;
    const referenceMaskPath =
      opts.referenceMaskPath && opts.referenceMaskPath.trim() ? opts.referenceMaskPath.trim() : null;

    const script = buildRenderViewsScript({
      outputPath: opts.outputPath.trim(),
      targetObjects,
      resolution,
      views,
      referenceMaskPath,
    });
    const out = await this.runWithHeadlessHint(script);
    const data = out.result as Record<string, unknown>;
    if (data && typeof data === 'object' && 'error' in data) {
      throw new BlenderError(String(data.error));
    }
    return withPage(data, views.length, views.length, null, measure(data));
  }

  async assetQa(opts: AssetQaOptions = {}): Promise<Envelope<Record<string, unknown>>> {
    const targetObjects =
      Array.isArray(opts.targetObjects) && opts.targetObjects.length > 0
        ? opts.targetObjects.map((n) => String(n))
        : null;
    const maxTris = typeof opts.maxTris === 'number' && Number.isFinite(opts.maxTris) ? Math.floor(opts.maxTris) : null;
    const roundtripGlbPath =
      opts.roundtripGlbPath && opts.roundtripGlbPath.trim() ? opts.roundtripGlbPath.trim() : null;

    const script = buildAssetQaScript({
      targetObjects,
      maxTris,
      requireUv: Boolean(opts.requireUv),
      requireManifold: Boolean(opts.requireManifold),
      requireArkit52: Boolean(opts.requireArkit52),
      roundtripGlbPath,
    });
    const out = await this.runWithHeadlessHint(script);
    const data = out.result as {
      passed: boolean;
      issues: string[];
      metrics: Record<string, unknown>;
      objects_checked: string[];
    };
    const checkedCount = Array.isArray(data?.objects_checked) ? data.objects_checked.length : 0;
    return withPage(data as unknown as Record<string, unknown>, checkedCount, checkedCount, null, measure(data));
  }

  // Filled in by the health probe so a scene report carries the version that
  // produced it; a diff taken across a Blender restart is not a valid diff.
  private version: string | null = null;
  private scene: string | null = null;
  private frame: number | null = null;

  blenderVersion(): string { return this.version ?? 'unknown'; }
  sceneName(): string { return this.scene ?? 'unknown'; }
  private frameCurrent(): number { return this.frame ?? 0; }

  async primeContext(): Promise<void> {
    const out = await this.run([
      'import bpy',
      '_result = {',
      '    "blender": bpy.app.version_string,',
      '    "scene": bpy.context.scene.name,',
      '    "frame": bpy.context.scene.frame_current,',
      '}',
    ].join('\n'));
    const data = out.result as { blender: string; scene: string; frame: number };
    this.version = data.blender;
    this.scene = data.scene;
    this.frame = data.frame;
  }
}

export { errorEnvelope };
