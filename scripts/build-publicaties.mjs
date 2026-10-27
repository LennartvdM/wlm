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
  <link rel="stylesheet" href="../assets/css/style.css">
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
