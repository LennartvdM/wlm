#!/usr/bin/env node
/**
 * Generate publicaties/index.html from publicaties/publicaties.json + publicaties/pdf-meta.json.
 *
 *   node scripts/build-publicaties.mjs
 *
 * The page stays plain HTML (no framework at runtime): a grid of cards with the cover,
 * year, type, title and file facts, newest first. Search and the theme/type filters are
 * progressive enhancement in assets/js/site.js; without JavaScript the full list shows.
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const data = JSON.parse(readFileSync(join(ROOT, 'publicaties', 'publicaties.json'), 'utf8'));
const meta = JSON.parse(readFileSync(join(ROOT, 'publicaties', 'pdf-meta.json'), 'utf8'));

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const size = (bytes) => {
  const mb = bytes / 1024 / 1024;
  return mb >= 1 ? `${mb.toLocaleString('nl-NL', { maximumFractionDigits: 1 })} MB` : `${Math.max(1, Math.round(bytes / 1024))} kB`;
};

const items = [...data.items].sort((a, b) => b.year - a.year || a.title.localeCompare(b.title, 'nl'));
const years = items.map((i) => i.year);
const first = Math.min(...years);
const last = Math.max(...years);

const card = (p) => {
  const m = p.file ? meta[p.file] : null;
  if (p.file && !m) { console.error(`geen metadata voor ${p.file} — draai scripts/make-covers.py`); process.exit(1); }
  if (p.file && !existsSync(join(ROOT, 'publicaties', 'pdf', p.file))) { console.error(`pdf ontbreekt: ${p.file}`); process.exit(1); }
  const href = p.file ? `pdf/${encodeURIComponent(p.file)}` : p.url;
  const external = !p.file;
  const cover = m && !m.cover.plain
    ? `<span class="cover"><img src="covers/${encodeURIComponent(p.file.replace(/\.pdf$/i, ''))}.webp" width="${m.cover.w}" height="${m.cover.h}" alt="" loading="lazy" decoding="async"></span>`
    : `<span class="cover cover--set cover--${p.themes[0]}" aria-hidden="true"><span class="cover__type">${esc(p.type)}</span><span class="cover__title">${esc(p.title)}</span><span class="cover__year">${p.year}</span></span>`;
  const facts = [external ? 'Externe link' : 'PDF', m?.pages && `${m.pages} p.`, m && size(m.bytes)].filter(Boolean).join(' · ');
  return `      <li class="pub" data-year="${p.year}" data-type="${esc(p.type)}" data-themes="${p.themes.join(' ')}">
        <a class="pub__link" href="${esc(href)}"${external ? ' rel="noopener"' : ''}>
          ${cover}
          <span class="pub__body">
            <span class="pub__kicker"><span>${p.year}</span><span aria-hidden="true">·</span><span>${esc(p.type)}</span></span>
            <span class="pub__title">${esc(p.title)}</span>
            ${p.authors ? `<span class="pub__authors">${esc(p.authors)}</span>` : ''}
            <span class="pub__facts"><span class="pub__download" aria-hidden="true">${external ? '↗' : '↓'}</span>${facts}</span>
          </span>
        </a>
      </li>`;
};

const chips = (name, label, options) => `
      <div class="chips" role="group" aria-label="${label}">
        <button type="button" class="chip is-active" data-${name}="" aria-pressed="true">Alle${name === 'theme' ? ' thema’s' : ' soorten'}</button>
${options.map(([v, l]) => `        <button type="button" class="chip" data-${name}="${esc(v)}" aria-pressed="false">${esc(l)}</button>`).join('\n')}
      </div>`;

const html = `<!DOCTYPE html>
<!-- GEGENEREERD door scripts/build-publicaties.mjs uit publicaties/publicaties.json — niet met de hand bewerken. -->
<html lang="nl">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Publicaties | Wilma Henderikse</title>
  <meta name="description" content="Publicaties van Wilma Henderikse, ${first}–${last}: monitors, rapporten, artikelen en handreikingen over gender, diversiteit, leeftijd en de combinatie van werk en zorg.">
  <link rel="canonical" href="https://wilmahenderikse.nl/publicaties/">
  <link rel="icon" type="image/svg+xml" href="../assets/img/favicon.svg">
  <link rel="stylesheet" href="../assets/css/style.css?v=c272-3">
  <meta property="og:type" content="website">
  <meta property="og:locale" content="nl_NL">
  <meta property="og:title" content="Publicaties | Wilma Henderikse">
  <meta property="og:url" content="https://wilmahenderikse.nl/publicaties/">
</head>
<body>

<header class="site-header">
  <div class="wrap">
    <a class="wordmark" href="../">Wilma Henderikse<span class="dot">.</span></a>
    <nav class="site-nav" aria-label="Hoofdmenu">
      <a href="../#werk">Mijn werk</a>
      <a href="./" aria-current="page">Publicaties</a>
      <a href="../#over">Over Wilma</a>
      <a href="../#contact">Contact</a>
    </nav>
  </div>
</header>

<main>

  <div class="page-head">
    <div class="wrap">
      <h1>Publicaties</h1>
      <p class="intro">Monitors, rapporten, artikelen en handreikingen over gender, diversiteit, leeftijd en de combinatie van werk en zorg, ${first}–${last}. Alle documenten zijn als PDF te openen en te downloaden.</p>
    </div>
  </div>

  <div class="pub-toolbar">
    <div class="wrap">
      <label class="search">
        <span class="visually-hidden">Zoeken in publicaties</span>
        <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>
        <input type="search" id="pub-filter" placeholder="Zoek op titel, auteur of jaar" autocomplete="off" aria-label="Zoeken in publicaties">
      </label>
${chips('theme', 'Thema', Object.entries(data.themes))}
${chips('type', 'Soort publicatie', data.types.map((t) => [t, t]))}
      <span class="result-count" aria-live="polite"></span>
    </div>
  </div>

  <section class="pub-section">
    <div class="wrap">
      <ul class="pub-list grid">
${items.map(card).join('\n')}
      </ul>
    </div>
  </section>

  <div class="wrap no-results">
    <p>Geen publicaties gevonden. Probeer een andere zoekterm of thema.</p>
  </div>

</main>

<footer class="site-footer">
  <div class="wrap">
    <span>© <span id="jaar">${new Date().getFullYear()}</span> Wilma Henderikse</span>
    <span><a href="../">Home</a> · <a href="https://www.researchgate.net/profile/Wilma_Henderikse" rel="noopener">ResearchGate</a></span>
  </div>
</footer>

<script src="../assets/js/site.js" defer></script>
<script>document.getElementById('jaar').textContent = new Date().getFullYear();</script>
</body>
</html>
`;
writeFileSync(join(ROOT, 'publicaties', 'index.html'), html);
console.log(`publicaties/index.html: ${items.length} publicaties, ${first}–${last}`);

// ── the cover bento on the homepage: every portrait cover (one per title) as tiles of
//    varying size in a two-row strip that slides past. Sizes are drawn by a seeded PRNG,
//    so the pattern is random-looking but identical on every build and needs no JS.
//    The strip is packed twice over, the second copy offset, so the CSS loop is seamless. ──
const sameCover = (a, b) => {
  const norm = (t) => t.toLowerCase().replace(/\bfactsheet\b,?/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
  return norm(a) === norm(b);
};
const withCover = items
  .filter((p) => p.file && meta[p.file] && !meta[p.file].cover.plain && meta[p.file].cover.h > meta[p.file].cover.w * 1.05)
  .filter((p, i, all) => all.findIndex((q) => sameCover(q.title, p.title)) === i);
const rng = (seed) => () => { seed |= 0; seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
const rand = rng(withCover.length * 7919 + 11);
const SIZES = [['tall', 1, 2, .38], ['big', 2, 2, .17], ['small', 1, 1, .25], ['wide', 2, 1, .2]];
const draw = () => { let r = rand(); for (const s of SIZES) { r -= s[3]; if (r <= 0) return s; } return SIZES[0]; };
// pack into two rows; cols[r] = next free column of row r
const cols = [0, 0];
const tiles = [];
let prevShape = null;
withCover.forEach((p, n) => {
  let [name, w, h] = draw();
  if (prevShape === name && name !== 'small') [name, w, h] = SIZES[2];   // never two of the same big shape in a row
  if (n === 0) [name, w, h] = SIZES[1];                              // the newest opens the strip, big
  let col, row;
  // a two-row tile needs both rows level; if they are not, this cover fills the shorter row
  // instead (as a small or wide tile), so the strip never has a hole
  if (h === 2 && cols[0] !== cols[1]) {
    w = Math.min(2, Math.abs(cols[0] - cols[1])); h = 1; name = w === 2 ? 'wide' : 'small';
  }
  if (h === 2) { col = cols[0]; row = 0; cols[0] = cols[1] = col + w; }
  else { row = cols[0] <= cols[1] ? 0 : 1; col = cols[row]; cols[row] += w; }
  tiles.push({ p, name, col, row, w, h });
  prevShape = name;
});
// even out the two rows at the end, so the loop closes without a hole
while (cols[0] !== cols[1]) {
  const row = cols[0] < cols[1] ? 0 : 1, w = Math.min(2, Math.abs(cols[0] - cols[1]));
  const p = withCover[tiles.length % withCover.length];
  tiles.push({ p, name: w === 2 ? 'wide' : 'small', col: cols[row], row, w, h: 1 });
  cols[row] += w;
}
const totalCols = cols[0];
const tile = (t, copy) => {
  const m = meta[t.p.file];
  return `      <a class="bento-tile is-${t.name}" style="grid-area:${t.row + 1} / ${t.col + 1 + (copy ? totalCols : 0)} / span ${t.h} / span ${t.w}" href="publicaties/pdf/${encodeURIComponent(t.p.file)}"${copy ? ' tabindex="-1" aria-hidden="true"' : ''}>
        <img src="publicaties/covers/${encodeURIComponent(t.p.file.replace(/\.pdf$/i, ''))}.webp" width="${m.cover.w}" height="${m.cover.h}" alt="${copy ? '' : esc(t.p.title)}" loading="lazy" decoding="async">
        <span class="card-title">${esc(t.p.title)}</span>
      </a>`;
};
const marquee = `    <!-- marquee:start — GEGENEREERD door scripts/build-publicaties.mjs -->
    <div class="bento-marquee" data-site-snap data-site-snap-free aria-label="Omslagen van publicaties">
      <div class="bento-track" style="--cols:${totalCols};--marquee-s:${Math.round(totalCols * 4.5)}s">
${tiles.map((t) => tile(t, false)).join('\n')}
      <span class="bento-copy" style="display:contents">
${tiles.map((t) => tile(t, true)).join('\n')}
      </span>
      </div>
    </div>
    <!-- marquee:end -->`;
const homePath = join(ROOT, 'index.html');
const home = readFileSync(homePath, 'utf8');
const re = /    <!-- marquee:start[\s\S]*?<!-- marquee:end -->/;
if (!re.test(home)) { console.error('marquee markers not found in index.html'); process.exit(1); }
writeFileSync(homePath, home.replace(re, marquee));
console.log(`index.html: bento-carrousel met ${withCover.length} omslagen in ${totalCols} kolommen`);
