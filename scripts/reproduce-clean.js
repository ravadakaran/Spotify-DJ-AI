import { cp, mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import path from "node:path";
import os from "node:os";
const source = process.cwd(),
  target = await mkdtemp(path.join(os.tmpdir(), "dj-reader-reproduction-"));
const excluded = new Set([
  "node_modules",
  "data",
  ".git",
  "evidence",
  "test-results",
  "playwright-report",
  "coverage",
  "dist",
]);
await cp(source, target, {
  recursive: true,
  filter: (file) => {
    const relative = path.relative(source, file),
      parts = relative.split(path.sep);
    if (parts.some((part) => excluded.has(part))) return false;
    return !parts.at(-1).startsWith(".env") || parts.at(-1) === ".env.example";
  },
});
const records = [];
async function run(args) {
  const start = performance.now();
  const result = await new Promise((resolve, reject) => {
    const child = spawn(
      process.platform === "win32" ? "npm.cmd" : "npm",
      args,
      { cwd: target, shell: process.platform === "win32", windowsHide: true },
    );
    let stdout = "",
      stderr = "";
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
      if (stdout.length > 100000) stdout = stdout.slice(-100000);
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
      if (stderr.length > 100000) stderr = stderr.slice(-100000);
    });
    child.on("error", reject);
    child.on("close", (code) => resolve({ code, stdout, stderr }));
  });
  const record = {
    command: `npm ${args.join(" ")}`,
    exitCode: result.code,
    elapsedMs: performance.now() - start,
  };
  records.push(record);
  console.log(JSON.stringify(record));
  if (result.code !== 0) {
    await writeFile(
      path.join(target, "reproduction-failure.log"),
      result.stdout + result.stderr,
    );
    throw new Error(
      `Clean reproduction failed: ${record.command}; logs retained in disposable directory`,
    );
  }
}
let error;
try {
  for (const args of [
    ["ci"],
    ["run", "setup"],
    ["run", "lint"],
    ["run", "build"],
    ["test"],
  ])
    await run(args);
} catch (e) {
  error = e.message;
}
const report = {
  date: new Date().toISOString(),
  pass: !error,
  kind: "Author-operated clean-directory automated reproduction; NOT an independent first-time-reader attestation",
  directory: target,
  excluded: [...excluded, ".env and private environment files"],
  records,
  error,
  node: process.version,
};
await mkdir("evidence", { recursive: true });
await writeFile(
  "evidence/acceptance-clean-reproduction.json",
  JSON.stringify(report, null, 2) + "\n",
);
console.log(JSON.stringify(report, null, 2));
if (error) process.exitCode = 1;
