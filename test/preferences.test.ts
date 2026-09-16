import test from 'node:test';
import assert from 'node:assert/strict';
import { adjustTopicPreference, loadPreferences } from '../src/news/preferences.ts';
import type { Env } from '../src/types.ts';

function preferenceEnv() {
  const weights = new Map<string, { weight: number; source: string }>();
  const feedback: unknown[][] = [];
  const DB = {
    prepare(sql: string) {
      return {
        bind(...values: unknown[]) {
          return {
            async run() {
              if (sql.includes('INSERT INTO audience_preferences')) {
                const key = `${values[0]}:${values[1]}`;
                const current = weights.get(key)?.weight ?? 0;
                weights.set(key, { weight: Math.max(-1, Math.min(1, current + Number(values[2]))), source: 'explicit' });
              } else if (sql.includes('INSERT INTO story_feedback')) feedback.push(values);
              return { success: true, meta: { changes: 1 } };
            },
            async first() {
              return weights.get(`${values[0]}:${values[1]}`) ?? null;
            },
            async all() {
              const audience = String(values[0]);
              return { results: [...weights.entries()].filter(([key]) => key.startsWith(`${audience}:`)).map(([key, item]) => ({
                signal_type: 'topic', signal_value: key.slice(audience.length + 1), weight: item.weight, source: item.source
              })) };
            }
          };
        }
      };
    }
  };
  return { env: { DB } as unknown as Env, weights, feedback };
}

test('normalizes, accumulates, and bounds explicit topic feedback', async () => {
  const fixture = preferenceEnv();
  await adjustTopicPreference(fixture.env, 'personal', 'Systems Programming!', 'more', 'telegram');
  const second = await adjustTopicPreference(fixture.env, 'personal', 'systems programming', 'more', 'telegram');
  assert.equal(second.value, 'systems-programming');
  assert.equal(second.weight, 0.4);
  assert.equal(fixture.feedback.length, 2);
  for (let index = 0; index < 10; index++) await adjustTopicPreference(fixture.env, 'personal', 'systems programming', 'less', 'telegram');
  assert.equal((await loadPreferences(fixture.env, 'personal'))[0].weight, -1);
});

test('rejects an empty preference topic', async () => {
  const fixture = preferenceEnv();
  await assert.rejects(() => adjustTopicPreference(fixture.env, 'personal', '!!!', 'more', 'telegram'), /topic is required/i);
});
