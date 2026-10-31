'use strict';
/**
 * SteamBooster - optional local HTTP monitor
 */
const http = require('node:http');

function buildSnapshot(booster) {
  const accounts = [];
  try {
    const states = booster && booster.accountStates ? booster.accountStates : new Map();
    const clients = booster && booster.clients ? booster.clients : new Map();
    for (const [name, st] of states.entries()) {
      const d = clients.get(name);
      accounts.push({
        username: name,
        state: st,
        active: st === 'active' && !!(d && d.client && d.client.steamID),
        steamID: (d && d.client && d.client.steamID && typeof d.client.steamID.getSteamID64 === 'function') ? d.client.steamID.getSteamID64() : null
      });
    }
  } catch {}
  return {
    status: (booster && booster.isBoosting) ? 'boosting' : 'idle',
    uptimeSec: Math.floor(process.uptime()),
    accounts,
    timestamp: new Date().toISOString()
  };
}

function startMonitor(booster, port) {
  const p = Number(port);
  if (!Number.isInteger(p) || p <= 0 || p > 65535) return null;
  const server = http.createServer((req, res) => {
    if (req.url === '/' || req.url === '/status') {
      const snap = buildSnapshot(booster);
      res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
      res.end(JSON.stringify(snap, null, 2));
      return;
    }
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('Not found');
  });
  server.listen(p, '127.0.0.1', () => {
    console.log(`[monitor] listening on http://127.0.0.1:${p}/`);
  });
  server.on('error', (e) => {
    console.error(`[monitor] failed to bind port ${p}: ${e && e.message}`);
  });
  return server;
}

module.exports = { startMonitor, buildSnapshot };
