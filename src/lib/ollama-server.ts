// Server-side only — direct Ollama HTTP calls for API routes and background processing

const OLLAMA_BASE_URL = process.env.OLLAMA_BASE_URL || 'http://localhost:11434';
const OLLAMA_MODEL = process.env.OLLAMA_MODEL || 'mistral';
const OLLAMA_EMBED_MODEL = process.env.OLLAMA_EMBED_MODEL || 'nomic-embed-text';

export async function callOllamaServer(
  system: string,
  prompt: string,
  options?: { temperature?: number; num_predict?: number; num_ctx?: number },
): Promise<string> {
  const res = await fetch(`${OLLAMA_BASE_URL}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: OLLAMA_MODEL,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: prompt },
      ],
      stream: true,
      options: {
        temperature: options?.temperature ?? 0.2,
        num_predict: options?.num_predict ?? 2048,
        ...(options?.num_ctx ? { num_ctx: options.num_ctx } : {}),
      },
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Ollama request failed (${res.status}): ${text}`);
  }

  const reader = res.body!.getReader();
  const decoder = new TextDecoder();
  let content = '';

  outer: while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    for (const line of decoder.decode(value, { stream: true }).split('\n')) {
      if (!line.trim()) continue;
      try {
        const chunk = JSON.parse(line);
        if (chunk.message?.content) content += chunk.message.content;
        if (chunk.done) break outer;
      } catch { /* ignore partial lines */ }
    }
  }

  return content.trim();
}

export async function generateEmbeddingServer(text: string): Promise<number[]> {
  const res = await fetch(`${OLLAMA_BASE_URL}/api/embed`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: OLLAMA_EMBED_MODEL,
      input: text.slice(0, 8000),
    }),
  });

  if (!res.ok) {
    const t = await res.text();
    throw new Error(`Ollama embed failed (${res.status}): ${t}`);
  }

  const data = await res.json();
  return data.embeddings?.[0] ?? [];
}

export function cleanJsonObject(text: string): string {
  let cleaned = text.trim();
  // Strip reasoning model think blocks (deepseek-r1, qwq, etc.)
  cleaned = cleaned.replace(/<think>[\s\S]*?<\/think>/gi, '');
  cleaned = cleaned.replace(/```json\s*/g, '').replace(/```\s*$/g, '').replace(/^```[a-z]*/gi, '');
  cleaned = cleaned.trim();
  const first = cleaned.indexOf('{');
  const last = cleaned.lastIndexOf('}');
  if (first !== -1 && last !== -1 && last > first) cleaned = cleaned.substring(first, last + 1);
  return cleaned;
}

export async function generateEssaySummary(essayText: string): Promise<string> {
  return callOllamaServer(
    'You are an academic text analyst. Respond with ONLY the summary text, nothing else.',
    `Summarize this academic essay in 1-2 sentences. Focus on the main topic and argument.\n\nESSAY:\n${essayText.slice(0, 2000)}`,
    { temperature: 0.3, num_predict: 128 },
  );
}
