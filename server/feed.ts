import * as substack from "./platforms/substack";
import * as ghost from "./platforms/ghost";
import * as medium from "./platforms/medium";
import type { NormalizedPostSummary, Platform } from "../src/types";

export interface FeedResult {
  platform: Platform | null;
  posts: NormalizedPostSummary[];
}

export async function getFeed(domain: string): Promise<FeedResult> {
  const substackPosts = await substack.fetchFeed(domain);
  if (substackPosts) return { platform: "substack", posts: substackPosts };

  const ghostPosts = await ghost.fetchFeed(domain);
  if (ghostPosts) return { platform: "ghost", posts: ghostPosts };

  const mediumPosts = await medium.fetchFeed(domain);
  if (mediumPosts) return { platform: "medium", posts: mediumPosts };

  return { platform: null, posts: [] };
}
