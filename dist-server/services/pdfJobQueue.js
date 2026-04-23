const POLL_INTERVAL_MS = 3_000;
const STALE_RUNNING_MS = 5 * 60 * 1000; // 5 min — if a row is still 'running' longer, reset to 'pending'
async function claimOne(pool) {
    const r = await pool.query(`UPDATE pdf_jobs
        SET status = 'running', started_at = NOW()
      WHERE id = (
        SELECT id FROM pdf_jobs
         WHERE status = 'pending'
         ORDER BY created_at ASC
         FOR UPDATE SKIP LOCKED
         LIMIT 1
      )
      RETURNING id, payload`);
    return r.rows[0] || null;
}
async function recoverStaleRunning(pool) {
    await pool.query(`UPDATE pdf_jobs
        SET status = 'pending', started_at = NULL
      WHERE status = 'running'
        AND started_at < NOW() - ($1 || ' milliseconds')::interval`, [STALE_RUNNING_MS.toString()]);
}
async function markDone(pool, id, bytes) {
    await pool.query(`UPDATE pdf_jobs
        SET status = 'done', completed_at = NOW(), result_bytes = $2
      WHERE id = $1`, [id, bytes]);
}
async function markError(pool, id, err) {
    await pool.query(`UPDATE pdf_jobs
        SET status = 'error', completed_at = NOW(), error = $2
      WHERE id = $1`, [id, err.slice(0, 1000)]);
}
async function renderOne(job) {
    // Lazy import so any caller that happens to import this module never
    // loads pdfReportServiceV2 if it doesn't have to (pdfkit + fonts +
    // metadata adds ~60MB of resident memory).
    const { pdfReportServiceV2 } = await import('./pdfReportServiceV2.js');
    const stream = pdfReportServiceV2.generateReport(job.payload);
    const chunks = [];
    return new Promise((resolve, reject) => {
        stream.on('data', (chunk) => chunks.push(chunk));
        stream.on('error', reject);
        stream.on('end', () => resolve(Buffer.concat(chunks)));
    });
}
/**
 * Bootstrap the queue worker. Call this from server/worker.ts. Safe to
 * call multiple times — each call starts its own poll loop.
 */
export function startPdfJobWorker(pool) {
    let stopped = false;
    async function loop() {
        while (!stopped) {
            try {
                await recoverStaleRunning(pool);
                const job = await claimOne(pool);
                if (!job) {
                    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
                    continue;
                }
                const t0 = Date.now();
                console.log(`[pdf-queue] start ${job.id}`);
                try {
                    const bytes = await renderOne(job);
                    await markDone(pool, job.id, bytes);
                    console.log(`[pdf-queue] done  ${job.id} (${bytes.length} bytes) in ${Date.now() - t0}ms`);
                }
                catch (err) {
                    console.error(`[pdf-queue] err   ${job.id}:`, err.message);
                    await markError(pool, job.id, err.message);
                }
            }
            catch (outer) {
                console.error('[pdf-queue] outer loop err:', outer.message);
                await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
            }
        }
    }
    loop();
    process.on('SIGTERM', () => { stopped = true; });
    process.on('SIGINT', () => { stopped = true; });
    console.log(`[pdf-queue] started (poll every ${POLL_INTERVAL_MS}ms, bytes stored in pdf_jobs.result_bytes)`);
}
