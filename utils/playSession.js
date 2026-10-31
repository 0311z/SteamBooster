"use strict";

/** Controls one connected session; stopping never schedules a login. */
function startPlaySession({
  client,
  games,
  rotationMinutes = 0,
  durationMinutes = 0,
  onComplete,
  onError,
  now = () => Date.now(),
}) {
  for (const [name, value] of Object.entries({
    rotationMinutes,
    durationMinutes,
  })) {
    if (!Number.isInteger(value) || value < 0 || value > 10080)
      throw new Error(`${name} must be an integer from 0 to 10080`);
  }
  const allGames = [...new Set(games)];
  if (
    !allGames.length ||
    allGames.some((g) => !Number.isInteger(g) || g <= 0 || g >= 2147483647)
  )
    throw new Error("Invalid game IDs");
  const batches = [];
  const batchSize = rotationMinutes ? 32 : allGames.length;
  for (let i = 0; i < allGames.length; i += batchSize)
    batches.push(allGames.slice(i, i + batchSize));
  let index = 0;
  let interval = null;
  let stopped = false;
  const started = now();
  let lastRotation = started;
  const stop = () => {
    stopped = true;
    clearInterval(interval);
    client.removeListener("error", stop);
    client.removeListener("disconnected", stop);
  };
  // Let the caller handle an initial gamesPlayed failure before publishing an active session.
  client.gamesPlayed(batches[0]);
  client.on("error", stop);
  client.on("disconnected", stop);
  interval = setInterval(() => {
    if (stopped) return;
    if (!client.steamID) {
      stop();
      return;
    }
    const current = now();
    if (durationMinutes && current - started >= durationMinutes * 60000) {
      stop();
      onComplete();
      return;
    }
    if (
      rotationMinutes &&
      batches.length > 1 &&
      current - lastRotation >= rotationMinutes * 60000
    ) {
      const next = (index + 1) % batches.length;
      try {
        client.gamesPlayed(batches[next]);
        index = next;
        lastRotation = current;
      } catch (err) {
        stop();
        onError(err);
      }
    }
  }, 1000);
  interval.unref?.();
  return {
    stop,
    snapshot: () => ({
      games: [...batches[index]],
      batch: index + 1,
      batches: batches.length,
      elapsedSeconds: Math.max(0, Math.floor((now() - started) / 1000)),
      remainingSeconds: durationMinutes
        ? Math.max(
            0,
            Math.ceil((durationMinutes * 60000 - (now() - started)) / 1000),
          )
        : null,
    }),
  };
}

module.exports = { startPlaySession };
