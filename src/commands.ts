import type { ChannelFormatter, ChannelTransport, InboundCommand } from './channels/types.ts';
import type { Env } from './types.ts';
import { buildBrief, loadStatus } from './news/service.ts';
import { loadOperations } from './reliability.ts';

export interface CommandContext {
  env: Env;
  formatter: ChannelFormatter;
  transport: ChannelTransport;
  authorize(command: InboundCommand): boolean;
}

export async function handleCommand(command: InboundCommand, context: CommandContext): Promise<void> {
  if (!context.authorize(command)) {
    console.warn(JSON.stringify({ event: 'unauthorized_chat', channel: command.channel, chatId: command.sender, eventId: command.eventId }));
    return;
  }
  const send = (message: string) => context.transport.send(command.destination, message);
  try {
    switch (command.command) {
      case 'start':
        await send(context.formatter.start());
        break;
      case 'brief':
        await send(context.formatter.preparingBrief());
        for (const message of await buildBrief(context.env, context.formatter)) await send(message);
        break;
      case 'report':
        await send(context.formatter.operations(await loadOperations(context.env)));
        break;
      case 'status':
        await send(context.formatter.status(await loadStatus(context.env)));
        break;
      default:
        await send(context.formatter.unknownCommand());
    }
  } catch (error) {
    console.error(JSON.stringify({ event: `${command.channel}_command_failed`, command: command.rawCommand, eventId: command.eventId, error: String(error) }));
    try { await send(context.formatter.commandFailure()); }
    catch (sendError) {
      console.error(JSON.stringify({ event: `${command.channel}_error_notice_failed`, command: command.rawCommand, eventId: command.eventId, error: String(sendError) }));
    }
  }
}
