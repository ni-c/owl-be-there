/**
 * The size of everything the application accepts.
 *
 * One table, read by both sides: the server rejects what is larger, and the
 * client stops typing at the same length, so the two never disagree about what
 * fits. Lengths count UTF-16 code units, which is what both `maxLength` in the
 * browser and `string.length` measure.
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
  /** How far ahead of today a new candidate day may lie: about five years. */
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
