import { httpError } from "../middleware/errors.js";

// Tiny in-memory limiter (no extra package): max `limit` requests per IP per `windowMs`.
export function rateLimit({ limit, windowMs, message }) {
  const hits = new Map();
  return (req, res, next) => {
    const now = Date.now();
    const key = req.ip;
    const entry = hits.get(key);
    if (!entry || entry.reset < now) hits.set(key, { count: 1, reset: now + windowMs });
    else if (++entry.count > limit) return next(httpError(429, message));
    if (hits.size > 10_000) for (const [k, v] of hits) if (v.reset < now) hits.delete(k);
    next();
  };
}
