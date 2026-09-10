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
  { id: 'techcrunch', name: 'TechCrunch', feedUrl: 'https://techcrunch.com/feed/', trustWeight: 0.78, topics: ['startups', 'venture', 'ai'], audiences: ['personal'], region: 'national' },
  { id: 'ars', name: 'Ars Technica', feedUrl: 'https://feeds.arstechnica.com/arstechnica/index', trustWeight: 0.82, topics: ['technology', 'cybersecurity'], audiences: ['personal'], region: 'global' },
  { id: 'krebs', name: 'Krebs on Security', feedUrl: 'https://krebsonsecurity.com/feed/', trustWeight: 0.95, topics: ['cybersecurity'], audiences: ['personal'], region: 'global' },

  // Louisiana ecosystem reporting. Nexus Louisiana no longer exposes a working
  // feed, so it will return through a structured site adapter in a later change.
  { id: 'silicon-bayou', name: 'Silicon Bayou News', feedUrl: 'https://siliconbayounews.com/feed/', trustWeight: 0.88, topics: ['louisiana', 'startups', 'ecosystem'], audiences: ['fla'], region: 'louisiana' },
  { id: 'biz-new-orleans', name: 'Biz New Orleans', feedUrl: 'https://bizneworleans.com/feed/', trustWeight: 0.86, topics: ['louisiana', 'new-orleans', 'business', 'events'], audiences: ['fla'], region: 'louisiana' },
  { id: 'baton-rouge-business-report', name: 'Baton Rouge Business Report', feedUrl: 'https://www.businessreport.com/feed/', trustWeight: 0.88, topics: ['louisiana', 'baton-rouge', 'business', 'funding'], audiences: ['fla'], region: 'louisiana' },
  { id: 'tulane-news', name: 'Tulane News', feedUrl: 'https://news.tulane.edu/rss.xml', trustWeight: 0.9, topics: ['louisiana', 'new-orleans', 'university', 'innovation', 'events'], audiences: ['fla'], region: 'louisiana' },

  // Founder, venture, product, and technology reporting.
  { id: 'techcrunch-startups', name: 'TechCrunch Startups', feedUrl: 'https://techcrunch.com/category/startups/feed/', trustWeight: 0.8, topics: ['startups', 'funding', 'venture'], audiences: ['fla'], region: 'national' },
  { id: 'techcrunch-venture', name: 'TechCrunch Venture', feedUrl: 'https://techcrunch.com/category/venture/feed/', trustWeight: 0.8, topics: ['venture', 'funding', 'startups'], audiences: ['fla'], region: 'national' },
  { id: 'crunchbase-news', name: 'Crunchbase News', feedUrl: 'https://news.crunchbase.com/feed/', trustWeight: 0.88, topics: ['startups', 'funding', 'venture', 'markets'], audiences: ['fla'], region: 'national' },
  { id: 'venturebeat', name: 'VentureBeat', feedUrl: 'https://venturebeat.com/feed/', trustWeight: 0.82, topics: ['technology', 'ai', 'enterprise', 'startups'], audiences: ['fla'], region: 'national' },
  { id: 'y-combinator', name: 'Y Combinator', feedUrl: 'https://www.ycombinator.com/blog/rss/', trustWeight: 0.94, topics: ['startups', 'accelerators', 'founders', 'programs'], audiences: ['fla'], region: 'national' },
  { id: 'masschallenge', name: 'MassChallenge', feedUrl: 'https://masschallenge.org/feed/', trustWeight: 0.9, topics: ['accelerators', 'competitions', 'programs', 'funding'], audiences: ['fla'], region: 'national' },
  { id: 'product-hunt', name: 'Product Hunt', feedUrl: 'https://www.producthunt.com/feed', trustWeight: 0.72, topics: ['products', 'startups', 'founders'], audiences: ['fla'], region: 'national' },
  { id: 'stripe-blog', name: 'Stripe Blog', feedUrl: 'https://stripe.com/blog/feed.rss', trustWeight: 0.88, topics: ['founders', 'payments', 'business', 'technology'], audiences: ['fla'], region: 'national' },
  { id: 'mit-news-technology', name: 'MIT News', feedUrl: 'https://news.mit.edu/rss/feed', trustWeight: 0.9, topics: ['technology', 'research', 'innovation'], audiences: ['fla'], region: 'national' },
  { id: 'the-verge', name: 'The Verge', feedUrl: 'https://www.theverge.com/rss/index.xml', trustWeight: 0.76, topics: ['technology', 'products', 'ai'], audiences: ['fla'], region: 'national' },
  { id: 'wired', name: 'WIRED', feedUrl: 'https://www.wired.com/feed/rss', trustWeight: 0.82, topics: ['technology', 'business', 'science'], audiences: ['fla'], region: 'national' },
  { id: 'sifted', name: 'Sifted', feedUrl: 'https://sifted.eu/feed', trustWeight: 0.76, topics: ['startups', 'funding', 'venture', 'founders'], audiences: ['fla'], region: 'global' },
  { id: 'startup-nation', name: 'StartupNation', feedUrl: 'https://startupnation.com/feed/', trustWeight: 0.72, topics: ['startups', 'small-business', 'founders', 'programs'], audiences: ['fla'], region: 'national' },
  { id: 'sequoia-stories', name: 'Sequoia Capital Stories', feedUrl: 'https://www.sequoiacap.com/feeds/stories', trustWeight: 0.88, topics: ['founders', 'venture', 'company-building'], audiences: ['fla'], region: 'national' },
  { id: 'geekwire', name: 'GeekWire', feedUrl: 'https://www.geekwire.com/feed/', trustWeight: 0.78, topics: ['startups', 'technology', 'funding'], audiences: ['fla'], region: 'national' },
  { id: 'entrepreneur', name: 'Entrepreneur', feedUrl: 'https://www.entrepreneur.com/latest.rss', trustWeight: 0.7, topics: ['founders', 'small-business', 'startups', 'programs'], audiences: ['fla'], region: 'national' }
];
