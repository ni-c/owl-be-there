/**
 * The shared and client unit suites under several time zones.
 *
 * Calendar code breaks at the edges of the day, and only in some places: a
 * `Date` built from a day string is midnight UTC, which is yesterday evening
 * west of Greenwich. These zones cover both ends of the offset range (UTC+14,
 * UTC-11), a half-hour offset, a half-hour daylight-saving shift and the zone
 * most users are in. The tests that care about the moment of the day pin the
 * clock to just before and just after local midnight themselves.
 */
import { spawnSync } from 'node:child_process';

const ZONES = [
  'UTC',
  'Pacific/Kiritimati',
  'Pacific/Pago_Pago',
  'America/St_Johns',
  'Australia/Lord_Howe',
  'Europe/Berlin',
];

for (const zone of ZONES) {
  console.log(`\n── TZ=${zone}`);
  const result = spawnSync(
    'npx',
    ['vitest', 'run', '--project', 'shared', '--project', 'client'],
    { stdio: 'inherit', env: { ...process.env, TZ: zone } }
  );
  if (result.status !== 0) {
    console.error(`\nThe suite failed under TZ=${zone}.`);
    process.exit(result.status ?? 1);
  }
}
