#!/bin/bash
# ===========================================================================
# RPi Calendar Kiosk Teardown
# Disables and removes the kiosk systemd services.
# Run: sudo bash kiosk-teardown.sh
# ===========================================================================
set -e

echo "=================================================="
echo " RPi Calendar Kiosk Teardown"
echo "=================================================="

for SVC in rpi-calendar-kiosk rpi-calendar-app; do
    if systemctl is-active --quiet "$SVC" 2>/dev/null; then
        echo "Stopping $SVC..."
        systemctl stop "$SVC"
    fi
    if systemctl is-enabled --quiet "$SVC" 2>/dev/null; then
        echo "Disabling $SVC..."
        systemctl disable "$SVC"
    fi
    if [ -f "/etc/systemd/system/$SVC.service" ]; then
        echo "Removing /etc/systemd/system/$SVC.service"
        rm -f "/etc/systemd/system/$SVC.service"
    fi
done

systemctl daemon-reload

echo ""
echo "Done. Services removed."
echo "To re-enable: sudo bash kiosk-setup.sh"
