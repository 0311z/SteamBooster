/**
 * SteamBooster - configuration manager (prototype-pollution safe, atomic writes, strict validation)
 */
const fs = require("node:fs");
const path = require("node:path");
const c = require("./colors");
const logger = require("./logger");
const ui = require("./ui");

const ROOT = path.join(__dirname, "..");
const ACCOUNTS_FILE = path.join(ROOT, "config", "accounts.json");
const SETTINGS_FILE = path.join(ROOT, "config", "settings.json");
const REFRESHTOKENS_FILE = path.join(ROOT, "config", "refreshTokens.json");

const DEFAULT_SETTINGS = {
  autoReconnect: true,
  invisibleMode: false,
  saveMessages: true,
  debug: false,
  startupDelay: 2000,
  maxReconnectAttempts: 5,
  resumeWhenIdle: true,
  monitorPort: 0,
};

function safeParse(json) {
  return JSON.parse(json, (k, v) => {
    if (k === "__proto__" || k === "constructor" || k === "prototype")
      return undefined;
    return v;
  });
}

function atomicWrite(file, data) {
  const tmp = file + ".tmp";
  fs.writeFileSync(tmp, data, { mode: 0o600 });
  fs.renameSync(tmp, file);
  try {
    fs.chmodSync(file, 0o600);
  } catch {}
}

class ConfigManager {
  constructor() {
    this.ensureDirs();
  }
  ensureDirs() {
    const configDir = path.join(ROOT, "config");
    if (!fs.existsSync(configDir))
      fs.mkdirSync(configDir, { recursive: true, mode: 0o700 });
  }
  loadAccounts() {
    try {
      if (fs.existsSync(ACCOUNTS_FILE)) {
        const data = fs.readFileSync(ACCOUNTS_FILE, "utf8");
        const accounts = safeParse(data);
        if (!Array.isArray(accounts)) return [];
        return accounts.filter(
          (a) =>
            a &&
            typeof a.username === "string" &&
            typeof a.password === "string" &&
            a.password.length > 0,
        );
      }
    } catch (err) {
      logger.error(`Failed to load accounts: ${err.message}`);
    }
    return [];
  }
  saveAccounts(accounts) {
    try {
      this.ensureDirs();
      if (!Array.isArray(accounts)) throw new Error("accounts must be array");
      atomicWrite(ACCOUNTS_FILE, JSON.stringify(accounts, null, 2));
      return true;
    } catch (err) {
      logger.error(`Failed to save accounts: ${err.message}`);
      return false;
    }
  }
  saveAccount(account) {
    if (!account || typeof account.username !== "string") return false;
    if (account.username.includes("__proto__")) return false;
    const accounts = this.loadAccounts();
    const idx = accounts.findIndex(
      (a) => a.username.toLowerCase() === account.username.toLowerCase(),
    );
    if (idx >= 0) accounts[idx] = { ...accounts[idx], ...account };
    else accounts.push(account);
    return this.saveAccounts(accounts);
  }
  accountExists(username) {
    const accounts = this.loadAccounts();
    return accounts.some(
      (a) => a.username.toLowerCase() === username.toLowerCase(),
    );
  }
  getRefreshToken(username) {
    if (typeof username !== "string") return null;
    try {
      if (!fs.existsSync(REFRESHTOKENS_FILE)) return null;
      const all = safeParse(fs.readFileSync(REFRESHTOKENS_FILE, "utf8"));
      if (!all || typeof all !== "object" || Array.isArray(all)) return null;
      const k = all[username];
      return typeof k === "string" && k.length > 20 ? k : null;
    } catch (err) {
      logger.error(`Failed to load refresh token: ${err.message}`);
      return null;
    }
  }
  saveRefreshToken(username, token) {
    try {
      if (
        typeof username !== "string" ||
        typeof token !== "string" ||
        token.length < 20
      )
        return false;
      this.ensureDirs();
      let all = {};
      try {
        if (fs.existsSync(REFRESHTOKENS_FILE))
          all = safeParse(fs.readFileSync(REFRESHTOKENS_FILE, "utf8")) || {};
      } catch {}
      if (!all || typeof all !== "object" || Array.isArray(all)) all = {};
      all[username] = token;
      atomicWrite(REFRESHTOKENS_FILE, JSON.stringify(all, null, 2));
      logger.info(`Saved refresh token for "${username}"`);
      return true;
    } catch (err) {
      logger.error(`Failed to save refresh token: ${err.message}`);
      return false;
    }
  }
  clearRefreshToken(username) {
    try {
      if (!fs.existsSync(REFRESHTOKENS_FILE)) return true;
      const all = safeParse(fs.readFileSync(REFRESHTOKENS_FILE, "utf8")) || {};
      if (Object.prototype.hasOwnProperty.call(all, username)) {
        delete all[username];
        atomicWrite(REFRESHTOKENS_FILE, JSON.stringify(all, null, 2));
      }
      return true;
    } catch (err) {
      logger.error(`Failed to clear refresh token: ${err.message}`);
      return false;
    }
  }
  loadSettings() {
    try {
      if (fs.existsSync(SETTINGS_FILE)) {
        const data = fs.readFileSync(SETTINGS_FILE, "utf8");
        return { ...DEFAULT_SETTINGS, ...safeParse(data) };
      }
    } catch (err) {
      logger.error(`Failed to load settings: ${err.message}`);
    }
    return { ...DEFAULT_SETTINGS };
  }
  saveSettings(settings) {
    try {
      this.ensureDirs();
      atomicWrite(SETTINGS_FILE, JSON.stringify(settings, null, 2));
      return true;
    } catch (err) {
      logger.error(`Failed to save settings: ${err.message}`);
      return false;
    }
  }
  exportAccounts(callback) {
    console.clear();
    const accounts = this.loadAccounts();
    if (accounts.length === 0) {
      logger.warn("No accounts to export");
      ui.pause();
      if (callback) callback();
      return;
    }
    ui.box("EXPORT ACCOUNTS", [
      "",
      `${c.dim}Export ${accounts.length} account(s) to a JSON file.${c.reset}`,
      `${c.dim}Note: passwords are NOT exported.${c.reset}`,
      "",
    ]);
    let filename = ui.question("Name (default: backup.json): ").trim();
    if (!filename) filename = "backup.json";
    if (!filename.endsWith(".json")) filename += ".json";
    if (
      filename.includes("..") ||
      filename.includes("/") ||
      filename.includes("\\")
    ) {
      logger.error("Invalid name");
      ui.pause();
      if (callback) callback();
      return;
    }
    const exportData = {
      exported: new Date().toISOString(),
      version: "3.3.0",
      accounts: accounts.map((a) => ({
        username: a.username,
        has2FA: !!a.sharedSecret,
        invisible: a.invisible || false,
        games: (a.gamesAndStatus || []).filter((g) => typeof g === "number"),
        status:
          (a.gamesAndStatus || []).find((g) => typeof g === "string") || null,
        replyMessage: a.replyMessage || null,
      })),
    };
    try {
      const filepath = path.join(ROOT, filename);
      if (!filepath.startsWith(ROOT)) throw new Error("Path traversal");
      atomicWrite(filepath, JSON.stringify(exportData, null, 2));
      logger.success(`Exported to: ${filepath}`);
    } catch (err) {
      logger.error(`Export failed: ${err.message}`);
    }
    ui.pause();
    if (callback) callback();
  }
}
module.exports = new ConfigManager();
