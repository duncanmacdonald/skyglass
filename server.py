#!/usr/bin/env python3
"""SKYGLASS dev server: serves static files and proxies flight/TLE/map data.

  /api/flights?lat=&lon= -> adsb.lol live aircraft within 250 nm of a point
  /api/tles              -> CelesTrak TLEs for selected groups, cached on disk 6 h
  /api/coast?lat=&lon=   -> world coastline clipped to the region around a point
  /api/geocode?q=        -> place name -> coordinates, via Nominatim
"""
import json
import os
import threading
import time
import urllib.error
import urllib.request
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import parse_qs, quote, urlparse

PORT = int(os.environ.get("PORT", 8642))
ROOT = os.path.dirname(os.path.abspath(__file__))
CACHE_DIR = os.path.join(ROOT, "tle_cache")

DEFAULT_LAT, DEFAULT_LON = 55.8642, -4.2518  # Glasgow
FLIGHT_RADIUS_NM = 250
GEOCODE_URL = "https://nominatim.openstreetmap.org/search?q={}&format=json&limit=1"

TLE_GROUPS = ["stations", "starlink", "oneweb", "gps-ops", "galileo", "weather", "science"]
TLE_URL = "https://celestrak.org/NORAD/elements/gp.php?GROUP={}&FORMAT=tle"
TLE_MAX_AGE = 6 * 3600


flight_caches = {}      # "lat,lon" -> {"data": bytes, "ts": float}
FLIGHT_FRESH_S = 5      # serve from cache within this window (dedupes clients)
FLIGHT_STALE_OK_S = 60  # on upstream failure, serve stale cache up to this age

# both providers speak the same readsb JSON dialect; try in order,
# and rest any provider that fails or rate-limits us
FLIGHT_PROVIDERS = [
    "https://api.airplanes.live/v2/point/{lat}/{lon}/{r}",
    "https://api.adsb.lol/v2/point/{lat}/{lon}/{r}",
]
provider_backoff = {}   # template -> unix time until which to skip it

flight_locks = {}       # cache key -> Lock, so concurrent clients share one upstream fetch
_locks_guard = threading.Lock()


def key_lock(key):
    with _locks_guard:
        return flight_locks.setdefault(key, threading.Lock())


def fetch_flights(lat, lon):
    last_err = None
    for tpl in FLIGHT_PROVIDERS:
        if time.time() < provider_backoff.get(tpl, 0):
            continue
        host = tpl.split("/")[2]
        try:
            return fetch(tpl.format(lat=lat, lon=lon, r=FLIGHT_RADIUS_NM), timeout=6, total=12)
        except urllib.error.HTTPError as e:
            rest = 60 if e.code in (420, 429) else 30
            provider_backoff[tpl] = time.time() + rest
            print(f"[flights] {host} failed (HTTP {e.code}), resting it {rest} s")
            last_err = e
        except OSError as e:
            provider_backoff[tpl] = time.time() + 30
            print(f"[flights] {host} failed ({e}), resting it 30 s")
            last_err = e
    raise last_err or OSError("no flight providers available")

world_coast = []        # flat list of linestrings, lazy-loaded from disk
coast_cache = {}        # rounded "lat,lon" -> clipped payload bytes


def load_world_coast():
    global world_coast
    if not world_coast:
        with open(os.path.join(ROOT, "data", "world_coast.json")) as f:
            gj = json.load(f)
        for feat in gj["features"]:
            g = feat["geometry"]
            if g["type"] == "LineString":
                world_coast.append(g["coordinates"])
            elif g["type"] == "MultiLineString":
                world_coast.extend(g["coordinates"])
    return world_coast


def clip_coast(lat, lon, dlat=7.0, dlon=14.0):
    """Coastline segments within a box around (lat, lon), split at box exits."""
    lon_min, lon_max = lon - dlon, lon + dlon
    lat_min, lat_max = lat - dlat, lat + dlat
    out = []
    for line in load_world_coast():
        run = []
        for i, p in enumerate(line):
            if lon_min <= p[0] <= lon_max and lat_min <= p[1] <= lat_max:
                if not run and i > 0:
                    run.append(line[i - 1])  # lead-in point for continuity
                run.append(p)
            elif run:
                run.append(p)  # lead-out point
                out.append(run)
                run = []
        if run:
            out.append(run)
    return [[[round(x, 4), round(y, 4)] for x, y in seg] for seg in out]


def fetch(url, timeout=30, total=None):
    """GET a URL. `timeout` caps each socket read; `total` caps the whole
    download, defeating tarpit-style throttling that dribbles bytes forever."""
    req = urllib.request.Request(url, headers={"User-Agent": "skyglass/1.0"})
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        if total is None:
            return resp.read()
        deadline = time.time() + total
        chunks = []
        while True:
            if time.time() > deadline:
                raise OSError(f"total timeout after {total}s")
            chunk = resp.read(65536)
            if not chunk:
                return b"".join(chunks)
            chunks.append(chunk)


def group_tles(group):
    """Return raw TLE text for a group, from disk cache when fresh."""
    os.makedirs(CACHE_DIR, exist_ok=True)
    path = os.path.join(CACHE_DIR, f"{group}.tle")
    fresh = os.path.exists(path) and (time.time() - os.path.getmtime(path)) < TLE_MAX_AGE
    if not fresh:
        try:
            data = fetch(TLE_URL.format(group))
            if b"\n2 " in b"\n" + data:  # sanity: looks like TLEs, not an error page
                with open(path, "wb") as f:
                    f.write(data)
        except OSError as e:
            print(f"[tle] fetch failed for {group}: {e} (using stale cache if any)")
    if os.path.exists(path):
        with open(path, "rb") as f:
            return f.read().decode("utf-8", "replace")
    return ""


def all_tles_json():
    sats = []
    for group in TLE_GROUPS:
        lines = [l.rstrip() for l in group_tles(group).splitlines() if l.strip()]
        for i in range(0, len(lines) - 2, 3):
            name, l1, l2 = lines[i], lines[i + 1], lines[i + 2]
            if l1.startswith("1 ") and l2.startswith("2 "):
                sats.append({"name": name.strip(), "group": group, "l1": l1, "l2": l2})
    return json.dumps(sats).encode()


class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=ROOT, **kwargs)

    def send_json(self, payload, status=200):
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(payload)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(payload)

    def do_GET(self):
        url = urlparse(self.path)
        qs = parse_qs(url.query)

        def qfloat(key, default):
            try:
                return float(qs[key][0])
            except (KeyError, ValueError):
                return default

        if url.path == "/api/flights":
            lat = qfloat("lat", DEFAULT_LAT)
            lon = qfloat("lon", DEFAULT_LON)
            key = f"{lat:.3f},{lon:.3f}"
            cache = flight_caches.setdefault(key, {"data": None, "ts": 0.0})
            with key_lock(key):
                age = time.time() - cache["ts"]
                if cache["data"] and age < FLIGHT_FRESH_S:
                    self.send_json(cache["data"])
                    return
                try:
                    data = fetch_flights(lat, lon)
                    cache["data"], cache["ts"] = data, time.time()
                    self.send_json(data)
                except OSError as e:
                    if cache["data"] and age < FLIGHT_STALE_OK_S:
                        self.send_json(cache["data"])
                    else:
                        self.send_json(json.dumps({"error": str(e)}).encode(), status=502)
        elif url.path == "/api/tles":
            try:
                self.send_json(all_tles_json())
            except Exception as e:
                self.send_json(json.dumps({"error": str(e)}).encode(), status=502)
        elif url.path == "/api/coast":
            lat = qfloat("lat", DEFAULT_LAT)
            lon = qfloat("lon", DEFAULT_LON)
            key = f"{round(lat)},{round(lon)}"
            if key not in coast_cache:
                coast_cache[key] = json.dumps({"lines": clip_coast(lat, lon)}).encode()
            self.send_json(coast_cache[key])
        elif url.path == "/api/geocode":
            q = (qs.get("q") or [""])[0].strip()
            if not q:
                self.send_json(b'{"error": "empty query"}', status=400)
                return
            try:
                results = json.loads(fetch(GEOCODE_URL.format(quote(q)), timeout=15))
                if not results:
                    self.send_json(b'{"error": "not found"}')
                    return
                hit = results[0]
                self.send_json(json.dumps({
                    "name": hit["display_name"].split(",")[0].upper(),
                    "full": hit["display_name"],
                    "lat": float(hit["lat"]),
                    "lon": float(hit["lon"]),
                }).encode())
            except (OSError, ValueError, KeyError) as e:
                self.send_json(json.dumps({"error": str(e)}).encode(), status=502)
        else:
            super().do_GET()

    def log_message(self, fmt, *args):
        if args and "/api/" in str(args[0]):
            super().log_message(fmt, *args)


if __name__ == "__main__":
    print(f"SKYGLASS serving on http://0.0.0.0:{PORT}")
    ThreadingHTTPServer(("0.0.0.0", PORT), Handler).serve_forever()
