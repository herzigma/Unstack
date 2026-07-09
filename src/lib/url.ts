interface LocationParts {
  pathname: string;
  search: string;
  hash: string;
}

const QUERY_ALLOWED_PATHS = new Set(['/share-target']);

export function getQueryStrippedPath(location: LocationParts) {
  if (!location.search || QUERY_ALLOWED_PATHS.has(location.pathname)) {
    return null;
  }

  return `${location.pathname}${location.hash}`;
}

export function getSharedArticleInput(search: string) {
  const params = new URLSearchParams(search);
  const candidates = [params.get('url'), params.get('text'), params.get('title')];

  for (const candidate of candidates) {
    const value = candidate?.trim();
    if (!value) {
      continue;
    }

    const urlMatch = value.match(/https?:\/\/\S+/);
    return urlMatch ? urlMatch[0] : value;
  }

  return null;
}
