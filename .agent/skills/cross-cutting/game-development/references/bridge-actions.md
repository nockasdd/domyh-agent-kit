# Bridge Actions Quick Reference — Game & 3D Asset Studio

> All MCP bridge tool actions for Unity, Unreal Engine, and Blender.
> Use via: `hsa_bridge({action:'call', target:'unity|ue|blender', tool:'<tool_name>', payload:{...}})`

---

## Unity Bridge Actions (23 commands)

Target: `unity` | Protocol: HTTP `http://127.0.0.1:30030`

| Tool Name | Payload | Response | Use Case |
|:-------|:--------|:---------|:---------|
| `unity_get_hierarchy` | `{}` | Scene tree with all GameObjects | Understand scene structure |
| `unity_get_properties` | `{ objectPath: "/Player" }` | Object details + components | Read component values |
| `unity_set_property` | `{ objectPath: "/Player", componentType: "Transform", propertyName: "position", propertyValue: [0,1,0] }` | Success/fail | Modify any property |
| `unity_create_object` | `{ primitiveType: "Sphere", name: "Bird" }` | Created object path | Add new GameObjects |
| `unity_delete_object` | `{ objectPath: "/OldObj" }` | Success/fail | Remove GameObjects |
| `unity_save_scene` | `{}` | Success/fail | Persist scene changes |
| `unity_recompile` | `{}` | Compilation result | Trigger C# recompilation |
| `unity_get_logs` | `{ limit: 50 }` | Recent console logs | Read errors/warnings |
| `unity_capture_viewport` | `{ outputPath: ".domyh/game-evidence/unity_view.png", width: 1280, height: 720 }` | Saved PNG path + dimensions | Capture Game/Scene viewport for Vision QA |
| `unity_execute_menu` | `{ menuPath: "Edit/Project Settings..." }` | Success/fail | Trigger menu actions |

### Unity Example Flow: Create Flappy Bird

```javascript
// 1. Understand scene
hsa_bridge({action:'call', target:'unity', tool:'unity_get_hierarchy'})

// 2. Create player
hsa_bridge({action:'call', target:'unity', tool:'unity_create_object', payload:{primitiveType:'Sphere', name:'Bird'}})
hsa_bridge({action:'call', target:'unity', tool:'unity_set_property', payload:{
  objectPath:'/Bird', componentType:'Transform', propertyName:'position', propertyValue:[0, 3, 0]
}})

// 3. Create pipe spawner
hsa_bridge({action:'call', target:'unity', tool:'unity_create_object', payload:{primitiveType:'Empty', name:'PipeSpawner'}})
hsa_bridge({action:'call', target:'unity', tool:'unity_set_property', payload:{
  objectPath:'/PipeSpawner', componentType:'Transform', propertyName:'position', propertyValue:[10, 0, 0]
}})

// 4. Save and compile
hsa_bridge({action:'call', target:'unity', tool:'unity_save_scene'})
hsa_bridge({action:'call', target:'unity', tool:'unity_recompile'})

// 5. Check for errors
hsa_bridge({action:'call', target:'unity', tool:'unity_get_logs', payload:{limit: 20}})
```

---

## Unreal Engine Bridge Actions (7 core commands)

Target: `ue` | Protocol: REST `http://127.0.0.1:30010` + Python `http://127.0.0.1:30011`

| Action | Payload | Response | Use Case |
|:-------|:--------|:---------|:---------|
| `ue_get_property` | `{ objectPath: "/Game/...", propertyName: "RelativeLocation" }` | Property value | Read UObject values |
| `ue_set_property` | `{ objectPath: "/Game/...", propertyName: "...", propertyValue: {...} }` | Success/fail | Modify UObject values |
| `ue_call_function` | `{ objectPath: "/Game/...", functionName: "...", parameters: {...} }` | Function result | Execute UFUNCTION |
| `ue_batch` | `{ requests: [{...}, {...}] }` | Batch results | Multiple ops at once |
| `ue_execute_python` | `{ script: "import unreal\n..." }` | Script output | Run Python in editor |
| `ue_capture_viewport` | `{ outputPath: ".domyh/game-evidence/ue_view.png", width: 1280, height: 720 }` | Saved PNG path | Capture Editor/PIE viewport for Vision QA |
| `ue_search_assets` | `{ classPath: "/Script/Engine.StaticMesh", filter: "SM_" }` | Asset list | Find project assets |

### UE ObjectPath Format

```
/Game/Maps/MyLevel.MyLevel:PersistentLevel.StaticMeshActor_0.StaticMeshComponent0
│     │         │        │                │                  │
│     │         │        │                │                  └─ Component name
│     │         │        │                └─ Actor name
│     │         │        └─ Sub-object level
│     │         └─ Asset name (duplicated)
│     └─ Content folder path
└─ Root
```

### UE Example Flow: Populate Level

```javascript
// 1. Execute Python to scatter objects
hsa_bridge({target:'ue', action:'ue_execute_python', payload:{
  script: `
import unreal
import random
mesh = unreal.load_asset('/Game/Meshes/SM_Rock')
for i in range(20):
    loc = unreal.Vector(random.uniform(-3000,3000), random.uniform(-3000,3000), 0)
    actor = unreal.EditorLevelLibrary.spawn_actor_from_class(
        unreal.StaticMeshActor, loc, unreal.Rotator(0, random.uniform(0,360), 0)
    )
    actor.get_editor_property('static_mesh_component').set_editor_property('static_mesh', mesh)
    actor.set_actor_label(f'Rock_{i:03d}')
unreal.log(f'Spawned 20 rocks')
`
}})

// 2. Search for spawned assets
hsa_bridge({target:'ue', action:'ue_search_assets', payload:{
  classPath: '/Script/Engine.StaticMeshActor',
  filter: 'Rock_'
}})
```

---

## Blender Bridge Actions (GUI + Headless Fallback)

Target: `blender` | Protocol: HTTP `http://127.0.0.1:28782` (GUI addon) or CLI `blender -b -P` via `blender_run_headless`

| Tool Name | Payload | Response | Use Case |
|:----------|:--------|:---------|:---------|
| `blender_execute_python` | `{ code: "import bpy\n..." }` | Script result + scene delta | Live `bpy` execution in open Blender GUI (`127.0.0.1:28782`) |
| `blender_run_headless` | `{ script_path: "...", blend_path?: "..." }` | Exit status + stdout JSON | Run `bpy` without GUI open (`blender --background`) |
| `blender_render_views` | `{ blend_path, output_dir, views: ["front","side","three_quarter","top"] }` | Contact sheet PNG paths | Multi-angle render for Anti-Blind Vision QA |
| `blender_asset_qa` | `{ blend_path, max_triangles, max_ngon_ratio, require_rig_bones }` | Deterministic QA metrics | Check poly budget, N-gons, UVs, scale `1,1,1`, rig/ARKit keys |
| `blender_export` | `{ blend_path, output_path, engine: "unity\|unreal\|godot\|threejs" }` | Exported `.glb` / `.fbx` | Engine-calibrated axis/scale/ORM export |

---

## Connection Troubleshooting

| Problem | Engine | Solution |
|:--------|:-------|:---------|
| Connection refused | Unity | Unity Editor not running or HSA bridge package not listening on HTTP `127.0.0.1:30030` |
| Connection refused | UE | UE Editor not running or Remote Control API plugin not enabled |
| Connection refused | Blender | Blender GUI addon not active on `127.0.0.1:28782` — switch automatically to `blender_run_headless` |
| 404 Not Found | UE | Wrong ObjectPath or function not UFUNCTION(BlueprintCallable) |
| Timeout | All | Editor busy (compiling, baking, importing). Wait and retry |
| Wrong port | Unity | Verify HTTP port in HSA Unity Bridge window (default: `30030`) |
| Wrong port | UE | Check Remote Control API settings (default: `30010` + Python `30011`) |

---
