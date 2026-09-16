import type { NewsAudience, StoredStory } from '../types.ts';
import type { Summary } from '../news/summarize.ts';

export type ChannelId = 'telegram' | 'discord' | 'whatsapp';
export type CommandName = 'start' | 'brief' | 'weekly' | 'status' | 'report' | 'preferences' | 'more' | 'less' | 'unknown';

export interface InboundCommand {
  channel: ChannelId;
  destination: string;
  sender: string;
  command: CommandName;
  rawCommand: string;
  arguments: string[];
  eventId: string;
}

export interface DigestStory {
  story: StoredStory;
  summary: Summary;
}

export interface DigestContent {
  heading: string;
  description?: string;
  emptyMessage?: string;
  stories: DigestStory[];
}

export interface StatusContent {
  storedStories: number;
  lastCollection: string;
  summarizationMode: string;
  roundups: string;
}

export interface OperationsContent {
  collection: string;
  delivery: string;
  failedDeliveries24h: number;
  unhealthySources: Array<{ name: string; failures: number }>;
  aiHealth: string;
  semanticHealth: string;
  personalizationHealth: string;
}

export interface DeliveryStatusEvent {
  kind: 'delivery_status';
  channel: ChannelId;
  externalMessageId: string;
  status: 'accepted' | 'sent' | 'delivered' | 'read' | 'failed' | 'unknown';
  occurredAt?: string;
  error?: string;
}

export type ChannelWebhookEvent = InboundCommand | DeliveryStatusEvent;

export interface InboundChannelAdapter {
  parseWebhook(payload: unknown): ChannelWebhookEvent[];
}

export interface ChannelFormatter {
  digest(content: DigestContent): string[];
  status(content: StatusContent): string;
  operations(content: OperationsContent): string;
  collectionFooter(sourcesOk: number, inserted: number): string;
  start(): string;
  unknownCommand(): string;
  preparingBrief(): string;
  preparingWeekly(): string;
  preferences(items: Array<{ value: string; weight: number }>): string;
  preferenceUpdated(value: string, weight: number): string;
  commandFailure(): string;
  monitoringAlert(title: string, detail: string, runId?: string): string;
}

export interface ChannelTransport {
  readonly id: ChannelId;
  send(destination: string, message: string): Promise<void>;
}

export interface DeliveryTarget {
  audience: NewsAudience;
  destination: string;
  formatter: ChannelFormatter;
  transport: ChannelTransport;
}
