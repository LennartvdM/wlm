# wilmahenderikse.nl

Persoonlijke website van Wilma Henderikse — maatschappelijk ondernemer, onderzoeker, auteur.

Volledig statische site, van de grond af opnieuw opgebouwd (juli 2026) op basis van het
materiaal van de oorspronkelijke WordPress/Divi-site. De oude site-mirror is uit de
werkkopie verwijderd, maar blijft beschikbaar in de git-historie.

## Structuur

```
index.html               Homepage (hero, thema's, uitgelichte publicaties, over, contact)
publicaties/index.html   Doorzoekbaar publicatie-archief, gegroepeerd op thema
publicaties/pdf/         41 publicaties als pdf, met leesbare bestandsnamen
assets/css/style.css     Eén stylesheet, geen frameworks
assets/js/site.js        E-mail-onthulling + archief-filter (progressive enhancement)
assets/fonts/            Montserrat (woff2, gesubset, self-hosted)
assets/img/              Geoptimaliseerde afbeeldingen + favicon
```

## Uitgangspunten

- **Geen afhankelijkheden.** Puur HTML/CSS/JS; werkt op elke statische host (GitHub Pages, Netlify, …).
- **Zelf-gehost lettertype.** Montserrat is gesubset naar latin/latin-ext en lokaal opgenomen; geen Google Fonts-requests.
- **E-mailadres niet in de DOM.** Het adres wordt pas na een klik uit tekencodes samengesteld (spam-oogst tegengaan).
- **Palet uit het eigen materiaal.** Het warme geel komt van de oorspronkelijke site; diep groen en vermiljoenrood uit het portret en de omslagen van de monitors.
- **Zonder JavaScript blijft alles bruikbaar**; het filter en de e-mailknop zijn extra's.

## Lokaal bekijken

```
python3 -m http.server 8000
```

en open http://localhost:8000/.
