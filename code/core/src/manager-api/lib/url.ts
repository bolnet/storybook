const parseSerializedParam = (param: string) =>
  Object.fromEntries(
    param
      .split(';')
      .map((pair) => pair.split(':'))
      // Encoding values ensures we don't break already encoded args/globals but also don't encode our own special characters like ; and :.
      .map(([key, value]) => [key, encodeURIComponent(value)])
      .filter(([key]) => key)
  );

export const mergeSerializedParams = (params: string, extraParams: string): string => {
  const pairs = parseSerializedParam(params);
  const extra = parseSerializedParam(extraParams);
  return Object.entries({ ...pairs, ...extra })
    .map(([key, value]) => `${key}:${value}`)
    .join(';');
};

export const buildNavigationUrl = (
  path: string,
  queryParams: Record<string, string | null | undefined> = {}
): string => {
  const params = Object.entries(queryParams)
    .filter(([k, v]) => k !== 'path' && v !== null && v !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([k, v]) => `${k}=${v}`);
  return [path, ...params].join('&');
};
