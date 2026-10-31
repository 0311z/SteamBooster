"use strict";
/**
 * SteamBooster - statistics dashboard
 */
const c = require("./colors");
const ui = require("./ui");

function showDashboard(sessionStats, clients, onDone) {
  const active = [...(clients || new Map()).values()].filter(
    (d) => d.client && d.client.steamID,
  );
  console.log(
    `\n${c.cyan}+---------------- STEAM BOOSTER STATS ----------------+${c.reset}`,
  );
  console.log(
    `  Session start : ${new Date(sessionStats.startTime).toLocaleString()}`,
  );
  console.log(`  Active accounts: ${active.length}`);
  console.log(`  Hours banked  : ${sessionStats.totalHoursGained.toFixed(2)}`);
  console.log(`  Messages      : ${sessionStats.messagesReceived}`);
  console.log(`  Reconnects    : ${sessionStats.reconnections}`);
  console.log(`  Errors        : ${sessionStats.errors}`);
  console.log(
    `${c.cyan}+----------------------------------------------------+${c.reset}`,
  );
  if (onDone) {
    ui.pause();
    onDone();
  }
}

module.exports = { showDashboard };
