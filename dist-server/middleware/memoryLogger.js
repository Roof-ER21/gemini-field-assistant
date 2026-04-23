const MB = 1024 * 1024;
function fmt(bytes) {
    return `${Math.round(bytes / MB)}MB`;
}
export function startMemoryHeartbeat(heartbeatMs = 60_000) {
    const timer = setInterval(() => {
        const u = process.memoryUsage();
        console.log(`[mem] heartbeat rss=${fmt(u.rss)} heap=${fmt(u.heapUsed)}/${fmt(u.heapTotal)} ext=${fmt(u.external)} arrays=${fmt(u.arrayBuffers)}`);
    }, heartbeatMs);
    // Don't block process exit on the interval.
    timer.unref();
    return timer;
}
export function memoryDeltaMiddleware(opts = {}) {
    const minDeltaBytes = (opts.minDeltaMB ?? 10) * MB;
    const minDurationMs = opts.minDurationMs ?? 1000;
    return (req, res, next) => {
        const startHeap = process.memoryUsage().heapUsed;
        const startRss = process.memoryUsage().rss;
        const startAt = Date.now();
        res.on('finish', () => {
            const endHeap = process.memoryUsage().heapUsed;
            const endRss = process.memoryUsage().rss;
            const dHeap = endHeap - startHeap;
            const dRss = endRss - startRss;
            const dur = Date.now() - startAt;
            if (Math.abs(dHeap) >= minDeltaBytes || Math.abs(dRss) >= minDeltaBytes || dur >= minDurationMs) {
                // route is Express's matched route path or falls back to the raw URL
                const route = (req.route && req.route.path) || req.baseUrl + (req.path || '');
                console.log(`[mem] req ${req.method} ${route} dur=${dur}ms dheap=${fmt(dHeap)} drss=${fmt(dRss)} heap_end=${fmt(endHeap)} rss_end=${fmt(endRss)} status=${res.statusCode}`);
            }
        });
        next();
    };
}
