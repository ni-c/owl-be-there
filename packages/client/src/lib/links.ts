/**
 * The link to an event, on the canonical origin when the instance has named
 * one. An instance can answer on several domains (an old one keeps working
 * after a move); links people pass on should all carry the current one.
 * Until `/api/instance` has answered, the page's own origin stands in.
 */
export function eventLink(
  publicUrl: string | null,
  id: string,
  currentOrigin: string
): string {
  return new URL(`/e/${id}`, publicUrl ?? currentOrigin).href;
}
