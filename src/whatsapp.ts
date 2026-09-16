import type { DeliveryStatusEvent, InboundCommand, TransportReceipt } from './channels/types.ts';
import { createWhatsAppTransport, normalizeWhatsAppPhone, parseWhatsAppWebhook, verifyWhatsAppSignature, whatsappFormatter } from './channels/whatsapp.ts';
import { handleCommand } from './commands.ts';
import type { Env } from './types.ts';

function log(level: 'info' | 'warn' | 'error', event: string, fields: Record<string, unknown> = {}): void {
  console[level](JSON.stringify({ event, channel: 'whatsapp', ...fields }));
}

export function verifyWhatsAppChallenge(url: URL, env: Env): Response {
  const valid = url.searchParams.get('hub.mode') === 'subscribe'
    && Boolean(env.WHATSAPP_WEBHOOK_VERIFY_TOKEN)
    && url.searchParams.get('hub.verify_token') === env.WHATSAPP_WEBHOOK_VERIFY_TOKEN;
  if (!valid) {
    log('warn', 'whatsapp_webhook_verification_failed');
    return Response.json({ error: 'forbidden' }, { status: 403 });
  }
  log('info', 'whatsapp_webhook_verified');
  return new Response(url.searchParams.get('hub.challenge') ?? '', { status: 200, headers: { 'content-type': 'text/plain' } });
}

async function claimEvent(env: Env, eventId: string, eventType: string): Promise<boolean> {
  await env.DB.prepare(`INSERT OR IGNORE INTO webhook_events (channel, event_id, event_type)
    VALUES ('whatsapp', ?, ?)`).bind(eventId, eventType).run();
  const claim = await env.DB.prepare(`UPDATE webhook_events SET status = 'processing', attempts = attempts + 1,
    last_error = NULL, updated_at = CURRENT_TIMESTAMP WHERE channel = 'whatsapp' AND event_id = ? AND
    (status IN ('pending', 'failed') OR (status = 'processing' AND updated_at < datetime('now', '-10 minutes')))`)
    .bind(eventId).run();
  return (claim.meta.changes ?? 0) > 0;
}

async function completeEvent(env: Env, eventId: string): Promise<void> {
  await env.DB.prepare(`UPDATE webhook_events SET status = 'processed', processed_at = CURRENT_TIMESTAMP,
    last_error = NULL, updated_at = CURRENT_TIMESTAMP WHERE channel = 'whatsapp' AND event_id = ?`).bind(eventId).run();
}

async function failEvent(env: Env, eventId: string, error: unknown): Promise<void> {
  await env.DB.prepare(`UPDATE webhook_events SET status = 'failed', last_error = ?,
    updated_at = CURRENT_TIMESTAMP WHERE channel = 'whatsapp' AND event_id = ?`)
    .bind(String(error).slice(0, 1000), eventId).run();
}

async function recordOutbound(env: Env, command: InboundCommand, receipt: TransportReceipt | void): Promise<void> {
  if (!receipt?.externalMessageId) return;
  await env.DB.prepare(`INSERT INTO channel_messages
    (channel, external_message_id, direction, sender, destination, event_id, message_type, command, status)
    VALUES ('whatsapp', ?, 'outbound', NULL, ?, ?, 'text', ?, 'accepted')
    ON CONFLICT(channel, external_message_id) DO UPDATE SET status = excluded.status, updated_at = CURRENT_TIMESTAMP`)
    .bind(receipt.externalMessageId, command.destination, command.eventId, command.command).run();
}

async function processCommand(env: Env, command: InboundCommand): Promise<void> {
  if (!await claimEvent(env, command.eventId, 'message')) {
    log('info', 'whatsapp_event_duplicate', { eventId: command.eventId });
    return;
  }
  try {
    await env.DB.prepare(`INSERT INTO channel_messages
      (channel, external_message_id, direction, sender, destination, event_id, message_type, command, status)
      VALUES ('whatsapp', ?, 'inbound', ?, ?, ?, 'text', ?, 'received')
      ON CONFLICT(channel, external_message_id) DO NOTHING`)
      .bind(command.eventId, command.sender, command.destination, command.eventId, command.command).run();
    const baseTransport = createWhatsAppTransport(env);
    await handleCommand(command, {
      env,
      formatter: whatsappFormatter,
      transport: {
        id: 'whatsapp',
        async send(destination, message) {
          const receipt = await baseTransport.send(destination, message);
          await recordOutbound(env, command, receipt);
          return receipt;
        }
      },
      authorize: (candidate) => normalizeWhatsAppPhone(candidate.sender) === normalizeWhatsAppPhone(env.WHATSAPP_OWNER_PHONE ?? '')
    });
    await completeEvent(env, command.eventId);
    log('info', 'whatsapp_inbound_processed', { eventId: command.eventId, command: command.command });
  } catch (error) {
    await failEvent(env, command.eventId, error).catch(() => undefined);
    log('error', 'whatsapp_inbound_failed', { eventId: command.eventId, error: String(error) });
    throw error;
  }
}

async function processStatus(env: Env, event: DeliveryStatusEvent): Promise<void> {
  const eventId = `${event.externalMessageId}:${event.status}:${event.occurredAt ?? 'unknown'}`;
  if (!await claimEvent(env, eventId, 'delivery_status')) {
    log('info', 'whatsapp_event_duplicate', { eventId });
    return;
  }
  try {
    await env.DB.prepare(`INSERT INTO channel_messages
      (channel, external_message_id, direction, message_type, status, last_error, occurred_at)
      VALUES ('whatsapp', ?, 'outbound', 'text', ?, ?, ?)
      ON CONFLICT(channel, external_message_id) DO UPDATE SET status = excluded.status,
      last_error = excluded.last_error, occurred_at = COALESCE(excluded.occurred_at, channel_messages.occurred_at),
      updated_at = CURRENT_TIMESTAMP`)
      .bind(event.externalMessageId, event.status, event.error ?? null, event.occurredAt ?? null).run();
    await completeEvent(env, eventId);
    log(event.status === 'failed' ? 'warn' : 'info', 'whatsapp_delivery_status', {
      externalMessageId: event.externalMessageId, status: event.status, error: event.error
    });
  } catch (error) {
    await failEvent(env, eventId, error).catch(() => undefined);
    throw error;
  }
}

export async function processWhatsAppWebhook(payload: unknown, env: Env): Promise<void> {
  const events = parseWhatsAppWebhook(payload, env.WHATSAPP_PHONE_NUMBER_ID);
  const results = await Promise.allSettled(events.map((event) => 'kind' in event
    ? processStatus(env, event)
    : processCommand(env, event)));
  const failures = results.filter((result) => result.status === 'rejected');
  if (failures.length) log('error', 'whatsapp_webhook_partial_failure', { events: events.length, failures: failures.length });
}

export async function handleWhatsAppWebhook(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
  if (!env.WHATSAPP_APP_SECRET || !env.WHATSAPP_PHONE_NUMBER_ID || !env.WHATSAPP_OWNER_PHONE) {
    log('error', 'whatsapp_configuration_missing');
    return Response.json({ error: 'service_unavailable' }, { status: 503 });
  }
  const body = await request.arrayBuffer();
  if (!await verifyWhatsAppSignature(body, request.headers.get('x-hub-signature-256'), env.WHATSAPP_APP_SECRET)) {
    log('warn', 'whatsapp_signature_invalid');
    return Response.json({ error: 'unauthorized' }, { status: 401 });
  }
  let payload: unknown;
  try { payload = JSON.parse(new TextDecoder().decode(body)); }
  catch { return Response.json({ error: 'invalid_json' }, { status: 400 }); }
  ctx.waitUntil(processWhatsAppWebhook(payload, env).catch((error) => log('error', 'whatsapp_webhook_failed', { error: String(error) })));
  return Response.json({ ok: true });
}
