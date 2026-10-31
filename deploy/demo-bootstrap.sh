#!/usr/bin/env bash
# Initial boot only: no application data or credentials in VM metadata.
set -euo pipefail
install -d -m 0755 /var/lib/ai-dj
if [[ ! -f /var/lib/ai-dj/swapfile ]]; then
  fallocate -l 2G /var/lib/ai-dj/swapfile
  chmod 0600 /var/lib/ai-dj/swapfile
  mkswap /var/lib/ai-dj/swapfile >/dev/null
  echo '/var/lib/ai-dj/swapfile none swap sw 0 0' >> /etc/fstab
fi
swapon -a
cat > /etc/systemd/system/ai-dj-demo-stop.service <<'UNIT'
[Unit]
Description=Power off the on-demand AI DJ demo VM
[Service]
Type=oneshot
ExecStart=/usr/bin/systemctl poweroff
UNIT
cat > /etc/systemd/system/ai-dj-demo-stop.timer <<'UNIT'
[Unit]
Description=Limit each AI DJ demo boot to approximately 90 minutes
[Timer]
OnBootSec=90min
AccuracySec=30s
Unit=ai-dj-demo-stop.service
[Install]
WantedBy=timers.target
UNIT
systemctl daemon-reload
systemctl enable --now ai-dj-demo-stop.timer
