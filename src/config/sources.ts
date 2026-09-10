import type { Source } from '../types.ts';

// Start small and curated. A failing feed is skipped without blocking the brief.
export const SOURCES: Source[] = [
  { id: 'openai', name: 'OpenAI News', feedUrl: 'https://openai.com/news/rss.xml', trustWeight: 1.0, topics: ['ai'], audiences: ['personal'], region: 'global' },
  { id: 'cloudflare', name: 'Cloudflare Blog', feedUrl: 'https://blog.cloudflare.com/rss/', trustWeight: 0.95, topics: ['cloud', 'cybersecurity', 'developer-infrastructure'], audiences: ['personal'], region: 'global' },
  { id: 'github-changelog', name: 'GitHub Changelog', feedUrl: 'https://github.blog/changelog/feed/', trustWeight: 0.95, topics: ['developer-infrastructure'], audiences: ['personal'], region: 'global' },
  { id: 'aws-whats-new', name: 'AWS What’s New', feedUrl: 'https://aws.amazon.com/about-aws/whats-new/recent/feed/', trustWeight: 0.9, topics: ['cloud', 'developer-infrastructure'], audiences: ['personal'], region: 'global' },
  { id: 'google-ai', name: 'Google AI Blog', feedUrl: 'https://blog.google/technology/ai/rss/', trustWeight: 0.95, topics: ['ai'], audiences: ['personal'], region: 'global' },
  { id: 'microsoft-devblogs', name: 'Microsoft Developer Blogs', feedUrl: 'https://devblogs.microsoft.com/feed/', trustWeight: 0.9, topics: ['developer-infrastructure', 'ai'], audiences: ['personal'], region: 'global' },
  { id: 'rust-blog', name: 'Rust Blog', feedUrl: 'https://blog.rust-lang.org/feed.xml', trustWeight: 1.0, topics: ['rust', 'systems'], audiences: ['personal'], region: 'global' },
  { id: 'techcrunch', name: 'TechCrunch', feedUrl: 'https://techcrunch.com/feed/', trustWeight: 0.78, topics: ['startups', 'venture', 'ai'], audiences: ['personal', 'fla'], region: 'national' },
  { id: 'ars', name: 'Ars Technica', feedUrl: 'https://feeds.arstechnica.com/arstechnica/index', trustWeight: 0.82, topics: ['technology', 'cybersecurity'], audiences: ['personal'], region: 'global' },
  { id: 'krebs', name: 'Krebs on Security', feedUrl: 'https://krebsonsecurity.com/feed/', trustWeight: 0.95, topics: ['cybersecurity'], audiences: ['personal'], region: 'global' },

  // FLA starts with a small Louisiana-first source set. Individual feed failures
  // are isolated by the collector and surfaced in structured logs.
  { id: 'nexus-louisiana', name: 'Nexus Louisiana', feedUrl: 'https://nexusla.org/feed/', trustWeight: 1.0, topics: ['louisiana', 'startups', 'events', 'funding'], audiences: ['fla'], region: 'louisiana' },
  { id: 'silicon-bayou', name: 'Silicon Bayou News', feedUrl: 'https://siliconbayounews.com/feed/', trustWeight: 0.88, topics: ['louisiana', 'startups', 'ecosystem'], audiences: ['fla'], region: 'louisiana' },
  { id: 'sba-news', name: 'U.S. Small Business Administration', feedUrl: 'https://www.sba.gov/rss.xml', trustWeight: 0.95, topics: ['small-business', 'funding', 'policy'], audiences: ['fla'], region: 'national' }
];
