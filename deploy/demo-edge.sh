#!/usr/bin/env bash
set -euo pipefail
install -m 0644 /tmp/Caddyfile.demo /etc/caddy/Caddyfile
set -a
source /etc/ai-dj/caddy-environment
set +a
/usr/local/bin/caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile
if systemctl is-active --quiet caddy; then
  systemctl reload caddy
else
  systemctl enable --now caddy
fi
for attempt in $(seq 1 30); do
  if curl -fsS http://127.0.0.1:3000/api/v1/health/ready >/dev/null 2>&1; then break; fi
  sleep 2
done
curl -fsS http://127.0.0.1:3000/api/v1/health/ready
echo
