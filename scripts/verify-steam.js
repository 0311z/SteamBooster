"use strict";
// Verifies real Steam authentication using an existing token; never starts games.
const SteamUser = require("steam-user");
const config = require("../utils/configManager");
const username = process.argv[2];
const token = username && config.getRefreshToken(username);
if (!token) {
  console.error(
    "Verification blocked: provide an account name with a saved refresh token after an interactive login.",
  );
  process.exitCode = 2;
} else {
  const client = new SteamUser({
    autoRelogin: false,
    renewRefreshTokens: false,
  });
  let finished = false;
  const finish = (code, message) => {
    if (finished) return;
    finished = true;
    clearTimeout(timeout);
    console.log(message);
    try {
      client.logOff();
    } catch {}
    process.exitCode = code;
    // Steam may keep sockets alive briefly during shutdown.
    setTimeout(() => process.exit(code), 5000).unref();
  };
  const timeout = setTimeout(
    () => finish(1, "Steam authentication timed out."),
    45000,
  );
  client.once("loggedOn", () =>
    finish(0, "Real Steam authentication succeeded. No games were started."),
  );
  client.on("error", (err) =>
    finish(
      1,
      `Steam authentication failed (EResult ${Number.isInteger(err.eresult) ? err.eresult : "unknown"}).`,
    ),
  );
  client.once("disconnected", () =>
    finish(1, "Disconnected before authentication completed."),
  );
  try {
    client.logOn({ refreshToken: token });
  } catch {
    finish(1, "Steam rejected the saved token.");
  }
}
