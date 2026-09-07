import test from 'node:test';
import assert from 'node:assert/strict';
import { composeDigest } from '../src/news/pipeline.ts';

test('composes Telegram-safe attributed digest', async () => {
  const chunks = await composeDigest([{
    id: '1', title: 'A <major> release', canonical_url: 'https://example.com/story',
    excerpt: 'A company released an important new platform capability for developers.', publisher: 'Example',
    published_at: '2026-09-07T10:00:00Z', topics_json: '["developer-infrastructure"]', score: 0.9
  }]);
  assert.equal(chunks.length, 1);
  assert.match(chunks[0], /A &lt;major&gt; release/);
  assert.match(chunks[0], /Why it matters/);
  assert.match(chunks[0], /Example/);
});

test('supports a labeled scheduled round-up', async () => {
  const chunks = await composeDigest([{
    id: '1', title: 'Evening release', canonical_url: 'https://example.com/evening',
    excerpt: 'A company shipped a meaningful update for developers.', publisher: 'Example',
    published_at: '2026-09-07T22:00:00Z', topics_json: '["developer-infrastructure"]', score: 0.9
  }], undefined, 'EVENING ROUND-UP');
  assert.match(chunks[0], /NEWSFELLOW • EVENING ROUND-UP/);
});
