import { evaluate, isOpenAt, targetSunday, prettify } from './lib/oh-browser.mjs';

const CONFIG = window.APP_CONFIG;
const $ = (s, r = document) => r.querySelector(s);
const lsGet = (k) => { try { return localStorage.getItem(k); } catch { return null; } };
const lsSet = (k, v) => { try { localStorage.setItem(k, v); } catch {} };

const state = {
  pos: null, stores: [], filter: 'open', sundayInfo: '', usingFallback: false,
  travel: lsGet('travel') || 'walk', current: null,
};

/* ---------- kjede-identitet ---------- */
const CHAIN_COLORS = {
  'KIWI': '#00A650', 'REMA 1000': '#00539F', 'MENY': '#A6192E',
  'Coop Extra': '#009A44', 'Coop Prix': '#009A44', 'Coop Mega': '#009A44',
  'Coop Marked': '#009A44', 'Coop Obs': '#E4002B', 'Coop': '#009A44',
  'Joker': '#E30613', 'SPAR': '#D52B1E', 'EUROSPAR': '#00843D',
  'Bunnpris': '#B8232F', 'Nærbutikken': '#2F8F3E', 'Matkroken': '#2E9E8F',
};
const chainColor = (c) => CHAIN_COLORS[c] || '#647587';
const initial = (s) => (s || '?').trim().charAt(0).toUpperCase();
const shopLabel = (t) => t === 'supermarket' ? 'Supermarked' : 'Dagligvare / nærbutikk';

/* Kjede-logo i pin: merkefarget plate + hvit ordmerke/symbol (gjenkjennelig, lesbar i liten skala). */
const LOGO_MARK = {
  'KIWI': 'KIWI', 'REMA 1000': 'REMA', 'MENY': 'MENY',
  'Coop Extra': 'EXTRA', 'Coop Prix': 'PRIX', 'Coop Mega': 'MEGA',
  'Coop Marked': 'MARKED', 'Coop Obs': 'OBS', 'Coop': 'Coop',
  'Joker': 'Joker', 'Bunnpris': 'Bp', 'Nærbutikken': 'Nær', 'Matkroken': 'MK',
};
const FIR_CHAINS = new Set(['SPAR', 'EUROSPAR']); // Spar-familien: hvit grantre-silhuett
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
// Merkeinnhold (ordmerke eller grantre) i et 44-bredt koordinatrom, sentrert vertikalt på yc.
function brandContent(chain, yc) {
  if (FIR_CHAINS.has(chain)) {
    return `<g transform="translate(0 ${yc - 13})">`
         + '<path d="M22 3 29 14 25.5 14 31 22 13 22 18.5 14 15 14Z" fill="#fff"/>'
         + '<rect x="20.5" y="21.5" width="3" height="5" fill="#fff"/></g>';
  }
  const t = LOGO_MARK[chain] || initial(chain);
  const long = t.length >= 4;
  const fs = t.length <= 2 ? 15 : long ? 13 : 14;
  const tl = long ? ' textLength="38" lengthAdjust="spacingAndGlyphs"' : '';
  return `<text x="22" y="${yc}" text-anchor="middle" dominant-baseline="central" `
       + `font-family="'Helvetica Neue',Arial,sans-serif" font-weight="800" `
       + `font-size="${fs}"${tl} fill="#fff">${esc(t)}</text>`;
}
// Bred pin-plate — kartnåler.
function logoSVG(chain) {
  return `<svg viewBox="0 0 44 30" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid meet" class="brand">`
       + `<rect x="0" y="0" width="44" height="30" rx="7" fill="${chainColor(chain)}"/>${brandContent(chain, 15.5)}</svg>`;
}
// Kvadratisk logo-flis — liste og detalj (samme merkeidentitet som nålene).
function logoAvatar(chain) {
  return `<svg viewBox="0 0 44 44" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid meet" class="brand">`
       + `<rect x="0" y="0" width="44" height="44" rx="11" fill="${chainColor(chain)}"/>${brandContent(chain, 23)}</svg>`;
}

/* ---------- reise (gå/kjør) ---------- */
const TRAVEL = {
  walk: { mpm: 80, dirflg: 'w', word: 'gange' },
  drive: { mpm: 450, dirflg: 'd', word: 'kjøring' },
};
const travelText = (m) => `${state.travel === 'walk' ? '🚶' : '🚗'} ${Math.max(1, Math.round(m / TRAVEL[state.travel].mpm))} min · ${fmtDist(m)}`;

/* ---------- geo ---------- */
function haversine(a, b) {
  const R = 6371000, toRad = (d) => d * Math.PI / 180;
  const dLat = toRad(b.lat - a.lat), dLon = toRad(b.lon - a.lon);
  const la1 = toRad(a.lat), la2 = toRad(b.lat);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(la1) * Math.cos(la2) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}
const fmtDist = (m) => m < 1000 ? `${Math.round(m)} m` : `${(m / 1000).toFixed(1).replace('.', ',')} km`;
const fmtKr = (n) => n == null ? null : Number(n).toFixed(2).replace('.', ',');

// I native app (Capacitor): rut navigator.geolocation via native plugin (WKWebView mangler HTML5-geo).
async function installNativeGeo() {
  const cap = window.Capacitor;
  if (!(cap && cap.isNativePlatform && cap.isNativePlatform())) return;
  const Geo = cap.Plugins && cap.Plugins.Geolocation;
  if (!Geo) return;
  try { await Geo.requestPermissions(); } catch {}
  navigator.geolocation.getCurrentPosition = (ok, err, opts) => {
    Geo.getCurrentPosition({ enableHighAccuracy: true, timeout: (opts && opts.timeout) || 8000 })
      .then((p) => ok(p)).catch((e) => err && err(e));
  };
}

function getPosition() {
  return new Promise((resolve) => {
    if (!navigator.geolocation) return resolve(null);
    navigator.geolocation.getCurrentPosition(
      (p) => resolve({ lat: p.coords.latitude, lon: p.coords.longitude }),
      () => resolve(null), { enableHighAccuracy: true, timeout: 8000, maximumAge: 60000 });
  });
}

/* ---------- Supabase ---------- */
const sbHeaders = () => ({ 'Content-Type': 'application/json', apikey: CONFIG.supabaseAnonKey, Authorization: `Bearer ${CONFIG.supabaseAnonKey}` });
const isLive = () => CONFIG.dataSource === 'live' && CONFIG.supabaseUrl && CONFIG.supabaseAnonKey;

async function loadStores(pos) {
  let stores;
  if (isLive()) {
    // Hent ALLE aktive butikker (hele Norge) — kartet skal kunne vise alt.
    const res = await fetch(`${CONFIG.supabaseUrl}/rest/v1/rpc/all_stores`, {
      method: 'POST', headers: sbHeaders(), body: '{}',
    });
    if (!res.ok) throw new Error(`Supabase ${res.status}`);
    stores = await res.json();
  } else {
    stores = (await (await fetch('./data/snapshot.json')).json()).stores;
  }
  for (const s of stores) s.distance_m = Math.round(haversine(pos, { lat: s.latitude, lon: s.longitude }));
  stores.sort((a, b) => a.distance_m - b.distance_m);
  return stores;
}
async function fetchOffers(storeId) {
  if (!isLive()) return [];
  try {
    const res = await fetch(`${CONFIG.supabaseUrl}/rest/v1/rpc/store_offers`, {
      method: 'POST', headers: sbHeaders(), body: JSON.stringify({ p_store_id: storeId }),
    });
    return res.ok ? await res.json() : [];
  } catch { return []; }
}
async function submitReport(placeId, type, hours, comment) {
  const res = await fetch(`${CONFIG.supabaseUrl}/rest/v1/rpc/report_opening_hours`, {
    method: 'POST', headers: sbHeaders(),
    body: JSON.stringify({ p_place_id: placeId, p_type: type, p_hours: hours || null, p_comment: comment || null }),
  });
  if (!res.ok) throw new Error((await res.text()) || `Feil ${res.status}`);
  return true;
}

/* ---------- filtrering ---------- */
function filtered() {
  const now = new Date();
  if (state.filter === 'open') return state.stores.filter((s) => evaluate(s.opening_hours, now).state === 'OPEN');
  if (state.filter === 'sunday') { const t = targetSunday(now); return state.stores.filter((s) => isOpenAt(s.opening_hours, t)); }
  if (state.filter === 'offers') return state.stores.filter((s) => s.offer_count > 0);
  return state.stores;
}

/* ---------- liste ---------- */
const CHEVRON = '<svg class="chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4"><path d="m9 6 6 6-6 6"/></svg>';
function card(s) {
  const r = evaluate(s.opening_hours, new Date());
  const el = document.createElement('button');
  el.className = 'card'; el.setAttribute('data-state', r.state);
  const name = s.name || s.brand || 'Ukjent butikk';
  const offers = s.offer_count > 0 ? `<span class="badge badge--accent">Se ${s.offer_count} tilbud</span>` : '';
  el.innerHTML = `
    <span class="avatar">${logoAvatar(s.chain || name)}<i class="status-dot"></i></span>
    <span class="card-body">
      <span class="card-name">${escapeHtml(name)}</span>
      <span class="card-status"><i class="dot"></i>${escapeHtml(r.label)}</span>
      <span class="card-meta"><span class="travel">${travelText(s.distance_m)}</span>${offers}</span>
    </span>${CHEVRON}`;
  el.addEventListener('click', () => openDetail(s.id));
  return el;
}
function skeletons(n = 6) {
  const frag = document.createDocumentFragment();
  for (let i = 0; i < n; i++) {
    const el = document.createElement('div');
    el.className = 'card skeleton';
    el.innerHTML = `<span class="avatar"></span><span class="card-body"><span class="sk-line w1"></span><span class="sk-line w2"></span></span>`;
    frag.appendChild(el);
  }
  return frag;
}
function renderList() {
  const list = $('#list'); list.innerHTML = '';
  const rows = filtered();
  $('#count').textContent = rows.length;
  $('#sunday-hint').textContent = state.filter === 'sunday' ? state.sundayInfo : '';
  if (!rows.length) {
    list.innerHTML = `<div class="empty"><div class="em-ic">🛒</div>Ingen butikker her akkurat nå.</div>`;
    return;
  }
  const frag = document.createDocumentFragment();
  for (const s of rows.slice(0, 80)) frag.appendChild(card(s));
  list.appendChild(frag);
}

/* ---------- detalj ---------- */
async function openDetail(id) {
  const s = state.stores.find((x) => x.id === id); if (!s) return;
  state.current = s;
  const r = evaluate(s.opening_hours, new Date());
  const name = s.name || s.brand || 'Ukjent butikk';
  const hours = prettify(s.opening_hours);
  $('#detail-body').innerHTML = `
    <div class="detail-head">
      <span class="avatar lg">${logoAvatar(s.chain || name)}</span>
      <div><h2>${escapeHtml(name)}</h2><div class="brandline">${escapeHtml(s.chain || 'Uavhengig')} · ${shopLabel(s.shop_type)}</div></div>
    </div>
    <div class="status-pill" data-state="${r.state}"><i class="dot"></i>${escapeHtml(r.label)}</div>
    <div class="travel-row">${travelText(s.distance_m)}</div>
    <dl class="facts">
      <div class="fact"><dt>Åpningstider</dt><dd>${hours ? escapeHtml(hours) : 'Ukjent'}</dd></div>
      ${s.phone ? `<div class="fact"><dt>Telefon</dt><dd><a href="tel:${escapeAttr(s.phone)}">${escapeHtml(s.phone)}</a></dd></div>` : ''}
      ${s.website ? `<div class="fact"><dt>Nettside</dt><dd><a href="${escapeAttr(s.website)}" target="_blank" rel="noopener">Åpne</a></dd></div>` : ''}
    </dl>
    <button id="directions" class="btn btn--primary">
      <svg viewBox="0 0 24 24" width="19" height="19" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M12 2 3 22l9-4 9 4z"/></svg>
      Veibeskrivelse (${TRAVEL[state.travel].word})
    </button>
    <section class="offers"><h3>Ukens tilbud</h3><div id="offers-list" class="offers-loading">Laster …</div></section>
    <button id="report-btn" class="btn btn--outline">Rapporter feil åpningstid</button>`;
  $('#directions').addEventListener('click', () => {
    const from = state.pos ? `saddr=${state.pos.lat},${state.pos.lon}&` : '';
    window.open(`https://maps.apple.com/?${from}daddr=${s.latitude},${s.longitude}&dirflg=${TRAVEL[state.travel].dirflg}`, '_blank');
  });
  $('#report-btn').addEventListener('click', () => openReport(s));
  openOverlay('detail');
  if (window.__map && window.__annos?.[s.id]) window.__map.setCenterAnimated(window.__annos[s.id].coordinate);

  const offers = await fetchOffers(s.id);
  const box = $('#offers-list'); if (!box) return;
  if (!offers.length) { box.className = 'offers-empty'; box.textContent = 'Ingen registrerte tilbud akkurat nå.'; return; }
  box.className = 'offers-grid';
  box.innerHTML = offers.slice(0, 30).map((o) => `
    <div class="offer">
      ${o.image_url ? `<img class="offer-img" src="${escapeAttr(o.image_url)}" alt="" loading="lazy">` : '<div class="offer-img"></div>'}
      <div class="offer-main">
        <div class="offer-name">${escapeHtml(o.product_name)}</div>
        ${o.description ? `<div class="offer-desc">${escapeHtml(o.description)}</div>` : ''}
        ${o.unit_price ? `<div class="offer-unit">${escapeHtml(o.unit_price)}</div>` : ''}
      </div>
      <div class="offer-price">
        ${o.previous_price ? `<span class="prev">${fmtKr(o.previous_price)}</span>` : ''}
        <span class="cur">${o.current_price != null ? fmtKr(o.current_price) : ''}</span>
      </div>
    </div>`).join('');
}
function closeDetail() { closeOverlay('detail'); }

/* ---------- rapport ---------- */
const REPORT_OPTIONS = [
  ['open_but_shown_closed', 'Butikken er åpen, men appen sier stengt'],
  ['closed_but_shown_open', 'Butikken er stengt, men appen sier åpen'],
  ['wrong_hours', 'Feil åpningstid'],
  ['permanently_closed', 'Butikken er permanent stengt'],
  ['other', 'Annet'],
];
function openReport(s) {
  $('#report-body').innerHTML = `
    <p class="report-store">${escapeHtml(s.name || s.brand || 'butikk')}</p>
    <div class="report-options">${REPORT_OPTIONS.map(([v, label], i) => `
      <label class="report-opt"><input type="radio" name="rtype" value="${v}" ${i === 0 ? 'checked' : ''}><span>${escapeHtml(label)}</span></label>`).join('')}</div>
    <div id="hours-field" class="report-field" hidden>
      <label>Riktig åpningstid (valgfritt)</label>
      <input id="r-hours" type="text" placeholder="f.eks. Mo-Su 09:00-21:00" autocomplete="off">
    </div>
    <div class="report-field"><label>Kommentar (valgfritt)</label><textarea id="r-comment" rows="2" placeholder="Noe mer vi bør vite?"></textarea></div>
    <button id="r-submit" class="btn btn--primary">Send rapport</button>
    <p id="r-msg" class="report-msg"></p>`;
  const hoursField = $('#hours-field');
  document.querySelectorAll('input[name="rtype"]').forEach((r) => r.addEventListener('change', () => {
    hoursField.hidden = document.querySelector('input[name="rtype"]:checked').value !== 'wrong_hours';
  }));
  $('#r-submit').addEventListener('click', () => sendReport(s.id));
  openOverlay('report');
}
function closeReport() { closeOverlay('report'); }
async function sendReport(placeId) {
  const btn = $('#r-submit');
  const type = document.querySelector('input[name="rtype"]:checked')?.value;
  const hours = $('#r-hours') && !$('#hours-field').hidden ? $('#r-hours').value.trim() : '';
  const comment = $('#r-comment') ? $('#r-comment').value.trim() : '';
  const key = `report:${placeId}`, last = Number(lsGet(key) || 0), now = Date.now();
  if (now - last < 6e5) { toast('Du har nettopp rapportert denne butikken. Takk!'); closeReport(); return; }
  const orig = btn.textContent; btn.disabled = true; btn.textContent = 'Sender …';
  try {
    await submitReport(placeId, type, hours, comment);
    lsSet(key, String(now));
    toast('Takk! Rapporten er sendt og blir gjennomgått.', 'ok');
    closeReport();
  } catch (e) { btn.disabled = false; btn.textContent = orig; toast('Kunne ikke sende: ' + e.message, 'err'); }
}

/* ---------- MapKit ---------- */
function regionFor(pos, span = 0.11) { return new mapkit.CoordinateRegion(new mapkit.Coordinate(pos.lat, pos.lon), new mapkit.CoordinateSpan(span, span)); }

function pinElement(store, r) {
  const el = document.createElement('div');
  el.className = 'pin'; el.dataset.state = r.state;
  el.innerHTML = `<div class="pin-body"><div class="pin-badge">${logoSVG(store.chain || store.name)}</div></div>`;
  el.addEventListener('click', () => openDetail(store.id));
  return el;
}
function drawAnnotations() {
  const map = window.__map; if (!map) return;
  if (window.__annoList && window.__annoList.length) map.removeAnnotations(window.__annoList);
  window.__annoList = []; window.__annos = {};
  const now = new Date();
  // Tegn alle butikker i utvalget — MapKit klynger tette områder automatisk.
  for (const s of filtered().slice(0, 5000)) {
    const r = evaluate(s.opening_hours, now);
    const a = new mapkit.Annotation(new mapkit.Coordinate(s.latitude, s.longitude),
      () => pinElement(s, r),
      { anchorOffset: new DOMPoint(0, -20), clusteringIdentifier: 'stores', collisionMode: mapkit.Annotation.CollisionMode.Circle });
    window.__annos[s.id] = a; window.__annoList.push(a);
  }
  map.addAnnotations(window.__annoList);
}
function clusterFactory(ca) {
  return new mapkit.Annotation(ca.coordinate, () => {
    const d = document.createElement('div'); d.className = 'cluster'; d.textContent = ca.memberAnnotations.length;
    d.addEventListener('click', () => window.__map && window.__map.setRegionAnimated(regionFor({ lat: ca.coordinate.latitude, lon: ca.coordinate.longitude }, 0.035)));
    return d;
  }, { anchorOffset: new DOMPoint(0, 0) });
}
function updateMapPadding() {
  if (!window.__map || !window.mapkit) return;
  const sh = $('#sheet').getBoundingClientRect().height;
  try { window.__map.padding = new mapkit.Padding({ top: 104, right: 8, bottom: Math.min(sh, innerHeight * 0.62), left: 8 }); } catch {}
}
function recenterMap() { if (window.__map) window.__map.setRegionAnimated(regionFor(state.pos)); }

async function initMap(pos) {
  if (!CONFIG.mapkitTokenUrl) { $('#map').hidden = true; $('#map-fallback').hidden = false; return; }
  await loadScript('https://cdn.apple-mapkit.com/mk/5.x.x/mapkit.js');
  mapkit.init({ authorizationCallback: (done) => fetch(CONFIG.mapkitTokenUrl).then((r) => r.text()).then(done) });
  mapkit.addEventListener('error', (e) => console.error('MapKit error:', e));
  const map = new mapkit.Map('map', {
    center: new mapkit.Coordinate(pos.lat, pos.lon), showsUserLocation: true, showsUserLocationControl: false,
    showsCompass: mapkit.FeatureVisibility.Hidden,
    colorScheme: matchMedia('(prefers-color-scheme: dark)').matches ? mapkit.Map.ColorSchemes.Dark : mapkit.Map.ColorSchemes.Light,
  });
  map.region = regionFor(pos);
  map.annotationForCluster = clusterFactory;
  window.__map = map; window.__annos = {}; window.__annoList = [];
  drawAnnotations();
  updateMapPadding();
}
function loadScript(src) { return new Promise((res, rej) => { const s = document.createElement('script'); s.src = src; s.crossOrigin = 'anonymous'; s.onload = res; s.onerror = rej; document.head.appendChild(s); }); }

/* ---------- bunnark (dra + snap) ---------- */
function initSheet() {
  const sheet = $('#sheet'), grab = $('#sheet-grab');
  const heights = () => ({ peek: 132, mid: Math.round(innerHeight * 0.52), full: Math.round(innerHeight * 0.92) });
  function setH(px, animate) {
    sheet.style.transition = animate ? '' : 'none';
    sheet.style.height = px + 'px';
    document.documentElement.style.setProperty('--sheet-h', px + 'px');
  }
  const scrim = $('#sheet-scrim');
  function snapTo(name) {
    sheet.dataset.snap = name; setH(heights()[name], true);
    if (scrim) { // dim kartet når arket er helt oppe
      const show = name === 'full';
      if (show) { scrim.hidden = false; requestAnimationFrame(() => scrim.classList.add('show')); }
      else { scrim.classList.remove('show'); setTimeout(() => { if (!scrim.classList.contains('show')) scrim.hidden = true; }, 320); }
    }
    requestAnimationFrame(updateMapPadding); setTimeout(updateMapPadding, 320);
  }
  window.__snapTo = snapTo;
  if (scrim) scrim.addEventListener('click', () => snapTo('mid'));
  snapTo('mid');
  let dragging = false, startY = 0, startH = 0, moved = false;
  grab.addEventListener('pointerdown', (e) => { dragging = true; moved = false; startY = e.clientY; startH = sheet.getBoundingClientRect().height; grab.setPointerCapture(e.pointerId); sheet.style.transition = 'none'; });
  grab.addEventListener('pointermove', (e) => { if (!dragging) return; const dy = startY - e.clientY; if (Math.abs(dy) > 4) moved = true; setH(Math.max(110, Math.min(heights().full, startH + dy)), false); updateMapPadding(); });
  const end = () => { if (!dragging) return; dragging = false;
    if (!moved) { snapTo(sheet.dataset.snap === 'full' ? 'mid' : 'full'); return; }
    const h = sheet.getBoundingClientRect().height, s = heights();
    snapTo(Object.entries(s).sort((a, b) => Math.abs(a[1] - h) - Math.abs(b[1] - h))[0][0]); };
  grab.addEventListener('pointerup', end); grab.addEventListener('pointercancel', end);
}

/* ---------- utils ---------- */
function escapeHtml(s) { return String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }
function escapeAttr(s) { return escapeHtml(s).replace(/'/g, '&#39;'); }

/* ---------- overlays (dialog: fokusfelle, Esc, retur-fokus) ---------- */
const __focusStack = [];
const focusables = (root) => [...root.querySelectorAll('button,[href],input,textarea,select,[tabindex]:not([tabindex="-1"])')].filter((x) => !x.disabled && x.offsetParent !== null);
function openOverlay(id) {
  const el = $('#' + id); if (!el) return;
  __focusStack.push(document.activeElement);
  el.classList.add('open'); document.body.classList.add('overlay-open');
  const sheet = el.querySelector('.sheet');
  setTimeout(() => (sheet.querySelector('.sheet-close') || sheet).focus({ preventScroll: true }), 0);
  el.__keyh = (e) => {
    if (e.key === 'Escape') { e.preventDefault(); closeOverlay(id); return; }
    if (e.key !== 'Tab') return;
    const f = focusables(sheet); if (!f.length) return;
    const first = f[0], last = f[f.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  };
  el.addEventListener('keydown', el.__keyh);
}
function closeOverlay(id) {
  const el = $('#' + id); if (!el || !el.classList.contains('open')) return;
  el.classList.remove('open');
  if (el.__keyh) { el.removeEventListener('keydown', el.__keyh); el.__keyh = null; }
  if (!$('#detail').classList.contains('open') && !$('#report').classList.contains('open')) document.body.classList.remove('overlay-open');
  const prev = __focusStack.pop();
  if (prev && prev.focus) prev.focus({ preventScroll: true });
}

/* ---------- toast ---------- */
function toast(message, type) {
  const wrap = $('#toasts'); if (!wrap) return;
  const t = document.createElement('div');
  t.className = 'toast' + (type ? ' toast--' + type : '');
  t.setAttribute('role', type === 'err' ? 'alert' : 'status');
  t.textContent = message;
  wrap.appendChild(t);
  requestAnimationFrame(() => t.classList.add('show'));
  setTimeout(() => { t.classList.remove('show'); setTimeout(() => t.remove(), 300); }, type === 'err' ? 4200 : 2600);
}

function setFilter(f) {
  state.filter = (state.filter === f) ? null : f; // tap aktiv chip => vis alle
  document.querySelectorAll('.chip.filter').forEach((c) => {
    const on = c.dataset.filter === state.filter;
    c.classList.toggle('active', on); c.setAttribute('aria-pressed', String(on));
  });
  renderList(); if (window.__map) drawAnnotations();
}
function setTravel(mode) {
  state.travel = mode; lsSet('travel', mode);
  document.querySelectorAll('.chip.tmode').forEach((b) => {
    const on = b.dataset.mode === mode;
    b.classList.toggle('active', on); b.setAttribute('aria-pressed', String(on));
  });
  renderList();
}
function setLoc(text) { $('#loc').textContent = text; }

/* ---------- boot ---------- */
async function loadAndRender() {
  try { state.stores = await loadStores(state.pos); }
  catch (e) {
    const offline = (typeof navigator !== 'undefined' && navigator.onLine === false);
    $('#list').innerHTML = `<div class="empty"><div class="em-ic">${offline ? '📡' : '⚠️'}</div>`
      + `<p>${offline ? 'Ingen nettforbindelse.' : 'Kunne ikke laste butikker.'}</p>`
      + `<p class="empty-sub">${escapeHtml(e.message)}</p>`
      + `<button class="btn btn--outline" id="retry-load">Prøv igjen</button></div>`;
    $('#retry-load')?.addEventListener('click', async () => {
      $('#list').innerHTML = ''; $('#list').appendChild(skeletons());
      await loadAndRender();
    });
    return;
  }
  renderList(); if (window.__map) drawAnnotations();
}
async function useMyPosition() {
  setLoc('Finner posisjon …');
  const geo = await getPosition();
  if (geo) {
    state.pos = geo; state.usingFallback = false; setLoc('Din posisjon');
    $('#list').innerHTML = ''; $('#list').appendChild(skeletons());
    await loadAndRender(); recenterMap();
  } else { state.usingFallback = true; setLoc('Oslo sentrum · trykk her'); }
}

async function main() {
  await installNativeGeo();
  document.querySelectorAll('.chip.filter').forEach((c) => c.addEventListener('click', () => setFilter(c.dataset.filter)));
  document.querySelectorAll('.chip.tmode').forEach((b) => b.addEventListener('click', () => setTravel(b.dataset.mode)));
  $('#detail-backdrop').addEventListener('click', closeDetail);
  $('#detail .grabber').addEventListener('click', closeDetail);
  $('#report-backdrop').addEventListener('click', closeReport);
  $('#report-grabber').addEventListener('click', closeReport);
  document.querySelectorAll('.sheet-close').forEach((b) => b.addEventListener('click', () => closeOverlay(b.dataset.close)));
  $('#recenter').addEventListener('click', () => { state.usingFallback ? useMyPosition() : recenterMap(); });

  initSheet();
  setTravel(state.travel);
  document.querySelectorAll('.chip.filter').forEach((c) => {
    const on = c.dataset.filter === state.filter;
    c.classList.toggle('active', on); c.setAttribute('aria-pressed', String(on));
  });
  state.sundayInfo = `· åpne ${new Intl.DateTimeFormat('nb-NO', { weekday: 'long', day: 'numeric', month: 'long' }).format(targetSunday(new Date()))}`;

  setLoc('Finner posisjon …');
  $('#list').appendChild(skeletons());
  const geo = await getPosition();
  state.pos = geo || CONFIG.defaultCenter; state.usingFallback = !geo;
  setLoc(geo ? 'Din posisjon' : 'Oslo sentrum · trykk her');

  await loadAndRender();
  initMap(state.pos).catch((e) => { console.warn('Kart utilgjengelig:', e); $('#map').hidden = true; $('#map-fallback').hidden = false; });
}
main();
