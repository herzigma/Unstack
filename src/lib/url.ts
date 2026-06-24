interface LocationParts {
  pathname: string;
  search: string;
  hash: string;
}

export function getQueryStrippedPath(location: LocationParts) {
  if (!location.search) {
    return null;
  }

  return `${location.pathname}${location.hash}`;
}
