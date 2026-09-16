import type { Summary } from '../news/summarize.ts';

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
