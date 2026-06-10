function fetchWithRequestTimeout(url, options = {}, timeoutMs = 0) {
  const ms = Number(timeoutMs || 0);
  if (!Number.isFinite(ms) || ms <= 0 || options.signal) return fetch(url, options);
  if (typeof AbortSignal !== 'undefined' && typeof AbortSignal.timeout === 'function') {
    return fetch(url, { ...options, signal: AbortSignal.timeout(ms) });
  }
  if (typeof AbortController === 'undefined') return fetch(url, options);
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), ms);
  return fetch(url, { ...options, signal: ac.signal }).finally(() => clearTimeout(timer));
}

module.exports = { fetchWithRequestTimeout };
