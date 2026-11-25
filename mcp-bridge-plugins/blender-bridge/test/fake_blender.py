"""A stand-in Blender: the real add-on and headless runner against a stubbed bpy.

Run GUI add-on mode:
  python test/fake_blender.py <port> <token> [object-count]
Run headless CLI mode:
  python test/fake_blender.py --background [--factory-startup | <file.blend>] --python <script.py>
"""

import json
import math
import os
import runpy
import struct
import sys
import threading
import time
import types
import zlib

HERE = os.path.dirname(os.path.abspath(__file__))
BRIDGE_DIR = os.path.dirname(HERE)
sys.path.insert(0, os.path.join(BRIDGE_DIR, "src", "addon"))


def _write_rgba_png(filepath, width, height, pixels_float):
    raw_rows = bytearray()
    stride = width * 4
    # Blender image.pixels is bottom-to-top; PNG scanlines are top-to-bottom.
    for y in range(height - 1, -1, -1):
        raw_rows.append(0)
        row_start = y * stride
        for c in pixels_float[row_start : row_start + stride]:
            v = max(0, min(255, int(round(float(c) * 255.0))))
            raw_rows.append(v)

    def _chunk(tag, data):
        crc = zlib.crc32(tag + data) & 0xFFFFFFFF
        return struct.pack(">I", len(data)) + tag + data + struct.pack(">I", crc)

    ihdr = struct.pack(">IIBBBBB", width, height, 8, 6, 0, 0, 0)
    idat = zlib.compress(bytes(raw_rows), 6)
    os.makedirs(os.path.dirname(os.path.abspath(filepath)) or ".", exist_ok=True)
    with open(filepath, "wb") as handle:
        handle.write(b"\x89PNG\r\n\x1a\n")
        handle.write(_chunk(b"IHDR", ihdr))
        handle.write(_chunk(b"IDAT", idat))
        handle.write(_chunk(b"IEND", b""))


def _read_rgba_png(filepath):
    with open(filepath, "rb") as handle:
        data = handle.read()
    if data[:8] != b"\x89PNG\r\n\x1a\n":
        raise ValueError("not a PNG file: %s" % filepath)
    pos = 8
    width = height = 0
    idat_parts = []
    while pos < len(data):
        (length,) = struct.unpack(">I", data[pos : pos + 4])
        tag = data[pos + 4 : pos + 8]
        chunk_data = data[pos + 8 : pos + 8 + length]
        pos += 12 + length
        if tag == b"IHDR":
            width, height, _bd, _ct, _cm, _fm, _im = struct.unpack(">IIBBBBB", chunk_data)
        elif tag == b"IDAT":
            idat_parts.append(chunk_data)
        elif tag == b"IEND":
            break
    raw = zlib.decompress(b"".join(idat_parts))
    row_bytes = 1 + width * 4
    pixels = [0.0] * (width * height * 4)
    for png_y in range(height):
        src_off = png_y * row_bytes + 1
        dst_y = height - 1 - png_y
        dst_off = dst_y * width * 4
        for i in range(width * 4):
            pixels[dst_off + i] = raw[src_off + i] / 255.0
    return width, height, pixels


def build_fake_bmesh():
    bmesh = types.ModuleType("bmesh")

    class _BMVert:
        def __init__(self, idx, co):
            self.index = idx
            self.co = tuple(float(v) for v in co)
            self.link_edges = []

    class _BMEdge:
        def __init__(self, v1, v2):
            self.verts = (v1, v2)
            self.link_faces = []

        @property
        def is_manifold(self):
            return len(self.link_faces) == 2

    class _BMFace:
        def __init__(self, verts):
            self.verts = tuple(verts)

        def calc_area(self):
            if len(self.verts) < 3:
                return 0.0
            p0 = self.verts[0].co
            area = 0.0
            for i in range(1, len(self.verts) - 1):
                p1 = self.verts[i].co
                p2 = self.verts[i + 1].co
                ux, uy, uz = p1[0] - p0[0], p1[1] - p0[1], p1[2] - p0[2]
                vx, vy, vz = p2[0] - p0[0], p2[1] - p0[1], p2[2] - p0[2]
                cx = uy * vz - uz * vy
                cy = uz * vx - ux * vz
                cz = ux * vy - uy * vx
                area += 0.5 * math.sqrt(cx * cx + cy * cy + cz * cz)
            return area

    class _BMesh:
        def __init__(self):
            self.verts = []
            self.edges = []
            self.faces = []
            self.freed = False

        def from_mesh(self, me):
            self.verts = [_BMVert(i, v.co) for i, v in enumerate(getattr(me, "vertices", []))]
            edge_map = {}

            def _ensure_edge(i1, i2):
                key = (i1, i2) if i1 < i2 else (i2, i1)
                edge = edge_map.get(key)
                if edge is None:
                    v1, v2 = self.verts[key[0]], self.verts[key[1]]
                    edge = _BMEdge(v1, v2)
                    v1.link_edges.append(edge)
                    v2.link_edges.append(edge)
                    edge_map[key] = edge
                    self.edges.append(edge)
                return edge

            for raw_e in getattr(me, "edges", []):
                vs = getattr(raw_e, "vertices", raw_e)
                if len(vs) == 2:
                    _ensure_edge(int(vs[0]), int(vs[1]))

            for poly in getattr(me, "polygons", []):
                idxs = list(poly.vertices)
                fverts = [self.verts[idx] for idx in idxs]
                face = _BMFace(fverts)
                self.faces.append(face)
                n = len(idxs)
                for k in range(n):
                    e = _ensure_edge(idxs[k], idxs[(k + 1) % n])
                    e.link_faces.append(face)

        def free(self):
            self.freed = True
            self.verts.clear()
            self.edges.clear()
            self.faces.clear()

    bmesh.new = _BMesh
    return bmesh


def _make_cube_mesh(name, has_uv=True, material=None):
    coords = [
        (-0.5, -0.5, -0.5),
        (0.5, -0.5, -0.5),
        (0.5, 0.5, -0.5),
        (-0.5, 0.5, -0.5),
        (-0.5, -0.5, 0.5),
        (0.5, -0.5, 0.5),
        (0.5, 0.5, 0.5),
        (-0.5, 0.5, 0.5),
    ]
    quads = [
        (0, 1, 2, 3),
        (4, 7, 6, 5),
        (0, 4, 5, 1),
        (1, 5, 6, 2),
        (2, 6, 7, 3),
        (3, 7, 4, 0),
    ]
    edge_pairs = [
        (0, 1), (1, 2), (2, 3), (3, 0),
        (4, 5), (5, 6), (6, 7), (7, 4),
        (0, 4), (1, 5), (2, 6), (3, 7),
    ]
    verts = [types.SimpleNamespace(co=c, groups=[]) for c in coords]
    polys = [types.SimpleNamespace(vertices=q) for q in quads]
    edges = [types.SimpleNamespace(vertices=e) for e in edge_pairs]
    return types.SimpleNamespace(
        name=name,
        vertices=verts,
        edges=edges,
        polygons=polys,
        uv_layers=[types.SimpleNamespace(name="UVMap")] if has_uv else [],
        materials=[material] if material is not None else [],
        shape_keys=None,
    )


def _translation_matrix(loc):
    return (
        (1.0, 0.0, 0.0, float(loc[0])),
        (0.0, 1.0, 0.0, float(loc[1])),
        (0.0, 0.0, 1.0, float(loc[2])),
        (0.0, 0.0, 0.0, 1.0),
    )


def _default_bbox():
    return [
        (-0.5, -0.5, -0.5),
        (-0.5, -0.5, 0.5),
        (-0.5, 0.5, 0.5),
        (-0.5, 0.5, -0.5),
        (0.5, -0.5, -0.5),
        (0.5, -0.5, 0.5),
        (0.5, 0.5, 0.5),
        (0.5, 0.5, -0.5),
    ]


def build_fake_bpy(object_count):
    bpy = types.ModuleType("bpy")
    bpy.props = types.SimpleNamespace(
        IntProperty=lambda **k: None,
        StringProperty=lambda **k: None,
        BoolProperty=lambda **k: None,
    )

    class _Timers:
        def __init__(self):
            self.r = {}

        @staticmethod
        def _key(fn):
            return fn if isinstance(fn, str) else fn.__name__

        def register(self, fn, first_interval=0.0, persistent=False):
            self.r[self._key(fn)] = fn

        def unregister(self, fn):
            self.r.pop(self._key(fn), None)

        def is_registered(self, fn):
            return self._key(fn) in self.r

    class _App:
        def __init__(self):
            self.timers = _Timers()
            self.version_string = "4.2.1"

    bpy.app = _App()
    bpy.types = types.SimpleNamespace(AddonPreferences=object, Operator=object)
    bpy.utils = types.SimpleNamespace(register_class=lambda c: None, unregister_class=lambda c: None)
    bpy.app.handlers = types.SimpleNamespace(persistent=lambda f: f, load_post=[])

    class _PropCollection(list):
        def __init__(self, items=(), factory=None, on_remove=None):
            super().__init__(items)
            self._factory = factory
            self._on_remove = on_remove
            self.active = items[0] if items else None

        def get(self, name, default=None):
            for item in self:
                if item.name == name:
                    return item
            return default

        def __contains__(self, item):
            if isinstance(item, str):
                return any(o.name == item for o in self)
            return list.__contains__(self, item)

        def new(self, name, *args, **kwargs):
            if self._factory is None:
                obj = types.SimpleNamespace(name=name)
            else:
                obj = self._factory(name, *args, **kwargs)
            self.append(obj)
            return obj

        def remove(self, item, do_unlink=True):
            if item in self:
                self.remove_value(item)
            if self._on_remove is not None:
                self._on_remove(item)

        def remove_value(self, item):
            for idx, cur in enumerate(self):
                if cur is item:
                    del self[idx]
                    return

        def link(self, item):
            if item not in self:
                self.append(item)

        def unlink(self, item):
            self.remove_value(item)

    default_mat = types.SimpleNamespace(name="DefaultMat")
    materials_db = _PropCollection([default_mat], factory=lambda name: types.SimpleNamespace(name=name))
    meshes_db = _PropCollection(factory=lambda name: _make_cube_mesh(name, has_uv=True, material=default_mat))
    cameras_db = _PropCollection(
        factory=lambda name: types.SimpleNamespace(
            name=name, type="PERSP", ortho_scale=6.0, lens=50.0, clip_start=0.1, clip_end=100.0
        )
    )
    armatures_db = _PropCollection(
        factory=lambda name: types.SimpleNamespace(name=name, bones=[])
    )
    actions_db = _PropCollection(factory=lambda name: types.SimpleNamespace(name=name))

    class _FakeImage:
        def __init__(self, name, width, height, pixels=None):
            self.name = name
            self.size = (int(width), int(height))
            self.pixels = list(pixels) if pixels is not None else [0.0] * (int(width) * int(height) * 4)
            self.filepath_raw = ""
            self.file_format = "PNG"

        def save(self):
            _write_rgba_png(self.filepath_raw, self.size[0], self.size[1], self.pixels)

    class _ImagesCollection(_PropCollection):
        def new(self, name, width=64, height=64, alpha=True):
            img = _FakeImage(name, width, height)
            self.append(img)
            return img

        def load(self, filepath, check_existing=False):
            w, h, px = _read_rgba_png(filepath)
            img = _FakeImage(os.path.basename(filepath), w, h, px)
            self.append(img)
            return img

    images_db = _ImagesCollection()

    def _make_obj(name, obj_data=None, obj_type=None, loc=(0.0, 0.0, 0.0), dims=(1.0, 1.0, 1.0)):
        inferred = obj_type
        if inferred is None:
            if obj_data is None:
                inferred = "EMPTY"
            elif hasattr(obj_data, "polygons"):
                inferred = "MESH"
            elif hasattr(obj_data, "ortho_scale"):
                inferred = "CAMERA"
            elif hasattr(obj_data, "bones"):
                inferred = "ARMATURE"
            else:
                inferred = "EMPTY"
        state = {"selected": False}
        half_x, half_y, half_z = dims[0] * 0.5, dims[1] * 0.5, dims[2] * 0.5
        bbox = [
            (-half_x, -half_y, -half_z),
            (-half_x, -half_y, half_z),
            (-half_x, half_y, half_z),
            (-half_x, half_y, -half_z),
            (half_x, -half_y, -half_z),
            (half_x, -half_y, half_z),
            (half_x, half_y, half_z),
            (half_x, half_y, -half_z),
        ]
        return types.SimpleNamespace(
            name=name,
            type=inferred,
            parent=None,
            location=tuple(float(v) for v in loc),
            dimensions=tuple(float(v) for v in dims),
            scale=(1.0, 1.0, 1.0),
            rotation_mode="XYZ",
            rotation_euler=(0.0, 0.0, 0.0),
            modifiers=[],
            vertex_groups=[],
            hide_viewport=False,
            hide_render=False,
            keys=lambda: [],
            data=obj_data,
            children=[],
            bound_box=bbox,
            matrix_world=_translation_matrix(loc),
            select_get=lambda: state["selected"],
            select_set=lambda flag: state.__setitem__("selected", bool(flag)),
        )

    objects = []
    for i in range(object_count):
        is_mesh = bool(i % 3)
        me = _make_cube_mesh("Mesh_%03d" % i, has_uv=True, material=default_mat) if is_mesh else None
        if me is not None:
            meshes_db.append(me)
        obj = _make_obj(
            "Obj_%03d" % i,
            obj_data=me,
            obj_type="MESH" if is_mesh else "LIGHT",
            loc=(float(i), 0.0, 0.0),
            dims=(1.0, 1.0, 1.0),
        )
        objects.append(obj)

    if objects:
        objects[0].select_set(True)

    scene_col_objects = _PropCollection(objects)
    root_layer_children = []

    def _on_object_removed(obj):
        scene_col_objects.remove_value(obj)
        view_layer_objects.remove_value(obj)
        for col in collections_db:
            col.objects.remove_value(obj)

    objects_db = _PropCollection(
        objects,
        factory=lambda name, object_data=None: _make_obj(name, obj_data=object_data),
        on_remove=_on_object_removed,
    )

    view_layer_objects = _PropCollection(list(objects))
    view_layer_objects.active = objects[0] if objects else None

    class _SceneChildrenCollection(_PropCollection):
        def link(self, col):
            super().link(col)
            lc = types.SimpleNamespace(name=col.name, collection=col, children=[])
            root_layer_children.append(lc)

        def unlink(self, col):
            super().unlink(col)
            root_layer_children[:] = [lc for lc in root_layer_children if lc.collection is not col]

    scene_children = _SceneChildrenCollection()
    scene_collection = types.SimpleNamespace(
        name="Scene Collection",
        objects=scene_col_objects,
        children=scene_children,
    )
    root_layer_collection = types.SimpleNamespace(
        name="Scene Collection",
        collection=scene_collection,
        children=root_layer_children,
    )

    def _make_collection(name):
        return types.SimpleNamespace(name=name, objects=_PropCollection(), children=_PropCollection())

    def _on_col_removed(col):
        scene_children.unlink(col)

    collections_db = _PropCollection(factory=_make_collection, on_remove=_on_col_removed)

    render_ns = types.SimpleNamespace(
        engine="BLENDER_EEVEE",
        filepath="//render.png",
        film_transparent=False,
        resolution_x=1920,
        resolution_y=1080,
        resolution_percentage=100,
        image_settings=types.SimpleNamespace(file_format="PNG", color_mode="RGB"),
    )

    scene_ns = types.SimpleNamespace(
        name="TestScene",
        frame_current=1,
        camera=None,
        render=render_ns,
        objects=objects_db,
        collection=scene_collection,
    )

    view_layer_ns = types.SimpleNamespace(
        objects=view_layer_objects,
        layer_collection=root_layer_collection,
        active_layer_collection=root_layer_collection,
    )

    def _render_op(write_still=False):
        w = int(render_ns.resolution_x)
        h = int(render_ns.resolution_y)
        px = [0.0] * (w * h * 4)
        x0, x1 = w // 4, (w * 3) // 4
        y0, y1 = h // 4, (h * 3) // 4
        bg_alpha = 0.0 if render_ns.film_transparent else 1.0
        for y in range(h):
            for x in range(w):
                off = (y * w + x) * 4
                if x0 <= x < x1 and y0 <= y < y1:
                    px[off : off + 4] = [0.75, 0.78, 0.82, 1.0]
                else:
                    px[off : off + 4] = [0.0, 0.0, 0.0, bg_alpha]
        if write_still and render_ns.filepath:
            _write_rgba_png(render_ns.filepath, w, h, px)
        return {"FINISHED"}

    def _export_gltf(filepath="", export_format="GLB", use_selection=False, **kwargs):
        src = [o for o in objects_db if (not use_selection or o.select_get())]
        payload = {
            "meshes": [
                {"name": o.name, "location": list(o.location), "dimensions": list(o.dimensions)}
                for o in src
                if o.type == "MESH"
            ],
            "armatures": [
                {"name": o.name, "bones": [b.name for b in getattr(o.data, "bones", [])]}
                for o in src
                if o.type == "ARMATURE"
            ],
        }
        json_bytes = json.dumps(payload).encode("utf-8")
        while len(json_bytes) % 4 != 0:
            json_bytes += b" "
        total_len = 12 + 8 + len(json_bytes)
        os.makedirs(os.path.dirname(os.path.abspath(filepath)) or ".", exist_ok=True)
        with open(filepath, "wb") as handle:
            handle.write(struct.pack("<III", 0x46546C67, 2, total_len))
            handle.write(struct.pack("<II", len(json_bytes), 0x4E4F534A))
            handle.write(json_bytes)
        return {"FINISHED"}

    def _import_gltf(filepath="", **kwargs):
        with open(filepath, "rb") as handle:
            blob = handle.read()
        (json_len,) = struct.unpack("<I", blob[12:16])
        payload = json.loads(blob[20 : 20 + json_len].decode("utf-8"))
        active_col = view_layer_ns.active_layer_collection.collection
        for m in payload.get("meshes", []):
            me = _make_cube_mesh(m["name"] + "_rt_me", has_uv=True, material=default_mat)
            meshes_db.append(me)
            obj = _make_obj(
                m["name"] + "_rt",
                obj_data=me,
                obj_type="MESH",
                loc=tuple(m["location"]),
                dims=tuple(m["dimensions"]),
            )
            objects_db.append(obj)
            active_col.objects.link(obj)
            view_layer_objects.link(obj)
        for a in payload.get("armatures", []):
            arm_data = armatures_db.new(a["name"] + "_rt_arm")
            arm_data.bones = [types.SimpleNamespace(name=bn, use_deform=True) for bn in a.get("bones", [])]
            arm_obj = _make_obj(a["name"] + "_rt", obj_data=arm_data, obj_type="ARMATURE")
            objects_db.append(arm_obj)
            active_col.objects.link(arm_obj)
            view_layer_objects.link(arm_obj)
        return {"FINISHED"}

    def _save_mainfile(filepath="", **kwargs):
        os.makedirs(os.path.dirname(os.path.abspath(filepath)) or ".", exist_ok=True)
        with open(filepath, "wb") as handle:
            handle.write(b"BLENDER-v402FAKE")
        return {"FINISHED"}

    bpy.ops = types.SimpleNamespace(
        render=types.SimpleNamespace(render=_render_op),
        export_scene=types.SimpleNamespace(gltf=_export_gltf),
        import_scene=types.SimpleNamespace(gltf=_import_gltf),
        wm=types.SimpleNamespace(save_as_mainfile=_save_mainfile),
    )

    bpy.data = types.SimpleNamespace(
        objects=objects_db,
        meshes=meshes_db,
        cameras=cameras_db,
        images=images_db,
        armatures=armatures_db,
        materials=materials_db,
        collections=collections_db,
        actions=actions_db,
    )
    bpy.context = types.SimpleNamespace(
        scene=scene_ns,
        preferences=types.SimpleNamespace(addons={}),
        view_layer=view_layer_ns,
        mode="OBJECT",
    )
    return bpy


def run_headless_cli(argv):
    blend_file = None
    py_script = None
    i = 0
    while i < len(argv):
        arg = argv[i]
        if arg == "--python" and i + 1 < len(argv):
            py_script = argv[i + 1]
            i += 2
            continue
        if not arg.startswith("-") and arg.endswith(".blend"):
            blend_file = arg
        i += 1

    print("Blender 4.2.1 (hash 396f546c9d82 built 2024-08-19)", flush=True)
    if blend_file:
        print("Read blend: %s" % blend_file, flush=True)

    bpy_mod = build_fake_bpy(3)
    bpy_mod.data.filepath = blend_file or ""
    sys.modules["bpy"] = bpy_mod
    sys.modules["bmesh"] = build_fake_bmesh()

    if py_script:
        runpy.run_path(py_script, run_name="__main__")


def main():
    if "--background" in sys.argv[1:]:
        run_headless_cli(sys.argv[1:])
        return

    port = int(sys.argv[1])
    token = sys.argv[2]
    object_count = int(sys.argv[3]) if len(sys.argv) > 3 else 120

    sys.modules["bpy"] = build_fake_bpy(object_count)
    sys.modules["bmesh"] = build_fake_bmesh()
    import hsa_blender_addon as addon

    if token == "":
        bridge = addon._resolve_bridge()
    else:
        bridge = addon.HSABridge(port, token)
        bridge.start()

    def pump():
        while True:
            if token == "":
                addon._autostart()
            if bridge.is_running():
                bridge._drain()
            time.sleep(0.01)

    sys.stdout.reconfigure(line_buffering=True)
    threading.Thread(target=pump, daemon=True).start()

    print("FAKE_BLENDER_READY port=%d objects=%d" % (port, object_count), flush=True)
    while True:
        if token != "" and not bridge.is_running():
            break
        time.sleep(0.2)


if __name__ == "__main__":
    main()
