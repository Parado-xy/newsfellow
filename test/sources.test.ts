import test from 'node:test';
import assert from 'node:assert/strict';
import { SOURCES } from '../src/config/sources.ts';

test('maintains a broad, uniquely identified FLA source registry', () => {
  const flaSources = SOURCES.filter((source) => source.audiences.includes('fla'));
  assert.ok(flaSources.length >= 18);
  assert.equal(new Set(SOURCES.map((source) => source.id)).size, SOURCES.length);
  assert.ok(flaSources.filter((source) => source.region === 'louisiana').length >= 4);
  assert.ok(flaSources.filter((source) => source.topics.some((topic) => ['accelerators', 'competitions', 'programs', 'funding'].includes(topic))).length >= 6);
});

test('does not retain the known dead Nexus and SBA feed URLs', () => {
  const urls = SOURCES.map((source) => source.feedUrl);
  assert.ok(!urls.includes('https://nexusla.org/feed/'));
  assert.ok(!urls.includes('https://www.sba.gov/rss.xml'));
});
