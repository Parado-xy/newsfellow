import type { DigestContent } from '../channels/types.ts';
import type { StoredStory } from '../types.ts';
import { extractiveSummary, type Summarizer } from './summarize.ts';

export async function prepareDigest(
  stories: StoredStory[],
  summarize: Summarizer = async (title, excerpt, topics) => extractiveSummary(title, excerpt, topics),
  heading = 'TECH BRIEF',
  description?: string,
  emptyMessage?: string
): Promise<DigestContent> {
  return {
    heading,
    description,
    emptyMessage,
    stories: await Promise.all(stories.map(async (story) => ({
      story,
      summary: await summarize(story.title, story.excerpt, JSON.parse(story.topics_json) as string[], {
        subjectId: story.cluster_id ?? story.id,
        clusterContext: story.cluster_context
      })
    })))
  };
}
