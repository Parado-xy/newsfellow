export interface PromptDefinition {
  operation: 'story_summary' | 'story_enrichment';
  version: string;
  schemaVersion: string;
  system: string;
}

export const STORY_ENRICHMENT_PROMPT: PromptDefinition = {
  operation: 'story_enrichment',
  version: 'story-enrichment-v1',
  schemaVersion: 'story-intelligence-v1',
  system: [
    'Extract structured intelligence only from the supplied title, publisher, and source text.',
    'Do not invent entities, geographies, events, or evidence.',
    'Entities and geographies must appear verbatim in the input.',
    'Evidence items must be short exact excerpts from the input.',
    'Scores are numbers from 0 to 1.',
    'Return only JSON matching the requested fields.'
  ].join(' ')
};

export function storyEnrichmentUserPrompt(title: string, publisher: string, excerpt: string, topics: string[]): string {
  return `Title: ${title}\nPublisher: ${publisher}\nExisting topics: ${topics.join(', ')}\nSource text: ${excerpt.slice(0, 2400)}\n\nReturn JSON with: eventType (launch|funding|acquisition|policy|security|research|opportunity|event|other), topics (string[]), entities (string[]), geographies (string[]), affectedAudiences (string[]), evidence (exact source excerpts, string[]), actionability, novelty, significance, developerRelevance, founderRelevance, louisianaRelevance, confidence.`;
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
