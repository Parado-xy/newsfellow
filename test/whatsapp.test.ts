import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createWhatsAppTransport, normalizeWhatsAppPhone, parseWhatsAppWebhook,
  verifyWhatsAppSignature, whatsappFormatter
} from '../src/channels/whatsapp.ts';
import { verifyWhatsAppChallenge } from '../src/whatsapp.ts';
import type { Env } from '../src/types.ts';

function webhook(value: object): object {
  return { object: 'whatsapp_business_account', entry: [{ changes: [{ field: 'messages', value }] }] };
}

test('normalizes WhatsApp text and interactive commands', () => {
  const events = parseWhatsAppWebhook(webhook({
    metadata: { phone_number_id: 'phone-1' },
    messages: [
      { id: 'wamid.1', from: '+1 (504) 555-0100', type: 'text', text: { body: '/more systems programming' } },
      { id: 'wamid.2', from: '15045550100', type: 'interactive', interactive: { button_reply: { id: 'brief', title: 'Latest brief' } } }
    ]
  }), 'phone-1');
  assert.deepEqual(events[0], {
    channel: 'whatsapp', destination: '+1 (504) 555-0100', sender: '+1 (504) 555-0100', eventId: 'wamid.1',
    command: 'more', rawCommand: 'more', arguments: ['systems', 'programming']
  });
  assert.equal('kind' in events[1] ? undefined : events[1].command, 'brief');
  assert.equal(parseWhatsAppWebhook(webhook({ metadata: { phone_number_id: 'other' }, messages: [{ id: 'x', from: '1', type: 'text', text: { body: 'brief' } }] }), 'phone-1').length, 0);
});

test('normalizes WhatsApp delivery statuses and errors', () => {
  const events = parseWhatsAppWebhook(webhook({
    metadata: { phone_number_id: 'phone-1' },
    statuses: [{ id: 'wamid.out', status: 'failed', timestamp: '1720000000', errors: [{ code: 131026, title: 'Undeliverable', message: 'Message undeliverable' }] }]
  }), 'phone-1');
  assert.deepEqual(events, [{
    kind: 'delivery_status', channel: 'whatsapp', externalMessageId: 'wamid.out', status: 'failed',
    occurredAt: new Date(1720000000 * 1000).toISOString(), error: '131026: Undeliverable: Message undeliverable'
  }]);
});

test('verifies Meta webhook signatures over the unmodified request body', async () => {
  const body = new TextEncoder().encode('{"entry":[]}');
  const secret = 'test-secret';
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const digest = new Uint8Array(await crypto.subtle.sign('HMAC', key, body));
  const signature = `sha256=${Array.from(digest, (byte) => byte.toString(16).padStart(2, '0')).join('')}`;
  assert.equal(await verifyWhatsAppSignature(body.buffer, signature, secret), true);
  assert.equal(await verifyWhatsAppSignature(body.buffer, signature.replace(/.$/, '0'), secret), false);
  assert.equal(await verifyWhatsAppSignature(body.buffer, null, secret), false);
});

test('validates subscription challenges without exposing the verification token', () => {
  const env = { WHATSAPP_WEBHOOK_VERIFY_TOKEN: 'verify-me' } as Env;
  const accepted = verifyWhatsAppChallenge(new URL('https://example.test/whatsapp/webhook?hub.mode=subscribe&hub.verify_token=verify-me&hub.challenge=1234'), env);
  assert.equal(accepted.status, 200);
  assert.equal(accepted.headers.get('content-type'), 'text/plain');
  const denied = verifyWhatsAppChallenge(new URL('https://example.test/whatsapp/webhook?hub.mode=subscribe&hub.verify_token=wrong&hub.challenge=1234'), env);
  assert.equal(denied.status, 403);
});

test('formats WhatsApp digests as bounded plain text with WhatsApp markup', () => {
  const messages = whatsappFormatter.digest({
    heading: 'Morning Brief',
    stories: [{
      story: {
        id: 'story-1', title: 'AI *launch*', canonical_url: 'https://example.test/story', excerpt: 'Excerpt', publisher: 'Source',
        published_at: new Date().toISOString(), topics_json: '[]', score: 1, audiences_json: '["personal"]', opportunity_type: null,
        deadline_date: null, deadline_text: null, eligibility: null, opportunity_location: null, participation_mode: null,
        application_url: null, opportunity_confidence: 0, is_rolling: 0, cluster_source_count: 2
      },
      summary: { whatHappened: 'Something happened.', whyItMatters: 'It matters.' }
    }]
  });
  assert.match(messages[0], /\*NEWSFELLOW • Morning Brief\*/);
  assert.match(messages[0], /AI \\\*launch\\\*/);
  assert.match(messages[0], /2 reports/);
  assert.ok(messages.every((message) => message.length <= 3900));
  assert.doesNotMatch(messages[0], /<b>/);
});

test('sends official Cloud API text payloads and retries transient failures', async () => {
  const originalFetch = globalThis.fetch;
  const requests: Array<{ url: string; headers: Headers; body: Record<string, unknown> }> = [];
  let attempt = 0;
  globalThis.fetch = (async (input, init) => {
    requests.push({ url: String(input), headers: new Headers(init?.headers), body: JSON.parse(String(init?.body)) as Record<string, unknown> });
    attempt++;
    return attempt === 1
      ? Response.json({ error: { message: 'temporary' } }, { status: 500 })
      : Response.json({ messaging_product: 'whatsapp', messages: [{ id: 'wamid.sent' }] });
  }) as typeof fetch;
  try {
    const receipt = await createWhatsAppTransport({
      WHATSAPP_ACCESS_TOKEN: 'token', WHATSAPP_PHONE_NUMBER_ID: 'phone-id', WHATSAPP_API_VERSION: 'v24.0'
    } as Env).send('+1 (504) 555-0100', 'hello');
    assert.deepEqual(receipt, { externalMessageId: 'wamid.sent' });
  } finally {
    globalThis.fetch = originalFetch;
  }
  assert.equal(attempt, 2);
  assert.equal(requests[1].url, 'https://graph.facebook.com/v24.0/phone-id/messages');
  assert.equal(requests[1].headers.get('authorization'), 'Bearer token');
  assert.deepEqual(requests[1].body, {
    messaging_product: 'whatsapp', recipient_type: 'individual', to: '15045550100',
    type: 'text', text: { preview_url: false, body: 'hello' }
  });
  assert.equal(normalizeWhatsAppPhone('+1 (504) 555-0100'), '15045550100');
});
