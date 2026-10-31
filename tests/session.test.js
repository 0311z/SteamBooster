"use strict";

jest.mock("steam-user", () => {
  const { EventEmitter } = require("node:events");
  class Client extends EventEmitter {
    constructor() {
      super();
      Client.instances.push(this);
      this.steamID = { getSteamID64: () => "12345678901234567" };
    }
    logOn() {}
    logOff() {}
    setPersona() {}
    gamesPlayed() {}
  }
  Client.instances = [];
  Client.EPersonaState = { Invisible: 7, Online: 1 };
  Client.EResult = {};
  return Client;
});
jest.mock("easytimer.js", () => ({
  Timer: class {
    constructor() {
      this.start = jest.fn();
      this.stop = jest.fn();
    }
  },
}));
jest.mock("../utils/configManager", () => ({
  loadSettings: () => ({ autoReconnect: true, maxReconnectAttempts: 5 }),
  getRefreshToken: jest.fn(() => null),
  clearRefreshToken: jest.fn(),
  saveRefreshToken: jest.fn(),
}));
jest.mock("../utils/logger", () => ({
  info: jest.fn(),
  success: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
}));
jest.mock("../utils/ui", () => ({ question: jest.fn() }));
jest.mock("steam-session", () => {
  const { EventEmitter } = require("node:events");
  class LoginSession extends EventEmitter {
    constructor() {
      super();
      LoginSession.instances.push(this);
    }
    startWithCredentials() {
      return Promise.resolve({
        actionRequired: true,
        validActions: [{ type: 1 }],
      });
    }
    cancelLoginAttempt() {}
  }
  LoginSession.instances = [];
  return {
    LoginSession,
    EAuthTokenPlatformType: { SteamClient: 1 },
    EAuthSessionGuardType: { DeviceConfirmation: 1 },
  };
});

const SteamUser = require("steam-user");
const config = require("../utils/configManager");
const ui = require("../utils/ui");
const { LoginSession } = require("steam-session");
const { SteamBooster } = require("../src/accountHandler");
const account = {
  username: "testuser",
  password: "password",
  gamesAndStatus: [730],
};

beforeEach(() => {
  jest.useFakeTimers();
  SteamUser.instances.length = 0;
  LoginSession.instances.length = 0;
  jest.clearAllMocks();
  config.getRefreshToken.mockReturnValue(null);
});
afterEach(() => {
  jest.clearAllTimers();
  jest.useRealTimers();
});

test("successful login keeps the session timer running and stands down after a kick", async () => {
  const booster = new SteamBooster();
  booster.isBoosting = true;
  const result = booster.loginAccount(account);
  const client = SteamUser.instances[0];
  client.emit("loggedOn");
  expect(await result).toBe(true);
  const timer = booster.clients.get(account.username).timer;
  expect(timer.start).toHaveBeenCalledTimes(1);
  expect(timer.stop).not.toHaveBeenCalled();
  client.emit("error", { eresult: 6 });
  client.emit("disconnected", 6);
  expect(timer.stop).toHaveBeenCalledTimes(1);
  expect(booster.accountStates.get(account.username)).toBe("kicked");
  expect(booster.kicked.get(account.username).steamID64).toBe(
    "12345678901234567",
  );
  expect(booster.probeTimers.size).toBe(1);
});

test("a kick delivered as a disconnect does not trigger an immediate reconnect", async () => {
  const booster = new SteamBooster();
  booster.isBoosting = true;
  const result = booster.loginAccount(account);
  const client = SteamUser.instances[0];
  client.emit("loggedOn");
  await result;
  client.emit("disconnected", 6);
  jest.advanceTimersByTime(5000);
  expect(booster.accountStates.get(account.username)).toBe("kicked");
  expect(SteamUser.instances).toHaveLength(1);
});

test("a stalled login times out and ignores a late success", async () => {
  const booster = new SteamBooster();
  const result = booster.loginAccount(account);
  const client = SteamUser.instances[0];
  const logOff = jest.spyOn(client, "logOff");
  jest.advanceTimersByTime(600000);
  expect(await result).toBe(false);
  expect(logOff).toHaveBeenCalledTimes(1);
  client.emit("loggedOn");
  expect(booster.clients.size).toBe(0);
  expect(booster.accountErrors.get(account.username)).toBe("Login timeout");
});

test("a connection error after login stops the timer and schedules one reconnect", async () => {
  const booster = new SteamBooster();
  booster.isBoosting = true;
  const result = booster.loginAccount(account);
  const client = SteamUser.instances[0];
  client.emit("loggedOn");
  await result;
  const timer = booster.clients.get(account.username).timer;
  client.emit("error", { eresult: 0 });
  client.emit("disconnected", 0);
  expect(timer.stop).toHaveBeenCalledTimes(1);
  expect(booster.accountStates.get(account.username)).toBe("disconnected");
  jest.advanceTimersByTime(5000);
  expect(SteamUser.instances).toHaveLength(2);
});

test("a disconnect before login resolves the attempt", async () => {
  const booster = new SteamBooster();
  const result = booster.loginAccount(account);
  SteamUser.instances[0].emit("disconnected", 3);
  expect(await result).toBe(false);
  expect(booster.accountErrors.get(account.username)).toContain(
    "Disconnected before login",
  );
});

test("a saved refresh token is passed without password or account name", async () => {
  config.getRefreshToken.mockReturnValue("header.payload.signature");
  const logOn = jest.spyOn(SteamUser.prototype, "logOn");
  const booster = new SteamBooster();
  const result = booster.loginAccount(account);
  expect(logOn).toHaveBeenCalledWith({
    refreshToken: "header.payload.signature",
  });
  SteamUser.instances[0].emit("loggedOn");
  expect(await result).toBe(true);
  logOn.mockRestore();
});

test("mobile approval starts login with the received token without requesting a code", async () => {
  ui.question.mockReturnValue("2");
  const logOn = jest.spyOn(SteamUser.prototype, "logOn");
  const booster = new SteamBooster();
  const result = booster.loginAccount(account);
  const client = SteamUser.instances[0];
  client.emit("steamGuard", null, jest.fn(), false);
  await Promise.resolve();
  expect(ui.question).toHaveBeenCalledTimes(1);
  LoginSession.instances[0].refreshToken = "header.payload.signature";
  LoginSession.instances[0].emit("authenticated");
  await Promise.resolve();
  expect(config.saveRefreshToken).toHaveBeenCalledWith(
    account.username,
    "header.payload.signature",
  );
  expect(logOn).toHaveBeenLastCalledWith({
    refreshToken: "header.payload.signature",
  });
  client.emit("loggedOn");
  expect(await result).toBe(true);
  logOn.mockRestore();
});

test("auto mode fails instead of prompting when Steam Guard requires input", async () => {
  const booster = new SteamBooster({ autoMode: true });
  const result = booster.loginAccount(account);
  SteamUser.instances[0].emit("steamGuard", null, jest.fn(), false);
  expect(await result).toBe(false);
  expect(ui.question).not.toHaveBeenCalled();
});

test("mobile approval timeout ends the attempt and cancels polling", async () => {
  ui.question.mockReturnValue("2");
  const booster = new SteamBooster();
  const result = booster.loginAccount(account);
  SteamUser.instances[0].emit("steamGuard", null, jest.fn(), false);
  await Promise.resolve();
  const session = LoginSession.instances[0];
  const cancel = jest.spyOn(session, "cancelLoginAttempt");
  jest.advanceTimersByTime(120000);
  expect(await result).toBe(false);
  expect(cancel).toHaveBeenCalledTimes(1);
  expect(booster.accountErrors.get(account.username)).toContain("Timed out");
});

test("a login error cancels a pending phone approval", async () => {
  ui.question.mockReturnValue("2");
  const booster = new SteamBooster();
  const result = booster.loginAccount(account);
  const client = SteamUser.instances[0];
  client.emit("steamGuard", null, jest.fn(), false);
  await Promise.resolve();
  const session = LoginSession.instances[0];
  const cancel = jest.spyOn(session, "cancelLoginAttempt");
  client.emit("error", { eresult: 5 });
  expect(await result).toBe(false);
  expect(cancel).toHaveBeenCalledTimes(1);
  session.refreshToken = "header.payload.signature";
  session.emit("authenticated");
  expect(config.saveRefreshToken).not.toHaveBeenCalled();
});
