---
name: webgl-shader-godot
description: "Production Three.js / React Three Fiber / WebGPU standards, cross-engine Combat VFX Shaders (GLSL/HLSL/WGSL/gdshader), and complete file-first Godot 4.x pipeline with hsa_canvas & headless CLI verification."
detect: ["project.godot", "*.tscn", "*.tres", "*.gd", "*.gdshader", "*.glsl", "*.wgsl"]
category: cross-cutting
tier: 1
---

# Three.js, R3F, Combat VFX Shaders & Godot 4 Pipeline

> **File-First & Zero-Bridge Native**: Both Three.js/R3F and Godot 4.x are 100% text-declarative (`JSX/TS`, `GLSL`, `project.godot`, `.tscn`, `.gd`, `.gdshader`) — ideal for Claude, GPT, and Gemini when paired with runtime visual proof (`hsa_canvas` and `godot --headless`).

---

## 🧭 Stack & Verification Routing

| Target Stack | Scene / Asset Format | Mandatory Verification Gate |
|:-------------|:---------------------|:----------------------------|
| **Three.js / R3F / WebGPU** | `.glb` (glTF 2.0) + `ShaderMaterial` / `TSL` | `hsa_canvas({ action: 'open' })` $\to$ `hsa_canvas({ action: 'capture' })` + check 0 WebGL errors + Visual Scorecard $\ge 8.0$ |
| **Godot 4.3+ (2D Pixel / SVG)** | `project.godot` + `.tscn` + `TileMapLayer` + `.gd` | `godot --headless --path . --quit-after 60` (0 script/parse errors) + `--write-movie` frame inspection |
| **Godot 4.3+ (3D Forward+/Compat)** | `.glb` import + `CharacterBody3D` + `.gdshader` | `godot --headless --path . --quit-after 60` + viewport screenshot inspection |
| **Combat VFX Shaders** | `.glsl` / `.wgsl` / `.gdshader` / Unity URP `.shader` | Animated multi-frame capture (`hsa_canvas` `frames: { count: 6 }`) proving alpha/dissolve progression |

---

## 🌐 Part 1: Three.js / React Three Fiber / WebGPU Production Standards

### 1. Strict Color-Space & glTF Texture Contract
Washed-out or pitch-black 3D web scenes almost always come from wrong texture color spaces:
- **Renderer**: `renderer.outputColorSpace = THREE.SRGBColorSpace`; `renderer.toneMapping = THREE.ACESFilmicToneMapping`; `renderer.toneMappingExposure = 1.0`.
- **Color Maps (`map`, `emissiveMap`)**: `tex.colorSpace = THREE.SRGBColorSpace`.
- **Data Maps (`normalMap`, `aoMap`, `roughnessMap`, `metalnessMap`)**: **MUST** be `tex.colorSpace = THREE.NoColorSpace` (Linear)!
- **External Textures Assigned to `.glb` UVs**: Set `tex.flipY = false` (glTF UV origin is top-left, whereas Three.js `TextureLoader` defaults to `flipY = true`).
- **Packed ORM Wiring**: Share one single `ORM` `Texture` instance across `material.aoMap = ormTex`, `material.roughnessMap = ormTex`, `material.metalnessMap = ormTex` (`MeshStandardMaterial` natively reads `R=AO, G=Roughness, B=Metalness`!).

### 2. Draw-Call Budgeting & VRAM Hygiene
- **Instancing Mandate**: Any prop repeated `> 50` times (trees, bullets, grass blades, dungeon tiles, debris) MUST use `THREE.InstancedMesh` (or Drei `<Instances>`), keeping draw calls `< 150`.
- **Deterministic Disposal**: On component unmount or scene swap, traverse and call `geometry.dispose()`, `material.dispose()`, and every texture's `.dispose()` — check `renderer.info.memory` via `hsa_canvas` console diagnostics.
- **Selective HDR Bloom**: Configure `UnrealBloomPass` with `luminanceThreshold = 1.0` (`toneMapped = false` on emissive VFX/lasers with HDR color `> 1.5`) so skin and UI never blow out white.

### 3. Live Runtime Verification via `hsa_canvas` + Visual Scorecard
Never ship Three.js/WebGL code without rendering it in headless Chromium via `hsa_canvas`:

```javascript
const snap = await hsa.canvas({
  action: 'capture',
  url: 'http://localhost:5173',
  path: '.domyh/game-evidence/threejs_viewport.png',
  viewport: { width: 1280, height: 720 }
});
// Inspect snap screenshot + console logs:
// Score 1-10 across: (1) Framing & Camera, (2) Lighting & Contrast, (3) PBR Material Readability, (4) Silhouette Clarity, (5) 0 WebGL/Shader Errors.
// Minimum passing average: >= 8.0/10 (max 3 repair iterations).
```

---

## 🔥 Part 2: Procedural Materials & Combat VFX Shaders

Author resolution-independent GPU shaders instead of heavy video/flipbook textures wherever possible (complete GLSL + `.gdshader` implementations in `data/combat-vfx-shaders.yaml`):

| VFX Archetype | Mathematical Core | Key Uniforms |
|:--------------|:------------------|:-------------|
| **Sword Slash Arc Trail** | Polar UV ribbon + scrolling Voronoi erosion + HDR edge ramp | `u_progress (0..1)`, `u_hdr_color`, `u_erosion_scale` |
| **Dissolve (Death / Teleport)** | 3D/2D FBM Simplex Noise vs threshold `step()` + glowing burn band | `u_dissolve (0..1)`, `u_edge_width (0.06)`, `u_edge_hdr_color` |
| **Fresnel Forcefield Shield** | `pow(1.0 - dot(N, V), p)` + Scene Depth intersection rim + hex pulse | `u_fresnel_power (3.5)`, `u_hit_point`, `u_intersect_softness` |
| **Stylized Toon Water** | 2-octave Gerstner vertex waves + Linear Depth shoreline foam step | `u_shallow_col`, `u_deep_col`, `u_foam_dist`, `u_wave_amp` |
| **Damage Hit-Flash** | Unlit white/red emission override `mix(albedo, flash_col, u_flash)` | `u_flash (0..1)` decayed exponentially over `110ms` |

---

## 🤖 Part 3: Godot 4.x File-First Game Pipeline (4.3+)

Godot 4 requires **no running Editor and no MCP bridge** — every scene (`.tscn`), resource (`.tres`), shader (`.gdshader`), and script (`.gd`) is clean human-readable text.

### 1. Non-Negotiable Godot 4.3+ Conventions
1. **Use `TileMapLayer`, NEVER legacy `TileMap`**: `TileMap` was deprecated in Godot 4.3. Create separate `TileMapLayer` nodes (`GroundLayer`, `WallsLayer`, `PropsLayer`) sharing one `TileSet` `.tres`.
2. **Strict GDScript 2.0 Static Typing**: Annotate every variable, parameter, return type, and array (`var enemies: Array[CharacterBody2D] = []`, `func take_hit(dmg: int) -> void:`). Static typing catches 80% of runtime bugs at `--headless` parse time and boosts VM speed!
3. **Safe Hand-Authored `.tscn` / `.tres` Files**:
   - Header format: `[gd_scene load_steps=N format=3]` (omit invented `uid="uid://..."` strings — Godot auto-assigns valid UIDs on first load, whereas fake UIDs cause corrupt cache warnings!).
   - Reference external assets strictly via `[ext_resource type="..." path="res://..." id="1_abc"]`.
4. **Physics & Animation Nodes**:
   - 2D/3D Actors: `CharacterBody2D` / `CharacterBody3D` calling `move_and_slide()` (no arguments — set `velocity` property directly; in 3D apply `velocity += get_gravity() * delta`).
   - 2D Pixel Settings: In `project.godot`, set `rendering/textures/canvas_textures/default_texture_filter=0` (**Nearest**) so pixel art is never blurred!
   - Multi-directional Animation: Drive `AnimationPlayer` through `AnimationTree` (`AnimationNodeStateMachine` containing `BlendSpace2D` for `Idle`, `Walk`, `Attack`).

### 2. Deterministic Headless CLI Verification Loop
Run Godot from CLI after every scene or GDScript edit (never use pipes `|` on Windows PowerShell):

```powershell
# 1. Parse-check all GDScript static types, .tscn scene links, and 60 physics frames headlessly
godot --headless --path . --quit-after 60

# 2. Render actual visual frame proof (when display/software renderer available)
godot --path . --write-movie .domyh/game-evidence/godot_boot.png --fixed-fps 60 --quit-after 60
```

> **Gotcha**: When creating a brand-new `class_name` in GDScript without the Editor open, run `godot --headless --editor --quit` once first so Godot populates `.godot/global_script_class_cache.cfg` before running gameplay scenes!

---

## ⚡ WebGPU & TSL (Three.js Shading Language) Forward Compatibility

When targeting `THREE.WebGPURenderer` (`three/webgpu` in Three.js r165+), raw GLSL `ShaderMaterial` will not compile on WebGPU backends. Prefer **NodeMaterial + TSL** (`color`, `uv`, `time`, `sin`, `smoothstep`, `mix`, `positionLocal` from `'three/tsl'`), which cross-compiles automatically to **both WGSL (WebGPU) and GLSL (WebGL2 fallback)** from a single TypeScript definition!

---

## 🔁 Closed-Loop Shader & Scene QA (`hsa_execute`)

Never assume a shader or Godot/Three.js scene renders cleanly because TypeScript or GDScript compiled:

```javascript
// 1. Open dev preview & capture multi-frame proof via LiveCanvas
await hsa.canvas({ action: 'open' });
const vfxFrames = await hsa.canvas({
  action: 'capture',
  url: 'http://localhost:5173/?vfx=dissolve_test',
  output_dir: '.domyh/game-evidence/vfx_dissolve',
  viewport: { width: 1280, height: 720 },
  frames: { count: 4, interval_ms: 250 }
});

// 2. Verify monotonic progression across dissolve frames (not frozen or black screen!)
const motion = await hsa.design({
  action: 'frame_diff',
  frame_a: vfxFrames.paths[0],
  frame_b: vfxFrames.paths[2]
});

await hsa.canvas({ action: 'close' });
return { vfxFrames, changedRatio: motion.changed_pixel_ratio };
```

---

## ⚠️ Critical Three.js, Shader & Godot 4 Gotchas

| # | Stack | Trap | Producing-Boundary Fix |
|:--|:------|:-----|:-----------------------|
| 1 | Three.js | Normal / ORM map loaded with default `SRGBColorSpace` | Explicitly set `tex.colorSpace = THREE.NoColorSpace` and `tex.flipY = false` |
| 2 | Three.js / R3F | `UnrealBloomPass` turns white UI and sunlit skin nuclear white | Set `luminanceThreshold = 1.0` and put `toneMapped={false}` + HDR RGB `> 1.5` only on glowing VFX |
| 3 | Three.js | Tab crashes after 10 hot-reloads / level transitions | Traverse scene and `.dispose()` every `BufferGeometry`, `Material`, and `Texture` on unmount |
| 4 | Godot 4.3+ | Generating legacy `TileMap` node (`set_cell(layer, ...)` deprecated) | Always create `TileMapLayer` nodes (`set_cell(coords, source_id, atlas_coords)`) |
| 5 | Godot 4 | Inventing random `uid="uid://abc123"` in hand-written `.tscn` | Omit `uid` in `[gd_scene format=3]`; let Godot generate valid UIDs cleanly |
| 6 | Godot 4 | Pixel art looks blurry in 2D viewport | Set `default_texture_filter=0` (Nearest) and `window/stretch/scale_mode="integer"` in `project.godot` |
| 7 | Godot 4 | `move_and_slide(velocity)` throws argument count compile error | Godot 4 `move_and_slide()` takes **0 arguments**; assign `velocity = ...` property directly |

---

## 📚 Progressive Data References

| File | Contents |
|:-----|:---------|
| `data/threejs-r3f-pbr.yaml` | Complete Three.js & R3F glTF+ORM loader, `InstancedMesh` 10k template, Selective `UnrealBloom` composer, VRAM disposal hook, `hsa_canvas` test HTML |
| `data/combat-vfx-shaders.yaml` | Ready-to-compile GLSL (Three.js) & `.gdshader` (Godot 4) code for Sword Slash, Edge-Glow Dissolve, Depth Fresnel Shield, Toon Water, and Hit-Flash |
| `data/godot4-pipeline.yaml` | Clean `project.godot` (pixel-crisp & 3D presets), valid `.tscn` template, static-typed `CharacterBody2D`/`3D`, `TileMapLayer` script, `AnimationTree` controller & CLI verification recipes |
