export function resolveAuthRedirectUrl(baseUrl: string, currentHref: string) {
  return new URL(baseUrl, currentHref).toString();
}
