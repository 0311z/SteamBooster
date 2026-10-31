'use strict';
/**
 * SteamBooster - logger (local time, ANSI strip, midnight rollover, rotation)
 */
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const LOG_DIR = path.join(ROOT, 'logs');

let debugMode = false;
Object.defineProperty(module.exports, 'debugMode', {
  get() { return debugMode; },
  set(v) { debugMode = !!v; }
});

function ensureDir() { try { fs.mkdirSync(LOG_DIR, { recursive: true }); } catch {} }

function stripAnsi(s) { return String(s).replace(/\x1b\[[0-9;]*m/g, ''); }

function timestamp() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

function logFile() {
  ensureDir();
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return path.join(LOG_DIR, `steam_${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}.log`);
}

function write(level, msg) {
  const line = `[${timestamp()}] [${level}] ${stripAnsi(msg)}\n`;
  try { fs.appendFileSync(logFile(), line); } catch {}
  const consoleFn = level === 'ERROR' ? console.error : (level === 'WARN' ? console.warn : console.log);
  consoleFn(line.trim());
}

const logger = {
  info: (m) => write('INFO', m),
  success: (m) => write('SUCCESS', m),
  warn: (m) => write('WARN', m),
  error: (m) => write('ERROR', m),
  debug: (m) => { if (debugMode) write('DEBUG', m); },
  steam: (m) => write('STEAM', m)
};
// expose debugMode as property on logger too
Object.defineProperty(logger, 'debugMode', {
  get() { return debugMode; },
  set(v) { debugMode = !!v; }
});

module.exports = logger;
module.exports.debugMode = debugMode;
// keep reference in sync
Object.defineProperty(module.exports, 'debugMode', { get: () => debugMode, set: (v) => { debugMode = !!v; } });
