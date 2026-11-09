// The see-through G1: the real robot's links, posed from the simulation's logs, with the hand probes and the vectors
// the controller reads inside it. One view per canvas; the catch clock calls draw(step).
import * as THREE from "./vendor/three.module.min.js";

const COLOURS = { background: 0x0f1114, shell: 0xc8d2e0, probe: 0xf2f3f5, surface: 0x8b94a0, closing: 0xf0853a, object: 0xbfae90 };
const CLOSING_RATE = -0.1;  // m/s, below which a vector is drawn as closing
const PROBE_COUNT = 22;
const FRAMING_SMOOTHING = 25;  // steps either side, so the camera eases instead of following every hand movement
const DISTANCE_PER_METRE = 4.4;  // camera distance per metre of reach, which fits it in the view
const MIN_DISTANCE = 1.45;
const MAX_DISTANCE = 3.0;

const shellMaterial = new THREE.ShaderMaterial({
  transparent: true,
  depthWrite: false,
  depthFunc: THREE.LessEqualDepth,
  side: THREE.DoubleSide,
  uniforms: { colour: { value: new THREE.Color(COLOURS.shell) } },
  vertexShader: `
    varying vec3 vNormal;
    varying vec3 vView;
    void main() {
      vec4 view = modelViewMatrix * vec4(position, 1.0);
      vNormal = normalize(normalMatrix * normal);
      vView = normalize(-view.xyz);
      gl_Position = projectionMatrix * view;
    }`,
  fragmentShader: `
    uniform vec3 colour;
    varying vec3 vNormal;
    varying vec3 vView;
    void main() {
      float facing = abs(dot(normalize(vNormal), normalize(vView)));
      float rim = pow(1.0 - facing, 2.2);
      gl_FragColor = vec4(colour, 0.13 + 0.8 * rim);
    }`,
});
// Written first, so only the nearest surface of each link shows and the robot reads as one clean shell.
const depthMaterial = new THREE.MeshBasicMaterial({ colorWrite: false, side: THREE.DoubleSide });

let modelRequest = null;
function loadModel() {
  modelRequest ??= (async () => {
    const [meta, bytes] = await Promise.all([
      fetch("static/robot/g1.json").then((r) => r.json()),
      fetch("static/robot/g1.bin").then((r) => r.arrayBuffer()),
    ]);
    const build = (entry) => {
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute("position", new THREE.BufferAttribute(new Float32Array(bytes, entry.vertexOffset, entry.vertexCount * 3), 3));
      geometry.setIndex(new THREE.BufferAttribute(new Uint16Array(bytes, entry.indexOffset, entry.indexCount), 1));
      geometry.computeVertexNormals();
      return geometry;
    };
    return {
      links: meta.links.map((link) => ({ name: link.name, geometry: build(link), rest: new THREE.Matrix4().fromArray(link.rest) })),
      objects: new Map(Object.entries(meta.objects ?? {}).map(([id, entry]) => [id, build(entry)])),
    };
  })();
  return modelRequest;
}

// The logs store each step's links in simulation order; the viewer needs only their names and this flat array.
export async function fetchPose(url) {
  const [names, bytes] = await Promise.all([
    fetch("static/robot/links.json").then((r) => r.json()),
    fetch(url).then((r) => r.arrayBuffer()),
  ]);
  return { names, data: new Float32Array(bytes) };
}

export class RobotView {
  constructor(canvas) {
    this.canvas = canvas;
    // available is false without WebGL; the page then shows a recording of this view instead
    // (tools/render_probe_views.py), and this object only absorbs calls.
    // A throwaway canvas asks first, so a browser without WebGL never reaches three.js, which would log errors.
    const probe = document.createElement("canvas");
    this.available = Boolean(probe.getContext("webgl2") || probe.getContext("webgl"));
    try {
      if (!this.available) throw new Error("WebGL unavailable");
      this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    } catch {
      this.available = false;
      this.draw = () => {};
      this.setRecord = () => {};
      this.ready = Promise.resolve();
      return;
    }
    this.renderer.setClearColor(COLOURS.background);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.scene = new THREE.Scene();
    this.scene.add(new THREE.HemisphereLight(0xffffff, 0x445066, 2.2));
    const key = new THREE.DirectionalLight(0xffffff, 1.6);
    key.position.set(1, -1, 2);
    this.scene.add(key);
    this.camera = new THREE.PerspectiveCamera(28, 1, 0.05, 30);
    this.camera.up.set(0, 0, 1);
    this.yaw = -0.5;
    this.pitch = 0.16;
    this.distance = MIN_DISTANCE;
    this.framing = null;
    this.links = new Map();
    this.record = null;
    this.step = 0;
    this.target = new THREE.Vector3(0, 0, 0.85);

    const dot = new THREE.SphereGeometry(1, 12, 10);
    this.probes = new THREE.InstancedMesh(dot, new THREE.MeshBasicMaterial({ color: COLOURS.probe }), PROBE_COUNT);
    this.ends = new THREE.InstancedMesh(dot, new THREE.MeshBasicMaterial({ color: 0xffffff }), PROBE_COUNT);
    this.vectorPositions = new Float32Array(PROBE_COUNT * 6);
    this.vectorColours = new Float32Array(PROBE_COUNT * 6);
    const lines = new THREE.BufferGeometry();
    lines.setAttribute("position", new THREE.BufferAttribute(this.vectorPositions, 3));
    lines.setAttribute("color", new THREE.BufferAttribute(this.vectorColours, 3));
    this.vectors = new THREE.LineSegments(lines, new THREE.LineBasicMaterial({ vertexColors: true }));
    this.vectors.frustumCulled = false;
    this.probes.frustumCulled = false;
    this.ends.frustumCulled = false;
    this.scene.add(this.vectors, this.probes, this.ends);
    for (const mesh of [this.probes, this.ends, this.vectors]) mesh.visible = false;

    this.sphere = new THREE.Mesh(new THREE.SphereGeometry(1, 32, 24),
      new THREE.MeshBasicMaterial({ color: COLOURS.closing, transparent: true, opacity: 0.2, depthWrite: false }));
    this.sphere.visible = false;
    this.scene.add(this.sphere);

    this.object = new THREE.Group();
    this.object.matrixAutoUpdate = false;
    this.object.visible = false;
    this.scene.add(this.object);
    this.objectMaterial = new THREE.MeshStandardMaterial({ color: COLOURS.object, roughness: 0.7, side: THREE.DoubleSide });

    this.ready = loadModel().then((model) => {
      this.objects = model.objects;
      this.links.set("object", this.object);
      this.showObject();
      for (const { name, geometry, rest } of model.links) {
        const group = new THREE.Group();
        group.matrixAutoUpdate = false;
        group.matrix.copy(rest);
        const depth = new THREE.Mesh(geometry, depthMaterial);
        depth.renderOrder = 1;
        const shell = new THREE.Mesh(geometry, shellMaterial);
        shell.renderOrder = 2;
        group.add(depth, shell);
        this.scene.add(group);
        this.links.set(name, group);
      }
      this.draw(this.step);
    });

    this.attachControls();
    this.resizeObserver = new ResizeObserver(() => this.draw(this.step));
    this.resizeObserver.observe(canvas);
  }

  attachControls() {
    let turning = null;
    const canvas = this.canvas;
    canvas.addEventListener("pointerdown", (event) => {
      canvas.setPointerCapture(event.pointerId);
      turning = { x: event.clientX, y: event.clientY, yaw: this.yaw, pitch: this.pitch };
    });
    canvas.addEventListener("pointermove", (event) => {
      if (!turning) return;
      this.yaw = turning.yaw - (event.clientX - turning.x) * 0.01;
      this.pitch = Math.max(-1.3, Math.min(1.3, turning.pitch + (event.clientY - turning.y) * 0.01));
      this.draw(this.step);
    });
    const stop = () => { turning = null; };
    canvas.addEventListener("pointerup", stop);
    canvas.addEventListener("pointercancel", stop);
  }

  // The real object, posed from the same logs, so a reader can see how close each estimate is to it.
  showObject() {
    this.object.clear();
    const geometry = this.objects?.get(this.record?.object);
    this.object.visible = Boolean(geometry);
    if (geometry) this.object.add(new THREE.Mesh(geometry, this.objectMaterial));
  }

  setRecord(record) {
    this.record = record;
    this.showObject();
    const has = record !== null;
    for (const mesh of [this.probes, this.ends, this.vectors]) mesh.visible = has && Boolean(record.probes);
    this.sphere.visible = has && Boolean(record.centre);
    this.framing = has && record.pose && record.probes ? this.planFraming(record) : null;
  }

  // Per step: a look-at point between the hands and chest, and a distance that fits the probes' vectors. Worked out
  // once from the whole catch, so dragging the timeline to any step gives the same view as playing to it.
  planFraming({ probes, ends, pose }) {
    const torso = pose.names.indexOf("torso_link");
    const steps = probes.length;
    const raw = probes.map((row, step) => {
      const hands = [0, 1, 2].map((axis) => row.reduce((sum, p) => sum + p[axis], 0) / row.length);
      const at = (step * pose.names.length + torso) * 7;
      const chest = [pose.data[at], pose.data[at + 1], pose.data[at + 2] + 0.15];
      const target = hands.map((value, axis) => value * 0.6 + chest[axis] * 0.4);
      const reach = Math.max(...[...row, ...ends[step], chest].map((q) => Math.hypot(q[0] - target[0], q[1] - target[1], q[2] - target[2])));
      return [...target, reach];
    });
    return raw.map((_, step) => {
      const from = Math.max(0, step - FRAMING_SMOOTHING);
      const to = Math.min(steps - 1, step + FRAMING_SMOOTHING);
      const mean = [0, 0, 0, 0];
      for (let i = from; i <= to; i += 1) raw[i].forEach((value, axis) => { mean[axis] += value / (to - from + 1); });
      return mean;
    });
  }

  applyPose(step) {
    const { pose } = this.record;
    if (!pose) return;
    const position = new THREE.Vector3();
    const quaternion = new THREE.Quaternion();
    const scale = new THREE.Vector3(1, 1, 1);
    pose.names.forEach((name, link) => {
      const group = this.links.get(name);
      if (!group) return;
      const at = (step * pose.names.length + link) * 7;
      position.set(pose.data[at], pose.data[at + 1], pose.data[at + 2]);
      // Isaac stores quaternions w first.
      quaternion.set(pose.data[at + 4], pose.data[at + 5], pose.data[at + 6], pose.data[at + 3]);
      group.matrix.compose(position, quaternion, scale);
    });
  }

  applyProbes(step) {
    const { probes, ends, rate, centre, radius } = this.record;
    if (!probes) return;
    const matrix = new THREE.Matrix4();
    const colour = new THREE.Color();
    const closing = new THREE.Color(COLOURS.closing);
    const surface = new THREE.Color(COLOURS.surface);
    for (let i = 0; i < PROBE_COUNT; i += 1) {
      const p = probes[step][i];
      const e = ends[step][i];
      matrix.makeScale(0.0065, 0.0065, 0.0065).setPosition(p[0], p[1], p[2]);
      this.probes.setMatrixAt(i, matrix);
      matrix.makeScale(0.0055, 0.0055, 0.0055).setPosition(e[0], e[1], e[2]);
      this.ends.setMatrixAt(i, matrix);
      colour.copy(rate[step][i] < CLOSING_RATE ? closing : surface);
      this.ends.setColorAt(i, colour);
      this.vectorPositions.set([p[0], p[1], p[2], e[0], e[1], e[2]], i * 6);
      this.vectorColours.set([colour.r, colour.g, colour.b, colour.r, colour.g, colour.b], i * 6);
    }
    this.probes.instanceMatrix.needsUpdate = true;
    this.ends.instanceMatrix.needsUpdate = true;
    this.ends.instanceColor.needsUpdate = true;
    this.vectors.geometry.attributes.position.needsUpdate = true;
    this.vectors.geometry.attributes.color.needsUpdate = true;
    if (centre) {
      this.sphere.position.set(...centre[step]);
      this.sphere.scale.setScalar(radius);
    }
  }

  draw(step) {
    this.step = step;
    if (this.record) {
      this.applyPose(step);
      this.applyProbes(step);
    }
    const width = this.canvas.clientWidth;
    const height = this.canvas.clientHeight;
    if (width === 0 || height === 0) return;
    // Resizing reallocates the drawing buffer, so only do it when the panel's size has actually changed.
    if (width !== this.width || height !== this.height) {
      this.width = width;
      this.height = height;
      this.renderer.setSize(width, height, false);
      this.camera.aspect = width / height;
      this.camera.updateProjectionMatrix();
    }
    const plan = this.framing?.[Math.min(step, this.framing.length - 1)];
    if (plan) {
      this.target.set(plan[0], plan[1], plan[2]);
      // A wide panel has spare room sideways, where the arms and vectors mostly reach, so it can sit closer.
      const widthFit = this.camera.aspect < 1 ? 1 / this.camera.aspect : 1 / Math.min(this.camera.aspect, 1.5);
      const fit = plan[3] * DISTANCE_PER_METRE * widthFit;
      this.distance = Math.max(MIN_DISTANCE, Math.min(MAX_DISTANCE * Math.max(1, widthFit), fit));
    }
    const cosPitch = Math.cos(this.pitch);
    this.camera.position.set(
      this.target.x + this.distance * Math.cos(this.yaw) * cosPitch,
      this.target.y + this.distance * Math.sin(this.yaw) * cosPitch,
      this.target.z + this.distance * Math.sin(this.pitch),
    );
    this.camera.lookAt(this.target);
    this.renderer.render(this.scene, this.camera);
  }
}
