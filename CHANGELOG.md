# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

<!-- The release workflow extracts the section of the version being tagged with
     awk, matching "## [x.y.z]". Keep that heading shape exactly. -->

## [Unreleased]

### Added

- Six more interface languages: Spanish, French, Portuguese, Italian, Japanese and Dutch. Link previews and calendar files speak them too. Japanese text uses a bundled Noto Sans CJK JP font, so no request leaves for a font service.
- The start page shows a live example below the two feature boxes: ten people planning a team dinner next month, in a browser window, built from the same parts as an event page. Visitors paint their days as Anna and watch the group's calendar follow; nothing is sent or stored. It follows the theme and the language. `npm run screenshot` takes the README's pictures of it, together with the link preview picture. The README opens with the owl.

### Changed

- The language picker lists the languages alphabetically by their own names: Deutsch, English, Español, Français, Italiano, Nederlands, Português, 日本語.
- Shorter, plainer English and German texts throughout, starting with the tagline "Find a day everyone can make." / "Findet einen Tag, an dem alle können."
- The database gains one migration that lets events store the new languages. It rebuilds the `events` table once on the first start; events, participants and their days are kept.
- New passwords need at least six characters instead of four. Passwords set before keep working.
- Saving the candidate days sends the days the edit started from. If they changed elsewhere in the meantime, for example in a second tab, the server refuses the save instead of silently removing days, and the marks on them, that were added there.
- New candidate days may lie at most about five years ahead.
- The share dialog shows the link for everyone, the QR code and, for the organiser, the organiser link — in that order. The invitation text to copy is gone; the system share sheet still sends it along with the link.

### Security

- Wrong passwords are counted per event and name, in memory. After five, that name waits before the next try, doubling with every further miss up to 15 minutes. One address or IPv6 /48 may ask for at most 60 password checks in five minutes. Previously only the requests per address were limited, which a block of IPv6 addresses gets around.
- One address or IPv6 /48 may take at most a tenth of the hourly ceiling on new events, so a single network can no longer lock everyone else out of creating events.
- A link with a made-up organiser key no longer replaces a valid key stored in the browser: a key that differs from the stored one is checked with the server first.
- The link preview page `/e/:id` is rate limited like the API read it does the work of.
- The live stream sends the same security headers as every other response, ends after 30 minutes (the browser reconnects on its own) and no longer counts a client that left before its stream started.
- Static files are never served from dotfiles.
- Names cannot be told apart by invisible characters any more: soft hyphens, variation selectors and blank fillers are ignored when names are compared, and a name made only of invisible characters is refused.
- The release workflow scans the image before it pushes it, and tags a pre-release no longer as `latest`. Dependabot waits three days before proposing a new npm or Docker release.
- The operator command line can list the events created since a day and purge those nobody joined.

### Fixed

- Stopping the server waited for open live streams, so one open browser tab held a shutdown until the container was killed. The streams are now ended first.
- Buttons, choice lists and the other clickable controls show the hand cursor again; Tailwind 4 had given them the arrow. A disabled button keeps the not-allowed cursor.
- The browser tab showed an event's emoji twice — as its icon and at the start of the title — and after moving between pages without a reload, the icon of the first event opened stayed. The emoji is now the tab's icon only, follows the open event, and the start page shows the owl again.
- Changing the duration of an event with a chosen date kept the old end date. The end now follows the duration while the block still fits.
- Removing a candidate day broke saving for everyone who had marked it: their next save was refused until they reloaded the page.
- A candidate day on 9999-12-31 got the event deleted at the next sweep.
- An older answer to a refresh could replace a newer snapshot that a save had just returned.
- A live stream that was written to while it closed could crash the server.
- After the live stream was refused once, for example by a proxy during a deploy, the page polled for good. It now tries the stream again after five minutes.
- Two people taking the same new name at the same moment got a server error; one now gets "name taken". The same applies to two first passwords for one name.
- Adding names to the list counted names that were already there against the limit.
- Leaving the page while a save was under way lost the last change.
- The days editor stopped responding when a date more than a year after the existing days was picked.
- A failed rollback hid the original database error, a failing shutdown went unreported, and an invalid `TRUST_PROXY` crashed with a stack trace instead of naming the setting.

## [0.1.5] - 2026-10-03

### Changed

- Links to share — the event link, the organiser link, the QR code, the invitation text and the Google Calendar link — always use `PUBLIC_URL`, even when the page was opened through another domain that serves the same instance. `/api/instance` now names `publicUrl`.

## [0.1.4] - 2026-10-02

### Changed

- The German tagline reads "Finde den Tag, der allen passt." instead of "Finde den Tag, an dem alle können.", which sounded off.

## [0.1.3] - 2026-10-02

### Changed

- On a phone, the owl on the start page sits above the heading instead of below the introduction. Wider screens keep it beside the text.

## [0.1.2] - 2026-10-02

### Fixed

- On a phone, a calendar spanning more than a month no longer jumps while scrolling. It switched between month pages and the whole range whenever the address bar slid in or out and changed the window height. Month pages are gone: the calendar always shows the whole range, and only the paintable days take over the finger — the week column, past days and the margins still scroll the page.

### Removed

- The "Tap or drag" card on the start page: painting days by tapping and dragging is what people expect from a calendar, not a selling point. The other two cards stay.

## [0.1.1] - 2026-10-02

### Changed

- The second view is called "Everyone" ("Alle") instead of "Group", with the number of answers as a badge; "Group · 1" read like the name of a group.
- Request logging is switched off through Fastify's `logController` instead of the deprecated `disableRequestLogging` option, which Fastify 6 removes. The server no longer prints a deprecation warning at start.

## [0.1.0] - 2026-10-02

### Added

- Project scaffold: npm workspaces for the shared domain logic, the server and the client; linting, type checks, unit tests and CI.
- Shared calendar logic: dates as plain `YYYY-MM-DD` strings, candidate days from a range and weekdays, the week grid with month pages, rectangle selection and the weekday, week and all/none toggles, ranking of days and of blocks of consecutive days with "maybe" and a minimum head count, the retention date, `.ics` files and Google Calendar links, and a dependency-free QR encoder.
- The server: Fastify with SQLite through Node's built-in `node:sqlite`. Events, participants with an optional password, auto-saved marks that never let an older save overwrite a newer one, the organiser's changes, closing, choosing a date and deleting; live updates over server-sent events; link previews with the event title for messengers; calendar files; automatic deletion 90 days after the last change; rate limits kept in memory; strict security headers; no IP address in the database or the log; an operator command line.
- A container image: built on Node 26 Alpine, without npm, running read-only as a non-root user with a health check, for amd64 and arm64; CI builds, scans and smoke-tests both.
- The web app: a calendar to paint the days you can make — tap a day, drag across several, or use the keyboard — with a "maybe" brush, undo, weekday and week toggles and auto-save; the group's answers as a heatmap in the same calendar with the best days or blocks, a sheet per day naming who can, and live updates; an organiser mode to edit the event, correct entries, close it, choose the date with a calendar file and a Google Calendar link, or delete it; sharing by link, QR code and a ready-made invitation; English and German, light and dark, with a hand-drawn owl.
- A release workflow that publishes the image to `ghcr.io/ni-c/owl-be-there` with an SBOM and build provenance, and a README with self-hosting instructions.
- End-to-end tests in Chromium and WebKit, on desktop and on phones with touch, including accessibility checks in light and dark mode.

[Unreleased]: https://github.com/ni-c/owl-be-there/compare/v0.1.5...HEAD
[0.1.5]: https://github.com/ni-c/owl-be-there/compare/v0.1.4...v0.1.5
[0.1.4]: https://github.com/ni-c/owl-be-there/compare/v0.1.3...v0.1.4
[0.1.3]: https://github.com/ni-c/owl-be-there/compare/v0.1.2...v0.1.3
[0.1.2]: https://github.com/ni-c/owl-be-there/compare/v0.1.1...v0.1.2
[0.1.1]: https://github.com/ni-c/owl-be-there/compare/v0.1.0...v0.1.1
[0.1.0]: https://github.com/ni-c/owl-be-there/releases/tag/v0.1.0
