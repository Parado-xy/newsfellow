import type { Env, TelegramUpdate } from './types.ts';
import { collectNews, composeDigest, loadTopStories } from './news/pipeline.ts';
import { withTimeout, workersAiSummarizer } from './news/summarize.ts';

async function telegram(env: Env, method: string, body: object): Promise<void> {
  const response = await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/${method}`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body)
  });
  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`Telegram ${method} failed: ${response.status} ${detail.slice(0, 500)}`);
  }
}

export async function sendMessage(env: Env, chatId: string, text: string): Promise<void> {
  await telegram(env, 'sendMessage', { chat_id: chatId, text, parse_mode: 'HTML', disable_web_page_preview: true });
}

async function sendBrief(env: Env, chatId: string): Promise<void> {
  await sendMessage(env, chatId, 'Preparing your brief from the latest collected stories…');
  const limit = Math.min(10, Math.max(3, Number(env.MAX_DIGEST_STORIES ?? 6)));
  const stories = await loadTopStories(env, limit);
  const summarizer = env.AI_SUMMARIZER_ENABLED === 'true' ? withTimeout(workersAiSummarizer(env.AI)) : undefined;
  for (const chunk of await composeDigest(stories, summarizer)) await sendMessage(env, chatId, chunk);
}

export async function sendScheduledRoundup(env: Env, period: 'morning' | 'evening'): Promise<void> {
  const report = await collectNews(env, 'personal');
  const limit = Math.min(10, Math.max(3, Number(env.MAX_DIGEST_STORIES ?? 6)));
  const stories = await loadTopStories(env, limit, 14);
  const summarizer = env.AI_SUMMARIZER_ENABLED === 'true' ? withTimeout(workersAiSummarizer(env.AI), 8_000) : undefined;
  const heading = period === 'morning' ? 'MORNING ROUND-UP' : 'EVENING ROUND-UP';
  for (const chunk of await composeDigest(stories, summarizer, heading)) {
    await sendMessage(env, env.TELEGRAM_OWNER_CHAT_ID, chunk);
  }
  await sendMessage(env, env.TELEGRAM_OWNER_CHAT_ID, `<i>${report.sourcesOk} sources checked • ${report.inserted} new stories</i>`);
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
      await sendMessage(env, chatId, '<b>NewsFellow is ready.</b>\n\nUse /brief for an on-demand technology briefing or /status to check the bot. Morning and evening round-ups are delivered automatically.');
    } else if (command === '/brief') {
      await sendBrief(env, chatId);
    } else if (command === '/status') {
      const count = await env.DB.prepare('SELECT COUNT(*) AS count FROM stories').first<{ count: number }>();
      const mode = env.AI_SUMMARIZER_ENABLED === 'true' ? 'Workers AI with extractive fallback' : 'extractive summaries';
      await sendMessage(env, chatId, `<b>NewsFellow status</b>\nBot: healthy\nStored stories: ${count?.count ?? 0}\nMode: ${mode}\nRound-ups: morning and evening`);
    } else {
      await sendMessage(env, chatId, 'Available commands: /brief, /status');
    }
  } catch (error) {
    console.error(JSON.stringify({ event: 'telegram_command_failed', command, error: String(error) }));
    try { await sendMessage(env, chatId, 'NewsFellow could not complete that request. Please try again shortly.'); }
    catch (sendError) { console.error(JSON.stringify({ event: 'telegram_error_notice_failed', error: String(sendError) })); }
  }
}
