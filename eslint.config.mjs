// Flat ESLint config (ESLint 9 + typescript-eslint 8, since 1.7.9).
//
// Migration notes from the former .eslintrc.js (eslint 8 / ts-eslint 6):
//   - extends eslint:recommended + @typescript-eslint recommended +
//     recommended-requiring-type-checking + strict  ==>  js.configs.recommended
//     + tseslint.configs.strictTypeChecked (the v8 superset of both).
//   - parserOptions.project ==> projectService (the v8 recommended wiring).
//   - env node/jest ==> languageOptions.globals.
//   - react-hooks/recommended ==> the two rules inline (version-agnostic).
//   - eslint-plugin-css-modules and eslint-plugin-neverthrow were listed /
//     installed but had zero configured rules - dropped along with the
//     migration (dead config).
//   - The frozen-debt policy is unchanged: the disabled no-unsafe-* /
//     promise rules are force-tracked by scripts/lint-ratchet.mjs against
//     eslint-baseline.json; enable a rule here only when its baseline
//     counters reach zero (MAINTAINING.md, "Lint gate").
import js from '@eslint/js'
import globals from 'globals'
import tseslint from 'typescript-eslint'
import prettier from 'eslint-config-prettier'
import noInlineStyles from 'eslint-plugin-no-inline-styles'
import reactHooks from 'eslint-plugin-react-hooks'

export default tseslint.config(
	{
		ignores: [
			'main.js',
			'node_modules/**',
			'dist/**',
			'build/**',
			'coverage/**',
			'pglite-assets/**',
			'esbuild.config.mjs',
			'jest.config.js',
			'version-bump.mjs',
			'import-meta-url-shim.js',
		],
	},
	js.configs.recommended,
	...tseslint.configs.strictTypeChecked,
	prettier,
	{
		files: ['src/**/*.{ts,tsx}'],
		languageOptions: {
			parserOptions: {
				projectService: true,
				tsconfigRootDir: import.meta.dirname,
				sourceType: 'module',
			},
			globals: {
				...globals.node,
				...globals.jest,
				...globals.browser,
			},
		},
		plugins: {
			'no-inline-styles': noInlineStyles,
			'react-hooks': reactHooks,
		},
		rules: {
			// react-hooks recommended, pinned explicitly
			'react-hooks/rules-of-hooks': 'error',
			'react-hooks/exhaustive-deps': 'warn',

			// carried over from the eslintrc, unchanged
			'@typescript-eslint/no-empty-function': 'off',
			'@typescript-eslint/require-await': 'off',
			'@typescript-eslint/consistent-type-definitions': ['warn', 'type'],
			'@typescript-eslint/no-extraneous-class': 'off',
			'@typescript-eslint/no-useless-constructor': 'off',
			'sort-imports': [
				'error',
				{
					ignoreCase: false,
					ignoreDeclarationSort: true,
					ignoreMemberSort: false,
					memberSyntaxSortOrder: ['none', 'all', 'multiple', 'single'],
					allowSeparatedGroups: true,
				},
			],
			'no-console': 'warn',
			'no-inline-styles/no-inline-styles': 'error',
			'@typescript-eslint/consistent-type-assertions': [
				'error',
				{ assertionStyle: 'never' },
			],
			'@typescript-eslint/no-unnecessary-type-assertion': 'error',
			'@typescript-eslint/prefer-regexp-exec': 'error',

			// frozen debt: force-tracked by scripts/lint-ratchet.mjs against
			// eslint-baseline.json - enable here only at zero counters
			'@typescript-eslint/no-unsafe-assignment': 'off',
			'@typescript-eslint/no-unsafe-member-access': 'off',
			'@typescript-eslint/no-unsafe-call': 'off',
			'@typescript-eslint/no-unnecessary-condition': 'off',
			'@typescript-eslint/no-misused-promises': 'off',

			// require the strictNullChecks compiler option and only emit
			// "This rule requires strictNullChecks" meta-errors without it
			// (tsconfig has strict: false). Disabled until a strict-mode
			// migration; re-enable together with it (1.7.10).
			'@typescript-eslint/no-useless-default-assignment': 'off',
			'@typescript-eslint/no-unnecessary-boolean-literal-compare': 'off',

			// enabled in 1.7.10 after burning the last 4 findings:
			// '@typescript-eslint/no-floating-promises' now comes from
			// strictTypeChecked and is no longer force-tracked/off
		},
	},
)
