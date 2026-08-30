# Tilbuds-pipeline

Egen pipeline, adskilt fra åpningstider. Henter kundeaviser/tilbud og kobler dem til butikker
via kjede (nasjonalt) eller direkte butikk (butikkspesifikt).

## Arkitektur

```
scripts/offers/
  run.js            kjører alle kilder, per-kjede isolert, idempotent (erstatt per kjede)
  chain-map.js      kildens kjedenavn -> vår kanoniske chain
  sources/
    tjek.js         kilde: Tjek / eTilbudsavis
```

- **Én kilde per adapter.** Legg til flere i `SOURCES` i `run.js`.
- **Per-kjede isolasjon:** hver (kilde, kjede) importeres i egen transaksjon — én kjede kan feile
  uten å velte resten.
- **Idempotent:** hver kjøring erstatter aktive tilbud for (kilde, kjede). Utløpte ryddes.
- **Provenance:** hvert tilbud lagrer `source`, `source_url`, `valid_from`, `valid_to`.
- **Nasjonalt vs butikk:** `scope='national'` + `chain_id` vises på alle butikker i kjeden uten
  kopier. Butikkspesifikke tilbud settes med `store_id`.

Kjør: `node scripts/offers/run.js` (krever `DATABASE_URL`).

## Kildevurdering (per krav: «vurder før permanent produksjonsavhengighet»)

| Kilde | Status | Vurdering |
|---|---|---|
| **Tjek / eTilbudsavis** (`squid-api.tjek.com`) | **Implementert** | Samme backend som etilbudsavis.no. Returnerer strukturerte tilbud (produkt, pris, førpris, bilde, gyldighet) tagget med kjede. Dekker KIWI, REMA 1000, Coop (Extra/Prix/Mega/Marked/Obs), MENY, SPAR, Bunnpris, Joker, Matkroken, Nærbutikken. Svarte uten API-nøkkel ved testing (aug 2026). |
| Kjedenes egne app-API-er | Ikke brukt | Udokumenterte/private. Skjøre, og frarådet som permanent avhengighet uten avtale. |
| mattilbud.no o.l. | Ikke brukt | Aggregatorer uten åpent, dokumentert datauttrekk. |

### Å avklare før permanent bruk av Tjek
- **Bruksvilkår / attribusjon:** bekreft at API-bruk og visning av tilbud/bilder er tillatt for vår
  bruk, og hvilken attribusjon som kreves.
- **Levetid/stabilitet:** Tjek er en tredjepart (oppkjøpt). Adapter-mønsteret gjør at vi kan bytte
  kilde per kjede uten å røre resten av appen.
- **Bilder:** vi lenker til Tjeks bilde-URL-er (hotlink). Vurder caching/egne kopier ved skalering.

Konklusjon: Tjek er den mest robuste *tilgjengelige* kilden nå, og er implementert som første kilde.
Den er isolert bak adapter-grensesnittet, så en dedikert kjede-kilde (f.eks. et offisielt KIWI-feed)
kan legges til senere og overstyre Tjek for den kjeden.
