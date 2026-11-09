// The page's charts, drawn as SVG at the width they are given. Every value also appears in a table under its chart.
// Numbers are the paper's. Marks follow one spec: thin bars with rounded data-ends, 2px lines, ringed dots.
(() => {
  const SVG_NS = "http://www.w3.org/2000/svg";
  const minus = (text) => String(text).replace(/-/g, "−");
  const signed = (value, digits = 1) => minus(`${value >= 0 ? "+" : ""}${value.toFixed(digits)}`);

  function el(tag, attrs, parent, text) {
    const node = document.createElementNS(SVG_NS, tag);
    for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, value);
    if (text !== undefined) node.textContent = text;
    if (parent) parent.append(node);
    return node;
  }

  const tip = document.createElement("div");
  tip.className = "chart-tip";
  tip.hidden = true;
  document.body.append(tip);

  function showTip(html, x, y) {
    tip.innerHTML = html;
    tip.hidden = false;
    const box = tip.getBoundingClientRect();
    tip.style.left = `${Math.max(8, Math.min(window.innerWidth - box.width - 8, x + 14))}px`;
    tip.style.top = `${Math.max(8, y - box.height - 12)}px`;
  }

  // A hover and keyboard target that shows a tooltip and marks its group as active.
  function target(group, hit, html) {
    group.setAttribute("tabindex", "0");
    group.setAttribute("role", "img");
    group.setAttribute("aria-label", html.replace(/<[^>]+>/g, " "));
    const on = (event) => {
      group.classList.add("active");
      const box = hit.getBoundingClientRect();
      showTip(html, event.clientX ?? box.left + box.width / 2, event.clientY ?? box.top);
    };
    const off = () => { group.classList.remove("active"); tip.hidden = true; };
    group.addEventListener("pointerenter", on);
    group.addEventListener("pointermove", on);
    group.addEventListener("pointerleave", off);
    group.addEventListener("focus", on);
    group.addEventListener("blur", off);
  }

  function dataTable(figure, headers, rows) {
    const details = document.createElement("details");
    details.className = "chart-data";
    const summary = document.createElement("summary");
    summary.textContent = "Data";
    const table = document.createElement("table");
    const head = table.createTHead().insertRow();
    for (const header of headers) {
      const cell = document.createElement("th");
      cell.scope = "col";
      cell.textContent = header;
      head.append(cell);
    }
    const body = table.createTBody();
    for (const row of rows) {
      const line = body.insertRow();
      for (const value of row) line.insertCell().textContent = value;
    }
    details.append(summary, table);
    figure.append(details);
  }

  // Sets up a figure and redraws its SVG whenever its width changes.
  function chart(id, draw) {
    const figure = document.getElementById(id);
    const holder = document.createElement("div");
    holder.className = "chart-plot";
    figure.append(holder);
    let width = 0;
    new ResizeObserver(([entry]) => {
      const next = Math.round(entry.contentRect.width);
      if (next === width || next === 0) return;
      width = next;
      holder.replaceChildren();
      draw(holder, width);
    }).observe(holder);
    return figure;
  }

  function roundedBar(x, y, length, height) {
    const radius = Math.min(4, length);
    return `M${x} ${y}h${length - radius}a${radius} ${radius} 0 0 1 ${radius} ${radius}v${height - 2 * radius}a${radius} ${radius} 0 0 1 -${radius} ${radius}h-${length - radius}z`;
  }

  function bars(id, rows, { max, unit = "", digits = 1, columns }) {
    const figure = chart(id, (holder, width) => {
      const stacked = width < 520;
      const labelWidth = stacked ? 0 : Math.min(236, width * 0.42);
      const rowHeight = stacked ? 50 : 38;
      const barHeight = 18;
      const room = 44;  // for the value past the longest bar
      const scale = (width - labelWidth - room) / max;
      const svg = el("svg", { width, height: rows.length * rowHeight, class: "chart-svg" }, holder);
      rows.forEach((row, index) => {
        const y = index * rowHeight + (stacked ? 22 : (rowHeight - barHeight) / 2);
        const group = el("g", { class: "chart-row" }, svg);
        const hit = el("rect", { x: 0, y: index * rowHeight, width, height: rowHeight, class: "chart-hit" }, group);
        el("text", { x: 0, y: stacked ? y - 7 : y + barHeight / 2 + 1, class: "chart-label", "dominant-baseline": "middle" }, group, row.label);
        const length = Math.max(row.value * scale, 0);
        if (length >= 1) el("path", { d: roundedBar(labelWidth, y, length, barHeight), class: row.accent ? "chart-bar accent" : "chart-bar" }, group);
        const end = labelWidth + (row.value + (row.sd || 0)) * scale;
        if (row.sd) {
          el("line", { x1: labelWidth + (row.value - row.sd) * scale, x2: end, y1: y + barHeight / 2, y2: y + barHeight / 2, class: "chart-whisker" }, group);
        }
        const shown = row.sd ? `${row.value.toFixed(digits)} ± ${row.sd.toFixed(digits)}${unit}` : `${row.display ?? row.value.toFixed(digits)}${unit}`;
        el("text", { x: end + 8, y: y + barHeight / 2 + 1, class: "chart-value", "dominant-baseline": "middle" }, group, shown);
        target(group, hit, `<strong>${row.label}</strong>${shown}${row.note ? `<br>${row.note}` : ""}`);
      });
      el("line", { x1: labelWidth, x2: labelWidth, y1: 0, y2: rows.length * rowHeight, class: "chart-axis" }, svg);
    });
    dataTable(figure, columns,
      rows.map((row) => [row.label, row.sd ? `${row.value} ± ${row.sd}` : row.display ?? row.value]));
  }

  function yAxis(svg, ticks, y, left, right) {
    for (const tick of ticks) {
      el("line", { x1: left, x2: right, y1: y(tick), y2: y(tick), class: tick === 0 ? "chart-axis strong" : "chart-grid" }, svg);
      el("text", { x: left - 8, y: y(tick) + 1, class: "chart-tick", "text-anchor": "end", "dominant-baseline": "middle" }, svg, tick > 0 ? `+${tick}` : minus(tick));
    }
  }

  // Axis titles: the y title runs up the left edge, centred on the plot; the x title sits under the ticks.
  function axisTitles(svg, { x, y }, margin, width, height) {
    const middle = (margin.top + height - margin.bottom) / 2;
    el("text", { transform: `translate(11 ${middle}) rotate(-90)`, class: "chart-tick", "text-anchor": "middle", "dominant-baseline": "middle" }, svg, y);
    el("text", { x: (margin.left + width - margin.right) / 2, y: height - 6, class: "chart-tick", "text-anchor": "middle" }, svg, x);
  }

  // Paired substitution effect by object size (Fig. 4a of the paper).
  const SIZE = [
    { bin: "<10", n: 79, effect: -14.56, low: -20.89, high: -8.23 },
    { bin: "10–15", n: 70, effect: -9.29, low: -13.93, high: -4.64 },
    { bin: "15–20", n: 80, effect: 0.62, low: -4.69, high: 5.94 },
    { bin: "20–25", n: 88, effect: 2.84, low: -2.56, high: 8.52 },
    { bin: "25–30", n: 97, effect: 6.44, low: 1.55, high: 11.34 },
    { bin: "≥30", n: 98, effect: 10.71, low: 4.85, high: 16.58 },
  ];
  const sizeFigure = chart("chart-size", (holder, width) => {
    const height = 280;
    const margin = { left: 52, right: 4, top: 8, bottom: 46 };
    const svg = el("svg", { width, height, class: "chart-svg" }, holder);
    const y = (value) => margin.top + ((20 - value) / 45) * (height - margin.top - margin.bottom);
    const band = (width - margin.left - margin.right) / SIZE.length;
    const x = (index) => margin.left + band * (index + 0.5);
    yAxis(svg, [20, 10, 0, -10, -20], y, margin.left, width - margin.right);
    el("text", { x: margin.left + 8, y: y(20) + 14, class: "chart-note" }, svg, "Vision catches more");
    el("text", { x: width - margin.right - 8, y: y(-25) - 8, class: "chart-note", "text-anchor": "end" }, svg, "Exact geometry catches more");
    axisTitles(svg, { x: "Longest side (cm)", y: "Difference (points)" }, margin, width, height);
    el("polyline", { points: SIZE.map((d, i) => `${x(i)},${y(d.effect)}`).join(" "), class: "chart-trend" }, svg);
    SIZE.forEach((d, index) => {
      const group = el("g", { class: "chart-point" }, svg);
      const hit = el("rect", { x: x(index) - band / 2, y: 0, width: band, height, class: "chart-hit" }, group);
      el("line", { x1: x(index), x2: x(index), y1: y(d.low), y2: y(d.high), class: "chart-interval" }, group);
      el("circle", { cx: x(index), cy: y(d.effect), r: 5.5, class: "chart-dot" }, group);
      el("text", { x: x(index), y: height - 28, class: "chart-tick", "text-anchor": "middle" }, group, d.bin);
      if (index === 0 || index === SIZE.length - 1) {
        const above = d.effect > 0;
        el("text", { x: x(index) + (above ? -11 : 11), y: y(d.effect) + (above ? -13 : 15), class: "chart-value", "text-anchor": above ? "end" : "start", "dominant-baseline": "middle" }, group, signed(d.effect));
      }
      target(group, hit, `<strong>${d.bin} cm, ${d.n} objects</strong>Vision ${signed(d.effect)} points against exact geometry<br>95% interval [${signed(d.low)}, ${signed(d.high)}]`);
    });
  });
  dataTable(sizeFigure, ["Longest side (cm)", "Objects", "Vision minus exact geometry (points)", "95% interval"],
    SIZE.map((d) => [d.bin, d.n, signed(d.effect), `[${signed(d.low)}, ${signed(d.high)}]`]));

  // Change in ever-secure under a 160 ms depth freeze (Fig. 5c of the paper).
  const FREEZE = [
    { onset: -300, effect: -20.31, low: -27.34, high: -13.28 },
    { onset: -150, effect: -66.02, low: -73.83, high: -57.81 },
    { onset: 0, effect: -16.41, low: -22.66, high: -10.55 },
    { onset: 150, effect: -1.95, low: -5.86, high: 1.95 },
    { onset: 300, effect: 1.17, low: -3.12, high: 5.47 },
    { onset: 600, effect: 0.39, low: -3.91, high: 4.69 },
  ];
  const onsetText = (ms) => (ms === 0 ? "at first contact" : `${Math.abs(ms)} ms ${ms < 0 ? "before" : "after"} contact`);
  const freezeFigure = chart("chart-freeze", (holder, width) => {
    const height = 280;
    const margin = { left: 52, right: 12, top: 24, bottom: 46 };
    const svg = el("svg", { width, height, class: "chart-svg" }, holder);
    const x = (ms) => margin.left + ((ms + 330) / 960) * (width - margin.left - margin.right);
    const y = (value) => margin.top + ((10 - value) / 90) * (height - margin.top - margin.bottom);
    yAxis(svg, [0, -25, -50, -75], y, margin.left, width - margin.right);
    el("line", { x1: x(0), x2: x(0), y1: margin.top - 8, y2: height - margin.bottom, class: "chart-axis strong" }, svg);
    el("text", { x: x(0) + 7, y: margin.top - 8, class: "chart-note", "dominant-baseline": "middle" }, svg, "Hands reach the object");
    axisTitles(svg, { x: "Freeze starts (ms from contact)", y: "Grasps formed (points)" }, margin, width, height);
    const upper = FREEZE.map((d) => `${x(d.onset)},${y(d.high)}`);
    const lower = FREEZE.map((d) => `${x(d.onset)},${y(d.low)}`).reverse();
    el("polygon", { points: [...upper, ...lower].join(" "), class: "chart-band" }, svg);
    el("polyline", { points: FREEZE.map((d) => `${x(d.onset)},${y(d.effect)}`).join(" "), class: "chart-line" }, svg);
    FREEZE.forEach((d, index) => {
      const previous = index ? x(FREEZE[index - 1].onset) : margin.left;
      const next = index < FREEZE.length - 1 ? x(FREEZE[index + 1].onset) : width - margin.right;
      const from = index ? (previous + x(d.onset)) / 2 : margin.left;
      const to = index < FREEZE.length - 1 ? (next + x(d.onset)) / 2 : width - margin.right;
      const group = el("g", { class: "chart-point" }, svg);
      const hit = el("rect", { x: from, y: 0, width: to - from, height, class: "chart-hit" }, group);
      el("line", { x1: x(d.onset), x2: x(d.onset), y1: margin.top, y2: height - margin.bottom, class: "chart-crosshair" }, group);
      el("circle", { cx: x(d.onset), cy: y(d.effect), r: 5, class: "chart-dot" }, group);
      el("text", { x: x(d.onset), y: height - 28, class: "chart-tick", "text-anchor": "middle" }, group, minus(d.onset));
      if (d.onset === -150) {
        el("text", { x: x(d.onset) + 11, y: y(d.effect) + 1, class: "chart-value", "dominant-baseline": "middle" }, group, signed(d.effect));
      }
      target(group, hit, `<strong>Freeze starts ${onsetText(d.onset)}</strong>${signed(d.effect)} points of grasps formed<br>95% band [${signed(d.low)}, ${signed(d.high)}]`);
    });
  });
  dataTable(freezeFigure, ["Freeze starts (ms from contact)", "Change in grasps formed (points)", "95% band"],
    FREEZE.map((d) => [minus(d.onset), signed(d.effect), `[${signed(d.low)}, ${signed(d.high)}]`]));

  // The 573 failed throws of 2,048 (Fig. 4b of the paper). "At rest" is the paper's secure sample: at least four finger
  // segments on the object, which is within 0.28 m of a wrist, above 0.60 m and moving under 0.20 m/s.
  bars("chart-failures", [
    { label: "Never touched", value: 3, display: "3", note: "No hand contact at all." },
    { label: "Touched by too few fingers", value: 22, display: "22", note: "Fewer than four finger segments ever on the object." },
    { label: "Fingers on it, never at rest", value: 428, display: "428", accent: true,
      note: "Four or more finger segments on it, but it never came to rest in the hands." },
    { label: "At rest, lost before 2 s", value: 119, display: "119",
      note: "Came to rest in the hands, then slipped, dropped or broke a catch rule before the 2.0 s hold." },
    { label: "Pinned against the body", value: 1, display: "1", note: "Trapped against the torso, which does not count as a catch." },
  ], { max: 428, columns: ["How it failed", "Failed throws"] });

})();
