#!/usr/bin/env bash
#
# MRMS MESH Hail Swath Pipeline - Oracle Cloud Deployment Script
#
# Deploys the MRMS pipeline to an Oracle Cloud Ubuntu server:
#   - Copies Python scripts
#   - Installs Python dependencies
#   - Creates systemd services and timers
#   - Opens firewall port 8090
#   - Runs an initial data fetch
#
# Usage:
#   ./deploy.sh                 # Deploy to default server
#   ./deploy.sh 10.0.0.1       # Deploy to custom IP
#   ./deploy.sh --local-test   # Test locally without deploying
#
# Requirements:
#   - SSH key at ~/.ssh/id_ed25519 with access to the server
#   - Server running Ubuntu 22.04 with Python 3.10+
#

set -euo pipefail

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------

SERVER_IP="${1:-129.159.190.3}"
SSH_KEY="$HOME/.ssh/id_ed25519"
SSH_USER="ubuntu"
SSH_CMD="ssh -i $SSH_KEY -o StrictHostKeyChecking=no $SSH_USER@$SERVER_IP"
SCP_CMD="scp -i $SSH_KEY -o StrictHostKeyChecking=no"

REMOTE_DIR="/opt/mrms-tiles"
REMOTE_VENV="$REMOTE_DIR/venv"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

log() { echo -e "${GREEN}[DEPLOY]${NC} $*"; }
warn() { echo -e "${YELLOW}[WARN]${NC} $*"; }
error() { echo -e "${RED}[ERROR]${NC} $*"; exit 1; }

# ---------------------------------------------------------------------------
# Local test mode
# ---------------------------------------------------------------------------

if [[ "${1:-}" == "--local-test" ]]; then
    log "Running local test..."

    # Create local directories mimicking server
    TEST_DIR="/tmp/mrms-test"
    mkdir -p "$TEST_DIR/data" "$TEST_DIR/overlays" "$TEST_DIR/log"

    export MRMS_DATA_DIR="$TEST_DIR/data"
    export MRMS_OUTPUT_DIR="$TEST_DIR/overlays"
    export MRMS_LOG_DIR="$TEST_DIR/log"

    log "Running downloader (single fetch)..."
    python3 "$SCRIPT_DIR/download_mrms.py" --once --force --downsample 2

    log "Output files:"
    ls -la "$TEST_DIR/overlays/"

    if [[ -f "$TEST_DIR/overlays/mesh60.json" ]]; then
        log "Metadata:"
        cat "$TEST_DIR/overlays/mesh60.json"
    fi

    log ""
    log "To test the server:"
    log "  MRMS_OUTPUT_DIR=$TEST_DIR/overlays python3 $SCRIPT_DIR/serve_tiles.py --port 8090"
    log "  Then open http://localhost:8090/"
    exit 0
fi

# ---------------------------------------------------------------------------
# Pre-flight checks
# ---------------------------------------------------------------------------

log "Pre-flight checks..."

if [[ ! -f "$SSH_KEY" ]]; then
    error "SSH key not found: $SSH_KEY"
fi

# Test SSH connection
if ! $SSH_CMD "echo 'SSH OK'" &>/dev/null; then
    error "Cannot SSH to $SSH_USER@$SERVER_IP"
fi
log "SSH connection OK"

# Check Python version on server
PYTHON_VERSION=$($SSH_CMD "python3 --version 2>&1" || echo "MISSING")
log "Server Python: $PYTHON_VERSION"

if [[ "$PYTHON_VERSION" == "MISSING" ]]; then
    error "Python3 not found on server"
fi

# ---------------------------------------------------------------------------
# Deploy files
# ---------------------------------------------------------------------------

log "Creating remote directories..."
$SSH_CMD "sudo mkdir -p $REMOTE_DIR/{data,overlays} /var/log/mrms && \
          sudo chown -R $SSH_USER:$SSH_USER $REMOTE_DIR /var/log/mrms"

log "Copying pipeline scripts..."
$SCP_CMD "$SCRIPT_DIR/download_mrms.py" "$SSH_USER@$SERVER_IP:/tmp/"
$SCP_CMD "$SCRIPT_DIR/serve_tiles.py" "$SSH_USER@$SERVER_IP:/tmp/"
$SCP_CMD "$SCRIPT_DIR/requirements.txt" "$SSH_USER@$SERVER_IP:/tmp/"

$SSH_CMD "sudo cp /tmp/download_mrms.py /tmp/serve_tiles.py /tmp/requirements.txt $REMOTE_DIR/ && \
          sudo chown $SSH_USER:$SSH_USER $REMOTE_DIR/*.py $REMOTE_DIR/requirements.txt && \
          chmod +x $REMOTE_DIR/download_mrms.py $REMOTE_DIR/serve_tiles.py"

# ---------------------------------------------------------------------------
# Install dependencies
# ---------------------------------------------------------------------------

log "Setting up Python virtual environment..."
$SSH_CMD "
    if [[ ! -d $REMOTE_VENV ]]; then
        python3 -m venv $REMOTE_VENV
    fi
    source $REMOTE_VENV/bin/activate
    pip install --upgrade pip setuptools wheel 2>&1 | tail -1
    pip install -r $REMOTE_DIR/requirements.txt 2>&1 | tail -3
"

# ---------------------------------------------------------------------------
# Create systemd services
# ---------------------------------------------------------------------------

log "Creating systemd service files..."

# 1. mrms-downloader.service (oneshot, triggered by timer)
$SSH_CMD "sudo tee /etc/systemd/system/mrms-downloader.service > /dev/null" << 'UNIT_EOF'
[Unit]
Description=MRMS MESH Hail Swath Downloader
After=network-online.target
Wants=network-online.target

[Service]
Type=oneshot
User=ubuntu
Group=ubuntu
WorkingDirectory=/opt/mrms-tiles
Environment=MRMS_DATA_DIR=/opt/mrms-tiles/data
Environment=MRMS_OUTPUT_DIR=/opt/mrms-tiles/overlays
Environment=MRMS_LOG_DIR=/var/log/mrms
ExecStart=/opt/mrms-tiles/venv/bin/python3 /opt/mrms-tiles/download_mrms.py --once --products mesh60 mesh1440 --downsample 2
TimeoutStartSec=120
MemoryMax=512M
CPUQuota=80%

# Restart on failure after 30s delay
Restart=on-failure
RestartSec=30

# Logging
StandardOutput=journal
StandardError=journal
SyslogIdentifier=mrms-downloader

[Install]
WantedBy=multi-user.target
UNIT_EOF

# 2. mrms-downloader.timer (every 5 minutes)
$SSH_CMD "sudo tee /etc/systemd/system/mrms-downloader.timer > /dev/null" << 'TIMER_EOF'
[Unit]
Description=MRMS MESH Hail Swath Download Timer (every 5 min)

[Timer]
OnBootSec=30
OnUnitActiveSec=300
AccuracySec=30
Persistent=true

[Install]
WantedBy=timers.target
TIMER_EOF

# 3. mrms-tileserver.service (always-on HTTP server)
$SSH_CMD "sudo tee /etc/systemd/system/mrms-tileserver.service > /dev/null" << 'SERVER_EOF'
[Unit]
Description=MRMS MESH Hail Swath Tile Server
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=ubuntu
Group=ubuntu
WorkingDirectory=/opt/mrms-tiles
Environment=MRMS_OUTPUT_DIR=/opt/mrms-tiles/overlays
Environment=MRMS_LOG_DIR=/var/log/mrms
Environment=MRMS_PORT=8090
ExecStart=/opt/mrms-tiles/venv/bin/python3 /opt/mrms-tiles/serve_tiles.py --port 8090
Restart=always
RestartSec=5
MemoryMax=256M

# Logging
StandardOutput=journal
StandardError=journal
SyslogIdentifier=mrms-tileserver

[Install]
WantedBy=multi-user.target
SERVER_EOF

# ---------------------------------------------------------------------------
# Open firewall port
# ---------------------------------------------------------------------------

log "Configuring firewall for port 8090..."
$SSH_CMD "
    # iptables rule (Oracle Cloud Ubuntu uses iptables, not ufw)
    if ! sudo iptables -L INPUT -n 2>/dev/null | grep -q '8090'; then
        sudo iptables -I INPUT -p tcp --dport 8090 -j ACCEPT
        # Persist across reboots
        if command -v netfilter-persistent &>/dev/null; then
            sudo netfilter-persistent save 2>/dev/null || true
        elif [[ -f /etc/iptables/rules.v4 ]]; then
            sudo iptables-save | sudo tee /etc/iptables/rules.v4 > /dev/null
        fi
        echo 'Firewall rule added for port 8090'
    else
        echo 'Port 8090 already open'
    fi
"

# ---------------------------------------------------------------------------
# Enable and start services
# ---------------------------------------------------------------------------

log "Enabling and starting services..."
$SSH_CMD "
    sudo systemctl daemon-reload

    # Start tile server
    sudo systemctl enable mrms-tileserver.service
    sudo systemctl restart mrms-tileserver.service

    # Enable timer
    sudo systemctl enable mrms-downloader.timer
    sudo systemctl start mrms-downloader.timer

    # Run initial download immediately
    echo 'Running initial data fetch...'
    sudo systemctl start mrms-downloader.service

    echo ''
    echo '=== Service Status ==='
    sudo systemctl status mrms-tileserver.service --no-pager -l 2>/dev/null | head -15
    echo ''
    sudo systemctl status mrms-downloader.timer --no-pager -l 2>/dev/null | head -10
    echo ''
    echo '=== Timer Schedule ==='
    sudo systemctl list-timers mrms-downloader.timer --no-pager 2>/dev/null
"

# ---------------------------------------------------------------------------
# Verify deployment
# ---------------------------------------------------------------------------

log "Waiting for initial download to complete..."
sleep 10

log "Checking deployment..."
$SSH_CMD "
    echo '=== Output Files ==='
    ls -la $REMOTE_DIR/overlays/ 2>/dev/null || echo 'No overlays yet'
    echo ''

    echo '=== Recent Logs ==='
    journalctl -u mrms-downloader.service --no-pager -n 20 2>/dev/null || \
        cat /var/log/mrms/mrms-pipeline.log 2>/dev/null | tail -20 || \
        echo 'No logs yet'
    echo ''

    echo '=== Tile Server Check ==='
    curl -s http://localhost:8090/api/status 2>/dev/null | python3 -m json.tool 2>/dev/null || \
        echo 'Server not responding yet (may still be starting)'
"

# ---------------------------------------------------------------------------
# Summary
# ---------------------------------------------------------------------------

echo ""
log "==========================================="
log "  MRMS Pipeline Deployment Complete"
log "==========================================="
log ""
log "Tile Server:  http://$SERVER_IP:8090/"
log "Status API:   http://$SERVER_IP:8090/api/status"
log "Products API: http://$SERVER_IP:8090/api/products"
log ""
log "Overlay URLs (for Leaflet ImageOverlay):"
log "  60-min:  http://$SERVER_IP:8090/overlays/mesh60.png"
log "  24-hour: http://$SERVER_IP:8090/overlays/mesh1440.png"
log ""
log "Metadata URLs:"
log "  60-min:  http://$SERVER_IP:8090/overlays/mesh60.json"
log "  24-hour: http://$SERVER_IP:8090/overlays/mesh1440.json"
log ""
log "Management commands:"
log "  View logs:     $SSH_CMD 'journalctl -u mrms-downloader -f'"
log "  Server logs:   $SSH_CMD 'journalctl -u mrms-tileserver -f'"
log "  Force refresh: $SSH_CMD 'sudo systemctl start mrms-downloader'"
log "  Stop server:   $SSH_CMD 'sudo systemctl stop mrms-tileserver'"
log "  Timer status:  $SSH_CMD 'systemctl list-timers mrms*'"
log ""
log "IMPORTANT: You also need to open port 8090 in the Oracle Cloud"
log "  console Security List / Network Security Group (ingress rule"
log "  for TCP port 8090 from 0.0.0.0/0)."
