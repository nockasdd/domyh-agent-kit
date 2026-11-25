---
name: character-npc-studio
description: "2D Character, NPC Lipsync & Cutscene Studio (Zero Local GPU): Single-Canvas Turnaround + Multi-Ref Identity Lock, layered SVG vector rigging + hsa_canvas frame capture, TTS + viseme_timeline millisecond lip-sync, and Veo 3.1 keyframe cutscenes."
detect: ["*character-sheet*", "*viseme*.json", "*dialogue*.json"]
category: ai-ml
tier: 1
---

# 2D Character, Layered SVG Rig, NPC Lipsync & Cutscene Studio

> **Optimized for Gemini, GPT, and Claude — Zero Local GPU Required**
> Solves the #1 failure mode of AI characters (**identity drift across poses, deformed vector limbs, and out-of-sync NPC mouths**) via three deterministic pipelines.

---

## 🧭 Pipeline Selection Matrix

| Deliverable | Best Pipeline | Core Tools | Output Artifacts |
|:------------|:--------------|:-----------|:-----------------|
| Visual Novel / RPG Portraits, Concept Sheet, Spine/Cutout Parts | **Pipeline 1: Consistent Turnaround & Expression Sheet** | Gemini Nano Banana Pro (up to 14 refs) / GPT Image + `hsa_design(sprite_sheet)` | Canonical turnaround PNG + sliced 9-emotion PNGs with locked pivot |
| Crisp 2D Animated Web/Game Avatar, Mascot, Puppet Character | **Pipeline 2: Layered Vector SVG Rigging** | Claude/GPT/Gemini structured SVG + JS Arc Animator + `hsa_canvas(capture)` | Interactive SVG/HTML widget **AND** transparent PNG spritesheet |
| Talking In-Game NPC, Companion, Quest Giver, Story Cutscene | **Pipeline 3: Voice, Viseme Lipsync & Keyframe Cutscene** | `gemini-tts` / OpenAI TTS + `hsa_design(viseme_timeline)` + `Veo 3.1` | `.wav` dialogue + millisecond `viseme.json` + `.mp4` cutscene |

---

## 🖼️ Pipeline 1: 2D Consistent Character & NPC Portrait Pipeline

Generating separate prompts one by one causes costume colors, hair bangs, and facial structure to drift. Lock identity structurally:

### Step 1: Single-Canvas Turnaround Anchor (`16:9`)
Generate **Front, 3/4, Side, and Back** views on **one shared horizontal canvas** first. Self-attention across a single canvas forces identical eye height, belt line, color hexes, and silhouette ratios:
- Enforce horizontal alignment guides (crown line, chin line, hip line, sole baseline) and flat solid `#E5E7EB` or `#00FF00` chroma background.
- Save approved sheet as `assets/characters/<id>/anchor_turnaround.png` — this becomes the immutable **Identity SSoT**.

### Step 2: Multi-Reference Expression Sheet (`3×3` Grid)
Pass `anchor_turnaround.png` (+ `art-bible` palette swatch; Gemini Nano Banana Pro accepts up to **14 reference images**, GPT Image accepts reference image input) to synthesize a `3×3` bust/portrait grid on a uniform grid:
- Required 9 slots: `neutral`, `happy`, `angry`, `sad`, `surprised`, `talking_open`, `talking_round`, `blink`, `smirk_thinking`.
- Lock camera crop, shoulder angle, and neck position across all 9 cells so swapping portraits during dialogue never causes head-jumping!

### Step 3: Deterministic Slicing & Pivot Alignment (`sprite_sheet`)
Slice the `3×3` expression grid or `1×4` turnaround automatically via `hsa_design`:

```javascript
// Execute via hsa_execute({ allow_mutations: true })
const sliced = await hsa.design({
  action: 'sprite_sheet',
  mode: 'slice',
  input_path: 'assets/characters/npc_lyra/raw_expressions_3x3.png',
  output_dir: 'assets/characters/npc_lyra/portraits',
  columns: 3,
  rows: 3,
  names: [
    'neutral', 'happy', 'angry',
    'sad', 'surprised', 'talking_open',
    'talking_round', 'blink', 'smirk'
  ],
  remove_bg: true,
  pivot: [0.5, 1.0] // Locks bottom-center torso anchor across all 9 portraits
});
```

---

## 🦴 Pipeline 2: 2D Layered Vector SVG Character Rigging

LLMs write clean declarative XML/SVG when given an anatomical joint contract. Avoid squashing whole groups with `scaleY` (which distorts stroke width and crushes circular heads into ovals!).

### 1. Canonical Layered SVG Joint Hierarchy
Author clean `<g>` groups in back-to-front painter's order with explicit joint coordinates (`style="transform-origin: Xpx Ypx"` in SVG `viewBox="0 0 512 512"` space):
- `#rig_root` `(256, 480)`
  - `#arm_R` `(210, 235)` *(back arm)* $\to$ `#forearm_R`
  - `#leg_R` `(235, 355)`, `#leg_L` `(277, 355)`
  - `#torso` `(256, 350)`
    - `#head` `(256, 215)` *(neck pivot!)*
      - `#eyes_open`, `#eyes_closed` *(toggle `opacity` `1` $\leftrightarrow$ `0`)*
      - `#brows_L`, `#brows_R`
      - `#mouth_X`, `#mouth_A`, `#mouth_B`, `#mouth_C`, `#mouth_D`, `#mouth_E`, `#mouth_F`, `#mouth_G`, `#mouth_H` *(Preston Blair 9 visemes — only 1 visible at `t`)*
    - `#arm_L` `(302, 235)` *(front arm)* $\to$ `#forearm_L`

### 2. Arc-Preserving State Machine Animator (CSS / JS)
- Drive limbs exclusively via **pure joint rotations (`rotate(deg)`)** around fixed anatomical pivots + subtle root translation (`translateY` bob).
- **Idle State**: Phase-offset sine breathing (`torso: sin(t * 2.2) * 1.4deg`, `head: sin(t * 2.2 - 0.5) * -1.8deg` counter-rotation keeps gaze steady!) + stochastic blink (`110ms` closed every `2.8–5.2s`).
- **Talking State**: Read active cue from `viseme_timeline` JSON at `audio.currentTime * 1000` ms and toggle `#mouth_<code_X_to_H>` visibility + subtle jaw/head emphasis on open vowels (`D`, `C`).

### 3. Headless Transparent Frame Capture (`hsa_canvas`)
Export deterministic PNG frame sequences directly from the live SVG rig for Unity, Godot, Phaser, or PixiJS:

```javascript
const capture = await hsa.canvas({
  action: 'capture',
  html_path: 'assets/characters/npc_lyra/rig_preview.html?state=walk',
  output_dir: '.domyh/scratch/lyra_walk_frames',
  viewport: { width: 512, height: 512 },
  frames: {
    count: 12,
    interval_ms: 83,       // ~12 FPS crisp 1-second loop
    transparent_bg: true   // RGBA alpha=0 background
  }
});
// Pack captured frames into engine spritesheet via hsa.design({ action: 'sprite_sheet', mode: 'pack', ... })
```

---

## 🎙️ Pipeline 3: NPC Voice, Viseme Lipsync & Video Cutscenes

### 1. Expressive Voice + Deterministic `viseme_timeline`
1. Synthesize clean `.wav` NPC speech (`24kHz` mono PCM) via `gemini-tts` (director's notes + emotion tags) or OpenAI `gpt-4o-mini-tts`.
2. Extract millisecond-accurate Preston Blair mouth shapes (`X, A..H`) via `hsa_design`:

```javascript
const lipsync = await hsa.design({
  action: 'viseme_timeline',
  wav_path: 'assets/audio/npc_lyra_greeting.wav',
  transcript: 'Watch the northern gate! The iron golems march at dusk.',
  output_path: 'assets/audio/npc_lyra_greeting.visemes.json'
});
// Output: { duration_ms: 3840, cues: [{ start_ms: 0, end_ms: 90, value: 'X' }, { start_ms: 90, end_ms: 185, value: 'F' }, ...] }
```

3. Bind `npc_lyra_greeting.visemes.json` directly into your engine's **NPC Dialogue State Machine**:
   - **2D Portrait / SVG NPC**: Swap `#mouth_X..#mouth_H` sprite/layer while `emotion` tag selects eyebrow/eye portrait (`angry`, `happy`, `surprised`).
   - **3D ARKit Character**: Map `X..H` cues (or 15-viseme weights) with `lerp(dt * 18.0)` onto `viseme_sil..viseme_U` / `jawOpen` blendshapes (see `data/npc-dialogue-lipsync-video.yaml`).

### 2. Zero-Drift Storyboard & Cutscene Video (`Veo 3.1` / Cloud Video)
Never generate multi-shot cutscenes from text prompts alone (characters change faces every shot!). Use **Keyframe-Locked Shot Chaining**:
1. Compose Shot 1 **First Frame** (`16:9`) and **Last Frame** (`16:9`) as static 2D images using `anchor_turnaround.png` + environment reference in Gemini Nano Banana Pro.
2. Verify character costume & face consistency on both static keyframes via Vision first.
3. Pass `image` (First Frame) + `lastFrame` (Last Frame) + `referenceImages` into **Veo 3.1** (`veo-3.1-generate-preview` — see `gemini-media-gen`) for `8s` `1080p` motion with native Foley/ambience.
4. Reuse Shot $N$'s final frame (or style-matched reverse angle) to anchor Shot $N+1$.

---

## 🔁 Closed-Loop NPC Verification (`hsa_execute`)

Chain portrait slicing, SVG talking-frame capture, and viseme sync verification in a single turn:

```javascript
const lipsync = await hsa.design({
  action: 'viseme_timeline',
  wav_path: 'assets/audio/npc_lyra_01.wav',
  transcript: 'Halt traveler! Show your guild seal before crossing.',
  output_path: 'assets/audio/npc_lyra_01.visemes.json'
});

const frames = await hsa.canvas({
  action: 'capture',
  html_path: 'assets/characters/npc_lyra/rig_preview.html?state=talk',
  output_dir: '.domyh/scratch/lyra_talk_frames',
  viewport: { width: 512, height: 512 },
  frames: { count: 8, interval_ms: 100, transparent_bg: true }
});

const sheet = await hsa.design({
  action: 'sprite_sheet',
  mode: 'pack',
  input_paths: frames.paths,
  output_path: 'assets/characters/npc_lyra/lyra_talk_sheet.png',
  columns: 4,
  pivot: [0.5, 1.0]
});

return { cueCount: lipsync.cues?.length, durationMs: lipsync.duration_ms, sheet };
```

---

## ⚠️ Critical Character & NPC Gotchas

| # | Failure Mode | Producing-Boundary Fix |
|:--|:-------------|:-----------------------|
| 1 | Portrait heads jump/bob wildly when switching emotions in dialogue UI | Generate all 9 expressions on a single `3×3` grid with `anchor_turnaround.png` ref, then slice with locked `pivot: [0.5, 1.0]` |
| 2 | SVG arms/legs detach from torso when rotating in CSS | Always declare `.joint { transform-box: view-box; }` with explicit pixel `transform-origin` in SVG `viewBox` coordinates (default CSS `transform-box` differs across engines!) |
| 3 | Animating `scaleY` on SVG torso/head makes line strokes thick/thin | Use `vector-effect="non-scaling-stroke"` and animate pure `rotate(deg)` + `translateY(px)` only |
| 4 | NPC mouth flaps open during silent pauses in `.wav` | Always force `mouth_X` (`viseme_sil`) whenever `audio.paused` or gap amplitude drops below noise floor |
| 5 | Cutscene character outfit changes color between Shot 1 and Shot 2 | Never run text-only video gen; lock both `image` (First Keyframe) and `lastFrame` synthesized from `anchor_turnaround.png` |

---

## 📚 Progressive Data References

| File | Contents |
|:-----|:---------|
| `data/consistent-character-sheets.yaml` | Copy-ready Turnaround & `3×3` Expression Sheet prompt templates, 14-ref Gemini Pro & GPT Image payloads, `sprite_sheet` slice/pack configs |
| `data/svg-character-rigging.yaml` | Complete layered SVG character template (`#rig_root`..`#mouth_X..H`), Arc-Preserving JS State Machine (`idle`, `walk`, `talk`), `hsa_canvas` capture harness |
| `data/npc-dialogue-lipsync-video.yaml` | Preston Blair `X, A..H` phoneme/ARKit mapping table, branching NPC Dialogue JSON schema, Godot 4 / Unity C# / Web runtime lipsync players, Veo 3.1 keyframe cutscene recipe |
