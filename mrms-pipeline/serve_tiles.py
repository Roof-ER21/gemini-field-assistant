#!/usr/bin/env python3
"""
MRMS MESH Hail Swath Tile Server

A lightweight HTTP server that serves MRMS hail overlay PNGs
and metadata for use with Leaflet ImageOverlay.

Designed for Oracle Cloud Free Tier (1GB RAM, 1 OCPU).

Endpoints:
    GET /overlays/{product}.png       - Hail overlay PNG (mesh60, mesh1440)
    GET /overlays/{product}.json      - Overlay metadata (bounds, timestamps)
    GET /api/status                    - Server health and product status
    GET /api/products                  - Available products and their metadata
    GET /                             - Simple test page with Leaflet map

All responses include CORS headers for cross-origin access.
"""

import json
import logging
import os
import sys
import time
from datetime import datetime, timezone
from http.server import HTTPServer, SimpleHTTPRequestHandler
from pathlib import Path

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------

HOST = os.environ.get("MRMS_HOST", "0.0.0.0")
PORT = int(os.environ.get("MRMS_PORT", "8090"))
OUTPUT_DIR = Path(os.environ.get("MRMS_OUTPUT_DIR", "/opt/mrms-tiles/overlays"))
LOG_DIR = Path(os.environ.get("MRMS_LOG_DIR", "/var/log/mrms"))

# Known products
PRODUCTS = ["mesh60", "mesh1440"]

# Cache headers (clients should re-check frequently for fresh data)
CACHE_MAX_AGE = 60  # seconds

# ---------------------------------------------------------------------------
# Logging
# ---------------------------------------------------------------------------

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
    handlers=[logging.StreamHandler(sys.stdout)],
)
logger = logging.getLogger("mrms-server")

# ---------------------------------------------------------------------------
# CORS and Content-Type helpers
# ---------------------------------------------------------------------------

MIME_TYPES = {
    ".png": "image/png",
    ".json": "application/json",
    ".html": "text/html; charset=utf-8",
    ".js": "application/javascript",
    ".css": "text/css",
}


def get_content_type(path: str) -> str:
    """Get MIME type for a file path."""
    ext = Path(path).suffix.lower()
    return MIME_TYPES.get(ext, "application/octet-stream")


# ---------------------------------------------------------------------------
# Request Handler
# ---------------------------------------------------------------------------

class MRMSHandler(SimpleHTTPRequestHandler):
    """HTTP handler for MRMS overlay tiles and API endpoints."""

    server_version = "MRMS-TileServer/1.0"

    def log_message(self, format, *args):
        """Override to use Python logging instead of stderr."""
        logger.info(f"{self.address_string()} - {format % args}")

    def send_cors_headers(self):
        """Add CORS headers to every response."""
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, OPTIONS")
        self.send_header("Access-Control-Allow-Headers",
                         "Content-Type, Accept")
        self.send_header("Access-Control-Max-Age", "86400")

    def do_OPTIONS(self):
        """Handle CORS preflight requests."""
        self.send_response(200)
        self.send_cors_headers()
        self.end_headers()

    def do_GET(self):
        """Route GET requests."""
        self._route_request()

    def do_HEAD(self):
        """Route HEAD requests (same as GET but no body)."""
        self._route_request()

    def _route_request(self):
        """Route requests to the appropriate handler."""
        path = self.path.split("?")[0]  # Strip query string

        if path == "/":
            self.serve_test_page()
        elif path == "/api/status":
            self.serve_status()
        elif path == "/api/products":
            self.serve_products()
        elif path.startswith("/overlays/"):
            self.serve_overlay(path)
        elif path == "/health":
            self.serve_health()
        else:
            self.send_error(404, "Not Found")

    def serve_overlay(self, path: str):
        """Serve an overlay PNG or JSON file."""
        # Strip /overlays/ prefix
        filename = path[len("/overlays/"):]

        # Security: prevent directory traversal
        if ".." in filename or "/" in filename:
            self.send_error(403, "Forbidden")
            return

        file_path = OUTPUT_DIR / filename

        if not file_path.exists():
            self.send_error(404, f"Overlay not found: {filename}")
            return

        # Read and serve the file
        try:
            content = file_path.read_bytes()
            content_type = get_content_type(filename)

            self.send_response(200)
            self.send_cors_headers()
            self.send_header("Content-Type", content_type)
            self.send_header("Content-Length", str(len(content)))
            self.send_header("Cache-Control",
                             f"public, max-age={CACHE_MAX_AGE}")

            # Add Last-Modified header
            mtime = file_path.stat().st_mtime
            last_modified = datetime.fromtimestamp(
                mtime, tz=timezone.utc
            ).strftime("%a, %d %b %Y %H:%M:%S GMT")
            self.send_header("Last-Modified", last_modified)

            self.end_headers()
            self.wfile.write(content)

        except Exception as e:
            logger.error(f"Error serving {file_path}: {e}")
            self.send_error(500, "Internal Server Error")

    def serve_status(self):
        """Serve server health status and product info."""
        status = {
            "status": "ok",
            "server": "MRMS Hail Swath Tile Server",
            "version": "1.0",
            "uptime_seconds": int(time.time() - SERVER_START_TIME),
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "products": {},
        }

        for product in PRODUCTS:
            png_path = OUTPUT_DIR / f"{product}.png"
            json_path = OUTPUT_DIR / f"{product}.json"

            product_status = {
                "available": png_path.exists(),
                "overlay_url": f"/overlays/{product}.png",
                "metadata_url": f"/overlays/{product}.json",
            }

            if json_path.exists():
                try:
                    meta = json.loads(json_path.read_text())
                    product_status["ref_time"] = meta.get("ref_time")
                    product_status["has_hail"] = meta.get("has_hail")
                    product_status["max_mesh_mm"] = meta.get("max_mesh_mm")
                    product_status["max_mesh_inches"] = meta.get(
                        "max_mesh_inches"
                    )
                    product_status["hail_pixels"] = meta.get("hail_pixels")
                    product_status["bounds"] = meta.get("bounds")
                except Exception:
                    pass

            if png_path.exists():
                product_status["file_size_kb"] = round(
                    png_path.stat().st_size / 1024, 1
                )
                product_status["last_updated"] = datetime.fromtimestamp(
                    png_path.stat().st_mtime, tz=timezone.utc
                ).isoformat()

            status["products"][product] = product_status

        self.send_json(status)

    def serve_products(self):
        """Serve product metadata for client consumption."""
        products = {}

        for product in PRODUCTS:
            json_path = OUTPUT_DIR / f"{product}.json"
            if json_path.exists():
                try:
                    meta = json.loads(json_path.read_text())
                    meta["overlay_url"] = f"/overlays/{product}.png"
                    products[product] = meta
                except Exception:
                    pass

        self.send_json(products)

    def serve_health(self):
        """Simple health check endpoint."""
        self.send_json({"status": "ok"})

    def serve_test_page(self):
        """Serve a self-contained Leaflet test page."""
        html = TEST_PAGE_HTML
        content = html.encode("utf-8")

        self.send_response(200)
        self.send_cors_headers()
        self.send_header("Content-Type", "text/html; charset=utf-8")
        self.send_header("Content-Length", str(len(content)))
        self.end_headers()
        self.wfile.write(content)

    def send_json(self, data: dict):
        """Send a JSON response with CORS headers."""
        content = json.dumps(data, indent=2).encode("utf-8")

        self.send_response(200)
        self.send_cors_headers()
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(content)))
        self.send_header("Cache-Control", "no-cache")
        self.end_headers()
        self.wfile.write(content)


# ---------------------------------------------------------------------------
# Test Page HTML
# ---------------------------------------------------------------------------

TEST_PAGE_HTML = """<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>MRMS MESH Hail Swath Viewer</title>
    <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
    <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { font-family: -apple-system, BlinkMacSystemFont, sans-serif; }
        #map { width: 100%; height: 100vh; }
        .info-panel {
            position: absolute;
            top: 10px;
            right: 10px;
            z-index: 1000;
            background: rgba(0, 0, 0, 0.85);
            color: #fff;
            padding: 16px;
            border-radius: 8px;
            font-size: 13px;
            max-width: 320px;
            backdrop-filter: blur(10px);
        }
        .info-panel h3 { margin-bottom: 8px; font-size: 15px; }
        .info-panel .status { margin-bottom: 6px; }
        .info-panel .status.ok { color: #86efac; }
        .info-panel .status.warn { color: #fbbf24; }
        .info-panel .status.error { color: #f87171; }
        .legend {
            position: absolute;
            bottom: 30px;
            right: 10px;
            z-index: 1000;
            background: rgba(0, 0, 0, 0.85);
            color: #fff;
            padding: 12px;
            border-radius: 8px;
            font-size: 12px;
            backdrop-filter: blur(10px);
        }
        .legend-item {
            display: flex;
            align-items: center;
            margin-bottom: 4px;
        }
        .legend-swatch {
            width: 20px;
            height: 14px;
            margin-right: 8px;
            border-radius: 2px;
            border: 1px solid rgba(255,255,255,0.3);
        }
        .controls {
            position: absolute;
            top: 10px;
            left: 60px;
            z-index: 1000;
        }
        .controls button {
            background: rgba(0,0,0,0.8);
            color: white;
            border: 1px solid rgba(255,255,255,0.2);
            padding: 8px 14px;
            border-radius: 6px;
            cursor: pointer;
            margin-right: 6px;
            font-size: 13px;
            backdrop-filter: blur(10px);
        }
        .controls button:hover { background: rgba(60,60,60,0.9); }
        .controls button.active { background: rgba(34, 197, 94, 0.7); border-color: #22c55e; }
    </style>
</head>
<body>
    <div id="map"></div>

    <div class="controls">
        <button id="btn-mesh60" class="active" onclick="toggleLayer('mesh60')">
            60-Min Hail
        </button>
        <button id="btn-mesh1440" onclick="toggleLayer('mesh1440')">
            24-Hour Hail
        </button>
        <button onclick="refreshOverlays()">Refresh</button>
    </div>

    <div class="info-panel" id="info-panel">
        <h3>MRMS MESH Hail Swaths</h3>
        <div id="status-text">Loading...</div>
    </div>

    <div class="legend">
        <div style="font-weight: 600; margin-bottom: 6px;">Hail Size (MESH)</div>
        <div class="legend-item">
            <div class="legend-swatch" style="background: #86efac;"></div>
            <span>&lt; 0.5" (small)</span>
        </div>
        <div class="legend-item">
            <div class="legend-swatch" style="background: #22c55e;"></div>
            <span>0.5 - 1" (marble)</span>
        </div>
        <div class="legend-item">
            <div class="legend-swatch" style="background: #eab308;"></div>
            <span>1 - 1.5" (quarter)</span>
        </div>
        <div class="legend-item">
            <div class="legend-swatch" style="background: #f97316;"></div>
            <span>1.5 - 2" (golf ball)</span>
        </div>
        <div class="legend-item">
            <div class="legend-swatch" style="background: #ea580c;"></div>
            <span>2 - 3" (baseball)</span>
        </div>
        <div class="legend-item">
            <div class="legend-swatch" style="background: #dc2626;"></div>
            <span>3"+ (softball)</span>
        </div>
    </div>

    <script>
        // CONUS bounds from MRMS grid
        const CONUS_BOUNDS = [[20.005, -129.995], [54.995, -60.005]];

        const map = L.map('map').setView([39.0, -96.0], 5);

        // Dark base map for contrast
        L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
            attribution: '&copy; OpenStreetMap &copy; CARTO',
            maxZoom: 19,
        }).addTo(map);

        const overlays = {};
        const layerState = { mesh60: true, mesh1440: false };

        function createOverlay(product) {
            const ts = Date.now();
            const overlay = L.imageOverlay(
                `/overlays/${product}.png?t=${ts}`,
                CONUS_BOUNDS,
                { opacity: 0.75, interactive: false, className: 'hail-overlay' }
            );
            return overlay;
        }

        function toggleLayer(product) {
            layerState[product] = !layerState[product];
            document.getElementById(`btn-${product}`).classList.toggle('active');

            if (layerState[product]) {
                if (!overlays[product]) {
                    overlays[product] = createOverlay(product);
                }
                overlays[product].addTo(map);
            } else if (overlays[product]) {
                map.removeLayer(overlays[product]);
            }
        }

        function refreshOverlays() {
            for (const product of ['mesh60', 'mesh1440']) {
                if (overlays[product]) {
                    map.removeLayer(overlays[product]);
                }
                if (layerState[product]) {
                    overlays[product] = createOverlay(product);
                    overlays[product].addTo(map);
                }
            }
            updateStatus();
        }

        async function updateStatus() {
            try {
                const resp = await fetch('/api/status');
                const data = await resp.json();
                let html = '';

                for (const [name, info] of Object.entries(data.products)) {
                    const label = name === 'mesh60' ? '60-Min Max' : '24-Hour Max';
                    if (info.available && info.ref_time) {
                        const refTime = new Date(info.ref_time);
                        const ago = Math.round((Date.now() - refTime.getTime()) / 60000);
                        html += `<div class="status ok">`;
                        html += `<strong>${label}:</strong> `;
                        if (info.has_hail) {
                            html += `Max ${info.max_mesh_inches}" `;
                            html += `(${info.max_mesh_mm}mm), `;
                            html += `${info.hail_pixels.toLocaleString()} px`;
                        } else {
                            html += `No hail detected`;
                        }
                        html += `<br><small>${ago} min ago (${info.file_size_kb} KB)</small>`;
                        html += `</div>`;
                    } else {
                        html += `<div class="status warn">${label}: Not available</div>`;
                    }
                }

                html += `<div style="margin-top: 8px; font-size: 11px; opacity: 0.7;">`;
                html += `Updated: ${new Date().toLocaleTimeString()}`;
                html += `</div>`;

                document.getElementById('status-text').innerHTML = html;
            } catch (e) {
                document.getElementById('status-text').innerHTML =
                    '<div class="status error">Failed to fetch status</div>';
            }
        }

        // Initialize
        overlays.mesh60 = createOverlay('mesh60');
        overlays.mesh60.addTo(map);
        updateStatus();

        // Auto-refresh every 2 minutes
        setInterval(refreshOverlays, 120000);
        setInterval(updateStatus, 60000);
    </script>
</body>
</html>"""


# ---------------------------------------------------------------------------
# Server
# ---------------------------------------------------------------------------

SERVER_START_TIME = time.time()


def main():
    """Start the MRMS tile server."""
    import argparse

    parser = argparse.ArgumentParser(
        description="MRMS MESH Hail Swath Tile Server"
    )
    parser.add_argument("--host", default=HOST, help=f"Bind address (default: {HOST})")
    parser.add_argument("--port", type=int, default=PORT, help=f"Port (default: {PORT})")
    args = parser.parse_args()

    # Ensure output directory exists
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

    server = HTTPServer((args.host, args.port), MRMSHandler)
    logger.info(f"MRMS Tile Server starting on {args.host}:{args.port}")
    logger.info(f"Serving overlays from: {OUTPUT_DIR}")
    logger.info(f"Test page: http://{args.host}:{args.port}/")
    logger.info(f"Status API: http://{args.host}:{args.port}/api/status")

    try:
        server.serve_forever()
    except KeyboardInterrupt:
        logger.info("Shutting down")
        server.shutdown()


if __name__ == "__main__":
    main()
