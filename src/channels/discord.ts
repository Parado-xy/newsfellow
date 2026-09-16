import type { DiscordRoute, Env } from '../types.ts';
import { urgencyLabel } from '../news/opportunity.ts';
import type { ChannelFormatter, ChannelTransport, DigestContent } from './types.ts';

function escapeDiscord(value: string): string {
  return value.replace(/([\\`*_{}\[\]()#+\-.!|>])/g, '\\$1');
}

function formatDeadline(value: string): string {
  return new Intl.DateTimeFormat('en-US', {
    month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC'
  }).format(new Date(`${value}T12:00:00Z`));
}

function labels(content: DigestContent['stories'][number], now: Date): string {
  const { story } = content;
  const topics = JSON.parse(story.topics_json) as string[];
  const opportunity = story.opportunity_type && story.opportunity_type !== 'news'
    ? story.opportunity_type.toUpperCase() : undefined;
  const urgency = urgencyLabel({ deadlineDate: story.deadline_date ?? undefined, rolling: Boolean(story.is_rolling) }, now);
  const ageHours = (now.getTime() - Date.parse(story.published_at)) / 3_600_000;
  const freshness = !urgency && ageHours >= 0 && ageHours <= 48 ? 'NEW' : undefined;
  const values = [urgency ?? freshness, opportunity];
  if (topics.includes('louisiana')) values.push('LOUISIANA');
  return values.filter(Boolean).join(' • ') || 'FOUNDER RADAR';
}

export const discordFormatter: ChannelFormatter = {
  digest(content) {
    if (!content.stories.length) return [];
    const sections = content.stories.map((item) => {
      const { story, summary } = item;
      const fields: string[] = [];
      if (story.deadline_date) fields.push(`**Deadline:** ${formatDeadline(story.deadline_date)}`);
      if (story.eligibility) fields.push(`**Eligibility:** ${escapeDiscord(story.eligibility)}`);
      if (story.opportunity_location) fields.push(`**Location:** ${escapeDiscord(story.opportunity_location)}`);
      if (story.participation_mode) fields.push(`**Format:** ${escapeDiscord(story.participation_mode)}`);
      if (story.application_url) fields.push(`**Apply:** [Direct application](${story.application_url})`);
      if ((story.cluster_source_count ?? 1) > 1) fields.push(`**Coverage:** ${story.cluster_source_count} reports`);
      const actionable = fields.length ? `\n\n${fields.join('\n')}` : '';
      return `**${labels(item, new Date())} • [${escapeDiscord(story.title)}](${story.canonical_url})**\n${escapeDiscord(summary.whatHappened)}${actionable}\n\n**Why it matters:** ${escapeDiscord(summary.whyItMatters)}\n*Source: ${escapeDiscord(story.publisher)}*`;
    });
    const chunks: string[] = [];
    let current = `**FOUNDERS LA • ${content.heading}**\n*${content.description ?? 'Useful news, opportunities, and ecosystem updates for Louisiana builders.'}*\n\n`;
    for (const section of sections) {
      if ((current + section).length > 1900) { chunks.push(current.trim()); current = ''; }
      current += `${section}\n\n`;
    }
    if (current.trim()) chunks.push(current.trim());
    return chunks;
  },
  status: () => { throw new Error('Discord does not support status commands'); },
  operations: () => { throw new Error('Discord does not support operations commands'); },
  collectionFooter: (sourcesOk, inserted) => `*${sourcesOk} sources checked • ${inserted} new stories*`,
  start: () => { throw new Error('Discord does not support start commands'); },
  unknownCommand: () => { throw new Error('Discord does not support commands'); },
  preparingBrief: () => { throw new Error('Discord does not support brief commands'); },
  commandFailure: () => { throw new Error('Discord does not support commands'); },
  monitoringAlert: () => { throw new Error('Discord does not support monitoring alerts'); }
};

export function createDiscordTransport(env: Env, route: DiscordRoute): ChannelTransport {
  const webhookUrl = route === 'opportunities' ? env.DISCORD_OPPORTUNITIES_WEBHOOK_URL : env.DISCORD_NEWS_WEBHOOK_URL;
  return {
    id: 'discord',
    async send(_destination, message) {
      if (!webhookUrl) throw new Error(`DISCORD_${route === 'opportunities' ? 'OPPORTUNITIES' : 'NEWS'}_WEBHOOK_URL is not configured`);
      for (let attempt = 0; attempt < 3; attempt++) {
        const response = await fetch(webhookUrl, {
          method: 'POST', headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ content: message, username: route === 'opportunities' ? 'FLA Opportunities' : 'FLA Founder News', allowed_mentions: { parse: [] } })
        });
        if (response.ok) return;
        if (response.status === 429 && attempt < 2) {
          const retry: { retry_after?: number } = await response.json<{ retry_after?: number }>().catch(() => ({}));
          await new Promise((resolve) => setTimeout(resolve, Math.min(5_000, Math.max(250, retry.retry_after ?? 1_000))));
          continue;
        }
        throw new Error(`Discord webhook failed: ${response.status} ${(await response.text()).slice(0, 300)}`);
      }
    }
  };
}
