'use strict';
/**
 * SteamBooster - simple rate limiter
 */
class RateLimiter {
  constructor(max, windowMs) {
    this.max = max || 30;
    this.windowMs = windowMs || 60000;
    this.tokens = this.max;
    this.last = Date.now();
  }
  _refill() {
    const now = Date.now();
    const elapsed = now - this.last;
    this.tokens = Math.min(this.max, this.tokens + (elapsed / this.windowMs) * this.max);
    this.last = now;
  }
  tryAcquire(n) {
    n = n || 1;
    this._refill();
    if (this.tokens >= n) { this.tokens -= n; return true; }
    return false;
  }
  async wait() {
    while (!this.tryAcquire(1)) await new Promise(r => setTimeout(r, 50));
  }
}
module.exports = { RateLimiter };
