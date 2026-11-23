/**
 * Parse a successful HTTP response body as JSON without throwing on empty bodies.
 * Empty / whitespace-only bodies become `{}` so callers that ignore the result
 * (e.g. POST /operations/:id/reset-clinical) do not fail with
 * "Failed to execute 'json' on 'Response': Unexpected end of JSON input".
 */
export function parseSuccessJsonText<T>(text: string): T {
  const trimmed = text.trim();
  if (!trimmed) return {} as T;
  return JSON.parse(trimmed) as T;
}
