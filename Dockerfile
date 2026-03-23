FROM python:3.11-slim

WORKDIR /app

# System libraries required by Camoufox (StealthyFetcher headless browser)
RUN apt-get update && apt-get install -y --no-install-recommends \
    wget \
    ca-certificates \
    fonts-liberation \
    libgtk-3-0 \
    libdbus-glib-1-2 \
    libxt6 \
    libasound2 \
    libxcomposite1 \
    libxdamage1 \
    libxfixes3 \
    libxrandr2 \
    libpci3 \
    libxss1 \
    libgbm1 \
    libnss3 \
    && rm -rf /var/lib/apt/lists/*

# Install Python dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Install Camoufox browser (used by scrapling's StealthyFetcher)
RUN scrapling install

# Copy application code
COPY . .

EXPOSE 5000

# Single worker to avoid duplicate APScheduler instances.
# Timeout 120 s accommodates the 90 s Job Applier webhook budget.
CMD ["gunicorn", "--workers", "1", "--bind", "0.0.0.0:5000", "--timeout", "120", "run:app"]
