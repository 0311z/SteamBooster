# SteamBooster v3.3.0

**STEAM BOOSTER v3.3.0**

> **Advanced Steam Hour Booster** with real Steam Guard login, refresh-token persistence, invisible mode, session watchdog with kick-aware auto-resume, and a local HTTP monitor. English UI.

[![Node.js](https://img.shields.io/badge/Node.js-20+-green.svg)](https://nodejs.org/)
[![License](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

---

## Legal disclaimer

This software is provided for **educational purposes only**. Using it **violates Steam's Terms of Service** and may result in a permanent ban. Use **alt/test accounts only**. The author takes no responsibility for any consequences.

---

## Features

### Security

- Input validation (usernames, passwords, game IDs, settings)
- Prototype-pollution safe config (JSON reviver strips `__proto__`/`constructor`/`prototype`)
- Atomic writes for config files (`.tmp` + rename)
- Single-instance lock with heartbeat (`data/steam.lock`) to prevent two copies fighting over one account
- Rate limiting with exponential backoff (45s -> 90s -> 180s) and fresh 2FA per retry

### Login

- Real Steam login with **Steam Guard**: email code, mobile TOTP (auto-generated from shared secret), and **1-click app approval** via `steam-session`
- Refresh-token persistence: first good login saves the token; later logins need no password or Guard
- Handles expired tokens (eresult 27), `NoConnection` (eresult 0/3), rate limits (84/87), kicked sessions (eresult 6)
- Passwords up to 256 chars supported (warns above 64 due to steam-session limits)
- Usernames may be email addresses (contains `@`)

### Boosting

- Multi-account simultaneous boosting
- Invisible mode (appear offline while boosting)
- Custom status string + game IDs (status separated from AppIDs so all games count)
- Auto-reconnect with configurable attempts
- Warns when more than ~32 games are configured (Steam only counts the first ~32 per session)

### Session watchdog

- Local health tick every 5 min (zero Steam traffic, never rate-limited)
- On kick (`LoggedInElsewhere`): stops the clock, stands down instead of fighting you
- Anonymous presence probe (cannot kick you) with backoff 15m -> 30m -> 60m -> 120m
- Blind re-login after 3 unknown probes
- Auto-resume when you finish (offline, or idle if `resumeWhenIdle` is on)
- Self-pausing fix: ignores the bot's own idled AppIDs when probing
- Timers always stop on kick/disconnect (no fake hours)

### UI and tooling

- Pure ASCII UI (no `?` glyphs), pagination for 9+ accounts, truncation for long names
- Statistics dashboard (session + lifetime + per-account)
- Settings menu (auto-reconnect, invisible, save messages, debug, startup delay, resume-when-idle, monitor port)
- Auto-start hidden on boot (VBS + Startup shortcut, no window, `--auto` flag)
- CLI flags: `--auto`, `--account NAME`, `--status`, `--stop`, `--help`
- Optional local HTTP monitor (off by default): `GET /status` returns JSON
- English-only UI and logs; ANSI stripped from log files; local wall-clock timestamps

---

## Quick start

### Prerequisites

- [Node.js](https://nodejs.org/) v20 or higher
- npm (comes with Node.js)
- Steam account(s) - **USE ALT ACCOUNTS**

### Installation

```bash
git clone https://github.com/0311z/SteamBooster.git
cd SteamBooster
npm install
cp config/accounts.example.json config/accounts.json
# edit config/accounts.json with your credentials
npm start
```

### First run

1. Accept the legal disclaimer
2. Add your first account (wizard) or edit `config/accounts.json`
3. Complete Steam Guard once (email code, mobile code, or 1-click app approval) - the refresh token is saved to `config/refreshTokens.json`
4. From then on it signs in alone

---

## Configuration

### `config/accounts.json`

```json
[
  {
    "username": "your_username",
    "password": "your_password",
    "sharedSecret": "",
    "invisible": true,
    "gamesAndStatus": ["Custom Status", 730, 440, 570],
    "replyMessage": "AFK - Boosting hours",
    "saveMessages": true
  }
]
```

- `sharedSecret`: 2FA shared secret for auto-generated codes (empty = manual/QR)
- `gamesAndStatus`: first string is a custom status, the rest are App IDs (numbers)
- Usernames may be email addresses

### `config/settings.json`

```json
{
  "autoReconnect": true,
  "invisibleMode": false,
  "saveMessages": true,
  "debug": false,
  "startupDelay": 2000,
  "maxReconnectAttempts": 5,
  "resumeWhenIdle": true,
  "monitorPort": 0
}
```

`monitorPort`: 0 disables the HTTP monitor; set e.g. `3001` to enable `http://127.0.0.1:3001/status`. Also controllable via the `MONITOR_PORT` env var.

---

## Usage

### Main menu (interactive)

```bash
node src/accountHandler.js
```

### Auto mode (unattended, no prompts)

```bash
node src/accountHandler.js --auto
node src/accountHandler.js --auto --account NAME
```

### CLI helpers

```bash
node src/accountHandler.js --status
node src/accountHandler.js --stop
node src/accountHandler.js --help
```

### While boosting (interactive terminal)

- `M` - return to menu
- `S` - view statistics
- `Q` - quit

### Login methods

1. Password only
2. Password + 2FA (manual code)
3. Password + shared secret (auto codes)
4. QR / app approval (option 2 in the Guard prompt)

---

## Windows auto-start (hidden)

1. Run once interactively (`npm start`), accept the disclaimer, pass Steam Guard. The token is saved.
2. Run `install-autostart.bat` (creates `SteamBooster.lnk` in Startup, launches `start-hidden.vbs` with no window).
3. From then on it starts alone on sign-in with `node src/accountHandler.js --auto`.
4. To remove: `uninstall-autostart.bat`.

---

## Security best practices

- Never commit `config/accounts.json`, `config/settings.json`, `config/refreshTokens.json` (already in `.gitignore`)
- Set restrictive permissions: `chmod 600 config/*.json`
- Use alt accounts only

---

## Troubleshooting

| Symptom                               | Fix                                                              |
| ------------------------------------- | ---------------------------------------------------------------- |
| `Another instance is already running` | Run `--status` then `--stop`                                     |
| `Invalid password`                    | Check credentials; try logging in on the Steam website first     |
| `Rate limited` (84/87)                | Wait 30 min; increase `startupDelay`                             |
| `Steam Guard required`                | Add `sharedSecret`, use app approval, or enter the code manually |
| `Session expired` (27)                | Cleared automatically; re-enters with password                   |
| UI looks broken                       | Terminal width >= 80 columns; UTF-8 console font                 |
| Hours not showing                     | Wait; Steam updates playtime with delay                          |

Debug mode: enable in Settings or set `DEBUG=true`.

---

<!-- coderabbit-ai-generated:v1 -->

<!-- coderabbit-ai-generated-section:v1:d147d8e2a784cbf147d196519d5d3c62c6fd14d11e760ab8f0b28c852d0d35dd -->

## Game rotation and automatic stop

Optional fields in each account in `config/accounts.json`:

```json
{
  "rotationMinutes": 30,
  "sessionDurationMinutes": 120
}
```

Merge these fields into your existing account object. Both default to `0` (disabled) and accept whole minutes from 0 to 10080. With rotation enabled, unique game IDs are split into batches of at most 32. Each batch plays for the configured interval, then the next batch starts; the sequence repeats. Rotation distributes time across batches, so each game receives only its batch's active time. Steam remains responsible for credited playtime.

The duration limit logs the account off and marks it `completed`, without scheduling an automatic reconnect. It counts time since the latest successful login; reconnecting or manually starting a new session resets the duration and rotation. Disconnects and kicks cancel pending rotation and completion timers.

The optional local `/status` monitor includes each active account's current games, batch number, batch count, elapsed seconds and remaining seconds (`null` when unlimited), under `session`. No password or token is included.

## Development

<!-- /coderabbit-ai-generated:v1 -->

<!-- coderabbit-ai-generated:v1 -->

<!-- coderabbit-ai-generated-section:v1:c36a8a49b20710122815952206271e26c6ceb52cb2c43747a81392b675df1cfe -->

```bash
npm test          # run tests
npm run lint      # eslint
npm run validate  # lint + tests
```

<!-- /coderabbit-ai-generated:v1 -->

---

## License

MIT. Educational use only. May violate Steam ToS.

---

## Acknowledgments

- [node-steam-user](https://github.com/DoctorMcKay/node-steam-user)
- [steam-totp](https://github.com/DoctorMcKay/node-steam-totp)
- [steam-session](https://github.com/DoctorMcKay/node-steam-session)
- Inspired by DrWarpMan/steam-hour-booster, valnssh, user28111999/steam-booster
