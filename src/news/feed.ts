import type { FeedEntry, Source, StoryCandidate } from '../types.ts';

const entities: Record<string, string> = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", '#39': "'", nbsp: ' '
};

export function decodeXml(value: string): string {
  return value
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&([a-zA-Z0-9#]+);/g, (full, name) => entities[name] ?? full);
}

export function plainText(value: string): string {
  return decodeXml(value)
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function tag(block: string, names: string[]): string {
  for (const name of names) {
    const match = block.match(new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${name}>`, 'i'));
    if (match) return match[1].trim();
  }
  return '';
}

function entryUrl(block: string): string {
  const rss = tag(block, ['link']);
  if (rss && !rss.includes('<')) return plainText(rss);
  const atomAlternate = block.match(/<link\b[^>]*rel=["']alternate["'][^>]*href=["']([^"']+)["'][^>]*\/?\s*>/i);
  const atomAny = block.match(/<link\b[^>]*href=["']([^"']+)["'][^>]*\/?\s*>/i);
  return decodeXml(atomAlternate?.[1] ?? atomAny?.[1] ?? plainText(rss));
}

export function parseFeed(xml: string): FeedEntry[] {
  const blocks = [...xml.matchAll(/<(item|entry)\b[^>]*>([\s\S]*?)<\/\1>/gi)].map((m) => m[2]);
  return blocks.flatMap((block) => {
    const title = plainText(tag(block, ['title']));
    const url = entryUrl(block);
    if (!title || !/^https?:\/\//i.test(url)) return [];
    const rawDate = plainText(tag(block, ['pubDate', 'published', 'updated', 'dc:date']));
    const parsed = Date.parse(rawDate);
    return [{
      title,
      url,
      excerpt: plainText(tag(block, ['description', 'summary', 'content:encoded', 'content'])),
      publishedAt: Number.isNaN(parsed) ? new Date().toISOString() : new Date(parsed).toISOString(),
      author: plainText(tag(block, ['author', 'dc:creator'])) || undefined
    }];
  });
}

export function canonicalizeUrl(raw: string): string {
  const url = new URL(raw);
  url.hash = '';
  for (const key of [...url.searchParams.keys()]) {
    if (/^(utm_|fbclid|gclid|mc_)/i.test(key)) url.searchParams.delete(key);
  }
  url.pathname = url.pathname.replace(/\/$/, '') || '/';
  return url.toString();
}

export function titleFingerprint(title: string): string {
  return title.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\b(the|a|an|and|or|to|of|for|in|on)\b/g, ' ').replace(/\s+/g, ' ').trim();
}

async function sha256(value: string): Promise<string> {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

function score(entry: FeedEntry, source: Source, now: Date): number {
  const hours = Math.max(0, (now.getTime() - Date.parse(entry.publishedAt)) / 3_600_000);
  const freshness = Math.max(0, 1 - hours / 96);
  const strategic = source.topics.some((t) => ['ai', 'startups', 'developer-infrastructure', 'cybersecurity', 'rust'].includes(t)) ? 1 : 0.6;
  const localBoost = source.region === 'louisiana' ? 0.2 : 0;
  const opportunityBoost = source.topics.some((t) => ['funding', 'events', 'accelerators', 'grants'].includes(t)) ? 0.08 : 0;
  return Number((0.4 * source.trustWeight + 0.32 * freshness + 0.2 * strategic + localBoost + opportunityBoost).toFixed(4));
}

export async function normalizeEntry(entry: FeedEntry, source: Source, now = new Date()): Promise<StoryCandidate> {
  const canonicalUrl = canonicalizeUrl(entry.url);
  const fingerprint = titleFingerprint(entry.title);
  return {
    ...entry,
    id: await sha256(canonicalUrl),
    sourceId: source.id,
    publisher: source.name,
    canonicalUrl,
    fingerprint,
    topics: source.topics,
    score: score(entry, source, now),
    audiences: source.audiences
  };
}
