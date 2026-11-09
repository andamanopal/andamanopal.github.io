// "Inside one catch": one timeline drives the three videos, the probe view and the readout.
// Each object's clips and probe data load when the scrubber first comes near the viewport or the object is chosen.
import { RobotView, fetchPose } from "./robot3d.js";

(() => {
  const root = document.getElementById("scrubber");
  if (!root) return;

  const videos = [...root.querySelectorAll("video[data-view]")];
  const slider = root.querySelector("input[type=range]");
  const playButton = root.querySelector(".play");
  const plot = root.querySelector(".scrub-plot");
  const timeline = plot.querySelector("canvas");
  const probeCanvas = root.querySelector(".scrub-probes canvas");
  const objectButtons = root.querySelectorAll("button[data-object]");
  const out = Object.fromEntries([...root.querySelectorAll("[data-out]")].map((el) => [el.dataset.out, el]));

  let data = null;
  let current = 0;
  const robot = new RobotView(probeCanvas);
  // Without WebGL, a recording of the same view joins the clips the timeline drives, and the caption says why.
  if (!robot.available) {
    const recording = Object.assign(document.createElement("video"), { muted: true, playsInline: true, preload: "auto", className: "probe-recording" });
    recording.dataset.view = "probes";
    probeCanvas.closest("figure").classList.add("no-webgl");
    probeCanvas.replaceWith(recording);
    videos.push(recording);
  }

  const css = (name) => getComputedStyle(root).getPropertyValue(name).trim();

  function sizeCanvas(canvas) {
    const ratio = window.devicePixelRatio || 1;
    const width = canvas.clientWidth;
    const height = canvas.clientHeight;
    canvas.width = Math.round(width * ratio);
    canvas.height = Math.round(height * ratio);
    const ctx = canvas.getContext("2d");
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    return { ctx, width, height };
  }

  // The playhead and the data share this one mapping, so they cannot drift apart.
  const stepToX = (step, width) => (step / (data.rate.length - 1)) * width;

  function phases() {
    const { first_hand, first_secure, hold_complete } = data.events;
    const last = data.rate.length - 1;
    return [
      { label: "Flight", from: 0, to: first_hand },
      { label: "Contact, securing", from: first_hand, to: first_secure },
      { label: "Holding for 2.0 s", from: first_secure, to: hold_complete },
      { label: "Held", from: hold_complete, to: last },
    ].filter((phase) => phase.to > phase.from);
  }

  function drawTimeline() {
    if (!data) return;
    const { ctx, width, height } = sizeCanvas(timeline);
    const bandHeight = height - 22;
    ctx.clearRect(0, 0, width, height);
    ctx.font = `600 13px ${css("--sans")}`;
    ctx.textBaseline = "middle";

    phases().forEach((phase, index) => {
      const from = stepToX(phase.from, width);
      const to = stepToX(phase.to, width);
      const emphatic = index >= 2;  // the 2.0 s hold is what success means, so it carries the colour
      ctx.fillStyle = index === 3 ? css("--ink") : index === 2 ? css("--chart") : css("--rule");
      ctx.fillRect(from + (index ? 1 : 0), 0, to - from - (index ? 1 : 0), bandHeight);
      ctx.fillStyle = index === 3 ? css("--paper") : emphatic ? "#fff" : css("--ink");
      if (ctx.measureText(phase.label).width < to - from - 14) ctx.fillText(phase.label, from + 8, bandHeight / 2 + 1);
    });

    ctx.font = `400 12px ${css("--sans")}`;
    ctx.fillStyle = css("--muted");
    const seconds = Math.floor((data.rate.length - 1) / data.fps);
    for (let second = 0; second <= seconds; second += 1) {
      ctx.textAlign = second === 0 ? "left" : "center";
      ctx.fillText(`${second} s`, stepToX(second * data.fps, width), height - 8);
    }
    ctx.textAlign = "left";

    const x = stepToX(current, width);
    ctx.strokeStyle = css("--ink");
    ctx.fillStyle = css("--ink");
    ctx.lineWidth = 2.5;
    ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, bandHeight); ctx.stroke();
    ctx.beginPath(); ctx.arc(x, bandHeight, 6, 0, Math.PI * 2); ctx.fill();
  }

  function drawProbes() {
    if (data) robot.draw(current);
  }

  function phaseText(step) {
    const { first_hand, first_secure, hold_complete } = data.events;
    if (step < first_hand) return "Object in flight";
    if (step < first_secure) return "Contact, securing";
    if (step <= hold_complete) return `Secure, held ${((step - first_secure + 1) / data.fps).toFixed(2)} of 2.0 s`;
    return "Held for 2.0 s: success";
  }

  function show(step) {
    if (!data) return;
    current = step;
    slider.value = step;
    for (const video of videos) {
      if (video.readyState >= 1) video.currentTime = Math.min(step / data.fps, video.duration - 0.001);
    }
    out.phase.textContent = phaseText(step);
    drawTimeline();
    drawProbes();
  }

  // Playback follows the clock, not the display's frame rate, so one second of catch takes one second.
  let playing = false;
  let startTime = 0;
  let startStep = 0;
  function tick(now) {
    if (!playing) return;
    const step = (startStep + Math.floor(((now - startTime) / 1000) * data.fps)) % data.rate.length;
    if (step !== current) show(step);
    requestAnimationFrame(tick);
  }

  function setPlaying(value) {
    playing = value && data !== null;
    playButton.textContent = playing ? "Pause" : "Play";
    playButton.setAttribute("aria-label", playing ? "Pause" : "Play");
    if (playing) {
      startTime = performance.now();
      startStep = current;
      requestAnimationFrame(tick);
    }
  }

  async function load(key) {
    setPlaying(false);
    const [record, pose] = await Promise.all([
      fetch(`static/scrub/${key}/hcdv.json`).then((r) => r.json()),
      fetchPose(`static/scrub/${key}/pose.bin`),
    ]);
    data = record;
    robot.setRecord({ object: data.object, probes: data.probes, ends: data.ends, rate: data.rate, pose });
    slider.max = data.rate.length - 1;
    for (const video of videos) {
      video.addEventListener("loadedmetadata", () => show(current), { once: true });
      video.src = `static/scrub/${key}/${video.dataset.view}.mp4`;
    }
    show(Math.max(data.events.first_hand - 10, 0));
  }

  for (const button of objectButtons) {
    button.addEventListener("click", () => {
      for (const other of objectButtons) other.setAttribute("aria-checked", String(other === button));
      load(button.dataset.object);
    });
  }

  slider.addEventListener("input", () => { setPlaying(false); show(Number(slider.value)); });
  playButton.addEventListener("click", () => setPlaying(!playing));

  // Dragging on the chart moves the playhead to the pointer exactly. The range input stays for the keyboard.
  const seek = (event) => {
    const box = plot.getBoundingClientRect();
    const fraction = Math.max(0, Math.min(1, (event.clientX - box.left) / box.width));
    setPlaying(false);
    show(Math.round(fraction * (data.rate.length - 1)));
  };
  plot.addEventListener("pointerdown", (event) => {
    if (!data) return;
    plot.setPointerCapture(event.pointerId);
    slider.focus({ preventScroll: true });
    seek(event);
  });
  plot.addEventListener("pointermove", (event) => {
    if (data && plot.hasPointerCapture(event.pointerId)) seek(event);
  });

  new ResizeObserver(() => { drawTimeline(); drawProbes(); }).observe(root);

  const firstLook = new IntersectionObserver((entries) => {
    if (!entries.some((entry) => entry.isIntersecting)) return;
    firstLook.disconnect();
    load(objectButtons[0].dataset.object);
  }, { rootMargin: "400px 0px" });
  firstLook.observe(root);
})();
