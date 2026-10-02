# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

<!-- The release workflow extracts the section of the version being tagged with
     awk, matching "## [x.y.z]". Keep that heading shape exactly. -->

## [Unreleased]

## [0.1.0] - 2026-10-02

### Added

- Project scaffold: npm workspaces for the shared domain logic, the server and the client; linting, type checks, unit tests and CI.
- Shared calendar logic: dates as plain `YYYY-MM-DD` strings, candidate days from a range and weekdays, the week grid with month pages, rectangle selection and the weekday, week and all/none toggles, ranking of days and of blocks of consecutive days with "maybe" and a minimum head count, the retention date, `.ics` files and Google Calendar links, and a dependency-free QR encoder.
- The server: Fastify with SQLite through Node's built-in `node:sqlite`. Events, participants with an optional password, auto-saved marks that never let an older save overwrite a newer one, the organiser's changes, closing, choosing a date and deleting; live updates over server-sent events; link previews with the event title for messengers; calendar files; automatic deletion 90 days after the last change; rate limits kept in memory; strict security headers; no IP address in the database or the log; an operator command line.
- A container image: built on Node 26 Alpine, without npm, running read-only as a non-root user with a health check, for amd64 and arm64; CI builds, scans and smoke-tests both.
- The web app: a calendar to paint the days you can make — tap a day, drag across several, or use the keyboard — with a "maybe" brush, undo, weekday and week toggles and auto-save; the group's answers as a heatmap in the same calendar with the best days or blocks, a sheet per day naming who can, and live updates; an organiser mode to edit the event, correct entries, close it, choose the date with a calendar file and a Google Calendar link, or delete it; sharing by link, QR code and a ready-made invitation; English and German, light and dark, with a hand-drawn owl.
- A release workflow that publishes the image to `ghcr.io/ni-c/owl-be-there` with an SBOM and build provenance, and a README with self-hosting instructions.
- End-to-end tests in Chromium and WebKit, on desktop and on phones with touch, including accessibility checks in light and dark mode.

[Unreleased]: https://github.com/ni-c/owl-be-there/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/ni-c/owl-be-there/releases/tag/v0.1.0
