import type { Env, TelegramUpdate } from './types.ts';
import { scheduledPeriod } from './schedule.ts';
import { handleTelegramUpdate, sendScheduledRoundup } from './telegram.ts';
import { sendFlaRoundup } from './discord.ts';

function json(value: unknown, status = 200): Response {
  return Response.json(value, { status, headers: { 'cache-control': 'no-store' } });
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    if (request.method === 'GET' && url.pathname === '/health') return json({ ok: true, service: 'newsfellow' });
    if (request.method === 'POST' && url.pathname === '/discord/test') {
      const authorization = request.headers.get('authorization');
      if (!env.DISCORD_ADMIN_SECRET || authorization !== `Bearer ${env.DISCORD_ADMIN_SECRET}`) return json({ error: 'unauthorized' }, 401);
      ctx.waitUntil(sendFlaRoundup(env).catch((error) => console.error(JSON.stringify({ event: 'fla_test_failed', error: String(error) }))));
      return json({ ok: true, queued: 'fla_roundup' }, 202);
    }
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
    const flaMorning = scheduledPeriod(controller.scheduledTime, env.FLA_TIMEZONE ?? 'America/Chicago') === 'morning';
    if (!period && !flaMorning) return;
    try {
      if (period) await sendScheduledRoundup(env, period);
      if (flaMorning && env.FLA_NEWS_ENABLED === 'true') await sendFlaRoundup(env);
    } catch (error) {
      console.error(JSON.stringify({ event: 'scheduled_roundup_failed', period, flaMorning, error: String(error) }));
      throw error;
    }
  }
} satisfies ExportedHandler<Env>;
