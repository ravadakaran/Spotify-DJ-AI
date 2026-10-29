#!/usr/bin/env bash
# Select Ubuntu 24.04's maintained GA kernel for MongoDB 8 compatibility.
set -euo pipefail
export DEBIAN_FRONTEND=noninteractive
apt-get install -y -qq --no-install-recommends linux-image-generic
# Keep early-boot decompression within the 1 GB demo machine's memory.
# Rebuild on the target VM so its storage/network drivers are detected.
printf 'MODULES=dep\n' > /etc/initramfs-tools/conf.d/ai-dj-small-vm
demo_ga_image=$(find /boot -maxdepth 1 -name 'vmlinuz-6.8.*-generic' -printf '%f\n' | sort -V | tail -n 1)
test -n "$demo_ga_image"
update-initramfs -u -k "${demo_ga_image#vmlinuz-}"
cat > /etc/default/grub.d/99-ai-dj-demo.cfg <<'CONF'
# Recompute on every update-grub so GA security updates remain selected.
GRUB_FORCE_PARTUUID=
demo_ga_kernel=$(find /boot -maxdepth 1 -name 'vmlinuz-6.8.*-generic' -printf '%f\n' | sort -V | tail -n 1)
if [ -n "$demo_ga_kernel" ]; then
  GRUB_DEFAULT="Advanced options for Ubuntu>Ubuntu, with Linux ${demo_ga_kernel#vmlinuz-}"
fi
CONF
update-grub
echo 'GA kernel configured. Reboot and verify uname -r before MongoDB setup.'
