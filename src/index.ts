import type { Env, TelegramUpdate } from './types.ts';
import { scheduledPeriod } from './schedule.ts';
import { handleTelegramUpdate, sendScheduledRoundup } from './telegram.ts';

function json(value: unknown, status = 200): Response {
  return Response.json(value, { status, headers: { 'cache-control': 'no-store' } });
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    if (request.method === 'GET' && url.pathname === '/health') return json({ ok: true, service: 'newsfellow' });
    if (request.method === 'POST' && url.pathname === '/telegram/webhook') {
      const secret = request.headers.get('x-telegram-bot-api-secret-token');
      if (!secret || secret !== env.TELEGRAM_WEBHOOK_SECRET) return json({ error: 'unauthorized' }, 401);
      let update: TelegramUpdate;
      try { update = await request.json<TelegramUpdate>(); }
      catch { return json({ error: 'invalid_json' }, 400); }
      ctx.waitUntil(handleTelegramUpdate(update, env).catch((error) => console.error(JSON.stringify({ event: 'telegram_update_failed', error: String(error) }))));
      return json({ ok: true });
    }
    return json({ error: 'not_found' }, 404);
  },

  async scheduled(controller: ScheduledController, env: Env, _ctx: ExecutionContext): Promise<void> {
    const period = scheduledPeriod(controller.scheduledTime, env.OWNER_TIMEZONE ?? 'America/Chicago');
    if (!period) return;
    try {
      await sendScheduledRoundup(env, period);
    } catch (error) {
      console.error(JSON.stringify({ event: 'scheduled_roundup_failed', period, error: String(error) }));
      throw error;
    }
  }
} satisfies ExportedHandler<Env>;
