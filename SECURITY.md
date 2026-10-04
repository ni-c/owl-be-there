# Security policy

## Reporting a vulnerability

Please use [GitHub private vulnerability reporting](https://github.com/ni-c/owl-be-there/security/advisories/new). Do not open a public issue for an unpatched vulnerability, and never include a real event link in a report: the link is the key to that event.

Only the latest release and the current `main` branch receive security fixes.

## What the application stores

- **Per event:** the title, an optional description, location, emoji and organiser name, the candidate days and the event's settings.
- **Per participant:** the name they typed, an optional password hash (scrypt), an optional short note, and which days they marked as _yes_ or _maybe_.
- **Nothing else.** No accounts, no e-mail addresses, no IP addresses, no cookies, no analytics, no requests to third parties. The application never writes an IP address to its database or its log. The one exception is a click on _Add to Google Calendar_ once a date is chosen: that opens Google with the event's title, description, location and link filled in, as any such button does.

Events are deleted automatically 90 days after their last change — reading an event does not count as a change — but never before their last candidate day (or the chosen date) has passed. Deletion is a hard delete with SQLite's `secure_delete` switched on, so the bytes are overwritten rather than left in free pages.

## How access works

- **The event link is the read key.** Its id is 12 random base58 characters (about 70 bits). Anyone who has the link can see the names and marks of that event — that is what sharing it is for. Event pages carry `noindex` and the API answers nothing without the id.
- **The organiser link** carries a 256-bit token in the URL _fragment_ (`#admin=…`). Browsers never send the fragment to a server, so it reaches neither access logs nor the crawlers that build link previews. The client moves it into local storage and removes it from the address bar, so copying the address shares the event and not the admin rights. The server stores only its SHA-256 hash.
- **Participants** are identified by their name, optionally protected with a password. Without a password, anyone who has the event link and knows the name can change that entry. This is deliberate — it is how Crab Fit works, and it lets a group fill in for someone without a phone — and the interface says so where the password is offered. A participant token is an HMAC over the event, the participant and a generation counter, signed with a server secret that lives outside the database; changing or removing a password increments the counter and revokes every token for that entry. The flip side of an unprotected name: whoever gets to it first can also set a password on it, and the person it belongs to is then locked out until the organiser resets that password. Organisers who list names in advance should tell people to protect theirs.
- **The organiser link is checked before it replaces a key.** A browser that already holds an organiser key for an event asks the server whether a key arriving in a link is valid before it swaps it in, so a link with a made-up key cannot cost the organiser their access.

## Abuse resistance

Public scheduling tools attract phishing: a poll is a free page on a trusted domain. So:

- Everything an organiser writes is plain text. Links in descriptions are never made clickable.
- Link previews are built from fixed text and the event title; the organiser's description never appears in them.
- Rate limits per IP address (kept in memory only), size limits on every field and list, and a ceiling on the number of stored events. The hourly ceiling on new events is shared out: one address or IPv6 /48 may take at most a tenth of it.
- Passwords cannot be guessed at speed. Wrong passwords are counted per event and name, in memory: after five, that name answers only after a wait that doubles with every further miss, up to 15 minutes, and ends with the right password. It is a wait, not a lock. On top of that, one address or IPv6 /48 may ask for at most 60 password checks in five minutes across all names. New passwords need at least six characters.
- `CREATION_ENABLED=false` stops new events without touching existing ones. The operator command line can delete a single event, list the events created since a day with how many people joined them, and purge those nobody joined.

## Deployment requirements

- Terminate TLS at a reverse proxy, set `PUBLIC_URL` to the exact public origin and `TRUST_PROXY` to the proxy's address only.
- Keep the container as shipped: non-root user, read-only root filesystem, all capabilities dropped, `no-new-privileges`.
- `/data` holds the database and `secret.key`. Treat both as confidential and back them up together.
- Disable response buffering for `/api/events/*/stream` in the proxy, or live updates arrive in bursts.
