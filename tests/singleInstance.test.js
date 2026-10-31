"use strict";

const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawn } = require("node:child_process");

let dir;
let lock;
beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "steam-lock-test-"));
  process.env.STEAM_LOCK_DIR = dir;
  jest.resetModules();
  lock = require("../utils/singleInstance");
});
afterEach(() => {
  lock.release();
  delete process.env.STEAM_LOCK_DIR;
  fs.rmSync(dir, { recursive: true, force: true });
});

test.each([false, true])(
  "only one process acquires a lock (stale: %s)",
  async (stale) => {
    if (stale)
      fs.writeFileSync(
        lock.LOCK_FILE,
        JSON.stringify({ pid: 2147483647, tag: "old" }),
      );
    const script = `const lock = require(process.argv[1]);
    const result = lock.acquire('test');
    console.log(JSON.stringify(result));
    process.stdin.once('data', () => { lock.release(); process.exit(0); });`;
    const modulePath = require.resolve("../utils/singleInstance");
    const children = Array.from({ length: 12 }, () =>
      spawn(process.execPath, ["-e", script, modulePath], {
        env: { ...process.env, STEAM_LOCK_DIR: dir },
        stdio: ["pipe", "pipe", "pipe"],
      }),
    );
    try {
      const results = await Promise.all(
        children.map(
          (child) =>
            new Promise((resolve, reject) => {
              let output = "";
              child.on("error", reject);
              child.stdout.on("data", (chunk) => {
                output += chunk;
                if (output.includes("\n"))
                  resolve(JSON.parse(output.split("\n")[0]));
              });
              child.on("exit", (code) => {
                if (!output) reject(new Error(`child exited ${code}`));
              });
            }),
        ),
      );
      expect(results.filter((result) => result.acquired)).toHaveLength(1);
    } finally {
      children.forEach((child) => child.stdin.end("exit"));
      await Promise.all(
        children.map(
          (child) => new Promise((resolve) => child.on("close", resolve)),
        ),
      );
    }
  },
  15000,
);

test("recovers a dead owner, and release only removes its own lock", () => {
  fs.writeFileSync(
    lock.LOCK_FILE,
    JSON.stringify({ pid: 2147483647, tag: "old" }),
  );
  expect(lock.acquire("test")).toMatchObject({ acquired: true, stale: true });
  const replacement = { pid: process.pid, token: "different" };
  fs.writeFileSync(lock.LOCK_FILE, JSON.stringify(replacement));
  lock.release();
  expect(JSON.parse(fs.readFileSync(lock.LOCK_FILE, "utf8"))).toEqual(
    replacement,
  );
});

test("fails closed when the lock directory cannot be created", () => {
  const badPath = path.join(dir, "file");
  fs.writeFileSync(badPath, "x");
  process.env.STEAM_LOCK_DIR = badPath;
  jest.resetModules();
  lock = require("../utils/singleInstance");
  expect(lock.acquire("test")).toMatchObject({
    acquired: false,
    error: expect.any(String),
  });
});

test("refuses to replace an unreadable or invalid lock", () => {
  fs.writeFileSync(lock.LOCK_FILE, "incomplete");
  expect(lock.acquire("test")).toMatchObject({
    acquired: false,
    error: expect.any(String),
  });
  expect(fs.readFileSync(lock.LOCK_FILE, "utf8")).toBe("incomplete");
});

test("CLI status uses the configured lock and stop rejects invalid PIDs", () => {
  const { spawnSync } = require("node:child_process");
  const app = path.join(__dirname, "..", "src", "accountHandler.js");
  const options = {
    env: { ...process.env, STEAM_LOCK_DIR: dir },
    encoding: "utf8",
  };
  fs.writeFileSync(
    lock.LOCK_FILE,
    JSON.stringify({
      pid: process.pid,
      tag: "test",
      started: new Date().toISOString(),
    }),
  );
  const status = spawnSync(process.execPath, [app, "--status"], options);
  expect(status.status).toBe(0);
  expect(status.stdout).toContain("SteamBooster IS running");
  fs.writeFileSync(lock.LOCK_FILE, JSON.stringify({ pid: -1 }));
  const stop = spawnSync(process.execPath, [app, "--stop"], options);
  expect(stop.status).toBe(1);
  expect(fs.existsSync(lock.LOCK_FILE)).toBe(true);
});
