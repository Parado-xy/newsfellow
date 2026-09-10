import type { Env, NewsAudience, StoredStory } from './types.ts';

export interface DeliveryRequest {
  key: string;
  correlationId: string;
  audience: NewsAudience;
  platform: 'telegram' | 'discord';
  period: string;
  stories: StoredStory[];
  messages: string[];
}

export function correlationId(): string {
  return crypto.randomUUID();
}

export function scheduledDeliveryKey(
  scheduledTime: number,
  timeZone: string,
  audience: NewsAudience,
  platform: 'telegram' | 'discord',
  period: string
): string {
  const day = new Intl.DateTimeFormat('en-CA', {
    timeZone, year: 'numeric', month: '2-digit', day: '2-digit'
  }).format(new Date(scheduledTime));
  return `${platform}:${audience}:${day}:${period}`;
}

export async function deliverOnce(
  env: Env,
  request: DeliveryRequest,
  send: (message: string) => Promise<void>
): Promise<'sent' | 'already_sent' | 'in_progress'> {
  await env.DB.prepare(`INSERT OR IGNORE INTO deliveries
    (idempotency_key, correlation_id, audience, platform, period, story_ids_json, message_count)
    VALUES (?, ?, ?, ?, ?, ?, ?)`)
    .bind(request.key, request.correlationId, request.audience, request.platform, request.period,
      JSON.stringify(request.stories.map((story) => story.id)), request.messages.length).run();
  const delivery = await env.DB.prepare('SELECT id, status FROM deliveries WHERE idempotency_key = ?')
    .bind(request.key).first<{ id: number; status: string }>();
  if (!delivery) throw new Error('delivery ledger claim could not be read');
  if (delivery.status === 'sent') return 'already_sent';

  await env.DB.batch(request.messages.map((_, index) => env.DB.prepare(`INSERT OR IGNORE INTO delivery_chunks
    (delivery_id, chunk_index) VALUES (?, ?)`).bind(delivery.id, index)));
  const claim = await env.DB.prepare(`UPDATE deliveries SET status = 'sending', attempts = attempts + 1,
    correlation_id = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND
    (status IN ('pending', 'failed') OR (status = 'sending' AND updated_at < datetime('now', '-10 minutes')))`)
    .bind(request.correlationId, delivery.id).run();
  if ((claim.meta.changes ?? 0) === 0) return 'in_progress';

  try {
    for (let index = 0; index < request.messages.length; index++) {
      const chunk = await env.DB.prepare('SELECT status FROM delivery_chunks WHERE delivery_id = ? AND chunk_index = ?')
        .bind(delivery.id, index).first<{ status: string }>();
      if (chunk?.status === 'sent') continue;
      await env.DB.prepare(`UPDATE delivery_chunks SET attempts = attempts + 1,
        updated_at = CURRENT_TIMESTAMP WHERE delivery_id = ? AND chunk_index = ?`)
        .bind(delivery.id, index).run();
      try {
        await send(request.messages[index]);
        await env.DB.prepare(`UPDATE delivery_chunks SET status = 'sent', sent_at = CURRENT_TIMESTAMP,
          last_error = NULL, updated_at = CURRENT_TIMESTAMP WHERE delivery_id = ? AND chunk_index = ?`)
          .bind(delivery.id, index).run();
      } catch (error) {
        await env.DB.prepare(`UPDATE delivery_chunks SET status = 'failed', last_error = ?,
          updated_at = CURRENT_TIMESTAMP WHERE delivery_id = ? AND chunk_index = ?`)
          .bind(String(error).slice(0, 1000), delivery.id, index).run();
        throw error;
      }
    }
    await env.DB.prepare(`UPDATE deliveries SET status = 'sent', sent_count = message_count,
      sent_at = CURRENT_TIMESTAMP, last_error = NULL, updated_at = CURRENT_TIMESTAMP WHERE id = ?`)
      .bind(delivery.id).run();
    return 'sent';
  } catch (error) {
    await env.DB.prepare(`UPDATE deliveries SET status = 'failed',
      sent_count = (SELECT COUNT(*) FROM delivery_chunks WHERE delivery_id = ? AND status = 'sent'),
      last_error = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`)
      .bind(delivery.id, String(error).slice(0, 1000), delivery.id).run();
    throw error;
  }
}

export async function operationsReport(env: Env): Promise<string> {
  const lastCollection = await env.DB.prepare(`SELECT completed_at, audience, status, sources_ok,
    sources_failed, sources_quarantined, candidates, inserted, error FROM collection_runs ORDER BY id DESC LIMIT 1`)
    .first<Record<string, string | number | null>>();
  const lastDelivery = await env.DB.prepare(`SELECT platform, audience, period, status, sent_count,
    message_count, attempts, sent_at, last_error FROM deliveries ORDER BY id DESC LIMIT 1`)
    .first<Record<string, string | number | null>>();
  const unhealthy = await env.DB.prepare(`SELECT source_name, consecutive_failures, last_error
    FROM source_health WHERE consecutive_failures > 0 ORDER BY consecutive_failures DESC LIMIT 5`)
    .all<{ source_name: string; consecutive_failures: number; last_error: string | null }>();
  const failed24h = await env.DB.prepare(`SELECT COUNT(*) AS count FROM deliveries
    WHERE status = 'failed' AND created_at >= datetime('now', '-24 hours')`).first<{ count: number }>();

  const collection = lastCollection
    ? `${lastCollection.status} • ${lastCollection.audience ?? 'all'} • ${lastCollection.sources_ok} OK/${lastCollection.sources_failed} failed/${lastCollection.sources_quarantined ?? 0} quarantined • ${lastCollection.completed_at ?? 'in progress'}`
    : 'none recorded';
  const delivery = lastDelivery
    ? `${lastDelivery.status} • ${lastDelivery.platform}/${lastDelivery.audience} ${lastDelivery.period} • ${lastDelivery.sent_count}/${lastDelivery.message_count} messages • ${lastDelivery.sent_at ?? 'not sent'}`
    : 'none recorded';
  const sources = unhealthy.results.length
    ? unhealthy.results.map((source) => `• ${source.source_name}: ${source.consecutive_failures} consecutive failure(s)`).join('\n')
    : 'All tracked sources healthy';
  return `<b>NewsFellow operations</b>\n\n<b>Last collection</b>\n${collection}\n\n<b>Last delivery</b>\n${delivery}\n\n<b>Failed deliveries, 24h</b>\n${failed24h?.count ?? 0}\n\n<b>Source health</b>\n${sources}`;
}
