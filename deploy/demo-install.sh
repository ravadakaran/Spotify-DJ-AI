#!/usr/bin/env bash
# Run as root on the dedicated, new Ubuntu 24.04 demo VM only.
set -euo pipefail
export DEBIAN_FRONTEND=noninteractive
[[ $(. /etc/os-release; echo "$VERSION_ID") == 24.04 ]]
if [[ $(uname -r) != 6.8.*-generic ]]; then
  echo 'Use demo-kernel.sh and reboot into the maintained Ubuntu 24.04 GA kernel first.' >&2
  exit 1
fi
apt-get update -qq
apt-get install -y -qq ca-certificates curl gnupg python3 openssl
curl -fsSL https://deb.nodesource.com/gpgkey/nodesource-repo.gpg.key | gpg --dearmor --yes -o /usr/share/keyrings/nodesource.gpg
echo 'deb [arch=amd64 signed-by=/usr/share/keyrings/nodesource.gpg] https://deb.nodesource.com/node_24.x nodistro main' > /etc/apt/sources.list.d/nodesource.list
curl -fsSL https://pgp.mongodb.com/server-8.0.asc | gpg --dearmor --yes -o /usr/share/keyrings/mongodb-server-8.0.gpg
echo 'deb [arch=amd64 signed-by=/usr/share/keyrings/mongodb-server-8.0.gpg] https://repo.mongodb.org/apt/ubuntu noble/mongodb-org/8.0 multiverse' > /etc/apt/sources.list.d/mongodb-org-8.0.list
apt-get update -qq
apt-get install -y -qq nodejs mongodb-org-server mongodb-mongosh
node -e 'if(Number(process.versions.node.split(".")[0])!==24) process.exit(1)'

install -d -m 0700 /etc/ai-dj
id ai-dj >/dev/null 2>&1 || useradd --system --home /var/lib/ai-dj --shell /usr/sbin/nologin ai-dj
install -d -o ai-dj -g ai-dj -m 0700 /var/lib/ai-dj/assets
if [[ ! -f /etc/ai-dj/secrets.json ]]; then
  python3 - <<'PY'
import json,secrets,os
with open('/etc/ai-dj/secrets.json','x') as f:
    os.chmod(f.name,0o600)
    json.dump({k:secrets.token_hex(48) for k in ['operatorPassword','appPassword','signingKey']},f)
PY
fi
if [[ ! -f /etc/ai-dj/mongo-key ]]; then
  openssl rand -base64 512 > /etc/ai-dj/mongo-key
fi
chown mongodb:mongodb /etc/ai-dj/mongo-key
chmod 0400 /etc/ai-dj/mongo-key
# MongoDB must traverse its key directory, while secrets remain root-only.
chown root:mongodb /etc/ai-dj
chmod 0750 /etc/ai-dj
cat > /etc/mongod.conf <<'CONF'
storage:
  dbPath: /var/lib/mongodb
  wiredTiger:
    engineConfig:
      cacheSizeGB: 0.25
systemLog:
  destination: file
  logAppend: true
  path: /var/log/mongodb/mongod.log
net:
  port: 27017
  bindIp: 127.0.0.1
replication:
  replSetName: rs0
security:
  keyFile: /etc/ai-dj/mongo-key
  authorization: enabled
CONF
systemctl enable mongod
systemctl restart mongod
cat > /etc/ai-dj/init-db.js <<'JS'
const s=JSON.parse(require('fs').readFileSync('/etc/ai-dj/secrets.json','utf8'));
const admin=db.getSiblingDB('admin');
let authenticated=false;
try { authenticated=!!admin.auth('operator',s.operatorPassword).ok; } catch {}
try { rs.status(); } catch(e) {
  if(e.code===94 || (e.code===13 && !authenticated)) {
    try { rs.initiate({_id:'rs0',members:[{_id:0,host:'localhost:27017'}]}); }
    catch(initError) { if(initError.code!==23) throw initError; }
  }
  else if(e.code!==13) throw e;
}
let primary=false;
for(let n=0;n<60;n++){if(db.hello().isWritablePrimary){primary=true;break;}sleep(1000);}
if(!primary) throw Error('Replica set did not elect primary');
if(!authenticated){
  admin.createUser({user:'operator',pwd:s.operatorPassword,roles:[{role:'root',db:'admin'}]});
  admin.auth('operator',s.operatorPassword);
}
const app=db.getSiblingDB('ai_dj');
if(!app.getUser('ai_dj')) app.createUser({user:'ai_dj',pwd:s.appPassword,roles:[{role:'readWrite',db:'ai_dj'},{role:'dbAdmin',db:'ai_dj'}]});
print('Authenticated replica set initialized; secrets not displayed.');
JS
chmod 0600 /etc/ai-dj/init-db.js
for n in $(seq 1 30); do
  if mongosh --quiet --eval 'db.hello().ok' >/dev/null 2>&1; then break; fi
  sleep 1
done
mongosh --quiet --file /etc/ai-dj/init-db.js

# Install the pinned Caddy binary after checking its publisher's checksum list.
install -d -m 0755 /opt/ai-dj-downloads
cd /opt/ai-dj-downloads
curl -fsSLO https://github.com/caddyserver/caddy/releases/download/v2.11.7/caddy_2.11.7_linux_amd64.tar.gz
curl -fsSLO https://github.com/caddyserver/caddy/releases/download/v2.11.7/caddy_2.11.7_checksums.txt
checksum_line=$(tr -d '\r' < caddy_2.11.7_checksums.txt | grep ' caddy_2.11.7_linux_amd64.tar.gz$')
checksum_hex=${checksum_line%% *}
case ${#checksum_hex} in
  64) printf '%s\n' "$checksum_line" | sha256sum --check - ;;
  128) printf '%s\n' "$checksum_line" | sha512sum --check - ;;
  *) echo 'Unrecognized publisher checksum format' >&2; exit 1 ;;
esac
tar -xzf caddy_2.11.7_linux_amd64.tar.gz caddy
install -m 0755 caddy /usr/local/bin/caddy
id caddy >/dev/null 2>&1 || useradd --system --home /var/lib/caddy --shell /usr/sbin/nologin caddy
install -d -o caddy -g caddy -m 0700 /var/lib/caddy
install -d -m 0755 /etc/caddy
echo 'Runtime packages installed; application activation is separate.'
node --version
mongod --version | head -n 1
/usr/local/bin/caddy version
