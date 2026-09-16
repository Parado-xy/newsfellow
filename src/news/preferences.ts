import type { ChannelId } from '../channels/types.ts';
import type { Env, NewsAudience } from '../types.ts';

export type PreferenceSignalType = 'topic' | 'entity' | 'event_type';

export interface AudiencePreference {
  signalType: PreferenceSignalType;
  value: string;
  weight: number;
  source: string;
}

function normalize(value: string): string {
  return value.toLowerCase().trim().replace(/[^a-z0-9+#. -]/g, '').replace(/\s+/g, '-').slice(0, 80);
}

export async function loadPreferences(env: Env, audience: NewsAudience): Promise<AudiencePreference[]> {
  const result = await env.DB.prepare(`SELECT signal_type, signal_value, weight, source FROM audience_preferences
    WHERE audience = ? ORDER BY ABS(weight) DESC, signal_value ASC`).bind(audience)
    .all<{ signal_type: PreferenceSignalType; signal_value: string; weight: number; source: string }>();
  return result.results.map((row) => ({ signalType: row.signal_type, value: row.signal_value, weight: row.weight, source: row.source }));
}

export async function adjustTopicPreference(
  env: Env,
  audience: NewsAudience,
  topicInput: string,
  direction: 'more' | 'less',
  channel: ChannelId
): Promise<AudiencePreference> {
  const value = normalize(topicInput);
  if (!value || value.length < 2) throw new Error('A topic is required');
  const delta = direction === 'more' ? 0.2 : -0.2;
  await env.DB.prepare(`INSERT INTO audience_preferences (audience, signal_type, signal_value, weight, source)
    VALUES (?, 'topic', ?, ?, 'explicit') ON CONFLICT(audience, signal_type, signal_value) DO UPDATE SET
    weight = MAX(-1, MIN(1, audience_preferences.weight + excluded.weight)), source = 'explicit', updated_at = CURRENT_TIMESTAMP`)
    .bind(audience, value, delta).run();
  await env.DB.prepare(`INSERT INTO story_feedback
    (audience, feedback_type, signal_type, signal_value, weight_delta, channel) VALUES (?, ?, 'topic', ?, ?, ?)`)
    .bind(audience, direction, value, delta, channel).run();
  const row = await env.DB.prepare(`SELECT weight, source FROM audience_preferences
    WHERE audience = ? AND signal_type = 'topic' AND signal_value = ?`).bind(audience, value)
    .first<{ weight: number; source: string }>();
  return { signalType: 'topic', value, weight: row?.weight ?? delta, source: row?.source ?? 'explicit' };
}
