# Local data and media provenance

`assets/` stores administrator-uploaded original/authorized WAV and MP3 files under generated names. A corresponding audio_assets record contains license label, source attribution, checksum, byte length and uploader. Actual files are ignored by Git. `local-db/` is created by the Docker-free local helper and holds private MongoDB data; never commit it.

No audio has been imported. The user reported that files in `D:\DJ` were sourced from YouTube. No reuse license was established, so the application has not copied or ingested those files. Catalog seeding inserts three visibly metadata-only fictional profiles with null assetId and no lore; they are not recordings, extraction results or proof of music rights.

Before media demonstration, provide three original or appropriately licensed files and record source URL/license text or creator statement in each asset's provenance. Author realistic BPM/key/energy/valence profiles; do not guess them from commercial track names. The recommendation evaluation remains planned for a larger ≥20-track catalog with ≥10 demo users and a chronological held-out interaction split. No sentiment or recommendation evaluation results exist yet.
