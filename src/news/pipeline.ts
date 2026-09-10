import { SOURCES } from '../config/sources.ts';
import type { Env, NewsAudience, Source, StoryCandidate, StoredStory } from '../types.ts';
import { normalizeEntry, parseFeed } from './feed.ts';
import { extractiveSummary, type Summarizer } from './summarize.ts';

export interface CollectionReport {
  correlationId: string;
  audience: NewsAudience | 'all';
  sourcesOk: number;
  sourcesFailed: number;
  candidates: number;
  inserted: number;
}

async function fetchSource(source: Source): Promise<{ stories: StoryCandidate[]; durationMs: number }> {
  const started = Date.now();
  let lastError: unknown;
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const response = await fetch(source.feedUrl, { headers: { 'user-agent': 'NewsFellow/0.2 (+curated news service)', accept: 'application/rss+xml, application/atom+xml, application/xml, text/xml' }, signal: AbortSignal.timeout(8_000) });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const entries = parseFeed(await response.text()).slice(0, 30);
      return { stories: await Promise.all(entries.map((entry) => normalizeEntry(entry, source))), durationMs: Date.now() - started };
    } catch (error) {
      lastError = error;
      if (attempt < 2) await new Promise((resolve) => setTimeout(resolve, 250));
    }
  }
  throw lastError;
}

async function recordSourceHealth(env: Env, source: Source, success: boolean, durationMs: number | null, error?: unknown): Promise<void> {
  await env.DB.prepare(`INSERT INTO source_health
    (source_id, source_name, last_success_at, last_failure_at, last_error, last_duration_ms,
      consecutive_failures, total_successes, total_failures)
    VALUES (?, ?, CASE WHEN ? THEN CURRENT_TIMESTAMP END, CASE WHEN ? THEN NULL ELSE CURRENT_TIMESTAMP END,
      ?, ?, CASE WHEN ? THEN 0 ELSE 1 END, CASE WHEN ? THEN 1 ELSE 0 END, CASE WHEN ? THEN 0 ELSE 1 END)
    ON CONFLICT(source_id) DO UPDATE SET
      source_name = excluded.source_name,
      last_success_at = CASE WHEN ? THEN CURRENT_TIMESTAMP ELSE source_health.last_success_at END,
      last_failure_at = CASE WHEN ? THEN source_health.last_failure_at ELSE CURRENT_TIMESTAMP END,
      last_error = CASE WHEN ? THEN NULL ELSE excluded.last_error END,
      last_duration_ms = COALESCE(excluded.last_duration_ms, source_health.last_duration_ms),
      consecutive_failures = CASE WHEN ? THEN 0 ELSE source_health.consecutive_failures + 1 END,
      total_successes = source_health.total_successes + CASE WHEN ? THEN 1 ELSE 0 END,
      total_failures = source_health.total_failures + CASE WHEN ? THEN 0 ELSE 1 END,
      updated_at = CURRENT_TIMESTAMP`)
    .bind(source.id, source.name, success, success, error ? String(error).slice(0, 1000) : null, durationMs,
      success, success, success, success, success, success, success, success, success).run();
}

export async function collectNews(env: Env, audience?: NewsAudience, runCorrelationId: string = crypto.randomUUID()): Promise<CollectionReport> {
  const report: CollectionReport = { correlationId: runCorrelationId, audience: audience ?? 'all', sourcesOk: 0, sourcesFailed: 0, candidates: 0, inserted: 0 };
  const run = await env.DB.prepare(`INSERT INTO collection_runs (audience, correlation_id, status)
    VALUES (?, ?, 'running')`).bind(report.audience, runCorrelationId).run();
  const runId = run.meta.last_row_id;
  try {
    const candidates: StoryCandidate[] = [];
    const sources = audience ? SOURCES.filter((source) => source.audiences.includes(audience)) : SOURCES;
    for (let start = 0; start < sources.length; start += 5) {
      const batch = sources.slice(start, start + 5);
      const results = await Promise.allSettled(batch.map(fetchSource));
      for (let i = 0; i < results.length; i++) {
        const result = results[i];
        const source = batch[i];
        if (result.status === 'rejected') {
          report.sourcesFailed++;
          await recordSourceHealth(env, source, false, null, result.reason);
          console.warn(JSON.stringify({ event: 'feed_failed', correlationId: runCorrelationId, source: source.id, error: String(result.reason) }));
          continue;
        }
        report.sourcesOk++; report.candidates += result.value.stories.length;
        candidates.push(...result.value.stories);
        await recordSourceHealth(env, source, true, result.value.durationMs);
      }
    }

    // D1 batch operations avoid spending the Worker lifetime on hundreds of
    // sequential network round trips. Keep batches modest for predictable size.
    for (let start = 0; start < candidates.length; start += 50) {
      const statements = candidates.slice(start, start + 50).map((story) =>
        env.DB.prepare(`INSERT OR IGNORE INTO stories
          (id, source_id, title, canonical_url, excerpt, publisher, published_at, fingerprint, topics_json, score, audiences_json)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).bind(
        story.id, story.sourceId, story.title, story.canonicalUrl, story.excerpt.slice(0, 2000), story.publisher,
        story.publishedAt, story.fingerprint, JSON.stringify(story.topics), story.score, JSON.stringify(story.audiences)
        )
      );
      const outcomes = await env.DB.batch(statements);
      report.inserted += outcomes.reduce((total, outcome) => total + (outcome.meta.changes ?? 0), 0);
    }
    await env.DB.prepare(`UPDATE collection_runs SET completed_at = CURRENT_TIMESTAMP, status = 'success',
      sources_ok = ?, sources_failed = ?, candidates = ?, inserted = ? WHERE id = ?`)
      .bind(report.sourcesOk, report.sourcesFailed, report.candidates, report.inserted, runId).run();
    console.log(JSON.stringify({ event: 'collection_completed', ...report }));
    return report;
  } catch (error) {
    await env.DB.prepare(`UPDATE collection_runs SET completed_at = CURRENT_TIMESTAMP, status = 'failed',
      error = ?, sources_ok = ?, sources_failed = ?, candidates = ?, inserted = ? WHERE id = ?`)
      .bind(String(error).slice(0, 1000), report.sourcesOk, report.sourcesFailed, report.candidates, report.inserted, runId).run();
    console.error(JSON.stringify({ event: 'collection_failed', correlationId: runCorrelationId, audience: report.audience, error: String(error) }));
    throw error;
  }
}

export async function loadTopStories(env: Env, limit: number, windowHours = 96, audience: NewsAudience = 'personal'): Promise<StoredStory[]> {
  const result = await env.DB.prepare(`SELECT id, title, canonical_url, excerpt, publisher, published_at, topics_json, score, audiences_json
    FROM stories WHERE published_at >= datetime('now', ?) AND audiences_json LIKE ?
    ORDER BY score DESC, published_at DESC LIMIT ?`).bind(`-${windowHours} hours`, `%\"${audience}\"%`, limit * 4).all<StoredStory>();

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
  summarize: Summarizer = async (title, excerpt, topics) => extractiveSummary(title, excerpt, topics),
  heading = 'TECH BRIEF'
): Promise<string[]> {
  if (!stories.length) return ['<b>NEWSFELLOW</b>\n\nNo material stories were found in the current source window.'];
  const sections = await Promise.all(stories.map(async (story, index) => {
    const topics = JSON.parse(story.topics_json) as string[];
    const summary = await summarize(story.title, story.excerpt, topics);
    return `<b>${index + 1}. <a href="${escapeHtml(story.canonical_url)}">${escapeHtml(story.title)}</a></b>\n${escapeHtml(summary.whatHappened)}\n\n<i>Why it matters:</i> ${escapeHtml(summary.whyItMatters)}\n<i>Source: ${escapeHtml(story.publisher)}</i>`;
  }));
  const chunks: string[] = [];
  let current = `<b>NEWSFELLOW • ${escapeHtml(heading)}</b>\n\n`;
  for (const section of sections) {
    if ((current + section).length > 3900) { chunks.push(current.trim()); current = ''; }
    current += `${section}\n\n`;
  }
  if (current.trim()) chunks.push(current.trim());
  return chunks;
}

function escapeDiscord(value: string): string {
  return value.replace(/([\\`*_{}\[\]()#+\-.!|>])/g, '\\$1');
}

function flaLabel(topics: string[]): string {
  if (topics.includes('louisiana')) return 'LOUISIANA';
  if (topics.includes('funding') || topics.includes('grants')) return 'FUNDING';
  if (topics.includes('events')) return 'EVENT';
  return 'FOUNDER RADAR';
}

export async function composeDiscordDigest(
  stories: StoredStory[],
  summarize: Summarizer = async (title, excerpt, topics) => extractiveSummary(title, excerpt, topics),
  heading = 'LOUISIANA STARTUP RADAR'
): Promise<string[]> {
  if (!stories.length) return ['**FOUNDERS LA • STARTUP RADAR**\n\nNo verified, relevant stories were found in the current window.'];
  const sections = await Promise.all(stories.map(async (story) => {
    const topics = JSON.parse(story.topics_json) as string[];
    const summary = await summarize(story.title, story.excerpt, topics);
    return `**${flaLabel(topics)} • [${escapeDiscord(story.title)}](${story.canonical_url})**\n${escapeDiscord(summary.whatHappened)}\n\n**Why it matters:** ${escapeDiscord(summary.whyItMatters)}\n*Source: ${escapeDiscord(story.publisher)}*`;
  }));
  const chunks: string[] = [];
  let current = `**FOUNDERS LA • ${heading}**\n*Useful news, opportunities, and ecosystem updates for Louisiana builders.*\n\n`;
  for (const section of sections) {
    if ((current + section).length > 1900) { chunks.push(current.trim()); current = ''; }
    current += `${section}\n\n`;
  }
  if (current.trim()) chunks.push(current.trim());
  return chunks;
}
