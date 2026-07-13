import type { NormalizedPostDetail } from "../src/types";
import { parseArticleInput } from "../src/lib/utils";

export function articleUrlFromPath(pathname: string): string | null {
  let input: string;
  try {
    input = decodeURIComponent(pathname.replace(/^\/+/, ""));
  } catch {
    return null;
  }

  const firstSegment = input.split("/")[0];
  if (!firstSegment.includes(".")) return null;

  const parsed = parseArticleInput(input);
  return parsed?.url || null;
}

/** Article previews are part of the HTML contract, independent of user-agent. */
export function articleUrlForPreviewRequest(method: string, pathname: string): string | null {
  return method.toUpperCase() === "GET" ? articleUrlFromPath(pathname) : null;
}

function escapeAttribute(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function meta(property: string, content: string, useName = false): string {
  const attribute = useName ? "name" : "property";
  return `<meta ${attribute}="${property}" content="${escapeAttribute(content)}" />`;
}

function publicationName(post: NormalizedPostDetail): string {
  if (post.siteName) return post.siteName;

  try {
    const hostname = new URL(post.canonicalUrl).hostname.replace(/^www\./i, "");
    return hostname;
  } catch {
    return "Original publication";
  }
}

export function injectSocialPreview(
  html: string,
  post: NormalizedPostDetail,
  unstackUrl: string,
): string {
  const description = post.description || post.subtitle || `Read ${post.title} in Unstack.`;
  const publication = publicationName(post);
  const previewTitle = `[Unstack] ${post.title} | ${publication}`;
  const tags = [
    `<link rel="canonical" href="${escapeAttribute(unstackUrl)}" />`,
    '<meta property="og:type" content="article" />',
    meta("og:site_name", publication),
    meta("og:title", previewTitle),
    meta("og:description", description),
    meta("og:url", unstackUrl),
    meta("twitter:card", post.coverImage ? "summary_large_image" : "summary", true),
    meta("twitter:title", previewTitle, true),
    meta("twitter:description", description, true),
  ];

  if (post.coverImage) {
    tags.push(meta("og:image", post.coverImage), meta("twitter:image", post.coverImage, true));
  }
  if (post.publishedAt) {
    tags.push(meta("article:published_time", post.publishedAt));
  }

  // Remove the static homepage cards so crawlers never select them before the
  // article-specific tags (several unfurlers use the first matching property).
  const withoutStaticSocialTags = html.replace(
    /\s*<meta\s+[^>]*(?:property|name)=["'](?:og:|twitter:)[^"']*["'][^>]*\/?\s*>/gi,
    "",
  );
  const articleDescription = `<meta name="description" content="${escapeAttribute(description)}" />`;
  const withDescription = /<meta\s+[^>]*name=["']description["'][^>]*>/i.test(withoutStaticSocialTags)
    ? withoutStaticSocialTags.replace(
        /<meta\s+[^>]*name=["']description["'][^>]*>/i,
        articleDescription,
      )
    : withoutStaticSocialTags.replace("</head>", `  ${articleDescription}\n</head>`);
  const title = `<title>${escapeAttribute(previewTitle)}</title>`;
  const withTitle = /<title[^>]*>.*?<\/title>/is.test(withDescription)
    ? withDescription.replace(/<title[^>]*>.*?<\/title>/is, title)
    : withDescription.replace("</head>", `  ${title}\n</head>`);

  return withTitle.replace("</head>", `  <!-- Dynamic article preview -->\n  ${tags.join("\n  ")}\n</head>`);
}
