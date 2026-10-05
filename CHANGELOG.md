# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

<!-- The release workflow extracts the section of the version being tagged with
     awk, matching "## [x.y.z]". Keep that heading shape exactly. -->

## [Unreleased]

### Added

- Link previews of an event show its own picture: the title, the state of the poll, and the candidate days as a small calendar coloured like the heatmap, with the chosen date outlined. A poll longer than six weeks shows the six weeks around its best day (or the chosen date), names its whole period above and the days left out below. No names and never the description. The server draws it (`/e/:id/og.png`) with resvg in WebAssembly and keeps each version once; the address carries the version, so a changed poll is a new picture. Messengers fetch it when the link is sent, so every new message shows the poll as it is then.
- The start page has an address per language (`/de`, `/fr` …) that search engines read in that language: `<html lang>`, title and description come from the server, and every version names the others with `hreflang`. Plain `/` stays the default and picks the browser's language. Arriving on one of these addresses chooses its language; picking another in the footer moves to its address.
- `/sitemap.xml` lists the start page in every language and the privacy page; `robots.txt` points to it under `PUBLIC_URL`. Event pages are never listed.
- Who has answered on an event page sees a small invitation to plan their own event; organisers don't. The footer links to a new event on every page but the start page.
- The start page answers three common questions: what it costs, whether an account is needed, and how it differs from Doodle.
- `MAX_DB_BYTES` refuses new events once the database file reaches a size ceiling; `MAX_EVENTS` limits only their number.

### Changed

- New link-preview pictures are drawn at a limited rate; when it is exceeded, the picture answers busy with `Retry-After`. `HEAD` requests to an event page or its picture count against the same limit as `GET`.
- `compose.example.yaml` pins the current release, trusts only the proxy's gateway address instead of the whole network, and allows 512 MB of memory, which the preview renderer and the Japanese font need.
- An event's description uses the full width of the page instead of breaking early.
- Event pages carry the event's language in `<html lang>`, for crawlers that build link previews.
- The note at the bottom of an event page says that the event is deleted automatically: "This event will be deleted automatically on … unless something changes by then."
- The footer names the author: "Open source by Willi Thiel", in every language.
- Link-preview pictures may be embedded by other sites (`Cross-Origin-Resource-Policy: cross-origin`); everything else stays `same-origin`.
- New candidate days may lie one day further ahead, so people east of UTC can pick the last allowed day.
- Marks on days that are not candidate days are dropped instead of refusing the whole save.
- Saving days or a duration that would delete answers, or shorten or drop the chosen date, asks first and names how many answers are lost.
- The operator command line checks the command and the configuration before it opens anything, and it never creates or upgrades a database.
- The privacy page mentions that the Google Calendar button opens Google with the event's details.
- German and Japanese wording is consistent ("Abstimmung", 予定); Italian weekday buttons read "Ogni sabato".
- The pre-push hook checks only pushes of the checked-out branch and refuses a dirty working tree; `npm run screenshot` picks a free port and cleans up after itself; `og.png` is set in the bundled Nunito; `npm run test:tz` runs five zones.

### Security

- Events that nobody has answered expire 90 days after their last change, even when their candidate days lie further ahead, so empty events can no longer fill an instance for years. Names typed into the list by the organiser do not count as answers.
- Rate limits and the cap on live-update connections are counted per IPv6 /48 (and per IPv4 address) on every route, so one rented prefix no longer multiplies them.
- Wrong guesses at a protected name are counted before the password is checked, so guesses sent at the same moment can no longer all get past the wait. A name that is still waiting is no longer forgotten when many other names are guessed at.
- Hashing new passwords has its own budget per network, and the server answers busy instead of queueing password work without bound.
- A session revoked while a new password was being hashed can no longer change the entry, and a sign-in that raced a password change gets "changed" instead of a dead session.
- Requests that stop arriving are closed after 30 seconds, so a stalled upload can no longer hold a connection or the shutdown.
- At trace log level, a refused request no longer logs its raw bytes, which can carry the event link and keys.
- The database and its side files are readable by their owner only, and the data directory is created as 0700.
- Removing a person or rewriting an event's texts folds the write-ahead log at once, so the old text does not linger in the files.
- Link previews and event pages are marked `private`, so shared caches do not keep them after an event is deleted.
- The description sent to Google Calendar has its angle brackets replaced, so organiser text cannot become markup or links there.
- Names in which one word mixes Latin letters with Cyrillic or Greek letters are refused.
- The calendar file refuses control characters in its identifiers, and the tab icon escapes what it draws.
- The organiser asks before removing someone's password, which opens that entry to everyone with the link.
- The release workflow refuses a tag that GitHub does not report as signed and verified, scans the arm64 image as well as amd64, and logs in to the registry only after both scans. CI scans the whole git history for secrets, dependency review covers development dependencies too, and Dependabot waits three days before proposing GitHub Actions updates.
- SECURITY.md names the deliberate trade-offs around protected names and sessions, and why the preview's WebAssembly dependencies are acceptable.

### Fixed

- Drawing link-preview pictures leaked WebAssembly memory with every new picture and could get the container killed.
- An emoji in an event title no longer loads the Japanese font for the preview picture, which cost about 100 MB of memory.
- Event pages, link previews and their pictures reuse the event's state as long as it is unchanged, instead of rebuilding every participant and mark per request.
- The operator's `list` and `purge` commands count only people who marked days, so names typed into a list no longer keep an unanswered event from being purged.
- Addresses a proxy reports with a port are rate limited like the address alone.
- An IPv4 address written in hexadecimal IPv6 form (`::ffff:cb00:7107`) is rate limited as that IPv4 address.
- Marks painted just before switching tabs on a phone, resizing the window or filling in for someone else are saved instead of dropped, saves survive closing the tab, and pending changes are sent when the page goes into the background.
- A save that still contains a day the organiser just removed is saved without that day instead of failing.
- A request that stops answering no longer freezes saving and refreshing; requests give up after 20 seconds and are retried. A dropped connection or a captive-portal page during a save is retried instead of failing for good.
- An update announced while another fetch was running, or a failed refresh, no longer leaves the page on an old version, and the page refreshes when the phone wakes up, the tab becomes visible or the network returns.
- One failed request for the instance information no longer leaves the imprint link, the privacy details and the share links missing for the whole visit.
- Failed saves and organiser edits name the actual reason (no run of days long enough, too many days, past or distant days, a busy server, a changed entry, a short password) instead of "That didn't work".
- Saving after a password change revoked this device's session asks who you are again instead of failing.
- The days editor no longer saves days its calendar does not show, and no longer adds days that have passed or more days than an event may hold.
- Saving the organiser's details sends only the fields that changed, so it no longer undoes a change made on another device; duration and "people needed" are checked with a message instead of being adjusted silently; a failed "Add names" keeps the typed names, and a double-clicked Save no longer reports a conflict.
- Organiser messages appear next to the control that caused them and clear on the next edit; wizard errors disappear once the input is fixed; over-long names and lists are caught before they are sent.
- Undo no longer restores marks older than ones adopted from another device.
- Notes are saved only when they changed, a note changed on another device is not overwritten by stale text, and a failed note save is shown next to the note.
- "Saved: none of these days work for you" appears only once the save has finished.
- The organiser leaves "Fill in" when that person disappears.
- Keyboard selection in the calendar no longer survives a click or leaving the grid, no longer previews on a closed poll, takes its paint or erase mode from a day that can be painted, and Ctrl, Alt or Shift combinations no longer trigger the brush and undo shortcuts. Shift with Home or End starts a selection.
- A tap right after a drag is no longer ignored, and a drag whose release was lost no longer leaves the calendar stuck.
- The group view drops hidden people, selections and open day sheets that no longer exist.
- Long unbroken titles, places, descriptions, names and notes wrap instead of widening the page.
- The start page asks before it forgets an event whose organiser link is stored on this device.
- An organiser link pasted into an open event page is taken and removed from the address bar; a key the server refuses is dropped for good, with a message.
- Opening a deleted or unknown event removes it, its organiser key and its session from this device, and events that fall off the "My events" list leave no keys behind.
- The event page names the day an event is actually deleted, one day after its last day.
- The privacy page no longer says "0 days" or "1 days", and says when the operator's details are loading or could not be loaded.
- The "All set!" greeting appears only the first time the share dialog opens; the share sheet gets the link once; an over-long public address leaves out the QR code instead of blanking the page; in Japanese, the two copy fields no longer share an id.
- The password option is no longer offered when joining a closed poll.
- Delete buttons have readable text in dark mode and the red text applies where meant; placeholder text meets 4.5:1 contrast; error notices have their red border again.
- Arrow keys in a choice group and in the emoji picker move the focus with the selection; buttons, chips, brushes and the dialog close button are 44 px tall; the page no longer scrolls behind dialogs, and a drag that ends on the backdrop no longer closes one.
- Phones with a notch or home indicator get safe-area spacing without extra scrolling.
- Clicking a link to the page you are on no longer adds history entries.
- Saving works again in the development build.
- Invisible tag characters and other default-ignorable characters can no longer make a second, identical-looking name, and stored names are matched again after the rules change. Titles, places, organiser names and descriptions made only of invisible characters are refused.
- Lone surrogates, U+FFFE and U+FFFF are cleaned from text, vertical tab, form feed and next-line characters separate words, and text is normalised after invisible characters are removed.
- Length limits count characters (code points) everywhere, passwords included, so three emoji are too short for a password.
- Passwords typed in a differently composed Unicode form are recognised as the same password.
- The "I can" hint bar ignores people who have not seen a day yet, matching the group heatmap.
- Days beyond year 9999 or before year 0 are refused instead of producing malformed dates, choosing a block that would run past 9999-12-31 answers 400 instead of 500, and years below 100 are formatted correctly.
- The link preview and its picture of a closed poll say that it is closed. Titles in Cyrillic or Vietnamese appear in the picture, Greek ones through the Japanese font, and titles in scripts no font covers show the app name. Long titles with wide letters no longer run under the calendar, and German says "+ 1 weiterer Tag".
- Editing one event no longer pushes other events' preview pictures out of the cache, and one failed font or WebAssembly load no longer disables preview pictures until a restart.
- Links with a trailing slash (`/e/<id>/`, `/de/`, `/privacy/`) show the same page as without it; paths that merely start with `/api` get the app's not-found page; malformed URLs get the app's JSON error and its security headers.
- A HEAD request to the live-update stream no longer hangs, and a stream opened during shutdown is ended at once.
- A `CLIENT_DIR` without a built client stops start-up with a clear message; `TRUST_PROXY` ranges ending in `/0` are reported as a configuration error; a crash or full disk during the first start can no longer leave a broken `secret.key`.
- Password waits and the hourly limit on new events no longer stretch or stay shut when the system clock is set back.
- Purging or sweeping many events no longer holds the database write lock for the whole run, and two processes migrating one database no longer fail.
- A client directory with `assets` in its path no longer makes every static file immutable.
- The container health check treats a blank `PORT` as 8080, like the server.
- `npm run dev` compiles the server and recompiles it on every edit.
- Release tags must match the version of all four package manifests, only the highest stable release moves `latest`, pre-releases are marked as such, and CI can be started by hand.

### Removed

- The event's creation time is no longer part of the event responses; nothing used it.

## [0.2.1] - 2026-10-05

### Changed

- The group view is called "Group" again instead of "Everyone", in every language. The number of answers stands beside it on its own, so the name no longer reads like the name of a group.
- The live example on the start page is headed "Try it out" instead of "See how it looks", in every language, and its hint says the event is made up: "A made-up event to try out — nothing is saved."

### Fixed

- Select boxes draw their own arrow, set in from the rounded edge instead of right against it.
- Select boxes, text fields and round buttons keep their shape when focused. The focus ring's fallback rounding no longer overrides an element's own.

### Removed

- The note "Maybe counts as half." below the heatmap legend. It meant only the colour of a day, but read like a statement about the counts, which never halve a maybe. The colour still weighs a maybe as half a yes.

## [0.2.0] - 2026-10-04

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

[Unreleased]: https://github.com/ni-c/owl-be-there/compare/v0.2.1...HEAD
[0.2.1]: https://github.com/ni-c/owl-be-there/compare/v0.2.0...v0.2.1
[0.2.0]: https://github.com/ni-c/owl-be-there/compare/v0.1.5...v0.2.0
[0.1.5]: https://github.com/ni-c/owl-be-there/compare/v0.1.4...v0.1.5
[0.1.4]: https://github.com/ni-c/owl-be-there/compare/v0.1.3...v0.1.4
[0.1.3]: https://github.com/ni-c/owl-be-there/compare/v0.1.2...v0.1.3
[0.1.2]: https://github.com/ni-c/owl-be-there/compare/v0.1.1...v0.1.2
[0.1.1]: https://github.com/ni-c/owl-be-there/compare/v0.1.0...v0.1.1
[0.1.0]: https://github.com/ni-c/owl-be-there/releases/tag/v0.1.0
