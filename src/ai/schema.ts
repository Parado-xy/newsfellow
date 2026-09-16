import type { Summary } from '../news/summarize.ts';
import type { StoryEventType, StoryIntelligence } from '../types.ts';

function clamp(text: string, max: number): string {
  const cleaned = text.replace(/\s+/g, ' ').trim();
  if (cleaned.length <= max) return cleaned;
  return `${cleaned.slice(0, max - 1).replace(/\s+\S*$/, '')}…`;
}

export interface ValidationResult<T> {
  value?: T;
  error?: string;
}

export function validateSummary(value: unknown): ValidationResult<Summary> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return { error: 'summary must be an object' };
  const item = value as Record<string, unknown>;
  const keys = Object.keys(item);
  if (keys.some((key) => key !== 'whatHappened' && key !== 'whyItMatters')) return { error: 'summary contains unknown fields' };
  if (typeof item.whatHappened !== 'string' || typeof item.whyItMatters !== 'string') {
    return { error: 'summary fields must be strings' };
  }
  const whatHappened = clamp(item.whatHappened, 340);
  const whyItMatters = clamp(item.whyItMatters, 220);
  if (!whatHappened || !whyItMatters) return { error: 'summary fields cannot be empty' };
  return { value: { whatHappened, whyItMatters } };
}

export function parseJsonObject(response: string): ValidationResult<unknown> {
  const cleaned = response.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '');
  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');
  if (start < 0 || end <= start) return { error: 'model response did not contain a JSON object' };
  try { return { value: JSON.parse(cleaned.slice(start, end + 1)) as unknown }; }
  catch (error) { return { error: `invalid JSON: ${String(error)}` }; }
}

const EVENT_TYPES = new Set<StoryEventType>(['launch', 'funding', 'acquisition', 'policy', 'security', 'research', 'opportunity', 'event', 'other']);
const SCORE_FIELDS = ['actionability', 'novelty', 'significance', 'developerRelevance', 'founderRelevance', 'louisianaRelevance', 'confidence'] as const;
const ARRAY_FIELDS = ['topics', 'entities', 'geographies', 'affectedAudiences', 'evidence'] as const;

function boundedStrings(value: unknown, field: string): ValidationResult<string[]> {
  if (!Array.isArray(value) || value.some((item) => typeof item !== 'string')) return { error: `${field} must be a string array` };
  const values = [...new Set(value.map((item) => item.replace(/\s+/g, ' ').trim()).filter(Boolean))];
  if (values.length > 12 || values.some((item) => item.length > 180)) return { error: `${field} exceeds its bounds` };
  return { value: values };
}

export function validateStoryIntelligence(value: unknown, sourceText: string): ValidationResult<StoryIntelligence> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return { error: 'story intelligence must be an object' };
  const item = value as Record<string, unknown>;
  if (!EVENT_TYPES.has(item.eventType as StoryEventType)) return { error: 'eventType is invalid' };
  const arrays: Partial<Record<typeof ARRAY_FIELDS[number], string[]>> = {};
  for (const field of ARRAY_FIELDS) {
    const result = boundedStrings(item[field], field);
    if (!result.value) return { error: result.error };
    arrays[field] = result.value;
  }
  const normalizedSource = sourceText.toLowerCase().replace(/\s+/g, ' ');
  for (const field of ['entities', 'geographies', 'evidence'] as const) {
    if (arrays[field]!.some((entry) => !normalizedSource.includes(entry.toLowerCase().replace(/\s+/g, ' ')))) {
      return { error: `${field} contains unsupported text` };
    }
  }
  const scores: Record<string, number> = {};
  for (const field of SCORE_FIELDS) {
    const score = item[field];
    if (typeof score !== 'number' || !Number.isFinite(score) || score < 0 || score > 1) return { error: `${field} must be between 0 and 1` };
    scores[field] = score;
  }
  return { value: {
    eventType: item.eventType as StoryEventType,
    topics: arrays.topics!, entities: arrays.entities!, geographies: arrays.geographies!,
    affectedAudiences: arrays.affectedAudiences!, evidence: arrays.evidence!,
    actionability: scores.actionability, novelty: scores.novelty, significance: scores.significance,
    developerRelevance: scores.developerRelevance, founderRelevance: scores.founderRelevance,
    louisianaRelevance: scores.louisianaRelevance, confidence: scores.confidence
  } };
}
