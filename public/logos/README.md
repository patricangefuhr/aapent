# Kjedelogoer

Denne mappa er for **offisielle** logofiler fra kjedene. Appen bruker dem
automatisk i kartnåler, liste og detaljvisning så snart de er lagt inn og
skrudd på i `LOGO_FILES`-tabellen i `public/app.mjs`.

Logoene er varemerkebeskyttet materiale som eies av kjedene. Last dem ned fra
kjedens egen **merkevare-/pressepakke** (brand kit), som har bruksvilkår, eller
be om tillatelse. Ikke skrap dem tilfeldig fra nettet.

## Hvor de offisielle filene finnes (brand kits / presse)

| Kjede(r)                                             | Eier / kilde        |
|------------------------------------------------------|---------------------|
| KIWI, MENY, Joker, SPAR, EUROSPAR, Nærbutikken, Matkroken | NorgesGruppen (presse/merkevare) |
| Coop Extra, Coop Prix, Coop Mega, Coop Marked, Obs, Coop   | Coop Norge (presse/merkevare)    |
| REMA 1000                                            | REMA 1000 / Reitan (presse)      |
| Bunnpris                                             | Bunnpris (presse)                |

## Filformat og navn

- **Helst SVG** (skalerer skarpt i alle størrelser). PNG med gjennomsiktig
  bakgrunn går også (minst 128×128).
- Legg filen her med små bokstaver, f.eks. `kiwi.svg`, `rema-1000.svg`.

Foreslåtte filnavn (matcher `LOGO_FILES` i app.mjs):

```
kiwi.svg          rema-1000.svg     meny.svg
coop-extra.svg    coop-prix.svg     coop-mega.svg
coop-marked.svg   obs.svg           coop.svg
joker.svg         spar.svg          eurospar.svg
bunnpris.svg      naerbutikken.svg  matkroken.svg
```

## Slå dem på

I `public/app.mjs`, i `LOGO_FILES`, fjern kommentaren / legg til raden for
kjeden, f.eks.:

```js
const LOGO_FILES = {
  'KIWI': 'kiwi.svg',
  'REMA 1000': 'rema-1000.svg',
  // ...
};
```

Kjør deretter `npm run build:web` (eller be Claude gjøre det). Kjeder uten fil
faller automatisk tilbake til den stiliserte merkeflisen — ingenting knekker.
