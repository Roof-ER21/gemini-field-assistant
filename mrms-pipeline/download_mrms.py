#!/usr/bin/env python3
"""
MRMS MESH Hail Swath Downloader + Processor

Downloads the latest MRMS MESH GRIB2 files from NOAA, decodes
the PNG-packed GRIB2 data using pure Python (no eccodes/pygrib
dependency), applies a hail severity color ramp, and outputs
transparent PNG overlays for use with Leaflet ImageOverlay.

Designed for Oracle Cloud Free Tier (1GB RAM, 1 OCPU).

Products:
  - MESH_Max_60min:   60-minute rolling max hail size (updated every 2 min)
  - MESH_Max_1440min: 24-hour rolling max hail size (updated every 30 min)

MRMS Grid (from GRIB2 Section 3):
  - 7000 x 3500 points, 0.01-degree resolution
  - Lat: 54.995N to 20.005N (north to south)
  - Lon: 230.005E to 299.995E (-129.995W to -60.005W)

GRIB2 Encoding (Section 5, Template 5.41 = PNG packing):
  - 16-bit unsigned integers packed as PNG
  - value_mm = (reference_value + raw * 2^binary_scale) / 10^decimal_scale
  - Typical: ref=-30.0, bin_scale=0, dec_scale=1 => value_mm = (-30 + raw) / 10
  - Negative results = no hail / missing data
"""

import gzip
import io
import logging
import os
import struct
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

import numpy as np
import requests
from PIL import Image

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------

BASE_URL = "https://mrms.ncep.noaa.gov/data/2D"

PRODUCTS = {
    "mesh60": {
        "path": "MESH_Max_60min",
        "prefix": "MRMS_MESH_Max_60min",
        "latest": "MRMS_MESH_Max_60min.latest.grib2.gz",
    },
    "mesh1440": {
        "path": "MESH_Max_1440min",
        "prefix": "MRMS_MESH_Max_1440min",
        "latest": "MRMS_MESH_Max_1440min.latest.grib2.gz",
    },
}

# Output directories
DATA_DIR = Path(os.environ.get("MRMS_DATA_DIR", "/opt/mrms-tiles/data"))
OUTPUT_DIR = Path(os.environ.get("MRMS_OUTPUT_DIR", "/opt/mrms-tiles/overlays"))
LOG_DIR = Path(os.environ.get("MRMS_LOG_DIR", "/var/log/mrms"))

# CONUS bounding box (from GRIB2 grid definition)
# Lon is stored as 0-360 in GRIB2; we convert to -180..180
CONUS_BOUNDS = {
    "north": 54.995,
    "south": 20.005,
    "west": -129.995,  # 230.005 - 360
    "east": -60.005,   # 299.995 - 360
}

# Hail severity color ramp (RGBA)
# Threshold in mm -> RGBA color
HAIL_COLORS = [
    # (min_mm, max_mm, R, G, B, A)
    (0.01, 12.0,  134, 239, 172, 160),  # Light green - small hail < 0.5"
    (12.0, 25.0,   34, 197,  94, 180),  # Green - half inch 0.5-1"
    (25.0, 38.0,  234, 179,   8, 200),  # Yellow - penny to quarter 1-1.5"
    (38.0, 50.0,  249, 115,  22, 210),  # Orange - quarter to golf ball 1.5-2"
    (50.0, 75.0,  234,  88,  12, 230),  # Dark orange - golf ball to baseball 2-3"
    (75.0, 999.0, 220,  38,  38, 255),  # Red - giant hail 3"+
]

# How many seconds to keep downloaded GRIB2 files before cleanup
GRIB2_RETENTION_SECONDS = 3600  # 1 hour

# Request timeout
REQUEST_TIMEOUT = 30

# User agent
USER_AGENT = "MRMS-HailTracker/1.0 (field-assistant; contact: admin@roof-er.com)"

# ---------------------------------------------------------------------------
# Logging
# ---------------------------------------------------------------------------

def setup_logging():
    """Configure logging to file and stdout."""
    LOG_DIR.mkdir(parents=True, exist_ok=True)

    log_format = "%(asctime)s [%(levelname)s] %(message)s"
    date_format = "%Y-%m-%d %H:%M:%S"

    handlers = [logging.StreamHandler(sys.stdout)]

    try:
        log_file = LOG_DIR / "mrms-pipeline.log"
        file_handler = logging.handlers.RotatingFileHandler(
            log_file, maxBytes=5 * 1024 * 1024, backupCount=3
        )
        file_handler.setFormatter(logging.Formatter(log_format, date_format))
        handlers.append(file_handler)
    except Exception:
        pass  # Fall back to stdout-only if log dir isn't writable

    logging.basicConfig(level=logging.INFO, format=log_format,
                        datefmt=date_format, handlers=handlers)

import logging.handlers  # needed for RotatingFileHandler

logger = logging.getLogger("mrms")

# ---------------------------------------------------------------------------
# GRIB2 Pure-Python Decoder (MRMS-specific)
# ---------------------------------------------------------------------------

class GRIB2DecodeError(Exception):
    """Raised when GRIB2 decoding fails."""
    pass


def decode_grib2(raw_bytes: bytes) -> dict:
    """
    Decode an MRMS GRIB2 file into a numpy array and metadata.

    This is a minimal decoder that handles the specific encoding used
    by MRMS products (Template 5.41 = PNG packing on a lat/lon grid).
    It does NOT handle arbitrary GRIB2 files.

    Returns dict with keys:
        - data: numpy float32 array (Nj x Ni) with values in mm
        - grid: dict with lat/lon bounds and dimensions
        - ref_time: datetime of the data
        - ref_value: GRIB2 reference value
        - bin_scale: binary scale factor
        - dec_scale: decimal scale factor
    """
    if raw_bytes[:4] != b"GRIB":
        raise GRIB2DecodeError("Not a GRIB file (missing GRIB magic)")

    edition = raw_bytes[7]
    if edition != 2:
        raise GRIB2DecodeError(f"Expected GRIB2 (edition 2), got edition {edition}")

    pos = 16  # Skip Section 0 (16 bytes)

    # --- Section 1: Identification ---
    sec1_len = struct.unpack(">I", raw_bytes[pos:pos+4])[0]
    year = struct.unpack(">H", raw_bytes[pos+12:pos+14])[0]
    month, day = raw_bytes[pos+14], raw_bytes[pos+15]
    hour, minute, second = raw_bytes[pos+16], raw_bytes[pos+17], raw_bytes[pos+18]
    ref_time = datetime(year, month, day, hour, minute, second, tzinfo=timezone.utc)
    pos += sec1_len

    # --- Section 2: Local Use (optional) ---
    if raw_bytes[pos+4] == 2:
        sec2_len = struct.unpack(">I", raw_bytes[pos:pos+4])[0]
        pos += sec2_len

    # --- Section 3: Grid Definition ---
    sec3_len = struct.unpack(">I", raw_bytes[pos:pos+4])[0]
    num_points = struct.unpack(">I", raw_bytes[pos+6:pos+10])[0]
    grid_template = struct.unpack(">H", raw_bytes[pos+12:pos+14])[0]

    if grid_template != 0:
        raise GRIB2DecodeError(
            f"Expected grid template 3.0 (lat/lon), got 3.{grid_template}"
        )

    ni = struct.unpack(">I", raw_bytes[pos+30:pos+34])[0]  # cols
    nj = struct.unpack(">I", raw_bytes[pos+34:pos+38])[0]  # rows
    lat1 = struct.unpack(">I", raw_bytes[pos+46:pos+50])[0] / 1e6
    lon1 = struct.unpack(">I", raw_bytes[pos+50:pos+54])[0] / 1e6
    lat2 = struct.unpack(">I", raw_bytes[pos+55:pos+59])[0] / 1e6
    lon2 = struct.unpack(">I", raw_bytes[pos+59:pos+63])[0] / 1e6

    # Convert 0-360 longitude to -180..180
    if lon1 > 180:
        lon1 -= 360
    if lon2 > 180:
        lon2 -= 360

    grid = {
        "ni": ni, "nj": nj,
        "lat_north": round(max(lat1, lat2), 4),
        "lat_south": round(min(lat1, lat2), 4),
        "lon_west": round(min(lon1, lon2), 4),
        "lon_east": round(max(lon1, lon2), 4),
    }
    pos += sec3_len

    # --- Section 4: Product Definition ---
    sec4_len = struct.unpack(">I", raw_bytes[pos:pos+4])[0]
    pos += sec4_len

    # --- Section 5: Data Representation ---
    sec5_len = struct.unpack(">I", raw_bytes[pos:pos+4])[0]
    drt_template = struct.unpack(">H", raw_bytes[pos+9:pos+11])[0]

    if drt_template not in (40, 41):
        raise GRIB2DecodeError(
            f"Expected DRT 5.40 (JPEG2000) or 5.41 (PNG), got 5.{drt_template}"
        )

    ref_value = struct.unpack(">f", raw_bytes[pos+11:pos+15])[0]
    bin_scale = struct.unpack(">h", raw_bytes[pos+15:pos+17])[0]
    dec_scale = struct.unpack(">h", raw_bytes[pos+17:pos+19])[0]
    nbits = raw_bytes[pos+19]
    pos += sec5_len

    # --- Section 6: Bitmap ---
    sec6_len = struct.unpack(">I", raw_bytes[pos:pos+4])[0]
    bitmap_indicator = raw_bytes[pos+5]
    has_bitmap = bitmap_indicator != 255

    bitmap = None
    if has_bitmap and bitmap_indicator == 0:
        bitmap_bytes = raw_bytes[pos+6:pos+sec6_len]
        bitmap = np.unpackbits(
            np.frombuffer(bitmap_bytes, dtype=np.uint8)
        )[:num_points].reshape(nj, ni).astype(bool)
    pos += sec6_len

    # --- Section 7: Data ---
    sec7_len = struct.unpack(">I", raw_bytes[pos:pos+4])[0]
    payload = raw_bytes[pos+5:pos+sec7_len]

    if drt_template == 41:  # PNG packing
        img = Image.open(io.BytesIO(payload))
        raw_arr = np.array(img, dtype=np.float32)
    elif drt_template == 40:  # JPEG2000 packing
        img = Image.open(io.BytesIO(payload))
        raw_arr = np.array(img, dtype=np.float32)
    else:
        raise GRIB2DecodeError(f"Unsupported packing: {drt_template}")

    # Free the PIL image immediately to reduce peak memory
    del img

    # Reshape if needed (PNG should already be nj x ni)
    if raw_arr.shape != (nj, ni):
        if raw_arr.size == nj * ni:
            raw_arr = raw_arr.reshape(nj, ni)
        else:
            raise GRIB2DecodeError(
                f"Data shape {raw_arr.shape} doesn't match grid {nj}x{ni}"
            )

    # Apply GRIB2 scaling in-place to avoid allocating a second array:
    # Y = (R + X * 2^E) / 10^D
    factor_2e = np.float32(2.0 ** bin_scale)
    factor_10d = np.float32(10.0 ** dec_scale)
    raw_arr *= factor_2e         # X * 2^E (in-place)
    raw_arr += np.float32(ref_value)  # + R (in-place)
    raw_arr /= factor_10d        # / 10^D (in-place)
    scaled = raw_arr             # no copy, same array

    # Apply bitmap mask if present
    if bitmap is not None:
        scaled[~bitmap] = np.nan

    # Already float32 from initial conversion

    return {
        "data": scaled,
        "grid": grid,
        "ref_time": ref_time,
        "ref_value": ref_value,
        "bin_scale": bin_scale,
        "dec_scale": dec_scale,
    }


# ---------------------------------------------------------------------------
# Color Ramp Application
# ---------------------------------------------------------------------------

def apply_color_ramp(data: np.ndarray) -> np.ndarray:
    """
    Apply hail severity color ramp to a 2D array of MESH values (mm).

    Returns RGBA uint8 array (H, W, 4) with transparent pixels for no-hail.
    """
    h, w = data.shape
    rgba = np.zeros((h, w, 4), dtype=np.uint8)  # Start fully transparent

    for min_mm, max_mm, r, g, b, a in HAIL_COLORS:
        mask = (data >= min_mm) & (data < max_mm)
        rgba[mask] = [r, g, b, a]

    return rgba


def create_overlay_png(data: np.ndarray, output_path: Path,
                       downsample: int = 1) -> bool:
    """
    Create a transparent PNG overlay from MESH data.

    Args:
        data: 2D numpy array of MESH values in mm
        output_path: Where to save the PNG
        downsample: Factor to reduce resolution (2 = half size, etc.)
                   Useful for saving memory/bandwidth on constrained servers.

    Returns:
        True if the overlay was created (had hail data), False if skipped.
    """
    # Check if there's any hail at all
    hail_mask = data > 0.01  # > 0.01mm threshold
    hail_count = np.count_nonzero(hail_mask)

    if hail_count == 0:
        # No hail detected - create a minimal 1x1 transparent PNG
        # to signal "no data" without wasting bandwidth
        img = Image.new("RGBA", (1, 1), (0, 0, 0, 0))
        output_path.parent.mkdir(parents=True, exist_ok=True)
        img.save(str(output_path), "PNG", optimize=True)
        logger.info("No hail detected, saved minimal transparent overlay")
        return False

    logger.info(
        f"Hail detected: {hail_count} pixels, "
        f"max {data[hail_mask].max():.1f}mm "
        f"({data[hail_mask].max() / 25.4:.2f} inches)"
    )

    # Apply color ramp
    rgba = apply_color_ramp(data)

    # Downsample if requested (reduces 7000x3500 -> 3500x1750 at 2x)
    if downsample > 1:
        # Use block averaging for data, nearest-neighbor for colors
        h, w = rgba.shape[:2]
        new_h, new_w = h // downsample, w // downsample
        img = Image.fromarray(rgba, "RGBA")
        img = img.resize((new_w, new_h), Image.NEAREST)
        rgba = np.array(img)

    # Crop to the bounding box of actual hail data + margin
    # This dramatically reduces PNG file size when hail is localized
    alpha = rgba[:, :, 3]
    rows_with_data = np.any(alpha > 0, axis=1)
    cols_with_data = np.any(alpha > 0, axis=0)

    if np.any(rows_with_data) and np.any(cols_with_data):
        row_min = max(0, np.argmax(rows_with_data) - 10)
        row_max = min(rgba.shape[0], rgba.shape[0] - np.argmax(rows_with_data[::-1]) + 10)
        col_min = max(0, np.argmax(cols_with_data) - 10)
        col_max = min(rgba.shape[1], rgba.shape[1] - np.argmax(cols_with_data[::-1]) + 10)
    else:
        row_min, row_max = 0, rgba.shape[0]
        col_min, col_max = 0, rgba.shape[1]

    # For ImageOverlay, we need the full CONUS image (Leaflet maps the
    # entire image to the bounding box). Cropping would require adjusting
    # the bounding box on the client side, adding complexity.
    # Instead, we'll keep full dimensions but use PNG compression
    # which handles large transparent areas very efficiently.

    img = Image.fromarray(rgba, "RGBA")
    output_path.parent.mkdir(parents=True, exist_ok=True)
    img.save(str(output_path), "PNG", optimize=True, compress_level=9)

    file_size = output_path.stat().st_size
    logger.info(
        f"Overlay saved: {output_path} "
        f"({file_size / 1024:.1f} KB, {img.size[0]}x{img.size[1]})"
    )
    return True


# ---------------------------------------------------------------------------
# Download Logic
# ---------------------------------------------------------------------------

def download_latest(product_key: str):
    """
    Download the latest GRIB2 file for a product.

    Uses the .latest symlink which always points to the most recent file.
    Returns decompressed GRIB2 bytes, or None on failure.
    """
    product = PRODUCTS[product_key]
    url = f"{BASE_URL}/{product['path']}/{product['latest']}"

    headers = {"User-Agent": USER_AGENT}

    try:
        logger.info(f"Downloading {product_key}: {url}")
        resp = requests.get(url, headers=headers, timeout=REQUEST_TIMEOUT,
                           allow_redirects=True)
        resp.raise_for_status()

        compressed_size = len(resp.content)
        logger.info(f"Downloaded {compressed_size / 1024:.1f} KB compressed")

        # Decompress gzip
        try:
            raw = gzip.decompress(resp.content)
        except gzip.BadGzipFile:
            # Some servers might serve uncompressed despite .gz extension
            raw = resp.content

        logger.info(f"Decompressed to {len(raw) / 1024:.1f} KB")
        return raw

    except requests.exceptions.Timeout:
        logger.error(f"Timeout downloading {product_key}")
    except requests.exceptions.ConnectionError as e:
        logger.error(f"Connection error for {product_key}: {e}")
    except requests.exceptions.HTTPError as e:
        logger.error(f"HTTP error for {product_key}: {e}")
    except Exception as e:
        logger.error(f"Unexpected error downloading {product_key}: {e}")

    return None


def get_file_timestamp(product_key: str):
    """
    Get the timestamp of the latest file by checking the directory listing.
    Returns the timestamp string from the filename, or None.
    """
    product = PRODUCTS[product_key]
    url = f"{BASE_URL}/{product['path']}/"

    try:
        # Just do a HEAD on the .latest file to get Last-Modified
        latest_url = f"{BASE_URL}/{product['path']}/{product['latest']}"
        resp = requests.head(latest_url, timeout=10,
                           headers={"User-Agent": USER_AGENT},
                           allow_redirects=True)
        last_modified = resp.headers.get("Last-Modified", "")
        return last_modified
    except Exception:
        return None


# ---------------------------------------------------------------------------
# State Management (avoid reprocessing)
# ---------------------------------------------------------------------------

def get_state_path(product_key: str) -> Path:
    """Path to the state file tracking last processed timestamp."""
    return DATA_DIR / f".last_{product_key}"


def was_already_processed(product_key: str, last_modified: str) -> bool:
    """Check if we already processed this exact file."""
    state_path = get_state_path(product_key)
    if state_path.exists():
        stored = state_path.read_text().strip()
        return stored == last_modified
    return False


def mark_processed(product_key: str, last_modified: str):
    """Mark a file as processed."""
    state_path = get_state_path(product_key)
    state_path.parent.mkdir(parents=True, exist_ok=True)
    state_path.write_text(last_modified)


# ---------------------------------------------------------------------------
# Metadata JSON for the tile server
# ---------------------------------------------------------------------------

def write_metadata(product_key: str, ref_time: datetime, grid: dict,
                   has_hail: bool, max_value: float, hail_pixels: int):
    """Write a JSON metadata file alongside the overlay PNG."""
    import json

    meta = {
        "product": product_key,
        "ref_time": ref_time.isoformat(),
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "has_hail": has_hail,
        "max_mesh_mm": round(float(max_value), 1),
        "max_mesh_inches": round(float(max_value) / 25.4, 2),
        "hail_pixels": int(hail_pixels),
        "bounds": {
            "north": grid["lat_north"],
            "south": grid["lat_south"],
            "west": grid["lon_west"],
            "east": grid["lon_east"],
        },
        "image_size": {
            "width": grid["ni"],
            "height": grid["nj"],
        },
    }

    meta_path = OUTPUT_DIR / f"{product_key}.json"
    meta_path.parent.mkdir(parents=True, exist_ok=True)
    meta_path.write_text(json.dumps(meta, indent=2))
    logger.info(f"Metadata written: {meta_path}")


# ---------------------------------------------------------------------------
# Cleanup
# ---------------------------------------------------------------------------

def cleanup_old_grib2():
    """Remove old GRIB2 files to prevent disk fill."""
    if not DATA_DIR.exists():
        return

    now = time.time()
    for f in DATA_DIR.glob("*.grib2*"):
        age = now - f.stat().st_mtime
        if age > GRIB2_RETENTION_SECONDS:
            f.unlink()
            logger.debug(f"Cleaned up old file: {f}")


# ---------------------------------------------------------------------------
# Main Pipeline
# ---------------------------------------------------------------------------

def process_product(product_key: str, force: bool = False,
                    downsample: int = 2) -> bool:
    """
    Download and process a single MRMS product.

    Args:
        product_key: "mesh60" or "mesh1440"
        force: Skip the "already processed" check
        downsample: Resolution reduction factor (2 = half res, saves RAM)

    Returns:
        True if processing succeeded, False otherwise.
    """
    # Check if there's new data
    if not force:
        last_modified = get_file_timestamp(product_key)
        if last_modified and was_already_processed(product_key, last_modified):
            logger.info(f"{product_key}: No new data (last modified: {last_modified})")
            return True
    else:
        last_modified = None

    # Download
    raw = download_latest(product_key)
    if raw is None:
        return False

    # Decode GRIB2
    try:
        result = decode_grib2(raw)
    except GRIB2DecodeError as e:
        logger.error(f"GRIB2 decode failed for {product_key}: {e}")
        return False

    data = result["data"]
    grid = result["grid"]
    ref_time = result["ref_time"]
    del raw, result  # Free memory immediately

    logger.info(
        f"{product_key}: ref_time={ref_time.isoformat()}, "
        f"grid={grid['ni']}x{grid['nj']}, "
        f"data range: {data.min():.1f} to {data.max():.1f} mm"
    )

    # Clamp negative values to 0 in-place (they mean "no hail")
    np.maximum(data, 0, out=data)

    # Create overlay PNG
    output_path = OUTPUT_DIR / f"{product_key}.png"
    has_hail = create_overlay_png(data, output_path, downsample=downsample)

    # Write metadata
    hail_mask = data > 0.01
    max_value = float(data.max()) if np.any(hail_mask) else 0.0
    hail_pixels = int(np.count_nonzero(hail_mask))
    write_metadata(product_key, ref_time, grid, has_hail, max_value, hail_pixels)

    # Mark as processed
    if last_modified:
        mark_processed(product_key, last_modified)

    # Cleanup old files
    cleanup_old_grib2()

    # Free memory explicitly (important on 1GB server)
    del data

    return True


def main():
    """Main entry point: process all products."""
    import argparse

    parser = argparse.ArgumentParser(
        description="MRMS MESH Hail Swath Downloader & Processor"
    )
    parser.add_argument(
        "--products", nargs="+", default=["mesh60", "mesh1440"],
        choices=list(PRODUCTS.keys()),
        help="Products to process (default: all)"
    )
    parser.add_argument(
        "--force", action="store_true",
        help="Force reprocessing even if data hasn't changed"
    )
    parser.add_argument(
        "--downsample", type=int, default=2,
        help="Downsample factor (default: 2 = 3500x1750 output)"
    )
    parser.add_argument(
        "--once", action="store_true",
        help="Run once and exit (default for systemd timer)"
    )
    parser.add_argument(
        "--loop", action="store_true",
        help="Run in a loop (mesh60 every 2min, mesh1440 every 30min)"
    )

    args = parser.parse_args()
    setup_logging()

    logger.info("=" * 60)
    logger.info("MRMS MESH Hail Swath Pipeline starting")
    logger.info(f"Products: {args.products}")
    logger.info(f"Downsample: {args.downsample}x")
    logger.info(f"Output directory: {OUTPUT_DIR}")
    logger.info("=" * 60)

    # Ensure directories exist
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

    if args.loop:
        run_loop(args.products, args.downsample)
    else:
        # Single run
        success = True
        for product in args.products:
            if not process_product(product, force=args.force,
                                   downsample=args.downsample):
                success = False

        if success:
            logger.info("All products processed successfully")
        else:
            logger.error("Some products failed to process")
            sys.exit(1)


def run_loop(products: list, downsample: int):
    """
    Run in a continuous loop. Useful if not using systemd timers.
    mesh60 is checked every 2 minutes, mesh1440 every 30 minutes.
    """
    last_1440 = 0
    cycle = 0

    logger.info("Starting continuous loop mode")

    while True:
        try:
            cycle += 1
            now = time.time()

            # Always process mesh60
            if "mesh60" in products:
                process_product("mesh60", downsample=downsample)

            # Process mesh1440 every 30 minutes (15 cycles)
            if "mesh1440" in products and (now - last_1440) >= 1800:
                process_product("mesh1440", downsample=downsample)
                last_1440 = now

            # Sleep 2 minutes between checks
            logger.info(f"Cycle {cycle} complete. Sleeping 120s...")
            time.sleep(120)

        except KeyboardInterrupt:
            logger.info("Interrupted, shutting down")
            break
        except Exception as e:
            logger.error(f"Unexpected error in loop: {e}", exc_info=True)
            time.sleep(30)  # Back off on error


if __name__ == "__main__":
    main()
