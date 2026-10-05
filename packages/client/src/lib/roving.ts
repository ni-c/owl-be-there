/**
 * The option an arrow key moves to in a row of radios or tabs, wrapping at
 * both ends; null for any other key. Up and down follow left and right, as in
 * a native radio group.
 */
export function arrowTarget(
  key: string,
  index: number,
  length: number
): number | null {
  if (length === 0) return null;
  if (key === 'ArrowRight' || key === 'ArrowDown') return (index + 1) % length;
  if (key === 'ArrowLeft' || key === 'ArrowUp')
    return (index - 1 + length) % length;
  return null;
}
