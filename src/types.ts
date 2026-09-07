export interface Env {
  DB: D1Database;
  AI: Ai;
  TELEGRAM_BOT_TOKEN: string;
  TELEGRAM_WEBHOOK_SECRET: string;
  TELEGRAM_OWNER_CHAT_ID: string;
  OWNER_TIMEZONE?: string;
  MAX_DIGEST_STORIES?: string;
  AI_SUMMARIZER_ENABLED?: string;
}

export interface Source {
  id: string;
  name: string;
  feedUrl: string;
  trustWeight: number;
  topics: string[];
}

export interface FeedEntry {
  title: string;
  url: string;
  excerpt: string;
  publishedAt: string;
  author?: string;
}

export interface StoryCandidate extends FeedEntry {
  id: string;
  sourceId: string;
  publisher: string;
  canonicalUrl: string;
  fingerprint: string;
  topics: string[];
  score: number;
}

export interface StoredStory {
  id: string;
  title: string;
  canonical_url: string;
  excerpt: string;
  publisher: string;
  published_at: string;
  topics_json: string;
  score: number;
}

export interface TelegramUpdate {
  update_id: number;
  message?: { message_id: number; chat: { id: number }; text?: string };
  callback_query?: {
    id: string;
    data?: string;
    message?: { message_id: number; chat: { id: number } };
  };
}
