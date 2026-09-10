import test from 'node:test';
import assert from 'node:assert/strict';
import { correlationId, scheduledDeliveryKey } from '../src/reliability.ts';

test('builds stable delivery keys for the same local delivery window', () => {
  const summer = Date.parse('2026-09-10T13:15:00Z');
  assert.equal(
    scheduledDeliveryKey(summer, 'America/Chicago', 'fla', 'discord', 'morning'),
    'discord:fla:2026-09-10:morning'
  );
  assert.equal(
    scheduledDeliveryKey(summer + 20 * 60_000, 'America/Chicago', 'fla', 'discord', 'morning'),
    scheduledDeliveryKey(summer, 'America/Chicago', 'fla', 'discord', 'morning')
  );
});

test('creates unique run correlation IDs', () => {
  assert.notEqual(correlationId(), correlationId());
});
