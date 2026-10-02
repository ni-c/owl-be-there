/**
 * Ids are 12 characters of base58 — about 70 bits. An event id is the key to
 * the event, so it has to be unguessable; base58 leaves out `0`, `O`, `I` and
 * `l`, so an id read aloud or typed from a screenshot survives the trip.
 */
export const BASE58 =
  '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';

export const ID_LENGTH = 12;

export const ID_PATTERN = /^[1-9A-HJ-NP-Za-km-z]{12}$/;

export function isId(value: string): boolean {
  return ID_PATTERN.test(value);
}

/**
 * A new id from a source of uniform random integers in `[0, max)` — the
 * server passes `crypto.randomInt`, which is uniform by construction, so no
 * character is likelier than another.
 */
export function makeId(randomInt: (max: number) => number): string {
  let id = '';
  for (let index = 0; index < ID_LENGTH; index += 1) {
    id += BASE58[randomInt(BASE58.length)];
  }
  return id;
}
