// @ts-check
import js from '@eslint/js';
import jsxA11y from 'eslint-plugin-jsx-a11y';
import reactHooks from 'eslint-plugin-react-hooks';
import tseslint from 'typescript-eslint';

/**
 * Calendar days are plain `YYYY-MM-DD` strings in this code base, never `Date`
 * objects. `new Date('2027-03-08')` parses as midnight UTC, which is the
 * previous evening anywhere west of Greenwich — the classic way a calendar app
 * shows every day shifted by one. The shapes that do it are banned outright:
 * `new Date(<string literal>)`, `new Date(<template literal>)` and
 * `Date.parse`. `packages/shared/src/dates.ts` is the only place that turns a
 * day into a `Date`, and it does so in UTC on purpose.
 *
 * Without type information the rule cannot tell `new Date(day)` (a string
 * variable) from `new Date(timestamp)` (a number), so variables are not caught
 * here; `npm run test:tz` is the net for those.
 */
const DATE_PARSING_MESSAGE =
  'Do not parse dates with `new Date(string)`; use the helpers in packages/shared/src/dates.ts.';
const DATE_PARSING = [
  {
    selector:
      "NewExpression[callee.name='Date'][arguments.length=1][arguments.0.type='TemplateLiteral']",
    message: DATE_PARSING_MESSAGE,
  },
  {
    selector:
      "NewExpression[callee.name='Date'][arguments.length=1][arguments.0.type='Literal'][arguments.0.value=type(string)]",
    message: DATE_PARSING_MESSAGE,
  },
  {
    // `Date.parse(...)`, `Date['parse'](...)` and `globalThis.Date.parse(...)`.
    selector:
      "CallExpression:matches([callee.object.name='Date'], [callee.object.property.name='Date']):matches([callee.property.name='parse'], [callee.property.value='parse'])",
    message:
      'Do not use `Date.parse`; use the helpers in packages/shared/src/dates.ts.',
  },
];

export default tseslint.config(
  {
    ignores: [
      '**/dist/',
      '**/coverage/',
      'test-results/',
      'playwright-report/',
      'e2e/.tmp/',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    // Type-aware rules for the TypeScript files. The project service is not
    // used: it picks the nearest tsconfig.json, and for `packages/*/test` that
    // is the server's or shared's build config, which covers `src` only. The
    // explicit list is every config that already typechecks these files — the
    // per-package ones for `src` (and the client's `test`) and the root one for
    // the other tests, `e2e/` and `scripts/`.
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      parserOptions: {
        project: ['packages/*/tsconfig.json', 'tsconfig.tests.json'],
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      // A promise nobody awaits loses its error and, in a Playwright spec, its
      // assertion. `void` marks a deliberate fire-and-forget.
      '@typescript-eslint/no-floating-promises': 'error',
      // An async function where a `() => void` is expected drops its rejection.
      '@typescript-eslint/no-misused-promises': 'error',
    },
  },
  {
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          ignoreRestSiblings: true,
        },
      ],
      'no-restricted-syntax': ['error', ...DATE_PARSING],
    },
  },
  {
    // The config files are plain JavaScript and are linted without type
    // information.
    files: ['**/*.js'],
    extends: [tseslint.configs.disableTypeChecked],
    languageOptions: {
      globals: { process: 'readonly', console: 'readonly', URL: 'readonly' },
    },
  },
  {
    // The client is the only code that renders markup, so accessibility and the
    // rules of hooks are checked there and nowhere else.
    ...jsxA11y.flatConfigs.recommended,
    files: ['packages/client/**/*.tsx'],
  },
  {
    files: ['packages/client/**/*.{ts,tsx}'],
    plugins: { 'react-hooks': reactHooks },
    rules: {
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'error',
    },
  }
);
