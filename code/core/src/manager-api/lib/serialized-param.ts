export const parseSerializedParam = (param: string): Record<string, string> =>
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
