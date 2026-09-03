# App Store — innsendingsinfo for Åpen

Ferdig, selgende tekst du limer rett inn i App Store Connect, pluss steg-for-steg.

---

## Navn
Åpen

## Undertittel (maks 30 tegn)
Åpne matbutikker – akkurat nå

## Kampanjetekst (maks 170 tegn — kan endres når som helst uten ny review)
Aldri stå foran en stengt dør igjen. Åpen viser deg på sekundet hvilke matbutikker rundt deg som har åpent – med åpningstider, tilbud og veibeskrivelse. Helt gratis.

## Beskrivelse (lim inn hele)
Har du noen gang dratt til butikken bare for å møte en stengt dør? Aldri mer.

Åpen viser deg med én gang hvilke matbutikker rundt deg som er åpne akkurat nå – på et rent og oversiktlig kart. Enten det er søndag, sent på kvelden eller en helligdag: du ser hvor du kan handle før du drar hjemmefra.

DETTE FÅR DU:
🟢 Åpent nå – se på sekundet hvilke butikker som har åpent, og når de stenger.
📅 Søndagsåpent – finn butikkene som holder åpent når nesten alt annet er stengt.
🏷️ Ukens tilbud – sjekk tilbudene i butikken før du går.
🚶🚗 Gå eller kjør – velg reisemåte og få avstand, tid og veibeskrivelse rett i Apple Kart.
🗺️ Hele Norge – KIWI, REMA 1000, Meny, Coop, Joker, Spar, Bunnpris og mange flere.
✏️ Alltid oppdatert – finner du feil åpningstid? Rett den med ett trykk.

ENKELT OG TRYGT:
Ingen innlogging. Ingen annonser. Ingen sporing. Bare butikkene rundt deg, når du trenger dem.

Last ned Åpen gratis – og slipp å lure på om butikken er åpen.

—
Butikkdata fra OpenStreetMap (© OpenStreetMap-bidragsytere, ODbL). Tilbud via eTilbudsavis. Kart fra Apple.

## Nøkkelord (maks 100 tegn, kommaseparert — ikke gjenta ord fra navnet)
søndagsåpent,matbutikk,åpningstider,dagligvare,nærbutikk,tilbud,kiwi,rema,meny,coop,butikk,handle

## URL-er
- Personvern-URL (påkrevd): https://patricangefuhr.github.io/aapent/personvern.html
- Support-URL (påkrevd): https://patricangefuhr.github.io/aapent/personvern.html
- Marketing-URL (valgfritt): https://patricangefuhr.github.io/aapent/

## Kategori
Primær: Mat og drikke (Food & Drink). Sekundær (valgfritt): Shopping.

## Aldersgrense
4+

## App Privacy (personvern-merking)
- Posisjon (omtrentlig): brukt til APPFUNKSJONALITET (vise nærliggende butikker). Ikke knyttet til bruker. IKKE sporing.
- Alt annet: Nei.

## Eksport-compliance
Løst i koden (ITSAppUsesNonExemptEncryption = false). Svar «Nei» på ikke-fritatt kryptering.

## Pris
Gratis.

---

# Steg for steg: få Åpen ut på App Store

## Del 1 — Bygg innsendingsversjonen
1. Codemagic → **Start new build** → branch `main` → sjekk commit **3c7fe9b** (eller nyere).
2. Vent til builden er grønn og lastet opp. Apple bruker noen minutter på å prosessere den.

## Del 2 — Fyll ut i App Store Connect (appstoreconnect.apple.com)
3. **My Apps → Åpen → App Information:**
   - Name: **Åpen**
   - Category: **Food & Drink** (ev. Navigation)
   - Privacy Policy URL: lim inn URL-en over
4. **Pricing and Availability:** Pris = **Gratis**, tilgjengelig i Norge (og gjerne hele verden).
5. Åpne versjon **1.0** (venstremeny). Fyll ut:
   - **Promotional text**, **Description**, **Keywords** (kopier fra over)
   - **Support URL** + **Marketing URL**
   - **Screenshots** (se Del 3)
   - **Build:** trykk «+» og velg den nye builden fra Codemagic
   - **App Review Information:** navn, e-post, telefon (til Apple, vises ikke offentlig)
6. **App Privacy** (venstremeny): fyll ut posisjon som beskrevet over.
7. **Age Rating:** svar «Nei» på alt → 4+.

## Del 3 — Skjermbilder (tas enklest på iPhone)
8. Åpne Åpen, still inn et fint område med flere butikker.
9. Ta skjermbilder av: kartet, butikklista, en butikk med åpningstid + veibeskrivelse, en butikk med «Ukens tilbud».
10. I App Store Connect, last opp under størrelsen **6,7"** (iPhone Pro Max). Minst 1, helst 3–5.

## Del 4 — Send inn
11. Trykk **Add for Review** / **Submit for Review**.
12. Svar på eksport-compliance («Nei») hvis spurt.
13. Apple vurderer vanligvis i løpet av 1–3 dager. Svar raskt hvis de har spørsmål.

## Huskeliste før innsending
- [ ] Ny build kjørt og valgt
- [ ] Navn = Åpen
- [ ] Personvern-URL + Support-URL fylt inn
- [ ] App Privacy-skjema fylt ut
- [ ] Skjermbilder lastet opp
- [ ] Beskrivelse/undertittel/nøkkelord limt inn
- [ ] Kontakt-e-post byttet inn i personvern.html (står en plassholder nå)

## Merk (rettigheter)
Appen viser kjedelogoer + tilbud fra eTilbudsavis. Ha dokumentasjon klar hvis Apple spør (Retningslinje 5.2.1), ev. bytt til de stiliserte flisene.
