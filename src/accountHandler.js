/**
 * SteamBooster v3.3.0 - Steam hour booster
 * SOLID: SRP (separated SteamService/Config/UI), DIP (RateLimiter injection)
 * Security: validation + atomic write + anti-prototype-pollution
 * @license MIT
 * @repository https://github.com/0311z/SteamBooster
 */
"use strict";
const SteamUser = require("steam-user");
const SteamTotp = require("steam-totp");
const { Timer } = require("easytimer.js");
const fs = require("node:fs");
const fsp = require("node:fs/promises");
const path = require("node:path");
const c = require("../utils/colors");
const logger = require("../utils/logger");
const stats = require("../utils/stats");
const banner = require("../utils/banner");
const config = require("../utils/configManager");
const ui = require("../utils/ui");
const { RateLimiter } = require("../utils/rateLimiter");
const {
  validateAccount: validateAccountStrict,
} = require("../utils/valitador");
const singleInstance = require("../utils/singleInstance");
const { probePresence } = require("./sessionWatch");
const monitor = require("../utils/monitor");
const { startPlaySession } = require("../utils/playSession");

const ROOT = path.join(__dirname, "..");

const HEALTH_MS = 5 * 60_000;
const PROBE_BASE_MS = 15 * 60_000;
const PROBE_MAX_MS = 2 * 3600_000;
const PROBE_UNKNOWN_MS = 10 * 60_000;
const PROBE_UNKNOWN_MAX = 3;
const REVIVE_COOLDOWN_MS = 10 * 60_000;

const ARGS = process.argv.slice(2);
const flagValue = (name) => {
  const i = ARGS.indexOf(name);
  return i >= 0 ? ARGS[i + 1] : undefined;
};

// --status / --stop handled before app init
if (ARGS.includes("--status") || ARGS.includes("-s")) {
  const lock = singleInstance.readLock();
  if (!lock || !lock.pid) {
    console.log("SteamBooster is NOT running (no lock file).");
    process.exit(0);
  }
  const alive = singleInstance.isAlive(lock.pid);
  if (!alive) {
    console.log(
      "SteamBooster is NOT running (stale lock, PID " + lock.pid + " dead).",
    );
    process.exit(0);
  }
  console.log("SteamBooster IS running.");
  console.log("  PID:     " + lock.pid);
  console.log("  Tag:     " + (lock.tag || "unknown"));
  console.log("  Started: " + lock.started);
  console.log("  Beat:    " + new Date(lock.beat).toLocaleString());
  const logDir = path.join(ROOT, "logs");
  try {
    const files = fs
      .readdirSync(logDir)
      .filter((f) => f.startsWith("steam_") && f.endsWith(".log"))
      .sort();
    if (files.length) {
      const lines = fs
        .readFileSync(path.join(logDir, files[files.length - 1]), "utf8")
        .trim()
        .split("\n");
      const lastAuto =
        [...lines].reverse().find((l) => l.includes("Auto:")) ||
        [...lines].reverse().find((l) => l.includes("active"));
      if (lastAuto) console.log("  Last:    " + lastAuto.trim());
    }
  } catch {}
  process.exit(0);
}
if (ARGS.includes("--stop")) {
  const lock = singleInstance.readLock();
  if (!lock && !fs.existsSync(singleInstance.LOCK_FILE)) {
    console.log("SteamBooster is not running.");
    process.exit(0);
  }
  if (!lock || !Number.isSafeInteger(lock.pid) || lock.pid <= 1) {
    console.log("SteamBooster lock is invalid.");
    process.exit(1);
  }
  try {
    process.kill(lock.pid);
    console.log("Stop requested for SteamBooster (PID " + lock.pid + ").");
  } catch (e) {
    console.log("Could not stop PID " + lock.pid + ": " + e.message);
    process.exit(1);
  }
  process.exit(0);
}

class SteamBooster {
  constructor(deps = {}) {
    this.clients = new Map();
    this.accountStates = new Map();
    this.sessionStats = {
      startTime: Date.now(),
      totalHoursGained: 0,
      messagesReceived: 0,
      reconnections: 0,
      errors: 0,
    };
    this.rateLimiter = deps.rateLimiter ?? new RateLimiter(30, 60_000);
    this.reconnects = new Map();
    this.isBoosting = false;
    this._rawMode = false;
    this.accountErrors = new Map();
    this.autoMode = deps.autoMode ?? ARGS.includes("--auto");
    this.autoAccount = deps.autoAccount ?? flagValue("--account");
    this.kicked = new Map();
    this.probeTimers = new Map();
    this.watchTimer = null;
    this.lastRevive = new Map();
    this.monitorServer = null;
  }

  async init() {
    await this.checkDirectories();
    try {
      logger.debugMode = !!config.loadSettings().debug;
    } catch {}
    const lock = singleInstance.acquire(this.autoMode ? "auto" : "menu");
    if (!lock.acquired) {
      if (lock.error) throw new Error(lock.error);
      const h = lock.holder || {};
      logger.warn(
        `SteamBooster is ALREADY RUNNING (PID ${h.pid || "?"}, since ${h.started || "?"})`,
      );
      logger.warn(
        'Use "node src/accountHandler.js --status" to check, or "--stop" to stop it first.',
      );
      if (this.autoMode) {
        logger.warn("Auto: not starting a second one, exiting");
        process.exit(0);
      }
      const ans = (
        ui.question("Continue anyway and kick it? (y/n) > ") || ""
      ).toLowerCase();
      if (ans !== "y" && ans !== "yes") {
        logger.info("Exiting");
        process.exit(0);
      }
      logger.warn("Your call: both copies will kick each other");
    } else if (lock.stale) {
      logger.warn("Stale lock (dead owner), taking over");
    }
    if (!this.monitorServer) this.startMonitorIfConfigured();
    if (this.autoMode) return this.initAuto();
    ui.clear();
    banner.display();
    this.showDisclaimer();
    const accounts = config.loadAccounts();
    if (accounts.length === 0) {
      logger.warn("No accounts configured");
      const ans = (
        ui.question("Add your first account? (y/n) > ") || ""
      ).toLowerCase();
      if (ans === "y" || ans === "yes") {
        await this.addAccountWizard();
        return this.init();
      }
      logger.info("Come back anytime.");
      process.exit(0);
    }
    this.showMenu(accounts);
  }

  async initAuto() {
    logger.info("Auto mode: disclaimer accepted via --auto, no menu");
    const all = config.loadAccounts();
    let accounts = all;
    if (this.autoAccount) {
      accounts = all.filter(
        (a) =>
          a.username.toLowerCase() === String(this.autoAccount).toLowerCase(),
      );
      if (accounts.length === 0) {
        logger.error(`Account "${this.autoAccount}" not found`);
        process.exit(1);
      }
    }
    if (accounts.length === 0) {
      logger.error("No accounts configured");
      process.exit(1);
    }
    ui.clear();
    banner.displayMini();
    this.isBoosting = true;
    const MAX_BOOT = 6,
      BOOT_WAIT = 60_000;
    for (let a = 1; a <= MAX_BOOT; a++) {
      logger.info(
        `Auto: attempt ${a}/${MAX_BOOT} with ${accounts.length} account(s)...`,
      );
      const results = await this.attemptLogins(accounts);
      const ok = results.filter((r) => r.ok);
      const failed = results.filter((r) => !r.ok);
      for (const r of failed)
        logger.warn(
          `[${r.acc.username}] skipped: ${this.accountErrors.get(r.acc.username) || "failed"}`,
        );
      if (ok.length > 0) return this.enterAutoMonitor();
      if (a < MAX_BOOT) {
        logger.warn("Auto: no luck, retrying in 60s...");
        await this.sleep(BOOT_WAIT);
      }
    }
    logger.error("Auto: failed after 6 attempts, exiting (code 1)");
    process.exit(1);
  }

  enterAutoMonitor() {
    const report = () => {
      const active = [...this.clients.values()].filter(
        (d) =>
          this.accountStates.get(d.account.username) === "active" &&
          d.client?.steamID,
      );
      let hrs = 0;
      for (const d of active) {
        try {
          const t = d.timer.getTimeValues();
          hrs += (t.hours || 0) + (t.minutes || 0) / 60;
        } catch {}
      }
      logger.steam(`Auto: ${active.length} active, ${hrs.toFixed(2)}h banked`);
      for (const [name, e] of this.kicked) {
        const mins = Math.max(
          1,
          Math.round(((e.nextAt || Date.now()) - Date.now()) / 60000),
        );
        logger.info(
          `Auto: ${name} stood down (probably you playing), recheck in ~${mins}m`,
        );
      }
    };
    logger.success("Auto boosting running (hidden, no menu)");
    this.ensureWatchdog();
    report();
    setInterval(report, 5 * 60_000);
  }

  ensureWatchdog() {
    if (this.watchTimer) return;
    this.watchTimer = setInterval(() => {
      try {
        this.healthTick();
      } catch {}
    }, HEALTH_MS);
  }
  stopWatchdog() {
    if (this.watchTimer) {
      try {
        clearInterval(this.watchTimer);
      } catch {}
      this.watchTimer = null;
    }
    for (const t of this.probeTimers.values()) {
      try {
        clearTimeout(t);
      } catch {}
    }
    this.probeTimers.clear();
  }

  healthTick() {
    for (const [name, data] of this.clients.entries()) {
      if (this.accountStates.get(name) !== "active") continue;
      if (!data.client || !data.client.steamID) {
        logger.warn(`[${name}] Health tick: session dead, reconnecting...`);
        const acc = data.account;
        try {
          data.playSession?.stop();
          data.timer && data.timer.stop();
        } catch {}
        this.clients.delete(name);
        this.accountStates.set(name, "disconnected");
        setTimeout(() => {
          if (this.isBoosting) this.loginAccount(acc);
        }, 5000);
      }
    }
  }

  enterKickedMode(account, accName) {
    if (this.kicked.has(accName)) return;
    const data = this.clients.get(accName);
    let steamID64 = null;
    if (
      data &&
      data.client &&
      data.client.steamID &&
      typeof data.client.steamID.getSteamID64 === "function"
    ) {
      steamID64 = data.client.steamID.getSteamID64();
    }
    try {
      data && data.timer && data.timer.stop();
    } catch {}
    data?.playSession?.stop();
    this.clients.delete(accName);
    this.accountStates.set(accName, "kicked");
    this.kicked.set(accName, {
      account,
      steamID64,
      since: Date.now(),
      waitMs: PROBE_BASE_MS,
      nextAt: Date.now() + PROBE_BASE_MS,
      unknowns: 0,
    });
    logger.warn(
      `[${accName}] Logged in elsewhere (you are playing). Standing down; will probe every ~15m.`,
    );
    this.scheduleProbe(accName, PROBE_BASE_MS, "kicked");
  }

  scheduleProbe(name, ms, why) {
    this.clearProbe(name);
    const entry = this.kicked.get(name);
    if (entry) entry.nextAt = Date.now() + ms;
    const t = setTimeout(() => {
      this.probeTimers.delete(name);
      this.runProbe(name);
    }, ms);
    if (t.unref) t.unref();
    this.probeTimers.set(name, t);
    logger.info(
      `[${name}] Next presence check in ~${Math.max(1, Math.round(ms / 60000))}m (${why})`,
    );
  }
  clearProbe(name) {
    const t = this.probeTimers.get(name);
    if (t) {
      try {
        clearTimeout(t);
      } catch {}
      this.probeTimers.delete(name);
    }
  }
  async runProbe(name) {
    const entry = this.kicked.get(name);
    if (!entry || !this.isBoosting) return;
    if (!entry.steamID64) {
      logger.warn(`[${name}] No SteamID to probe, retrying login blind...`);
      this.kicked.delete(name);
      this.loginAccount(entry.account);
      return;
    }
    logger.info(
      `[${name}] Checking if you are still playing (anonymous lookup, no kick)...`,
    );
    let presence;
    let stage = "unknown";
    const ownGameIds =
      entry.account && Array.isArray(entry.account.gamesAndStatus)
        ? entry.account.gamesAndStatus.filter((g) => typeof g === "number")
        : [];
    try {
      presence = await probePresence(entry.steamID64, {
        timeoutMs: 60000,
        onStage: (s) => {
          stage = s;
        },
        ownGameIds,
      });
    } catch {
      presence = null;
    }
    if (!this.isBoosting || !this.kicked.has(name)) return;
    if (!presence) {
      entry.unknowns = (entry.unknowns || 0) + 1;
      if (entry.unknowns >= PROBE_UNKNOWN_MAX) {
        logger.warn(
          `[${name}] Presence still unknown after ${entry.unknowns} checks (last: ${stage}) - trying login anyway`,
        );
        this.kicked.delete(name);
        this.loginAccount(entry.account);
        return;
      }
      logger.warn(
        `[${name}] Presence unknown (${stage}, ${entry.unknowns}/${PROBE_UNKNOWN_MAX}), rechecking in 10m`,
      );
      entry.waitMs = PROBE_UNKNOWN_MS;
      return this.scheduleProbe(name, entry.waitMs, "unknown");
    }
    entry.unknowns = 0;
    if (presence.playing) {
      entry.waitMs = Math.min(entry.waitMs * 2, PROBE_MAX_MS);
      logger.warn(
        `[${name}] Still playing ${presence.game || "a game"}, rechecking in ~${Math.round(entry.waitMs / 60000)}m`,
      );
      return this.scheduleProbe(name, entry.waitMs, "user playing");
    }
    const settings = config.loadSettings();
    if (!settings.resumeWhenIdle && !presence.offline) {
      entry.waitMs = Math.min(entry.waitMs * 2, PROBE_MAX_MS);
      logger.info(
        `[${name}] Online but idle; resumeWhenIdle is off, rechecking in ~${Math.round(entry.waitMs / 60000)}m`,
      );
      return this.scheduleProbe(name, entry.waitMs, "idle hold");
    }
    logger.success(
      `[${name}] You are done (${presence.offline ? "offline" : presence.name || "idle"}) - resuming boost`,
    );
    this.kicked.delete(name);
    this.loginAccount(entry.account);
  }

  showDisclaimer() {
    console.log(
      `\n${c.red}+================================================================+${c.reset}`,
    );
    console.log(
      `${c.red}|  DISCLAIMER: This software may violate Steam ToS.              |${c.reset}`,
    );
    console.log(
      `${c.red}|  Use at your own risk. Alt accounts recommended.               |${c.reset}`,
    );
    console.log(
      `${c.red}+================================================================+${c.reset}\n`,
    );
    const accept = ui
      .question(`${c.yellow}Type 'I AGREE' to continue: ${c.reset}`)
      .trim()
      .toUpperCase();
    if (accept !== "I AGREE") {
      console.log(`\n${c.red}Disclaimer not accepted. Exiting.${c.reset}\n`);
      process.exit(0);
    }
  }

  async checkDirectories() {
    for (const dir of ["config", "logs", "data", "accounts_data", "messages"]) {
      await fsp
        .mkdir(path.join(ROOT, dir), { recursive: true })
        .catch(() => {});
    }
  }

  showMenu(accounts, msg = null) {
    ui.clear();
    banner.displayMini();
    if (msg) console.log(`\n${c.yellow}${msg}${c.reset}`);
    const activeCount = [...this.accountStates.values()].filter(
      (s) => s === "active",
    ).length;
    const boostingIndicator = activeCount
      ? ` ${c.green}[${activeCount} active]${c.reset}`
      : "";
    console.log(
      `\n${c.cyan}+============================================================+${c.reset}`,
    );
    console.log(
      `${c.cyan}|${c.reset}              STEAM BOOSTER - MAIN MENU${boostingIndicator}              ${c.cyan}|${c.reset}`,
    );
    console.log(
      `${c.cyan}+============================================================+${c.reset}`,
    );
    console.log(
      `${c.cyan}|${c.reset}                                                            ${c.cyan}|${c.reset}`,
    );
    console.log(
      `${c.cyan}|${c.reset}  [1] Start All Accounts (${accounts.length} total)${" ".repeat(Math.max(0, 30 - String(accounts.length).length))}${c.cyan}|${c.reset}`,
    );
    console.log(
      `${c.cyan}|${c.reset}  [2] Start Single Account                                   ${c.cyan}|${c.reset}`,
    );
    console.log(
      `${c.cyan}|${c.reset}  [3] Add New Account                                        ${c.cyan}|${c.reset}`,
    );
    console.log(
      `${c.cyan}|${c.reset}  [4] Manage Accounts                                        ${c.cyan}|${c.reset}`,
    );
    console.log(
      `${c.cyan}|${c.reset}  [5] View Statistics                                        ${c.cyan}|${c.reset}`,
    );
    console.log(
      `${c.cyan}|${c.reset}  [6] Settings                                               ${c.cyan}|${c.reset}`,
    );
    console.log(
      `${c.cyan}|${c.reset}  [7] Export Backup                                          ${c.cyan}|${c.reset}`,
    );
    console.log(
      `${c.cyan}|${c.reset}                                                            ${c.cyan}|${c.reset}`,
    );
    console.log(
      `${c.cyan}|${c.reset}  [0] Exit                                                   ${c.cyan}|${c.reset}`,
    );
    console.log(
      `${c.cyan}+============================================================+${c.reset}\n`,
    );
    const choice = ui.question("Pick [0-7]: ").trim();
    switch (choice) {
      case "1":
        this.startAllAccounts(accounts);
        break;
      case "2":
        this.startSingleAccount(accounts);
        break;
      case "3":
        this.addAccountWizard().then(() =>
          this.showMenu(config.loadAccounts()),
        );
        break;
      case "4":
        this.manageAccounts(accounts);
        break;
      case "5":
        stats.showDashboard(this.sessionStats, this.clients, () =>
          this.showMenu(config.loadAccounts()),
        );
        break;
      case "6":
        this.settingsMenu();
        break;
      case "7":
        this.exportBackup();
        break;
      case "0":
        this.gracefulExit();
        break;
      default:
        this.showMenu(accounts, "Invalid choice");
    }
  }

  async startAllAccounts(accounts) {
    if (accounts.length === 0)
      return this.showMenu(accounts, "No accounts configured");
    const fresh = accounts.filter((a) => !this.clients.has(a.username));
    const skipped = accounts.filter((a) => this.clients.has(a.username));
    if (skipped.length > 0)
      logger.warn(
        `Already boosting, skipped: ${skipped.map((a) => a.username).join(", ")}`,
      );
    if (fresh.length === 0)
      return this.showMenu(accounts, "All accounts already boosting");
    ui.clear();
    banner.displayMini();
    this.isBoosting = true;
    const results = await this.attemptLogins(fresh);
    const failed = results.filter((r) => !r.ok);
    if (failed.length === results.length) {
      const errs = failed
        .map(
          (r) =>
            `${r.acc.username}: ${this.accountErrors.get(r.acc.username) || "failed"}`,
        )
        .join(" | ");
      this.isBoosting = false;
      return this.showMenu(config.loadAccounts(), `All failed: ${errs}`);
    }
    this.showBoostingPanel();
  }

  async startSingleAccount(accounts) {
    if (accounts.length === 0)
      return this.showMenu(accounts, "No accounts configured");
    const pag = ui.paginate(accounts, 0, 9);
    const items = pag.items.map((a) => {
      const online = this.clients.has(a.username);
      const state = this.accountStates.get(a.username);
      const status =
        online && state === "active"
          ? `${c.green}*${c.reset}`
          : `${c.dim}o${c.reset}`;
      return `${status} ${ui.truncate(a.username, 28)}`;
    });
    ui.box("SELECT ACCOUNT", [
      "",
      `${c.dim}Showing: ${pag.showing}${c.reset}`,
      "",
      ...items.map((it, i) => `${c.yellow}[${i + 1}]${c.reset} ${it}`),
      "",
      `${c.dim}[0] Back${c.reset}`,
      "",
    ]);
    const choice = ui.question(`Pick [0-${pag.items.length}]: `).trim();
    const num = parseInt(choice, 10);
    if (
      choice === "0" ||
      Number.isNaN(num) ||
      num < 1 ||
      num > pag.items.length
    )
      return this.showMenu(accounts);
    this.isBoosting = true;
    const acc = pag.items[num - 1];
    const ok = await this.loginAccount(acc);
    if (!ok) {
      this.isBoosting = false;
      return this.showMenu(
        config.loadAccounts(),
        `${acc.username}: ${this.accountErrors.get(acc.username) || "failed"}`,
      );
    }
    this.showBoostingPanel();
  }

  async attemptLogins(accounts) {
    const settings = config.loadSettings();
    const delayMs = Math.max(
      1000,
      Math.min(10000, settings.startupDelay ?? 2000),
    );
    const results = [];
    for (let i = 0; i < accounts.length; i++) {
      const ok = await this.loginAccount(accounts[i]);
      results.push({ acc: accounts[i], ok });
      if (i < accounts.length - 1)
        await new Promise((r) => setTimeout(r, delayMs));
    }
    return results;
  }

  showBoostingPanel() {
    ui.clear();
    banner.displayMini();
    console.log(
      `\n${c.green}Boosting... press M (menu) / S (stats) / Q (quit)${c.reset}\n`,
    );
    let running = true,
      updateCount = 0,
      lastSig = null,
      lastFull = 0;
    const render = (force) => {
      if (!running) return;
      const active = [...this.clients.values()].filter(
        (d) =>
          this.accountStates.get(d.account.username) === "active" &&
          d.client?.steamID,
      );
      const sig = active
        .map(
          (d) =>
            `${d.account.username}:${d.account.invisible ? 1 : 0}:${d.games.filter((g) => typeof g === "number").length}`,
        )
        .join("|");
      const now = Date.now();
      if (!force && sig === lastSig && now - lastFull < 30000) return;
      lastSig = sig;
      lastFull = now;
      if (active.length === 0) {
        if (++updateCount > 5) {
          running = false;
          setTimeout(() => {
            this.isBoosting = false;
            this.showMenu(config.loadAccounts(), "No active sessions");
          }, 100);
          return;
        }
      } else {
        updateCount = 0;
      }
      for (const data of active) {
        const t = data.timer
          ? data.timer.getTimeValues()
          : { hours: 0, minutes: 0, seconds: 0 };
        const time = `${String(t.hours || 0).padStart(2, "0")}:${String(t.minutes || 0).padStart(2, "0")}:${String(t.seconds || 0).padStart(2, "0")}`;
        const games = data.games
          ? data.games.filter((g) => typeof g === "number").length
          : 0;
        console.log(
          `  ${c.green}*${c.reset} ${ui.truncate(data.account.username, 18).padEnd(18)} ${time}  (${games} games)`,
        );
      }
      for (const [name, e] of this.kicked) {
        const mins = Math.max(
          1,
          Math.round(((e.nextAt || Date.now()) - Date.now()) / 60000),
        );
        console.log(
          `  ${c.yellow}~${c.reset} ${name.padEnd(18)} stood down, recheck in ~${mins}m`,
        );
      }
    };
    const interval = setInterval(() => render(false), 2000);
    render(true);
    const onData = (key) => {
      const k = key.toString().toLowerCase();
      running = false;
      clearInterval(interval);
      if (k === "\u0003" || k === "q") this.gracefulExit();
      else if (k === "s")
        stats.showDashboard(this.sessionStats, this.clients, () =>
          this.showBoostingPanel(),
        );
      else {
        this.isBoosting = false;
        this.showMenu(config.loadAccounts());
      }
    };
    try {
      process.stdin.setRawMode(true);
      this._rawMode = true;
    } catch {}
    process.stdin.resume();
    process.stdin.on("data", onData);
    this.ensureWatchdog();
  }

  async addAccountWizard() {
    ui.clear();
    banner.displayMini();
    console.log(`\n${c.cyan}ADD NEW ACCOUNT${c.reset}\n`);
    let username = "",
      uTries = 0;
    while ((!username || username.length < 2) && uTries < 3) {
      username = ui.question(`${c.cyan}Username: ${c.reset}`).trim();
      uTries++;
      if ((!username || username.length < 2) && uTries >= 3) {
        logger.error("No username, aborting");
        await this.sleep(1500);
        return;
      }
      if (!username || username.length < 2)
        console.log(`${c.red}  2+ chars needed${c.reset}`);
    }
    if (
      config
        .loadAccounts()
        .find((a) => a.username.toLowerCase() === username.toLowerCase())
    ) {
      logger.error(`Account "${username}" already exists`);
      await this.sleep(2000);
      return;
    }
    let password = "",
      pTries = 0;
    while (!password && pTries < 3) {
      password = ui.questionPassword(`${c.cyan}Password: ${c.reset}`);
      pTries++;
      if (!password && pTries >= 3) {
        logger.error(
          "Could not read password (non-interactive terminal?), aborting",
        );
        await this.sleep(1500);
        return;
      }
      if (!password) console.log(`${c.red}  Empty password${c.reset}`);
    }
    if (password.length > 64) {
      logger.warn(
        `Password is ${password.length} chars. Steam may reject passwords over 64 chars (known steam-session limitation). Consider shortening.`,
      );
      await this.sleep(2000);
    }
    console.log(`\n${c.dim}2FA sharedSecret (empty=manual):${c.reset}`);
    const sharedSecret = ui
      .question(`${c.cyan}Shared secret: ${c.reset}`)
      .trim();
    const invAns = ui
      .question(`${c.cyan}Invisible? (y/n): ${c.reset}`)
      .toLowerCase();
    const invisible = invAns === "y" || invAns === "yes";
    let games = [];
    while (games.length === 0) {
      const inp = ui
        .question(`${c.cyan}IDs (comma separated): ${c.reset}`)
        .trim();
      games = inp
        .split(",")
        .map((g) => parseInt(g.trim(), 10))
        .filter((g) => Number.isInteger(g) && g > 0);
      if (games.length === 0)
        console.log(`${c.red}  Need 1 valid ID${c.reset}`);
    }
    const status = ui
      .question(`${c.cyan}Custom status (optional): ${c.reset}`)
      .trim();
    let saveMessages = true;
    try {
      saveMessages = config.loadSettings().saveMessages !== false;
    } catch {}
    const account = {
      username,
      password,
      sharedSecret: sharedSecret || "",
      invisible,
      gamesAndStatus: status ? [status, ...games] : games,
      replyMessage: "",
      saveMessages,
      createdAt: new Date().toISOString(),
    };
    const v = validateAccountStrict(account);
    if (!v.valid) {
      logger.error(`Invalid account: ${v.errors.join(", ")}`);
      await this.sleep(2000);
      return;
    }
    config.saveAccount(account);
    logger.success(`Account "${username}" added!`);
    await this.sleep(1500);
  }

  manageAccounts(accounts, msg = null) {
    ui.clear();
    banner.displayMini();
    if (msg) console.log(`\n${c.yellow}${msg}${c.reset}`);
    if (accounts.length === 0) {
      console.log(`\n${c.dim}No accounts.${c.reset}`);
      ui.pause();
      return this.showMenu(config.loadAccounts());
    }
    const pag = ui.paginate(accounts, 0, 9);
    console.log(
      `\n${c.cyan}MANAGE ACCOUNTS${c.reset}  ${c.dim}Showing: ${pag.showing}${c.reset}\n`,
    );
    pag.items.forEach((a, i) =>
      console.log(
        `  ${c.yellow}[${i + 1}]${c.reset} ${ui.truncate(a.username, 30)}`,
      ),
    );
    console.log(`\n  ${c.dim}[0] Back${c.reset}\n`);
    const choice = ui.question("Pick: ").trim();
    const num = parseInt(choice, 10);
    if (
      choice === "0" ||
      Number.isNaN(num) ||
      num < 1 ||
      num > pag.items.length
    )
      return this.showMenu(config.loadAccounts());
    const acc = pag.items[num - 1];
    console.log(`\n${c.cyan}Editing ${acc.username}${c.reset}`);
    const newPass = ui.questionPassword("New password (blank=keep): ");
    if (newPass) acc.password = newPass;
    const newGames = ui
      .question("New games comma separated (blank=keep): ")
      .trim();
    if (newGames) {
      const games = newGames
        .split(",")
        .map((g) => parseInt(g.trim(), 10))
        .filter((g) => Number.isInteger(g) && g > 0);
      if (games.length) {
        const status = (acc.gamesAndStatus || []).find(
          (g) => typeof g === "string",
        );
        acc.gamesAndStatus = status ? [status, ...games] : games;
      }
    }
    const inv = ui
      .question(
        `Invisible (currently ${acc.invisible ? "yes" : "no"}, blank=keep): `,
      )
      .toLowerCase();
    if (inv === "y" || inv === "yes") acc.invisible = true;
    else if (inv === "n" || inv === "no") acc.invisible = false;
    acc.updatedAt = new Date().toISOString();
    const all = config.loadAccounts();
    const idx = all.findIndex((a) => a.username === acc.username);
    if (idx >= 0) {
      all[idx] = acc;
      config.saveAccounts(all);
      logger.success("Updated!");
    } else logger.error("Account not found");
    ui.pause();
    this.manageAccounts(config.loadAccounts());
  }

  removeAccount(accounts) {
    if (accounts.length === 0) {
      this.manageAccounts(accounts, "No accounts");
      return;
    }
    ui.clear();
    banner.displayMini();
    console.log(`\n${c.red}PICK ONE TO DELETE:${c.reset}\n`);
    const pag = ui.paginate(accounts, 0, 9);
    pag.items.forEach((a, i) =>
      console.log(`  ${c.yellow}[${i + 1}]${c.reset} ${a.username}`),
    );
    const choice = ui.question("\nPick: ").trim();
    const num = parseInt(choice, 10);
    if (
      choice === "0" ||
      Number.isNaN(num) ||
      num < 1 ||
      num > pag.items.length
    )
      return this.manageAccounts(accounts);
    const acc = pag.items[num - 1];
    console.log(`\n${c.red}Delete "${acc.username}"?${c.reset}`);
    const confirm = ui.question(`Type "DELETE" to confirm: `).trim();
    if (confirm.toUpperCase() === "DELETE") {
      const all = config.loadAccounts();
      const idx = all.findIndex((a) => a.username === acc.username);
      if (idx >= 0) {
        all.splice(idx, 1);
        config.saveAccounts(all);
        config.clearRefreshToken(acc.username);
        const active = this.clients.get(acc.username);
        active?.playSession?.stop();
        active?.timer?.stop();
        this.clients.delete(acc.username);
        try {
          active?.client?.logOff();
        } catch {}
        this.accountStates.delete(acc.username);
        this.accountErrors.delete(acc.username);
        this.kicked.delete(acc.username);
        this.clearProbe(acc.username);
        this.reconnects.delete(acc.username);
        this.lastRevive.delete(acc.username);
        logger.success("Deleted!");
      }
    } else logger.info("Cancelled");
    ui.pause();
    this.manageAccounts(config.loadAccounts());
  }

  settingsMenu(msg = null) {
    ui.clear();
    banner.displayMini();
    if (msg) console.log(`\n${c.yellow}${msg}${c.reset}`);
    const s = config.loadSettings();
    const on = `${c.green}ON${c.reset}`,
      off = `${c.red}OFF${c.reset}`;
    console.log(`\n${c.cyan}SETTINGS${c.reset}\n`);
    console.log(
      `  ${c.cyan}[1]${c.reset} Auto-reconnect: ${s.autoReconnect ? on : off}`,
    );
    console.log(
      `  ${c.cyan}[2]${c.reset} Invisible mode: ${s.invisibleMode ? on : off}`,
    );
    console.log(
      `  ${c.cyan}[3]${c.reset} Save messages: ${s.saveMessages ? on : off}`,
    );
    console.log(`  ${c.cyan}[4]${c.reset} Debug mode: ${s.debug ? on : off}`);
    console.log(`  ${c.cyan}[5]${c.reset} Startup delay: ${s.startupDelay}ms`);
    console.log(
      `  ${c.cyan}[6]${c.reset} Resume-when-idle: ${s.resumeWhenIdle ? on : off}`,
    );
    console.log(
      `  ${c.cyan}[7]${c.reset} Monitor port (HTTP /status): ${c.yellow}${s.monitorPort || 0}${c.reset} (0=disabled)\n`,
    );
    const choice = ui.question("Pick [0-7]: ").trim();
    const toggle = (k, name) => {
      s[k] = !s[k];
      if (config.saveSettings(s))
        this.settingsMenu(`${name} ${s[k] ? "enabled" : "disabled"}`);
      else this.settingsMenu("Failed");
    };
    switch (choice) {
      case "1":
        toggle("autoReconnect", "Auto-reconnect");
        break;
      case "2":
        toggle("invisibleMode", "Invisible");
        break;
      case "3":
        toggle("saveMessages", "Save messages");
        break;
      case "4":
        s.debug = !s.debug;
        logger.debugMode = s.debug;
        config.saveSettings(s);
        this.settingsMenu(`Debug ${s.debug ? "enabled" : "disabled"}`);
        break;
      case "5": {
        const d = parseInt(ui.question("Delay 1000-10000: ").trim(), 10);
        if (Number.isInteger(d) && d >= 1000 && d <= 10000) {
          s.startupDelay = d;
          config.saveSettings(s);
          this.settingsMenu(`Delay ${d}ms`);
        } else this.settingsMenu("Invalid delay");
        break;
      }
      case "6":
        toggle("resumeWhenIdle", "Resume-when-idle");
        break;
      case "7": {
        const p = parseInt(
          ui.question("Port 0-65535 (0=disabled): ").trim(),
          10,
        );
        if (Number.isInteger(p) && p >= 0 && p <= 65535) {
          s.monitorPort = p;
          config.saveSettings(s);
          logger.warn("Restart required to apply monitor port");
          this.settingsMenu(`Monitor port ${p}`);
        } else this.settingsMenu("Invalid port");
        break;
      }
      case "0":
        this.showMenu(config.loadAccounts());
        break;
      default:
        this.settingsMenu("Invalid");
    }
  }

  exportBackup() {
    ui.clear();
    banner.displayMini();
    ui.box("EXPORT BACKUP", [
      "",
      `${c.dim}Passwords are NOT exported${c.reset}`,
      "",
    ]);
    config.exportAccounts(() => this.showMenu(config.loadAccounts()));
  }

  handleMessage(accName, sid, msg, client, account) {
    this.sessionStats.messagesReceived++;
    if (account.saveMessages !== false) {
      let globalSave = true;
      try {
        globalSave = config.loadSettings().saveMessages !== false;
      } catch {}
      if (globalSave) {
        const dir = path.join(ROOT, "messages");
        try {
          fs.mkdirSync(dir, { recursive: true });
        } catch {}
        try {
          fs.appendFileSync(
            path.join(dir, `${accName}.log`),
            `[${new Date().toLocaleString()}] ${sid.getSteamID64()}: ${msg}\n`,
          );
        } catch {}
      }
    }
    if (account.replyMessage) {
      try {
        client.chatMessage(sid, account.replyMessage);
      } catch {}
    }
  }

  getErrorMessage(err) {
    const code = err && err.eresult;
    const name =
      typeof code === "number" && SteamUser.EResult[code]
        ? ` (${SteamUser.EResult[code]})`
        : "";
    const m = {
      0: "No connection to Steam",
      5: "Invalid password or expired token",
      6: "Logged in elsewhere (another session took over)",
      12: "Invalid account name",
      15: "Access denied",
      27: "Session/token expired - re-login with password",
      43: "Account disabled by Steam Support",
      63: "Steam Guard email code required",
      65: "Invalid Steam Guard code",
      66: "Steam Guard email required but no mail was sent",
      74: "Verified email required (check your inbox)",
      83: "Region locked",
      84: "Rate limited by Steam - wait before retrying",
      85: "Steam Guard mobile code required",
      87: "Login throttled by Steam - wait before retrying",
      88: "Wrong Steam Guard code",
    };
    if (typeof code === "number" && m[code]) return m[code] + name;
    const msg = err && err.message ? String(err.message) : "Unknown error";
    return name ? `${msg}${name}` : msg;
  }

  async loginAccount(account) {
    const accName = account.username;
    const settings = config.loadSettings();
    const validation = validateAccountStrict(account);
    if (!validation.valid) {
      this.accountErrors.set(accName, validation.errors.join("; "));
      this.accountStates.set(accName, "error");
      return false;
    }
    return new Promise((resolve) => {
      let client = null;
      let timer = new Timer();
      let loggedIn = false;
      let settled = false;
      let loginTimeout;
      let cancelApproval = null;
      const finish = (ok, msg) => {
        if (settled) return;
        settled = true;
        clearTimeout(loginTimeout);
        if (cancelApproval) cancelApproval();
        if (!ok) {
          if (timer) {
            try {
              timer.stop();
            } catch {}
          }
          try {
            client && client.logOff();
          } catch {}
          this.accountErrors.set(accName, msg || "failed");
          this.accountStates.set(accName, "error");
        } else {
          this.accountStates.set(accName, "active");
          this.accountErrors.delete(accName);
        }
        resolve(ok);
      };
      const MAX_GUARD = 3,
        MAX_RATE = 3;
      const GOT_KEY = !!config.getRefreshToken(accName);
      let mode = GOT_KEY ? "key" : "password";
      let rateAttempts = 0,
        keyFallbacks = 0;
      const startTs = Date.now(),
        MAX_TOTAL_MS = 10 * 60_000;
      const hasSecret =
        typeof account.sharedSecret === "string" &&
        account.sharedSecret.trim().length > 0;

      const freshTwoFactor = () => {
        if (!hasSecret) return null;
        try {
          return SteamTotp.generateAuthCode(account.sharedSecret.trim());
        } catch {
          return null;
        }
      };

      const isJwt = (t) =>
        typeof t === "string" &&
        /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(t);

      const buildOpts = () => {
        const key = mode === "key" ? config.getRefreshToken(accName) : null;
        if (mode === "key" && !isJwt(key)) {
          config.clearRefreshToken(accName);
          mode = "password";
        }
        if (mode === "key") return { refreshToken: key };
        const o = { accountName: accName, password: account.password };
        const tf = freshTwoFactor();
        if (tf) o.twoFactorCode = tf;
        return o;
      };

      const doLogon = (opts) => {
        if (settled) return;
        if (Date.now() - startTs > MAX_TOTAL_MS) {
          finish(false, "Login timeout");
          return;
        }
        logger.info(
          `[${accName}] Logging on${mode === "key" ? " with saved token" : ""}...`,
        );
        try {
          client.logOn(opts);
        } catch (e) {
          finish(false, e && e.message);
        }
      };

      const waitForPhoneApproval = () =>
        new Promise((resolveApproval) => {
          let sess = null,
            doneAppr = false;
          const cleanAppr = () => {
            try {
              if (sess) {
                sess.cancelLoginAttempt();
              }
            } catch {}
            sess = null;
            cancelApproval = null;
          };
          const to = setTimeout(() => {
            if (doneAppr) return;
            doneAppr = true;
            cleanAppr();
            resolveApproval({
              ok: false,
              error: "Timed out waiting for phone approval",
            });
          }, 120000);
          cancelApproval = () => {
            if (doneAppr) return;
            doneAppr = true;
            clearTimeout(to);
            cleanAppr();
            resolveApproval({ ok: false, error: "Login cancelled" });
          };
          let Lib = null;
          try {
            Lib = require("steam-session");
          } catch {
            doneAppr = true;
            clearTimeout(to);
            cleanAppr();
            resolveApproval({
              ok: false,
              error: "steam-session not installed",
            });
            return;
          }
          try {
            sess = new Lib.LoginSession(Lib.EAuthTokenPlatformType.SteamClient);
          } catch (e) {
            doneAppr = true;
            clearTimeout(to);
            cleanAppr();
            resolveApproval({
              ok: false,
              error: (e && e.message) || "session init failed",
            });
            return;
          }
          try {
            sess.loginTimeout = 120000;
          } catch {}
          sess.on("error", (err) => {
            if (doneAppr) return;
            doneAppr = true;
            clearTimeout(to);
            cleanAppr();
            resolveApproval({
              ok: false,
              error: (err && err.message) || "session error",
            });
          });
          sess.on("timeout", () => {
            if (doneAppr) return;
            doneAppr = true;
            clearTimeout(to);
            cleanAppr();
            resolveApproval({
              ok: false,
              error: "Timed out waiting for phone approval",
            });
          });
          sess.on("authenticated", () => {
            if (doneAppr) return;
            doneAppr = true;
            clearTimeout(to);
            const tok = sess.refreshToken;
            cleanAppr();
            resolveApproval({ ok: true, token: tok });
          });
          Promise.resolve()
            .then(() =>
              sess.startWithCredentials({
                accountName: accName,
                password: account.password,
              }),
            )
            .then((res) => {
              if (doneAppr) return;
              if (res && !res.actionRequired) return;
              const types = ((res && res.validActions) || []).map(
                (a) => a.type,
              );
              const G = Lib.EAuthSessionGuardType;
              const canApp = types.includes(G.DeviceConfirmation);
              if (!canApp) {
                doneAppr = true;
                clearTimeout(to);
                cleanAppr();
                resolveApproval({
                  ok: false,
                  error: "Mobile approval is not available; retry with a code",
                });
                return;
              }
              if (canApp) {
                logger.info(
                  `[${accName}] Approve the login in your Steam mobile app...`,
                );
              }
            })
            .catch((err) => {
              if (doneAppr) return;
              doneAppr = true;
              clearTimeout(to);
              cleanAppr();
              resolveApproval({
                ok: false,
                error: (err && err.message) || "startWithCredentials failed",
              });
            });
        });

      try {
        client = new SteamUser({
          autoRelogin: false,
          enablePicsCache: true,
          renewRefreshTokens: true,
          dataDirectory: path.join(ROOT, "accounts_data"),
        });
      } catch (e) {
        finish(false, e && e.message);
        return;
      }

      client.on("steamGuard", (domain, callback, lastCodeWrong) => {
        if (settled) return;
        if (lastCodeWrong) logger.warn(`[${accName}] Last code was wrong`);
        if (hasSecret) {
          const left = 30 - (Math.floor(Date.now() / 1000) % 30);
          const waitMs = left < 6 ? (left + 1) * 1000 : 0;
          setTimeout(() => {
            if (settled) return;
            const code = freshTwoFactor();
            if (code) {
              logger.info(`[${accName}] Using automatic Steam Guard code`);
              callback(code);
            } else if (this.autoMode)
              finish(false, "Could not generate Steam Guard code");
            else {
              const c2 = ui
                .question(`${c.yellow}Steam Guard code: ${c.reset}`)
                .trim()
                .toUpperCase();
              callback(c2);
            }
          }, waitMs);
          return;
        }
        if (this.autoMode) {
          finish(false, "Steam Guard requires interactive login");
          return;
        }
        if (domain) {
          const code = ui
            .question(`${c.yellow}Steam Guard email code: ${c.reset}`)
            .trim()
            .toUpperCase();
          callback(code);
          return;
        }
        // mobile approval
        const method = ui
          .question(
            `${c.cyan}Pick [1] type code / [2] app approval: ${c.reset}`,
          )
          .trim();
        if (method === "2") {
          waitForPhoneApproval().then((r) => {
            if (settled) return;
            if (r.ok && isJwt(r.token)) {
              config.saveRefreshToken(accName, r.token);
              mode = "key";
              logger.success(`[${accName}] Phone approved`);
              doLogon({ refreshToken: r.token });
            } else
              finish(
                false,
                `Phone approval failed: ${r.error || "invalid token"}`,
              );
          });
          return;
        }
        const code = ui
          .question(`${c.yellow}Mobile code: ${c.reset}`)
          .trim()
          .toUpperCase();
        if (!/^[A-Z0-9]{5}$/.test(code)) {
          finish(false, "Invalid code (5 letters/digits)");
          return;
        }
        callback(code);
      });

      client.on("refreshToken", (token) => {
        if (token) config.saveRefreshToken(accName, token);
      });

      client.once("loggedOn", () => {
        if (settled) return;
        loggedIn = true;
        const sid64 =
          client.steamID && typeof client.steamID.getSteamID64 === "function"
            ? client.steamID.getSteamID64()
            : "?";
        logger.success(`[${accName}] Logged in (SteamID ${sid64})`);
        const statusStr =
          (Array.isArray(account.gamesAndStatus)
            ? account.gamesAndStatus.find((g) => typeof g === "string")
            : null) || null;
        const gameIds = Array.isArray(account.gamesAndStatus)
          ? account.gamesAndStatus.filter((g) => typeof g === "number")
          : [];
        if (gameIds.length > 32)
          logger.warn(
            `[${accName}] ${gameIds.length} games configured; Steam only counts the first ~32 in a single session. Consider splitting accounts.`,
          );
        const games = gameIds.length ? gameIds : [730];
        let playSession;
        try {
          client.setPersona(
            settings.invisibleMode || account.invisible
              ? SteamUser.EPersonaState.Invisible
              : SteamUser.EPersonaState.Online,
            statusStr || undefined,
          );
          const complete = (state) => {
            if (this.clients.get(accName)?.client !== client) return;
            timer.stop();
            this.clients.delete(accName);
            this.accountStates.set(accName, state);
            try {
              client.logOff();
            } catch (err) {
              logger.warn(`[${accName}] Logoff failed: ${err.message}`);
            }
          };
          playSession = startPlaySession({
            client,
            games,
            rotationMinutes: account.rotationMinutes ?? 0,
            durationMinutes: account.sessionDurationMinutes ?? 0,
            onComplete: () => {
              complete("completed");
              logger.success(`[${accName}] Session duration reached`);
            },
            onError: (err) => {
              complete("error");
              logger.error(`[${accName}] Game rotation failed: ${err.message}`);
            },
          });
        } catch (e) {
          finish(false, `Could not start games: ${e && e.message}`);
          return;
        }
        const entry = {
          account,
          client,
          timer,
          games,
          playSession,
          state: "active",
        };
        this.clients.set(accName, entry);
        this.accountStates.set(accName, "active");
        this.reconnects.set(accName, 0);
        try {
          timer.start();
        } catch {}
        finish(true);
      });

      const endSession = (shouldReconnect) => {
        const data = this.clients.get(accName);
        if (!data || data.client !== client) return;
        data.timer?.stop();
        data.playSession?.stop();
        this.clients.delete(accName);
        this.accountStates.set(accName, "disconnected");
        const n = (this.reconnects.get(accName) || 0) + 1;
        const max = Number.isInteger(settings.maxReconnectAttempts)
          ? settings.maxReconnectAttempts
          : 5;
        if (shouldReconnect && settings.autoReconnect && n <= max) {
          this.reconnects.set(accName, n);
          logger.info(
            `[${accName}] Reconnecting in 5s (attempt ${n}/${max})...`,
          );
          setTimeout(() => {
            if (this.isBoosting) this.loginAccount(account);
          }, 5000);
        }
      };

      client.on("error", (err) => {
        if (settled && !loggedIn) return;
        if (loggedIn && this.clients.get(accName)?.client !== client) return;
        const code = err && err.eresult;
        const msg = this.getErrorMessage(err);
        logger.error(`[${accName}] ${msg}`);
        if (loggedIn) {
          if (code === 6) {
            this.enterKickedMode(account, accName);
            return;
          }
          if (code === 27) {
            logger.warn(`[${accName}] Session expired, clearing token...`);
            config.clearRefreshToken(accName);
          }
          endSession(code === 0 || code === 3 || code === 27);
          return;
        }
        // pre-login handling
        if (code === 0 && rateAttempts < MAX_RATE) {
          rateAttempts++;
          const wait = Math.min(10000 * Math.pow(2, rateAttempts - 1), 60000);
          logger.warn(
            `[${accName}] No connection to Steam, retrying in ${Math.round(wait / 1000)}s (attempt ${rateAttempts}/${MAX_RATE})...`,
          );
          setTimeout(() => {
            if (!settled) doLogon(buildOpts());
          }, wait);
          return;
        }
        if ((code === 84 || code === 87) && rateAttempts < MAX_RATE) {
          rateAttempts++;
          const wait = Math.min(45000 * Math.pow(2, rateAttempts - 1), 300000);
          logger.warn(
            `[${accName}] Rate limited, retrying in ${Math.round(wait / 1000)}s (attempt ${rateAttempts}/${MAX_RATE})...`,
          );
          setTimeout(() => {
            if (!settled) doLogon(buildOpts());
          }, wait);
          return;
        }
        if (code === 5 && mode === "key" && keyFallbacks < 1) {
          keyFallbacks++;
          logger.warn(
            `[${accName}] Saved token rejected, retrying with password...`,
          );
          config.clearRefreshToken(accName);
          mode = "password";
          doLogon(buildOpts());
          return;
        }
        if (code === 27 && mode === "key" && keyFallbacks < 1) {
          keyFallbacks++;
          logger.warn(`[${accName}] Token expired, retrying with password...`);
          config.clearRefreshToken(accName);
          mode = "password";
          doLogon(buildOpts());
          return;
        }
        finish(false, msg);
      });

      client.once("disconnected", (eresult, _msg) => {
        if (settled && !loggedIn) return;
        if (loggedIn) {
          if (this.clients.get(accName)?.client !== client) return;
          if (eresult === 6) {
            this.enterKickedMode(account, accName);
            return;
          }
          logger.warn(`[${accName}] Disconnected (eresult ${eresult})`);
          endSession(true);
        } else finish(false, `Disconnected before login (eresult ${eresult})`);
      });

      client.on("friendMessage", (sid, msg) =>
        this.handleMessage(accName, sid, msg, client, account),
      );

      client.once("wallet", (hasWallet, currency, balance) => {
        try {
          logger.info(`[${accName}] Wallet: ${balance} (currency ${currency})`);
        } catch {}
      });

      loginTimeout = setTimeout(
        () => finish(false, "Login timeout"),
        MAX_TOTAL_MS,
      );
      doLogon(buildOpts());
    });
  }

  startMonitorIfConfigured() {
    try {
      const envPort = process.env.MONITOR_PORT;
      const s = config.loadSettings();
      const port = envPort ? parseInt(envPort, 10) : s.monitorPort || 0;
      if (port > 0) this.monitorServer = monitor.startMonitor(this, port);
    } catch (e) {
      logger.warn(`Monitor not started: ${e && e.message}`);
    }
  }

  gracefulExit() {
    this.isBoosting = false;
    this.stopWatchdog();
    for (const [, data] of this.clients.entries()) {
      try {
        data.playSession?.stop();
        data.timer && data.timer.stop();
      } catch {}
      try {
        data.client && data.client.logOff();
      } catch {}
    }
    this.clients.clear();
    try {
      singleInstance.release();
    } catch {}
    setTimeout(() => {
      console.log(`\n${c.green}Thanks for using SteamBooster!${c.reset}\n`);
      process.exit(0);
    }, 1500);
  }

  sleep(ms) {
    return new Promise((r) => setTimeout(r, ms));
  }
}

const app = new SteamBooster();
if (require.main === module) {
  app.init().catch((err) => {
    try {
      logger.error(`Fatal: ${err && err.message}`);
    } catch {}
    console.error(`${c.red}Fatal: ${err.message}${c.reset}`);
    console.error(err.stack);
    process.exit(1);
  });
  process.on("SIGINT", () => app.gracefulExit());
  process.on("SIGTERM", () => {
    try {
      logger.error("Got SIGTERM, shutting down");
    } catch {}
    app.gracefulExit();
  });
  process.on("uncaughtException", (err) => {
    try {
      logger.error(`Uncaught: ${(err && err.stack) || (err && err.message)}`);
    } catch {}
    try {
      console.error(
        `${c.red}Uncaught: ${(err && err.stack) || (err && err.message)}${c.reset}`,
      );
    } catch {}
    app.gracefulExit();
  });
  process.on("unhandledRejection", (r) => {
    try {
      logger.error(`Unhandled rejection: ${r && (r.stack || r.message || r)}`);
    } catch {}
    try {
      console.error(`${c.red}Unhandled rejection: ${r}${c.reset}`);
    } catch {}
  });
  process.on("exit", (code) => {
    try {
      singleInstance.release();
    } catch {}
    try {
      fs.appendFileSync(
        path.join(
          ROOT,
          "logs",
          `steam_${new Date().toISOString().slice(0, 10)}.log`,
        ),
        `[${new Date().toLocaleString("sv-SE")}] [EXIT] code ${code}\n`,
      );
    } catch {}
  });
}

module.exports = app;
module.exports.SteamBooster = SteamBooster;
