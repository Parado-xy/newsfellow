import test from 'node:test';
import assert from 'node:assert/strict';
import { extractiveSummary, withTimeout } from '../src/news/summarize.ts';

test('produces bounded extractive summary and topic rationale', () => {
  const result = extractiveSummary('Cloud release', 'The company released a new database service for developers. It reduces the operational work required to run replicas. A third sentence should not be needed.', ['cloud']);
  assert.match(result.whatHappened, /database service/);
  assert.match(result.whyItMatters, /cloud architecture/);
  assert.ok(result.whatHappened.length <= 340);
});

test('falls back when model summarization exceeds its deadline', async () => {
  const slow = async () => new Promise<never>(() => {});
  const result = await withTimeout(slow, 5)('Release', 'The company released a useful new platform for developers.', ['cloud']);
  assert.match(result.whatHappened, /useful new platform/);
});
