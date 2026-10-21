import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const dir = join(import.meta.dirname, '..', '.github', 'workflows');
const files = readdirSync(dir).filter((name) => /\.ya?ml$/.test(name));

/** `grep -q` (or `-qs`, `--quiet`) as the reader of a pipe. */
const QUIET_GREP = /\|\s*grep\s+(?:-[A-Za-z]*q[A-Za-z]*|--quiet|--silent)\b/;

describe('workflow scripts', () => {
  it('find the workflow files', () => {
    expect(files).toContain('ci.yml');
    expect(files).toContain('release.yml');
  });

  it('never pipe into `grep -q`: it quits at the first match, and the writer dies of SIGPIPE or curl exit 23 under pipefail', () => {
    for (const name of files) {
      const lines = readFileSync(join(dir, name), 'utf8').split('\n');
      lines.forEach((line, index) => {
        if (line.trimStart().startsWith('#')) return;
        expect(QUIET_GREP.test(line), `${name}:${index + 1}: ${line}`).toBe(
          false
        );
      });
    }
  });

  it('recognises the pattern it forbids', () => {
    expect(QUIET_GREP.test('curl -fsS http://x/ | grep -q \'id="root"\'')).toBe(
      true
    );
    expect(QUIET_GREP.test('cmd | grep -qs x')).toBe(true);
    expect(QUIET_GREP.test('cmd | grep --quiet x')).toBe(true);
    expect(QUIET_GREP.test('grep -q \'id\' <<< "$page"')).toBe(false);
    expect(QUIET_GREP.test('git tag | grep -v -- - | head -n 1')).toBe(false);
  });
});
