"use strict";

// ---------------------------------------------------------------- constants

const DEFAULT_HOME = { name: "GLASGOW", lat: 55.8642, lon: -4.2518 };
const KM_PER_DEG_LAT = 111.32;

// home = the watched location (flights + rings anchor here);
// view = the camera centre, which eases toward home or a followed target
let home = { ...DEFAULT_HOME };
let view = { lat: home.lat, lon: home.lon };
let cosLat = Math.cos((home.lat * Math.PI) / 180);
{
  const p = new URLSearchParams(location.search);
  if (p.get("lat") && p.get("lon")) {
    home = { name: p.get("name") || "CUSTOM", lat: +p.get("lat"), lon: +p.get("lon") };
    view = { lat: home.lat, lon: home.lon };
    cosLat = Math.cos((home.lat * Math.PI) / 180);
  }
}

const FLIGHT_POLL_MS = 10000;
const FLIGHT_STALE_MS = 60000;
const SAT_SCAN_MS = 20000;      // full-catalogue coarse scan cadence
const SAT_SCAN_CHUNK = 900;     // satrecs propagated per frame during a scan
const TRAIL_MAX = 90;
const TRAIL_SAMPLE_MS = 900;

const AIR_COLORS = {
  heavy: "#45d6e6",
  light: "#8be07a",
  rotor: "#ffab40",
  mil:   "#ff6b6b",
  other: "#b0a8c0",
};
const SAT_COLORS = {
  station: "#ffd54f",
  gnss:    "#64b5f6",
  sci:     "#4db6ac",
  comms:   "#8e7cc3",
  other:   "#f06292",
};
const SAT_CLASS = {
  stations: "station",
  "gps-ops": "gnss",
  galileo: "gnss",
  weather: "sci",
  science: "sci",
  starlink: "comms",
  oneweb: "comms",
};

const CITIES = [
  ["GLASGOW", 55.8642, -4.2518], ["EDINBURGH", 55.9533, -3.1883], ["DUNDEE", 56.462, -2.9707],
  ["ABERDEEN", 57.1497, -2.0943], ["INVERNESS", 57.4778, -4.2247], ["BELFAST", 54.5973, -5.9301],
  ["NEWCASTLE", 54.9783, -1.6178], ["MANCHESTER", 53.4808, -2.2426], ["LIVERPOOL", 53.4084, -2.9916],
  ["LEEDS", 53.8008, -1.5491], ["BIRMINGHAM", 52.4862, -1.8904], ["CARDIFF", 51.4816, -3.1791],
  ["LONDON", 51.5074, -0.1278], ["DUBLIN", 53.3498, -6.2603], ["PARIS", 48.8566, 2.3522],
  ["AMSTERDAM", 52.3676, 4.9041], ["BRUSSELS", 50.8503, 4.3517], ["FRANKFURT", 50.1109, 8.6821],
  ["MUNICH", 48.1351, 11.582], ["BERLIN", 52.52, 13.405], ["ZURICH", 47.3769, 8.5417],
  ["GENEVA", 46.2044, 6.1432], ["VIENNA", 48.2082, 16.3738], ["PRAGUE", 50.0755, 14.4378],
  ["WARSAW", 52.2297, 21.0122], ["STOCKHOLM", 59.3293, 18.0686], ["OSLO", 59.9139, 10.7522],
  ["COPENHAGEN", 55.6761, 12.5683], ["HELSINKI", 60.1699, 24.9384], ["REYKJAVIK", 64.1466, -21.9426],
  ["MADRID", 40.4168, -3.7038], ["BARCELONA", 41.3851, 2.1734], ["LISBON", 38.7223, -9.1393],
  ["ROME", 41.9028, 12.4964], ["MILAN", 45.4642, 9.19], ["ATHENS", 37.9838, 23.7275],
  ["ISTANBUL", 41.0082, 28.9784], ["MOSCOW", 55.7558, 37.6173], ["DUBAI", 25.2048, 55.2708],
  ["DOHA", 25.2854, 51.531], ["RIYADH", 24.7136, 46.6753], ["TEL AVIV", 32.0853, 34.7818],
  ["CAIRO", 30.0444, 31.2357], ["LAGOS", 6.5244, 3.3792], ["NAIROBI", -1.2921, 36.8219],
  ["JOHANNESBURG", -26.2041, 28.0473], ["CAPE TOWN", -33.9249, 18.4241],
  ["DELHI", 28.6139, 77.209], ["MUMBAI", 19.076, 72.8777], ["BANGKOK", 13.7563, 100.5018],
  ["SINGAPORE", 1.3521, 103.8198], ["KUALA LUMPUR", 3.139, 101.6869], ["JAKARTA", -6.2088, 106.8456],
  ["MANILA", 14.5995, 120.9842], ["HONG KONG", 22.3193, 114.1694], ["TAIPEI", 25.033, 121.5654],
  ["SHANGHAI", 31.2304, 121.4737], ["BEIJING", 39.9042, 116.4074], ["SEOUL", 37.5665, 126.978],
  ["TOKYO", 35.6762, 139.6503], ["OSAKA", 34.6937, 135.5023],
  ["SYDNEY", -33.8688, 151.2093], ["MELBOURNE", -37.8136, 144.9631], ["BRISBANE", -27.4698, 153.0251],
  ["PERTH", -31.9505, 115.8605], ["AUCKLAND", -36.8485, 174.7633],
  ["NEW YORK", 40.7128, -74.006], ["BOSTON", 42.3601, -71.0589], ["PHILADELPHIA", 39.9526, -75.1652],
  ["WASHINGTON", 38.9072, -77.0369], ["ATLANTA", 33.749, -84.388], ["MIAMI", 25.7617, -80.1918],
  ["CHICAGO", 41.8781, -87.6298], ["DALLAS", 32.7767, -96.797], ["HOUSTON", 29.7604, -95.3698],
  ["DENVER", 39.7392, -104.9903], ["PHOENIX", 33.4484, -112.074], ["LAS VEGAS", 36.1699, -115.1398],
  ["LOS ANGELES", 34.0522, -118.2437], ["SAN FRANCISCO", 37.7749, -122.4194],
  ["SEATTLE", 47.6062, -122.3321], ["ANCHORAGE", 61.2181, -149.9003], ["HONOLULU", 21.3069, -157.8583],
  ["TORONTO", 43.6532, -79.3832], ["MONTREAL", 45.5017, -73.5673], ["CALGARY", 51.0447, -114.0719],
  ["VANCOUVER", 49.2827, -123.1207], ["MEXICO CITY", 19.4326, -99.1332],
  ["BOGOTA", 4.711, -74.0721], ["LIMA", -12.0464, -77.0428], ["SANTIAGO", -33.4489, -70.6693],
  ["BUENOS AIRES", -34.6037, -58.3816], ["SAO PAULO", -23.5505, -46.6333], ["RIO", -22.9068, -43.1729],
].map(([name, lat, lon]) => ({ name, lat, lon }));

// ---------------------------------------------------------------- view / canvas

const canvas = document.getElementById("sky");
const ctx = canvas.getContext("2d");
let W = 0, H = 0, DPR = 1;
let latSpan = 4.6; // degrees of latitude visible top-to-bottom

function resize() {
  DPR = window.devicePixelRatio || 1;
  W = window.innerWidth;
  H = window.innerHeight;
  canvas.width = W * DPR;
  canvas.height = H * DPR;
  canvas.style.width = W + "px";
  canvas.style.height = H + "px";
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
}
window.addEventListener("resize", resize);
resize();

function pxPerDegLat() { return H / latSpan; }
function project(lat, lon) {
  const k = pxPerDegLat();
  return [W / 2 + (lon - view.lon) * k * cosLat, H / 2 - (lat - view.lat) * k];
}
function viewBBox(padDeg = 0) {
  const lonHalf = (W / 2) / (pxPerDegLat() * cosLat);
  const latHalf = latSpan / 2;
  return {
    lonMin: view.lon - lonHalf - padDeg, lonMax: view.lon + lonHalf + padDeg,
    latMin: view.lat - latHalf - padDeg, latMax: view.lat + latHalf + padDeg,
  };
}

window.addEventListener("wheel", (e) => {
  latSpan = Math.min(9, Math.max(1.5, latSpan * (e.deltaY > 0 ? 1.12 : 0.89)));
}, { passive: true });

// ---------------------------------------------------------------- coastline

let coastLines = [];
function loadCoast() {
  fetch(`/api/coast?lat=${home.lat.toFixed(3)}&lon=${home.lon.toFixed(3)}`)
    .then((r) => r.json())
    .then((d) => { coastLines = d.lines || []; })
    .catch(() => {});
}
loadCoast();

// ---------------------------------------------------------------- flights

const aircraft = new Map(); // hex -> record
let flightStatus = "connecting…";
let flightFails = 0;
const CORR_MS = 2000;    // blend position corrections in over this long
const VECTOR_SEC = 60;   // speed vector projects this far ahead

function classifyAircraft(ac) {
  if ((ac.dbFlags || 0) & 1) return "mil";
  const cat = ac.category || "";
  if (cat === "A7") return "rotor";
  if (cat === "A1" || cat === "A2") return "light";
  if (cat === "A3" || cat === "A4" || cat === "A5" || cat === "A6") return "heavy";
  return "other";
}

async function pollFlights() {
  try {
    const r = await fetch(`/api/flights?lat=${home.lat.toFixed(4)}&lon=${home.lon.toFixed(4)}`);
    const data = await r.json();
    if (data.error) throw new Error(data.error);
    const now = Date.now();
    for (const ac of data.ac || []) {
      if (ac.lat == null || ac.lon == null) continue;
      const grounded = ac.alt_baro === "ground";
      let rec = aircraft.get(ac.hex);
      if (!rec) { rec = { trail: [], lastTrail: 0 }; aircraft.set(ac.hex, rec); }
      const shown = rec.fixTime ? aircraftPos(rec, now) : null;
      Object.assign(rec, {
        hex: ac.hex,
        callsign: (ac.flight || "").trim() || ac.r || ac.hex.toUpperCase(),
        type: ac.t || "?",
        fixLat: ac.lat, fixLon: ac.lon,
        fixTime: now - (ac.seen_pos || 0) * 1000,
        gs: ac.gs || 0,           // knots
        track: ac.track != null ? ac.track : ac.true_heading || 0,
        alt: grounded ? 0 : (typeof ac.alt_baro === "number" ? ac.alt_baro : null),
        grounded,
        vr: ac.baro_rate || 0,    // ft/min
        squawk: ac.squawk || "",
        cls: classifyAircraft(ac),
        seenAt: now,
      });
      // blend from previously shown position to the corrected track,
      // so fresh fixes don't snap the glyph (and zigzag the trail)
      if (shown) {
        rec.corrT = 0;
        const raw = aircraftPos(rec, now);
        rec.corrLat = shown.lat - raw.lat;
        rec.corrLon = shown.lon - raw.lon;
        rec.corrT = now;
      }
    }
    for (const [hex, rec] of aircraft) {
      if (now - rec.seenAt > FLIGHT_STALE_MS) aircraft.delete(hex);
    }
    flightFails = 0;
    flightStatus = "live";
  } catch (e) {
    if (++flightFails >= 3) flightStatus = "flight feed offline";
  }
}
pollFlights();
setInterval(pollFlights, FLIGHT_POLL_MS);

// dead-reckoned position at time t
function aircraftPos(rec, now) {
  const dt = Math.max(0, (now - rec.fixTime) / 1000);
  const km = rec.gs * 0.000514444 * dt;
  const rad = (rec.track * Math.PI) / 180;
  let lat = rec.fixLat + (km * Math.cos(rad)) / KM_PER_DEG_LAT;
  let lon = rec.fixLon + (km * Math.sin(rad)) / (KM_PER_DEG_LAT * cosLat);
  if (rec.corrT) {
    const k = Math.max(0, 1 - (now - rec.corrT) / CORR_MS);
    lat += rec.corrLat * k;
    lon += rec.corrLon * k;
  }
  return { lat, lon };
}

// ---------------------------------------------------------------- satellites

let satrecs = [];        // { name, group, cls, rec }
let satActive = new Map(); // idx -> { lat, lon, altKm, speed, trail, lastTrail, name, cls }
let scanCursor = -1;     // -1 = idle, otherwise index into satrecs
let scanFound = null;
let lastScanDone = 0;
let satStatus = "loading TLEs…";

fetch("/api/tles").then((r) => r.json()).then((list) => {
  if (list.error) throw new Error(list.error);
  satrecs = list.map((s) => ({
    name: s.name, group: s.group,
    cls: SAT_CLASS[s.group] || "other",
    rec: satellite.twoline2satrec(s.l1, s.l2),
  }));
  satStatus = `${satrecs.length} objects tracked`;
  scanCursor = 0; scanFound = new Set();
}).catch(() => { satStatus = "satellite feed offline"; });

function satGeodetic(rec, date, gmst) {
  const pv = satellite.propagate(rec, date);
  if (!pv.position) return null;
  const geo = satellite.eciToGeodetic(pv.position, gmst);
  const v = pv.velocity;
  return {
    lat: satellite.degreesLat(geo.latitude),
    lon: satellite.degreesLong(geo.longitude),
    altKm: geo.height,
    speed: v ? Math.hypot(v.x, v.y, v.z) : 0, // km/s
  };
}

// coarse scan: walk whole catalogue in chunks, collect sats near the view
function stepScan(date, gmst) {
  if (scanCursor < 0) {
    if (satrecs.length && Date.now() - lastScanDone > SAT_SCAN_MS) {
      scanCursor = 0; scanFound = new Set();
    }
    return;
  }
  const bb = viewBBox(latSpan * 0.6);
  const end = Math.min(scanCursor + SAT_SCAN_CHUNK, satrecs.length);
  for (let i = scanCursor; i < end; i++) {
    const g = satGeodetic(satrecs[i].rec, date, gmst);
    if (g && g.lat > bb.latMin && g.lat < bb.latMax && g.lon > bb.lonMin && g.lon < bb.lonMax) {
      scanFound.add(i);
    }
  }
  scanCursor = end;
  if (scanCursor >= satrecs.length) {
    for (const idx of satActive.keys()) {
      if (!scanFound.has(idx)) satActive.delete(idx);
    }
    for (const idx of scanFound) {
      if (!satActive.has(idx)) {
        const s = satrecs[idx];
        satActive.set(idx, { idx, name: s.name, cls: s.cls, trail: [], lastTrail: 0 });
      }
    }
    scanCursor = -1;
    lastScanDone = Date.now();
  }
}

function updateActiveSats(date, gmst, now) {
  for (const [idx, sat] of satActive) {
    const g = satGeodetic(satrecs[idx].rec, date, gmst);
    if (!g) { satActive.delete(idx); continue; }
    sat.lat = g.lat; sat.lon = g.lon; sat.altKm = g.altKm; sat.speed = g.speed;
    if (now - sat.lastTrail > TRAIL_SAMPLE_MS) {
      sat.trail.push({ lat: g.lat, lon: g.lon });
      if (sat.trail.length > TRAIL_MAX) sat.trail.shift();
      sat.lastTrail = now;
    }
  }
}

// ---------------------------------------------------------------- follow / location

let followed = null; // { kind: "air", hex } | { kind: "sat", idx }
const elFollow = document.getElementById("follow-line");
const elFollowName = document.getElementById("follow-name");

function followedTarget(now) {
  if (!followed) return null;
  if (followed.kind === "air") {
    const rec = aircraft.get(followed.hex);
    if (!rec) return null;
    return { name: rec.callsign, pos: aircraftPos(rec, now) };
  }
  const sat = satActive.get(followed.idx);
  if (!sat || sat.lat == null) return null;
  return { name: sat.name, pos: { lat: sat.lat, lon: sat.lon } };
}

function releaseFollow() {
  followed = null;
  elFollow.hidden = true;
}

canvas.addEventListener("click", () => {
  if (hovered) {
    followed = hovered.kind === "air"
      ? { kind: "air", hex: hovered.obj.hex }
      : { kind: "sat", idx: hovered.obj.idx };
  } else {
    releaseFollow();
  }
});
elFollow.addEventListener("click", releaseFollow);
window.addEventListener("keydown", (e) => { if (e.key === "Escape") releaseFollow(); });

const elLoc = document.getElementById("loc");
const elLocInput = document.getElementById("loc-input");
let searching = false;

elLoc.addEventListener("click", () => {
  elLocInput.hidden = false;
  elLocInput.value = "";
  elLocInput.placeholder = "city or place…";
  elLocInput.focus();
});
elLocInput.addEventListener("blur", () => { elLocInput.hidden = true; });
elLocInput.addEventListener("keydown", async (e) => {
  e.stopPropagation(); // keep Escape from releasing follow
  if (e.key === "Escape") { elLocInput.hidden = true; return; }
  if (e.key !== "Enter" || searching) return;
  const q = elLocInput.value.trim();
  if (!q) return;
  searching = true;
  elLocInput.placeholder = "searching…";
  try {
    const res = await (await fetch(`/api/geocode?q=${encodeURIComponent(q)}`)).json();
    if (res.error || res.lat == null) throw new Error(res.error);
    setHome(res.name, res.lat, res.lon);
    elLocInput.hidden = true;
  } catch {
    elLocInput.value = "";
    elLocInput.placeholder = "not found — try again";
    elLocInput.focus();
  } finally {
    searching = false;
  }
});
updateLocLabel();

function setHome(name, lat, lon) {
  home = { name, lat, lon };
  view = { lat, lon };
  cosLat = Math.cos((lat * Math.PI) / 180);
  releaseFollow();
  aircraft.clear();
  satActive.clear();
  scanCursor = 0; scanFound = new Set(); lastScanDone = 0;
  coastLines = [];
  loadCoast();
  pollFlights();
  updateLocLabel();
  history.replaceState(null, "", `?name=${encodeURIComponent(name)}&lat=${lat.toFixed(4)}&lon=${lon.toFixed(4)}`);
}

function updateLocLabel() {
  const latS = `${Math.abs(home.lat).toFixed(3)}°${home.lat >= 0 ? "N" : "S"}`;
  const lonS = `${Math.abs(home.lon).toFixed(3)}°${home.lon >= 0 ? "E" : "W"}`;
  elLoc.textContent = `${home.name} · ${latS} ${lonS}`;
}

// ---------------------------------------------------------------- hover / info card

const mouse = { x: -1e4, y: -1e4 };
let hovered = null; // { kind, ... }
window.addEventListener("mousemove", (e) => { mouse.x = e.clientX; mouse.y = e.clientY; });

const infoCard = document.getElementById("info-card");
function fmtInt(n) { return Math.round(n).toLocaleString("en-GB"); }

function renderInfoCard() {
  if (!hovered) { infoCard.hidden = true; return; }
  let html = "";
  if (hovered.kind === "air") {
    const a = hovered.obj;
    html = `<div class="ic-name" style="color:${AIR_COLORS[a.cls]}">${a.callsign}</div>
      <div class="ic-row"><b>type</b>${a.type}</div>
      <div class="ic-row"><b>altitude</b>${a.grounded ? "on ground" : a.alt != null ? fmtInt(a.alt) + " ft" : "—"}</div>
      <div class="ic-row"><b>speed</b>${fmtInt(a.gs)} kt</div>
      <div class="ic-row"><b>v/s</b>${a.vr > 0 ? "+" : ""}${fmtInt(a.vr)} ft/min</div>
      ${a.squawk ? `<div class="ic-row"><b>squawk</b>${a.squawk}</div>` : ""}`;
  } else {
    const s = hovered.obj;
    html = `<div class="ic-name" style="color:${SAT_COLORS[s.cls]}">${s.name}</div>
      <div class="ic-row"><b>altitude</b>${fmtInt(s.altKm)} km</div>
      <div class="ic-row"><b>velocity</b>${s.speed.toFixed(2)} km/s</div>
      <div class="ic-row"><b>class</b>${s.cls}</div>`;
  }
  infoCard.innerHTML = html;
  infoCard.hidden = false;
  const pad = 14;
  infoCard.style.left = Math.min(mouse.x + pad, W - 280) + "px";
  infoCard.style.top = Math.min(mouse.y + pad, H - 140) + "px";
}

// ---------------------------------------------------------------- drawing

function drawTrail(trail, headX, headY, color, alphaScale = 1) {
  if (trail.length < 2) return;
  ctx.lineWidth = 1;
  for (let i = 1; i < trail.length; i++) {
    const [x1, y1] = project(trail[i - 1].lat, trail[i - 1].lon);
    const [x2, y2] = project(trail[i].lat, trail[i].lon);
    ctx.globalAlpha = alphaScale * 0.5 * (i / trail.length);
    ctx.strokeStyle = color;
    ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
  }
  // connect last sample to live position
  const last = trail[trail.length - 1];
  const [x1, y1] = project(last.lat, last.lon);
  ctx.globalAlpha = alphaScale * 0.5;
  ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(headX, headY); ctx.stroke();
  ctx.globalAlpha = 1;
}

// in follow mode, everything except the followed craft fades back
const DIM_ALPHA = 0.35;
function craftAlpha(kind, rec) {
  if (!followed) return 1;
  if (kind === "air" && followed.kind === "air" && followed.hex === rec.hex) return 1;
  if (kind === "sat" && followed.kind === "sat" && followed.idx === rec.idx) return 1;
  return DIM_ALPHA;
}

function drawBase() {
  // water background
  ctx.fillStyle = "#0d1f35";
  ctx.fillRect(0, 0, W, H);

  // graticule
  const bb = viewBBox();
  ctx.strokeStyle = "rgba(93,107,133,0.12)";
  ctx.lineWidth = 1;
  for (let lat = Math.ceil(bb.latMin); lat <= bb.latMax; lat++) {
    const [, y] = project(lat, view.lon);
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke();
  }
  for (let lon = Math.ceil(bb.lonMin); lon <= bb.lonMax; lon++) {
    const [x] = project(view.lat, lon);
    ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke();
  }

  // coastline - brighter to contrast with water
  ctx.strokeStyle = "rgba(100,160,220,0.85)";
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  for (const line of coastLines) {
    for (let i = 0; i < line.length; i++) {
      const [x, y] = project(line[i][1], line[i][0]);
      i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    }
  }
  ctx.stroke();

  // range rings every 50 km, centred on home
  const k = pxPerDegLat();
  ctx.strokeStyle = "rgba(69,214,230,0.10)";
  ctx.fillStyle = "rgba(69,214,230,0.35)";
  ctx.font = "10px ui-monospace, monospace";
  ctx.textAlign = "left";
  const [cx, cy] = project(home.lat, home.lon);
  for (let rkm = 50; rkm <= 300; rkm += 50) {
    const ry = (rkm / KM_PER_DEG_LAT) * k;
    ctx.beginPath();
    ctx.ellipse(cx, cy, ry, ry, 0, 0, Math.PI * 2);
    ctx.stroke();
    if (ry < H) ctx.fillText(`${rkm} km`, cx + 4, cy - ry + 12);
  }

  // center crosshair
  ctx.strokeStyle = "rgba(69,214,230,0.8)";
  ctx.beginPath();
  ctx.moveTo(cx - 7, cy); ctx.lineTo(cx + 7, cy);
  ctx.moveTo(cx, cy - 7); ctx.lineTo(cx, cy + 7);
  ctx.stroke();

  // home label + nearby cities
  ctx.font = "10px ui-monospace, monospace";
  ctx.fillStyle = "rgba(160,175,205,0.75)";
  ctx.fillText(home.name, cx + 9, cy + 3);
  for (const c of CITIES) {
    if (Math.abs(c.lat - home.lat) < 0.1 && Math.abs(c.lon - home.lon) < 0.1) continue;
    const [x, y] = project(c.lat, c.lon);
    if (x < -50 || x > W + 50 || y < -20 || y > H + 20) continue;
    ctx.fillStyle = "rgba(160,175,205,0.5)";
    ctx.beginPath(); ctx.arc(x, y, 2, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = "rgba(160,175,205,0.4)";
    ctx.fillText(c.name, x + 6, y + 3);
  }
}

function drawAircraft(now) {
  let count = 0;
  let best = null, bestD = 22 * 22;
  const labels = [];
  ctx.font = "10px ui-monospace, monospace";
  for (const rec of aircraft.values()) {
    if (rec.grounded) continue;
    const pos = aircraftPos(rec, now);
    const [x, y] = project(pos.lat, pos.lon);
    if (now - rec.lastTrail > TRAIL_SAMPLE_MS) {
      rec.trail.push({ lat: pos.lat, lon: pos.lon });
      if (rec.trail.length > TRAIL_MAX) rec.trail.shift();
      rec.lastTrail = now;
    }
    if (x < -60 || x > W + 60 || y < -60 || y > H + 60) continue;
    count++;
    const color = AIR_COLORS[rec.cls];
    const alpha = craftAlpha("air", rec);
    drawTrail(rec.trail, x, y, color, alpha);

    // triangle glyph rotated to track, with 60 s speed vector ahead
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate((rec.track * Math.PI) / 180);
    ctx.globalAlpha = alpha;
    const vecKm = rec.gs * 0.000514444 * VECTOR_SEC;
    const vecPx = Math.min(120, (vecKm / KM_PER_DEG_LAT) * pxPerDegLat());
    if (vecPx > 8) {
      ctx.strokeStyle = color;
      ctx.globalAlpha = 0.55 * alpha;
      ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(0, -8); ctx.lineTo(0, -8 - vecPx); ctx.stroke();
      ctx.globalAlpha = alpha;
    }
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(0, -6); ctx.lineTo(4.2, 5); ctx.lineTo(0, 2.6); ctx.lineTo(-4.2, 5);
    ctx.closePath(); ctx.fill();
    ctx.restore();

    const vs = rec.vr > 300 ? "↑" : rec.vr < -300 ? "↓" : "";
    labels.push({
      x, y, alpha,
      l1: rec.callsign,
      l2: rec.alt != null ? `${fmtInt(rec.alt)}ft ${fmtInt(rec.gs)}kt${vs}` : null,
      prio: (followed?.kind === "air" && followed.hex === rec.hex ? -1e9 : 0)
          + (hovered?.obj === rec ? -1e8 : 0)
          + (rec.cls === "mil" ? -1e6 : 0)
          - rec.gs,
    });

    const d = (mouse.x - x) ** 2 + (mouse.y - y) ** 2;
    if (d < bestD) { bestD = d; best = { kind: "air", obj: rec, x, y }; }
  }
  return { count, best, bestD, labels };
}

function drawSats(nearest) {
  let count = 0;
  let { best, bestD } = nearest;
  const labels = [];
  ctx.font = "10px ui-monospace, monospace";
  for (const sat of satActive.values()) {
    if (sat.lat == null) continue;
    const [x, y] = project(sat.lat, sat.lon);
    if (x < -60 || x > W + 60 || y < -60 || y > H + 60) continue;
    count++;
    const color = SAT_COLORS[sat.cls];
    const alpha = craftAlpha("sat", sat);
    drawTrail(sat.trail, x, y, color, alpha);

    ctx.save();
    ctx.translate(x, y);
    ctx.globalAlpha = alpha;
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    if (sat.cls === "station") {
      // bright star for crewed stations
      ctx.rotate(Math.PI / 4);
      ctx.fillRect(-4, -4, 8, 8);
      ctx.rotate(-Math.PI / 4);
      ctx.globalAlpha = 0.35 * alpha;
      ctx.beginPath(); ctx.arc(0, 0, 9, 0, Math.PI * 2); ctx.stroke();
      ctx.globalAlpha = alpha;
    } else {
      ctx.rotate(Math.PI / 4);
      ctx.lineWidth = 1.4;
      ctx.strokeRect(-3.2, -3.2, 6.4, 6.4);
    }
    ctx.restore();

    labels.push({
      x, y, alpha,
      l1: sat.name,
      l2: sat.altKm != null ? `${fmtInt(sat.altKm)}km` : null,
      prio: (followed?.kind === "sat" && followed.idx === sat.idx ? -1e9 : 0)
          + (hovered?.obj === sat ? -1e8 : 0)
          + (sat.cls === "station" ? -1e6 : 0)
          - 2000, // sats are sparse and fast; label them ahead of most planes
    });

    const d = (mouse.x - x) ** 2 + (mouse.y - y) ** 2;
    if (d < bestD) { bestD = d; best = { kind: "sat", obj: sat, x, y }; }
  }
  return { count, best, labels };
}

// labels compete for space: highest priority first, two lines if they fit,
// callsign only if not, nothing if the neighbourhood is already claimed
function drawLabels(cands) {
  cands.sort((a, b) => a.prio - b.prio);
  const placed = [];
  const fits = (x0, y0, x1, y1) => {
    for (const q of placed) {
      if (x0 < q.x1 && x1 > q.x0 && y0 < q.y1 && y1 > q.y0) return false;
    }
    return true;
  };
  ctx.font = "10px ui-monospace, monospace";
  for (const c of cands) {
    const x = c.x + 8;
    const w1 = c.l1.length * 6.2;
    const w2 = c.l2 ? c.l2.length * 6.2 : 0;
    const forced = c.prio <= -1e8; // followed / hovered always labelled
    ctx.globalAlpha = c.alpha ?? 1;
    if (c.l2 && (forced || fits(x - 2, c.y - 15, x + Math.max(w1, w2) + 2, c.y + 9))) {
      placed.push({ x0: x - 2, y0: c.y - 15, x1: x + Math.max(w1, w2) + 2, y1: c.y + 9 });
      ctx.fillStyle = "rgba(207,216,234,0.75)";
      ctx.fillText(c.l1, x, c.y - 4);
      ctx.fillStyle = "rgba(120,135,165,0.7)";
      ctx.fillText(c.l2, x, c.y + 7);
    } else if (forced || fits(x - 2, c.y - 13, x + w1 + 2, c.y + 1)) {
      placed.push({ x0: x - 2, y0: c.y - 13, x1: x + w1 + 2, y1: c.y + 1 });
      ctx.fillStyle = "rgba(207,216,234,0.7)";
      ctx.fillText(c.l1, x, c.y - 4);
    }
  }
  ctx.globalAlpha = 1;
}

// ---------------------------------------------------------------- HUD

const elClock = document.getElementById("clock");
const elCountAir = document.getElementById("count-air");
const elCountSat = document.getElementById("count-sat");
const elStatus = document.getElementById("status");

function updateHUD(nAir, nSat) {
  const d = new Date();
  elClock.textContent = d.toISOString().slice(11, 19) + " UTC";
  elCountAir.textContent = nAir;
  elCountSat.textContent = nSat;
  elStatus.textContent = `${flightStatus} · ${satStatus}`;
}

// ---------------------------------------------------------------- main loop

function frame() {
  const now = Date.now();
  const date = new Date(now);
  const gmst = satellite.gstime(date);

  stepScan(date, gmst);
  updateActiveSats(date, gmst, now);

  // camera: ease toward the followed target, or back home
  const tgt = followedTarget(now);
  if (followed && !tgt) releaseFollow(); // target lost (stale / decayed)
  const dest = tgt ? tgt.pos : home;
  view.lat += (dest.lat - view.lat) * 0.08;
  view.lon += (dest.lon - view.lon) * 0.08;
  if (tgt) {
    elFollow.hidden = false;
    elFollowName.textContent = tgt.name;
  }

  drawBase();
  const air = drawAircraft(now);
  const sats = drawSats(air);
  drawLabels([...air.labels, ...sats.labels]);

  // dashed ring on the followed target
  if (tgt) {
    const [fx, fy] = project(dest.lat, dest.lon);
    ctx.strokeStyle = "rgba(255,255,255,0.55)";
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.arc(fx, fy, 16, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  // highlight hovered object
  hovered = sats.best;
  canvas.style.cursor = hovered ? "pointer" : "default";
  if (hovered) {
    ctx.strokeStyle = "rgba(255,255,255,0.8)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(hovered.x, hovered.y, 12, 0, Math.PI * 2);
    ctx.stroke();
  }
  renderInfoCard();
  updateHUD(air.count, sats.count);

  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

// dev hook: screen positions of live objects (used by automated tests)
window.__sky = {
  planes: () => [...aircraft.values()].map((r) => {
    const p = aircraftPos(r, Date.now());
    const [x, y] = project(p.lat, p.lon);
    return { callsign: r.callsign, x, y };
  }),
  sats: () => [...satActive.values()].filter((s) => s.lat != null).map((s) => {
    const [x, y] = project(s.lat, s.lon);
    return { name: s.name, x, y };
  }),
  state: () => ({ home, view, followed, latSpan }),
};
