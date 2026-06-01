// scene3d.mjs — scene3d substrate (3D primitive factory + WebGL cell init).
// Extracted from lucida.mjs on 2026-05-31 (Tier-2 rank 1, second half).
//
// Three exports:
//   buildScene3DObject(obj, T, resolveColor) -> mesh|null
//     The per-kind factory. Pure: same THREE.js calls each time, no
//     closure deps. Adding a new primitive lands here in one place.
//   buildScene3DMeshes(spec, T, resolveColor) -> { root, animatables }
//     Wraps the factory in a Group. Used by mixed3d war-room to route
//     scene3d cells into the holo space without spinning a separate
//     WebGL context per cell.
//   initScene3D(container, spec, resolveColor) -> { play, pause, dispose }
//     Full WebGL substrate for standalone scene3d cells: renderer, scene,
//     camera (auto-fit), ResizeObserver, play/pause render loop, dispose.
//
// `resolveColor` is passed as a parameter so this module has no coupling
// to the lucida palette globals (TC.palette etc.). The caller resolves
// `$paletteRef → color` and the factory does the rest.

export function buildScene3DObject(obj, T, resolveColor) {
  const color = new T.Color(resolveColor(obj.color) || "#ffffff");
  const size = obj.size || 1;
  if (obj.kind === "wireframe_cube") {
    const geo = new T.BoxGeometry(size, size, size);
    return new T.LineSegments(new T.WireframeGeometry(geo),
      new T.LineBasicMaterial({ color }));
  }
  if (obj.kind === "wireframe_sphere") {
    const geo = new T.SphereGeometry(size, 16, 12);
    return new T.LineSegments(new T.WireframeGeometry(geo),
      new T.LineBasicMaterial({ color }));
  }
  if (obj.kind === "torus") {
    const geo = new T.TorusGeometry(size, size * 0.3, 8, 24);
    return new T.Mesh(geo, new T.MeshBasicMaterial({ color, wireframe: true }));
  }
  if (obj.kind === "icosahedron") {
    const geo = new T.IcosahedronGeometry(size, 0);
    return new T.Mesh(geo, new T.MeshBasicMaterial({ color, wireframe: true }));
  }
  if (obj.kind === "tetrahedron") {
    const geo = new T.TetrahedronGeometry(size, 0);
    return new T.Mesh(geo, new T.MeshBasicMaterial({ color, wireframe: true }));
  }
  if (obj.kind === "octahedron") {
    const geo = new T.OctahedronGeometry(size, 0);
    return new T.Mesh(geo, new T.MeshBasicMaterial({ color, wireframe: true }));
  }
  if (obj.kind === "dodecahedron") {
    const geo = new T.DodecahedronGeometry(size, 0);
    return new T.Mesh(geo, new T.MeshBasicMaterial({ color, wireframe: true }));
  }
  if (obj.kind === "box") {
    const w_ = size;
    const h_ = (typeof obj.height === "number") ? obj.height : size;
    const d_ = (typeof obj.depth === "number") ? obj.depth : size;
    const geo = new T.BoxGeometry(w_, h_, d_);
    return new T.LineSegments(new T.WireframeGeometry(geo),
      new T.LineBasicMaterial({ color }));
  }
  if (obj.kind === "tube") {
    const path = Array.isArray(obj.path) ? obj.path.filter(p => Array.isArray(p) && p.length === 3) : [];
    if (path.length < 2) return null;
    const points = path.map(p => new T.Vector3(p[0], p[1], p[2]));
    const curve = new T.CatmullRomCurve3(points, false, "catmullrom", 0.5);
    const tubularSegments = Math.max(20, path.length * 8);
    const radius = size || 0.05;
    const geo = new T.TubeGeometry(curve, tubularSegments, radius, 8, false);
    return new T.Mesh(geo, new T.MeshBasicMaterial({ color, wireframe: true }));
  }
  if (obj.kind === "axis_helper") {
    return new T.AxesHelper(size);
  }
  if (obj.kind === "particle_cloud") {
    const geo = new T.BufferGeometry();
    const positions = [];
    const count = obj.count || 100;
    const spread = obj.spread || 3;
    for (let i = 0; i < count; i++) {
      positions.push((Math.random() - 0.5) * spread * 2);
      positions.push((Math.random() - 0.5) * spread * 2);
      positions.push((Math.random() - 0.5) * spread * 2);
    }
    geo.setAttribute("position", new T.Float32BufferAttribute(positions, 3));
    return new T.Points(geo, new T.PointsMaterial({ color, size: 0.05 }));
  }
  if (obj.kind === "cylinder") {
    const radius = size;
    const height = (typeof obj.height === "number") ? obj.height : size * 2;
    const geo = new T.CylinderGeometry(radius, radius, height, 16, 1, false);
    const fill = new T.Mesh(geo, new T.MeshBasicMaterial({
      color, transparent: true, opacity: 0.4,
    }));
    const edges = new T.LineSegments(
      new T.EdgesGeometry(geo, 1),
      new T.LineBasicMaterial({ color, transparent: true, opacity: 0.9 }),
    );
    const group = new T.Group();
    group.add(fill);
    group.add(edges);
    return group;
  }
  if (obj.kind === "cone") {
    const radius = size;
    const height = (typeof obj.height === "number") ? obj.height : size * 2;
    const geo = new T.ConeGeometry(radius, height, 16, 1, false);
    const fill = new T.Mesh(geo, new T.MeshBasicMaterial({
      color, transparent: true, opacity: 0.4,
    }));
    const edges = new T.LineSegments(
      new T.EdgesGeometry(geo, 1),
      new T.LineBasicMaterial({ color, transparent: true, opacity: 0.9 }),
    );
    const group = new T.Group();
    group.add(fill);
    group.add(edges);
    return group;
  }
  if (obj.kind === "plane") {
    const w_ = size;
    const h_ = (typeof obj.height === "number") ? obj.height : size;
    const geo = new T.PlaneGeometry(w_, h_, 1, 1);
    return new T.Mesh(geo, new T.MeshBasicMaterial({
      color, wireframe: true, side: T.DoubleSide,
    }));
  }
  if (obj.kind === "line") {
    const from = Array.isArray(obj.from) ? obj.from : [0, 0, 0];
    const to = Array.isArray(obj.to) ? obj.to : [1, 0, 0];
    const geo = new T.BufferGeometry().setFromPoints([
      new T.Vector3(...from),
      new T.Vector3(...to),
    ]);
    return new T.Line(geo, new T.LineBasicMaterial({ color }));
  }
  if (obj.kind === "label") {
    const text = String(obj.text || "");
    const cnv = document.createElement("canvas");
    const ctx = cnv.getContext("2d");
    const fontPx = 64;
    ctx.font = `${fontPx}px ${getComputedStyle(document.body).getPropertyValue("--type-mono") || "monospace"}`;
    const metrics = ctx.measureText(text);
    cnv.width = Math.max(64, Math.ceil(metrics.width) + 20);
    cnv.height = fontPx + 20;
    ctx.font = `${fontPx}px ${getComputedStyle(document.body).getPropertyValue("--type-mono") || "monospace"}`;
    ctx.fillStyle = `rgb(${Math.round(color.r * 255)}, ${Math.round(color.g * 255)}, ${Math.round(color.b * 255)})`;
    ctx.textBaseline = "middle";
    ctx.textAlign = "center";
    ctx.fillText(text, cnv.width / 2, cnv.height / 2);
    const tex = new T.CanvasTexture(cnv);
    const mat = new T.SpriteMaterial({ map: tex, transparent: true });
    const sprite = new T.Sprite(mat);
    const scale = size || 0.5;
    sprite.scale.set(scale * (cnv.width / cnv.height), scale, 1);
    return sprite;
  }
  return null;
}

export function buildScene3DMeshes(spec, T, resolveColor) {
  const root = new T.Group();
  const animatables = [];
  for (const obj of (spec.objects || [])) {
    const mesh = buildScene3DObject(obj, T, resolveColor);
    if (!mesh) continue;
    if (Array.isArray(obj.position)) mesh.position.set(...obj.position);
    root.add(mesh);
    if (Array.isArray(obj.rotation_speed)) {
      animatables.push({ mesh, speed: obj.rotation_speed });
    }
  }
  return { root, animatables };
}

export function initScene3D(container, spec, resolveColor) {
  const T = window.THREE;
  if (!T) {
    container.textContent = "Three.js not available";
    return null;
  }
  const w = container.clientWidth || 600;
  const h = 360;
  const renderer = new T.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setSize(w, h, false);
  // Ensure the canvas CSS size matches the container exactly. Without
  // this, when the cell is hero-width at init then shrinks into ambient
  // (or any reflow), the canvas keeps its initial CSS width and overflows
  // out the right side of the cell. Combined with the ResizeObserver
  // below, the renderer tracks the cell width at all times.
  renderer.domElement.style.width = "100%";
  renderer.domElement.style.height = h + "px";
  renderer.domElement.style.display = "block";
  const bg = spec.background;
  if (bg && bg !== "transparent") {
    renderer.setClearColor(bg, 1);
  } else {
    renderer.setClearColor(0x000000, 0);
  }
  container.appendChild(renderer.domElement);

  const scene = new T.Scene();
  const camera = new T.PerspectiveCamera(50, w / h, 0.1, 100);
  camera.position.set(0, 0, spec.camera_distance || 5);

  const animatables = [];
  for (const obj of (spec.objects || [])) {
    const mesh = buildScene3DObject(obj, T, resolveColor);
    if (!mesh) continue;
    if (Array.isArray(obj.position)) mesh.position.set(...obj.position);
    scene.add(mesh);
    if (Array.isArray(obj.rotation_speed)) {
      animatables.push({ mesh, speed: obj.rotation_speed });
    }
  }

  // Auto-fit camera. LLM-specced positions often place labels/objects
  // outside the default camera_distance frustum — cell-4578 has labels
  // at y=5.15 with camera_distance=7 (~10% past visible region), so
  // "used 9.7Gi" text overflowed the top of the cell viewport. Compute
  // the scene's bounding box and pull the camera back along Z until
  // the box fits with a margin. Re-target lookAt to box center so the
  // scene is visually centered regardless of how the LLM laid it out.
  // Spec's camera_distance is treated as a MINIMUM (cleanly framed
  // scenes don't lose their composition).
  const bbox = new T.Box3().setFromObject(scene);
  if (!bbox.isEmpty()) {
    const center = bbox.getCenter(new T.Vector3());
    const size = bbox.getSize(new T.Vector3());
    const fovRad = (camera.fov * Math.PI) / 180;
    const margin = 1.18;
    const distForH = (size.y / 2) * margin / Math.tan(fovRad / 2);
    const distForW = (size.x / 2) * margin / (Math.tan(fovRad / 2) * camera.aspect);
    const minDist = spec.camera_distance || 5;
    const requiredDist = Math.max(distForH, distForW, minDist);
    camera.position.set(center.x, center.y, center.z + requiredDist);
    camera.lookAt(center);
  }

  // Render loop is play/pause-able via the returned controller; the caller
  // wires it to an IntersectionObserver so off-screen scenes don't compete
  // for the GPU thread.
  let running = false;
  function animate() {
    if (!running) return;
    requestAnimationFrame(animate);
    for (const a of animatables) {
      a.mesh.rotation.x += a.speed[0] || 0;
      a.mesh.rotation.y += a.speed[1] || 0;
      a.mesh.rotation.z += a.speed[2] || 0;
    }
    renderer.render(scene, camera);
  }
  // Track container width with ResizeObserver. Without this, scenes that
  // initialize at hero width and later get shifted into ambient (half-width
  // grid slot) keep their original canvas size and overflow the cell —
  // user-visible as "3D content mostly cut off" on cells like 0658.
  const ro = new ResizeObserver((entries) => {
    for (const entry of entries) {
      const cw = entry.contentRect.width;
      if (cw > 10) {
        renderer.setSize(cw, h, false);
        renderer.domElement.style.width = "100%";
        renderer.domElement.style.height = h + "px";
        camera.aspect = cw / h;
        camera.updateProjectionMatrix();
        if (!bbox.isEmpty()) {
          const center = bbox.getCenter(new T.Vector3());
          const size = bbox.getSize(new T.Vector3());
          const fovRad = (camera.fov * Math.PI) / 180;
          const margin = 1.18;
          const distForH = (size.y / 2) * margin / Math.tan(fovRad / 2);
          const distForW = (size.x / 2) * margin / (Math.tan(fovRad / 2) * camera.aspect);
          const minDist = spec.camera_distance || 5;
          const requiredDist = Math.max(distForH, distForW, minDist);
          if (requiredDist > camera.position.z - center.z) {
            camera.position.set(center.x, center.y, center.z + requiredDist);
            camera.lookAt(center);
          }
        }
      }
    }
  });
  ro.observe(container);
  return {
    play() { if (!running) { running = true; animate(); } },
    pause() { running = false; },
    dispose() {
      running = false;
      ro.disconnect();
      scene.traverse(obj => {
        if (obj.geometry) obj.geometry.dispose();
        if (obj.material) {
          if (Array.isArray(obj.material)) obj.material.forEach(m => { m.dispose(); });
          else obj.material.dispose();
        }
      });
      renderer.dispose();
      if (renderer.forceContextLoss) renderer.forceContextLoss();
      if (renderer.domElement && renderer.domElement.parentNode) {
        renderer.domElement.parentNode.removeChild(renderer.domElement);
      }
    },
  };
}
