# Contributing

Thank you for wanting to help. Bug reports, ideas and pull requests are all welcome — please open an issue first for anything larger than a small fix, so we can agree on the shape before you spend an evening on it.

## Development setup

You need Node.js 26 (see `.nvmrc`) and npm.

```sh
npm ci
npm run dev
```

`npm run dev` builds the shared package, then runs the API on <http://localhost:8080> and the client with hot reload on <http://localhost:5173>, which forwards `/api` to the API.

Always install with `npm ci`. A plain `npm install` on some machines drops the optional platform packages of Rolldown and Tailwind from `package-lock.json`, and the Docker build and CI fail on the next run. If you add a dependency, check the lockfile diff for removed `@rolldown/binding-*` or `@tailwindcss/oxide-*` entries.

## Checks

| Command                 | What it does                                                                        |
| ----------------------- | ----------------------------------------------------------------------------------- |
| `npm run lint`          | ESLint (including accessibility rules for the client) and Prettier                  |
| `npm run typecheck`     | TypeScript over every package, the tests and the end-to-end suite                   |
| `npm test`              | The unit and API tests — no database server, no browser                             |
| `npm run test:coverage` | The same, with coverage thresholds                                                  |
| `npm run test:tz`       | The date-handling tests under six time zones, at a minute before and after midnight |
| `npm run test:e2e`      | Playwright in Chromium and WebKit, desktop and mobile with touch                    |
| `npm run ci:local`      | All of the above, plus `npm audit` and a secret scan                                |

The end-to-end suite needs the browsers once: `npx playwright install chromium webkit`. On a Linux distribution Playwright does not support, WebKit will not start; run the suite in the official image instead, after `npm run build`:

```sh
docker run --rm --ipc=host -u "$(id -u):$(id -g)" -e HOME=/tmp -v "$PWD:/work" -w /work \
  mcr.microsoft.com/playwright:v1.63.0-noble npx playwright test --config e2e/playwright.config.ts
```

The image must carry Node 26; if its Node is older, mount a Node 26 installation and put it first on `PATH`.

## Conventions

- Everything in the repository is English: code, comments, commit messages, pull requests.
- Calendar days are `YYYY-MM-DD` strings. Never parse them with `new Date(string)` — the linter refuses it, and `packages/shared/src/dates.ts` has what you need.
- Every change comes with tests, including the edge cases: empty input, the first and last day, both directions of a selection, values out of range.
- The application makes no requests to third parties — no fonts, no scripts, no analytics. Keep it that way.
- Commit messages are imperative ("Add the week toggle", not "Added …").

## Releasing

Maintainers only.

1. Move the entries under `## [Unreleased]` in `CHANGELOG.md` to a new `## [x.y.z] - YYYY-MM-DD` section and add its link reference at the bottom.
2. Set the version in the root `package.json` and in the three workspace manifests.
3. Open a pull request, let CI pass, merge it.
4. Tag the merge commit on `main` with a signed tag and push it: `git tag -s vx.y.z -m vx.y.z && git push origin vx.y.z`.

The release workflow checks that the tag matches the version and that the CHANGELOG has a section for it, publishes the container image to `ghcr.io/ni-c/owl-be-there` and creates the GitHub release. Never move a tag that has been pushed.
