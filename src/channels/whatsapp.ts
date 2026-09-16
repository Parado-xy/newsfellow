import type { Env } from '../types.ts';
import type {
  ChannelFormatter, ChannelTransport, ChannelWebhookEvent, DeliveryStatusEvent,
  DigestContent, InboundCommand, TransportReceipt
} from './types.ts';

const MAX_MESSAGE_LENGTH = 3900;

function markdown(value: string): string {
  return value.replace(/[\\*_~`]/g, (character) => `\\${character}`);
}

function preferenceReason(values?: string[]): string {
  const labels = values?.slice(0, 2).map((value) => value.split(':')[1]).filter(Boolean) ?? [];
  return labels.length ? `\n_Selected for: ${labels.map(markdown).join(', ')}_` : '';
}

export const whatsappFormatter: ChannelFormatter = {
  digest(content: DigestContent): string[] {
    if (!content.stories.length) {
      return [content.emptyMessage ?? '*NEWSFELLOW*\n\nNo material stories were found in the current source window.'];
    }
    const sections = content.stories.map(({ story, summary }, index) => {
      const coverage = (story.cluster_source_count ?? 1) > 1 ? ` • ${story.cluster_source_count} reports` : '';
      return `*${index + 1}. ${markdown(story.title)}*\n${story.canonical_url}\n${markdown(summary.whatHappened)}\n\n_Why it matters:_ ${markdown(summary.whyItMatters)}\n_Source: ${markdown(story.publisher)}${coverage}_${preferenceReason(story.ranking_explanation)}`;
    });
    const chunks: string[] = [];
    let current = `*NEWSFELLOW • ${markdown(content.heading)}*\n\n`;
    for (const section of sections) {
      if ((current + section).length > MAX_MESSAGE_LENGTH && current.trim()) {
        chunks.push(current.trim());
        current = '';
      }
      current += `${section}\n\n`;
    }
    if (current.trim()) chunks.push(current.trim());
    return chunks;
  },
  status: (content) => `*NewsFellow status*\nBot: healthy\nStored stories: ${content.storedStories}\nLast collection: ${markdown(content.lastCollection)}\nMode: ${markdown(content.summarizationMode)}\nRound-ups: ${markdown(content.roundups)}`,
  operations(content) {
    const sources = content.unhealthySources.length
      ? content.unhealthySources.map((source) => `• ${markdown(source.name)}: ${source.failures} consecutive failure(s)`).join('\n')
      : 'All tracked sources healthy';
    return `*NewsFellow operations*\n\n*Last collection*\n${markdown(content.collection)}\n\n*Last delivery*\n${markdown(content.delivery)}\n\n*Failed deliveries, 24h*\n${content.failedDeliveries24h}\n\n*AI health, 24h*\n${markdown(content.aiHealth)}\n\n*Semantic index*\n${markdown(content.semanticHealth)}\n\n*Personalization*\n${markdown(content.personalizationHealth)}\n\n*Source health*\n${sources}`;
  },
  collectionFooter: (sourcesOk, inserted) => `_${sourcesOk} sources checked • ${inserted} new stories_`,
  start: () => '*NewsFellow is ready.*\n\nSend brief for news, weekly for a seven-day synthesis, preferences to inspect your ranking profile, more topic or less topic to tune it, status for health, or report for operations.',
  unknownCommand: () => 'Available commands: brief, weekly, preferences, more topic, less topic, status, report',
  preparingBrief: () => 'Preparing your brief from the latest collected stories…',
  preparingWeekly: () => 'Preparing your weekly synthesis from the strongest story clusters…',
  preferences(items) {
    if (!items.length) return '*NewsFellow preferences*\nNo preferences recorded.';
    return `*NewsFellow preferences*\n${items.map((item) => `${item.weight >= 0 ? '↑' : '↓'} ${markdown(item.value)}: ${item.weight.toFixed(1)}`).join('\n')}\n\nSend more topic or less topic to adjust.`;
  },
  preferenceUpdated: (value, weight) => `Preference updated: *${markdown(value)}* is now ${weight > 0 ? 'prioritized' : weight < 0 ? 'deprioritized' : 'neutral'} (${weight.toFixed(1)}).`,
  commandFailure: () => 'NewsFellow could not complete that request. Please try again shortly.',
  monitoringAlert: (title, detail, runId) => `*⚠️ NewsFellow: ${markdown(title)}*\n${markdown(detail)}${runId ? `\n_Run: ${markdown(runId)}_` : ''}`
};

type JsonRecord = Record<string, unknown>;

function record(value: unknown): JsonRecord | undefined {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? value as JsonRecord : undefined;
}

function array(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function string(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

function commandFromText(text: string): Pick<InboundCommand, 'command' | 'rawCommand' | 'arguments'> {
  const parts = text.trim().split(/\s+/).filter(Boolean);
  const rawCommand = (parts[0] ?? '').toLowerCase().replace(/^\//, '').replace(/@[^\s]+$/, '');
  const known = new Map<string, InboundCommand['command']>([
    ['start', 'start'], ['help', 'start'], ['brief', 'brief'], ['weekly', 'weekly'], ['status', 'status'],
    ['report', 'report'], ['preferences', 'preferences'], ['more', 'more'], ['less', 'less']
  ]);
  return { command: known.get(rawCommand) ?? 'unknown', rawCommand, arguments: parts.slice(1) };
}

function messageText(message: JsonRecord): string | undefined {
  if (message.type === 'text') return string(record(message.text)?.body);
  if (message.type !== 'interactive') return undefined;
  const interactive = record(message.interactive);
  const reply = record(interactive?.button_reply) ?? record(interactive?.list_reply);
  return string(reply?.id) ?? string(reply?.title);
}

function statusEvent(status: JsonRecord): DeliveryStatusEvent | undefined {
  const id = string(status.id);
  if (!id) return undefined;
  const rawStatus = string(status.status) ?? 'unknown';
  const allowed = new Set<DeliveryStatusEvent['status']>(['accepted', 'sent', 'delivered', 'read', 'failed']);
  const timestamp = Number(string(status.timestamp));
  const errors = array(status.errors).map(record).filter(Boolean) as JsonRecord[];
  const error = errors.map((item) => [item.code, item.title, item.message, record(item.error_data)?.details]
    .filter((part) => part !== undefined).join(': ')).filter(Boolean).join('; ');
  return {
    kind: 'delivery_status', channel: 'whatsapp', externalMessageId: id,
    status: allowed.has(rawStatus as DeliveryStatusEvent['status']) ? rawStatus as DeliveryStatusEvent['status'] : 'unknown',
    occurredAt: Number.isFinite(timestamp) ? new Date(timestamp * 1000).toISOString() : undefined,
    error: error || undefined
  };
}

export function parseWhatsAppWebhook(payload: unknown, expectedPhoneNumberId?: string): ChannelWebhookEvent[] {
  const events: ChannelWebhookEvent[] = [];
  for (const entry of array(record(payload)?.entry)) {
    for (const change of array(record(entry)?.changes)) {
      const value = record(record(change)?.value);
      if (!value) continue;
      const phoneNumberId = string(record(value.metadata)?.phone_number_id);
      if (expectedPhoneNumberId && phoneNumberId !== expectedPhoneNumberId) continue;
      for (const rawMessage of array(value.messages)) {
        const message = record(rawMessage);
        if (!message) continue;
        const text = messageText(message);
        const from = string(message.from);
        const id = string(message.id);
        if (!text || !from || !id) continue;
        events.push({ channel: 'whatsapp', destination: from, sender: from, eventId: id, ...commandFromText(text) });
      }
      for (const rawStatus of array(value.statuses)) {
        const event = record(rawStatus) ? statusEvent(record(rawStatus)!) : undefined;
        if (event) events.push(event);
      }
    }
  }
  return events;
}

export function normalizeWhatsAppPhone(value: string): string {
  return value.replace(/\D/g, '');
}

export async function verifyWhatsAppSignature(rawBody: ArrayBuffer, signature: string | null, appSecret: string): Promise<boolean> {
  if (!signature?.startsWith('sha256=') || !appSecret) return false;
  const hex = signature.slice(7);
  if (!/^[0-9a-f]{64}$/i.test(hex)) return false;
  const supplied = new Uint8Array(hex.match(/.{2}/g)!.map((byte) => Number.parseInt(byte, 16)));
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(appSecret), { name: 'HMAC', hash: 'SHA-256' }, false, ['verify']);
  return crypto.subtle.verify('HMAC', key, supplied, rawBody);
}

function required(value: string | undefined, name: string): string {
  if (!value) throw new Error(`${name} is not configured`);
  return value;
}

function retryDelay(response: Response, attempt: number): number {
  const seconds = Number(response.headers.get('retry-after'));
  return Number.isFinite(seconds) && seconds > 0 ? Math.min(5_000, seconds * 1000) : attempt * 300;
}

export function createWhatsAppTransport(env: Env): ChannelTransport {
  return {
    id: 'whatsapp',
    async send(destination, message): Promise<TransportReceipt> {
      const token = required(env.WHATSAPP_ACCESS_TOKEN, 'WHATSAPP_ACCESS_TOKEN');
      const phoneNumberId = required(env.WHATSAPP_PHONE_NUMBER_ID, 'WHATSAPP_PHONE_NUMBER_ID');
      const version = env.WHATSAPP_API_VERSION ?? 'v24.0';
      let lastError: unknown;
      for (let attempt = 1; attempt <= 3; attempt++) {
        let response: Response;
        try {
          response = await fetch(`https://graph.facebook.com/${version}/${phoneNumberId}/messages`, {
            method: 'POST',
            headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
            body: JSON.stringify({
              messaging_product: 'whatsapp', recipient_type: 'individual', to: normalizeWhatsAppPhone(destination),
              type: 'text', text: { preview_url: false, body: message }
            }),
            signal: AbortSignal.timeout(8_000)
          });
        } catch (error) {
          lastError = error;
          if (attempt === 3) throw error;
          await new Promise((resolve) => setTimeout(resolve, attempt * 300));
          continue;
        }
        type SendResponse = { messages?: Array<{ id?: string }>; error?: { message?: string } };
        const payload = await response.json<SendResponse>().catch((): SendResponse => ({}));
        if (response.ok) return { externalMessageId: payload.messages?.[0]?.id };
        const error = new Error(`WhatsApp send failed: ${response.status} ${payload.error?.message ?? response.statusText}`);
        if ((response.status !== 429 && response.status < 500) || attempt === 3) throw error;
        lastError = error;
        await new Promise((resolve) => setTimeout(resolve, retryDelay(response, attempt)));
      }
      throw lastError;
    }
  };
}
