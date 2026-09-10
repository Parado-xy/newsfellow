import test from 'node:test';
import assert from 'node:assert/strict';
import { composeDigest, composeDiscordDigest } from '../src/news/pipeline.ts';

test('composes Telegram-safe attributed digest', async () => {
  const chunks = await composeDigest([{
    id: '1', title: 'A <major> release', canonical_url: 'https://example.com/story',
    excerpt: 'A company released an important new platform capability for developers.', publisher: 'Example',
    published_at: '2026-09-07T10:00:00Z', topics_json: '["developer-infrastructure"]', score: 0.9, audiences_json: '["personal"]'
  }]);
  assert.equal(chunks.length, 1);
  assert.match(chunks[0], /A &lt;major&gt; release/);
  assert.match(chunks[0], /Why it matters/);
  assert.match(chunks[0], /<i>Source: Example<\/i>/);
  assert.doesNotMatch(chunks[0], /<small>/);
});

test('supports a labeled scheduled round-up', async () => {
  const chunks = await composeDigest([{
    id: '1', title: 'Evening release', canonical_url: 'https://example.com/evening',
    excerpt: 'A company shipped a meaningful update for developers.', publisher: 'Example',
    published_at: '2026-09-07T22:00:00Z', topics_json: '["developer-infrastructure"]', score: 0.9, audiences_json: '["personal"]'
  }], undefined, 'EVENING ROUND-UP');
  assert.match(chunks[0], /NEWSFELLOW • EVENING ROUND-UP/);
});

test('composes a Discord-safe Louisiana startup radar', async () => {
  const chunks = await composeDiscordDigest([{
    id: '2', title: 'Louisiana founders open applications', canonical_url: 'https://example.com/apply',
    excerpt: 'A Louisiana founder program opened applications for its next cohort.', publisher: 'Local Source',
    published_at: '2026-09-10T10:00:00Z', topics_json: '["louisiana","funding"]', score: 1.1,
    audiences_json: '["fla"]'
  }]);
  assert.equal(chunks.length, 1);
  assert.match(chunks[0], /FOUNDERS LA • LOUISIANA STARTUP RADAR/);
  assert.match(chunks[0], /LOUISIANA • \[Louisiana founders open applications\]/);
  assert.match(chunks[0], /Why it matters/);
  assert.ok(chunks[0].length < 2000);
});
