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
  /** True when this looks paywalled/thin/failed and an archive lookup is worth trying. */
  archiveWorthChecking?: boolean;
}

export type ArchiveSource = 'wayback' | 'archive.is';

export interface ArchiveSnapshot {
  source: ArchiveSource;
  snapshotUrl: string;
  snapshotDate: string | null;
  bodyHtml: string;
  textLength: number;
}
