import express from 'express';
import { once } from 'node:events';
// Only operations and models used by the field app, never an arbitrary URL proxy.
const operations = /^(gemini-2\.5-flash|gemini-2\.5-pro|gemini-2\.0-flash):(generateContent|streamGenerateContent)$/;
export function createGeminiProxyRouter(upstreamFetch = fetch) {
    const router = express.Router();
    router.post('/v1beta/models/:operation', async (req, res) => {
        res.setHeader('Cache-Control', 'no-store');
        if (!req.session)
            return res.status(401).json({ error: { message: 'Sign in to use AI.' } });
        const match = operations.exec(req.params.operation);
        if (!match || !Array.isArray(req.body?.contents) || !req.body.contents.length) {
            return res.status(400).json({ error: { message: 'Unsupported generation request.' } });
        }
        const key = process.env.GOOGLE_AI_API_KEY || process.env.GEMINI_API_KEY ||
            process.env.VITE_GOOGLE_AI_API_KEY || process.env.VITE_GEMINI_API_KEY;
        if (!key)
            return res.status(503).json({ error: { message: 'AI is not configured.' } });
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 120_000);
        const disconnect = () => { if (!res.writableEnded)
            controller.abort(); };
        res.on('close', disconnect);
        try {
            const streaming = match[2] === 'streamGenerateContent';
            const upstream = await upstreamFetch(`https://generativelanguage.googleapis.com/v1beta/models/${req.params.operation}${streaming ? '?alt=sse' : ''}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
                body: JSON.stringify(req.body),
                signal: controller.signal,
            });
            if (!upstream.ok || !upstream.body) {
                await upstream.body?.cancel();
                return res.status(upstream.status === 429 ? 429 : 502)
                    .json({ error: { message: 'AI request failed. Please retry.' } });
            }
            res.setHeader('Content-Type', streaming ? 'text/event-stream' : 'application/json');
            for await (const chunk of upstream.body) {
                if (!res.write(chunk))
                    await once(res, 'drain', { signal: controller.signal });
            }
            res.end();
        }
        catch {
            // Never forward provider errors: they may contain credentials or user content.
            if (!res.headersSent)
                res.status(502).json({ error: { message: 'AI request failed. Please retry.' } });
            else
                res.end();
        }
        finally {
            clearTimeout(timeout);
            res.off('close', disconnect);
        }
    });
    return router;
}
