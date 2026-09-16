import test from 'node:test';
import assert from 'node:assert/strict';
import { handleCommand } from '../src/commands.ts';
import { telegramFormatter } from '../src/channels/telegram.ts';
import type { Env } from '../src/types.ts';

test('rejects unauthorized normalized commands without invoking the transport', async () => {
  const sent: string[] = [];
  await handleCommand({
    channel: 'telegram', destination: '2', sender: '2', command: 'brief', rawCommand: '/brief', eventId: '9'
  }, {
    env: {} as Env,
    formatter: telegramFormatter,
    transport: { id: 'telegram', send: async (_destination, message) => { sent.push(message); } },
    authorize: () => false
  });
  assert.deepEqual(sent, []);
});

test('handles channel-independent start and unknown commands through injected adapters', async () => {
  const sent: string[] = [];
  const context = {
    env: {} as Env,
    formatter: telegramFormatter,
    transport: { id: 'telegram' as const, send: async (_destination: string, message: string) => { sent.push(message); } },
    authorize: () => true
  };
  await handleCommand({ channel: 'telegram', destination: '1', sender: '1', command: 'start', rawCommand: '/start', eventId: '1' }, context);
  await handleCommand({ channel: 'telegram', destination: '1', sender: '1', command: 'unknown', rawCommand: '/wat', eventId: '2' }, context);
  assert.match(sent[0], /NewsFellow is ready/);
  assert.equal(sent[1], 'Available commands: /brief, /status, /report');
});
