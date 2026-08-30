# Produksjons-deploy

Tre deler: (A) MapKit-token som Edge Function, (B) hosting av PWA-en, (C) ukentlig tilbudsimport.
Alt av kode er klart. Under er nøyaktig hva **du** kjører.

Forutsetter at du har `git` og Node (finnes), og en Supabase-innlogging.

---

## 0. Få koden på GitHub (én gang)

```bash
cd "Søndagsåpent"
git init && git add -A && git commit -m "Søndagsåpent MVP"
git branch -M main
git remote add origin <DIN_REPO_URL>
git push -u origin main
```

`.env` og `.secrets/` pushes ikke (gitignored). Bra — hemmeligheter forblir lokale.

---

## A. MapKit-token (Supabase Edge Function)

Flytter `.p8` fra dev-serveren til Supabase. Kjør fra prosjektmappa:

```bash
npx supabase login                                   # åpner nettleser, logg inn
npx supabase link --project-ref alyzypfguxumtnztrzer
# hemmeligheter (Team ID + Key ID kjenner du; .p8 leses fra fila):
npx supabase secrets set APPLE_TEAM_ID=PSP3ZZ6TJG APPLE_KEY_ID=4X5DTNYJPN
npx supabase secrets set APPLE_P8="$(cat .secrets/AuthKey_4X5DTNYJPN.p8)"
# (valgfritt, sett når domenet er klart:)  APPLE_ORIGIN=https://app.dittdomene.no
npx supabase functions deploy mapkit-token --no-verify-jwt
```

Test:
```bash
curl https://alyzypfguxumtnztrzer.supabase.co/functions/v1/mapkit-token
```
Skal returnere en lang JWT. Frontend bruker denne automatisk i prod (se `public/config.js`).

> `--no-verify-jwt` gjør endepunktet offentlig (det returnerer bare et kortlevd, ufarlig kart-token).
> `APPLE_ORIGIN` låser tokenet til domenet ditt — sett det når domenet er på plass for ekstra sikkerhet.

---

## B. Hosting av PWA-en

### Alternativ 1 — Vercel (anbefalt: gratis, HTTPS, kobles til repoet)
- `vercel.json` er ferdig (bygger `app.bundle.js` og serverer `public/`).
- I Vercel: **New Project → importer GitHub-repoet → Deploy.** Ingen ekstra config.
- Eller CLI: `npx vercel --prod`
- Du får en `https://…vercel.app`-URL med en gang. Egen domene kobles i Vercel → Settings → Domains.

### Alternativ 2 — Netcup (du eier den)
```bash
npm install && npm run build:web        # bygger public/app.bundle.js
# kopier public/ til serveren:
rsync -av public/ bruker@server:/var/www/sondagsapent/
```
nginx (HTTPS via certbot):
```nginx
server {
  server_name app.dittdomene.no;
  root /var/www/sondagsapent;
  location / { try_files $uri $uri/ /index.html; }
}
```

Uansett host: **HTTPS kreves** (geolokasjon virker bare i secure context).

---

## C. Ukentlig tilbudsimport (GitHub Actions)

Workflow ligger i `.github/workflows/offers-weekly.yml` (mandag + torsdag 05:00 UTC, + manuell kjøring).
Den trenger én repo-secret:

- GitHub → repoet → **Settings → Secrets and variables → Actions → New repository secret**
  - Navn: `DATABASE_URL`
  - Verdi: pooler-strengen (samme som i din `.env`)

Test: Actions-fanen → «Ukentlig tilbudsimport» → **Run workflow**. Skal importere ~400 tilbud.

---

## Sjekkliste

- [ ] Kode pushet til GitHub
- [ ] `mapkit-token`-funksjon deployet + secrets satt
- [ ] PWA hostet (Vercel eller Netcup) på HTTPS
- [ ] `DATABASE_URL` lagt som GitHub Actions-secret
- [ ] Egen domene koblet (valgfritt), og `APPLE_ORIGIN` satt til domenet
- [ ] Bekreftet Tjek-bruksvilkår for tilbud/bilder (se `scripts/offers/README.md`)

## Hva som er hemmelig (aldri i repo/klient)
`.p8`, DB-passord/`DATABASE_URL`, `service_role`. Ligger i `.env`/`.secrets/` (gitignored) og som
Supabase/GitHub-secrets. `anon`-key og Team/Key/Maps-ID er OK i klient.
