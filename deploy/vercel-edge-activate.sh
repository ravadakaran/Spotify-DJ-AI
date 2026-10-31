#!/usr/bin/env bash
set -euo pipefail
# Run as root after uploading the reviewed files and private edge config.
test -s /tmp/vercel-edge.json
install -m 0600 /tmp/vercel-edge.json /etc/ai-dj/vercel-edge.json
install -m 0700 /tmp/demo-origin.py /etc/ai-dj/origin.py
python3 /etc/ai-dj/origin.py
set -a
source /etc/ai-dj/caddy-environment
set +a
/usr/local/bin/caddy validate --config /tmp/Caddyfile.vercel-demo --adapter caddyfile
cp -n /etc/caddy/Caddyfile /etc/ai-dj/Caddyfile.before-vercel || true
install -m 0644 /tmp/Caddyfile.vercel-demo /etc/caddy/Caddyfile
rm -f /tmp/vercel-edge.json
systemctl restart ai-dj
# Reload does not refresh EnvironmentFile; restart reads the new secret/IP.
systemctl restart caddy
for attempt in $(seq 1 45); do
    if curl -fsS http://127.0.0.1:3000/api/v1/health/ready; then
        echo
        exit 0
    fi
    sleep 2
done
exit 1
