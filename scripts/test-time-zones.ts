/**
 * The shared and client unit suites under several time zones.
 *
 * Calendar code breaks at the edges of the day, and only in some places: a
 * `Date` built from a day string is midnight UTC, which is yesterday evening
 * west of Greenwich. These zones cover both ends of the offset range (UTC+14,
 * UTC-11), a half-hour offset and the zone most users are in. No zone is
 * here for a daylight-saving shift: the pinned moments of the tests fall on no
 * transition, so a zone with one would add nothing. The tests that care about the moment of the day pin the
 * clock to just before and just after local midnight themselves.
 */
import { spawnSync } from 'node:child_process';

const ZONES = [
  'UTC',
  'Pacific/Kiritimati',
  'Pacific/Pago_Pago',
  'America/St_Johns',
  'Europe/Berlin',
];

for (const zone of ZONES) {
  console.log(`\n── TZ=${zone}`);
  const result = spawnSync(
    'npx',
    ['vitest', 'run', '--project', 'shared', '--project', 'client'],
    { stdio: 'inherit', env: { ...process.env, TZ: zone } }
  );
  // Not a failing suite: the child never ran (npx missing) or was killed.
  if (result.error) {
    console.error(`\nCould not run the suite under TZ=${zone}:`);
    throw result.error;
  }
  if (result.signal) {
    console.error(
      `\nThe suite under TZ=${zone} was killed by ${result.signal}.`
    );
    process.exit(1);
  }
  if (result.status !== 0) {
    console.error(`\nThe suite failed under TZ=${zone}.`);
    process.exit(result.status ?? 1);
  }
}
