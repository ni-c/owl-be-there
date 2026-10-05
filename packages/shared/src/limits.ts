/**
 * The size of everything the application accepts.
 *
 * One table, read by both sides: the server rejects what is larger, and the
 * client stops typing at about the same length. Lengths count code points of
 * the cleaned text, as the schemas and the database do (see `charCount`); the
 * browser's `maxLength` counts UTF-16 units, which is never fewer, so it stops
 * typing early for an emoji. Only a character that grows when cleaned — U+0958
 * becomes two code points under NFC — can pass the browser and still be too
 * long for the server.
 *
 * The text lengths, `durationDays` and the languages are repeated as CHECK
 * constraints in the server's migrations, which never change once applied:
 * raising one needs a rebuild migration like version 2 (`db.test.ts` fails
 * until it exists).
 */
export const LIMITS = {
  title: 80,
  description: 500,
  location: 120,
  creatorName: 40,
  name: 40,
  note: 140,
  /** Candidate days per event: six months of every day, or a year of weekends. */
  days: 186,
  /** Days from the first to the last candidate day, inclusive. */
  span: 366,
  /**
   * How far ahead of today a new candidate day may lie: about five years. The
   * client counts from the visitor's local date, the server from the UTC date
   * plus one day, which is as far ahead as any time zone is.
   */
  horizon: 5 * 366,
  participants: 150,
  /** Names on a creator's list, added in one go. */
  roster: 150,
  durationDays: 14,
  passwordMin: 6,
  passwordMax: 128,
} as const;

/**
 * Days an event lives after its last change.
 *
 * Only writes count. Crab Fit extended an event's life on every read, and
 * crawlers that kept requesting old links kept those events alive forever.
 */
export const RETENTION_DAYS = 90;
