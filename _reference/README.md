# Referentie: de oorspronkelijke WordPress-site

Volledige screenshots van de oude Divi/WordPress-site, gereconstrueerd uit de
mirror die in de git-historie bewaard is gebleven (commit `46f944f`).

| Bestand | Pagina |
|---|---|
| `original-home.jpg` | Homepage |
| `original-pubs.jpg` | Publicaties |

## De oude site zelf weer bekijken

De mirror staat niet meer in de werkkopie, maar zit nog volledig in git:

```
git archive 46f944f | tar -x -C /tmp/wlm-origineel
python3 _reference/serve-original.py /tmp/wlm-origineel
# open http://localhost:8714/index.htm
```

Let op: een gewone statische server toont de site *zonder* afbeeldingen. De
mirror is op Windows gemaakt — bestandsnamen zijn verkleinletterd op schijf,
terwijl de HTML met hoofdletters verwijst (`Wilma-6.png`). Het meegeleverde
`serve-original.py` lost paden daarom hoofdletterongevoelig op.

## Ontwerp-DNA van het origineel

- Warm **geel/goud** als merkkleur (hero- en contactvlakken), met donkergrijze kop-typografie
- Hero: naam links op geel, portret rechts tegen de rand, rollen in onderkast
- Tolkien-citaat als eigen grijze band, gecentreerd
- Collage/masonry van publicatie-omslagen onder "Mijn werk", met de lepelaarfoto ertussen
- Gecentreerd contactblok ("Vragen? Hier kunt u mij bereiken") met Divi-formulier en som-captcha
- Montserrat voor koppen, Open Sans voor lopende tekst
