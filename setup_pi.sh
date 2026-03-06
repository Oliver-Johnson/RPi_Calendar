#!/bin/bash
set -e

echo "==============================="
echo "  Pi-Schedule Setup"
echo "==============================="
echo

# Update system packages
echo "[1/5] Updating system packages..."
sudo apt update && sudo apt upgrade -y

# Install Python 3 and pip
echo "[2/5] Installing Python 3..."
sudo apt install -y python3 python3-pip python3-venv

# Create virtual environment
echo "[3/5] Creating virtual environment..."
python3 -m venv venv
source venv/bin/activate

# Install dependencies
echo "[4/5] Installing Python dependencies..."
pip install -r requirements.txt

# Create .env from example if it doesn't exist
if [ ! -f .env ]; then
    cp .env.example .env
    echo ""
    echo ">>> Created .env file. Edit it with your Azure credentials:"
    echo ">>>   nano .env"
    echo ""
fi

# Create systemd service
echo "[5/5] Setting up systemd service..."
sudo tee /etc/systemd/system/pi-schedule.service > /dev/null <<EOF
[Unit]
Description=Pi-Schedule Calendar App
After=network.target

[Service]
User=$USER
WorkingDirectory=$(pwd)
ExecStart=$(pwd)/venv/bin/python run.py
Restart=always
Environment=FLASK_ENV=production

[Install]
WantedBy=multi-user.target
EOF

sudo systemctl daemon-reload
sudo systemctl enable pi-schedule
sudo systemctl start pi-schedule

IP_ADDR=$(hostname -I | awk '{print $1}')

echo ""
echo "==============================="
echo "  Setup complete!"
echo "==============================="
echo ""
echo "Pi-Schedule is running at: http://${IP_ADDR}:5000"
echo ""
echo "To view logs:    sudo journalctl -u pi-schedule -f"
echo "To restart:      sudo systemctl restart pi-schedule"
echo "To stop:         sudo systemctl stop pi-schedule"
echo ""
