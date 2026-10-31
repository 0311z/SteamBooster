'use strict';

jest.mock('steam-user', () => {
  const { EventEmitter } = require('node:events');
  class Client extends EventEmitter {
    constructor() { super(); Client.instances.push(this); this.steamID = { getSteamID64: () => '12345678901234567' }; }
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
jest.mock('easytimer.js', () => ({ Timer: class {
  constructor() { this.start = jest.fn(); this.stop = jest.fn(); }
} }));
jest.mock('../utils/configManager', () => ({
  loadSettings: () => ({ autoReconnect: true, maxReconnectAttempts: 5 }),
  getRefreshToken: () => null,
  clearRefreshToken: jest.fn(),
  saveRefreshToken: jest.fn()
}));
jest.mock('../utils/logger', () => ({ info: jest.fn(), success: jest.fn(), warn: jest.fn(), error: jest.fn() }));

const SteamUser = require('steam-user');
const { SteamBooster } = require('../src/accountHandler');
const account = { username: 'testuser', password: 'password', gamesAndStatus: [730] };

beforeEach(() => { jest.useFakeTimers(); SteamUser.instances.length = 0; });
afterEach(() => { jest.clearAllTimers(); jest.useRealTimers(); });

test('successful login keeps the session timer running and stands down after a kick', async () => {
  const booster = new SteamBooster();
  booster.isBoosting = true;
  const result = booster.loginAccount(account);
  const client = SteamUser.instances[0];
  client.emit('loggedOn');
  expect(await result).toBe(true);
  const timer = booster.clients.get(account.username).timer;
  expect(timer.start).toHaveBeenCalledTimes(1);
  expect(timer.stop).not.toHaveBeenCalled();
  client.emit('error', { eresult: 6 });
  client.emit('disconnected', 6);
  expect(timer.stop).toHaveBeenCalledTimes(1);
  expect(booster.accountStates.get(account.username)).toBe('kicked');
  expect(booster.kicked.get(account.username).steamID64).toBe('12345678901234567');
  expect(booster.probeTimers.size).toBe(1);
});

test('a kick delivered as a disconnect does not trigger an immediate reconnect', async () => {
  const booster = new SteamBooster();
  booster.isBoosting = true;
  const result = booster.loginAccount(account);
  const client = SteamUser.instances[0];
  client.emit('loggedOn');
  await result;
  client.emit('disconnected', 6);
  jest.advanceTimersByTime(5000);
  expect(booster.accountStates.get(account.username)).toBe('kicked');
  expect(SteamUser.instances).toHaveLength(1);
});

test('a stalled login times out and ignores a late success', async () => {
  const booster = new SteamBooster();
  const result = booster.loginAccount(account);
  const client = SteamUser.instances[0];
  const logOff = jest.spyOn(client, 'logOff');
  jest.advanceTimersByTime(600000);
  expect(await result).toBe(false);
  expect(logOff).toHaveBeenCalledTimes(1);
  client.emit('loggedOn');
  expect(booster.clients.size).toBe(0);
  expect(booster.accountErrors.get(account.username)).toBe('Login timeout');
});

test('a connection error after login stops the timer and schedules one reconnect', async () => {
  const booster = new SteamBooster();
  booster.isBoosting = true;
  const result = booster.loginAccount(account);
  const client = SteamUser.instances[0];
  client.emit('loggedOn');
  await result;
  const timer = booster.clients.get(account.username).timer;
  client.emit('error', { eresult: 0 });
  client.emit('disconnected', 0);
  expect(timer.stop).toHaveBeenCalledTimes(1);
  expect(booster.accountStates.get(account.username)).toBe('disconnected');
  jest.advanceTimersByTime(5000);
  expect(SteamUser.instances).toHaveLength(2);
});

test('a disconnect before login resolves the attempt', async () => {
  const booster = new SteamBooster();
  const result = booster.loginAccount(account);
  SteamUser.instances[0].emit('disconnected', 3);
  expect(await result).toBe(false);
  expect(booster.accountErrors.get(account.username)).toContain('Disconnected before login');
});
