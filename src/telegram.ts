import type { Env, TelegramUpdate } from './types.ts';
import { collectNews, composeDigest, loadTopStories } from './news/pipeline.ts';
import { withTimeout, workersAiSummarizer } from './news/summarize.ts';
import { correlationId, deliverOnce, operationsReport } from './reliability.ts';

async function telegram(env: Env, method: string, body: object): Promise<void> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= 3; attempt++) {
    let response: Response;
    try {
      response = await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/${method}`, {
        method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
        signal: AbortSignal.timeout(8_000)
      });
    } catch (error) {
      lastError = error;
      if (attempt === 3) throw error;
      await new Promise((resolve) => setTimeout(resolve, attempt * 300));
      continue;
    }
    if (response.ok) return;
    const detail = await response.text();
    const error = new Error(`Telegram ${method} failed: ${response.status} ${detail.slice(0, 500)}`);
    if ((response.status !== 429 && response.status < 500) || attempt === 3) throw error;
    lastError = error;
    await new Promise((resolve) => setTimeout(resolve, attempt * 300));
  }
  throw lastError;
}

export async function sendMessage(env: Env, chatId: string, text: string): Promise<void> {
  await telegram(env, 'sendMessage', { chat_id: chatId, text, parse_mode: 'HTML', disable_web_page_preview: true });
}

function escapeHtml(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

export async function sendMonitoringAlert(env: Env, title: string, detail: string, runId?: string): Promise<void> {
  const suffix = runId ? `\n<i>Run: ${escapeHtml(runId)}</i>` : '';
  await sendMessage(env, env.TELEGRAM_OWNER_CHAT_ID,
    `<b>⚠️ NewsFellow: ${escapeHtml(title)}</b>\n${escapeHtml(detail)}${suffix}`);
}

async function sendBrief(env: Env, chatId: string): Promise<void> {
  await sendMessage(env, chatId, 'Preparing your brief from the latest collected stories…');
  await collectNews(env, 'personal');
  const limit = Math.min(10, Math.max(3, Number(env.MAX_DIGEST_STORIES ?? 6)));
  const stories = await loadTopStories(env, limit, 48, 'personal');
  const summarizer = env.AI_SUMMARIZER_ENABLED === 'true' ? withTimeout(workersAiSummarizer(env.AI)) : undefined;
  for (const chunk of await composeDigest(stories, summarizer)) await sendMessage(env, chatId, chunk);
}

export async function sendScheduledRoundup(
  env: Env,
  period: 'morning' | 'evening',
  deliveryKey: string,
  runId = correlationId()
) {
  const report = await collectNews(env, 'personal', runId);
  const limit = Math.min(10, Math.max(3, Number(env.MAX_DIGEST_STORIES ?? 6)));
  const stories = await loadTopStories(env, limit, 14);
  const summarizer = env.AI_SUMMARIZER_ENABLED === 'true' ? withTimeout(workersAiSummarizer(env.AI), 8_000) : undefined;
  const heading = period === 'morning' ? 'MORNING ROUND-UP' : 'EVENING ROUND-UP';
  const messages = await composeDigest(stories, summarizer, heading);
  messages.push(`<i>${report.sourcesOk} sources checked • ${report.inserted} new stories</i>`);
  await deliverOnce(env, {
    key: deliveryKey, correlationId: runId, audience: 'personal', platform: 'telegram', period, stories, messages
  }, (message) => sendMessage(env, env.TELEGRAM_OWNER_CHAT_ID, message));
  return report;
}

export async function handleTelegramUpdate(update: TelegramUpdate, env: Env): Promise<void> {
  const message = update.message;
  if (!message?.text) return;
  const chatId = String(message.chat.id);
  if (chatId !== env.TELEGRAM_OWNER_CHAT_ID) {
    console.warn(JSON.stringify({ event: 'unauthorized_chat', chatId }));
    return;
  }
  const command = message.text.trim().split(/\s+/)[0].toLowerCase().replace(/@[^\s]+$/, '');
  try {
    if (command === '/start') {
      await sendMessage(env, chatId, '<b>NewsFellow is ready.</b>\n\nUse /brief for news, /status for a quick health check, or /report for the operations report. Morning and evening round-ups are delivered automatically.');
    } else if (command === '/brief') {
      await sendBrief(env, chatId);
    } else if (command === '/report') {
      await sendMessage(env, chatId, await operationsReport(env));
    } else if (command === '/status') {
      const count = await env.DB.prepare('SELECT COUNT(*) AS count FROM stories').first<{ count: number }>();
      const lastCollection = await env.DB.prepare(`SELECT completed_at, sources_ok, sources_failed, sources_quarantined, inserted
        FROM collection_runs WHERE completed_at IS NOT NULL ORDER BY id DESC LIMIT 1`)
        .first<{ completed_at: string; sources_ok: number; sources_failed: number; sources_quarantined: number; inserted: number }>();
      const mode = env.AI_SUMMARIZER_ENABLED === 'true' ? 'Workers AI with extractive fallback' : 'extractive summaries';
      const collectionStatus = lastCollection
        ? `${lastCollection.completed_at} (${lastCollection.sources_ok} sources OK, ${lastCollection.sources_failed} failed, ${lastCollection.sources_quarantined ?? 0} quarantined, ${lastCollection.inserted} new)`
        : 'No completed collection recorded';
      await sendMessage(env, chatId, `<b>NewsFellow status</b>\nBot: healthy\nStored stories: ${count?.count ?? 0}\nLast collection: ${collectionStatus}\nMode: ${mode}\nRound-ups: morning and evening`);
    } else {
      await sendMessage(env, chatId, 'Available commands: /brief, /status, /report');
    }
  } catch (error) {
    console.error(JSON.stringify({ event: 'telegram_command_failed', command, error: String(error) }));
    try { await sendMessage(env, chatId, 'NewsFellow could not complete that request. Please try again shortly.'); }
    catch (sendError) { console.error(JSON.stringify({ event: 'telegram_error_notice_failed', error: String(sendError) })); }
  }
}
