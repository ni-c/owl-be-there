/** The request header that carries the organiser's key to an event. */
export const ADMIN_HEADER = 'x-admin-token';

/** The request header that carries a participant's token. */
export const PARTICIPANT_HEADER = 'x-participant-token';

/** The ETag of the event snapshot at `version`. */
export const snapshotEtag = (version: number): string => `"v${version}"`;
