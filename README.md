# SKYGLASS

Real-time satellite and aircraft visualization on an interactive sky map.

## Features

- **Live Aircraft Tracking** — See aircraft within 250 nautical miles of any location using real-time ADS-B data
- **Satellite Positioning** — Track satellites including ISS, GPS, Starlink, and more using current orbital data
- **Interactive Map** — Search for any city or coordinates and view sky coverage in real-time
- **Responsive Canvas** — Smooth, high-performance 2D visualization with zoom and pan controls
- **Coastline Context** — Visual land/water distinction with coastline data for geographic reference

## Tech Stack

- **Backend**: Python 3 with built-in HTTP server
- **Frontend**: Vanilla JavaScript with HTML5 Canvas
- **Data Sources**:
  - Aircraft: [adsb.lol](https://adsb.lol) / [airplanes.live](https://airplanes.live) API
  - Satellites: [CelesTrak](https://celestrak.org) TLE data
  - Geocoding: [Nominatim](https://nominatim.openstreetmap.org) (OpenStreetMap)
  - Coastlines: [Natural Earth](https://www.naturalearthdata.com) data

## Installation

### Requirements
- Python 3.9+

### Setup

```bash
git clone <repository-url>
cd skyglass
python3 server.py
```

Visit `http://localhost:8642` in your browser.

## Usage

- **Search Location**: Click the location name (top-left) to search for a city or coordinates
- **Zoom**: Scroll to zoom in/out
- **Pan**: Click and drag to move around
- **Follow Object**: Click on an aircraft or satellite to center and follow it
- **Release**: Press Escape or click the sky to release tracking

## API Endpoints

- `GET /api/flights?lat=<lat>&lon=<lon>` — Aircraft within 250nm radius
- `GET /api/tles` — Current satellite TLE data (cached 6 hours)
- `GET /api/coast?lat=<lat>&lon=<lon>` — Coastline data for region
- `GET /api/geocode?q=<query>` — Convert place name to coordinates

## Deployment

### Deploy to Render

1. Push to GitHub
2. Create a new Web Service on [render.com](https://render.com)
3. Connect your repository
4. Set Runtime to Python 3
5. Leave Build Command empty
6. Start Command: `python3 server.py`
7. Deploy!

Your app will be live at `https://<your-app>.onrender.com`

## Project Structure

```
skyglass/
├── index.html          # Main HTML page
├── app.js              # Frontend visualization logic
├── style.css           # Styling
├── server.py           # Python backend server
├── Procfile            # Deployment configuration
├── requirements.txt    # Python dependencies
├── data/
│   └── world_coast.json    # Coastline GeoJSON
├── tle_cache/          # TLE data cache (auto-created)
└── vendor/
    └── satellite.min.js    # Satellite.js library
```

## License

MIT

## Credits

- **Visualization**: Canvas-based 2D rendering
- **Satellite Tracking**: [Satellite.js](https://github.com/shashwatak/satellite-js)
- **Data**: CelesTrak, ADSB.lol, Natural Earth
