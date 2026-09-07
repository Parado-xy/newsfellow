import test from 'node:test';
import assert from 'node:assert/strict';
import { extractiveSummary } from '../src/news/summarize.ts';

test('produces bounded extractive summary and topic rationale', () => {
  const result = extractiveSummary('Cloud release', 'The company released a new database service for developers. It reduces the operational work required to run replicas. A third sentence should not be needed.', ['cloud']);
  assert.match(result.whatHappened, /database service/);
  assert.match(result.whyItMatters, /cloud architecture/);
  assert.ok(result.whatHappened.length <= 340);
});
