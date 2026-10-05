/**
 * What the share sheet gets. The invitation already contains the link, and
 * some platforms join `text` and `url` into one message, so `url` is added only
 * for a text that lacks it.
 */
export function shareData(
  title: string,
  text: string,
  url: string
): { title: string; text: string; url?: string } {
  return text.includes(url) ? { title, text } : { title, text, url };
}
