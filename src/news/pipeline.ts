import { SOURCES } from '../config/sources.ts';
import type { Env, Source, StoryCandidate, StoredStory } from '../types.ts';
import { normalizeEntry, parseFeed } from './feed.ts';
import { extractiveSummary, type Summarizer } from './summarize.ts';

export interface CollectionReport { sourcesOk: number; sourcesFailed: number; candidates: number; inserted: number; }

async function fetchSource(source: Source): Promise<StoryCandidate[]> {
  const response = await fetch(source.feedUrl, { headers: { 'user-agent': 'NewsFellow/0.1 (+personal news reader)', accept: 'application/rss+xml, application/atom+xml, application/xml, text/xml' }, signal: AbortSignal.timeout(8_000) });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const entries = parseFeed(await response.text()).slice(0, 30);
  return Promise.all(entries.map((entry) => normalizeEntry(entry, source)));
}

export async function collectNews(env: Env): Promise<CollectionReport> {
  const report: CollectionReport = { sourcesOk: 0, sourcesFailed: 0, candidates: 0, inserted: 0 };
  for (let start = 0; start < SOURCES.length; start += 5) {
    const batch = SOURCES.slice(start, start + 5);
    const results = await Promise.allSettled(batch.map(fetchSource));
    for (let i = 0; i < results.length; i++) {
      const result = results[i];
      const source = batch[i];
      if (result.status === 'rejected') {
        report.sourcesFailed++;
        console.warn(JSON.stringify({ event: 'feed_failed', source: source.id, error: String(result.reason) }));
        continue;
      }
      report.sourcesOk++; report.candidates += result.value.length;
      for (const story of result.value) {
        const outcome = await env.DB.prepare(`INSERT OR IGNORE INTO stories
          (id, source_id, title, canonical_url, excerpt, publisher, published_at, fingerprint, topics_json, score)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).bind(
            story.id, story.sourceId, story.title, story.canonicalUrl, story.excerpt.slice(0, 2000), story.publisher,
            story.publishedAt, story.fingerprint, JSON.stringify(story.topics), story.score
          ).run();
        report.inserted += outcome.meta.changes ?? 0;
      }
    }
  }
  console.log(JSON.stringify({ event: 'collection_completed', ...report }));
  return report;
}

export async function loadTopStories(env: Env, limit: number): Promise<StoredStory[]> {
  const result = await env.DB.prepare(`SELECT id, title, canonical_url, excerpt, publisher, published_at, topics_json, score
    FROM stories WHERE published_at >= datetime('now', '-96 hours')
    ORDER BY score DESC, published_at DESC LIMIT ?`).bind(limit * 4).all<StoredStory>();

  const seen = new Set<string>();
  const unique: StoredStory[] = [];
  for (const story of result.results) {
    const key = story.title.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 80);
    if (seen.has(key)) continue;
    seen.add(key); unique.push(story);
    if (unique.length === limit) break;
  }
  return unique;
}

function escapeHtml(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

export async function composeDigest(
  stories: StoredStory[],
  summarize: Summarizer = async (title, excerpt, topics) => extractiveSummary(title, excerpt, topics)
): Promise<string[]> {
  if (!stories.length) return ['<b>NEWSFELLOW</b>\n\nNo material stories were found in the current source window.'];
  const sections = await Promise.all(stories.map(async (story, index) => {
    const topics = JSON.parse(story.topics_json) as string[];
    const summary = await summarize(story.title, story.excerpt, topics);
    return `<b>${index + 1}. <a href="${escapeHtml(story.canonical_url)}">${escapeHtml(story.title)}</a></b>\n${escapeHtml(summary.whatHappened)}\n\n<i>Why it matters:</i> ${escapeHtml(summary.whyItMatters)}\n<small>${escapeHtml(story.publisher)}</small>`;
  }));
  const chunks: string[] = [];
  let current = '<b>NEWSFELLOW • TECH BRIEF</b>\n\n';
  for (const section of sections) {
    if ((current + section).length > 3900) { chunks.push(current.trim()); current = ''; }
    current += `${section}\n\n`;
  }
  if (current.trim()) chunks.push(current.trim());
  return chunks;
}
