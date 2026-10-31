"use strict";
/** Single instance lock with atomic creation and a heartbeat. */
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");

const ROOT = path.join(__dirname, "..");
const LOCK_DIR = process.env.STEAM_LOCK_DIR
  ? path.resolve(process.env.STEAM_LOCK_DIR)
  : path.join(ROOT, "data");
const LOCK_FILE = path.join(LOCK_DIR, "steam.lock");
const RECOVERY_DIR = LOCK_FILE + ".recovery";
const HEARTBEAT_MS = 30000;
let heartbeatTimer = null;
let ownerToken = null;

function readLock() {
  try {
    const lock = JSON.parse(fs.readFileSync(LOCK_FILE, "utf8"));
    lock.beat = fs.statSync(LOCK_FILE).mtimeMs;
    return lock;
  } catch {
    return null;
  }
}

function isAlive(pid) {
  if (!Number.isSafeInteger(pid) || pid <= 1) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    return err.code === "EPERM";
  }
}

function acquire(tag) {
  if (ownerToken) return { acquired: true, holder: null, stale: false };
  try {
    fs.mkdirSync(LOCK_DIR, { recursive: true });
  } catch (err) {
    return {
      acquired: false,
      error: `Cannot create lock directory: ${err.message}`,
    };
  }
  let stale = false;
  let previous = null;
  for (let attempt = 0; attempt < 2; attempt++) {
    const lock = {
      pid: process.pid,
      token: crypto.randomBytes(16).toString("hex"),
      tag: tag || "menu",
      started: new Date().toISOString(),
      beat: Date.now(),
    };
    let fd;
    try {
      fd = fs.openSync(LOCK_FILE, "wx", 0o600);
    } catch (err) {
      if (err.code !== "EEXIST")
        return { acquired: false, error: `Cannot create lock: ${err.message}` };
      const existing = readLock();
      if (
        !existing ||
        !Number.isSafeInteger(existing.pid) ||
        existing.pid <= 1
      ) {
        return {
          acquired: false,
          error:
            "Lock file is unreadable or invalid; inspect it before removing it.",
        };
      }
      if (isAlive(existing.pid))
        return { acquired: false, holder: existing, stale: false };
      // Serialize stale-lock recovery so another contender cannot remove a new lock.
      try {
        fs.mkdirSync(RECOVERY_DIR);
      } catch (recoveryError) {
        return {
          acquired: false,
          error: `Cannot recover stale lock: ${recoveryError.message}`,
        };
      }
      try {
        const current = readLock();
        if (
          !current ||
          current.pid !== existing.pid ||
          current.token !== existing.token ||
          isAlive(current.pid)
        ) {
          return {
            acquired: false,
            holder: current,
            error: "Lock changed during recovery; try again.",
          };
        }
        fs.unlinkSync(LOCK_FILE);
        stale = true;
        previous = current;
      } catch (recoveryError) {
        return {
          acquired: false,
          error: `Cannot recover stale lock: ${recoveryError.message}`,
        };
      } finally {
        try {
          fs.rmdirSync(RECOVERY_DIR);
        } catch {}
      }
      continue;
    }
    try {
      fs.writeFileSync(fd, JSON.stringify(lock, null, 2));
      fs.closeSync(fd);
    } catch (err) {
      try {
        fs.closeSync(fd);
      } catch {}
      try {
        fs.unlinkSync(LOCK_FILE);
      } catch {}
      return { acquired: false, error: `Cannot write lock: ${err.message}` };
    }
    ownerToken = lock.token;
    heartbeatTimer = setInterval(() => {
      try {
        const cur = readLock();
        if (cur && cur.pid === process.pid && cur.token === ownerToken) {
          const now = new Date();
          fs.utimesSync(LOCK_FILE, now, now);
        }
      } catch {}
    }, HEARTBEAT_MS);
    if (heartbeatTimer.unref) heartbeatTimer.unref();
    return { acquired: true, holder: previous, stale };
  }
  return {
    acquired: false,
    error: "Lock was acquired by another process; try again.",
  };
}

function release() {
  if (heartbeatTimer) clearInterval(heartbeatTimer);
  heartbeatTimer = null;
  if (!ownerToken) return;
  try {
    const cur = readLock();
    if (cur && cur.pid === process.pid && cur.token === ownerToken)
      fs.unlinkSync(LOCK_FILE);
  } catch {}
  ownerToken = null;
}

module.exports = { acquire, release, readLock, isAlive, LOCK_FILE };
