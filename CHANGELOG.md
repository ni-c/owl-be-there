# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

<!-- The release workflow extracts the section of the version being tagged with
     awk, matching "## [x.y.z]". Keep that heading shape exactly. -->

## [Unreleased]

### Added

- Project scaffold: npm workspaces for the shared domain logic, the server and the client; linting, type checks, unit tests and CI.
- Shared calendar logic: dates as plain `YYYY-MM-DD` strings, candidate days from a range and weekdays, the week grid with month pages, rectangle selection and the weekday, week and all/none toggles, ranking of days and of blocks of consecutive days with "maybe" and a minimum head count, the retention date, `.ics` files and Google Calendar links, and a dependency-free QR encoder.

[Unreleased]: https://github.com/ni-c/owl-be-there/commits/main
