#!/usr/bin/env node
'use strict';

const fs   = require('fs');
const path = require('path');

// ── Config ────────────────────────────────────────────────────────────────────
const COLS        = 201;
const ROWS        = 100;
const CELL        = 3;
const WIDTH       = COLS * CELL;   // 603
const HEIGHT      = ROWS * CELL;   // 300
const ROW_DELAY   = 0.03;
const PAUSE       = 2.0;
const BG          = '#ffffff';
const FG          = '#000000';
const LIBRARY_CAP = 50;
const SHOWN_CAP   = 25;  // avoid repeating last N shown

const BEGIN_MARKER = '<!-- BEGIN CELLULAR AUTOMATON -->';
const END_MARKER   = '<!-- END CELLULAR AUTOMATON -->';

const INTERESTING_RULES = [
   18,  22,  26,  30,  41,  45,  54,  57,  60,  62,
   73,  75,  82,  86,  89,  90,  97,  99, 101, 102,
  105, 106, 107, 109, 110, 118, 120, 121, 122, 124,
  126, 129, 131, 133, 135, 137, 146, 149, 150, 151,
  153, 154, 161, 163, 165, 167, 169, 181, 182, 183,
  193, 195, 210, 218, 225
];

// ── Paths ─────────────────────────────────────────────────────────────────────
const root        = path.resolve(__dirname, '..');
const libraryDir  = path.join(root, 'library');
const shownFile   = path.join(root, 'shown.json');
const displaySvg  = path.join(root, 'ca.svg');
const templatePath = path.join(root, 'README.template');
const readmePath  = path.join(root, 'README.md');

if (!fs.existsSync(libraryDir)) fs.mkdirSync(libraryDir);

// ── Generate SVG for a rule ───────────────────────────────────────────────────
function buildSVG(ruleNum) {
  const rulemap = {};
  for (let i = 0; i < 8; i++) rulemap[i] = (ruleNum >> i) & 1;

  const grid = Array.from({ length: ROWS }, () => new Uint8Array(COLS));
  grid[0][Math.floor(COLS / 2)] = 1;
  for (let r = 1; r < ROWS; r++) {
    const prev = grid[r - 1], curr = grid[r];
    for (let c = 0; c < COLS; c++) {
      const L = prev[(c - 1 + COLS) % COLS];
      const C = prev[c];
      const R = prev[(c + 1) % COLS];
      curr[c] = rulemap[(L << 2) | (C << 1) | R];
    }
  }

  const T = ROWS * ROW_DELAY + PAUSE;
  let rowGroups = '';
  for (let r = 0; r < ROWS; r++) {
    const t0 = r * ROW_DELAY;
    const t1 = t0 + 0.05;
    const t2 = T - 0.05;
    const k = [0, t0/T, t1/T, t2/T, 1.0].map(v =>
      Math.min(1, Math.max(0, v)).toFixed(4));
    const values = t1 < t2 ? '0;0;1;1;0' : '0;0;1;0;0';
    let cells = '';
    for (let c = 0; c < COLS; c++)
      if (grid[r][c])
        cells += `<rect x="${c*CELL}" y="${r*CELL}" width="${CELL}" height="${CELL}"/>`;
    if (!cells) continue;
    rowGroups +=
      `<g fill="${FG}" opacity="0">` +
      `<animate attributeName="opacity" dur="${T.toFixed(3)}s" values="${values}"` +
      ` keyTimes="${k.join(';')}" repeatCount="indefinite" calcMode="linear"/>` +
      cells + `</g>`;
  }

  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${HEIGHT}" ` +
    `viewBox="0 0 ${WIDTH} ${HEIGHT}">` +
    `<rect width="${WIDTH}" height="${HEIGHT}" fill="${BG}"/>` +
    rowGroups +
    `<text x="${WIDTH-5}" y="${HEIGHT-5}" text-anchor="end" ` +
    `font-family="monospace" font-size="11" fill="#aaa">Rule ${ruleNum}</text>` +
    `</svg>`
  );
}

// ── 1. Generate new SVG and add to library ────────────────────────────────────
const newRule = process.argv[2] !== undefined
  ? parseInt(process.argv[2], 10)
  : INTERESTING_RULES[Math.floor(Math.random() * INTERESTING_RULES.length)];

const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 23);
const newFilename = `rule-${String(newRule).padStart(3,'0')}-${timestamp}.svg`;
const newFilepath = path.join(libraryDir, newFilename);

fs.writeFileSync(newFilepath, buildSVG(newRule), 'utf8');
console.log(`✓ Generated ${newFilename}`);

// ── 2. Enforce library cap (delete oldest over LIBRARY_CAP) ──────────────────
let libraryFiles = fs.readdirSync(libraryDir)
  .filter(f => f.endsWith('.svg'))
  .sort();  // lexicographic = chronological given timestamp naming

while (libraryFiles.length > LIBRARY_CAP) {
  const oldest = libraryFiles.shift();
  fs.unlinkSync(path.join(libraryDir, oldest));
  console.log(`✓ Pruned ${oldest}`);
}

// ── 3. Load shown history ─────────────────────────────────────────────────────
let shown = [];
if (fs.existsSync(shownFile)) {
  try { shown = JSON.parse(fs.readFileSync(shownFile, 'utf8')); } catch {}
}

// ── 4. Pick random SVG not in recent shown history ───────────────────────────
const available = libraryFiles.filter(f => !shown.includes(f));
// If everything has been shown (small library), reset history and pick freely
const pool = available.length > 0 ? available : libraryFiles;
const picked = pool[Math.floor(Math.random() * pool.length)];
console.log(`✓ Displaying ${picked}`);

// ── 5. Update shown history ───────────────────────────────────────────────────
shown.push(picked);
if (shown.length > SHOWN_CAP) shown = shown.slice(-SHOWN_CAP);
fs.writeFileSync(shownFile, JSON.stringify(shown, null, 2), 'utf8');

// ── 6. Copy picked SVG to ca.svg (the display target) ────────────────────────
fs.copyFileSync(path.join(libraryDir, picked), displaySvg);

// ── 7. Inject into README ─────────────────────────────────────────────────────
const pickedRule = parseInt(picked.match(/rule-(\d+)/)[1], 10);
const template   = fs.readFileSync(templatePath, 'utf8');

const injection = [
  BEGIN_MARKER,
  '',
  `![Wolfram Elementary Cellular Automaton — Rule ${pickedRule}](./ca.svg)`,
  '',
  `*Rule ${pickedRule} — updates every 8 hours*`,
  '',
  END_MARKER,
].join('\n');

const beginIdx = template.indexOf(BEGIN_MARKER);
const endIdx   = template.indexOf(END_MARKER);
if (beginIdx === -1 || endIdx === -1) {
  console.error('ERROR: Markers not found in README.template');
  process.exit(1);
}

fs.writeFileSync(
  readmePath,
  template.slice(0, beginIdx) + injection + template.slice(endIdx + END_MARKER.length),
  'utf8'
);
console.log(`✓ README.md written (Rule ${pickedRule})`);
