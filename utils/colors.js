'use strict';
// SteamBooster - ANSI color helpers (console-safe)
const reset = '\x1b[0m';
const codes = {
  black: 30, red: 31, green: 32, yellow: 33, blue: 34, magenta: 35, cyan: 36, white: 37,
  brightBlack: 90, brightRed: 91, brightGreen: 92, brightYellow: 93, brightBlue: 94, brightMagenta: 95, brightCyan: 96, brightWhite: 97
};
function wrap(code, s) { return `\x1b[${code}m${s}${reset}`; }
const c = {};
for (const [name, code] of Object.entries(codes)) {
  c[name] = (s) => wrap(code, s);
}
// convenience bold/dim
c.bold = (s) => `\x1b[1m${s}${reset}`;
c.dim = (s) => `\x1b[2m${s}${reset}`;
c.reset = reset;
module.exports = c;
