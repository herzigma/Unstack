import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export interface ParsedArticleInput {
  domain: string;
  /** Full resolved article URL when the input includes any path; null for a bare domain/handle. */
  url: string | null;
}

/**
 * Parses user input (URL or handle) into a domain and, if the input has any path
 * segments, a full article URL to fetch directly. Any path shape is treated as a
 * candidate article link -- not just Substack's /p/<slug> convention -- since Ghost,
 * Medium, beehiiv, and homegrown blogs all use different slug conventions.
 */
export function parseArticleInput(input: string): ParsedArticleInput | null {
  input = input.trim();
  if (!input) return null;

  // Fix corrupted protocols from URL paths like https:/domain...
  if (input.startsWith("http:/") && !input.startsWith("http://")) {
    input = input.replace("http:/", "http://");
  }
  if (input.startsWith("https:/") && !input.startsWith("https://")) {
    input = input.replace("https:/", "https://");
  }

  let urlStr = input;

  // If it doesn't start with a protocol, assume it's a domain or handle
  if (!input.startsWith("http://") && !input.startsWith("https://")) {
    if (input.includes("/") || input.includes(".")) {
      urlStr = "https://" + input;
    } else {
      urlStr = `https://${input}.substack.com`;
    }
  }

  try {
    const url = new URL(urlStr);
    const domain = url.hostname;
    const hasPath = url.pathname.split("/").filter(Boolean).length > 0;

    return { domain, url: hasPath ? url.href : null };
  } catch (e) {
    return null;
  }
}
