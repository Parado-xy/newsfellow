import test from 'node:test';
import assert from 'node:assert/strict';
import { hashInput } from '../src/ai/artifacts.ts';
import { evaluateSummarySuite } from '../src/ai/evaluation.ts';
import { modelFor } from '../src/ai/models.ts';
import { parseJsonObject, validateStoryIntelligence, validateSummary } from '../src/ai/schema.ts';
import { instrumentedSummary } from '../src/ai/summary.ts';
import type { Env } from '../src/types.ts';

function aiEnv(response: unknown) {
  const artifacts = new Map<string, string>();
  let calls = 0;
  const DB = {
    prepare(sql: string) {
      return {
        bind(...values: unknown[]) {
          const key = sql.includes('INSERT INTO ai_artifacts')
            ? [values[0], values[1], values[3], values[4], values[5]].join('|')
            : values.slice(0, 5).join('|');
          return {
            async first() {
              if (!sql.includes('SELECT output_json')) return null;
              const output_json = artifacts.get(key);
              return output_json ? { output_json } : null;
            },
            async run() {
              if (sql.includes('INSERT INTO ai_artifacts') && typeof values[7] === 'string') artifacts.set(key, values[7]);
              return { success: true, meta: { changes: 1 } };
            }
          };
        }
      };
    }
  };
  const AI = {
    async run() { calls++; return response; }
  };
  return { env: { DB, AI, AI_SUMMARIZER_ENABLED: 'true' } as unknown as Env, calls: () => calls, artifacts };
}

test('validates, bounds, and rejects malformed summary artifacts', () => {
  const valid = validateSummary({ whatHappened: 'A useful release shipped.', whyItMatters: 'Builders can use it.' });
  assert.equal(valid.value?.whatHappened, 'A useful release shipped.');
  assert.match(validateSummary({ whatHappened: 'Only one field.' }).error ?? '', /must be strings/);
  assert.match(validateSummary({ whatHappened: 'A', whyItMatters: 'B', invented: true }).error ?? '', /unknown fields/);
  assert.deepEqual(parseJsonObject('```json\n{"whatHappened":"A","whyItMatters":"B"}\n```').value,
    { whatHappened: 'A', whyItMatters: 'B' });
});

test('creates stable content-addressed cache keys', async () => {
  assert.equal(await hashInput({ title: 'A', topics: ['ai'] }), await hashInput({ title: 'A', topics: ['ai'] }));
  assert.notEqual(await hashInput({ title: 'A' }), await hashInput({ title: 'B' }));
});

test('routes summary models through configuration with a safe default', () => {
  assert.equal(modelFor({} as Env, 'story_summary'), '@cf/meta/llama-3.2-1b-instruct');
  assert.equal(modelFor({ AI_SUMMARY_MODEL: '@cf/example/model' } as Env, 'story_summary'), '@cf/example/model');
});

test('runs deterministic offline summary quality gates', () => {
  const report = evaluateSummarySuite([
    {
      name: 'grounded release',
      output: { whatHappened: 'Cloudflare released a database feature.', whyItMatters: 'It affects developers.' },
      expectedTerms: ['Cloudflare', 'developers'], forbiddenTerms: ['acquisition']
    },
    {
      name: 'unsupported claim',
      output: { whatHappened: 'Cloudflare announced an acquisition.', whyItMatters: 'It affects developers.' },
      expectedTerms: ['Cloudflare'], forbiddenTerms: ['acquisition']
    }
  ]);
  assert.equal(report.passed, 1);
  assert.equal(report.failed, 1);
  assert.equal(report.passRate, 0.5);
});

test('records and reuses validated AI artifacts without a second inference', async () => {
  const fixture = aiEnv({
    response: '{"whatHappened":"A database feature shipped.","whyItMatters":"It reduces developer operations work."}',
    usage: { prompt_tokens: 20, completion_tokens: 10, total_tokens: 30 }
  });
  const summarize = instrumentedSummary(fixture.env, 100);
  const first = await summarize('Database release', 'A database feature shipped for developers and reduces operations work.', ['cloud']);
  const second = await summarize('Database release', 'A database feature shipped for developers and reduces operations work.', ['cloud']);
  assert.deepEqual(second, first);
  assert.equal(fixture.calls(), 1);
  assert.equal(fixture.artifacts.size, 1);
});

test('uses the deterministic fallback when model output violates the schema', async () => {
  const fixture = aiEnv({ response: '{"whatHappened":"Missing required field"}' });
  const summary = await instrumentedSummary(fixture.env, 100)(
    'Security release', 'The project released a security update that fixes a reported vulnerability.', ['cybersecurity']);
  assert.match(summary.whatHappened, /security update/);
  assert.match(summary.whyItMatters, /security exposure/);
  assert.equal(fixture.calls(), 1);
});

test('accepts grounded enrichment and rejects unsupported extracted evidence', () => {
  const source = 'OpenAI launched Atlas in Louisiana for software developers.';
  const value = {
    eventType: 'launch', topics: ['ai'], entities: ['OpenAI', 'Atlas'], geographies: ['Louisiana'],
    affectedAudiences: ['developers'], evidence: ['OpenAI launched Atlas'], actionability: 0.5,
    novelty: 0.8, significance: 0.7, developerRelevance: 0.9, founderRelevance: 0.5,
    louisianaRelevance: 0.8, confidence: 0.9
  };
  assert.equal(validateStoryIntelligence(value, source).value?.eventType, 'launch');
  assert.match(validateStoryIntelligence({ ...value, entities: ['Invented Company'] }, source).error ?? '', /unsupported/);
  assert.match(validateStoryIntelligence({ ...value, confidence: 1.2 }, source).error ?? '', /between 0 and 1/);
});
