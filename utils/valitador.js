/**
 * SteamBooster - input validation
 */
function isValidUsername(username) {
  if (!username || typeof username !== 'string') return false;
  const u = username.trim();
  if (u.length < 2 || u.length > 64) return false;
  // Steam accepts account names AND email addresses as login name, so '@' and '+' must be allowed
  return /^[a-zA-Z0-9_.@+-]+$/.test(u);
}
function isValidPassword(password) {
  if (!password || typeof password !== 'string') return false;
  if (password.length < 1 || password.length > 256) return false;
  if (password.includes('\x00')) return false;
  if (password.trim().length === 0) return false;
  return true;
}
function isValidGameId(gameId) {
  const n = typeof gameId === 'string' ? parseInt(gameId, 10) : gameId;
  return Number.isInteger(n) && n > 0 && n < 2147483647;
}
function validateAccount(account) {
  const errors = [];
  if (!account || typeof account !== 'object') return { valid: false, errors: ['Invalid account object'] };
  if (!isValidUsername(account.username)) errors.push('Invalid username (2-64 chars, a-z0-9_.@+-)');
  if (!isValidPassword(account.password)) errors.push('Invalid password (1-256 chars, non-empty)');
  if (account.gamesAndStatus) {
    if (!Array.isArray(account.gamesAndStatus)) errors.push('gamesAndStatus must be an array');
    else {
      const games = account.gamesAndStatus.filter(g => typeof g === 'number');
      if (games.length === 0) errors.push('At least one game ID required');
      for (const g of games) if (!isValidGameId(g)) errors.push(`Invalid game ID: ${g}`);
    }
  }
  if (account.sharedSecret && typeof account.sharedSecret === 'string' && account.sharedSecret.length > 0 && account.sharedSecret.length < 10) {
    errors.push('Shared secret too short');
  }
  return { valid: errors.length === 0, errors };
}
function validateSettings(settings) {
  const errors = [];
  if (!settings || typeof settings !== 'object') return { valid: false, errors: ['Invalid settings object'] };
  if (settings.startupDelay !== undefined) {
    const d = parseInt(settings.startupDelay, 10);
    if (!Number.isInteger(d) || d < 500 || d > 30000) errors.push('startupDelay must be 500-30000ms');
  }
  if (settings.maxReconnectAttempts !== undefined) {
    const a = parseInt(settings.maxReconnectAttempts, 10);
    if (!Number.isInteger(a) || a < 0 || a > 50) errors.push('maxReconnectAttempts must be 0-50');
  }
  if (settings.monitorPort !== undefined) {
    const p = parseInt(settings.monitorPort, 10);
    if (!Number.isInteger(p) || p < 0 || p > 65535) errors.push('monitorPort must be 0-65535 (0=disabled)');
  }
  for (const f of ['autoReconnect', 'invisibleMode', 'saveMessages', 'debug', 'resumeWhenIdle']) {
    if (settings[f] !== undefined && typeof settings[f] !== 'boolean') errors.push(`${f} must be boolean`);
  }
  return { valid: errors.length === 0, errors };
}
module.exports = {
  isValidUsername, isValidPassword, isValidGameId,
  validateAccount, validateSettings
};
