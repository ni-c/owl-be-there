#!/usr/bin/env bash
# Prints the CHANGELOG section of one version, without its "## [x.y.z]" heading:
#
#     bash scripts/changelog-section.sh <version> [<changelog>]
#
# The section runs to the next "## [" heading or to the "[x.y.z]: url" link
# lines at the end of the file. Exits 1, printing nothing, when the version has
# no section. The release workflow uses it twice, to refuse a tag without
# release notes and to write the notes.
set -euo pipefail

version="${1:?usage: changelog-section.sh <version> [<changelog>]}"
changelog="${2:-CHANGELOG.md}"

awk -v heading="## [${version}]" '
  index($0, heading) == 1 && length($0) == length(heading) { found = 1; flag = 1; next }
  /^## \[/ || /^\[.*\]: / { flag = 0 }
  flag
  END { exit found ? 0 : 1 }
' "$changelog"
