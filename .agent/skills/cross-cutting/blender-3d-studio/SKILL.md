---
name: blender-3d-studio
description: "Production 3D asset pipeline via Blender bpy (GUI bridge & headless) + Cloud 3D APIs: 9-phase anti-blind modeling, procedural PBR/ORM baking, 52-bone Humanoid + 52 ARKit blendshapes, deterministic QA, and Unity/UE5/Godot/Three.js export."
detect: ["*.blend", "*.fbx", "*.glb", "*.gltf"]
category: cross-cutting
tier: 1
---

# Blender 3D & Cloud Asset Studio — DOMYH Agent Kit

> **Zero Local GPU Needed**: Procedural `bpy` + Cycles CPU/Cloud 3D REST APIs + Vision QA
> **Anti-Blind Guarantee**: Never advance past blockout or export without `blender_render_views` + `blender_asset_qa`

---

## 🧭 Execution Mode & Synthesis Decision Matrix

| Scenario | Synthesis Path | Execution Transport | When to Choose |
|:---------|:---------------|:--------------------|:---------------|
| Hard-surface prop, weapon, architecture, modular kit | Pure Procedural `bpy` + Modifiers + Geometry Nodes | `blender_execute_python` (GUI `127.0.0.1:28782`) or `blender_run_headless` | Exact dimensions, crisp bevels, clean quad topology |
| Stylized / organic hero character or creature | Cloud 3D API (`Meshy` / `Tripo` / `Rodin`) **OR** Parametric Base Mesh $\to$ `bpy` Retopo & Sculpt Cleanup | Cloud REST $\to$ `blender_run_headless` | Complex organic silhouette where raw `bpy` primitives look robotic |
| Live user co-editing in open Blender Editor | Interactive `bpy` deltas + undo-safe checkpoints | `hsa_bridge({ target: 'blender', action: 'call', tool: 'blender_execute_python' })` | User is watching viewport on port `28782` |
| CI / Headless server / Closed Blender | Standalone script execution (`blender -b -P`) | `hsa_bridge({ target: 'blender', action: 'call', tool: 'blender_run_headless' })` | Automated batch generation, LOD baking, `.glb`/`.fbx` QA |

---

## 🛡️ 9-Phase Anti-Blind 3D Pipeline (Mandatory for Claude / GPT / Gemini)

LLMs fail at 3D when they write 400 lines of `bpy` coordinates in one shot without looking. Execute these **9 gated phases** sequentially:

### Phase 1: Metrics & Spec Lock
- Read `.agent/specs/art-bible.yaml` and `.agent/specs/<id>.spec.yaml` (scaffold via `/asset spec` if missing).
- Lock `unit_scale_meters: 1.0`, `up_axis`, pivot (`bottom_center` at `(0,0,0)`), `lod_triangle_budgets`, and `character_proportions_heads` (e.g., `7.5` heads = `1.80m`).

### Phase 2: Volumetric Blockout & Silhouette Gate (`IoU >= 0.85`)
- Spawn low-poly primitives (`Cube`, `Cylinder`, `UVSphere`, `Skin` armature volumes) strictly matching bounding-box proportions.
- Render 4 orthographic/perspective sheets via `blender_render_views` (`front`, `side`, `three_quarter`, `top`).
- If reference silhouette mask exists, verify `hsa_design({ action: 'silhouette_iou', render_path, ref_path }) >= 0.85`. Inspect contact sheet with Vision before adding detail.

### Phase 3: Primary & Secondary Forms (`IoU >= 0.90`)
- Construct armor plates, limbs, joints, and Negative Space cutouts. Join boolean parts cleanly, apply Voxel/QuadriFlow remesh if needed, and re-verify `silhouette_iou >= 0.90`.

### Phase 4: Modifiers, Geometry Nodes, SubD & Weighted Normals
- Stack non-destructive modifiers in strict order: `Mirror (bisect+clip)` $\to$ `Solidify` $\to$ `Bevel (limit_method='WEIGHT', segments=2)` $\to$ `Subdivision` $\to$ `WeightedNormal (keep_sharp=True)`.
- Enable `shade_auto_smooth` / sharp edge creases so curved and hard-surface faces shade cleanly without dark gradients.

### Phase 5: Smart / Seam UV Unwrap & Texel Density
- Mark seams along hidden anatomical/structural cuts (inner limbs, under-chin, back-plate seams) or run `uv.smart_project(angle_limit=66, island_margin=0.008)`.
- Enforce `min_island_margin_px >= 8` (at target `texture_size`) and `0%` unintended UV overlap; scale islands to match `texel_density_px_per_meter` (e.g., `512 px/m`).

### Phase 6: Procedural PBR Shader & ORM Channel Baking
- Build Principled BSDF procedural materials (`Noise` + `Voronoi` + `AmbientOcclusion` + `Curvature/Pointiness` wear masks — see `data/bpy-modeling-pbr.yaml`).
- Bake game-ready textures at `texture_size`:
  - `BaseColor` (`sRGB`), `Emissive` (`sRGB`)
  - `ORM` packed texture (`Linear` / `Non-Color`: **R = Ambient Occlusion**, **G = Roughness**, **B = Metallic**)
  - `Normal` (`Linear` / `Non-Color`: **OpenGL `+Y`** for Unity/Godot/Three.js; **DirectX `-Y`** green-flipped for Unreal Engine 5).

### Phase 7: Rigify 52 Humanoid Game Bones & 52 ARKit Blendshapes
- Generate 52-bone game humanoid hierarchy (`Root` at `(0,0,0)`, `Hips`, `Spine..Spine2`, `Neck`, `Head`, `Clavicle/Arm/ForeArm/Hand` + 30 finger joints, `UpLeg/Leg/Foot/Toe`).
- Bind with Automatic Weights $\to$ `vertex_group_limit_total(limit=4)` $\to$ `vertex_group_normalize_all()`.
- Author `Basis` + **52 Apple ARKit Facial Blendshapes** (`eyeBlinkLeft`..`tongueOut`) + **15 Visemes** (`sil`, `PP`..`U`) from `data/rigging-arkit52.yaml`.

### Phase 8: Deterministic `blender_asset_qa` & `.glb` Round-Trip
- Run `blender_asset_qa` against spec thresholds:
  - `triangles <= lod0`, `ngon_ratio <= 0.02`, `non_manifold_edges == 0`
  - `unweighted_vertices == 0`, `scale == [1.0, 1.0, 1.0]`, `uv_overlap_ratio == 0`
- **Round-Trip Proof**: Export `.glb` into temp path, re-import into a clean `bpy.ops.wm.read_factory_settings(use_empty=True)` scene, and verify mesh count, bone count (`>= 52`), shapekey count (`>= 52`), and embedded material slots survive intact.

### Phase 9: Engine-Targeted Export
- Export final asset + LOD1 (`0.5` decimate) + LOD2 (`0.2` decimate) using exact axis/scale flags from `data/engine-export-profiles.yaml`.

---

## ☁️ Optional Cloud 3D REST API Integration (Meshy / Tripo / Rodin)

When organic sculpting is required without local GPU:
1. Generate clean Orthographic Front/3-4 reference PNG on solid neutral background (`gemini-media-gen` or GPT Image).
2. Submit Image-to-3D task via REST (`MESHY_API_KEY`, `TRIPO_API_KEY`, or `RODIN_API_KEY`) requesting quad-preferred `.glb` output.
3. **NEVER ship raw Cloud 3D meshes directly** — pass downloaded `.glb` into `blender_run_headless` to:
   - Center pivot at `(0, 0, 0)` bottom-center & normalize height to `dimensions_meters.height`.
   - Run `bpy.ops.object.quadriflow_remesh(target_faces=...)` or planar decimate to hit `lod0`.
   - Re-unwrap UVs with proper `8px` island padding and re-bake clean **ORM + Tangents Normal** from high-poly source to low-poly game mesh.
   - Bind 52-bone Humanoid rig + ARKit shapekeys and pass Phase 8 QA.

---

## 🔁 Closed-Loop Verification Recipe (`hsa_execute`)

Chain execution + math QA + multi-angle render in a single `hsa_execute` turn (max 3 repair loops):

```javascript
// Execute inside hsa_execute({ allow_mutations: true })
const status = await hsa.bridge({ target: 'blender', action: 'status' });
const useGui = status?.reachable === true;

// 1. Run modeling/rigging script via live GUI (port 28782) or headless CLI
const execRes = await hsa.bridge({
  target: 'blender',
  action: 'call',
  tool: useGui ? 'blender_execute_python' : 'blender_run_headless',
  payload: { script_path: '.domyh/scratch/build_asset.py', save_blend: 'assets/3d/chr_knight.blend' }
});

// 2. Deterministic Geometry, UV, Rig & Scale QA
const qa = await hsa.bridge({
  target: 'blender',
  action: 'call',
  tool: 'blender_asset_qa',
  payload: {
    blend_path: 'assets/3d/chr_knight.blend',
    max_triangles: 12000,
    max_ngon_ratio: 0.02,
    require_rig_bones: 52,
    require_shapekeys: 52
  }
});

// 3. Multi-angle Contact Sheet Render for Vision Inspection
const views = await hsa.bridge({
  target: 'blender',
  action: 'call',
  tool: 'blender_render_views',
  payload: {
    blend_path: 'assets/3d/chr_knight.blend',
    output_dir: '.domyh/game-evidence/chr_knight_views',
    views: ['front', 'side', 'three_quarter', 'back', 'wireframe'],
    resolution: [768, 768]
  }
});

return { useGui, qa, views };
```

---

## ⚠️ Critical `bpy` Gotchas

| # | Trap | Producing-Boundary Fix |
|:--|:-----|:-----------------------|
| 1 | Unapplied object scale (`scale != 1,1,1`) breaks engine physics & normals | Always `bpy.ops.object.transform_apply(location=False, rotation=True, scale=True)` before UV unwrap & rigging |
| 2 | `Principled BSDF` input socket names changed in Blender 4.0 (`Specular` $\to$ `Specular IOR Level`, `Subsurface` $\to$ `Subsurface Weight`) | Use helper `set_bsdf_socket(bsdf, ['Subsurface Weight', 'Subsurface'], val)` from `data/bpy-modeling-pbr.yaml` |
| 3 | Baking ORM or Normal with `sRGB` image color space | Explicitly set `img.colorspace_settings.name = 'Non-Color'` **before** baking |
| 4 | FBX export to Unity adds extra `+90°` X rotation or `100x` scale | Use `apply_scale_options='FBX_SCALE_ALL'`, `axis_forward='-Z'`, `axis_up='Y'`, `bake_space_transform=True` |
| 5 | Unreal Engine Normal Map looks inverted on seams/crevices | Flip Green channel (`G = 1.0 - G`) for DirectX `-Y` normal handedness |
| 6 | Shapekeys silently dropped on FBX/glTF export with active Subdivision | Apply non-armature constructive modifiers (`Subdivision`, `Mirror`, `Bevel`) **before** authoring 52 ARKit shapekeys, or use `sk_keep` modifier apply helper |

---

## 📚 Progressive Data References

| File | Contents |
|:-----|:---------|
| `data/bpy-modeling-pbr.yaml` | Metric scene init, 7.5-head character blockout, Bevel+WeightedNormal stack, 5 procedural PBR/NPR node graphs (Scratched Metal, Stone, Skin SSS, Fabric, Toon), Cycles ORM + OpenGL/DirectX Normal baker |
| `data/rigging-arkit52.yaml` | 52-bone Humanoid armature generator, 4-bone weight limiter + unweighted vertex fixer, complete **52 Apple ARKit Blendshapes + 15 Visemes** table & procedural facial deformation Vectors |
| `data/engine-export-profiles.yaml` | Exact `export_scene.gltf` & `export_scene.fbx` kwargs + LOD generator + `.glb` round-trip verifier for Unity, Unreal Engine 5, Godot 4, and Three.js |
