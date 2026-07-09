export type Platform = 'substack' | 'ghost' | 'medium' | 'generic';

export interface NormalizedAuthor {
  id: string;
  name: string;
  photoUrl?: string;
}

export interface NormalizedPostSummary {
  id: string;
  title: string;
  subtitle?: string;
  publishedAt: string;
  isPaywalled: boolean;
  canonicalUrl: string;
  description?: string;
  coverImage?: string;
  authors?: NormalizedAuthor[];
  platform: Platform;
}

export interface NormalizedPostDetail extends NormalizedPostSummary {
  bodyHtml: string;
  isPreviewOnly: boolean;
  siteName?: string;
}
