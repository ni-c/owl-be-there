import {
  ApiErrorBody,
  CreateEventResponse,
  EventSnapshot,
  InstanceInfo,
  MarksConflict,
  MarksResponse,
  SessionResponse,
  UpdateParticipantResponse,
  type CreateEventInput,
  type EventSnapshotData,
  type InstanceInfoData,
  type StatusInput,
  type UpdateEventInput,
} from '@owl/shared';
import type { z } from 'zod';

/** A request the API refused, with its error code. */
export class ApiFailure extends Error {
  readonly status: number;
  readonly code: string;
  readonly body: unknown;

  constructor(status: number, code: string, message: string, body: unknown) {
    super(message);
    this.name = 'ApiFailure';
    this.status = status;
    this.code = code;
    this.body = body;
  }
}

/** The network itself failed: offline, or the server is unreachable. */
export class NetworkFailure extends Error {
  constructor(cause: unknown) {
    super('The network request failed', { cause });
    this.name = 'NetworkFailure';
  }
}

export interface Credentials {
  admin?: string | null | undefined;
  participant?: string | null | undefined;
}

function headersFor(
  credentials: Credentials | undefined,
  json: boolean
): Record<string, string> {
  const headers: Record<string, string> = {};
  if (json) headers['content-type'] = 'application/json';
  if (credentials?.admin) headers['x-admin-token'] = credentials.admin;
  if (credentials?.participant)
    headers['x-participant-token'] = credentials.participant;
  return headers;
}

interface RequestOptions {
  body?: unknown;
  credentials?: Credentials | undefined;
  headers?: Record<string, string>;
  keepalive?: boolean;
}

async function send(
  method: string,
  path: string,
  options: RequestOptions = {}
): Promise<Response> {
  try {
    return await fetch(path, {
      method,
      headers: {
        ...headersFor(options.credentials, options.body !== undefined),
        ...options.headers,
      },
      ...(options.body !== undefined && { body: JSON.stringify(options.body) }),
      ...(options.keepalive && { keepalive: true }),
    });
  } catch (error) {
    throw new NetworkFailure(error);
  }
}

async function failure(response: Response): Promise<ApiFailure> {
  let body: unknown = null;
  try {
    body = await response.json();
  } catch {
    // Not JSON: a proxy's error page, for instance.
  }
  const parsed = ApiErrorBody.safeParse(body);
  return new ApiFailure(
    response.status,
    parsed.success ? parsed.data.error : `http_${response.status}`,
    parsed.success
      ? (parsed.data.message ?? parsed.data.error)
      : response.statusText,
    body
  );
}

async function request<S extends z.ZodType>(
  method: string,
  path: string,
  schema: S,
  options: RequestOptions = {}
): Promise<z.output<S>> {
  const response = await send(method, path, options);
  if (!response.ok) throw await failure(response);
  return schema.parse(await response.json());
}

async function requestEmpty(
  method: string,
  path: string,
  options: RequestOptions = {}
): Promise<void> {
  const response = await send(method, path, options);
  if (!response.ok) throw await failure(response);
}

const events = (id: string): string => `/api/events/${encodeURIComponent(id)}`;

export const api = {
  instance(): Promise<InstanceInfoData> {
    return request('GET', '/api/instance', InstanceInfo);
  },

  createEvent(body: CreateEventInput) {
    return request('POST', '/api/events', CreateEventResponse, { body });
  },

  /**
   * The event, or null when it has not changed since `etag`. The browser
   * would revalidate on its own; asking explicitly is what lets a refetch
   * after a live update cost nothing when the update was our own.
   */
  async getEvent(
    id: string,
    etag: string | null
  ): Promise<{ data: EventSnapshotData; etag: string | null } | null> {
    const response = await send('GET', events(id), {
      ...(etag !== null && { headers: { 'if-none-match': etag } }),
    });
    if (response.status === 304) return null;
    if (!response.ok) throw await failure(response);
    return {
      data: EventSnapshot.parse(await response.json()),
      etag: response.headers.get('etag'),
    };
  },

  session(id: string, name: string, password?: string) {
    return request('POST', `${events(id)}/session`, SessionResponse, {
      body: {
        name,
        ...(password !== undefined && password !== '' && { password }),
      },
    });
  },

  /**
   * Save a complete set of marks. A conflict is an answer, not an error: it
   * carries the server's current revision and marks.
   */
  async putMarks(
    id: string,
    participantId: string,
    body: { baseRev: number; yes: string[]; maybe: string[] },
    credentials: Credentials,
    keepalive = false
  ): Promise<
    | { ok: true; rev: number; version: number }
    | { ok: false; rev: number; yes: string[]; maybe: string[] }
  > {
    const response = await send(
      'PUT',
      `${events(id)}/participants/${participantId}/marks`,
      {
        body,
        credentials,
        keepalive,
      }
    );
    if (response.status === 409) {
      const json: unknown = await response.json();
      const conflict = MarksConflict.safeParse(json);
      if (conflict.success)
        return {
          ok: false,
          rev: conflict.data.rev,
          yes: conflict.data.yes,
          maybe: conflict.data.maybe,
        };
      throw new ApiFailure(
        409,
        ApiErrorBody.safeParse(json).data?.error ?? 'conflict',
        'Conflict',
        json
      );
    }
    if (!response.ok) throw await failure(response);
    return { ok: true, ...MarksResponse.parse(await response.json()) };
  },

  updateParticipant(
    id: string,
    participantId: string,
    body: { name?: string; note?: string | null; password?: string | null },
    credentials: Credentials
  ) {
    return request(
      'PATCH',
      `${events(id)}/participants/${participantId}`,
      UpdateParticipantResponse,
      {
        body,
        credentials,
      }
    );
  },

  deleteParticipant(
    id: string,
    participantId: string,
    credentials: Credentials
  ) {
    return requestEmpty(
      'DELETE',
      `${events(id)}/participants/${participantId}`,
      { credentials }
    );
  },

  addRoster(id: string, names: string[], admin: string) {
    return request('POST', `${events(id)}/participants`, EventSnapshot, {
      body: { names },
      credentials: { admin },
    });
  },

  updateEvent(id: string, body: UpdateEventInput, admin: string) {
    return request('PATCH', events(id), EventSnapshot, {
      body,
      credentials: { admin },
    });
  },

  setStatus(id: string, body: StatusInput, admin: string) {
    return request('PUT', `${events(id)}/status`, EventSnapshot, {
      body,
      credentials: { admin },
    });
  },

  /** Whether `admin` is this event's organiser key. */
  async checkAdmin(id: string, admin: string): Promise<boolean> {
    try {
      await requestEmpty('GET', `${events(id)}/admin`, {
        credentials: { admin },
      });
      return true;
    } catch (failure) {
      if (failure instanceof ApiFailure && failure.status === 403) return false;
      throw failure;
    }
  },
  deleteEvent(id: string, admin: string) {
    return requestEmpty('DELETE', events(id), { credentials: { admin } });
  },
};

export const calendarFileUrl = (id: string): string =>
  `${events(id)}/calendar.ics`;
export const streamUrl = (id: string): string => `${events(id)}/stream`;
