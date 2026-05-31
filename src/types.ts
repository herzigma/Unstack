export interface SubstackAuthor {
  id: number;
  name: string;
  photo_url?: string;
  twitter_screen_name?: string;
}

export interface SubstackPostItem {
  id: number;
  title: string;
  subtitle?: string;
  slug: string;
  post_date: string;
  audience: string;
  canonical_url: string;
  description: string;
  cover_image?: string;
  publishedBylines?: SubstackAuthor[];
  type: string;
  body_html?: string; // Sometimes present in list view
}

export interface SubstackPostDetail extends SubstackPostItem {
  body_html: string;
  podcast_url?: string;
  videoUpload?: any;
}
