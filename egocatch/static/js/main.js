// Clips load when they come near the viewport and play only while visible.
// With reduced motion requested, nothing autoplays and every clip gets controls instead.
const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const smallScreen = window.matchMedia("(max-width: 760px)").matches;
const clips = document.querySelectorAll("video[data-src]");

let paused = reduceMotion;
window.egocatchPaused = paused;

const observer = new IntersectionObserver((entries) => {
  for (const { target: video, isIntersecting } of entries) {
    video.dataset.visible = isIntersecting;
    if (isIntersecting && !video.src) video.src = (smallScreen && video.dataset.srcSmall) || video.dataset.src;
    if (paused) continue;
    if (isIntersecting) video.play().catch(() => {});
    else video.pause();
  }
}, { rootMargin: "200px 0px" });

for (const video of clips) {
  if (reduceMotion) video.controls = true;
  observer.observe(video);
}

const pauseButton = document.querySelector(".pause");
pauseButton.hidden = reduceMotion;
pauseButton.addEventListener("click", () => {
  paused = !paused;
  window.egocatchPaused = paused;
  pauseButton.textContent = paused ? "Play clips" : "Pause clips";
  pauseButton.setAttribute("aria-pressed", String(paused));
  for (const video of clips) {
    if (paused) video.pause();
    else if (video.dataset.visible === "true") video.play().catch(() => {});
  }
});

// The section nav marks the section being read.
const navLinks = [...document.querySelectorAll(".nav-links a")];
const sections = navLinks.map((link) => document.querySelector(link.getAttribute("href")));
const sectionWatcher = new IntersectionObserver((entries) => {
  for (const { target, isIntersecting } of entries) {
    if (!isIntersecting) continue;
    for (const [index, link] of navLinks.entries()) link.classList.toggle("current", sections[index] === target);
  }
}, { rootMargin: "-45% 0px -50% 0px" });
for (const section of sections) sectionWatcher.observe(section);

// The throw-type clips all start at release and share one length; keeping the others on the first one's clock
// keeps the three objects in the air together, so their arcs compare moment by moment.
for (const grid of document.querySelectorAll(".throw-grid")) {
  const [leader, ...followers] = grid.querySelectorAll("video");
  for (const video of followers) {
    video.addEventListener("timeupdate", () => {
      if (leader.readyState >= 1 && Math.abs(video.currentTime - leader.currentTime) > 0.1) video.currentTime = leader.currentTime;
    });
  }
}

for (const button of document.querySelectorAll("button[data-copy]")) {
  button.addEventListener("click", async () => {
    const text = document.getElementById(button.dataset.copy).textContent;
    await navigator.clipboard.writeText(text);
    button.textContent = "Copied";
    setTimeout(() => { button.textContent = "Copy"; }, 1500);
  });
}
