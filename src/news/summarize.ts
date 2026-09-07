const SENTENCE = /[^.!?]+(?:[.!?]+|$)/g;

export interface Summary {
  whatHappened: string;
  whyItMatters: string;
}

export type Summarizer = (title: string, excerpt: string, topics: string[]) => Promise<Summary>;

function clamp(text: string, max = 320): string {
  const cleaned = text.replace(/\s+/g, ' ').trim();
  if (cleaned.length <= max) return cleaned;
  return `${cleaned.slice(0, max - 1).replace(/\s+\S*$/, '')}…`;
}

export function extractiveSummary(title: string, excerpt: string, topics: string[]): Summary {
  const sentences = excerpt.match(SENTENCE)?.map((s) => s.trim()).filter(Boolean) ?? [];
  const selected: string[] = [];
  for (const sentence of sentences) {
    if (sentence.length < 35 || selected.some((s) => s.toLowerCase() === sentence.toLowerCase())) continue;
    selected.push(sentence);
    if (selected.join(' ').length >= 180 || selected.length === 2) break;
  }
  const whatHappened = clamp(selected.join(' ') || title, 340);
  const primary = topics[0] ?? 'technology';
  const matter: Record<string, string> = {
    ai: 'This may affect AI capabilities, costs, or the tools available to builders.',
    startups: 'This is relevant to startup strategy, funding, distribution, or competitive positioning.',
    venture: 'This may signal where investor attention and startup capital are moving.',
    'developer-infrastructure': 'This may change how software teams build, deploy, or operate systems.',
    cloud: 'This may affect cloud architecture, operating cost, or platform choices.',
    cybersecurity: 'This may create a security exposure or change recommended defensive practice.',
    rust: 'This is relevant to Rust development and systems-programming work.',
    systems: 'This may influence systems design, performance, or reliability tradeoffs.'
  };
  return { whatHappened, whyItMatters: matter[primary] ?? 'This is a potentially meaningful change in the technology landscape.' };
}

function parseModelSummary(value: unknown): Summary | null {
  if (!value || typeof value !== 'object') return null;
  const item = value as Record<string, unknown>;
  if (typeof item.whatHappened !== 'string' || typeof item.whyItMatters !== 'string') return null;
  const whatHappened = clamp(item.whatHappened, 340);
  const whyItMatters = clamp(item.whyItMatters, 220);
  if (!whatHappened || !whyItMatters) return null;
  return { whatHappened, whyItMatters };
}

export function workersAiSummarizer(ai: Ai): Summarizer {
  return async (title, excerpt, topics) => {
    const fallback = extractiveSummary(title, excerpt, topics);
    if (!excerpt.trim()) return fallback;
    try {
      const result = await ai.run('@cf/meta/llama-3.2-1b-instruct', {
        messages: [
          {
            role: 'system',
            content: 'Summarize only the supplied news text. Never add facts, names, numbers, or implications unsupported by it. Return only JSON with string fields whatHappened and whyItMatters.'
          },
          {
            role: 'user',
            content: `Title: ${title}\nTopics: ${topics.join(', ')}\nSource text: ${excerpt.slice(0, 2400)}\n\nWrite whatHappened in at most 2 sentences and whyItMatters in 1 cautious sentence.`
          }
        ],
        max_tokens: 180,
        temperature: 0.1,
        response_format: { type: 'json_object' }
      });
      const response = typeof result === 'object' && result && 'response' in result ? String(result.response) : '';
      const parsed = parseModelSummary(JSON.parse(response));
      return parsed ?? fallback;
    } catch (error) {
      console.warn(JSON.stringify({ event: 'ai_summary_fallback', error: String(error) }));
      return fallback;
    }
  };
}
