# wilmahenderikse.nl

Persoonlijke website van Wilma Henderikse — maatschappelijk ondernemer, onderzoeker, auteur.

Volledig statische site, geen framework en geen build voor de pagina's zelf. De homepage is
een scrolly in hoofdstukken (`assets/js/site.js`), met daarin, inline en op volle breedte,
een levend fragment van de *Monitor Talent naar de Top 2025*.

## Structuur

```
index.html                   Homepage: hero, Monitor-fragment, mijn werk + omslagbento,
                             citaat, over Wilma, contact
publicaties/index.html       GEGENEREERD uit publicaties/publicaties.json (zie hieronder)
publicaties/publicaties.json De publicatielijst: titel (letterlijk, zoals op de oude site),
                             jaar, soort, thema's, auteurs, bestand
publicaties/pdf/             De publicaties als pdf, met leesbare bestandsnamen
publicaties/covers/          GEGENEREERD: de voorkant van elke pdf als webp
publicaties/pdf-meta.json    GEGENEREERD: paginatelling en bestandsgrootte per pdf
monitor-sample/              GESYNCHRONISEERD: snapshot van de Monitor-deck (zie VERSION)
assets/css/style.css         Eén stylesheet; tokens bovenaan, het Monitor-blok apart
assets/js/site.js            Scrolly, e-mail-onthulling, publicatiefilter
assets/fonts/                Montserrat (woff2, gesubset, zelf gehost)
assets/img/                  Portret, lepelaars, favicon
scripts/                     De drie generatoren (hieronder)
_reference/                  Screenshots van de oorspronkelijke WordPress-site
```

## Uitgangspunten

- **De teksten zijn van Wilma zelf.** Rollen, de zin over haar werk, de bio, het citaat en de
  publicatietitels staan letterlijk zoals op de oorspronkelijke site. De enige toegevoegde
  tekst zijn labels ("Mijn werk", "Contact") en de inleiding op de publicatiepagina.
- **Palet en opzet van de oorspronkelijke site.** Warm geel (hero, contact), diep groen (over
  Wilma), warm papier; portret tegen de rand; gecentreerd citaat. Montserrat, zelf gehost.
  Geen decoratie die niets doet: geen cirkels, geen scheve foto's; één typografische schaal.
- **Geen externe requests.** Lettertype zelf gehost, geen Google Fonts, geen analytics.
- **E-mailadres niet in de DOM**: pas na een klik samengesteld uit tekencodes.
- **Zonder JavaScript blijft alles bruikbaar**: de publicatielijst staat er compleet, het
  filter en de e-mailknop zijn extra's.

## Lokaal bekijken

```
python3 -m http.server 8000
```

## Publicatie toevoegen

1. Zet de pdf in `publicaties/pdf/` (korte, leesbare bestandsnaam, geen rare tekens).
2. Voeg een regel toe aan `publicaties/publicaties.json` (de velden staan bovenin uitgelegd).
3. `python3 scripts/make-covers.py` — rendert de voorkant en legt paginatelling en grootte
   vast (vereist poppler en Pillow). Heeft de pdf geen echte kaft, dan tekent de pagina zelf een
   typografische cover.
4. `node scripts/build-publicaties.mjs` — schrijft `publicaties/index.html` en de omslagcarrousel
   op de homepage (tussen de `marquee`-markers in `index.html`).
5. Commit pdf, json, cover, meta en de gegenereerde pagina.

## De Monitor bijwerken

De deck wordt gebouwd in de repo van monitortalent.nl (`Vragenlijst-Executive-Search`,
`factsheet-deck/`). Bij een nieuwe versie:

```
node scripts/sync-monitor.mjs --from ../Vragenlijst-Executive-Search          # versie uit deck.json
node scripts/sync-monitor.mjs --from ../Vragenlijst-Executive-Search --rev c272
```

Dit kopieert de snapshot naar `monitor-sample/` en haalt uit de deck-bron het figuurscript en
de stijlen van de Inleiding (`monitor-sample/p02.js`, `p02.css`): de trap, de drie niveaus en
de vrouwtjes die van overal het scherm op springen. `site.js` knipt `#p02` en `#p05` uit de
snapshot en draait er zijn eigen pager over; het figuurscript draait op de homepage zelf, zodat
de vrouwtjes niet door het stage worden afgeknipt. Bewerk `monitor-sample/` niet met de hand.
