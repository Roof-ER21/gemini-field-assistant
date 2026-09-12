// The former llama-3.3-70b-versatile default is no longer in Groq's live model
// inventory (verified September 12, 2026). Keep one overridable server default.
export function groqRequestOptions() {
  const model = process.env.GROQ_MODEL?.trim() || 'openai/gpt-oss-120b';
  return {
    model,
    ...(model.startsWith('openai/gpt-oss-') ? { reasoning_effort: 'low' as const } : {}),
  };
}
