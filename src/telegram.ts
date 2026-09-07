import type { Env, TelegramUpdate } from './types.ts';
import { collectNews, composeDigest, loadTopStories } from './news/pipeline.ts';
import { workersAiSummarizer } from './news/summarize.ts';

async function telegram(env: Env, method: string, body: object): Promise<void> {
  const response = await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/${method}`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body)
  });
  if (!response.ok) throw new Error(`Telegram ${method} failed: ${response.status}`);
}

export async function sendMessage(env: Env, chatId: string, text: string): Promise<void> {
  await telegram(env, 'sendMessage', { chat_id: chatId, text, parse_mode: 'HTML', disable_web_page_preview: true });
}

async function sendBrief(env: Env, chatId: string): Promise<void> {
  await sendMessage(env, chatId, 'Collecting your sources and preparing the brief…');
  const report = await collectNews(env);
  const limit = Math.min(10, Math.max(3, Number(env.MAX_DIGEST_STORIES ?? 6)));
  const stories = await loadTopStories(env, limit);
  const summarizer = env.AI_SUMMARIZER_ENABLED === 'true' ? workersAiSummarizer(env.AI) : undefined;
  for (const chunk of await composeDigest(stories, summarizer)) await sendMessage(env, chatId, chunk);
  await sendMessage(env, chatId, `<i>${report.sourcesOk} sources checked • ${report.inserted} new stories</i>`);
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
  if (command === '/start') {
    await sendMessage(env, chatId, '<b>NewsFellow is ready.</b>\n\nUse /brief for an on-demand technology briefing or /status to check the bot.');
  } else if (command === '/brief') {
    await sendBrief(env, chatId);
  } else if (command === '/status') {
    const count = await env.DB.prepare('SELECT COUNT(*) AS count FROM stories').first<{ count: number }>();
    const mode = env.AI_SUMMARIZER_ENABLED === 'true' ? 'Workers AI with extractive fallback' : 'extractive summaries';
    await sendMessage(env, chatId, `<b>NewsFellow status</b>\nBot: healthy\nStored stories: ${count?.count ?? 0}\nMode: ${mode}`);
  } else {
    await sendMessage(env, chatId, 'Available commands: /brief, /status');
  }
}
