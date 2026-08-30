# Søndagsåpent

Finn matbutikker som er åpne nå i Norge — med fokus på **søndagsåpent**. MVP, kun dagligvare.

## Status

| Steg | Innhold | Tilstand |
|---|---|---|
| 1 | Supabase-schema (`places`, `place_sources`, `import_runs`, PostGIS, RLS, `nearby_stores`) | Skrevet — venter på Supabase-tilgang for å kjøres |
| 2 | Import av Norge-data (idempotent, klassifisering, dedup) | Skrevet + logikk verifisert uten DB |
| 3 | Åpningstidsmotor (`opening_hours.js`, Europe/Oslo, PH) | **Ferdig — 10/10 tester grønne** |
| 4 | `nearby_stores`-API + status | Skrevet — venter på DB |
| 5 | Frontend (MapKit JS) | Ikke startet |

## Oppsett

```bash
npm install
```

Node kjøres med `TZ=Europe/Oslo` for deterministisk åpningstidsevaluering.

## Kommandoer

```bash
# Steg 3: tester for åpningstidsmotoren
TZ=Europe/Oslo npm test

# Steg 3: kjør motoren mot hele Norge-datasettet
TZ=Europe/Oslo node scripts/engine-report.js

# Steg 2 (no-DB): verifiser klassifisering + dedup
node scripts/classify-report.js

# Steg 1: kjør migrasjonen (krever DATABASE_URL)  -> supabase/migrations/0001_init.sql

# Steg 2: importer Norge (krever DATABASE_URL)
DATABASE_URL=... node scripts/import-norway.js

# Steg 4: test nearby 5/10/20 km (krever DATABASE_URL + import kjørt)
DATABASE_URL=... node scripts/nearby-demo.js
```

## Datagrunnlag

`data/no_grocery.tsv` — engangsuttrekk av `shop=supermarket|convenience` i Norge fra OpenStreetMap
(© OpenStreetMap contributors, ODbL). Produksjon skal bruke egen nedlastet Norge-fil; dette er
utviklings-/analyse-fixturen.

## Prinsipper

- Manglende åpningstid = **UNKNOWN**, aldri CLOSED.
- Søndag/helligdag evalueres mot faktisk dato/klokke — aldri tekstsøk etter `Su`.
- Frontend laster aldri hele databasen; alt geo-søk skjer i PostGIS.
