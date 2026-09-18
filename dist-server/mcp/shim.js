/**
 * Run an Express handler against a synthetic request and capture what it
 * would have sent. Implements only what the five handlers touch; anything
 * else throws, which the executor turns into an isError result.
 */
export async function runHandler(handler, input) {
    return new Promise((resolve, reject) => {
        let status = 200;
        let settled = false;
        let answered = false;
        const done = (c) => { answered = true; if (!settled) {
            settled = true;
            resolve(c);
        } };
        const fail = (err) => { answered = true; if (!settled) {
            settled = true;
            reject(err);
        } };
        const res = {
            status(code) { status = code; return res; },
            setHeader() { return res; },
            set() { return res; },
            type() { return res; },
            json(body) { done({ status, body }); return res; },
            send(body) { done({ status, body }); return res; },
            end() { done({ status, body: null }); return res; },
            headersSent: false,
        };
        const headers = {
            'x-user-email': input.identity.email,
            accept: 'application/json',
        };
        const header = (name) => headers[String(name).toLowerCase()];
        const req = {
            method: input.method,
            path: '/',
            query: input.query ?? {},
            params: {},
            body: input.body,
            headers,
            header,
            get: header,
            // What server/index.ts's authMiddleware would have set for /api/team.
            userId: input.identity.userId,
            userEmail: input.identity.email,
            authMechanism: 'session',
            ip: '127.0.0.1',
        };
        try {
            Promise.resolve(handler(req, res))
                .then(() => { if (!answered)
                fail(new Error('handler finished without answering')); })
                .catch(fail);
        }
        catch (err) {
            fail(err);
        }
    });
}
