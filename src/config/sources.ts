import type { Source } from '../types.ts';

// Start small and curated. A failing feed is skipped without blocking the brief.
export const SOURCES: Source[] = [
  { id: 'openai', name: 'OpenAI News', feedUrl: 'https://openai.com/news/rss.xml', trustWeight: 1.0, topics: ['ai'] },
  { id: 'cloudflare', name: 'Cloudflare Blog', feedUrl: 'https://blog.cloudflare.com/rss/', trustWeight: 0.95, topics: ['cloud', 'cybersecurity', 'developer-infrastructure'] },
  { id: 'github-changelog', name: 'GitHub Changelog', feedUrl: 'https://github.blog/changelog/feed/', trustWeight: 0.95, topics: ['developer-infrastructure'] },
  { id: 'aws-whats-new', name: 'AWS What’s New', feedUrl: 'https://aws.amazon.com/about-aws/whats-new/recent/feed/', trustWeight: 0.9, topics: ['cloud', 'developer-infrastructure'] },
  { id: 'google-ai', name: 'Google AI Blog', feedUrl: 'https://blog.google/technology/ai/rss/', trustWeight: 0.95, topics: ['ai'] },
  { id: 'microsoft-devblogs', name: 'Microsoft Developer Blogs', feedUrl: 'https://devblogs.microsoft.com/feed/', trustWeight: 0.9, topics: ['developer-infrastructure', 'ai'] },
  { id: 'rust-blog', name: 'Rust Blog', feedUrl: 'https://blog.rust-lang.org/feed.xml', trustWeight: 1.0, topics: ['rust', 'systems'] },
  { id: 'techcrunch', name: 'TechCrunch', feedUrl: 'https://techcrunch.com/feed/', trustWeight: 0.78, topics: ['startups', 'venture', 'ai'] },
  { id: 'ars', name: 'Ars Technica', feedUrl: 'https://feeds.arstechnica.com/arstechnica/index', trustWeight: 0.82, topics: ['technology', 'cybersecurity'] },
  { id: 'krebs', name: 'Krebs on Security', feedUrl: 'https://krebsonsecurity.com/feed/', trustWeight: 0.95, topics: ['cybersecurity'] }
];
