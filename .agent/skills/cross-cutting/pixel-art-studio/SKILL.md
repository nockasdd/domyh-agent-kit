---
name: pixel-art-studio
description: "Production Pixel Art Studio: SummerEngine pixel-anchor contracts, strict Pixel Craft Rules, Cloud Image-to-Pixel quantization (pixel_quantize), Fake-3D Voxel Sprite Stacking with Normal/Emissive maps (sprite_stack), Wang/47-tile autotiles, Isometric 2:1 projection, and Aseprite CLI."
detect: ["*.ase", "*.aseprite", "*pixel-anchor*.yaml"]
category: cross-cutting
tier: 1
---

# Pixel Art, Tileset & Sprite-Stacking Studio — DOMYH Agent Kit

> **Core Law**: Raw diffusion/LLM images are **NOT** pixel art (they contain mixels, blurred edges, fake checkerboards, and 10,000+ drifting RGB colors). Every sprite MUST lock a `pixel-anchor.yaml` and pass deterministic quantization or matrix synthesis.

---

## 🧭 Synthesis Flow Decision Matrix

| Asset Need | Recommended Flow | Primary Tools | Why |
|:-----------|:-----------------|:--------------|:----|
| Hero character, boss, rich portrait, complex organic monster (`32×32` to `128×128`) | **Flow 1: Cloud Image-to-Pixel** (Gemini Nano Banana Pro / GPT Image $\to$ Deterministic Quantizer) | `generate_image` / Cloud API $\to$ `hsa_design(pixel_quantize)` $\to$ `hsa_design(sprite_sheet)` | Rich artistic form + mathematically exact pixel grid, locked palette & binary alpha |
| Vehicles, turrets, chests, mechs, rotating props, 8/16-direction isometric/top-down | **Flow 2A: Fake-3D Voxel Sprite Stacking** | `hsa_design(sprite_stack)` | Instant 8/16/32-angle rotation consistency + free 2D Normal & Emissive maps |
| Tiny icons (`8×8`, `16×16`), UI cursors, procedural Wang/Blob tiles, Aseprite pipelines | **Flow 2B: Deterministic Matrix / Aseprite CLI** | Palette index matrix or `aseprite -b --script` | 100% sub-pixel cluster control, exact seamless tile borders |

---

## 🎨 Mandatory Contract & Pixel Craft Rules

### Step 0: Lock `.agent/specs/pixel-anchor.yaml`
Before creating any sprite, read `.agent/specs/pixel-anchor.yaml` (or copy from `.agent/templates/specs/pixel-anchor.template.yaml`):
- `canvas_size` (e.g., `[32, 32]`), `palette` (`endesga-32`, `sweetie-16`, `pico-8`, `gameboy-4`), `outline_mode` (`sel-out`), `light_angle_deg: 315` (Top-Left), `alpha_mode: binary`, `pivot: [0.5, 1.0]`.

### The 7 Non-Negotiable Pixel Craft Rules
1. **Silhouette First**: Fill the character as a 1-color flat silhouette at `1×` resolution first. Limbs, weapon, and head direction must read clearly before adding internal colors.
2. **Single Locked Light Angle (`315°` Top-Left)**: Every sprite and tile in the same game shares one light source. Never flip shading direction by `scaleX = -1` when asymmetric lighting is noticeable without re-lighting or using 2D normal maps.
3. **Hue-Shifting Shading Ramps**: Never shade by only adding black/white (`HSL Lightness` only looks muddy). Shift **highlights toward warm yellow** (`+10°..+15°` hue, lower saturation at peak specular) and **shadows toward cool purple/blue** (`-12°..-20°` hue, slightly higher saturation).
4. **Selective Outlining (`sel-out`)**: Tint outer 1px outlines toward a darker shade of the adjacent material + light direction (dark warm brown around top-lit skin, deep navy around shadowed steel) instead of harsh `#000000` everywhere.
5. **Zero Jaggies & Doubles**: Curves and diagonals must follow rhythmic step progressions (`1-1-1`, `2-1-2-1`, or `3-2-1-1-2-3`). Eliminate unintended L-shaped 2px staircase "doubles" and isolated 1px orphan noise.
6. **Forbidden Artifacts**:
   - **NO Mixels**: Every pixel in the scene shares `1:1` world texel size (`Pixels Per Unit` locked).
   - **NO Pillow Shading**: Never shade concentrically from center outward ignoring light direction.
   - **NO Banding**: Parallel adjacent color ramps hugging identical staircase contours create blurry Mach bands.
   - **NO Blind Gradients / Dirty Alpha**: Alpha must be strictly binary (`0` or `255`), zero semi-transparent halos.
7. **8× Nearest-Neighbor Vision Review**: Always inspect upscaled `preview_scale: 8` output alongside `1×` readability.

---

## ☁️ Flow 1: Cloud Model Image-to-Pixel Pipeline (Gemini / GPT)

### 1. Anti-Artifact Prompt Construction
Prompt Gemini Nano Banana Pro or GPT Image with **flat solid chroma-key background** (choose a color absent from the sprite's palette, e.g. `#FF00FF` magenta) — **NEVER ask for "transparent background"** because image models hallucinate baked gray-white PNG checkerboards!

```text
Prompt Formula:
"16-bit retro game sprite of [subject & pose], strict [orthographic front / 3-4 top-down] view,
crisp 1px selective dark outline, top-left 315-degree lighting, hue-shifted cel-pixel clusters,
flat solid #FF00FF magenta background, full body centered with margin,
NO anti-aliasing, NO soft gradients, NO glow bloom, NO drop shadow, NO grid lines, NO checkerboard."
```

### 2. Mandatory Mathematical Quantization (`pixel_quantize`)
Raw cloud images are `1024×1024` RGB. Immediately pass them through `hsa_design`:

```javascript
// Inside hsa_execute({ allow_mutations: true })
const quantized = await hsa.design({
  action: 'pixel_quantize',
  input_path: '.domyh/scratch/raw_knight_cloud.png',
  output_path: 'assets/sprites/chr_knight_idle_0.png',
  width: 32,
  height: 32,
  palette: 'endesga-32',         // or custom hex array from pixel-anchor.yaml
  remove_checkerboard: true,     // strips background / fake checkerboards cleanly
  binary_alpha: true,            // enforces alpha in {0, 255}
  preview_scale: 8               // writes crisp 256x256 nearest-neighbor review PNG
});
```

### 3. Multi-Frame Consistency & Sheet Packing (`sprite_sheet`)
- For walk/idle/attack cycles, feed `chr_knight_idle_0.png` back as the **Identity Reference Image** (single-sheet strip or multi-ref lock), quantize every frame with identical `palette`, then pack + verify motion:

```javascript
const sheet = await hsa.design({
  action: 'sprite_sheet',
  mode: 'pack',
  input_paths: [
    'assets/sprites/chr_knight_walk_0.png',
    'assets/sprites/chr_knight_walk_1.png',
    'assets/sprites/chr_knight_walk_2.png',
    'assets/sprites/chr_knight_walk_3.png'
  ],
  output_path: 'assets/sprites/chr_knight_walk_sheet.png',
  columns: 4,
  padding: 0,
  pivot: [0.5, 1.0],
  export_meta: ['godot_tres', 'unity_json', 'phaser_atlas']
});

// Verify frames actually move without losing character volume
const diff = await hsa.design({
  action: 'frame_diff',
  frame_a: 'assets/sprites/chr_knight_walk_0.png',
  frame_b: 'assets/sprites/chr_knight_walk_1.png'
});
// Gate: 0.04 <= diff.changed_pixel_ratio <= 0.38
```

---

## 🧱 Flow 2: Fake-3D Voxel Sprite Stacking & Aseprite CLI

### 1. Deterministic Voxel Sprite Stacking (`sprite_stack`)
Claude, GPT, and Gemini excel at writing small ASCII/palette-keyed horizontal slice matrices (`Z = 0` bottom to `Z = N-1` top). `hsa_design(sprite_stack)` projects those slices across **8, 16, or 32 rotation directions** with isometric/top-down foreshortening AND automatically computes **2D Tangent Normal Maps + Emissive Maps** for dynamic engine lighting!

```javascript
const stack = await hsa.design({
  action: 'sprite_stack',
  layers: [
    // Z=0..Z=11 2D string grids ('.' = transparent, palette keys '0'..'F')
    // See full vehicle/turret/chest templates in data/tileset-and-stacking.yaml
  ],
  palette: {
    '1': '#1b1f2a', '2': '#3b4866', '3': '#6982ab', 'E': '#00f5d4'
  },
  emissive_keys: ['E'],
  output_path: 'assets/sprites/veh_hoverbike_16dir.png',
  directions: 16,
  generate_normal_map: true,
  generate_emissive_map: true
});
```

### 2. Optional Aseprite Headless CLI (`aseprite -b`)
When `aseprite` is installed locally on PATH, batch export tags and layers deterministically without GUI:
```powershell
aseprite -b assets/src/player.aseprite --split-tags --sheet assets/sprites/player.png --data assets/sprites/player.json --format json-array
```

---

## 🗺️ Autotiles & Isometric 2:1 Quick Rules

- **Wang 16-Tile Dual-Grid** (recommended): Offset collision grid by `0.5` tile; only **16** tiles cover every corner transition cleanly with zero T-junction artifacts.
- **47-Tile Blob Autotile**: 8-neighbor bitmask (`N=1, NE=2, E=4, SE=8, S=16, SW=32, W=64, NW=128`) where diagonal bits only count when both flanking cardinals are set (`256` states collapsed to `47` canonical tiles).
- **True Pixel Isometric (`2:1`, NOT `30°`)**: Step **2 pixels horizontal for every 1 pixel vertical** (`arctan(0.5) ≈ 26.565°`, tile sizes `32×16`, `64×32`). True `30°` math produces uneven `2-1-2-2-1` jaggies!

---

## 📚 Progressive Data References

| File | Contents |
|:-----|:---------|
| `data/pixel-craft-rules.yaml` | Jaggie/banding/pillow-shading detectors, `sel-out` algorithm, 4-dir & 8-dir walk/idle/attack keyframe anatomy, `frame_diff` & `silhouette_iou` QA thresholds |
| `data/palettes-and-anchors.yaml` | Complete hex arrays for `gameboy-4`, `pico-8` (16), `sweetie-16` (16), `endesga-32` (32), plus Hue-Shifting Ramp tables (Skin, Metal, Foliage, Stone, Fire) |
| `data/tileset-and-stacking.yaml` | 16-tile Wang & 47-tile Blob bitmask lookup tables (Godot 4 `TileMapLayer` / Unity / Phaser), Isometric `2:1` math, and ready-to-run `sprite_stack` voxel templates |
