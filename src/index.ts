import type { DiscordRoute, Env, TelegramUpdate } from './types.ts';
import { scheduledPeriod } from './schedule.ts';
import { handleTelegramUpdate, sendMonitoringAlert, sendScheduledRoundup } from './telegram.ts';
import { sendFlaRoundup } from './discord.ts';
import { correlationId, scheduledDeliveryKey } from './reliability.ts';

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
      const channelParam = url.searchParams.get('channel');
      if (channelParam && channelParam !== 'news' && channelParam !== 'opportunities') return json({ error: 'invalid_channel' }, 400);
      const channel: DiscordRoute | undefined = channelParam === 'news' || channelParam === 'opportunities'
        ? channelParam
        : undefined;
      ctx.waitUntil(sendFlaRoundup(env, undefined, undefined, channel ?? undefined).then(async ({ channels }) => {
        const failures = channels.filter((result) => result.outcome === 'failed');
        if (failures.length) throw new Error(failures.map((result) => `${result.route}: ${result.error}`).join('; '));
      }).catch(async (error) => {
        console.error(JSON.stringify({ event: 'fla_test_failed', error: String(error) }));
        await sendMonitoringAlert(env, 'Discord test failed', String(error)).catch(() => undefined);
      }));
      return json({ ok: true, queued: channel ?? 'all_fla_channels' }, 202);
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
    const failures: unknown[] = [];
    if (period) {
      const runId = correlationId();
      try {
        const report = await sendScheduledRoundup(env, period,
          scheduledDeliveryKey(controller.scheduledTime, env.OWNER_TIMEZONE ?? 'America/Chicago', 'personal', 'telegram', period), runId);
        if (report.sourcesOk === 0 || report.sourcesFailed > report.sourcesOk) {
          await sendMonitoringAlert(env, 'Personal sources degraded',
            `${report.sourcesOk} succeeded and ${report.sourcesFailed} failed.`, runId);
        }
      } catch (error) {
        failures.push(error);
        console.error(JSON.stringify({ event: 'scheduled_delivery_failed', platform: 'telegram', period, runId, error: String(error) }));
        await sendMonitoringAlert(env, 'Telegram roundup failed', String(error), runId).catch(() => undefined);
      }
    }
    if (flaMorning && env.FLA_NEWS_ENABLED === 'true') {
      const runId = correlationId();
      try {
        const result = await sendFlaRoundup(env,
          scheduledDeliveryKey(controller.scheduledTime, env.FLA_TIMEZONE ?? 'America/Chicago', 'fla', 'discord', 'morning'), runId);
        const report = result.report;
        const sent = result.channels.filter((channel) => channel.outcome === 'sent');
        const failed = result.channels.filter((channel) => channel.outcome === 'failed');
        if (sent.length) {
          await sendMonitoringAlert(env, 'FLA roundup delivered',
            `${sent.map((channel) => `${channel.stories} ${channel.route}`).join(', ')} stories sent to Discord. ${report.sourcesOk} sources succeeded, ${report.sourcesFailed} failed.`, runId);
        }
        if (failed.length) throw new Error(failed.map((channel) => `${channel.route}: ${channel.error}`).join('; '));
        if (report.sourcesOk === 0 || report.sourcesFailed > report.sourcesOk) {
          await sendMonitoringAlert(env, 'FLA sources degraded',
            `${report.sourcesOk} succeeded and ${report.sourcesFailed} failed.`, runId);
        }
      } catch (error) {
        failures.push(error);
        console.error(JSON.stringify({ event: 'scheduled_delivery_failed', platform: 'discord', period: 'morning', runId, error: String(error) }));
        await sendMonitoringAlert(env, 'FLA Discord roundup failed', String(error), runId).catch(() => undefined);
      }
    }
    if (failures.length) throw new AggregateError(failures, 'One or more scheduled NewsFellow deliveries failed');
  }
} satisfies ExportedHandler<Env>;
