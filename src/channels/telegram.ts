import type { Env, TelegramUpdate } from '../types.ts';
import type { ChannelFormatter, ChannelTransport, DigestContent, InboundCommand, StatusContent } from './types.ts';

function escapeHtml(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function preferenceReason(values?: string[]): string {
  if (!values?.length) return '';
  const labels = values.slice(0, 2).map((value) => value.split(':')[1]).filter(Boolean);
  return labels.length ? `\n<i>Selected for: ${labels.map(escapeHtml).join(', ')}</i>` : '';
}

export const telegramFormatter: ChannelFormatter = {
  digest(content: DigestContent): string[] {
    if (!content.stories.length) {
      return [content.emptyMessage ?? '<b>NEWSFELLOW</b>\n\nNo material stories were found in the current source window.'];
    }
    const sections = content.stories.map(({ story, summary }, index) => {
      const coverage = (story.cluster_source_count ?? 1) > 1 ? ` • ${story.cluster_source_count} reports` : '';
      return `<b>${index + 1}. <a href="${escapeHtml(story.canonical_url)}">${escapeHtml(story.title)}</a></b>\n${escapeHtml(summary.whatHappened)}\n\n<i>Why it matters:</i> ${escapeHtml(summary.whyItMatters)}\n<i>Source: ${escapeHtml(story.publisher)}${coverage}</i>${preferenceReason(story.ranking_explanation)}`;
    });
    const chunks: string[] = [];
    let current = `<b>NEWSFELLOW • ${escapeHtml(content.heading)}</b>\n\n`;
    for (const section of sections) {
      if ((current + section).length > 3900) { chunks.push(current.trim()); current = ''; }
      current += `${section}\n\n`;
    }
    if (current.trim()) chunks.push(current.trim());
    return chunks;
  },
  status(content) {
    return `<b>NewsFellow status</b>\nBot: healthy\nStored stories: ${content.storedStories}\nLast collection: ${content.lastCollection}\nMode: ${content.summarizationMode}\nRound-ups: ${content.roundups}`;
  },
  operations(content) {
    const sources = content.unhealthySources.length
      ? content.unhealthySources.map((source) => `• ${escapeHtml(source.name)}: ${source.failures} consecutive failure(s)`).join('\n')
      : 'All tracked sources healthy';
    return `<b>NewsFellow operations</b>\n\n<b>Last collection</b>\n${escapeHtml(content.collection)}\n\n<b>Last delivery</b>\n${escapeHtml(content.delivery)}\n\n<b>Failed deliveries, 24h</b>\n${content.failedDeliveries24h}\n\n<b>AI health, 24h</b>\n${escapeHtml(content.aiHealth)}\n\n<b>Semantic index</b>\n${escapeHtml(content.semanticHealth)}\n\n<b>Personalization</b>\n${escapeHtml(content.personalizationHealth)}\n\n<b>Source health</b>\n${sources}`;
  },
  collectionFooter: (sourcesOk, inserted) => `<i>${sourcesOk} sources checked • ${inserted} new stories</i>`,
  start: () => '<b>NewsFellow is ready.</b>\n\nUse /brief for news, /weekly for a seven-day synthesis, /preferences to inspect your ranking profile, /more topic or /less topic to tune it, /status for health, or /report for operations. Morning and evening round-ups are delivered automatically.',
  unknownCommand: () => 'Available commands: /brief, /weekly, /preferences, /more topic, /less topic, /status, /report',
  preparingBrief: () => 'Preparing your brief from the latest collected stories…',
  preparingWeekly: () => 'Preparing your weekly synthesis from the strongest story clusters…',
  preferences(items) {
    if (!items.length) return '<b>NewsFellow preferences</b>\nNo preferences recorded.';
    return `<b>NewsFellow preferences</b>\n${items.map((item) => `${item.weight >= 0 ? '↑' : '↓'} ${escapeHtml(item.value)}: ${item.weight.toFixed(1)}`).join('\n')}\n\nUse /more topic or /less topic to adjust.`;
  },
  preferenceUpdated(value, weight) {
    return `Preference updated: <b>${escapeHtml(value)}</b> is now ${weight > 0 ? 'prioritized' : weight < 0 ? 'deprioritized' : 'neutral'} (${weight.toFixed(1)}).`;
  },
  commandFailure: () => 'NewsFellow could not complete that request. Please try again shortly.',
  monitoringAlert(title, detail, runId) {
    const suffix = runId ? `\n<i>Run: ${escapeHtml(runId)}</i>` : '';
    return `<b>⚠️ NewsFellow: ${escapeHtml(title)}</b>\n${escapeHtml(detail)}${suffix}`;
  }
};

export function parseTelegramUpdate(update: TelegramUpdate): InboundCommand | null {
  const message = update.message;
  if (!message?.text) return null;
  const parts = message.text.trim().split(/\s+/);
  const rawCommand = parts[0].toLowerCase().replace(/@[^\s]+$/, '');
  const known = new Map<string, InboundCommand['command']>([
    ['/start', 'start'], ['/brief', 'brief'], ['/weekly', 'weekly'], ['/status', 'status'], ['/report', 'report'],
    ['/preferences', 'preferences'], ['/more', 'more'], ['/less', 'less']
  ]);
  const chatId = String(message.chat.id);
  return {
    channel: 'telegram', destination: chatId, sender: chatId,
    command: known.get(rawCommand) ?? 'unknown', rawCommand, arguments: parts.slice(1),
    eventId: String(update.update_id)
  };
}

async function telegramRequest(env: Env, method: string, body: object): Promise<void> {
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

export function createTelegramTransport(env: Env): ChannelTransport {
  return {
    id: 'telegram',
    send: (destination, message) => telegramRequest(env, 'sendMessage', {
      chat_id: destination, text: message, parse_mode: 'HTML', disable_web_page_preview: true
    })
  };
}
