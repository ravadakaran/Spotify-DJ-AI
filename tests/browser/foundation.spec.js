import { test, expect } from '@playwright/test';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import { createServer as createVite } from 'vite';
import { mkdtemp, rm, mkdir, writeFile } from 'node:fs/promises';
import { randomBytes } from 'node:crypto';
import os from 'node:os';
import path from 'node:path';
import { root } from '../../server/src/config.js';
import { connect, migrate, seed } from '../../server/src/persistence.js';
import { createApplication } from '../../server/src/app.js';
let repl, db, application, vite, folder;
test.beforeAll(async () => {
  folder = await mkdtemp(path.join(os.tmpdir(), 'dj-browser-assets-'));
  repl = await MongoMemoryReplSet.create({ replSet: { count: 1, storageEngine: 'wiredTiger' } });
  db = await connect(repl.getUri('browser_tests')); await migrate(db.connection, db.models); await seed(db.models);
  const wave = Buffer.alloc(1644);
  wave.write('RIFF'); wave.writeUInt32LE(1636,4); wave.write('WAVEfmt ',8); wave.writeUInt32LE(16,16);
  wave.writeUInt16LE(1,20); wave.writeUInt16LE(1,22); wave.writeUInt32LE(8000,24); wave.writeUInt32LE(16000,28);
  wave.writeUInt16LE(2,32); wave.writeUInt16LE(16,34); wave.write('data',36); wave.writeUInt32LE(1600,40);
  await writeFile(path.join(folder,'browser-fixture.wav'),wave);
  const asset = await db.models.Asset.create({ storageKey:'browser-fixture.wav', mimeType:'audio/wav', byteLength:wave.length, sha256:'test-fixture', licenseLabel:'Original HTTP test silence', sourceAttribution:'Generated for tests only' });
  await db.models.Track.create({ title:'Preview fixture',artist:'Test only',durationSeconds:0.1,assetId:asset._id,profileStatus:'pending',acoustic:null });
  application = createApplication({ ...db, config: { key: randomBytes(48).toString('hex'), issuer: 'tests', audience: 'tests', origin: 'http://127.0.0.1:5173', secure: false, assetRoot: folder }, logger: { info() {}, error() {} } });
  await new Promise((resolve, reject) => { application.server.once('error', reject); application.server.listen(3000, '127.0.0.1', resolve); });
  vite = await createVite({ root: path.join(root, 'client'), configFile: path.join(root, 'client/vite.config.js') }); await vite.listen();
});
test.afterAll(async () => { await vite?.close(); await application?.close(); await db?.connection.close(); await repl?.stop(); if (folder) await rm(folder, { recursive: true, force: true }); });
test('two independent browser sessions create/join, sync and restore authentication', async ({ browser }) => {
  const hostContext = await browser.newContext(); const guestContext = await browser.newContext();
  const host = await hostContext.newPage(); const guest = await guestContext.newPage();
  const faults = []; host.on('pageerror', (e) => faults.push(e.message)); guest.on('pageerror', (e) => faults.push(e.message));
  const evidence = path.join(root, 'evidence'); await mkdir(evidence, { recursive: true });
  try {
    await host.goto('/'); await expect(host.getByRole('heading', { name: 'Good to have you back.' })).toBeVisible();
    await host.screenshot({ path: path.join(evidence, 'foundation-welcome.png'), fullPage: true });
    async function register(page, name) {
      await page.goto('/'); await page.getByRole('button', { name: 'New here? Create an account' }).click();
      await page.getByLabel('Display name').fill(name); await page.getByLabel('Email address').fill(`${name.toLowerCase()}@example.test`); await page.getByLabel('Password', { exact: true }).fill('browser-test-password');
      await page.getByRole('button', { name: 'Create account →' }).click(); await expect(page.getByRole('heading', { name: 'Start a new lounge' })).toBeVisible();
    }
    await register(host, 'Host');
    await host.getByLabel('Search library').fill('Preview fixture');
    await expect(host.getByText('Test only · 0:00 · Profile needed')).toBeVisible();
    await host.getByRole('button', {name:'Preview',exact:true}).click();
    const audio = host.getByLabel('Preview Preview fixture');
    await expect(audio).toBeVisible();
    await expect.poll(() => audio.evaluate(a => a.readyState)).toBeGreaterThanOrEqual(2);
    await audio.evaluate(a => a.play());
    await expect.poll(() => audio.evaluate(a => a.ended)).toBe(true);
    await host.getByLabel('Search library').fill('');
    await host.getByLabel('Lounge vibe').fill('After Hours'); await host.getByLabel('Starting track').selectOption({ label: 'Study in Amber · 120 BPM' });
    await host.getByRole('button', { name: 'Create lounge →' }).click();
    await expect(host.getByText('Connected', { exact: true })).toBeVisible();
    const code = await host.locator('.invite-banner code').textContent();
    await register(guest, 'Guest'); await guest.getByLabel('Invite code').fill(code); await guest.getByRole('button', { name: 'Join lounge ↗' }).click();
    await expect(guest.getByText('Connected', { exact: true })).toBeVisible();
    await expect(host.locator('.member')).toHaveCount(2); await expect(guest.locator('.member')).toHaveCount(2);
    expect(await host.locator('.sync-footer').textContent()).toBe(await guest.locator('.sync-footer').textContent());
    await host.screenshot({ path: path.join(evidence, 'foundation-lounge.png'), fullPage: true });
    await guest.reload(); await expect(guest.getByRole('heading', { name: 'Start a new lounge' })).toBeVisible();
    await guest.getByRole('button', { name: 'After Hours scheduled ↗' }).click(); await expect(guest.getByText('Connected', { exact: true })).toBeVisible();
    await guest.setViewportSize({ width: 390, height: 844 }); await guest.screenshot({ path: path.join(evidence, 'foundation-mobile.png'), fullPage: true });
    expect(await guest.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await guest.getByRole('button', { name: 'Sign out' }).click(); await expect(guest.getByRole('heading', { name: 'Good to have you back.' })).toBeVisible();
    expect(faults).toEqual([]);
  } finally { await hostContext.close(); await guestContext.close(); }
});
