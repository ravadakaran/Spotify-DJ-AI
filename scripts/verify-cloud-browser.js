// Opt-in real-browser smoke check. Reads private credentials without logging
// them, creates a labelled lounge, and ends that lounge in finally.
import { chromium, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import assert from "node:assert/strict";

const base = process.env.DEMO_ORIGIN;
assert.equal(new URL(base).protocol, "https:");
const login = JSON.parse(await readFile(process.argv[2], "utf8"));
const browser = await chromium.launch({ headless: true });
let token, loungeId;
try {
  const page = await browser.newPage();
  const pollingRequests = [];
  page.on("request", (request) => {
    if (request.url().includes("/socket.io/?") && request.url().includes("transport=polling")) {
      pollingRequests.push(request.method());
    }
  });
  await page.goto(base, { waitUntil: "domcontentloaded" });
  await page.getByLabel("Email address").fill(login.email);
  await page.getByLabel("Password", { exact: true }).fill(login.password);
  const loggedIn = page.waitForResponse((response) => response.url().endsWith("/api/v1/auth/login"));
  await page.getByRole("button", { name: "Enter the studio →", exact: true }).click();
  const response = await loggedIn;
  assert.equal(response.status(), 200);
  token = (await response.json()).accessToken;
  await expect(page.getByRole("button", { name: "Sign out", exact: true })).toBeVisible({ timeout: 15000 });
  await page.reload({ waitUntil: "domcontentloaded" });
  await expect(page.getByRole("button", { name: "Sign out", exact: true })).toBeVisible({ timeout: 15000 });
  await page.getByLabel("Lounge vibe").fill("Cloud browser verification");
  const track = page.getByLabel("Starting track", { exact: true });
  const option = track.locator("option").filter({ hasText: /^Hydrogen —/ });
  await expect(option).toHaveCount(1);
  await track.selectOption(await option.getAttribute("value"));
  const created = page.waitForResponse((result) => result.url().endsWith("/api/v1/lounges") && result.request().method() === "POST");
  await page.getByRole("button", { name: "Create lounge →", exact: true }).click();
  const roomResponse = await created;
  assert.equal(roomResponse.status(), 201);
  loungeId = (await roomResponse.json()).loungeId;
  await expect(page.getByText("Connected", { exact: true })).toBeVisible({ timeout: 20000 });
  assert.ok(pollingRequests.includes("GET") && pollingRequests.includes("POST"));
  assert.equal(new URL(page.url()).origin, base);
  console.log(JSON.stringify({ result: "passed", origin: base, checks: ["rendered login", "browser cookie refresh after reload", "create lounge", "live polling connection and synchronized snapshot"], limitation: "No audio output or cloud latency certification" }, null, 2));
} finally {
  await browser.close();
  if (token && loungeId) {
    const headers = { Authorization: `Bearer ${token}`, Origin: base, "Content-Type": "application/json", "X-CSRF-Protection": "1", "X-Command-Id": randomUUID() };
    const response = await fetch(`${base}/api/v1/lounges/${loungeId}`, { headers });
    assert.equal(response.status, 200);
    const state = await response.json();
    const ended = await fetch(`${base}/api/v1/lounges/${loungeId}/end`, { method: "POST", headers, body: JSON.stringify({ expectedRevision: state.revision }) });
    assert.equal(ended.status, 200);
  }
}
