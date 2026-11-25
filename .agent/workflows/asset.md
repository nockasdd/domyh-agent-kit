---
name: asset
description: "Tạo và kiểm định 3D/2D/Pixel Assets, Character, NPC, VFX & Video chuẩn kỹ thuật"
skills: { required: [], contextual: [blender-3d-studio, pixel-art-studio, character-npc-studio, webgl-shader-godot, gemini-media-gen] }
success_criteria: "Asset matches spec/anchor contract, passes deterministic QA & visual inspection"
---

# 🎨 /asset — Cloud & Procedural Creative Asset Studio

> Spec-Driven 3D/2D/Pixel/NPC/VFX/Video Pipeline (Zero Local GPU Required)

## ⛔ HARD GATES
1. **CONTRACT FIRST**: Lock `.agent/specs/art-bible.yaml`, `<id>.spec.yaml`, or `pixel-anchor.yaml` before generating geometry, pixels, rigs, or shaders.
2. **NO BLIND GENERATION**: Every 3D/2D/Pixel/Shader output MUST pass deterministic math QA AND multi-angle/frame Vision inspection (Gemini / GPT / Claude).
3. **BOUNDED SELF-REPAIR**: Max **3** closed-loop repair iterations via `hsa_execute`; escalate with concrete metrics if a gate still fails.

## 🧭 SKILL ROUTING

| Asset Domain | Primary Skill | Core Verification Tooling |
|:-------------|:--------------|:--------------------------|
| 3D Mesh / PBR / Rig / ARKit 52 | `blender-3d-studio` | `hsa_bridge(target:'blender')`, `blender_render_views`, `blender_asset_qa` |
| Pixel Art / Tileset / Sprite Stack | `pixel-art-studio` | `hsa_design(pixel_quantize \| sprite_stack \| sprite_sheet \| frame_diff)` |
| 2D Character / SVG Rig / NPC Lipsync | `character-npc-studio` | `hsa_design(sprite_sheet \| viseme_timeline)`, `hsa_canvas(capture)` |
| Three.js / R3F / Combat VFX / Godot 4 | `webgl-shader-godot` | `hsa_canvas(capture)`, `godot --headless --path . --quit-after 60` |
| Cloud Concept / Keyframe / Veo Video | `gemini-media-gen` | Multi-ref identity lock + `silhouette_iou` / `frame_diff` |

## 🔄 CLOSED-LOOP EXECUTION (`hsa_execute`, Max 3 Rounds)
1. **SPEC LOCK** — Load or scaffold contract from `.agent/templates/specs/*.template.yaml` into `.agent/specs/`.
2. **SYNTHESIZE** — Execute domain pipeline (`bpy` blockout/mesh/ORM/rig, Cloud Image $\to$ `pixel_quantize`, `sprite_stack`, layered SVG rig, or GLSL/`.gdshader`).
3. **MEASURE & RENDER** — Chain inside `hsa_execute`:
   - **3D**: `blender_asset_qa` (poly budget, N-gon ratio, unweighted verts, UV overlap, scale `1,1,1`) + `blender_render_views` (Front/Side/3-4/Top) + `hsa_design({action:'silhouette_iou'})`.
   - **2D/Pixel**: `pixel_quantize` (exact palette & binary alpha) + `frame_diff` + `preview_scale: 8` contact sheet.
   - **NPC/Shader/WebGL**: `viseme_timeline` sync check + `hsa_canvas({action:'capture'})` runtime render.
4. **VISION CRITIQUE & REPAIR** — Inspect rendered contact sheet against Visual Scorecard (Silhouette, Proportions, Topology/Pixel Craft, Material/Palette, Rig/Motion; target avg $\ge 8.0$). Fix at the **Producing Boundary** and re-test (max 3 rounds).
5. **EXPORT** — Package engine-ready `.glb`/`.fbx`, atlas `.png`+`.json`, `.tscn`/`.gdshader`, or `.mp4` + QA report.

## ⚡ SUB-COMMANDS

| Command | Action |
|:--------|:-------|
| `/asset bible` | Scaffold `.agent/specs/art-bible.yaml` (and `pixel-anchor.yaml` for 2D pixel projects) |
| `/asset spec [name]` | Create `.agent/specs/[name].spec.yaml` from `asset-spec.template.yaml` |
| `/asset create [desc]` | Run full Spec $\to$ Synthesize $\to$ Math/Vision QA Loop $\to$ Engine Export |
| `/asset audit [path]` | Run deterministic QA (`blender_asset_qa` / `hsa_design` / `hsa_canvas`) + Visual Scorecard |

## REFLECTION CHECKPOINT
⛔ **MANDATORY** — Execute before completing this workflow (SESSION_001):
1. **VERIFY** — Spec/anchor gates green? Multi-view or spritesheet Vision inspection completed with `[OBSERVATION]` metrics?
2. **PERSIST** (HSA): `hsa_session({action:'persist', task_summary:'/asset [subcommand] [target]', files_touched:[...]})`
3. **FALLBACK** (no HSA): Append summary and QA metrics to `memory/session.md`.
