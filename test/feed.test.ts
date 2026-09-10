import test from 'node:test';
import assert from 'node:assert/strict';
import { canonicalizeUrl, parseFeed, titleFingerprint } from '../src/news/feed.ts';

test('parses RSS and strips markup', () => {
  const xml = `<rss><channel><item><title><![CDATA[New &amp; useful]]></title><link>https://example.com/post?utm_source=x</link><description><![CDATA[<p>A useful first sentence.</p><a href="https://example.com/apply">Apply</a>]]></description><pubDate>Sun, 07 Sep 2026 10:00:00 GMT</pubDate></item></channel></rss>`;
  const [entry] = parseFeed(xml);
  assert.equal(entry.title, 'New & useful');
  assert.equal(entry.excerpt, 'A useful first sentence. Apply');
  assert.equal(entry.url, 'https://example.com/post?utm_source=x');
  assert.deepEqual(entry.relatedUrls, ['https://example.com/apply']);
});

test('parses Atom links', () => {
  const xml = `<feed><entry><title>Release</title><link rel="alternate" href="https://example.com/release"/><summary>Details here.</summary><updated>2026-09-07T10:00:00Z</updated></entry></feed>`;
  assert.equal(parseFeed(xml)[0].url, 'https://example.com/release');
});

test('canonicalizes tracking URLs and fingerprints titles', () => {
  assert.equal(canonicalizeUrl('https://example.com/x/?utm_medium=email&id=2#top'), 'https://example.com/x?id=2');
  assert.equal(titleFingerprint('The Future of AI: A New Era'), 'future ai new era');
});
