import type { Env, TelegramUpdate } from './types.ts';
import { buildPersonalRoundup } from './news/service.ts';
import { correlationId, deliverOnce } from './reliability.ts';
import { handleCommand } from './commands.ts';
import { createTelegramTransport, parseTelegramUpdate, telegramFormatter } from './channels/telegram.ts';

export async function sendMessage(env: Env, chatId: string, text: string): Promise<void> {
  await createTelegramTransport(env).send(chatId, text);
}

export async function sendMonitoringAlert(env: Env, title: string, detail: string, runId?: string): Promise<void> {
  await sendMessage(env, env.TELEGRAM_OWNER_CHAT_ID, telegramFormatter.monitoringAlert(title, detail, runId));
}

export async function sendScheduledRoundup(
  env: Env,
  period: 'morning' | 'evening',
  deliveryKey: string,
  runId = correlationId()
) {
  const transport = createTelegramTransport(env);
  const { report, stories, messages } = await buildPersonalRoundup(env, telegramFormatter, period, runId);
  await deliverOnce(env, {
    key: deliveryKey, correlationId: runId, audience: 'personal', platform: transport.id, period, stories, messages
  }, (message) => transport.send(env.TELEGRAM_OWNER_CHAT_ID, message));
  return report;
}

export async function handleTelegramUpdate(update: TelegramUpdate, env: Env): Promise<void> {
  const command = parseTelegramUpdate(update);
  if (!command) return;
  await handleCommand(command, {
    env,
    formatter: telegramFormatter,
    transport: createTelegramTransport(env),
    authorize: (candidate) => candidate.sender === env.TELEGRAM_OWNER_CHAT_ID
  });
}
