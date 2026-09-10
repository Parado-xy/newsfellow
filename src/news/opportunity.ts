import type { FeedEntry, OpportunityMetadata, OpportunityType } from '../types.ts';

const MONTHS: Record<string, number> = {
  january: 1, jan: 1, february: 2, feb: 2, march: 3, mar: 3, april: 4, apr: 4,
  may: 5, june: 6, jun: 6, july: 7, jul: 7, august: 8, aug: 8,
  september: 9, sep: 9, sept: 9, october: 10, oct: 10, november: 11, nov: 11,
  december: 12, dec: 12
};

const TYPE_TERMS: Array<[OpportunityType, RegExp]> = [
  ['competition', /\b(pitch competition|startup competition|demo day|pitch contest|challenge prize)\b/i],
  ['accelerator', /\b(accelerator|incubator|venture studio|startup cohort)\b/i],
  ['grant', /\b(grant|non[- ]dilutive|funding opportunity|award funding)\b/i],
  ['event', /\b(workshop|conference|summit|meetup|webinar|networking event|founder event)\b/i],
  ['program', /\b(fellowship|founder program|entrepreneur program|applications? (?:are )?(?:open|accepted)|call for applications|rolling applications?)\b/i]
];

const DEADLINE_CUE = /\b(deadline|apply by|applications? (?:close|due|end)|closes?|submissions? (?:close|due))\b/i;
const APPLY_URL = /\b(apply|application|register|registration|signup|sign-up)\b/i;
const LOUISIANA_PLACES = ['Louisiana', 'Baton Rouge', 'New Orleans', 'Shreveport', 'Lafayette', 'Lake Charles', 'Monroe', 'Ruston', 'Grambling'];

function clean(value: string, max = 220): string {
  const text = value.replace(/\s+/g, ' ').trim();
  if (text.length <= max) return text;
  return `${text.slice(0, max - 1).replace(/\s+\S*$/, '')}…`;
}

function validDate(year: number, month: number, day: number): string | undefined {
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return undefined;
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function extractDeadline(text: string, publishedAt: string): { date?: string; text?: string; rolling: boolean } {
  const rolling = /\b(rolling (?:basis|applications?|admissions?)|applications? accepted year[- ]round)\b/i.test(text);
  const sentences = text.match(/[^.!?]+(?:[.!?]+|$)/g) ?? [];
  for (const raw of sentences) {
    const sentence = clean(raw);
    if (!DEADLINE_CUE.test(sentence)) continue;
    const iso = sentence.match(/\b(20\d{2})-(\d{2})-(\d{2})\b/);
    if (iso) {
      const date = validDate(Number(iso[1]), Number(iso[2]), Number(iso[3]));
      if (date) return { date, text: sentence, rolling };
    }
    const numeric = sentence.match(/\b(\d{1,2})[/-](\d{1,2})[/-](20\d{2})\b/);
    if (numeric) {
      const date = validDate(Number(numeric[3]), Number(numeric[1]), Number(numeric[2]));
      if (date) return { date, text: sentence, rolling };
    }
    const named = sentence.match(/\b(January|February|March|April|May|June|July|August|September|October|November|December|Jan|Feb|Mar|Apr|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)\.?\s+(\d{1,2})(?:st|nd|rd|th)?(?:,?\s+(20\d{2}))?\b/i);
    if (named) {
      const published = new Date(publishedAt);
      const month = MONTHS[named[1].toLowerCase()];
      let year = named[3] ? Number(named[3]) : published.getUTCFullYear();
      let date = validDate(year, month, Number(named[2]));
      if (!named[3] && date && date < publishedAt.slice(0, 10)) date = validDate(++year, month, Number(named[2]));
      if (date) return { date, text: sentence, rolling };
    }
  }
  return { rolling };
}

function explicitSentence(text: string, cue: RegExp): string | undefined {
  const sentence = (text.match(/[^.!?]+(?:[.!?]+|$)/g) ?? []).find((item) => cue.test(item));
  return sentence ? clean(sentence) : undefined;
}

function explicitLocation(text: string): string | undefined {
  const sentences = text.match(/[^.!?]+(?:[.!?]+|$)/g) ?? [];
  for (const sentence of sentences) {
    if (!/\b(held|hosted|takes? place|located|location|in[- ]person)\b/i.test(sentence)) continue;
    const place = LOUISIANA_PLACES.find((candidate) => new RegExp(`\\b${candidate.replace(' ', '\\s+')}\\b`, 'i').test(sentence));
    if (place) return place;
  }
  return undefined;
}

function applicationUrl(urls: string[]): string | undefined {
  for (const raw of urls) {
    try {
      const url = new URL(raw);
      if (APPLY_URL.test(`${url.hostname} ${url.pathname} ${url.search}`) || /\b(eventbrite\.com|f6s\.com|airtable\.com|forms\.gle|lu\.ma)\b/i.test(url.hostname)) {
        return url.toString();
      }
    } catch { /* Ignore malformed links supplied by a feed. */ }
  }
  return undefined;
}

export function analyzeOpportunity(entry: FeedEntry): OpportunityMetadata {
  const text = `${entry.title}. ${entry.excerpt}`;
  const match = TYPE_TERMS.find(([, pattern]) => pattern.test(text));
  const type: OpportunityType = match?.[0] ?? 'news';
  const deadline = extractDeadline(text, entry.publishedAt);
  const eligibility = explicitSentence(text, /\b(eligible|eligibility|open to|who can apply|applicants? must)\b/i);
  const location = explicitLocation(text);
  const hybrid = /\bhybrid\b/i.test(text);
  const virtual = /\b(virtual|online)\b/i.test(text);
  const inPerson = /\b(in[- ]person|onsite|on-site)\b/i.test(text);
  const participationMode = hybrid || (virtual && inPerson) ? 'hybrid' : virtual ? 'virtual' : inPerson ? 'in-person' : undefined;
  const directApplication = applicationUrl(entry.relatedUrls ?? []);
  const evidence = [deadline.date, deadline.rolling, eligibility, location, participationMode, directApplication].filter(Boolean).length;
  const confidence = type === 'news' ? 0 : Math.min(1, 0.55 + evidence * 0.08);
  return {
    type, confidence, deadlineDate: deadline.date, deadlineText: deadline.text, eligibility,
    location, participationMode, applicationUrl: directApplication, rolling: deadline.rolling
  };
}

export function urgencyLabel(metadata: Pick<OpportunityMetadata, 'deadlineDate' | 'rolling'>, now = new Date()): string | undefined {
  if (metadata.rolling) return 'ROLLING';
  if (!metadata.deadlineDate) return undefined;
  const deadline = Date.parse(`${metadata.deadlineDate}T23:59:59Z`);
  const days = Math.ceil((deadline - now.getTime()) / 86_400_000);
  if (days < 0) return 'EXPIRED';
  if (days <= 7) return 'CLOSING SOON';
  if (days <= 30) return 'THIS MONTH';
  return undefined;
}
