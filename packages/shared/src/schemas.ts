import { z } from 'zod';
import { isValidISODate } from './dates.js';
import { EMOJI_KEYS } from './emoji.js';
import { ID_PATTERN } from './ids.js';
import { LIMITS } from './limits.js';
import {
  charCount,
  cleanLine,
  cleanText,
  mixesScripts,
  nameKey,
} from './text.js';
import { LANGUAGES } from './texts.js';

/*
 * Every body the API accepts and every answer it gives, as zod schemas. The
 * server parses requests with them; the client parses responses with them, so
 * a mismatch between the two shows up as a clear error instead of `undefined`
 * three components later.
 *
 * Text fields are cleaned (see `text.ts`) before their length is checked, so
 * the limit applies to what is stored, counted in code points. The raw length
 * is capped too, at four times the limit, so nobody can make the server
 * normalise a megabyte.
 */

/**
 * Text that is not empty but shows nothing: only characters that take no
 * room, such as the blank Hangul filler, which no one can tell from a space.
 */
const blank = (text: string): boolean => text !== '' && nameKey(text) === '';

/**
 * Stable names for the refinements a client words itself, carried as the
 * `params.reason` of a zod custom issue and sent on by the server as `reason`.
 */
export const ISSUE_REASON = {
  invisible: 'invisible',
  mixedScripts: 'mixed_scripts',
} as const;

export type IssueReason = (typeof ISSUE_REASON)[keyof typeof ISSUE_REASON];

const cleaned = (clean: (text: string) => string, max: number, min = 0) =>
  z
    .string()
    .max(max * 4)
    .transform(clean)
    .pipe(z.string().min(min).max(max))
    .refine((text) => !blank(text), {
      message: 'Needs a visible character',
      params: { reason: ISSUE_REASON.invisible },
    });

const line = (max: number) => cleaned(cleanLine, max);

const requiredLine = (max: number) => cleaned(cleanLine, max, 1);

const paragraph = (max: number) => cleaned(cleanText, max);

const IsoDay = z.string().refine(isValidISODate, 'Not a valid YYYY-MM-DD date');

const Id = z.string().regex(ID_PATTERN, 'Not a valid id');

const Name = requiredLine(LIMITS.name).refine((name) => !mixesScripts(name), {
  message: 'A word must not mix Latin letters with Cyrillic or Greek ones',
  params: { reason: ISSUE_REASON.mixedScripts },
});

/** A password being set. Logging in accepts any length up to the maximum. */
export const NewPassword = z
  .string()
  .max(LIMITS.passwordMax)
  .refine((value) => charCount(value.normalize('NFC')) >= LIMITS.passwordMin, {
    message: `Too small: expected at least ${LIMITS.passwordMin} characters`,
  });

const Emoji = z.enum(EMOJI_KEYS);

export const LanguageSchema = z.enum(LANGUAGES);

const DayList = z.array(IsoDay).max(LIMITS.days);

/* ------------------------------------------------------------- requests */

export const CreateEventBody = z.strictObject({
  title: requiredLine(LIMITS.title),
  description: paragraph(LIMITS.description).optional(),
  location: line(LIMITS.location).optional(),
  emoji: Emoji,
  creatorName: line(LIMITS.creatorName).optional(),
  language: LanguageSchema,
  durationDays: z.int().min(1).max(LIMITS.durationDays),
  minCount: z.int().min(1).max(LIMITS.participants).nullable().optional(),
  days: DayList.min(1),
  roster: z.array(Name).max(LIMITS.roster).optional(),
});

export const UpdateEventBody = z
  .strictObject({
    title: requiredLine(LIMITS.title).optional(),
    description: paragraph(LIMITS.description).nullable().optional(),
    location: line(LIMITS.location).nullable().optional(),
    emoji: Emoji.optional(),
    creatorName: line(LIMITS.creatorName).nullable().optional(),
    durationDays: z.int().min(1).max(LIMITS.durationDays).optional(),
    minCount: z.int().min(1).max(LIMITS.participants).nullable().optional(),
    days: DayList.min(1).optional(),
    /**
     * The candidate days the organiser started from. A new list replaces the
     * old one wholesale, so the server refuses it when the days changed since —
     * a second tab must not silently remove days, and their marks, added in
     * the first.
     */
    baseDays: DayList.optional(),
  })
  .refine((body) => body.days === undefined || body.baseDays !== undefined, {
    message: 'New days need the days they replace',
    path: ['baseDays'],
  });

export const StatusBody = z.discriminatedUnion('status', [
  z.strictObject({ status: z.literal('open') }),
  z.strictObject({ status: z.literal('closed') }),
  z.strictObject({ status: z.literal('finalized'), start: IsoDay }),
]);

export const SessionBody = z.strictObject({
  name: Name,
  password: z.string().min(1).max(LIMITS.passwordMax).optional(),
});

export const MarksBody = z.strictObject({
  baseRev: z.int().min(0),
  yes: DayList,
  maybe: DayList,
  /** The candidate days the sender knew; omitted, the save counts as having seen every day. */
  days: DayList.optional(),
  /**
   * Sent when the page is left: the days this device changed. On a stale
   * revision the server applies just these days on top of its current marks
   * instead of refusing the save.
   */
  touched: DayList.optional(),
});

export const UpdateParticipantBody = z.strictObject({
  name: Name.optional(),
  note: line(LIMITS.note).nullable().optional(),
  password: NewPassword.nullable().optional(),
});

export const RosterBody = z.strictObject({
  names: z.array(Name).min(1).max(LIMITS.roster),
});

/* ------------------------------------------------------------ responses */

const EventStatus = z.enum(['open', 'closed', 'finalized']);

const ParticipantView = z.object({
  id: Id,
  name: z.string(),
  note: z.string().nullable(),
  source: z.enum(['roster', 'self']),
  answered: z.boolean(),
  hasPassword: z.boolean(),
  rev: z.int(),
  yes: z.array(IsoDay),
  maybe: z.array(IsoDay),
  /** Days added after this person last saved. */
  unseen: z.array(IsoDay),
});

const EventView = z.object({
  id: Id,
  title: z.string(),
  description: z.string().nullable(),
  location: z.string().nullable(),
  emoji: Emoji,
  creatorName: z.string().nullable(),
  language: LanguageSchema,
  durationDays: z.int(),
  minCount: z.int().nullable(),
  status: EventStatus,
  finalStart: IsoDay.nullable(),
  finalEnd: IsoDay.nullable(),
  expiresOn: IsoDay,
  version: z.int(),
  days: z.array(IsoDay),
});

export const EventSnapshot = z.object({
  event: EventView,
  participants: z.array(ParticipantView),
});

export const CreateEventResponse = z.object({ id: Id, adminToken: z.string() });

export const SessionResponse = z.object({
  participantId: Id,
  token: z.string(),
  created: z.boolean(),
});

export const MarksResponse = z.object({
  rev: z.int(),
  version: z.int(),
  /** The marks now held, present when the server merged a stale save. */
  yes: z.array(IsoDay).optional(),
  maybe: z.array(IsoDay).optional(),
});

export const MarksConflict = z.object({
  error: z.literal('stale'),
  rev: z.int(),
  yes: z.array(IsoDay),
  maybe: z.array(IsoDay),
});

export const UpdateParticipantResponse = z.object({
  token: z.string().nullable(),
});

export const InstanceInfo = z.object({
  version: z.string(),
  creationEnabled: z.boolean(),
  retentionDays: z.int(),
  logRetentionDays: z.int().nullable(),
  backupRetentionDays: z.int().nullable(),
  operatorName: z.string().nullable(),
  operatorAddress: z.string().nullable(),
  operatorContact: z.string().nullable(),
  imprintUrl: z.string().nullable(),
  /** The canonical origin; links to share are built on it, whatever domain served the page. */
  publicUrl: z.url(),
});

export const ApiErrorBody = z.object({
  error: z.string(),
  message: z.string().optional(),
});

export type CreateEventInput = z.input<typeof CreateEventBody>;
export type UpdateEventInput = z.input<typeof UpdateEventBody>;
export type StatusInput = z.input<typeof StatusBody>;
export type EventSnapshotData = z.infer<typeof EventSnapshot>;
export type EventStatusData = z.infer<typeof EventStatus>;
export type EventViewData = z.infer<typeof EventView>;
export type ParticipantViewData = z.infer<typeof ParticipantView>;
export type InstanceInfoData = z.infer<typeof InstanceInfo>;
