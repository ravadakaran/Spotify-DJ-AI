import { test, expect } from "@playwright/test";
import { MongoMemoryReplSet } from "mongodb-memory-server";
import { createServer as createVite } from "vite";
import { mkdtemp, rm, mkdir, writeFile } from "node:fs/promises";
import { randomBytes } from "node:crypto";
import os from "node:os";
import path from "node:path";
import { root } from "../../server/src/config.js";
import { connect, migrate } from "../../server/src/persistence.js";
import { createApplication } from "../../server/src/app.js";
let repl, db, application, vite, folder, browserUrl;
test.beforeAll(async () => {
  folder = await mkdtemp(path.join(os.tmpdir(), "dj-catalog-browser-"));
  repl = await MongoMemoryReplSet.create({
    replSet: { count: 1, storageEngine: "wiredTiger" },
  });
  db = await connect(repl.getUri("catalog_browser_tests"));
  await migrate(db.connection, db.models);
  const wave = Buffer.alloc(1644);
  wave.write("RIFF");
  wave.writeUInt32LE(1636, 4);
  wave.write("WAVEfmt ", 8);
  wave.writeUInt32LE(16, 16);
  wave.writeUInt16LE(1, 20);
  wave.writeUInt16LE(1, 22);
  wave.writeUInt32LE(8000, 24);
  wave.writeUInt32LE(16000, 28);
  wave.writeUInt16LE(2, 32);
  wave.writeUInt16LE(16, 34);
  wave.write("data", 36);
  wave.writeUInt32LE(1600, 40);
  await writeFile(path.join(folder, "browser-fixture.wav"), wave);
  const asset = await db.models.Asset.create({
    storageKey: "browser-fixture.wav",
    mimeType: "audio/wav",
    byteLength: wave.length,
    sha256: "test-only",
    licenseLabel: "Original test silence",
    sourceAttribution: "Generated disposable browser fixture",
  });
  await db.models.Track.create({
    title: "Preview fixture",
    artist: "Test only",
    durationSeconds: 0.1,
    assetId: asset._id,
    profileStatus: "pending",
    acoustic: null,
  });
  const config = {
    key: randomBytes(48).toString("hex"),
    issuer: "tests",
    audience: "tests",
    origin: "http://127.0.0.1",
    secure: false,
    assetRoot: folder,
  };
  application = createApplication({
    ...db,
    config,
    logger: { info() {}, error() {} },
  });
  await new Promise((resolve) =>
    application.server.listen(0, "127.0.0.1", resolve),
  );
  const apiUrl = "http://127.0.0.1:" + application.server.address().port;
  vite = await createVite({
    root: path.join(root, "client"),
    configFile: path.join(root, "client/vite.config.js"),
    server: {
      port: 0,
      strictPort: false,
      proxy: { "/api": apiUrl, "/socket.io": { target: apiUrl, ws: true } },
    },
  });
  await vite.listen();
  browserUrl = "http://127.0.0.1:" + vite.httpServer.address().port;
  config.origin = browserUrl;
});
test.afterAll(async () => {
  await vite?.close();
  await application?.close();
  await db?.connection.close();
  await repl?.stop();
  if (folder) await rm(folder, { recursive: true, force: true });
});
test("admin edits, replaces, previews and deletes a catalog track on mobile", async ({
  page,
}) => {
  await page.goto(browserUrl);
  await page
    .getByRole("button", { name: "New here? Create an account" })
    .click();
  await page.getByLabel("Display name").fill("Catalog admin");
  await page.getByLabel("Email address").fill("catalog-admin@example.test");
  await page
    .getByLabel("Password", { exact: true })
    .fill("browser-test-password");
  await page.getByRole("button", { name: "Create account →" }).click();
  await expect(
    page.getByRole("heading", { name: "Start a new lounge" }),
  ).toBeVisible();
  await db.models.User.updateOne(
    { emailNormalized: "catalog-admin@example.test" },
    { $set: { isAdmin: true } },
  );
  const original = await db.models.Track.findOne({
    title: "Preview fixture",
  }).lean();
  const managed = await db.models.Track.create({
    title: "Managed audio fixture",
    artist: "Test only",
    durationSeconds: 0.1,
    assetId: original.assetId,
    acoustic: { bpm: 120, camelotKey: "8A", energy: 0.5, valence: 0.5 },
    timeline: [],
  });
  await page.reload();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByLabel("Search library").fill("Managed audio fixture");
  await page.getByRole("button", { name: "Edit profile", exact: true }).click();
  const editor = page.locator("form.profile-editor");
  await editor
    .getByLabel("title", { exact: true })
    .fill("Renamed audio fixture");
  await page
    .getByRole("button", { name: "Save acoustic profile", exact: true })
    .click();
  await expect(
    page.getByRole("status").filter({ hasText: "Track saved." }),
  ).toBeVisible();
  await page.getByLabel("Search library").fill("Renamed audio fixture");
  await expect(page.locator(".library-row")).toHaveCount(1);
  await page
    .getByRole("button", { name: "Replace audio", exact: true })
    .click();
  await editor
    .getByLabel("Replacement audio", { exact: true })
    .setInputFiles(path.join(folder, "browser-fixture.wav"));
  await editor
    .getByLabel("License", { exact: true })
    .fill("Original test silence");
  await editor
    .getByLabel("Source attribution", { exact: true })
    .fill("Generated browser fixture");
  for (const [field, value] of Object.entries({
    bpm: "121",
    camelotKey: "8A",
    energy: "0.6",
    valence: "0.5",
  }))
    await editor.getByLabel(field, { exact: true }).fill(value);
  await page
    .getByRole("button", { name: "Save replacement", exact: true })
    .click();
  await expect(
    page.getByRole("status").filter({ hasText: "Track saved." }),
  ).toBeVisible();
  await expect
    .poll(
      async () => (await db.models.Track.findById(managed._id)).acoustic.bpm,
    )
    .toBe(121);
  await page.getByRole("button", { name: "Preview", exact: true }).click();
  await expect
    .poll(() =>
      page
        .getByLabel("Preview Renamed audio fixture")
        .evaluate((a) => a.readyState),
    )
    .toBeGreaterThanOrEqual(2);
  await page.getByRole("button", { name: "Delete", exact: true }).click();
  await page
    .getByRole("group", { name: "Delete Renamed audio fixture" })
    .getByRole("button", { name: "Cancel", exact: true })
    .click();
  await expect(page.locator(".library-row")).toHaveCount(1);
  await page.getByRole("button", { name: "Delete", exact: true }).click();
  await expect(page.locator("body")).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  const browserEvidence = path.resolve(process.env.BROWSER_EVIDENCE_DIR || path.join(root, "evidence"));
  await mkdir(browserEvidence, { recursive: true });
  await page.screenshot({
    path: path.join(browserEvidence, "catalog-management-mobile.png"),
    fullPage: true,
  });
  const replacement = (await db.models.Track.findById(managed._id)).assetId;
  await page
    .getByRole("button", { name: "Delete track permanently", exact: true })
    .click();
  await expect(
    page.getByRole("status").filter({ hasText: "Track deleted." }),
  ).toBeVisible();
  await expect(page.locator(".library-row")).toHaveCount(0);
  expect(await db.models.Asset.exists({ _id: replacement })).toBeNull();
  expect(await db.models.Asset.exists({ _id: original.assetId })).toBeTruthy();
  await expect(page.locator(".preview")).toHaveCount(0);
});
