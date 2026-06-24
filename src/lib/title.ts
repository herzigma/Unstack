const APP_NAME = 'Unstack';

export function formatDocumentTitle(pageName?: string | null) {
  const trimmedPageName = pageName?.trim();

  return trimmedPageName ? `[${APP_NAME}] ${trimmedPageName}` : APP_NAME;
}
