/**
 * SteamBooster - ASCII art banners (console-safe, no exotic glyphs)
 */
const c = require('./colors');

const VERSION = '3.3.0';

function display() {
  console.log(`\n  STEAM BOOSTER  v${VERSION}\n`);
  console.log(`${c.dim}${'='.repeat(45)}${c.reset}`);
  console.log(`  ${c.cyan}Steam Hour Booster${c.reset} ${c.dim}by${c.reset} ${c.yellow}0311z${c.reset}`);
  console.log(`  ${c.dim}https://github.com/0311z/SteamBooster${c.reset}`);
  console.log(`${c.dim}${'='.repeat(45)}${c.reset}`);
}

function displayMini() {
  console.log(`\n  STEAM BOOSTER  v${VERSION}`);
}

function getVersion() { return VERSION; }

module.exports = { display, displayMini, getVersion, VERSION };
