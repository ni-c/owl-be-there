# Owl Be There

**Find a day everyone can make.**

Owl Be There helps a group pick a day — for a match, a tournament, a hike or a barbecue. The organiser picks the candidate days, everyone marks the days they can make it on a calendar, and the calendar turns into a heatmap that shows at a glance when the whole group is free.

It is a cross between [Rallly](https://github.com/lukevella/rallly) (whole-day polls without accounts) and [Crab Fit](https://github.com/GRA0007/crab.fit) (paint your availability, see the group's heatmap) — with whole days on a calendar instead of lists or time slots.

## Features

- **Mark days the way you think about them:** tap a day to switch it on or off, drag across the calendar to mark a whole block — say, every weekend in March — in one go. Start a drag on a marked day and it erases instead. Weekday and week headers toggle a whole column or row; the keyboard does everything too.
- **Yes and maybe:** a second brush for "if need be". Maybe is hatched and carries a question mark, so it never depends on colour alone.
- **The group at a glance:** the same calendar as a heatmap with a count on every day, the best days ranked, a minimum head count, and a sheet per day naming who can, who might, who cannot and who has not answered yet. Updates arrive live.
- **Multi-day events:** looking for a whole weekend? Ask for two days in a row and get the best blocks.
- **No accounts:** your name, and a password only if you want one. The organiser gets a private admin link to edit the event, correct entries, close it, and choose the date — with a calendar file and a Google Calendar link for everyone.
- **Sharing:** the system share sheet, a QR code, and a ready-made invitation text. Messengers show the event title in their link preview.
- **Minimal data:** no e-mail addresses, no IP addresses, no cookies, no tracking, no third-party requests. Events delete themselves 90 days after the last change — never before their last candidate day.
- **Made for phones:** the whole range in one calendar, big tap targets, dark mode, Dutch, English, French, German, Italian, Japanese, Portuguese and Spanish.
- **Self-hostable:** one container, one SQLite file.

The Japanese interface uses a locally hosted Noto Sans CJK JP font (© 2014–2021 Adobe). Its SIL Open Font License is included with the font files.

## Self-hosting

The image is published for amd64 and arm64 as `ghcr.io/ni-c/owl-be-there`. It runs as a non-root user on a read-only root filesystem and keeps everything it writes in `/data`: the database `owl.db` and the server secret `secret.key`, which signs participant tokens.

1. Copy [`compose.example.yaml`](compose.example.yaml) to `compose.yaml` and set `PUBLIC_URL`.
2. Create the data directory for the container's user: `mkdir data && sudo chown 1000:1000 data`.
3. `docker compose up -d`, then put a reverse proxy with TLS in front (below).

### Configuration

| Variable                | Default                 | Meaning                                                                                                                                                                            |
| ----------------------- | ----------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `PUBLIC_URL`            | `http://localhost:8080` | The public origin, without a path. The only source of absolute URLs (link previews, calendar files) — moving to another domain means changing this and nothing else.               |
| `TRUST_PROXY`           | `127.0.0.1,::1`         | Addresses or CIDR ranges whose `X-Forwarded-For` is believed. Behind Docker's port publishing that is the compose network's gateway, so trust that network. `false` trusts nobody. |
| `PORT` / `HOST`         | `8080` / `0.0.0.0`      | Where the server listens inside the container.                                                                                                                                     |
| `CREATION_ENABLED`      | `true`                  | `false` stops new events from being created; existing ones keep working. The emergency switch against abuse.                                                                       |
| `MAX_EVENTS`            | `10000`                 | No new events beyond this many.                                                                                                                                                    |
| `OWL_SECRET`            | generated               | At least 32 characters. Normally left unset: the server creates `/data/secret.key` on first start.                                                                                 |
| `OPERATOR_NAME`         | —                       | Shown on the privacy page as the operator.                                                                                                                                         |
| `OPERATOR_CONTACT`      | —                       | A contact address for the privacy page, also for abuse reports.                                                                                                                    |
| `IMPRINT_URL`           | —                       | A link to your legal notice, if you need one.                                                                                                                                      |
| `LOG_RETENTION_DAYS`    | —                       | How long your reverse proxy keeps access logs, stated on the privacy page. The application itself logs no addresses.                                                               |
| `BACKUP_RETENTION_DAYS` | —                       | How long deleted events can linger in backups, stated on the privacy page.                                                                                                         |
| `LOG_LEVEL`             | `info`                  | `fatal`, `error`, `warn`, `info`, `debug` or `trace`. Requests are never logged.                                                                                                   |

### Reverse proxy

Any proxy works. The one thing to get right is the live-update stream at `/api/events/<id>/stream`: it is a long-lived response that must not be buffered. The server sends `X-Accel-Buffering: no`, which nginx honours, and a heartbeat every 25 seconds; a dedicated location makes the intent explicit:

```nginx
server {
    server_name owl.example.org;
    listen 443 ssl;
    http2 on;
    # ssl_certificate …

    client_max_body_size 64k;

    location ~ ^/api/events/[^/]+/stream$ {
        proxy_pass http://127.0.0.1:8080;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header Connection "";
        proxy_buffering off;
        proxy_read_timeout 1h;
    }

    location / {
        proxy_pass http://127.0.0.1:8080;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header Connection "";
    }
}
```

The application sets its own security headers (a strict Content Security Policy, `Referrer-Policy: no-referrer` and the rest); do not add a second CSP in the proxy.

**Moving to another domain:** set `PUBLIC_URL` to the new origin. You can keep the old domain serving the application as well — point a second server block at the same container. Links to share, QR codes, invitation texts and link previews then always carry `PUBLIC_URL`, whichever domain a visitor came through, so the old one fades out without breaking a single link. What a browser remembers (your name per event, "your events", the organiser token) is stored per origin, which is why keeping the old domain alive beats a redirect. If you redirect anyway, keep the path (`return 301 https://new.example.org$request_uri;`); the browser carries the `#admin=…` fragment across, so organiser links still work.

### Operating it

```sh
docker compose exec owl node packages/server/dist/cli.js stats
docker compose exec owl node packages/server/dist/cli.js delete <event id>
```

`stats` counts events, participants and marks; `delete` removes an event at once, for abuse reports. Expired events are swept on start and every hour.

**Backups:** copy `owl.db` with SQLite's online backup (`sqlite3 data/owl.db ".backup backup.db"`) rather than the file itself, which may be mid-write. Keep `secret.key` too; without it, participants with a password must log in again. Keep backups only as long as the privacy page says.

## Development

Node 26 and npm. See [CONTRIBUTING.md](CONTRIBUTING.md) for the commands and the conventions, and [docs/design.md](docs/design.md) for the colours and why they are what they are.

## License

[MIT](LICENSE)
