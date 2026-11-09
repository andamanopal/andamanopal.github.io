// "What each part contributes": each button plays one condition beside the full system on the same throw.
// Also opens an object's rendered throws from the catalog.
import { RobotView, fetchPose } from "./robot3d.js";

(async () => {
  const pairs = await (await fetch("static/bench.json")).json();

  const CONDITIONS = [
    { key: "geometry", label: "Simulator geometry", value: 71.7, note: "The controller gets the object's exact shape from the simulator instead of from the camera, and does no better than with vision." },
    { key: "supervised", label: "Supervised predictor", value: 66.1, note: "The vision module is trained only to copy the exact shape, skipping the final round of training on catching itself.",
      input: "Pooled depth, 90×160.", channel: "The channel it predicts, trained only to match ground truth." },
    { key: "tracker", label: "Ballistic tracker", value: 60.6, note: "A classical tracker treats the object as a ball and predicts its flight. The hands reach it, then lose it.",
      input: "Blue: depth pixels near the object's true position, a nearby hand included. Orange: the sphere and path it fits, given gravity and size.", channel: "Each probe's vector ends on that sphere, which has no orientation or spin." },
    { key: "analytic", label: "Analytic surface", value: 18.8, note: "A hand-built estimate of the nearest visible surface replaces the learned one. The hands reach the object, then lose it.",
      input: "Blue: depth pixels near the object's true position, a nearby hand included.", channel: "Each probe's vector ends at its nearest visible surface point." },
    { key: "frozen", label: "Depth frozen", value: 1.2, display: "≤1.2", note: "The camera image stops updating early in the flight. Shuffled or delayed images fail the same way.",
      input: "The depth it receives stops updating after the first stack.", channel: "The channel it predicts from that stale depth." },
    { key: "history", label: "Three frames", value: 16.0, note: "Retrained without being told how fast the object is closing on each hand, it has to work that out from three recent frames." },
    { key: "single", label: "One frame", value: 0, display: "0.0", note: "With a single frame and no closing speed, the controller never learns to catch." },
    { key: "legs_off", base: "legs_on", baseName: "All joints commanded, 68.8%", label: "No legs", value: 0, display: "0.0", note: "The legs stop receiving commands. The hands still reach the object just as often, but the robot falls before it can hold on." },
  ];

  const root = document.querySelector(".bench");
  const list = root.querySelector(".bench-list");
  const note = root.querySelector(".bench-note");
  const [baseVideo, testVideo] = root.querySelectorAll(".bench-stage video");
  const [baseMark, testMark] = root.querySelectorAll(".bench-stage .mark");
  const baseName = root.querySelector('[data-out="base-name"]');
  const testName = root.querySelector('[data-out="test-name"]');
  const throwButtons = root.querySelectorAll("button[data-throw]");
  const how = root.querySelector(".bench-how");
  const howVideo = how.querySelector("video");
  const howCanvas = how.querySelector("canvas");
  const howInput = how.querySelector('[data-out="how-input"]');
  const howChannel = how.querySelector('[data-out="how-channel"]');
  const howRobot = new RobotView(howCanvas);
  // Without WebGL, a recording of the same view plays in its place on the clips' clock, and the caption says why.
  let howRecording = null;
  if (!howRobot.available) {
    howRecording = Object.assign(document.createElement("video"), { muted: true, playsInline: true, loop: true, preload: "auto", className: "probe-recording" });
    howCanvas.closest("figure").classList.add("no-webgl");
    howCanvas.replaceWith(howRecording);
  }
  let howLength = 0;
  let outcomeAt = [0, 0];  // the simulation step each clip's outcome is decided, from bench.json
  const conditions = {};
  let condition = "geometry";
  let take = 0;
  let visible = false;

  for (const row of CONDITIONS) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "bench-row";
    button.setAttribute("aria-pressed", "false");
    const label = document.createElement("span");
    label.className = "bench-label";
    label.textContent = row.label;
    const value = document.createElement("span");
    value.className = "bench-value";
    value.textContent = `${row.display ?? row.value.toFixed(1)}%`;
    const track = document.createElement("span");
    track.className = "bench-track";
    const bar = document.createElement("i");
    bar.style.width = `${row.value}%`;
    track.append(bar);
    button.append(label, value, track);
    button.addEventListener("click", () => select(row.key));
    list.append(button);
    conditions[row.key] = { ...row, line: button };
  }

  const setMark = (mark, held) => {
    mark.textContent = held ? "Held 2.0 s" : "No 2.0 s hold";
    mark.classList.toggle("lost", !held);
  };

  // Clips play their first 60 steps at half speed, so a clip's clock maps to simulation steps like this.
  const SLOW_STEPS = 60;
  const clipStep = (seconds) => {
    const frame = Math.floor(seconds * 50);
    return frame < SLOW_STEPS * 2 ? Math.floor(frame / 2) : SLOW_STEPS + frame - SLOW_STEPS * 2;
  };

  function drawHow() {
    if (!howLength || how.hidden || howCanvas.clientWidth === 0) return;
    howRobot.draw(Math.min(clipStep(testVideo.currentTime), howLength - 1));
  }

  // Each label appears when its outcome is decided: the end of the 2.0 s hold, or the moment the failure shows.
  function showMarks() {
    const step = clipStep(baseVideo.currentTime);
    baseMark.classList.toggle("shown", step >= outcomeAt[0]);
    testMark.classList.toggle("shown", step >= outcomeAt[1]);
  }

  function howLoop() {
    if (visible) {
      drawHow();
      showMarks();
    }
    requestAnimationFrame(howLoop);
  }
  requestAnimationFrame(howLoop);

  async function loadHow(pair) {
    const row = conditions[condition];
    how.hidden = !row.input;
    howLength = 0;
    if (!row.input) {
      for (const video of [howVideo, howRecording].filter(Boolean)) {
        video.removeAttribute("src");
        video.load();
      }
      return;
    }
    howInput.textContent = row.input;
    howChannel.textContent = row.channel;
    howVideo.poster = `static/img/bench/how_${pair.test}.jpg`;
    howVideo.src = `static/video/bench/how_${pair.test}.mp4`;
    if (howRecording) howRecording.src = `static/video/bench/how3d_${pair.test}.mp4`;
    if (visible && !window.egocatchPaused) {
      howVideo.play().catch(() => {});
      howRecording?.play().catch(() => {});
    }
    const name = pair.test;
    const [data, pose] = await Promise.all([
      fetch(`static/bench/${name}.json`).then((r) => r.json()),
      fetchPose(`static/bench/${name}.pose`),
    ]);
    if (pairs[condition][take].test !== name) return;
    howRobot.setRecord({ ...data, pose });
    howLength = data.rate.length;
  }

  function load() {
    const pair = pairs[condition][take];
    baseVideo.poster = `static/img/bench/${pair.base}.jpg`;
    testVideo.poster = `static/img/bench/${pair.test}.jpg`;
    baseVideo.src = `static/video/bench/${pair.base}.mp4`;
    testVideo.src = `static/video/bench/${pair.test}.mp4`;
    setMark(baseMark, pair.baseHeld);
    setMark(testMark, pair.testHeld);
    outcomeAt = [pair.baseAt, pair.testAt];
    showMarks();
    loadHow(pair);
    if (visible && !window.egocatchPaused) {
      baseVideo.play().catch(() => {});
      testVideo.play().catch(() => {});
    }
  }

  function select(key) {
    condition = key;
    const row = conditions[key];
    for (const other of Object.values(conditions)) {
      other.line.setAttribute("aria-pressed", String(other === row));
    }
    note.textContent = row.note;
    baseName.textContent = row.baseName ?? "Full system, 72.0%";
    testName.textContent = `${row.label}, ${row.display ?? row.value.toFixed(1)}%`;
    // Conditions have up to three throws, and the tabs show only the ones this condition has.
    take = 0;
    throwButtons.forEach((button, index) => {
      button.hidden = index >= pairs[key].length || pairs[key].length === 1;
      button.setAttribute("aria-checked", String(index === 0));
    });
    if (visible) load();
  }

  for (const button of throwButtons) {
    button.addEventListener("click", () => {
      take = Number(button.dataset.throw);
      for (const other of throwButtons) other.setAttribute("aria-checked", String(other === button));
      load();
    });
  }

  // Both clips share one length, so keeping the second on the first's clock keeps them on the same throw moment.
  testVideo.addEventListener("timeupdate", () => {
    if (Math.abs(testVideo.currentTime - baseVideo.currentTime) > 0.1) testVideo.currentTime = baseVideo.currentTime;
    for (const video of [howVideo, howRecording].filter(Boolean)) {
      if (!how.hidden && Math.abs(video.currentTime - baseVideo.currentTime) > 0.1) video.currentTime = baseVideo.currentTime;
    }
  });

  new IntersectionObserver(([entry]) => {
    visible = entry.isIntersecting;
    if (visible && !baseVideo.src) load();
    if (visible && !window.egocatchPaused) {
      baseVideo.play().catch(() => {});
      testVideo.play().catch(() => {});
      if (!how.hidden) {
        howVideo.play().catch(() => {});
        howRecording?.play().catch(() => {});
      }
    } else if (!visible) {
      baseVideo.pause();
      testVideo.pause();
      howVideo.pause();
      howRecording?.pause();
    }
  }, { rootMargin: "200px 0px" }).observe(root.querySelector(".bench-stage"));

  select(condition);

  // An object's rendered throw, opened from the catalog.
  const dialog = document.querySelector(".trial-dialog");
  const dialogVideo = dialog.querySelector("video");
  const caption = dialog.querySelector('[data-out="trial"]');
  window.egocatchOpenTrial = (index, held) => {
    const number = String(index).padStart(2, "0");
    dialogVideo.poster = `static/img/trial/${number}.jpg`;
    dialogVideo.src = `static/video/trial/${number}.mp4`;
    caption.textContent = held ? "Held for 2.0 s" : "No 2.0 s hold";
    dialog.showModal();
    dialogVideo.play().catch(() => {});
  };
  dialog.addEventListener("close", () => { dialogVideo.pause(); dialogVideo.removeAttribute("src"); dialogVideo.load(); });
  dialog.querySelector(".close").addEventListener("click", () => dialog.close());
  dialog.addEventListener("click", (event) => { if (event.target === dialog) dialog.close(); });
})();
