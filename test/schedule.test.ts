import test from 'node:test';
import assert from 'node:assert/strict';
import { scheduledPeriod } from '../src/schedule.ts';

test('selects Central morning across daylight and standard time', () => {
  assert.equal(scheduledPeriod(Date.parse('2026-07-01T13:00:00Z'), 'America/Chicago'), 'morning');
  assert.equal(scheduledPeriod(Date.parse('2026-01-01T14:00:00Z'), 'America/Chicago'), 'morning');
});

test('selects Central evening and ignores other hours', () => {
  assert.equal(scheduledPeriod(Date.parse('2026-07-02T00:00:00Z'), 'America/Chicago'), 'evening');
  assert.equal(scheduledPeriod(Date.parse('2026-07-01T18:00:00Z'), 'America/Chicago'), null);
});
