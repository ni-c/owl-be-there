# Owl Be There — guide for coding agents

A group finds a **day** (or a block of consecutive days) for an event: the organiser picks candidate days, participants paint the days they can make it on a calendar, and the group view turns the calendar into a heatmap. No accounts, minimal data, one container with one SQLite file.

**The one fact to keep in mind:** calendar days are `YYYY-MM-DD` strings from end to end — in the database, in the API, in the client. A `Date` object for a day exists only inside `packages/shared/src/dates.ts`, in UTC. Everything that went wrong in calendar apps before went wrong at that boundary.

## Commands

All commands need Node 26 (`.nvmrc`). Install with `npm ci`, never `npm install` (see Traps).

| Command                 | Purpose                                                                                                                                                |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `npm run dev`           | API on :8080 and the client with hot reload on :5173                                                                                                   |
| `npm run lint`          | ESLint + Prettier                                                                                                                                      |
| `npm run typecheck`     | every package, the tests and the end-to-end tree                                                                                                       |
| `npm test`              | unit and API tests (in-process: SQLite in memory, Fastify via `inject`)                                                                                |
| `npm run test:coverage` | the same with thresholds                                                                                                                               |
| `npm run test:tz`       | shared and client tests under five time zones                                                                                                          |
| `npm run test:e2e`      | Playwright: Chromium and WebKit, desktop and mobile with touch                                                                                         |
| `npm run ci:local`      | lint, typecheck, audit, secret scan, tests and e2e; CI also builds and scans the image, runs CodeQL and dependency review, and renders the screenshots |
| `npm run build`         | shared → server → client                                                                                                                               |
| `npm run screenshot`    | after a build: the README's pictures of the start page example (`docs/`) and `og.png`                                                                  |

## Layout

- `packages/shared` — pure domain logic and zod schemas, used by both sides: dates, candidate days, the week grid, rectangle selection, toggles, ranking of days and blocks, retention, `.ics`, QR codes, limits.
- `packages/server` — Fastify. `db/sqlite.ts` is the only module that imports `node:sqlite`; `db/repo.ts` holds every query. Also: tokens and passwords, rate limits, security headers, the SSE hub, link-preview injection for `/e/:id` and its picture `/e/:id/og.png` (`preview.ts`: the SVG comes from `shared/preview.ts`, resvg turns it into a PNG), the start page per language (`/de` …) with `hreflang`, `robots.txt` and `sitemap.xml`, the retention sweep and the operator CLI (`commands.ts` holds the logic, `cli.ts` is the entry).
- `packages/client` — React 19 + Vite + Tailwind 4. No router library and no state library: `lib/route.ts`, `useSyncExternalStore` stores, a `SaveQueue` for auto-save. `lib/` is unit-tested in Node; components are tested end to end.
- `e2e/` — Playwright specs and the harness that starts a real server.

## Rules not up for discussion

- **Days are strings.** ESLint bans `new Date(<string literal>)`, `new Date(<template literal>)` and `Date.parse`; it cannot see a string in a variable, so `npm run test:tz` is the net for `new Date(day)`. Format days with the helpers in `shared/dates.ts`, which go through `Date.UTC` and `timeZone: 'UTC'`.
- **Nothing the organiser writes becomes a link.** Descriptions are plain text; link previews show the title, the state of the poll and the candidate days, never names or the description. Phishing is the abuse public poll tools attract.
- **No IP address is stored or logged by the application.** Rate limits live in memory. Request logging is off.
- **Secrets travel in the URL fragment** (`#admin=…`), never in a path or query, and the client strips the fragment after reading it.
- **`PUBLIC_URL` is the only source of absolute URLs.** The domain will change; nothing may hard-code it.
- **Reads never write.** Only a change extends an event's life; the retention date is computed by `shared/retention.ts` in one place.
- **zod at every boundary**: request bodies, API responses in the client, values read from local storage.
- **No requests to third parties** from the client: fonts are bundled, there is no analytics.

## Tests

Every change brings tests for its edge cases — empty input, transitions to and from empty, the first and last day, both directions of a drag, out-of-range values. Pure logic goes into `shared` and gets unit tests (fast-check for selection, toggles and ranking); routes get `inject` tests in `packages/server/test`; behaviour in the browser gets a Playwright spec, including a touch variant when it involves the calendar.

Touch drags are simulated two ways, because the browsers differ: CDP `Input.dispatchTouchEvent` in Chromium, synthetic touch `PointerEvent`s dispatched on the start cell in WebKit (that is what implicit pointer capture looks like). See `e2e/touch.ts`.

## GitHub

- Public repository with the ni-c settings canon: ruleset `protect-main` with the CI jobs as required checks and an admin bypass. Merge pull requests with `gh pr merge --squash --admin` once CI is green.
- The CI job names are the required checks. Adding a job is safe; renaming or removing one blocks every pull request until the ruleset is updated.
- Dependabot auto-merges patch and minor updates once CI passes; GitHub Actions bumps stay manual.
- Releases: a signed tag `vX.Y.Z` on `main` runs `release.yml`, which checks the tag against `package.json` and the CHANGELOG, publishes the multi-arch image to GHCR and creates the GitHub release. Steps in CONTRIBUTING.

## Traps

- **`npm install` can drop optional platform packages** (`@rolldown/binding-*`, `@tailwindcss/oxide-*`) from the lockfile on some machines; the Docker build and CI then fail. Use `npm ci`; after adding a dependency, check the lockfile diff for removed entries.
- **Touch pointers are captured implicitly** by the element where they went down: `event.target` stays the start cell for the whole drag and `pointerenter` never fires on the others. The paint engine therefore finds the cell under the finger by geometry.
- **`touch-action: none` belongs on the paintable day cells only.** The calendar always shows the whole range and can be taller than the screen; the week column, past days and the margins must still scroll the page on a phone (Crab Fit's most-reported mobile bug).
- **Never size the calendar to `window.innerHeight`.** Mobile browsers change it while scrolling, as the address bar slides in and out; a layout that follows it jumps. Month paging did exactly that and was removed.
- **No native modules in the server.** The Dockerfile installs the production dependencies once, on the build machine's architecture, and copies them into the amd64 and the arm64 image. That is why the preview pictures use `@resvg/resvg-wasm` and `wawoff2`, both WebAssembly.
- **resvg ignores the weight axis of a variable font**: bold text came out regular. The preview uses the static `@fontsource/nunito` files (400 and 800), not the variable font the client uses.
- **wawoff2 answers with a view into its own WebAssembly memory.** Unpacking the next, larger font grows that memory and detaches every earlier result ("Cannot perform %TypedArray%.prototype.set on a detached ArrayBuffer"). `preview.ts` copies each result out at once.
- **`PRAGMA user_version` holds `NAME_KEY_VERSION`** (`db/rekey.ts`). Raise it whenever `nameKey` in `shared` changes what it returns; the next start then recomputes the stored `name_key` values, and without it people typing their name the old way no longer find their entry.
- **Preview fonts:** Nunito covers Latin, Cyrillic and Vietnamese; Greek is drawn only by the CJK font; characters in other scripts are dropped, and a title left without a letter draws the app name.
- **The preview picture cache keeps one slot per event** (the newest version), so an old version never takes a slot from another event.
- **`node:sqlite` is a release candidate in Node 26.** Keep it behind `db/sqlite.ts`.
- **WebKit does not start on unsupported Linux distributions** (missing `libicu74` and friends). Run the WebKit projects in `mcr.microsoft.com/playwright:v<version>-noble` with a Node 26 on `PATH`; see CONTRIBUTING.
- **A drag must end where the pointer was released.** Moves are applied once per animation frame; a quick flick can end before the next frame, so `pointerup` applies its own position before the stroke is committed.
- **Playwright starts the `webServer` before `globalSetup`.** Anything the server reads at startup — the e2e data directory — has to be prepared in the `webServer` command itself; a reset in `globalSetup` comes too late and the server opens the previous run's database.
- **The SSE route hijacks the response**, so the `onSend` header hook does not run for it; it sets `ctx.headers` itself. Hang up on a stream through the hub (`hangUp`), which forgets it before ending it — a write to an ended response is an uncaught error. The hub closes in `preClose`: the server waits for open connections before `onClose`, and a live stream never ends on its own.
- **`events.version` moves on every write, marks included.** It is no concurrency token for the organiser's edits; the day list carries `baseDays` instead.
- **Anything async in a route happens before `db.tx`** (scrypt hashing above all), so what was checked before the `await` is checked again inside the transaction — the participant's `token_gen` and password hash included.
- **`snapshot()` returns a cached object** shared by every caller of that event version. Never mutate it, and never cache inside a transaction (a rollback would reuse the version number for other data).
- **resvg-wasm objects must be freed.** `Resvg` and the rendered image live in WebAssembly memory that V8 does not see; without `free()` every new picture leaks about 3 MB.
- **Node ignores `requestTimeout` while `headersTimeout` is longer**, so both are set together.
- **Every rate limit is keyed per network** (`networkKey`: the IPv6 /48 or the IPv4 address), the live-stream cap included; a /64 is what one customer gets, a /48 what one attacker rents.
- **Wrong passwords are counted before the check**, not after it: a miss recorded only after the `await` let parallel guesses all pass the wait.

## Working agreements

- Chat with the maintainer in German; everything in the repository in English.
- Commits are GPG-signed and carry no AI attribution lines.
- Keep this file true: when a rule, command or trap changes, change it here in the same pull request.
