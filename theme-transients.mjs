// Per-theme transient/ephemeral cell body builders. Extracted from lucida.mjs
// as part of task #70 (per-theme module split). Each builder takes a DOM
// `body` element and populates it with theme-flavored decorative content
// (glyph streams, dials, pipes, panels, etc.) — the visual "filler" cells
// the dashboard shows in gaps. lucida.mjs dispatches via TRANSIENT_BUILDERS.
//
// Public exports: all _buildTransient<Theme> functions named by
// TRANSIENT_BUILDERS in lucida.mjs.

// Local copy of the el() DOM helper from lucida.mjs — pragmatic duplication
// rather than importing back, since this module wants to be standalone.
function el(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}

export function _transientThemeName() {
  const cls = (document.documentElement.className || "").match(/theme-([a-z]+)/);
  return cls ? cls[1] : "conclave";
}

function _transientGlyphPalette(theme) {
  // Mostly hex/ascii — themes that want richer content build their own
  // body. Fallback path for the unthemed cell uses this. Theme accents
  // match the live tokens.json palettes (conclave is NERV amber, not
  // seafoam) so the storm reads as theme-coherent.
  const HEX = "0123456789ABCDEF";
  const ASCII = "▓▒░│┤├┐└┘─┬┴┼╳▢▣◇◆▪▫•·";
  switch (theme) {
    case "conclave": return { chars: HEX + ":xX", color: "#ff8c00" };
    case "lab":     return { chars: HEX + ".·-", color: "#76d2c8" };
    case "gastown": return { chars: HEX + "PSI", color: "#c4a772" };
    default: return { chars: HEX + ASCII, color: "currentColor" };
  }
}

function _transientGlyphStream(rows, cols, palette) {
  // Build a simple monospace block of randomized characters. CSS
  // animation (transient-glyph-flicker) cycles each character via
  // mask + content rotation; here we just ship the initial block.
  const lines = [];
  for (let r = 0; r < rows; r++) {
    let line = "";
    for (let c = 0; c < cols; c++) {
      line += palette.chars[(Math.random() * palette.chars.length) | 0];
    }
    lines.push(line);
  }
  return lines.join("\n");
}

// Conclave label pools — picked per spawn so consecutive hex variants
// look different ("MAGI nodes" vs "system regs" vs "firmware addrs").
const _CONCLAVE_LABEL_POOLS = [
  ["MEL", "BAL", "CSP", "ADR", "REG", "IRQ", "PIO", "BUS"],
  ["R00", "R01", "R02", "R03", "R04", "R05", "R06", "R07"],
  ["EAX", "EBX", "ECX", "EDX", "ESI", "EDI", "ESP", "EBP"],
  ["MEL", "BAL", "CSP", "DEC", "VOTE", "QUO", "AUX", "OBS"],
  ["NERV", "MAGI", "AT.F", "EVA", "ACT", "MGT", "AUX", "DUM"],
];

export function _buildTransientConclaveHex(body) {
  // Picks one of the label pools and randomizes digit width (4 or 8)
  // so hex spawns don't all look like the same readout.
  const wrap = el("div", "transient-conclave");
  const labels = _CONCLAVE_LABEL_POOLS[Math.floor(Math.random() * _CONCLAVE_LABEL_POOLS.length)];
  const digits = Math.random() < 0.6 ? 8 : 4;
  const max = digits === 8 ? 0xFFFFFFFF : 0xFFFF;
  const pad = digits;
  for (let i = 0; i < labels.length; i++) {
    const row = el("div", "transient-conclave-row");
    const reg = el("span", "transient-conclave-reg", labels[i]);
    const sep = el("span", "transient-conclave-sep", ":");
    const val = el("span", "transient-conclave-val");
    val.textContent = "0x" + Math.floor(Math.random() * max).toString(16).toUpperCase().padStart(pad, "0");
    row.appendChild(reg); row.appendChild(sep); row.appendChild(val);
    wrap.appendChild(row);
  }
  body.appendChild(wrap);
  const ivl = setInterval(() => {
    if (!body.isConnected) { clearInterval(ivl); return; }
    for (const v of wrap.querySelectorAll(".transient-conclave-val")) {
      v.textContent = "0x" + Math.floor(Math.random() * max).toString(16).toUpperCase().padStart(pad, "0");
    }
  }, 90);
}

export function _buildTransientConclaveTranscript(body) {
  // NERV ops transcript — scrolling lines of timestamp + status code +
  // node tag. Lines push up at ~600ms cadence. Reads as MAGI system log.
  const wrap = el("div", "transient-conclave-transcript");
  const codes = ["SYNC.OK", "AUTH.OK", "GATE.HOLD", "PATTERN.BLUE", "PATTERN.ORANGE",
                 "MEL.AGREE", "BAL.DISSENT", "CSP.QUERY", "RECON.ACK", "DECISION.PENDING"];
  const nodes = ["MELCHIOR", "BALTHASAR", "CASPAR", "MAGI"];
  function rowText() {
    const t = String(Math.floor(Math.random() * 24)).padStart(2, "0") + ":" +
              String(Math.floor(Math.random() * 60)).padStart(2, "0") + ":" +
              String(Math.floor(Math.random() * 60)).padStart(2, "0");
    return t + "  " + codes[Math.floor(Math.random() * codes.length)] +
           "  " + nodes[Math.floor(Math.random() * nodes.length)];
  }
  for (let i = 0; i < 7; i++) {
    const row = el("div", "transient-conclave-tx-row", rowText());
    wrap.appendChild(row);
  }
  body.appendChild(wrap);
  const ivl = setInterval(() => {
    if (!body.isConnected) { clearInterval(ivl); return; }
    // Pop oldest, push newest at the bottom (visually scrolls up).
    const rows = wrap.querySelectorAll(".transient-conclave-tx-row");
    if (rows.length) rows[0].remove();
    const row = el("div", "transient-conclave-tx-row transient-conclave-tx-new", rowText());
    wrap.appendChild(row);
  }, 520);
}

export function _buildTransientConclave(body) {
  // Pick variant per spawn so consecutive transients aren't identical.
  if (Math.random() < 0.55) _buildTransientConclaveHex(body);
  else                       _buildTransientConclaveTranscript(body);
}

export function _buildTransientGastownDials(body) {
  // Boiler dial cluster — 3 gauges side-by-side, each with rim, ticks,
  // needle, and a numeric label. Needles twitch independently every
  // 240-320ms. Steampunk vibe without the pipe column.
  const ns = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(ns, "svg");
  svg.setAttribute("viewBox", "0 0 100 60");
  svg.setAttribute("preserveAspectRatio", "xMidYMid meet");
  svg.classList.add("transient-gastown");
  const dials = [];
  const labels = ["BOILER", "STEAM", "FEED"];
  for (let i = 0; i < 3; i++) {
    const x = 17 + i * 33;
    const g = document.createElementNS(ns, "g");
    g.setAttribute("transform", `translate(${x},${24})`);
    // Rim
    const rim = document.createElementNS(ns, "circle");
    rim.setAttribute("r", "13"); rim.setAttribute("class", "transient-gastown-rim");
    g.appendChild(rim);
    // Ticks
    for (let k = 0; k < 7; k++) {
      const a = (-130 + k * 43) * Math.PI / 180;
      const tick = document.createElementNS(ns, "line");
      tick.setAttribute("x1", (Math.cos(a) * 11.5).toFixed(2));
      tick.setAttribute("y1", (Math.sin(a) * 11.5).toFixed(2));
      tick.setAttribute("x2", (Math.cos(a) * 9.5).toFixed(2));
      tick.setAttribute("y2", (Math.sin(a) * 9.5).toFixed(2));
      tick.setAttribute("class", "transient-gastown-tick");
      g.appendChild(tick);
    }
    // Needle
    const needle = document.createElementNS(ns, "line");
    needle.setAttribute("x1", "0"); needle.setAttribute("y1", "0");
    needle.setAttribute("x2", "0"); needle.setAttribute("y2", "-10");
    needle.setAttribute("class", "transient-gastown-needle");
    g.appendChild(needle);
    // Label
    const lbl = document.createElementNS(ns, "text");
    lbl.setAttribute("x", "0"); lbl.setAttribute("y", "22");
    lbl.setAttribute("text-anchor", "middle");
    lbl.setAttribute("class", "transient-gastown-psi-label");
    lbl.textContent = labels[i];
    g.appendChild(lbl);
    // Numeric value
    const val = document.createElementNS(ns, "text");
    val.setAttribute("x", "0"); val.setAttribute("y", "30");
    val.setAttribute("text-anchor", "middle");
    val.setAttribute("class", "transient-gastown-psi-val");
    val.textContent = "—";
    g.appendChild(val);
    svg.appendChild(g);
    dials.push({ needle, val, period: 220 + i * 60 });
  }
  body.appendChild(svg);
  // Each dial has its own twitch period.
  const timers = dials.map(d => setInterval(() => {
    if (!body.isConnected) { timers.forEach(clearInterval); return; }
    const ang = -65 + Math.random() * 130;
    d.needle.setAttribute("transform", "rotate(" + ang.toFixed(1) + ")");
    d.val.textContent = String(Math.round(40 + ((ang + 65) / 130) * 160));
  }, d.period));
}

export function _buildTransientGastownPipes(body) {
  // Steampunk schematic. Three brass pipes with rising bubbles, steam
  // puffs vented from the tops, a pressure gauge with twitching
  // needle, and a flickering PSI readout. SVG-native so the line
  // work matches the gastown brass register.
  const ns = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(ns, "svg");
  svg.setAttribute("viewBox", "0 0 100 100");
  svg.setAttribute("preserveAspectRatio", "xMidYMid meet");
  svg.classList.add("transient-gastown");

  // Pipes — slightly thicker outer + thin inner highlight for brass
  // shine; cap fittings (small horizontal collars) at top + bottom.
  const pipes = [22, 50, 78];
  for (const x of pipes) {
    const pipe = document.createElementNS(ns, "line");
    pipe.setAttribute("x1", x); pipe.setAttribute("x2", x);
    pipe.setAttribute("y1", "20"); pipe.setAttribute("y2", "92");
    pipe.setAttribute("class", "transient-gastown-pipe");
    svg.appendChild(pipe);
    const shine = document.createElementNS(ns, "line");
    shine.setAttribute("x1", x - 1); shine.setAttribute("x2", x - 1);
    shine.setAttribute("y1", "20"); shine.setAttribute("y2", "92");
    shine.setAttribute("class", "transient-gastown-pipe-shine");
    svg.appendChild(shine);
    // Cap fittings at top + bottom of each pipe.
    for (const y of [20, 92]) {
      const cap = document.createElementNS(ns, "rect");
      cap.setAttribute("x", x - 4); cap.setAttribute("y", y - 1.5);
      cap.setAttribute("width", "8"); cap.setAttribute("height", "3");
      cap.setAttribute("class", "transient-gastown-cap");
      svg.appendChild(cap);
    }
    // Rising bubbles inside the pipe — bigger size variance, varied
    // animation timing so the column reads as a fluid not a metronome.
    for (let b = 0; b < 5; b++) {
      const bub = document.createElementNS(ns, "circle");
      bub.setAttribute("cx", x);
      bub.setAttribute("cy", 90);
      bub.setAttribute("r", (1.2 + Math.random() * 2.4).toFixed(2));
      bub.setAttribute("class", "transient-gastown-bubble");
      bub.style.animationDelay = (Math.random() * 1.8).toFixed(2) + "s";
      bub.style.animationDuration = (1.0 + Math.random() * 1.6).toFixed(2) + "s";
      svg.appendChild(bub);
    }
    // Steam puff vented from the top of each pipe — single ellipse
    // that grows + fades up. Phased per-pipe.
    const puff = document.createElementNS(ns, "ellipse");
    puff.setAttribute("cx", x); puff.setAttribute("cy", 14);
    puff.setAttribute("rx", "5"); puff.setAttribute("ry", "3");
    puff.setAttribute("class", "transient-gastown-puff");
    puff.style.animationDelay = (pipes.indexOf(x) * 0.6).toFixed(2) + "s";
    svg.appendChild(puff);
  }

  // Pressure gauge in the corner — small dial with twitching needle.
  const gauge = document.createElementNS(ns, "g");
  gauge.setAttribute("transform", "translate(85, 18)");
  const rim = document.createElementNS(ns, "circle");
  rim.setAttribute("r", "10"); rim.setAttribute("class", "transient-gastown-rim");
  gauge.appendChild(rim);
  // Tick marks on the rim.
  for (let i = 0; i < 5; i++) {
    const a = (-110 + i * 55) * Math.PI / 180;
    const tick = document.createElementNS(ns, "line");
    tick.setAttribute("x1", (Math.cos(a) * 8.5).toFixed(2));
    tick.setAttribute("y1", (Math.sin(a) * 8.5).toFixed(2));
    tick.setAttribute("x2", (Math.cos(a) * 7).toFixed(2));
    tick.setAttribute("y2", (Math.sin(a) * 7).toFixed(2));
    tick.setAttribute("class", "transient-gastown-tick");
    gauge.appendChild(tick);
  }
  const needle = document.createElementNS(ns, "line");
  needle.setAttribute("x1", "0"); needle.setAttribute("y1", "0");
  needle.setAttribute("x2", "0"); needle.setAttribute("y2", "-8");
  needle.setAttribute("class", "transient-gastown-needle");
  gauge.appendChild(needle);
  svg.appendChild(gauge);

  // PSI readout below the gauge.
  const psiLabel = document.createElementNS(ns, "text");
  psiLabel.setAttribute("x", "85"); psiLabel.setAttribute("y", "36");
  psiLabel.setAttribute("text-anchor", "middle");
  psiLabel.setAttribute("class", "transient-gastown-psi-label");
  psiLabel.textContent = "PSI";
  svg.appendChild(psiLabel);
  const psiVal = document.createElementNS(ns, "text");
  psiVal.setAttribute("x", "85"); psiVal.setAttribute("y", "44");
  psiVal.setAttribute("text-anchor", "middle");
  psiVal.setAttribute("class", "transient-gastown-psi-val");
  psiVal.textContent = "117";
  svg.appendChild(psiVal);

  body.appendChild(svg);

  // Twitch the needle + PSI readout on a timer. Randomized targets
  // read more "live" than @keyframes with fixed angles.
  const ivl = setInterval(() => {
    if (!body.isConnected) { clearInterval(ivl); return; }
    const ang = -45 + Math.random() * 90;
    needle.setAttribute("transform", "rotate(" + ang.toFixed(1) + ")");
    // Map needle angle to PSI 60-180 range for a coherent readout.
    const psi = Math.round(60 + ((ang + 45) / 90) * 120);
    psiVal.textContent = String(psi);
  }, 220);
}

export function _buildTransientGastown(body) {
  // 5 variants — 3 pipe-styles (3-col / 2-col + big gauge / 4-col thin),
  // 2 dial-clusters (3-cluster / 2-cluster). Subtle differences keep
  // each spawn looking distinct.
  const v = Math.floor(Math.random() * 5);
  if (v < 3) _buildTransientGastownPipes(body);
  else       _buildTransientGastownDials(body);
}

export function _buildTransientLab(body) {
  // Medical monitor: ECG paper grid, scrolling traces, BPM/SPO2 readout.
  // 5 subtle variants per spawn:
  //  - showSPO2: 70% chance — sometimes just ECG fullscreen
  //  - bpmRange: resting (62-68) / normal (70-78) / elevated (88-105) / stress (130-150)
  //  - beatPeriod: 50-72 SVG units (faster heart = faster spike spacing)
  //  - readoutVariant: BPM+SPO2 / BPM only / BPM+SPO2+RESP
  // Subtle differences keep each spawn looking like a different patient.
  const showSPO2 = Math.random() < 0.7;
  const bpmRanges = [[62, 68], [70, 78], [88, 105], [130, 150]];
  const bpmRange = bpmRanges[Math.floor(Math.random() * bpmRanges.length)];
  const beatPeriod = 50 + Math.floor(Math.random() * 22);
  const ecgY = showSPO2 ? 18 : 30;
  const ns = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(ns, "svg");
  svg.setAttribute("viewBox", "0 0 200 60");
  svg.setAttribute("preserveAspectRatio", "none");
  svg.classList.add("transient-lab");

  // Paper grid background — fine 5px gridlines + thicker 25px lines,
  // very faint, so the trace reads as drawn on graph paper.
  const grid = document.createElementNS(ns, "g");
  grid.setAttribute("class", "transient-lab-grid");
  for (let gx = 0; gx <= 200; gx += 5) {
    const v = document.createElementNS(ns, "line");
    v.setAttribute("x1", gx); v.setAttribute("x2", gx);
    v.setAttribute("y1", "0"); v.setAttribute("y2", "60");
    v.setAttribute("class", gx % 25 === 0 ? "transient-lab-grid-major" : "transient-lab-grid-minor");
    grid.appendChild(v);
  }
  for (let gy = 0; gy <= 60; gy += 5) {
    const h = document.createElementNS(ns, "line");
    h.setAttribute("x1", "0"); h.setAttribute("x2", "200");
    h.setAttribute("y1", gy); h.setAttribute("y2", gy);
    h.setAttribute("class", gy % 25 === 0 ? "transient-lab-grid-major" : "transient-lab-grid-minor");
    grid.appendChild(h);
  }
  svg.appendChild(grid);

  // ECG trace — green, periodic QRS spike. Y baseline depends on
  // whether SPO2 is also showing (split layout) or not (full-cell).
  const ecg = document.createElementNS(ns, "path");
  ecg.setAttribute("class", "transient-lab-trace transient-lab-ecg");
  svg.appendChild(ecg);
  // SPO2 trace (only when showSPO2). Optional second trace.
  const spo = showSPO2 ? document.createElementNS(ns, "path") : null;
  if (spo) {
    spo.setAttribute("class", "transient-lab-trace transient-lab-spo");
    svg.appendChild(spo);
  }

  // Readout panel in the upper-right.
  const bpmLabel = document.createElementNS(ns, "text");
  bpmLabel.setAttribute("x", "175"); bpmLabel.setAttribute("y", "9");
  bpmLabel.setAttribute("text-anchor", "end");
  bpmLabel.setAttribute("class", "transient-lab-readout-label");
  bpmLabel.textContent = "BPM";
  svg.appendChild(bpmLabel);
  const bpmVal = document.createElementNS(ns, "text");
  bpmVal.setAttribute("x", "198"); bpmVal.setAttribute("y", "9");
  bpmVal.setAttribute("text-anchor", "end");
  bpmVal.setAttribute("class", "transient-lab-readout-bpm");
  bpmVal.textContent = "72";
  svg.appendChild(bpmVal);
  // SPO2 readout only renders when the trace is shown.
  let spoVal = null;
  if (showSPO2) {
    const spoLabel = document.createElementNS(ns, "text");
    spoLabel.setAttribute("x", "175"); spoLabel.setAttribute("y", "57");
    spoLabel.setAttribute("text-anchor", "end");
    spoLabel.setAttribute("class", "transient-lab-readout-label");
    spoLabel.textContent = "SPO2";
    svg.appendChild(spoLabel);
    spoVal = document.createElementNS(ns, "text");
    spoVal.setAttribute("x", "198"); spoVal.setAttribute("y", "57");
    spoVal.setAttribute("text-anchor", "end");
    spoVal.setAttribute("class", "transient-lab-readout-spo");
    spoVal.textContent = "98";
    svg.appendChild(spoVal);
  }

  body.appendChild(svg);

  // Tear-down: timer self-terminates once SVG leaves the DOM.
  let started = false;
  let phase = 0;
  function step() {
    if (started && !svg.isConnected) return;
    if (svg.isConnected) started = true;
    phase++;
    // ECG: noisy baseline at ecgY, PQRST spike every beatPeriod SVG
    // units. Faster heart rate (smaller beatPeriod) → tighter spike spacing.
    const ecgPts = ["M 0 " + ecgY];
    for (let x = 4; x < 200; x += 4) {
      const noise = (Math.random() - 0.5) * 1.6;
      const beat = (x + phase * 4) % beatPeriod;
      let spike = 0;
      if (beat < 2) spike = 1;
      else if (beat < 4) spike = -1.5;
      else if (beat < 7) spike = -10;
      else if (beat < 10) spike = 4;
      else if (beat < 14) spike = 2;
      ecgPts.push("L " + x + " " + (ecgY + noise + spike).toFixed(1));
    }
    ecg.setAttribute("d", ecgPts.join(" "));

    if (spo) {
      // SPO2: smooth pleth-ish sine + small notch on every cycle.
      const spoPts = ["M 0 44"];
      for (let x = 4; x < 200; x += 4) {
        const t = (x + phase * 2) / 18;
        const wave = -Math.sin(t) * 5 - Math.max(0, Math.sin(t - 0.5)) * 3;
        const noise = (Math.random() - 0.5) * 0.6;
        spoPts.push("L " + x + " " + (44 + wave + noise).toFixed(1));
      }
      spo.setAttribute("d", spoPts.join(" "));
    }

    // BPM/SPO2 readouts flicker within their respective ranges.
    if (phase % 6 === 0) {
      bpmVal.textContent = String(bpmRange[0] + Math.floor(Math.random() * (bpmRange[1] - bpmRange[0])));
      if (spoVal) spoVal.textContent = String(96 + Math.floor(Math.random() * 4));
    }

    setTimeout(step, 140);
  }
  step();
}

export function _buildTransientVigil(body) {
  // Jarvis-style static schematic — concentric rings, dotted crosshair,
  // measurement dots at intersections, slow-cycling corner readouts.
  // Replaces the prior rotating-sweep radar (user 2026-05-23: "the
  // radar sweep is cringey") — rotating wedges read as generic-sci-fi-
  // computer trope rather than the Iron Man HUD aesthetic the theme
  // is supposed to evoke (refs/vigil/00_00_01_wireframe_mask_blueprint
  // .png shows the actual motif: static schematic + measurement dots
  // + numeric readouts).
  //
  // 4 subtle variants per spawn keep the ambient row from looking
  // mechanical-identical:
  //  - ringCount: 3 / 4 / 5 (sparse / standard / dense)
  //  - readoutSet: hex-ids / phase-codes / coord-pairs
  //  - amber tint: 30% chance
  //  - dot-pulse phase: random per-cell so cells don't pulse in lockstep
  const ns = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(ns, "svg");
  svg.setAttribute("viewBox", "0 0 100 100");
  svg.setAttribute("preserveAspectRatio", "xMidYMid meet");
  svg.classList.add("transient-vigil");
  if (Math.random() < 0.3) svg.classList.add("transient-vigil-amber");
  const ringSet = [[18, 32, 46], [15, 26, 37, 47], [12, 22, 31, 40, 47]];
  const rings = ringSet[Math.floor(Math.random() * ringSet.length)];
  for (const r of rings) {
    const ring = document.createElementNS(ns, "circle");
    ring.setAttribute("cx", "50"); ring.setAttribute("cy", "50");
    ring.setAttribute("r", r);
    ring.setAttribute("class", "transient-vigil-ring");
    svg.appendChild(ring);
  }
  // Dotted crosshair (not solid lines — reads as scaffold, not target).
  const ch1 = document.createElementNS(ns, "line");
  ch1.setAttribute("x1", "50"); ch1.setAttribute("y1", "4");
  ch1.setAttribute("x2", "50"); ch1.setAttribute("y2", "96");
  ch1.setAttribute("class", "transient-vigil-cross");
  svg.appendChild(ch1);
  const ch2 = document.createElementNS(ns, "line");
  ch2.setAttribute("x1", "4"); ch2.setAttribute("y1", "50");
  ch2.setAttribute("x2", "96"); ch2.setAttribute("y2", "50");
  ch2.setAttribute("class", "transient-vigil-cross");
  svg.appendChild(ch2);
  // Measurement dots at each ring's intersection with both axes
  // (4 dots per ring). These are the Iron-Man-blueprint vocabulary —
  // small filled circles marking spec points. CSS animates a slow
  // opacity pulse per-cell with a random phase offset so the cell
  // breathes rather than blinks in lockstep.
  const pulsePhase = (Math.random() * 4).toFixed(2);
  svg.style.setProperty("--vigil-dot-phase", pulsePhase + "s");
  for (const r of rings) {
    for (const [dx, dy] of [[r, 0], [-r, 0], [0, r], [0, -r]]) {
      const dot = document.createElementNS(ns, "circle");
      dot.setAttribute("cx", (50 + dx).toFixed(1));
      dot.setAttribute("cy", (50 + dy).toFixed(1));
      dot.setAttribute("r", "0.9");
      dot.setAttribute("class", "transient-vigil-dot");
      svg.appendChild(dot);
    }
  }
  // Corner readouts — 4 small numeric labels in fixed positions. Cycle
  // values every ~3s so the cell looks live without rotating motion.
  const readoutSets = [
    () => ["0x" + Math.floor(Math.random() * 0xFFFF).toString(16).toUpperCase().padStart(4, "0"),
           "0x" + Math.floor(Math.random() * 0xFFFF).toString(16).toUpperCase().padStart(4, "0"),
           "0x" + Math.floor(Math.random() * 0xFFFF).toString(16).toUpperCase().padStart(4, "0"),
           "0x" + Math.floor(Math.random() * 0xFFFF).toString(16).toUpperCase().padStart(4, "0")],
    () => ["PH " + String(Math.floor(Math.random() * 999)).padStart(3, "0"),
           "SY " + String(Math.floor(Math.random() * 999)).padStart(3, "0"),
           "RX " + String(Math.floor(Math.random() * 999)).padStart(3, "0"),
           "TX " + String(Math.floor(Math.random() * 999)).padStart(3, "0")],
    () => [(Math.random() * 89 + 1).toFixed(1) + "°N",
           (Math.random() * 179 + 1).toFixed(1) + "°E",
           "Δ" + (Math.random() * 9).toFixed(2),
           "σ" + (Math.random() * 9).toFixed(2)],
  ];
  const pickSet = readoutSets[Math.floor(Math.random() * readoutSets.length)];
  const positions = [[6, 9, "start"], [94, 9, "end"], [6, 96, "start"], [94, 96, "end"]];
  const labels = [];
  for (let i = 0; i < 4; i++) {
    const t = document.createElementNS(ns, "text");
    t.setAttribute("x", positions[i][0]);
    t.setAttribute("y", positions[i][1]);
    t.setAttribute("text-anchor", positions[i][2]);
    t.setAttribute("class", "transient-vigil-readout");
    svg.appendChild(t);
    labels.push(t);
  }
  const refresh = () => {
    const vals = pickSet();
    labels.forEach((l, i) => { l.textContent = vals[i]; });
  };
  refresh();
  body.appendChild(svg);
  const ivl = setInterval(() => {
    if (!body.isConnected) { clearInterval(ivl); return; }
    refresh();
  }, 2800 + Math.random() * 1200);
}

// Ops code pools — picked per spawn so consecutive LCARS panels read
// as different system contexts.
const _OPS_CODE_POOLS = [
  ["AUX", "WRP", "NAV", "ENG", "TAC", "SCI", "MED", "OPS"],   // bridge
  ["LCS", "ENG", "DEF", "RDR", "COM", "AUX", "PRP", "DOC"],   // engineering
  ["MED", "SCI", "AST", "BIO", "NAV", "MED", "RES", "MED"],   // sickbay
  ["TAC", "DEF", "WPN", "ALT", "CMD", "PHS", "TPB", "EVA"],   // tactical
];
const _OPS_PILL_HUES = [
  ["#ff9966", "#ffcc88", "#cc99ff"],  // classic (orange/peach/lavender)
  ["#cc99ff", "#ffcc88", "#ff6699"],  // alt (lavender/peach/pink)
  ["#ffaa55", "#ffe9aa", "#cc99ff"],  // warm
];

export function _buildTransientOps(body) {
  // LCARS panel — six pill-shaped status rows. 5 subtle variants:
  //  - codePool: bridge / engineering / sickbay / tactical (different
  //    code sets per spawn)
  //  - pillHue trio: classic / alt / warm (rotating LCARS palette)
  //  - cycle rate 110-160ms
  //  - row count 5 or 6
  const wrap = el("div", "transient-ops");
  const codes = _OPS_CODE_POOLS[Math.floor(Math.random() * _OPS_CODE_POOLS.length)];
  const hues = _OPS_PILL_HUES[Math.floor(Math.random() * _OPS_PILL_HUES.length)];
  const tones = ["NOM", "STD", "ALT", "RDY", "ACT", "BRT"];
  const rowCount = Math.random() < 0.5 ? 5 : 6;
  const cycleMs = 110 + Math.floor(Math.random() * 50);
  wrap.style.setProperty("--ops-pill-hue-1", hues[0]);
  wrap.style.setProperty("--ops-pill-hue-2", hues[1]);
  wrap.style.setProperty("--ops-pill-hue-3", hues[2]);
  for (let i = 0; i < rowCount; i++) {
    const row = el("div", "transient-ops-row");
    const pill = el("span", "transient-ops-pill",
      codes[Math.floor(Math.random() * codes.length)]);
    pill.style.background = hues[i % hues.length];
    row.appendChild(pill);
    const num = el("span", "transient-ops-num");
    num.textContent = String(Math.floor(Math.random() * 9999)).padStart(4, "0");
    row.appendChild(num);
    row.appendChild(el("span", "transient-ops-tone",
      tones[Math.floor(Math.random() * tones.length)]));
    wrap.appendChild(row);
  }
  body.appendChild(wrap);
  const ivl = setInterval(() => {
    if (!body.isConnected) { clearInterval(ivl); return; }
    const rows = wrap.querySelectorAll(".transient-ops-row");
    rows.forEach(row => {
      row.querySelector(".transient-ops-pill").textContent = codes[Math.floor(Math.random() * codes.length)];
      row.querySelector(".transient-ops-num").textContent = String(Math.floor(Math.random() * 9999)).padStart(4, "0");
      row.querySelector(".transient-ops-tone").textContent = tones[Math.floor(Math.random() * tones.length)];
    });
  }, cycleMs);
}

// Noir fragment pools — each spawn picks one. Different pools imply
// different case contexts (operations / espionage / forensics).
const _NOIR_FRAGMENT_POOLS = [
  // operations / surveillance
  [
    "subject : ████████ confirmed",
    "case file : ████ — ████████",
    "redact level : ████",
    "operative : ██████ ██",
    "rendezvous : ██:██ at ████████",
    "asset : ████████ unverified",
    "channel : ████ ████ closed",
    "directive : ████████ standby",
  ],
  // espionage / dispatch
  [
    "courier : ████ ███ in transit",
    "drop site : ████████ — ██:██",
    "key phrase : ████ ████ ████",
    "exfil window : ██ minutes",
    "burn notice : ██████ pending",
    "tail : ████ vehicles",
    "frequency : ███.███ MHz",
    "extraction : ████████",
  ],
  // forensics / case board
  [
    "exhibit ██ : ████████ catalogued",
    "witness ██ : ████████ ██ statement",
    "priors : █ — ████████",
    "lab result : ████████ pending",
    "alibi : ████ at ██:██",
    "motive : ████████ ██████",
    "subpoena : ████████ filed",
    "next of kin : ████ ████████",
  ],
];

export function _buildTransientNoir(body) {
  // 5 subtle variants:
  //  - fragmentPool: operations / espionage / forensics
  //  - rowCount: 5 / 6 / 7 (sparse / standard / dense)
  //  - cycleMs: 320-460 (fast / slow ticker)
  const wrap = el("div", "transient-noir");
  const fragments = _NOIR_FRAGMENT_POOLS[Math.floor(Math.random() * _NOIR_FRAGMENT_POOLS.length)];
  const rowCount = 5 + Math.floor(Math.random() * 3);
  const cycleMs = 320 + Math.floor(Math.random() * 140);
  for (let i = 0; i < rowCount; i++) {
    const row = el("div", "transient-noir-row");
    row.textContent = fragments[Math.floor(Math.random() * fragments.length)];
    wrap.appendChild(row);
  }
  body.appendChild(wrap);
  const ivl = setInterval(() => {
    if (!body.isConnected) { clearInterval(ivl); return; }
    const rows = wrap.querySelectorAll(".transient-noir-row");
    const r = rows[Math.floor(Math.random() * rows.length)];
    r.textContent = fragments[Math.floor(Math.random() * fragments.length)];
    r.classList.remove("transient-noir-typed");
    void r.offsetWidth;
    r.classList.add("transient-noir-typed");
  }, cycleMs);
}

// --- terminus (CRT phosphor terminal) -----------------------------------
const _TERMINUS_LINE_POOLS = [
  // boot-sequence
  [
    "$ initialising kernel ...... ok",
    "$ mounting /dev/sda1 .......... ok",
    "$ loading symbols ............ ok",
    "$ checking memory bank 0x4000 ok",
    "$ probing usb hub ........... ok",
    "$ network ifconfig eth0 ..... ok",
    "$ daemon spawn pid 0x1f .... ok",
    "$ entering runlevel 3 ....... ok",
  ],
  // shell history
  [
    "$ grep -rni 'session' src/",
    "$ git log --oneline -20",
    "$ ps -ef | grep watcher",
    "$ rg --json 'cell-' .",
    "$ cat /tmp/out-1746115632.log",
    "$ python -m pytest tests/ -x",
    "$ jq '.cells | length' cells.json",
    "$ tail -f watcher.log",
  ],
  // process table
  [
    "  pid  cpu  mem  cmd",
    " 4421  0.7  1.4  watcher.py",
    " 5102  2.3  4.1  python orchestrator",
    " 6823  0.1  0.2  classifier",
    " 7044  1.1  3.0  specialist",
    " 8901  0.0  0.5  reflect",
    " 9118  0.3  0.8  hud-server",
    "12244  0.0  0.1  audit",
  ],
];

export function _buildTransientTerminus(body) {
  // CRT phosphor terminal scroll — 5 subtle variants:
  //  - linePool: boot-sequence / shell-history / process-table
  //  - hue: amber / green / cyan
  //  - cycleMs: 380-720
  //  - rowCount: 6 or 7
  const wrap = el("div", "transient-terminus");
  const lines = _TERMINUS_LINE_POOLS[Math.floor(Math.random() * _TERMINUS_LINE_POOLS.length)];
  const hues = ["#ffaa44", "#66ff88", "#88ddff"];
  const hue = hues[Math.floor(Math.random() * hues.length)];
  const cycleMs = 380 + Math.floor(Math.random() * 340);
  const rowCount = 6 + Math.floor(Math.random() * 2);
  wrap.style.setProperty("--terminus-hue", hue);
  for (let i = 0; i < rowCount; i++) {
    const row = el("div", "transient-terminus-row");
    row.textContent = lines[i % lines.length];
    wrap.appendChild(row);
  }
  body.appendChild(wrap);
  // Scroll: pop oldest, push newest line at the bottom.
  const ivl = setInterval(() => {
    if (!body.isConnected) { clearInterval(ivl); return; }
    const rows = wrap.querySelectorAll(".transient-terminus-row");
    if (rows.length) rows[0].remove();
    const row = el("div", "transient-terminus-row transient-terminus-new",
      lines[Math.floor(Math.random() * lines.length)]);
    wrap.appendChild(row);
  }, cycleMs);
}

// --- circuit (PCB traces with travelling pulses) -------------------------
export function _buildTransientCircuit(body) {
  // Animated copper traces — random rectilinear paths with
  // travelling pulse circles. 5 subtle variants:
  //  - traceCount: 3 / 4 / 5
  //  - pulseSpeed: 1.4 / 2.4 / 3.6s
  //  - hue: copper / cyan / lime
  //  - includeJunctions: 50% chance of junction dots
  //  - includeViaGrid: 30% chance of background via dots
  const ns = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(ns, "svg");
  svg.setAttribute("viewBox", "0 0 100 100");
  svg.setAttribute("preserveAspectRatio", "xMidYMid meet");
  svg.classList.add("transient-circuit");
  const hues = ["#c4a772", "#5fd8c8", "#a4ff4a"];
  const hue = hues[Math.floor(Math.random() * hues.length)];
  const pulseDur = [1.4, 2.4, 3.6][Math.floor(Math.random() * 3)];
  svg.style.setProperty("--circuit-hue", hue);
  svg.style.setProperty("--circuit-pulse-dur", pulseDur + "s");
  // Optional via grid background.
  if (Math.random() < 0.3) {
    for (let gx = 10; gx < 100; gx += 12) {
      for (let gy = 10; gy < 100; gy += 12) {
        const via = document.createElementNS(ns, "circle");
        via.setAttribute("cx", gx); via.setAttribute("cy", gy);
        via.setAttribute("r", "0.7");
        via.setAttribute("class", "transient-circuit-via");
        svg.appendChild(via);
      }
    }
  }
  // Random rectilinear traces.
  const traceCount = 3 + Math.floor(Math.random() * 3);
  const includeJunctions = Math.random() < 0.5;
  for (let i = 0; i < traceCount; i++) {
    let x = Math.floor(Math.random() * 90 + 5);
    let y = Math.floor(Math.random() * 90 + 5);
    const segs = ["M " + x + " " + y];
    const segCount = 3 + Math.floor(Math.random() * 4);
    for (let s = 0; s < segCount; s++) {
      if (s % 2 === 0) {
        const dx = (Math.random() - 0.5) * 60;
        x = Math.max(5, Math.min(95, x + dx));
        segs.push("L " + x.toFixed(0) + " " + y.toFixed(0));
      } else {
        const dy = (Math.random() - 0.5) * 60;
        y = Math.max(5, Math.min(95, y + dy));
        segs.push("L " + x.toFixed(0) + " " + y.toFixed(0));
      }
    }
    const path = document.createElementNS(ns, "path");
    path.setAttribute("d", segs.join(" "));
    path.setAttribute("class", "transient-circuit-trace");
    path.style.animationDelay = (Math.random() * pulseDur).toFixed(2) + "s";
    svg.appendChild(path);
    // Pulse: a small circle that follows the path. Browser-supported
    // animateMotion stays in pure SVG, no JS rAF needed.
    const pulse = document.createElementNS(ns, "circle");
    pulse.setAttribute("r", "1.6");
    pulse.setAttribute("class", "transient-circuit-pulse");
    const motion = document.createElementNS(ns, "animateMotion");
    motion.setAttribute("dur", pulseDur + "s");
    motion.setAttribute("repeatCount", "indefinite");
    motion.setAttribute("path", segs.join(" "));
    motion.setAttribute("begin", (Math.random() * pulseDur).toFixed(2) + "s");
    pulse.appendChild(motion);
    svg.appendChild(pulse);
    if (includeJunctions) {
      const junc = document.createElementNS(ns, "circle");
      junc.setAttribute("cx", x); junc.setAttribute("cy", y);
      junc.setAttribute("r", "1.4");
      junc.setAttribute("class", "transient-circuit-junction");
      svg.appendChild(junc);
    }
  }
  body.appendChild(svg);
}

// --- mainframe (punchcards / tickertape) --------------------------------
export function _buildTransientMainframe(body) {
  // 5 subtle variants:
  //  - layout: punchcards (4 cards stacked, hole patterns) / tickertape
  //    (single horizontal scrolling ribbon)
  //  - holeDensity: 30% / 50% / 70%
  //  - tickertape: 2 different tape vocabularies
  const layoutPunch = Math.random() < 0.55;
  if (layoutPunch) {
    const wrap = el("div", "transient-mainframe-cards");
    const density = 0.3 + Math.random() * 0.4;
    const ROWS = 5, COLS = 18;
    for (let c = 0; c < 4; c++) {
      const card = el("div", "transient-mainframe-card");
      for (let r = 0; r < ROWS; r++) {
        const row = el("div", "transient-mainframe-row");
        for (let col = 0; col < COLS; col++) {
          const slot = el("span", "transient-mainframe-slot",
            Math.random() < density ? "█" : " ");
          row.appendChild(slot);
        }
        card.appendChild(row);
      }
      wrap.appendChild(card);
    }
    body.appendChild(wrap);
    const ivl = setInterval(() => {
      if (!body.isConnected) { clearInterval(ivl); return; }
      const slots = wrap.querySelectorAll(".transient-mainframe-slot");
      // Re-roll a small subset (not all) so the cards "drift"
      // rather than thrashing.
      for (let i = 0; i < 8; i++) {
        const s = slots[Math.floor(Math.random() * slots.length)];
        s.textContent = Math.random() < density ? "█" : " ";
      }
    }, 240);
  } else {
    // Tickertape — single horizontal ribbon scrolling.
    const wrap = el("div", "transient-mainframe-tape");
    const tapes = [
      "STOP TRANSMISSION RECEIVED 0421H STOP CARGO MANIFEST UPDATED STOP NEXT DISPATCH 0815H STOP",
      "JOB 4421 BATCH-A COMPILE OK · JOB 4422 BATCH-B QUEUE · JOB 4423 BATCH-C HOLD · JOB 4424 LINK PEND ·",
      "TX BLOCK 0x0421 0x0422 0x0423 0x0424 ACK · CRC OK · SEQ 117 · LATENCY 4ms · NEXT 0x0425 ·",
    ];
    const text = tapes[Math.floor(Math.random() * tapes.length)];
    const inner = el("div", "transient-mainframe-tape-inner");
    inner.textContent = text + "    " + text;
    wrap.appendChild(inner);
    body.appendChild(wrap);
  }
}

// --- renegade (cyberpunk glitch) ----------------------------------------
export function _buildTransientRenegade(body) {
  // Glitch burst — random colored bars with text fragments,
  // periodic scan-line jumps. 5 subtle variants:
  //  - barCount: 4 / 6 / 8
  //  - fragmentPool: dataset / signal / packet / corrupt / system
  //  - hue: magenta / cyan / lime / orange
  const wrap = el("div", "transient-renegade");
  const fragmentPools = [
    ["DATASET", "QUERY", "FETCH", "RANGE", "SHARD"],
    ["SIGNAL", "FREQ", "MOD", "DEMOD", "PHASE"],
    ["PACKET", "ROUTE", "HOP", "MTU", "WINDOW"],
    ["__??__", "ERR_403", "NULL", "CORRUPT", "0xFF"],
    ["SYSTEM", "USER", "ROOT", "DAEMON", "GROUP"],
  ];
  const fragments = fragmentPools[Math.floor(Math.random() * fragmentPools.length)];
  const hues = ["#ff3366", "#33ddee", "#aaff44", "#ff8833"];
  const barCount = [4, 6, 8][Math.floor(Math.random() * 3)];
  for (let i = 0; i < barCount; i++) {
    const bar = el("div", "transient-renegade-bar");
    bar.style.background = hues[Math.floor(Math.random() * hues.length)];
    bar.style.width = (40 + Math.random() * 60) + "%";
    bar.style.marginLeft = (Math.random() * 30) + "%";
    bar.style.height = (4 + Math.random() * 8) + "px";
    bar.style.animationDelay = (Math.random() * 0.6) + "s";
    wrap.appendChild(bar);
    if (Math.random() < 0.5) {
      const txt = el("div", "transient-renegade-text",
        fragments[Math.floor(Math.random() * fragments.length)]);
      txt.style.color = hues[Math.floor(Math.random() * hues.length)];
      wrap.appendChild(txt);
    }
  }
  body.appendChild(wrap);
  const ivl = setInterval(() => {
    if (!body.isConnected) { clearInterval(ivl); return; }
    const bars = wrap.querySelectorAll(".transient-renegade-bar");
    bars.forEach(b => {
      b.style.background = hues[Math.floor(Math.random() * hues.length)];
      b.style.width = (40 + Math.random() * 60) + "%";
      b.style.marginLeft = (Math.random() * 30) + "%";
    });
    const texts = wrap.querySelectorAll(".transient-renegade-text");
    texts.forEach(t => {
      t.textContent = fragments[Math.floor(Math.random() * fragments.length)];
    });
  }, 280);
}

// --- minimal (zen — single quiet element) -------------------------------
export function _buildTransientMinimal(body) {
  // Subtle. 5 variants:
  //  - dotGrid (3x3 / 4x4 with one cell pulsing)
  //  - singleDot pulsing in center
  //  - thinHorizontalLine sweeping across
  //  - twoLines crossing
  //  - smallCircle expanding-and-contracting
  const variant = Math.floor(Math.random() * 5);
  const ns = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(ns, "svg");
  svg.setAttribute("viewBox", "0 0 100 100");
  svg.setAttribute("preserveAspectRatio", "xMidYMid meet");
  svg.classList.add("transient-minimal");
  if (variant === 0 || variant === 1) {
    const grid = variant === 0 ? 3 : 4;
    const step = 100 / (grid + 1);
    for (let i = 1; i <= grid; i++) {
      for (let j = 1; j <= grid; j++) {
        const dot = document.createElementNS(ns, "circle");
        dot.setAttribute("cx", (i * step).toFixed(1));
        dot.setAttribute("cy", (j * step).toFixed(1));
        dot.setAttribute("r", "1.5");
        dot.setAttribute("class", "transient-minimal-dot");
        svg.appendChild(dot);
      }
    }
  } else if (variant === 2) {
    const dot = document.createElementNS(ns, "circle");
    dot.setAttribute("cx", "50"); dot.setAttribute("cy", "50");
    dot.setAttribute("r", "3");
    dot.setAttribute("class", "transient-minimal-pulse-dot");
    svg.appendChild(dot);
  } else if (variant === 3) {
    const line = document.createElementNS(ns, "line");
    line.setAttribute("x1", "10"); line.setAttribute("x2", "90");
    line.setAttribute("y1", "50"); line.setAttribute("y2", "50");
    line.setAttribute("class", "transient-minimal-sweep-line");
    svg.appendChild(line);
  } else {
    const circle = document.createElementNS(ns, "circle");
    circle.setAttribute("cx", "50"); circle.setAttribute("cy", "50");
    circle.setAttribute("r", "20");
    circle.setAttribute("class", "transient-minimal-breath-circle");
    svg.appendChild(circle);
  }
  body.appendChild(svg);
}

export function _buildTransientGeneric(body) {
  // Fallback for themes without a custom build (none currently —
  // every theme has a body), but kept as an emergency fallback.
  const palette = _transientGlyphPalette(_transientThemeName());
  const pre = el("pre", "transient-generic-stream");
  pre.style.color = palette.color;
  pre.textContent = _transientGlyphStream(5, 14, palette);
  body.appendChild(pre);
  const ivl = setInterval(() => {
    if (!body.isConnected) { clearInterval(ivl); return; }
    pre.textContent = _transientGlyphStream(5, 14, palette);
  }, 90);
}

// --- Expanse factions: faction-flavored ambient filler (was generic glyph
// stream). Self-contained inline styling so no CSS-cache bump. Each refreshes
// like a console still ticking over; interval self-clears when the cell is
// removed (body.isConnected goes false). Drift shows by default (pack); mars-blue/
// earth only when switched to pack (their default cockpit/warroom layouts are
// capped, no gaps to fill). -----------------------------------------------
export function _buildTransientDrift(body) {
  // Salvaged OPA terminal — Lang-Belta-register rows, dual amber+cyan, scrappy.
  const wrap = el("div", "transient-drift");
  wrap.style.cssText = "padding:5px 7px;font-family:'Space Mono','Share Tech Mono',monospace;font-size:8px;letter-spacing:0.08em;line-height:1.7;";
  const labels = ["DEF", "LCK", "COM", "PRX", "POS", "SCN", "REL", "DRIFT"];
  const amber = "#e8902a", cyan = "#1aa6b0";
  const mk = () => {
    let html = "";
    for (let i = 0; i < 4; i++) {
      const lab = labels[(Math.random() * labels.length) | 0];
      const col = Math.random() < 0.5 ? amber : cyan;
      const val = ((Math.random() * 4096) | 0).toString(16).toUpperCase().padStart(3, "0");
      html += '<div style="display:flex;justify-content:space-between;color:' + col + '"><span>' + lab + '</span><span>' + val + '</span></div>';
    }
    return html;
  };
  wrap.innerHTML = mk();
  body.appendChild(wrap);
  const ivl = setInterval(() => {
    if (!body.isConnected) { clearInterval(ivl); return; }
    wrap.innerHTML = mk();
  }, 700);
}
export function _buildTransientMarsBlue(body) {
  // MCRN telemetry strip — muted cyan rows with occasional system-color tick
  // (green ok / amber alert), restrained (Mars discipline).
  const wrap = el("div", "transient-mars-blue");
  wrap.style.cssText = "padding:5px 7px;font-family:'D-DIN','Saira',sans-serif;font-size:8.5px;letter-spacing:0.1em;line-height:1.75;";
  const labels = ["THRST", "RCS", "REACTR", "NAV", "EPSTEIN", "TRIM", "ATT", "PDC"];
  const cyan = "#5a96aa", ok = "#3ad14e", warn = "#ffc233";
  const mk = () => {
    let html = "";
    for (let i = 0; i < 4; i++) {
      const lab = labels[(Math.random() * labels.length) | 0];
      const r = Math.random();
      const col = r < 0.12 ? warn : (r < 0.28 ? ok : cyan);
      html += '<div style="display:flex;justify-content:space-between;color:' + col + '"><span>' + lab + '</span><span>' + String((Math.random() * 100) | 0).padStart(3, "0") + '%</span></div>';
    }
    return html;
  };
  wrap.innerHTML = mk();
  body.appendChild(wrap);
  const ivl = setInterval(() => {
    if (!body.isConnected) { clearInterval(ivl); return; }
    wrap.innerHTML = mk();
  }, 800);
}
export function _buildTransientEarth(body) {
  // Institutional readout — flat navy data rows, formal, NO flicker; a SLOW,
  // dignified value tick (EARTH motion is slow/weighty, not frantic).
  const wrap = el("div", "transient-earth");
  wrap.style.cssText = "padding:5px 7px;font-family:'Share Tech Mono','Courier New',monospace;font-size:8px;letter-spacing:0.06em;line-height:1.8;color:#9bb1cc;";
  const labels = ["TRK", "BRG", "RNG", "CPA", "SEC", "GRID", "VRM"];
  const mk = () => {
    let html = '<div style="color:#5a6a86;border-bottom:1px solid rgba(47,111,208,0.22);margin-bottom:2px;padding-bottom:1px">FLEET · STATUS</div>';
    for (let i = 0; i < 5; i++) {
      html += '<div style="display:flex;justify-content:space-between"><span style="color:#5f7390">' + labels[i % labels.length] + '</span><span style="color:#6f9fd0">' + String((Math.random() * 360) | 0).padStart(3, "0") + '</span></div>';
    }
    return html;
  };
  wrap.innerHTML = mk();
  body.appendChild(wrap);
  const ivl = setInterval(() => {
    if (!body.isConnected) { clearInterval(ivl); return; }
    wrap.innerHTML = mk();
  }, 2200);
}

// Transient cell body builders. THEME_REGISTRY[theme].transient names
// the builder; missing entries fall through to the generic builder.
