/**
 * Susan Agent Routes
 * POST /api/susan/agent/chat
 *
 * Implements a ReAct (Reason + Act) loop with Gemini 2.0 Flash and the seven
 * Susan tools defined in susanToolService.ts.
 *
 * Flow:
 *   1. Validate x-user-email header and resolve userId
 *   2. Build Gemini Contents from the incoming messages array
 *   3. Call Gemini with SUSAN_TOOLS function declarations
 *   4. If Gemini returns function calls, execute them and loop (max 5 iterations)
 *   5. When Gemini produces a text response, return it to the client
 *
 * The frontend is responsible for building the system prompt and full message
 * history via susanContextService before calling this endpoint.
 */
import express from 'express';
import { GoogleGenAI } from '@google/genai';
import { SUSAN_TOOLS, executeTool } from '../services/susanToolService.js';
// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
const getEnvKey = (key) => process.env[key] || process.env[`VITE_${key}`];
function normalizeEmail(email) {
    if (!email || typeof email !== 'string')
        return null;
    const trimmed = email.trim().toLowerCase();
    return trimmed.length > 0 ? trimmed : null;
}
/**
 * Resolve or create a user record from an email address.
 * Mirrors the getOrCreateUserIdByEmail function in index.ts without
 * depending on it directly (the factory pattern keeps this route self-contained).
 */
async function resolveUserId(pool, email) {
    const norm = normalizeEmail(email);
    if (!norm)
        return null;
    try {
        const existing = await pool.query('SELECT id FROM users WHERE LOWER(email) = LOWER($1) LIMIT 1', [norm]);
        if (existing.rows.length > 0)
            return existing.rows[0].id;
        // Auto-create user so agents work for new reps without a full signup flow
        const adminEmail = normalizeEmail(process.env.EMAIL_ADMIN_ADDRESS || process.env.ADMIN_EMAIL);
        const role = adminEmail && adminEmail === norm ? 'admin' : 'sales_rep';
        const created = await pool.query(`INSERT INTO users (email, name, role)
       VALUES ($1, $2, $3)
       RETURNING id`, [norm, norm.split('@')[0], role]);
        return created.rows[0]?.id ?? null;
    }
    catch (err) {
        console.error('[SusanAgent] Error resolving userId:', err);
        return null;
    }
}
/**
 * Resolve per-rep agent personality preferences from user_memory.
 */
async function resolvePersonality(pool, userId) {
    try {
        const result = await pool.query(`SELECT key, value FROM user_memory
       WHERE user_id = $1 AND category = 'agent_personality'`, [userId]);
        const prefs = {};
        for (const row of result.rows) {
            prefs[row.key] = row.value;
        }
        return prefs;
    }
    catch {
        return {};
    }
}
/**
 * Resolve active manager directives.
 */
async function resolveDirectives(pool) {
    try {
        const result = await pool.query(`SELECT title, content, priority FROM manager_directives
       WHERE is_active = true AND (effective_until IS NULL OR effective_until > NOW())
       ORDER BY CASE priority WHEN 'critical' THEN 1 WHEN 'high' THEN 2 ELSE 3 END`);
        return result.rows;
    }
    catch {
        return [];
    }
}
/**
 * Resolve the user's state preference from user_memory.
 * Falls back to empty string if not found.
 */
async function resolveUserState(pool, userId) {
    try {
        const result = await pool.query(`SELECT value
       FROM user_memory
       WHERE user_id = $1
         AND (category = 'state' OR key = 'state' OR key = 'work_state')
       ORDER BY confidence DESC, last_updated DESC
       LIMIT 1`, [userId]);
        return result.rows[0]?.value ?? '';
    }
    catch {
        return '';
    }
}
/**
 * Resolve display name from the users table.
 * Falls back to the email local-part.
 */
async function resolveUserName(pool, userId, email) {
    try {
        const result = await pool.query('SELECT name FROM users WHERE id = $1 LIMIT 1', [userId]);
        const name = result.rows[0]?.name;
        return name || email.split('@')[0];
    }
    catch {
        return email.split('@')[0];
    }
}
/**
 * Convert an AIMessage array to Gemini Content[] format.
 *
 * Rules:
 *  - 'system' messages are converted to 'user' role (Gemini doesn't have a
 *    system role in the contents array; the caller should inject system
 *    context as the first user turn if needed).
 *  - 'assistant' messages become role 'model'.
 *  - Empty-content messages are skipped to avoid Gemini validation errors.
 *
 * The Gemini API requires contents to alternate user/model and start with
 * user. We enforce this by collapsing consecutive same-role messages and
 * ensuring the first message is user-role.
 */
function buildContents(messages) {
    const mapped = [];
    for (const msg of messages) {
        if (!msg.content || msg.content.trim().length === 0)
            continue;
        const role = msg.role === 'assistant' ? 'model' : 'user';
        const part = { text: msg.content };
        // Collapse consecutive same-role messages into one by appending parts
        const last = mapped[mapped.length - 1];
        if (last && last.role === role) {
            last.parts = [...(last.parts ?? []), part];
        }
        else {
            mapped.push({ role, parts: [part] });
        }
    }
    // Gemini requires contents to start with a user turn
    if (mapped.length > 0 && mapped[0].role !== 'user') {
        mapped.unshift({ role: 'user', parts: [{ text: '(start of conversation)' }] });
    }
    return mapped;
}
// ---------------------------------------------------------------------------
// Route factory
// ---------------------------------------------------------------------------
export function createSusanAgentRoutes(pool) {
    const router = express.Router();
    const geminiKey = getEnvKey('GOOGLE_AI_API_KEY') || getEnvKey('GEMINI_API_KEY');
    if (!geminiKey) {
        console.warn('[SusanAgent] WARNING: GOOGLE_AI_API_KEY / GEMINI_API_KEY not set. Agent chat will return 503.');
    }
    // Lazily initialised once the key is available at request time so the server
    // can start even if the key is loaded after module evaluation (Railway).
    let genAI = geminiKey ? new GoogleGenAI({ apiKey: geminiKey }) : null;
    function getGenAI() {
        if (!genAI) {
            const key = getEnvKey('GOOGLE_AI_API_KEY') || getEnvKey('GEMINI_API_KEY');
            if (!key)
                throw new Error('GOOGLE_AI_API_KEY / GEMINI_API_KEY is not configured.');
            genAI = new GoogleGenAI({ apiKey: key });
        }
        return genAI;
    }
    // --------------------------------------------------------------------------
    // POST /chat
    // --------------------------------------------------------------------------
    router.post('/chat', async (req, res) => {
        const requestId = `agent-${Date.now()}`;
        console.log(`[SusanAgent:${requestId}] POST /chat`);
        // ---- 1. Auth: resolve email + userId ----
        const rawEmail = req.header('x-user-email');
        const email = normalizeEmail(rawEmail);
        if (!email) {
            return res.status(401).json({
                error: 'Missing or invalid x-user-email header.'
            });
        }
        const userId = await resolveUserId(pool, email);
        if (!userId) {
            return res.status(401).json({
                error: `Could not resolve or create user for email: ${email}`
            });
        }
        // ---- 2. Parse + validate body ----
        const body = req.body;
        if (!body || !Array.isArray(body.messages) || body.messages.length === 0) {
            return res.status(400).json({
                error: 'Request body must include a non-empty "messages" array.'
            });
        }
        const { messages, systemPrompt } = body;
        // Basic message shape validation
        for (const msg of messages) {
            if (!msg.role || !['user', 'assistant', 'system'].includes(msg.role)) {
                return res.status(400).json({
                    error: `Invalid message role "${msg.role}". Must be "user", "assistant", or "system".`
                });
            }
            if (typeof msg.content !== 'string') {
                return res.status(400).json({ error: 'Each message must have a string "content" field.' });
            }
        }
        // ---- 3. Build tool context ----
        const [userName, userState, personality, directives] = await Promise.all([
            resolveUserName(pool, userId, email),
            resolveUserState(pool, userId),
            resolvePersonality(pool, userId),
            resolveDirectives(pool)
        ]);
        const toolContext = {
            userId,
            userEmail: email,
            userName: personality.preferred_name || userName,
            userState,
            pool
        };
        // ---- 4. Build Gemini contents ----
        // If the caller passes a separate systemPrompt, prepend it as a user turn
        // with a model acknowledgement so the conversation is well-formed.
        let contents = [];
        // Build personality addendum (backend-side, ensures agent always has it)
        const personalityEntries = Object.entries(personality).filter(([, v]) => v);
        let enrichedSystemPrompt = systemPrompt || '';
        if (personalityEntries.length > 0) {
            const lines = personalityEntries.map(([k, v]) => `- ${k}: ${v}`);
            enrichedSystemPrompt += `\n\n[PERSONALIZATION]\nThis rep's preferences:\n${lines.join('\n')}\nAdapt your tone, name usage, and verbosity accordingly.`;
        }
        // Manager directives block
        if (directives.length > 0) {
            const dLines = directives.map(d => `- [${d.priority.toUpperCase()}] ${d.title}: ${d.content}`);
            enrichedSystemPrompt += `\n\n[MANAGER DIRECTIVES]\nFollow these instructions from management:\n${dLines.join('\n')}`;
        }
        if (enrichedSystemPrompt.trim().length > 0) {
            contents.push({ role: 'user', parts: [{ text: enrichedSystemPrompt.trim() }] });
            contents.push({ role: 'model', parts: [{ text: `Understood. I am Susan, ready to help${personality.preferred_name ? ` ${personality.preferred_name}` : ''}.` }] });
        }
        const messageContents = buildContents(messages);
        contents = [...contents, ...messageContents];
        // Safety: Gemini needs at least one user message
        if (contents.length === 0 || contents[contents.length - 1].role !== 'user') {
            return res.status(400).json({
                error: 'The conversation must end with a user message for Gemini to respond.'
            });
        }
        // ---- 5. ReAct loop (max 5 iterations) ----
        const MAX_TOOL_ROUNDS = 5;
        const allToolResults = [];
        let client;
        try {
            client = getGenAI();
        }
        catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            return res.status(503).json({ error: `Gemini unavailable: ${message}` });
        }
        try {
            for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
                console.log(`[SusanAgent:${requestId}] Gemini call round ${round + 1}/${MAX_TOOL_ROUNDS}, contents length=${contents.length}`);
                let response;
                try {
                    response = await client.models.generateContent({
                        model: 'gemini-2.0-flash',
                        contents,
                        config: {
                            tools: [{ functionDeclarations: SUSAN_TOOLS }]
                        }
                    });
                }
                catch (geminiErr) {
                    const message = geminiErr instanceof Error ? geminiErr.message : String(geminiErr);
                    console.error(`[SusanAgent:${requestId}] Gemini API error (round ${round + 1}):`, message);
                    return res.status(502).json({
                        error: `Gemini API error: ${message}`
                    });
                }
                // Extract candidate content
                const candidate = response.candidates?.[0];
                if (!candidate || !candidate.content) {
                    console.warn(`[SusanAgent:${requestId}] No candidate content returned (round ${round + 1})`);
                    return res.status(502).json({ error: 'Gemini returned an empty response.' });
                }
                const parts = candidate.content.parts ?? [];
                // ---- 5a. Check for function calls ----
                const functionCallParts = parts.filter((p) => p.functionCall != null);
                const textParts = parts.filter((p) => typeof p.text === 'string');
                if (functionCallParts.length === 0) {
                    // No tools requested – extract text and return final response
                    const responseText = textParts
                        .map((p) => p.text)
                        .join('\n')
                        .trim();
                    if (!responseText) {
                        // Gemini sometimes returns finish_reason with no text (e.g., safety filter)
                        const finishReason = candidate.finishReason ?? 'UNKNOWN';
                        console.warn(`[SusanAgent:${requestId}] Empty text response. finishReason=${finishReason}`);
                        return res.status(200).json({
                            content: '(Susan had no response for this message.)',
                            provider: 'gemini',
                            model: 'gemini-2.0-flash',
                            toolResults: allToolResults,
                            finishReason
                        });
                    }
                    console.log(`[SusanAgent:${requestId}] Final text response (round ${round + 1}), ` +
                        `tools_called=${allToolResults.length}`);
                    return res.status(200).json({
                        content: responseText,
                        provider: 'gemini',
                        model: 'gemini-2.0-flash',
                        toolResults: allToolResults
                    });
                }
                // ---- 5b. Execute tools and append results ----
                console.log(`[SusanAgent:${requestId}] Round ${round + 1}: executing ${functionCallParts.length} tool(s)`);
                // Append model turn containing the function calls
                contents.push({
                    role: 'model',
                    parts: functionCallParts
                });
                // Execute all tool calls in this round concurrently
                const functionResponseParts = await Promise.all(functionCallParts.map(async (p) => {
                    const fc = p.functionCall;
                    const toolName = fc.name ?? '';
                    const toolArgs = fc.args ?? {};
                    console.log(`[SusanAgent:${requestId}] Executing tool="${toolName}" args=${JSON.stringify(toolArgs).slice(0, 200)}`);
                    const toolResult = await executeTool(toolName, toolArgs, toolContext);
                    allToolResults.push(toolResult);
                    return {
                        functionResponse: {
                            name: toolName,
                            response: { result: toolResult.result }
                        }
                    };
                }));
                // Append user turn with all function responses
                contents.push({
                    role: 'user',
                    parts: functionResponseParts
                });
                // Continue to next round so Gemini can formulate a response using results
            }
            // ---- 5c. Exceeded max rounds – ask Gemini to summarise ----
            console.warn(`[SusanAgent:${requestId}] Reached max tool rounds (${MAX_TOOL_ROUNDS}). Forcing final response.`);
            contents.push({
                role: 'user',
                parts: [
                    {
                        text: 'Please provide your final response based on all the information gathered so far.'
                    }
                ]
            });
            let finalResponse;
            try {
                finalResponse = await client.models.generateContent({
                    model: 'gemini-2.0-flash',
                    contents,
                    config: {
                        tools: [{ functionDeclarations: SUSAN_TOOLS }]
                    }
                });
            }
            catch (finalErr) {
                const message = finalErr instanceof Error ? finalErr.message : String(finalErr);
                console.error(`[SusanAgent:${requestId}] Final Gemini call error:`, message);
                return res.status(502).json({ error: `Gemini final call error: ${message}` });
            }
            const finalParts = finalResponse.candidates?.[0]?.content?.parts ?? [];
            const finalText = finalParts
                .filter((p) => typeof p.text === 'string')
                .map((p) => p.text)
                .join('\n')
                .trim();
            return res.status(200).json({
                content: finalText || '(Susan completed her analysis but had no additional text response.)',
                provider: 'gemini',
                model: 'gemini-2.0-flash',
                toolResults: allToolResults,
                warning: `Max tool call rounds (${MAX_TOOL_ROUNDS}) reached.`
            });
        }
        catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            console.error(`[SusanAgent:${requestId}] Unhandled error:`, message);
            return res.status(500).json({
                error: `Internal server error in Susan agent: ${message}`
            });
        }
    });
    return router;
}
export default createSusanAgentRoutes;
