export interface Env {
  DB: D1Database;
  AI: Ai;
  TELEGRAM_BOT_TOKEN: string;
  TELEGRAM_WEBHOOK_SECRET: string;
  TELEGRAM_OWNER_CHAT_ID: string;
  OWNER_TIMEZONE?: string;
  MAX_DIGEST_STORIES?: string;
  AI_SUMMARIZER_ENABLED?: string;
  DISCORD_NEWS_WEBHOOK_URL?: string;
  DISCORD_OPPORTUNITIES_WEBHOOK_URL?: string;
  DISCORD_ADMIN_SECRET?: string;
  FLA_NEWS_ENABLED?: string;
  FLA_TIMEZONE?: string;
  FLA_MAX_DIGEST_STORIES?: string;
}

export type NewsAudience = 'personal' | 'fla';
export type DiscordRoute = 'news' | 'opportunities';

export interface Source {
  id: string;
  name: string;
  feedUrl: string;
  trustWeight: number;
  topics: string[];
  audiences: NewsAudience[];
  region?: 'louisiana' | 'national' | 'global';
}

export interface FeedEntry {
  title: string;
  url: string;
  excerpt: string;
  publishedAt: string;
  author?: string;
  relatedUrls?: string[];
}

export type OpportunityType = 'grant' | 'accelerator' | 'competition' | 'program' | 'event' | 'news';
export type ParticipationMode = 'in-person' | 'virtual' | 'hybrid';

export interface OpportunityMetadata {
  type: OpportunityType;
  confidence: number;
  deadlineDate?: string;
  deadlineText?: string;
  eligibility?: string;
  location?: string;
  participationMode?: ParticipationMode;
  applicationUrl?: string;
  rolling: boolean;
}

export interface StoryCandidate extends FeedEntry {
  id: string;
  sourceId: string;
  publisher: string;
  canonicalUrl: string;
  fingerprint: string;
  topics: string[];
  score: number;
  audiences: NewsAudience[];
  opportunity: OpportunityMetadata;
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
  audiences_json: string;
  opportunity_type: OpportunityType | null;
  deadline_date: string | null;
  deadline_text: string | null;
  eligibility: string | null;
  opportunity_location: string | null;
  participation_mode: ParticipationMode | null;
  application_url: string | null;
  opportunity_confidence: number;
  is_rolling: number;
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
