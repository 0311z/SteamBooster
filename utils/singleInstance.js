'use strict';
/**
 * SteamBooster - single instance lock with heartbeat
 */
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const LOCK_DIR = process.env.STEAM_LOCK_DIR ? path.resolve(process.env.STEAM_LOCK_DIR) : path.join(ROOT, 'data');
const LOCK_FILE = path.join(LOCK_DIR, 'steam.lock');
const HEARTBEAT_MS = 30000;

let heartbeatTimer = null;

function readLock() {
  try { return JSON.parse(fs.readFileSync(LOCK_FILE, 'utf8')); } catch { return null; }
}

function isAlive(pid) {
  try { process.kill(pid, 0); return true; } catch { return false; }
}

function acquire(tag) {
  try { fs.mkdirSync(LOCK_DIR, { recursive: true }); } catch {}
  const existing = readLock();
  if (existing && existing.pid && isAlive(existing.pid)) {
    return { acquired: false, holder: existing, stale: false };
  }
  const lock = { pid: process.pid, tag: tag || 'menu', started: new Date().toISOString(), beat: Date.now() };
  try { fs.writeFileSync(LOCK_FILE, JSON.stringify(lock, null, 2)); } catch {}
  heartbeatTimer = setInterval(() => {
    try {
      const cur = readLock();
      if (cur && cur.pid === process.pid) {
        cur.beat = Date.now();
        fs.writeFileSync(LOCK_FILE, JSON.stringify(cur, null, 2));
      }
    } catch {}
  }, HEARTBEAT_MS);
  if (heartbeatTimer.unref) heartbeatTimer.unref();
  const stale = !!(existing && existing.pid && !isAlive(existing.pid));
  return { acquired: true, holder: existing, stale };
}

function release() {
  if (heartbeatTimer) { try { clearInterval(heartbeatTimer); } catch {} heartbeatTimer = null; }
  try {
    const cur = readLock();
    if (cur && cur.pid === process.pid) fs.unlinkSync(LOCK_FILE);
  } catch {}
}

module.exports = { acquire, release, readLock, isAlive, LOCK_FILE };
