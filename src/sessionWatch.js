"use strict";
/**
 * SteamBooster - session watchdog helpers.
 */
const DEFAULT_PROBE_TIMEOUT_MS = 60_000;

function toGameSet(ownGameIds) {
  if (!ownGameIds) return null;
  const arr = Array.isArray(ownGameIds) ? ownGameIds : [ownGameIds];
  const s = new Set();
  for (const g of arr) {
    const n = typeof g === "string" ? parseInt(g, 10) : g;
    if (Number.isInteger(n) && n > 0) s.add(n);
  }
  return s.size ? s : null;
}

function isPlayingUser(user, ownGameIds) {
  if (!user || typeof user !== "object") return null;
  const own = toGameSet(ownGameIds);
  const gid = user.gameid;
  if (typeof gid === "number") {
    if (own && own.has(gid)) return { playing: false };
    return gid !== 0
      ? { playing: true, game: user.game_name || `app ${gid}` }
      : { playing: false };
  }
  if (typeof gid === "string") {
    const n = parseInt(gid, 10);
    if (own && Number.isInteger(n) && own.has(n)) return { playing: false };
    return gid !== "0" && gid !== ""
      ? { playing: true, game: user.game_name || `app ${gid}` }
      : { playing: false };
  }
  if (typeof user.persona_state === "number") {
    return { playing: false, offline: user.persona_state === 0 };
  }
  return { playing: false };
}

async function probePresence(steamID64, opts = {}) {
  const SteamUserCtor = opts.SteamUserCtor || require("steam-user");
  const timeoutMs = opts.timeoutMs || DEFAULT_PROBE_TIMEOUT_MS;
  const onStage = typeof opts.onStage === "function" ? opts.onStage : null;
  const ownGameIds = opts.ownGameIds || opts.ignoreGameIds || null;
  const stage = (s) => {
    try {
      onStage && onStage(s);
    } catch {}
  };
  if (typeof steamID64 !== "string" || !/^\d{17}$/.test(steamID64)) {
    stage("bad-steamid");
    return null;
  }
  return new Promise((resolve) => {
    let done = false;
    let client = null;
    const finish = (v, why) => {
      if (done) return;
      done = true;
      if (why) stage(why);
      clearTimeout(to);
      try {
        client && client.removeAllListeners();
      } catch {}
      try {
        client && client.logOff && client.logOff();
      } catch {}
      resolve(v);
    };
    const to = setTimeout(() => finish(null, "outer-timeout"), timeoutMs);
    if (to.unref) to.unref();
    try {
      client = new SteamUserCtor({ autoRelogin: false });
    } catch (e) {
      finish(null, `init-failed:${(e && e.message) || e}`);
      return;
    }
    client.once("error", (e) =>
      finish(
        null,
        `logon-error:${(e && (e.eresult !== undefined ? `eresult-${e.eresult}` : e.message)) || "unknown"}`,
      ),
    );
    client.once("disconnected", (er, msg) =>
      finish(null, `disconnected:${er}${msg ? `:${msg}` : ""}`),
    );
    client.once("loggedOn", () => {
      let settledP = false;
      const doneP = (v, why) => {
        if (settledP) return;
        settledP = true;
        clearTimeout(pTo);
        finish(v, why);
      };
      const pTo = setTimeout(() => doneP(null, "personas-timeout"), 20000);
      if (pTo.unref) pTo.unref();
      const pick = (res) => {
        const user = res && res.personas && res.personas[steamID64];
        if (!user) return doneP(null, "no-user");
        const st = isPlayingUser(user, ownGameIds);
        if (!st) return doneP(null, "no-user");
        stage("ok");
        doneP({
          known: true,
          playing: st.playing,
          game: st.game || null,
          offline: !!st.offline,
          name: user.player_name || null,
        });
      };
      try {
        const maybe = client.getPersonas([steamID64], (err, res) => {
          if (err)
            return doneP(null, `personas-error:${(err && err.message) || err}`);
          pick(res);
        });
        if (maybe && typeof maybe.then === "function")
          maybe
            .then(pick)
            .catch((e) =>
              doneP(null, `personas-error:${(e && e.message) || e}`),
            );
      } catch (e) {
        doneP(null, `personas-throw:${(e && e.message) || e}`);
      }
    });
    try {
      client.logOn();
    } catch (e) {
      finish(null, `logon-throw:${(e && e.message) || e}`);
    }
  });
}

module.exports = { probePresence, isPlayingUser, DEFAULT_PROBE_TIMEOUT_MS };
