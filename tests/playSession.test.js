"use strict";
const { EventEmitter } = require("node:events");
const { startPlaySession } = require("../utils/playSession");
const { validateAccount } = require("../utils/valitador");
let client;
beforeEach(() => {
  jest.useFakeTimers();
  client = new EventEmitter();
  client.steamID = {};
  client.gamesPlayed = jest.fn();
});
afterEach(() => {
  jest.clearAllTimers();
  jest.useRealTimers();
});
const games = Array.from({ length: 65 }, (_, i) => i + 1);
function start(options = {}) {
  return startPlaySession({
    client,
    games,
    onComplete: jest.fn(),
    onError: jest.fn(),
    ...options,
  });
}

test("rotates all games fairly in batches of at most 32 and wraps around", () => {
  const session = start({ rotationMinutes: 1 });
  expect(client.gamesPlayed).toHaveBeenLastCalledWith(games.slice(0, 32));
  jest.advanceTimersByTime(60000);
  expect(client.gamesPlayed).toHaveBeenLastCalledWith(games.slice(32, 64));
  jest.advanceTimersByTime(60000);
  expect(client.gamesPlayed).toHaveBeenLastCalledWith([65]);
  expect(session.snapshot()).toMatchObject({ batch: 3, batches: 3 });
  jest.advanceTimersByTime(60000);
  expect(client.gamesPlayed).toHaveBeenLastCalledWith(games.slice(0, 32));
});
test("duration takes priority over rotation and completes exactly once", () => {
  const onComplete = jest.fn();
  start({ rotationMinutes: 1, durationMinutes: 1, onComplete });
  jest.advanceTimersByTime(120000);
  expect(onComplete).toHaveBeenCalledTimes(1);
  expect(client.gamesPlayed).toHaveBeenCalledTimes(1);
});
test.each(["error", "disconnected"])("stops all work after %s", (event) => {
  const onComplete = jest.fn();
  start({ rotationMinutes: 1, durationMinutes: 2, onComplete });
  client.emit(event, new Error("lost connection"));
  jest.advanceTimersByTime(180000);
  expect(onComplete).not.toHaveBeenCalled();
  expect(client.gamesPlayed).toHaveBeenCalledTimes(1);
});
test("reports a rotation failure once and stops", () => {
  const onError = jest.fn();
  start({ rotationMinutes: 1, onError });
  client.gamesPlayed.mockImplementation(() => {
    throw new Error("rotation failed");
  });
  jest.advanceTimersByTime(120000);
  expect(onError).toHaveBeenCalledTimes(1);
});
test("default behavior preserves the configured games and imposes no duration", () => {
  const onComplete = jest.fn();
  start({ onComplete });
  jest.advanceTimersByTime(120000);
  expect(client.gamesPlayed).toHaveBeenCalledTimes(1);
  expect(client.gamesPlayed).toHaveBeenCalledWith(games);
  expect(onComplete).not.toHaveBeenCalled();
});
test.each([-1, 0.5, "10", 10081, NaN])(
  "rejects invalid control values: %s",
  (value) => {
    expect(() => start({ rotationMinutes: value })).toThrow();
    expect(
      validateAccount({
        username: "test",
        password: "test",
        sessionDurationMinutes: value,
      }).valid,
    ).toBe(false);
  },
);
