"use strict";
/**
 * SteamBooster - console UI helpers (ASCII only)
 */
const readlineSync = require("readline-sync");

function clear() {
  process.stdout.write("\x1b[2J\x1b[H");
}

function box(title, lines) {
  const width = 62;
  console.log(`+${"-".repeat(width)}+`);
  console.log(`| ${title.padEnd(width - 1)}|`);
  console.log(`+${"-".repeat(width)}+`);
  for (const l of lines) console.log(`| ${String(l).padEnd(width - 1)}|`);
  console.log(`+${"-".repeat(width)}+`);
}

function question(prompt) {
  return readlineSync.question(prompt);
}
function questionPassword(prompt) {
  return readlineSync.question(prompt, { hideEchoBack: true });
}
function pause() {
  readlineSync.question("Press ENTER to continue...");
}

function truncate(s, n) {
  s = String(s == null ? "" : s);
  if (s.length <= n) return s;
  return s.slice(0, Math.max(0, n - 3)) + "...";
}

function pad(s, n) {
  s = String(s == null ? "" : s);
  if (s.length >= n) return s;
  return s + " ".repeat(n - s.length);
}

function paginate(items, page, perPage) {
  perPage = perPage || 9;
  const total = items.length;
  const totalPages = Math.max(1, Math.ceil(total / perPage));
  page = Math.max(0, Math.min(page, totalPages - 1));
  const start = page * perPage;
  const slice = items.slice(start, start + perPage);
  const showing =
    total === 0
      ? "0 of 0"
      : `${start + 1}-${Math.min(start + slice.length, total)} of ${total}`;
  return { items: slice, page, totalPages, showing };
}

module.exports = {
  clear,
  box,
  question,
  questionPassword,
  pause,
  truncate,
  pad,
  paginate,
};
