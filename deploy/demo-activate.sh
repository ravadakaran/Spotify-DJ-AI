#!/usr/bin/env bash
# Run as root after uploading /tmp/ai-dj-release.tgz and the deploy templates.
set -euo pipefail
release_digest=$(sha256sum /tmp/ai-dj-release.tgz | cut -d ' ' -f 1)
if systemctl is-active --quiet ai-dj.service; then
  echo 'Refusing to replace dependencies of a running app. Follow the release/backup procedure.' >&2
  exit 1
fi
install -d -o ai-dj -g ai-dj -m 0755 /opt/ai-dj
if [[ -e /opt/ai-dj/package.json ]]; then
  if [[ ! -f /opt/ai-dj/.release-sha256 || $(cat /opt/ai-dj/.release-sha256) != "$release_digest" ]]; then
    echo 'Different existing release detected: follow the backup/release procedure.' >&2
    exit 1
  fi
else
  tar -xzf /tmp/ai-dj-release.tgz -C /opt/ai-dj
  printf '%s\n' "$release_digest" > /opt/ai-dj/.release-sha256
fi
chown -R ai-dj:ai-dj /opt/ai-dj
cd /opt/ai-dj
install -d -o ai-dj -g ai-dj -m 0700 /var/cache/ai-dj/npm
sudo -u ai-dj npm ci --cache=/var/cache/ai-dj/npm --omit=dev --no-audit --no-fund
install -m 0700 /tmp/demo-origin.py /etc/ai-dj/origin.py
python3 /etc/ai-dj/origin.py
node --env-file=/etc/ai-dj/environment server/src/cli.js migrate
node --env-file=/etc/ai-dj/environment server/src/cli.js seed

cat > /etc/systemd/system/ai-dj-origin.service <<'UNIT'
[Unit]
Description=Refresh demo origin for the current ephemeral address
Wants=network-online.target
After=network-online.target
Before=ai-dj.service caddy.service
[Service]
Type=oneshot
ExecStart=/usr/bin/python3 /etc/ai-dj/origin.py
RemainAfterExit=true
[Install]
WantedBy=multi-user.target
UNIT
install -m 0644 /tmp/ai-dj.service /etc/systemd/system/ai-dj.service
install -d -m 0755 /etc/systemd/system/ai-dj.service.d
cat > /etc/systemd/system/ai-dj.service.d/demo.conf <<'UNIT'
[Unit]
Requires=mongod.service ai-dj-origin.service
After=mongod.service ai-dj-origin.service
[Service]
Environment=NODE_OPTIONS=--max-old-space-size=256
UNIT
cat > /etc/systemd/system/caddy.service <<'UNIT'
[Unit]
Description=AI DJ HTTPS edge
Wants=network-online.target
Requires=ai-dj-origin.service
After=network-online.target ai-dj-origin.service
[Service]
Type=notify
User=caddy
Group=caddy
Environment=HOME=/var/lib/caddy
EnvironmentFile=/etc/ai-dj/caddy-environment
ExecStart=/usr/local/bin/caddy run --config /etc/caddy/Caddyfile --adapter caddyfile
ExecReload=/usr/local/bin/caddy reload --config /etc/caddy/Caddyfile --adapter caddyfile
TimeoutStopSec=10s
LimitNOFILE=1048576
AmbientCapabilities=CAP_NET_BIND_SERVICE
CapabilityBoundingSet=CAP_NET_BIND_SERVICE
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
ProtectHome=true
ReadWritePaths=/var/lib/caddy
[Install]
WantedBy=multi-user.target
UNIT
install -m 0644 /tmp/Caddyfile.demo /etc/caddy/Caddyfile
systemctl daemon-reload
systemctl enable --now ai-dj-origin.service ai-dj.service
set -a
source /etc/ai-dj/caddy-environment
set +a
/usr/local/bin/caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile
systemctl stop ai-dj-client-ip.service || true
systemctl enable --now caddy
for attempt in $(seq 1 30); do
  if curl -fsS http://127.0.0.1:3000/api/v1/health/ready >/dev/null 2>&1; then break; fi
  sleep 2
done
curl -fsS http://127.0.0.1:3000/api/v1/health/ready
echo
echo 'Application activated. Verify HTTPS and authorization before sharing.'
