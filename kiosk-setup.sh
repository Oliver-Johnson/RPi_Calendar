#!/bin/bash
# ===========================================================================
# RPi Calendar Kiosk Setup
# Run once on the Raspberry Pi: sudo bash kiosk-setup.sh
# ===========================================================================
set -e

# Detect install directory (where this script lives)
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
APP_DIR="${APP_DIR:-$SCRIPT_DIR}"
APP_USER="${SUDO_USER:-pi}"
APP_PORT="${APP_PORT:-5000}"

echo "=================================================="
echo " RPi Calendar Kiosk Setup"
echo " App dir  : $APP_DIR"
echo " App user : $APP_USER"
echo " App port : $APP_PORT"
echo "=================================================="

# ---------------------------------------------------------------------------
# 1. Install unclutter (hides mouse cursor)
# ---------------------------------------------------------------------------
echo "[1/5] Installing unclutter..."
apt-get install -y unclutter

# ---------------------------------------------------------------------------
# 2. Disable screen blanking / DPMS
# ---------------------------------------------------------------------------
echo "[2/5] Disabling screen blanking..."
XORG_CONF_DIR=/etc/X11/xorg.conf.d
mkdir -p "$XORG_CONF_DIR"
cat > "$XORG_CONF_DIR/10-blanking.conf" <<'EOF'
Section "Monitor"
    Identifier "Monitor0"
    Option     "DPMS" "false"
EndSection

Section "ServerLayout"
    Identifier "Layout0"
    Option     "StandbyTime"  "0"
    Option     "SuspendTime"  "0"
    Option     "OffTime"      "0"
    Option     "BlankTime"    "0"
EndSection

Section "ServerFlags"
    Option "BlankTime"    "0"
    Option "StandbyTime"  "0"
    Option "SuspendTime"  "0"
    Option "OffTime"      "0"
EndSection
EOF
echo "   Written $XORG_CONF_DIR/10-blanking.conf"

# ---------------------------------------------------------------------------
# 3. Flask app service
# ---------------------------------------------------------------------------
echo "[3/5] Creating rpi-calendar-app.service..."
cat > /etc/systemd/system/rpi-calendar-app.service <<EOF
[Unit]
Description=RPi Calendar Flask App
After=network.target
Wants=network-online.target

[Service]
Type=simple
User=$APP_USER
WorkingDirectory=$APP_DIR
ExecStart=/usr/bin/env python run.py
Restart=always
RestartSec=5
EnvironmentFile=$APP_DIR/.env
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
EOF
echo "   Written /etc/systemd/system/rpi-calendar-app.service"

# ---------------------------------------------------------------------------
# 4. Chromium kiosk service
# ---------------------------------------------------------------------------
echo "[4/5] Creating rpi-calendar-kiosk.service..."
cat > /etc/systemd/system/rpi-calendar-kiosk.service <<EOF
[Unit]
Description=RPi Calendar Chromium Kiosk
After=graphical.target rpi-calendar-app.service
Wants=rpi-calendar-app.service

[Service]
Type=simple
User=$APP_USER
Environment=DISPLAY=:0
Environment=XAUTHORITY=/home/$APP_USER/.Xauthority
# Wait until Flask is responding before launching the browser
ExecStartPre=/bin/bash -c '\
  echo "Waiting for Flask app on port $APP_PORT..."; \
  for i in \$(seq 1 30); do \
    curl -sf http://localhost:$APP_PORT/ > /dev/null 2>&1 && exit 0; \
    sleep 5; \
  done; \
  echo "WARNING: Flask did not respond after 150s, launching browser anyway"'
ExecStart=/usr/bin/chromium-browser \
    --kiosk \
    --noerrdialogs \
    --disable-infobars \
    --disable-session-crashed-bubble \
    --disable-component-update \
    --check-for-update-interval=31536000 \
    --autoplay-policy=no-user-gesture-required \
    --start-fullscreen \
    --enable-features=OverlayScrollbar \
    --no-first-run \
    --incognito \
    http://localhost:$APP_PORT
Restart=always
RestartSec=10

[Install]
WantedBy=graphical.target
EOF
echo "   Written /etc/systemd/system/rpi-calendar-kiosk.service"

# ---------------------------------------------------------------------------
# 5. Enable and start services
# ---------------------------------------------------------------------------
echo "[5/5] Enabling and starting services..."
systemctl daemon-reload
systemctl enable --now rpi-calendar-app.service
systemctl enable --now rpi-calendar-kiosk.service

echo ""
echo "=================================================="
echo " Kiosk setup complete!"
echo ""
echo " Services:"
echo "   rpi-calendar-app    — Flask backend"
echo "   rpi-calendar-kiosk  — Chromium kiosk"
echo ""
echo " Useful commands:"
echo "   sudo systemctl status rpi-calendar-app"
echo "   sudo systemctl status rpi-calendar-kiosk"
echo "   sudo journalctl -u rpi-calendar-app -f"
echo "   sudo journalctl -u rpi-calendar-kiosk -f"
echo ""
echo " App URL: http://localhost:$APP_PORT"
echo "=================================================="
