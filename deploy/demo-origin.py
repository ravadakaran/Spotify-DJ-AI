"""Refresh the HTTPS origin after an ephemeral-IP change; run as root."""
import json
import os
import urllib.request

request = urllib.request.Request(
    "http://metadata.google.internal/computeMetadata/v1/instance/network-interfaces/0/access-configs/0/external-ip",
    headers={"Metadata-Flavor": "Google"},
)
with urllib.request.urlopen(request, timeout=15) as response:
    host = response.read().decode().strip()
import ipaddress

ipaddress.IPv4Address(host)
with open("/etc/ai-dj/secrets.json") as file:
    secrets = json.load(file)
edge = {}
if os.path.isfile("/etc/ai-dj/vercel-edge.json"):
    with open("/etc/ai-dj/vercel-edge.json") as file:
        edge = json.load(file)
env = {
    "NODE_ENV": "production",
    "PORT": "3000",
    "APP_ORIGIN": edge.get("appOrigin", f"https://{host}"),
    "COOKIE_SECURE": "true",
    "TRUST_LOOPBACK_PROXY": "true",
    "MONGODB_URI": f"mongodb://ai_dj:{secrets['appPassword']}@127.0.0.1:27017/ai_dj?authSource=ai_dj&replicaSet=rs0&directConnection=true",
    "JWT_SIGNING_KEY": secrets["signingKey"],
    "JWT_ISSUER": "ai-dj-demo",
    "JWT_AUDIENCE": "ai-dj-client",
    "ASSET_ROOT": "/var/lib/ai-dj/assets",
    "AI_METADATA_APPROVED": "false",
    "OLLAMA_MODEL": "",
}
for filename, values in [
    ("environment", env),
    (
        "caddy-environment",
        {
            "DJ_HOST": host,
            "VERCEL_FRONTEND_HOST": "ai-dj-studio-5bd55o3r4-ravadakarans-projects.vercel.app",
            **({"VERCEL_ORIGIN_SECRET": edge["originSecret"], "DEMO_CLIENT_IP": edge["clientIPv4"]} if edge else {}),
        },
    ),
]:
    with open(f"/etc/ai-dj/{filename}", "w") as file:
        os.chmod(file.name, 0o600)
        file.write("".join(f"{key}={value}\n" for key, value in values.items()))
print(f"Demo origin configured: https://{host}")
