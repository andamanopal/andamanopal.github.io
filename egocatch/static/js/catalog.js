// The object catalog: a shape map drawn from the objects themselves, a searchable wall, and an inspector.
// All thumbnails come from one atlas, so the whole catalog appears after a single image loads.
(async () => {
  const root = document.getElementById("catalog");
  if (!root) return;

  const ATLAS_CELL = 128;
  const ATLAS_COLUMNS = 32;
  const VIEWS = 16;
  const SOURCES = {
    objaverse: "Objaverse", ycb: "YCB", gso: "Google Scanned Objects", dgn2: "DexGraspNet 2.0", abo: "Amazon Berkeley Objects",
  };

  const map = root.querySelector(".map");
  const canvas = map.querySelector("canvas");
  const wall = root.querySelector(".wall");
  const count = root.querySelector(".catalog-count");
  const search = root.querySelector("input[type=search]");
  const clearSearch = root.querySelector(".search-clear");
  const menu = root.querySelector(".menu");
  const menuButton = menu.querySelector(".menu-button");
  const menuList = menu.querySelector(".menu-list");
  const options = [...menuList.querySelectorAll("[role=option]")];
  const turntable = root.querySelector(".turntable");
  const inspector = root.querySelector(".inspector");
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  const css = (name) => getComputedStyle(root).getPropertyValue(name).trim();
  const sprite = (element, index) => {
    const column = index % ATLAS_COLUMNS;
    const row = Math.floor(index / ATLAS_COLUMNS);
    element.style.backgroundPosition = `${(column / (ATLAS_COLUMNS - 1)) * 100}% ${(row / (ATLAS_COLUMNS - 1)) * 100}%`;
  };

  let objects = [];
  let atlas = null;
  let visible = [];
  let selected = 0;
  const filter = { split: "all", source: "all", text: "" };
  const zoom = { k: 1, x: 0.5, y: 0.5 };

  /* Filtering */

  function matches(object, source = filter.source) {
    if (filter.split === "train" && object.t) return false;
    if (filter.split === "test" && !object.t) return false;
    if (source !== "all" && object.r !== source) return false;
    if (filter.text && !`${object.n} ${object.q} ${SOURCES[object.r]}`.toLowerCase().includes(filter.text)) return false;
    return true;
  }

  function applyFilter() {
    visible = objects.map((_, index) => index).filter((index) => matches(objects[index]));
    count.textContent = `${visible.length.toLocaleString("en-US")} ${visible.length === 1 ? "object" : "objects"}`;
    for (const tile of wall.children) tile.hidden = !matches(objects[Number(tile.dataset.index)]);
    root.classList.toggle("empty", visible.length === 0);
    // Each repository's count under the current split and search, so the menu says what choosing it would show.
    for (const option of options) {
      option.lastElementChild.textContent = objects.filter((object) => matches(object, option.dataset.value)).length.toLocaleString("en-US");
    }
    if (visible.length && !visible.includes(selected)) inspect(visible[0]);
    drawMap();
  }

  /* Shape map */

  const MARGIN = { left: 58, right: 16, top: 26, bottom: 46 };
  // Unzoomed, the 0 to 1 range sits inside the plot with room for thumbnails at its edges.
  const INSET = 0.9;
  let hovered = -1;
  let placed = [];
  let frame = null;

  function scales(width, height) {
    const plotWidth = width - MARGIN.left - MARGIN.right;
    const plotHeight = height - MARGIN.top - MARGIN.bottom;
    return {
      x: (b) => MARGIN.left + plotWidth * (0.5 + (b - zoom.x) * zoom.k * INSET),
      y: (c) => MARGIN.top + plotHeight * (0.5 - (c - zoom.y) * zoom.k * INSET),
      plotWidth,
      plotHeight,
    };
  }

  // A fixed pseudo-random priority keeps the same objects on top as the view changes.
  const priority = (index) => (index * 2654435761) % 4294967296;

  function placeThumbnails(scale, width, height, thumb) {
    const taken = new Set();
    const cell = thumb * 0.78;
    placed = [];
    const order = [...visible].sort((a, b) => priority(a) - priority(b));
    for (const index of order) {
      const x = scale.x(objects[index].b);
      const y = scale.y(objects[index].c);
      if (x < MARGIN.left || x > width - MARGIN.right || y < MARGIN.top || y > height - MARGIN.bottom) continue;
      const key = `${Math.round(x / cell)},${Math.round(y / cell)}`;
      if (taken.has(key)) continue;
      taken.add(key);
      placed.push(index);
    }
  }

  function drawThumbnail(ctx, index, x, y, size) {
    const sx = (index % ATLAS_COLUMNS) * ATLAS_CELL;
    const sy = Math.floor(index / ATLAS_COLUMNS) * ATLAS_CELL;
    ctx.drawImage(atlas, sx, sy, ATLAS_CELL, ATLAS_CELL, x - size / 2, y - size / 2, size, size);
  }

  function drawMap() {
    frame = null;
    if (map.hidden || !atlas || canvas.clientWidth === 0) return;
    const ratio = window.devicePixelRatio || 1;
    const width = canvas.clientWidth;
    const height = canvas.clientHeight;
    canvas.width = Math.round(width * ratio);
    canvas.height = Math.round(height * ratio);
    const ctx = canvas.getContext("2d");
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    const scale = scales(width, height);
    const ink = css("--ink");
    const muted = css("--muted");
    const rule = css("--rule");

    ctx.font = `400 12px ${css("--sans")}`;
    ctx.lineWidth = 1;
    ctx.strokeStyle = rule;
    ctx.fillStyle = muted;
    ctx.textBaseline = "middle";
    for (const tick of [0, 0.25, 0.5, 0.75, 1]) {
      const x = scale.x(tick);
      const y = scale.y(tick);
      if (x >= MARGIN.left - 1 && x <= width - MARGIN.right + 1) {
        ctx.beginPath(); ctx.moveTo(x, MARGIN.top); ctx.lineTo(x, height - MARGIN.bottom); ctx.stroke();
        ctx.textAlign = "center";
        ctx.fillText(tick, x, height - MARGIN.bottom + 14);
      }
      if (y >= MARGIN.top - 1 && y <= height - MARGIN.bottom + 1) {
        ctx.beginPath(); ctx.moveTo(MARGIN.left, y); ctx.lineTo(width - MARGIN.right, y); ctx.stroke();
        ctx.textAlign = "right";
        ctx.fillText(tick, MARGIN.left - 8, y);
      }
    }

    // What the corners of the shape triangle mean.
    ctx.fillStyle = muted;
    ctx.textAlign = "left";
    ctx.fillText("Rod-like", MARGIN.left, height - 12);
    ctx.textAlign = "right";
    ctx.fillText("Plate-like", width - MARGIN.right, height - 12);
    ctx.fillText("Ball- or cube-like", width - MARGIN.right, 12);
    ctx.textAlign = "center";
    const axisTitle = width < 560 ? "Intermediate / longest" : "Intermediate / longest dimension";
    ctx.fillText(axisTitle, (MARGIN.left + width - MARGIN.right) / 2, height - 12);
    ctx.save();
    ctx.translate(10, (MARGIN.top + height - MARGIN.bottom) / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.fillText("Shortest / longest dimension", 0, 0);
    ctx.restore();

    ctx.save();
    ctx.beginPath();
    ctx.rect(MARGIN.left, MARGIN.top, width - MARGIN.left - MARGIN.right, height - MARGIN.top - MARGIN.bottom);
    ctx.clip();

    for (const index of visible) {
      const object = objects[index];
      ctx.fillStyle = object.t ? css("--chart") : css("--chart-neutral");
      ctx.beginPath();
      ctx.arc(scale.x(object.b), scale.y(object.c), 2.5, 0, Math.PI * 2);
      ctx.fill();
    }
    const thumb = width < 560 ? 32 : 46;
    placeThumbnails(scale, width, height, thumb);
    for (const index of placed) drawThumbnail(ctx, index, scale.x(objects[index].b), scale.y(objects[index].c), thumb);

    const focus = hovered >= 0 ? hovered : selected;
    if (visible.includes(focus)) {
      const x = scale.x(objects[focus].b);
      const y = scale.y(objects[focus].c);
      const size = width < 560 ? 72 : 100;
      ctx.fillStyle = css("--paper");
      ctx.strokeStyle = ink;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(x, y, size / 2 + 2, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      drawThumbnail(ctx, focus, x, y, size * 0.92);
    }
    ctx.restore();
    map.classList.toggle("zoomed", zoom.k > 1);
  }

  const requestDraw = () => { frame ??= requestAnimationFrame(drawMap); };

  function nearest(event, reach) {
    const box = canvas.getBoundingClientRect();
    const scale = scales(box.width, box.height);
    const px = event.clientX - box.left;
    const py = event.clientY - box.top;
    let best = -1;
    let bestDistance = reach * reach;
    for (const index of visible) {
      const distance = (scale.x(objects[index].b) - px) ** 2 + (scale.y(objects[index].c) - py) ** 2;
      if (distance < bestDistance) { bestDistance = distance; best = index; }
    }
    return best;
  }

  function setZoom(k, x = zoom.x, y = zoom.y) {
    zoom.k = Math.max(1, Math.min(8, k));
    const half = 0.5 / (zoom.k * INSET);
    zoom.x = half >= 0.5 ? 0.5 : Math.max(half, Math.min(1 - half, x));
    zoom.y = half >= 0.5 ? 0.5 : Math.max(half, Math.min(1 - half, y));
    drawMap();
  }

  let drag = null;
  canvas.addEventListener("pointerdown", (event) => {
    const box = canvas.getBoundingClientRect();
    const scale = scales(box.width, box.height);
    drag = { x: event.clientX, y: event.clientY, zx: zoom.x, zy: zoom.y, w: scale.plotWidth, h: scale.plotHeight, moved: false };
    canvas.setPointerCapture(event.pointerId);
  });
  canvas.addEventListener("pointermove", (event) => {
    if (drag && zoom.k > 1) {
      const dx = event.clientX - drag.x;
      const dy = event.clientY - drag.y;
      if (Math.abs(dx) + Math.abs(dy) > 3) drag.moved = true;
      if (drag.moved) { setZoom(zoom.k, drag.zx - dx / (drag.w * zoom.k * INSET), drag.zy + dy / (drag.h * zoom.k * INSET)); return; }
    }
    if (drag) return;
    const index = nearest(event, 34);
    if (index !== hovered) {
      hovered = index;
      canvas.style.cursor = index >= 0 ? "pointer" : zoom.k > 1 ? "grab" : "default";
      if (index >= 0) inspect(index);
      requestDraw();
    }
  });
  canvas.addEventListener("pointerup", (event) => {
    if (drag && !drag.moved) {
      const index = nearest(event, 34);
      if (index >= 0) { hovered = -1; inspect(index); drawMap(); }
    }
    drag = null;
  });
  canvas.addEventListener("pointerleave", () => { hovered = -1; requestDraw(); });
  // A trackpad pinch arrives as a wheel event with ctrlKey. Plain scrolling is left to the page.
  canvas.addEventListener("wheel", (event) => {
    if (!event.ctrlKey) return;
    event.preventDefault();
    setZoom(zoom.k * Math.exp(-event.deltaY * 0.01));
  }, { passive: false });
  map.querySelector("[data-zoom=in]").addEventListener("click", () => setZoom(zoom.k * 1.6));
  map.querySelector("[data-zoom=out]").addEventListener("click", () => setZoom(zoom.k / 1.6));

  /* Wall */

  function buildWall() {
    objects.forEach((object, index) => {
      const tile = document.createElement("button");
      tile.type = "button";
      tile.className = "tile";
      tile.dataset.index = index;
      tile.setAttribute("aria-label", object.n);
      tile.title = object.n;
      sprite(tile, index);
      wall.append(tile);
    });
    wall.addEventListener("pointerover", (event) => {
      if (event.target.dataset.index) inspect(Number(event.target.dataset.index));
    });
    wall.addEventListener("focusin", (event) => {
      if (event.target.dataset.index) inspect(Number(event.target.dataset.index));
    });
    wall.addEventListener("click", (event) => {
      if (event.target.dataset.index) inspect(Number(event.target.dataset.index));
    });
  }

  /* Inspector */

  let view = 0;
  let turning = null;
  let stripIndex = -1;
  const out = Object.fromEntries([...inspector.querySelectorAll("[data-out]")].map((el) => [el.dataset.out, el]));

  function showView() {
    turntable.style.backgroundPosition = `${(view / (VIEWS - 1)) * 100}% 0`;
  }

  function loadStrip(index) {
    stripIndex = index;
    const image = new Image();
    image.onload = () => {
      if (stripIndex !== index) return;
      turntable.classList.remove("placeholder");
      turntable.style.backgroundImage = `url(${image.src})`;
      turntable.style.backgroundSize = `${VIEWS * 100}% 100%`;
      showView();
    };
    image.src = `static/catalog/strip/${index}.webp`;
  }

  function neighbourButton(index) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "neighbour";
    const thumb = document.createElement("span");
    thumb.className = "atlas-sprite";
    sprite(thumb, index);
    const name = document.createElement("span");
    name.textContent = objects[index].n;
    button.append(thumb, name);
    button.addEventListener("click", () => inspect(index));
    return button;
  }

  function inspect(index) {
    if (index === selected && stripIndex === index) return;
    selected = index;
    const object = objects[index];
    out.name.textContent = object.n;
    out.source.textContent = SOURCES[object.r];
    out.split.textContent = object.t ? "Test-512, held out" : "Train-512";
    out.size.textContent = `${object.d[0]} × ${object.d[1]} × ${object.d[2]} cm`;
    turntable.setAttribute("aria-label", `Render of ${object.n}. Drag to turn.`);

    // The atlas thumbnail shows at once; the turntable replaces it when it arrives.
    view = 0;
    turntable.classList.add("placeholder");
    turntable.style.backgroundImage = "";
    turntable.style.backgroundSize = "";
    sprite(turntable, index);
    loadStrip(index);

    out.neighbour.replaceChildren();
    inspector.querySelector(".row-neighbour").hidden = object.k === undefined;
    if (object.k !== undefined) out.neighbour.append(neighbourButton(object.k));

    out.clips.replaceChildren();
    inspector.querySelector(".row-clips").hidden = !object.v;
    for (const [number, [trial, held]] of (object.v ?? []).entries()) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "clip-link";
      button.textContent = `Throw ${number + 1}: ${held ? "held 2.0 s" : "no hold"}`;
      button.addEventListener("click", () => window.egocatchOpenTrial?.(trial, held));
      out.clips.append(button);
    }
    for (const tile of wall.querySelectorAll(".tile.current")) tile.classList.remove("current");
    wall.querySelector(`[data-index="${index}"]`)?.classList.add("current");
  }

  function spin() {
    if (turning || window.egocatchPaused || reduceMotion || turntable.classList.contains("placeholder")) return;
    view = (view + 1) % VIEWS;
    showView();
  }

  turntable.addEventListener("pointerdown", (event) => {
    turntable.setPointerCapture(event.pointerId);
    turning = { x: event.clientX, view };
  });
  turntable.addEventListener("pointermove", (event) => {
    if (!turning) return;
    const steps = Math.round((turning.x - event.clientX) / 14);
    view = (((turning.view + steps) % VIEWS) + VIEWS) % VIEWS;
    showView();
  });
  const stopTurning = () => { turning = null; };
  turntable.addEventListener("pointerup", stopTurning);
  turntable.addEventListener("pointercancel", stopTurning);

  /* Controls */

  const splitButtons = root.querySelectorAll("button[data-split]");
  for (const button of splitButtons) {
    button.addEventListener("click", () => {
      filter.split = button.dataset.split;
      for (const other of splitButtons) other.setAttribute("aria-checked", String(other === button));
      applyFilter();
    });
  }

  // The repository menu is a listbox: arrows move, Enter or Space chooses, Escape or a click outside closes.
  function openMenu(open) {
    menuButton.setAttribute("aria-expanded", String(open));
    menuList.hidden = !open;
    if (open) options.find((option) => option.getAttribute("aria-selected") === "true").focus();
  }

  function chooseSource(option) {
    filter.source = option.dataset.value;
    for (const other of options) other.setAttribute("aria-selected", String(other === option));
    menuButton.firstElementChild.textContent = option.firstElementChild.textContent;
    openMenu(false);
    menuButton.focus();
    applyFilter();
  }

  menuButton.addEventListener("click", () => openMenu(menuList.hidden));
  menuButton.addEventListener("keydown", (event) => {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      openMenu(true);
    }
  });
  menuList.addEventListener("click", (event) => {
    const option = event.target.closest("[role=option]");
    if (option) chooseSource(option);
  });
  menuList.addEventListener("keydown", (event) => {
    const index = options.indexOf(document.activeElement);
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      options[(index + (event.key === "ArrowDown" ? 1 : options.length - 1)) % options.length].focus();
    } else if ((event.key === "Enter" || event.key === " ") && index >= 0) {
      event.preventDefault();
      chooseSource(options[index]);
    } else if (event.key === "Escape") {
      openMenu(false);
      menuButton.focus();
    } else if (event.key === "Tab") {
      openMenu(false);
    }
  });
  document.addEventListener("pointerdown", (event) => {
    if (!menuList.hidden && !menu.contains(event.target)) openMenu(false);
  });

  search.addEventListener("input", () => {
    filter.text = search.value.trim().toLowerCase();
    clearSearch.hidden = !search.value;
    applyFilter();
  });
  clearSearch.addEventListener("click", () => {
    search.value = "";
    search.dispatchEvent(new Event("input"));
    search.focus();
  });

  const viewButtons = root.querySelectorAll("button[data-view]");
  for (const button of viewButtons) {
    button.addEventListener("click", () => {
      for (const other of viewButtons) other.setAttribute("aria-checked", String(other === button));
      map.hidden = button.dataset.view !== "map";
      wall.hidden = button.dataset.view !== "wall";
      if (!map.hidden) drawMap();
    });
  }

  new ResizeObserver(requestDraw).observe(canvas);

  /* Everything loads when the catalog is first near the viewport. */

  async function start() {
    objects = await (await fetch("static/catalog/objects.json")).json();
    atlas = new Image();
    atlas.src = "static/catalog/atlas.webp";
    await atlas.decode();
    buildWall();
    selected = -1;
    const first = objects.findIndex((object) => object.n === "mustard bottle");
    inspect(first >= 0 ? first : 0);
    applyFilter();
    setInterval(spin, 160);
  }

  const firstLook = new IntersectionObserver((entries) => {
    if (!entries.some((entry) => entry.isIntersecting)) return;
    firstLook.disconnect();
    start();
  }, { rootMargin: "500px 0px" });
  firstLook.observe(root);
})();
