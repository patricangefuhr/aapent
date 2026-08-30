import { evaluate, isOpenAt, targetSunday, prettify } from './lib/oh-browser.mjs';

const CONFIG = window.APP_CONFIG;
const $ = (s, r = document) => r.querySelector(s);
const FILTERS = ['all', 'open', 'sunday'];
const store = (k, v) => { try { v === undefined ? localStorage.getItem(k) : localStorage.setItem(k, v); } catch {} return (() => { try { return localStorage.getItem(k); } catch { return null; } })(); };

const state = {
  pos: null, stores: [], filter: 'sunday', sundayInfo: '', usingFallback: false,
  travel: (() => { try { return localStorage.getItem('travel') || 'walk'; } catch { return 'walk'; } })(),
  current: null,
};

/* ---------- kjede-identitet ---------- */
const CHAIN_COLORS = {
  'KIWI': '#00A650', 'REMA 1000': '#00539F', 'MENY': '#A6192E',
  'Coop Extra': '#009A44', 'Coop Prix': '#009A44', 'Coop Mega': '#009A44',
  'Coop Marked': '#009A44', 'Coop Obs': '#E4002B', 'Coop': '#009A44',
  'Joker': '#E30613', 'SPAR': '#D52B1E', 'EUROSPAR': '#00843D',
  'Bunnpris': '#B8232F', 'Nærbutikken': '#2F8F3E', 'Matkroken': '#2E9E8F',
};
const DEFAULT_CHAIN = '#647587';
const chainColor = (c) => CHAIN_COLORS[c] || DEFAULT_CHAIN;
const initial = (s) => (s || '?').trim().charAt(0).toUpperCase();
const shopLabel = (t) => t === 'supermarket' ? 'Supermarked' : 'Dagligvare / nærbutikk';

/* ---------- reise (gå/kjør) ---------- */
const TRAVEL = {
  walk: { icon: '🚶', mpm: 80, dirflg: 'w', word: 'gange' },   // ~4,8 km/t
  drive: { icon: '🚗', mpm: 450, dirflg: 'd', word: 'kjøring' }, // ~27 km/t urbant
};
function travelText(dist_m, mode = state.travel) {
  const t = TRAVEL[mode];
  const min = Math.max(1, Math.round(dist_m / t.mpm));
  return `${t.icon} ${min} min · ${fmtDist(dist_m)}`;
}

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
    const res = await fetch(`${CONFIG.supabaseUrl}/rest/v1/rpc/nearby_stores`, {
      method: 'POST', headers: sbHeaders(),
      body: JSON.stringify({ lat: pos.lat, lon: pos.lon, radius_m: CONFIG.radiusMeters }),
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

/* ---------- render: liste ---------- */
function filtered() {
  const now = new Date();
  if (state.filter === 'open') return state.stores.filter((s) => evaluate(s.opening_hours, now).state === 'OPEN');
  if (state.filter === 'sunday') { const t = targetSunday(now); return state.stores.filter((s) => isOpenAt(s.opening_hours, t)); }
  return state.stores;
}

const CHEVRON = '<svg class="chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4"><path d="m9 6 6 6-6 6"/></svg>';

function card(s) {
  const r = evaluate(s.opening_hours, new Date());
  const el = document.createElement('button');
  el.className = 'card';
  el.setAttribute('data-state', r.state);
  const name = s.name || s.brand || 'Ukjent butikk';
  const offers = s.offer_count > 0
    ? `<span class="offers-pill">Se ${s.offer_count} tilbud</span>` : '';
  el.innerHTML = `
    <span class="avatar" style="--chain:${chainColor(s.chain)}">${initial(s.chain || name)}<i class="status-dot"></i></span>
    <span class="card-body">
      <span class="card-name">${escapeHtml(name)}</span>
      <span class="card-status"><i class="dot"></i>${escapeHtml(r.label)}</span>
      <span class="card-meta"><span class="travel">${travelText(s.distance_m)}</span>${offers}</span>
    </span>
    ${CHEVRON}`;
  el.addEventListener('click', () => openDetail(s.id));
  return el;
}

function skeletons(n = 7) {
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
    list.innerHTML = `<div class="empty"><div class="em-ic">🛒</div>Ingen butikker matcher dette filteret i nærheten.</div>`;
    return;
  }
  const frag = document.createDocumentFragment();
  for (const s of rows.slice(0, 80)) frag.appendChild(card(s));
  list.appendChild(frag);
}

/* ---------- render: detalj ---------- */
async function openDetail(id) {
  const s = state.stores.find((x) => x.id === id); if (!s) return;
  state.current = s;
  const r = evaluate(s.opening_hours, new Date());
  const name = s.name || s.brand || 'Ukjent butikk';
  const hours = prettify(s.opening_hours);
  const body = $('#detail-body');
  body.innerHTML = `
    <div class="detail-head">
      <span class="avatar lg" style="--chain:${chainColor(s.chain)}">${initial(s.chain || name)}</span>
      <div><h2>${escapeHtml(name)}</h2><div class="brandline">${escapeHtml(s.chain || 'Uavhengig')} · ${shopLabel(s.shop_type)}</div></div>
    </div>
    <div class="status-pill" data-state="${r.state}"><i class="dot"></i>${escapeHtml(r.label)}</div>
    <div class="travel-row">${travelText(s.distance_m)}</div>
    <dl class="facts">
      <div class="fact"><dt>Åpningstider</dt><dd>${hours ? escapeHtml(hours) : 'Ukjent'}</dd></div>
      ${s.phone ? `<div class="fact"><dt>Telefon</dt><dd><a href="tel:${escapeAttr(s.phone)}">${escapeHtml(s.phone)}</a></dd></div>` : ''}
      ${s.website ? `<div class="fact"><dt>Nettside</dt><dd><a href="${escapeAttr(s.website)}" target="_blank" rel="noopener">Åpne</a></dd></div>` : ''}
    </dl>
    <button id="directions" class="btn-primary">
      <svg viewBox="0 0 24 24" width="19" height="19" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M12 2 3 22l9-4 9 4z"/></svg>
      Veibeskrivelse (${TRAVEL[state.travel].word})
    </button>
    <section class="offers"><h3>Ukens tilbud</h3><div id="offers-list" class="offers-loading">Laster …</div></section>
    <button id="report-btn" class="btn-report">Rapporter feil åpningstid</button>`;
  $('#directions').addEventListener('click', () => {
    const from = state.pos ? `saddr=${state.pos.lat},${state.pos.lon}&` : '';
    window.open(`https://maps.apple.com/?${from}daddr=${s.latitude},${s.longitude}&dirflg=${TRAVEL[state.travel].dirflg}`, '_blank');
  });
  $('#report-btn').addEventListener('click', () => openReport(s));
  $('#detail').classList.add('open');
  if (window.__map && window.__annos?.[s.id]) window.__map.setCenterAnimated(window.__annos[s.id].coordinate);

  // Tilbud lastes asynkront
  const offers = await fetchOffers(s.id);
  const box = $('#offers-list'); if (!box) return;
  if (!offers.length) { box.className = 'offers-empty'; box.textContent = 'Ingen registrerte tilbud akkurat nå.'; return; }
  box.className = 'offers-grid';
  box.innerHTML = offers.slice(0, 30).map((o) => `
    <div class="offer">
      ${o.image_url ? `<img class="offer-img" src="${escapeAttr(o.image_url)}" alt="" loading="lazy">` : '<div class="offer-img ph"></div>'}
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
function closeDetail() { $('#detail').classList.remove('open'); }

/* ---------- render: rapport ---------- */
const REPORT_OPTIONS = [
  ['open_but_shown_closed', 'Butikken er åpen, men appen sier stengt'],
  ['closed_but_shown_open', 'Butikken er stengt, men appen sier åpen'],
  ['wrong_hours', 'Feil åpningstid'],
  ['permanently_closed', 'Butikken er permanent stengt'],
  ['other', 'Annet'],
];
function openReport(s) {
  const body = $('#report-body');
  body.innerHTML = `
    <p class="report-store">${escapeHtml(s.name || s.brand || 'butikk')}</p>
    <div class="report-options">
      ${REPORT_OPTIONS.map(([v, label], i) => `
        <label class="report-opt">
          <input type="radio" name="rtype" value="${v}" ${i === 0 ? 'checked' : ''}>
          <span>${escapeHtml(label)}</span>
        </label>`).join('')}
    </div>
    <div id="hours-field" class="report-field" hidden>
      <label>Riktig åpningstid (valgfritt)</label>
      <input id="r-hours" type="text" placeholder="f.eks. Mo-Su 09:00-21:00" autocomplete="off">
    </div>
    <div class="report-field">
      <label>Kommentar (valgfritt)</label>
      <textarea id="r-comment" rows="2" placeholder="Noe mer vi bør vite?"></textarea>
    </div>
    <button id="r-submit" class="btn-primary">Send rapport</button>
    <p id="r-msg" class="report-msg"></p>`;
  const hoursField = $('#hours-field');
  body.querySelectorAll('input[name="rtype"]').forEach((r) => r.addEventListener('change', () => {
    hoursField.hidden = body.querySelector('input[name="rtype"]:checked').value !== 'wrong_hours';
  }));
  $('#r-submit').addEventListener('click', () => sendReport(s.id));
  $('#report').classList.add('open');
}
function closeReport() { $('#report').classList.remove('open'); }

async function sendReport(placeId) {
  const btn = $('#r-submit'), msg = $('#r-msg');
  const type = document.querySelector('input[name="rtype"]:checked')?.value;
  const hours = $('#r-hours') && !$('#hours-field').hidden ? $('#r-hours').value.trim() : '';
  const comment = $('#r-comment') ? $('#r-comment').value.trim() : '';
  // klient-throttle: én rapport per butikk per 10 min på denne enheten
  const key = `report:${placeId}`, last = Number(store(key) || 0), now = Date.now();
  if (now - last < 10 * 60 * 1000) { msg.textContent = 'Du har nettopp rapportert denne butikken. Takk!'; return; }
  btn.disabled = true; msg.textContent = 'Sender …';
  try {
    await submitReport(placeId, type, hours, comment);
    store(key, String(now));
    msg.className = 'report-msg ok';
    msg.textContent = 'Takk! Rapporten er sendt inn og blir gjennomgått.';
    setTimeout(closeReport, 1400);
  } catch (e) {
    btn.disabled = false; msg.className = 'report-msg err';
    msg.textContent = 'Kunne ikke sende: ' + e.message;
  }
}

/* ---------- MapKit ---------- */
const MARKER_COL = { OPEN: '#1E9B55', CLOSED: '#CB4A3B', UNKNOWN: '#93A199', INVALID: '#93A199' };
function regionFor(pos) { return new mapkit.CoordinateRegion(new mapkit.Coordinate(pos.lat, pos.lon), new mapkit.CoordinateSpan(0.13, 0.13)); }

function drawAnnotations() {
  const map = window.__map; if (!map) return;
  const old = Object.values(window.__annos || {});
  if (old.length) map.removeAnnotations(old);
  window.__annos = {};
  const now = new Date();
  const rows = state.filter === 'all' ? state.stores : filtered();
  const toAdd = [];
  for (const s of rows.slice(0, 500)) {
    const r = evaluate(s.opening_hours, now);
    if (r.state === 'CLOSED') continue;
    const isOpen = r.state === 'OPEN';
    const a = new mapkit.MarkerAnnotation(new mapkit.Coordinate(s.latitude, s.longitude), {
      color: isOpen ? MARKER_COL.OPEN : MARKER_COL.UNKNOWN,
      glyphText: isOpen ? '✓' : '?', title: s.name || s.brand || '', subtitle: r.label,
      clusteringIdentifier: isOpen ? 'open' : 'unknown',
      displayPriority: isOpen ? 1000 : 250, collisionMode: mapkit.Annotation.CollisionMode.Circle,
    });
    a.addEventListener('select', () => openDetail(s.id));
    window.__annos[s.id] = a; toAdd.push(a);
  }
  map.addAnnotations(toAdd);
}
function clusterAnnotation(ca) {
  const isOpen = ca.clusteringIdentifier === 'open';
  const n = ca.memberAnnotations.length;
  return new mapkit.MarkerAnnotation(ca.coordinate, {
    color: isOpen ? MARKER_COL.OPEN : MARKER_COL.UNKNOWN, glyphText: String(n),
    title: `${n} ${isOpen ? 'åpne' : 'ukjente'} butikker`, displayPriority: isOpen ? 1000 : 250,
  });
}

async function initMap(pos) {
  if (!CONFIG.mapkitTokenUrl) { $('#map').classList.add('map-disabled'); return; }
  $('#map').classList.remove('map-disabled');
  await loadScript('https://cdn.apple-mapkit.com/mk/5.x.x/mapkit.js');
  mapkit.init({ authorizationCallback: (done) => fetch(CONFIG.mapkitTokenUrl).then((r) => r.text()).then(done) });
  mapkit.addEventListener('error', (e) => console.error('MapKit error:', e));
  const map = new mapkit.Map('map', {
    center: new mapkit.Coordinate(pos.lat, pos.lon), showsUserLocation: true,
    colorScheme: matchMedia('(prefers-color-scheme: dark)').matches ? mapkit.Map.ColorSchemes.Dark : mapkit.Map.ColorSchemes.Light,
  });
  map.region = regionFor(pos);
  map.annotationForCluster = clusterAnnotation;
  window.__map = map; window.__annos = {};
  drawAnnotations();
  $('#map-legend').hidden = false;
  const rc = $('#recenter'); rc.hidden = false;
  rc.addEventListener('click', () => map.setRegionAnimated(regionFor(state.pos)));
}
function recenterMap() { if (window.__map) window.__map.setRegionAnimated(regionFor(state.pos)); }
function loadScript(src) { return new Promise((res, rej) => { const s = document.createElement('script'); s.src = src; s.crossOrigin = 'anonymous'; s.onload = res; s.onerror = rej; document.head.appendChild(s); }); }

/* ---------- utils ---------- */
function escapeHtml(s) { return String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }
function escapeAttr(s) { return escapeHtml(s).replace(/'/g, '&#39;'); }

function setFilter(f) {
  state.filter = f;
  $('#segmented').style.setProperty('--seg', FILTERS.indexOf(f));
  document.querySelectorAll('.seg').forEach((c) => c.classList.toggle('active', c.dataset.filter === f));
  renderList();
  if (window.__map) drawAnnotations();
}
function setTravel(mode) {
  state.travel = mode; store('travel', mode);
  document.querySelectorAll('.tmode').forEach((b) => b.classList.toggle('active', b.dataset.mode === mode));
  renderList();
}
function setLoc(text, tappable) { $('#loc').textContent = text; $('#loc-pill').title = tappable ? 'Trykk for å bruke min posisjon' : ''; }

/* ---------- boot ---------- */
async function loadAndRender() {
  try { state.stores = await loadStores(state.pos); }
  catch (e) { $('#list').innerHTML = `<div class="empty"><div class="em-ic">⚠️</div>Kunne ikke laste butikker: ${escapeHtml(e.message)}</div>`; return; }
  renderList();
  if (window.__map) drawAnnotations();
}
async function useMyPosition() {
  setLoc('Finner posisjon …', false);
  const geo = await getPosition();
  if (geo) {
    state.pos = geo; state.usingFallback = false; setLoc('Din posisjon', false);
    $('#list').innerHTML = ''; $('#list').appendChild(skeletons());
    await loadAndRender(); recenterMap();
  } else { state.usingFallback = true; setLoc('Oslo sentrum · trykk for posisjon', true); }
}

async function main() {
  document.querySelectorAll('.seg').forEach((c) => c.addEventListener('click', () => setFilter(c.dataset.filter)));
  document.querySelectorAll('.tmode').forEach((b) => b.addEventListener('click', () => setTravel(b.dataset.mode)));
  $('#detail-backdrop').addEventListener('click', closeDetail);
  $('.grabber').addEventListener('click', closeDetail);
  $('#report-backdrop').addEventListener('click', closeReport);
  $('#report-grabber').addEventListener('click', closeReport);
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') { closeReport(); closeDetail(); } });
  $('#loc-pill').addEventListener('click', () => { if (state.usingFallback) useMyPosition(); });

  setTravel(state.travel); // synk toggle-UI

  const t = targetSunday(new Date());
  state.sundayInfo = `Åpne ${new Intl.DateTimeFormat('nb-NO', { weekday: 'long', day: 'numeric', month: 'long' }).format(t)}`;

  setLoc('Finner posisjon …', false);
  $('#list').appendChild(skeletons());
  const geo = await getPosition();
  state.pos = geo || CONFIG.defaultCenter; state.usingFallback = !geo;
  setLoc(geo ? 'Din posisjon' : 'Oslo sentrum · trykk for posisjon', !geo);

  await loadAndRender();
  initMap(state.pos).catch((e) => { console.warn('Kart utilgjengelig:', e); $('#map').classList.add('map-disabled'); });
}
main();
