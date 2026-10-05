import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';

const dir = mkdtempSync(join(tmpdir(), 'owl-changelog-'));
afterAll(() => rmSync(dir, { recursive: true, force: true }));

const CHANGELOG = `# Changelog

## [Unreleased]

### Added

- Something new.

## [0.1.1] - 2026-10-02

### Fixed

- A fix.

## [0.1.0] - 2026-10-01

### Added

- The first release.

[Unreleased]: https://example.org/compare/v0.1.1...HEAD
[0.1.1]: https://example.org/compare/v0.1.0...v0.1.1
[0.1.0]: https://example.org/releases/tag/v0.1.0
`;

let counter = 0;
function section(version: string, changelog = CHANGELOG) {
  counter += 1;
  const file = join(dir, `CHANGELOG-${counter}.md`);
  writeFileSync(file, changelog);
  const result = spawnSync(
    'bash',
    [join(import.meta.dirname, 'changelog-section.sh'), version, file],
    { encoding: 'utf8' }
  );
  return { status: result.status, out: result.stdout };
}

describe('changelog-section.sh', () => {
  it('prints the section after [Unreleased] up to the next heading', () => {
    const { status, out } = section('0.1.1');
    expect(status).toBe(0);
    expect(out).toContain('- A fix.');
    expect(out).not.toContain('first release');
    expect(out).not.toContain('## [');
  });

  it('stops the last section at the link lines', () => {
    const { status, out } = section('0.1.0');
    expect(status).toBe(0);
    expect(out).toContain('- The first release.');
    expect(out).not.toContain('https://');
  });

  it('prints nothing and exits 1 for a version without a section', () => {
    expect(section('9.9.9')).toEqual({ status: 1, out: '' });
  });

  it('does not take a prefix of a version for the version', () => {
    expect(section('0.1')).toEqual({ status: 1, out: '' });
    expect(section('0.1.')).toEqual({ status: 1, out: '' });
  });

  it('does not take a dot for any character', () => {
    expect(section('0x1x1')).toEqual({ status: 1, out: '' });
  });

  it('prints only headings for a section that holds nothing else', () => {
    const { status, out } = section(
      '1.0.0',
      '## [1.0.0]\n\n### Added\n\n## [0.9.0]\n\n- Old.\n'
    );
    expect(status).toBe(0);
    expect(out.split('\n').filter((line) => /^[^#\s]/.test(line))).toEqual([]);
  });

  it('finds a heading with and without a date, and no longer version', () => {
    const changelog =
      '## [0.1.10] - 2026-10-05\n\n- Ten.\n\n## [0.1.1]\n\n- One.\n';
    expect(section('0.1.10', changelog).out).toContain('- Ten.');
    expect(section('0.1.1', changelog).out).toContain('- One.');
    expect(section('0.1.1', changelog).out).not.toContain('Ten');
  });

  it("finds the repository's own section for the current version", () => {
    const root = join(import.meta.dirname, '..');
    const { version } = JSON.parse(
      readFileSync(join(root, 'package.json'), 'utf8')
    ) as { version: string };
    const { status, out } = section(
      version,
      readFileSync(join(root, 'CHANGELOG.md'), 'utf8')
    );
    expect(status).toBe(0);
    expect(out.split('\n').some((line) => /^[^#\s]/.test(line))).toBe(true);
  });

  it('exits 1 for an empty CHANGELOG', () => {
    expect(section('0.1.0', '')).toEqual({ status: 1, out: '' });
  });
});
