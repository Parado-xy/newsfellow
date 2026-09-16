export interface PromptDefinition {
  operation: 'story_summary';
  version: string;
  schemaVersion: string;
  system: string;
}

export const STORY_SUMMARY_PROMPT: PromptDefinition = {
  operation: 'story_summary',
  version: 'story-summary-v1',
  schemaVersion: 'summary-v1',
  system: [
    'Summarize only the supplied news text.',
    'Never add facts, names, numbers, dates, claims, or implications unsupported by the source text.',
    'Use cautious language when the source is uncertain.',
    'Return only JSON with exactly two string fields: whatHappened and whyItMatters.'
  ].join(' ')
};

export function storySummaryUserPrompt(title: string, excerpt: string, topics: string[]): string {
  return `Title: ${title}\nTopics: ${topics.join(', ')}\nSource text: ${excerpt.slice(0, 2400)}\n\nWrite whatHappened in at most 2 sentences and whyItMatters in 1 cautious sentence.`;
}
