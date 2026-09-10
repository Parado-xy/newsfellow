import test from 'node:test';
import assert from 'node:assert/strict';
import { analyzeOpportunity, urgencyLabel } from '../src/news/opportunity.ts';

test('extracts only explicit, actionable opportunity details', () => {
  const result = analyzeOpportunity({
    title: 'Louisiana founder grant applications open',
    url: 'https://example.com/details',
    excerpt: 'Applications close September 28, 2026. The grant is open to Louisiana technology startups. The program is virtual.',
    publishedAt: '2026-09-10T10:00:00Z',
    relatedUrls: ['https://example.com/apply/start']
  });
  assert.equal(result.type, 'grant');
  assert.equal(result.deadlineDate, '2026-09-28');
  assert.match(result.eligibility ?? '', /open to Louisiana technology startups/i);
  assert.equal(result.location, undefined);
  assert.equal(result.participationMode, 'virtual');
  assert.equal(result.applicationUrl, 'https://example.com/apply/start');
});

test('does not treat an uncued date as an application deadline', () => {
  const result = analyzeOpportunity({
    title: 'Founder workshop announced', url: 'https://example.com/event',
    excerpt: 'The workshop takes place September 28, 2026 in Baton Rouge.', publishedAt: '2026-09-10T10:00:00Z'
  });
  assert.equal(result.type, 'event');
  assert.equal(result.deadlineDate, undefined);
  assert.equal(result.location, 'Baton Rouge');
});

test('recognizes rolling applications and deadline urgency', () => {
  const result = analyzeOpportunity({
    title: 'Accelerator applications', url: 'https://example.com/accelerator',
    excerpt: 'Applications are accepted on a rolling basis.', publishedAt: '2026-09-10T10:00:00Z'
  });
  assert.equal(result.rolling, true);
  assert.equal(urgencyLabel(result, new Date('2026-09-10T12:00:00Z')), 'ROLLING');
  assert.equal(urgencyLabel({ deadlineDate: '2026-09-15', rolling: false }, new Date('2026-09-10T12:00:00Z')), 'CLOSING SOON');
  assert.equal(urgencyLabel({ deadlineDate: '2026-08-01', rolling: false }, new Date('2026-09-10T12:00:00Z')), 'EXPIRED');
});
