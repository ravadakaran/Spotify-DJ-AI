// Offline logical backup: stop the application and every other writer first.
import mongoose from "mongoose";
const { EJSON } = mongoose.mongo.BSON;
import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import {
  mkdir,
  writeFile,
  readFile,
  readdir,
  copyFile,
  realpath,
} from "node:fs/promises";
import { createInterface } from "node:readline";
import path from "node:path";

const digest = async (file) => {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(file)) hash.update(chunk);
  return hash.digest("hex");
};
const contained = async (root, name) => {
  if (!/^[\w.-]+$/.test(name) || name === "." || name === "..")
    throw new Error("Invalid backup file name");
  const base = await realpath(root),
    file = await realpath(path.join(base, name));
  const relative = path.relative(base, file);
  if (relative.startsWith("..") || path.isAbsolute(relative))
    throw new Error("Backup file escapes root");
  return file;
};
export async function backup(connection, assetRoot, destination) {
  await mkdir(destination, { mode: 0o700 }); // Never overwrite an existing backup.
  await mkdir(path.join(destination, "assets"), { mode: 0o700 });
  const manifest = {
    version: 1,
    createdAt: new Date().toISOString(),
    collections: [],
    assets: [],
  };
  const collections = await connection.db.listCollections().toArray();
  for (const collection of collections) {
    if (collection.name.startsWith("system.")) continue;
    if (collection.type !== "collection" || !/^[\w-]+$/.test(collection.name))
      throw new Error("Unsupported collection");
    const file = `${collection.name}.jsonl`,
      target = path.join(destination, file);
    // Append one BSON-preserving document at a time; no whole-database memory image.
    await writeFile(target, "", { flag: "wx", mode: 0o600 });
    const { open } = await import("node:fs/promises");
    const handle = await open(target, "a");
    let count = 0;
    try {
      for await (const document of connection.db
        .collection(collection.name)
        .find()) {
        await handle.writeFile(
          EJSON.stringify(document, { relaxed: false }) + "\n",
        );
        count++;
      }
    } finally {
      await handle.close();
    }
    const indexes = (await connection.db.collection(collection.name).indexes())
      .filter((i) => i.name !== "_id_")
      .map((index) => {
        const spec = { ...index };
        delete spec.v;
        delete spec.ns;
        if (spec.weights) {
          spec.key = Object.fromEntries(
            Object.entries(spec.key).flatMap(([field, type]) =>
              field === "_fts"
                ? Object.keys(spec.weights).map((name) => [name, "text"])
                : field === "_ftsx"
                  ? []
                  : [[field, type]],
            ),
          );
        }
        return spec;
      });
    manifest.collections.push({
      name: collection.name,
      file,
      count,
      sha256: await digest(target),
      options: collection.options,
      indexes,
    });
  }
  for await (const asset of connection.db.collection("audio_assets").find()) {
    const source = await contained(assetRoot, asset.storageKey);
    if ((await digest(source)) !== asset.sha256)
      throw new Error("Asset hash mismatch");
    await copyFile(source, path.join(destination, "assets", asset.storageKey));
    manifest.assets.push({ file: asset.storageKey, sha256: asset.sha256 });
  }
  await writeFile(
    path.join(destination, "manifest.json"),
    EJSON.stringify(manifest, { relaxed: false }),
    { flag: "wx", mode: 0o600 },
  );
  return manifest;
}
export async function restore(connection, source, assetRoot) {
  const manifest = EJSON.parse(
    await readFile(path.join(source, "manifest.json"), "utf8"),
  );
  if (
    manifest.version !== 1 ||
    !Array.isArray(manifest.collections) ||
    !Array.isArray(manifest.assets)
  )
    throw new Error("Unsupported backup");
  if ((await connection.db.listCollections().toArray()).length)
    throw new Error("Restore requires an empty database");
  await mkdir(assetRoot, { recursive: true });
  if ((await readdir(assetRoot)).length)
    throw new Error("Restore requires an empty asset directory");
  // Verify every file before the first database write; a partial restore is never reusable.
  for (const item of manifest.collections) {
    if (!/^[\w-]+$/.test(item.name) || item.name.startsWith("system"))
      throw new Error("Invalid collection");
    if ((await digest(await contained(source, item.file))) !== item.sha256)
      throw new Error("Backup checksum mismatch");
  }
  for (const item of manifest.assets)
    if (
      (await digest(
        await contained(path.join(source, "assets"), item.file),
      )) !== item.sha256
    )
      throw new Error("Asset checksum mismatch");
  for (const item of manifest.collections) {
    const collection = await connection.db.createCollection(
      item.name,
      item.options,
    );
    let count = 0;
    const lines = createInterface({
      input: createReadStream(await contained(source, item.file)),
      crlfDelay: Infinity,
    });
    for await (const line of lines) {
      if (line) {
        await collection.insertOne(EJSON.parse(line));
        count++;
      }
    }
    if (count !== item.count) throw new Error("Backup count mismatch");
    if (item.indexes.length) await collection.createIndexes(item.indexes);
  }
  for (const item of manifest.assets)
    await copyFile(
      await contained(path.join(source, "assets"), item.file),
      path.join(assetRoot, item.file),
    );
  return manifest;
}
