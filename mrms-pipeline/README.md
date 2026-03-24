# MRMS MESH Hail Swath Pipeline

Real-time hail swath overlays from NOAA's Multi-Radar Multi-Sensor (MRMS) system.
Downloads MESH (Maximum Estimated Size of Hail) GRIB2 data, colorizes it with a
severity ramp, and serves transparent PNG overlays for Leaflet `ImageOverlay`.

Designed for Oracle Cloud Free Tier (1GB RAM, 1 OCPU AMD).

## Architecture

```
NOAA MRMS Server                     Oracle Cloud Server
   (GRIB2 files)                      (129.159.190.3)
        |                                    |
        |  HTTP GET (every 5 min)            |
        |  ~40KB compressed GRIB2            |
        +------------>  download_mrms.py     |
                        - Pure-Python GRIB2  |
                          decoder (no        |
                          eccodes needed)    |
                        - Color ramp         |
                        - PNG output         |
                             |               |
                             v               |
                        /opt/mrms-tiles/     |
                        overlays/            |
                          mesh60.png         |
                          mesh60.json        |
                          mesh1440.png       |
                          mesh1440.json      |
                             |               |
                             v               |
                        serve_tiles.py       |
                        (port 8090)          |
                             |               |
                             v               |
                    Leaflet ImageOverlay  <---+
                    in field app
```

## Products

| Product | Description | Update Frequency | MRMS Source |
|---------|-------------|-----------------|-------------|
| `mesh60` | 60-minute rolling max hail size | Every 2 minutes | `MESH_Max_60min` |
| `mesh1440` | 24-hour rolling max hail size | Every 30 minutes | `MESH_Max_1440min` |

## Color Ramp

| Hail Size | Color | Description |
|-----------|-------|-------------|
| < 0.5" (12mm) | Light Green | Small hail |
| 0.5 - 1" (13-25mm) | Green | Marble to penny size |
| 1 - 1.5" (26-38mm) | Yellow | Quarter size |
| 1.5 - 2" (39-50mm) | Orange | Golf ball size |
| 2 - 3" (51-75mm) | Dark Orange | Baseball size |
| 3"+ (76mm+) | Red | Softball or larger |

## API Endpoints

| Endpoint | Description |
|----------|-------------|
| `GET /` | Interactive Leaflet map viewer |
| `GET /overlays/mesh60.png` | 60-min hail overlay PNG |
| `GET /overlays/mesh60.json` | 60-min metadata (bounds, timestamp, max size) |
| `GET /overlays/mesh1440.png` | 24-hour hail overlay PNG |
| `GET /overlays/mesh1440.json` | 24-hour metadata |
| `GET /api/status` | Server health + all product status |
| `GET /api/products` | Product metadata for client consumption |
| `GET /health` | Simple health check |

## Leaflet Integration

```javascript
// CONUS bounds from MRMS grid definition
const CONUS_BOUNDS = [[20.005, -129.995], [54.995, -60.005]];

// Add hail overlay to your Leaflet map
const hailOverlay = L.imageOverlay(
  'http://129.159.190.3:8090/overlays/mesh60.png',
  CONUS_BOUNDS,
  { opacity: 0.75 }
).addTo(map);

// Auto-refresh every 2 minutes
setInterval(() => {
  hailOverlay.setUrl(
    `http://129.159.190.3:8090/overlays/mesh60.png?t=${Date.now()}`
  );
}, 120000);
```

## Local Testing

```bash
# Test without deploying
./deploy.sh --local-test

# Or manually:
export MRMS_DATA_DIR=/tmp/mrms/data
export MRMS_OUTPUT_DIR=/tmp/mrms/overlays
export MRMS_LOG_DIR=/tmp/mrms/log

python3 download_mrms.py --once --force --downsample 2
python3 serve_tiles.py --port 8090
# Open http://localhost:8090/
```

## Deployment

```bash
# Deploy to Oracle Cloud server
./deploy.sh

# Or to a custom server
./deploy.sh 10.0.0.1
```

After deployment, open port 8090 in the Oracle Cloud console:
1. Go to Networking > Virtual Cloud Networks > your VCN
2. Security Lists > Default Security List
3. Add Ingress Rule: Source 0.0.0.0/0, TCP, Port 8090

## Systemd Services

| Service | Type | Description |
|---------|------|-------------|
| `mrms-downloader.timer` | Timer | Triggers download every 5 minutes |
| `mrms-downloader.service` | Oneshot | Downloads + processes GRIB2 data |
| `mrms-tileserver.service` | Simple | HTTP server on port 8090 |

```bash
# View logs
journalctl -u mrms-downloader -f
journalctl -u mrms-tileserver -f

# Force immediate refresh
sudo systemctl start mrms-downloader

# Check timer schedule
systemctl list-timers mrms*
```

## GRIB2 Decoder

This pipeline includes a pure-Python GRIB2 decoder that handles MRMS's
PNG-packed data format (Template 5.41) without requiring the eccodes C library
or pygrib. This keeps the deployment lightweight and avoids complex native
dependency compilation on the constrained Oracle Free Tier server.

The decoder reads:
- Section 3 (Grid Definition): 7000x3500 lat/lon grid, 0.01-degree resolution
- Section 5 (Data Representation): PNG packing with scaling parameters
- Section 7 (Data): Embedded PNG image decoded with Pillow

Scaling formula: `value_mm = (reference_value + raw * 2^binary_scale) / 10^decimal_scale`

## Resource Usage

- RAM: ~150-250MB peak during processing (7000x3500 grid = ~100MB numpy array)
- Disk: ~50KB per overlay PNG (heavily compressed, mostly transparent)
- Network: ~80KB per download cycle (two GRIB2 files)
- CPU: Brief spike during processing, idle otherwise

The 2x downsampling (default) reduces the output to 3500x1750, cutting
peak RAM usage roughly in half while maintaining adequate visual resolution.
