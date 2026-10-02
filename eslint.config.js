// @ts-check
import js from '@eslint/js';
import jsxA11y from 'eslint-plugin-jsx-a11y';
import reactHooks from 'eslint-plugin-react-hooks';
import tseslint from 'typescript-eslint';

/**
 * Calendar days are plain `YYYY-MM-DD` strings in this code base, never `Date`
 * objects. `new Date('2027-03-08')` parses as midnight UTC, which is the
 * previous evening anywhere west of Greenwich — the classic way a calendar app
 * shows every day shifted by one. The two shapes that do it are banned outright;
 * `packages/shared/src/dates.ts` is the only place that turns a day into a
 * `Date`, and it does so in UTC on purpose.
 */
const DATE_PARSING = [
  {
    selector:
      "NewExpression[callee.name='Date'][arguments.length=1][arguments.0.type=/^(Literal|TemplateLiteral)$/]",
    message:
      'Do not parse dates with `new Date(string)`; use the helpers in packages/shared/src/dates.ts.',
  },
  {
    selector:
      "CallExpression[callee.object.name='Date'][callee.property.name='parse']",
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
    files: ['**/*.js'],
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
