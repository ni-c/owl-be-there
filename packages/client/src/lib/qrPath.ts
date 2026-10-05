import { encodeQr } from '@owl/shared';

/** A QR code as one SVG path in a viewBox with a four-module quiet zone. */
export interface QrPath {
  d: string;
  size: number;
}

/**
 * The path for `text`, or null when it does not fit in a QR code: the picture
 * is a convenience, and the link beside it still works without it.
 */
export function qrPath(text: string): QrPath | null {
  let matrix;
  try {
    matrix = encodeQr(text);
  } catch (error) {
    if (error instanceof RangeError) return null;
    throw error;
  }
  let d = '';
  matrix.modules.forEach((row, y) =>
    row.forEach((dark, x) => {
      if (dark) d += `M${x + 4} ${y + 4}h1v1h-1z`;
    })
  );
  return { d, size: matrix.size + 8 };
}
