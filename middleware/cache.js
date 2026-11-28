const memoryStore = new Map();

/**
 * Ultra-fast in-memory cache for repeated GET queries.
 * Prevents redundant database roundtrips on rapid navigation and polling.
 * Automatically invalidated on any POST / PUT / PATCH / DELETE mutation.
 */
export function responseCache(ttlMs = 3000) {
  return (req, res, next) => {
    // Never cache non-GET methods, auth routes, notifications, emergency, or Server-Sent Events streams
    if (
      req.method !== "GET" ||
      req.path.includes("/stream") ||
      req.path.includes("/login") ||
      req.path.includes("/emergency") ||
      req.path.includes("/notifications")
    ) {
      if (req.method !== "GET") {
        const prefix = req.baseUrl || req.path.split("/").slice(0, 3).join("/");
        for (const k of memoryStore.keys()) {
          if (!prefix || k.includes(prefix)) {
            memoryStore.delete(k);
          }
        }
      }
      return next();
    }

    const userId = req.user?._id || req.user?.username || "anon";
    const cacheKey = `${userId}:${req.baseUrl || ""}${req.url}`;
    const cached = memoryStore.get(cacheKey);

    if (cached && Date.now() - cached.time < ttlMs) {
      res.setHeader("X-Cache", "HIT");
      return res.status(cached.status).json(cached.body);
    }

    const originalJson = res.json.bind(res);
    res.json = (body) => {
      if (res.statusCode >= 200 && res.statusCode < 300) {
        memoryStore.set(cacheKey, {
          time: Date.now(),
          status: res.statusCode,
          body,
        });
      }
      return originalJson(body);
    };

    next();
  };
}
