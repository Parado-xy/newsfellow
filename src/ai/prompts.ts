export interface PromptDefinition {
  operation: 'story_summary' | 'cluster_synthesis' | 'story_enrichment';
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

export const CLUSTER_SYNTHESIS_PROMPT: PromptDefinition = {
  operation: 'cluster_synthesis',
  version: 'cluster-synthesis-v1',
  schemaVersion: 'summary-v1',
  system: [
    'Synthesize only the supplied reports about one news event.',
    'Prefer facts supported by multiple reports and clearly qualify claims present in only one report.',
    'Never invent facts, dates, names, numbers, quotes, consensus, or disagreement.',
    'Do not mention a source unless it is supplied.',
    'Return only JSON with exactly two string fields: whatHappened and whyItMatters.'
  ].join(' ')
};

export function storySummaryUserPrompt(title: string, excerpt: string, topics: string[]): string {
  return `Title: ${title}\nTopics: ${topics.join(', ')}\nSource text: ${excerpt.slice(0, 2400)}\n\nWrite whatHappened in at most 2 sentences and whyItMatters in 1 cautious sentence.`;
}

export function clusterSynthesisUserPrompt(
  topics: string[],
  reports: Array<{ title: string; publisher: string; excerpt: string }>
): string {
  const sources = reports.map((report, index) =>
    `REPORT ${index + 1}\nPublisher: ${report.publisher}\nTitle: ${report.title}\nText: ${report.excerpt}`).join('\n\n');
  return `Topics: ${topics.join(', ')}\n\n${sources}\n\nSynthesize what happened in at most 2 sentences and why it matters in 1 cautious sentence.`;
}
