module.exports = {
    root: true,
    extends: [
        'eslint:recommended',
        'plugin:@typescript-eslint/eslint-recommended',
        'plugin:@typescript-eslint/recommended',
        /* 'plugin:@typescript-eslint/recommended-requiring-type-checking', */
        'prettier'
    ],
    parser: '@typescript-eslint/parser',
    parserOptions: {
        project: ['tsconfig.json']
    },
    plugins: ['@typescript-eslint', 'simple-import-sort'],
    env: {
        browser: true,
        es2017: true,
        node: true
    },
    rules: {
        '@typescript-eslint/ban-ts-comment': 'off',
        '@typescript-eslint/consistent-type-imports': 'warn',
        // Enforce backticks
        // Note you must disable the base rule as it can report incorrect errors.
        quotes: 'off',
        // TypeScript makes these safe & effective
        'no-case-declarations': 'off',
        'simple-import-sort/imports': [
            'warn',
            {
                groups: []
            }
        ],
        // Same approach used by TypeScript noUnusedLocals
        '@typescript-eslint/no-unused-vars': ['warn', {varsIgnorePattern: '^_', argsIgnorePattern: '^_'}],
        // Turn training wheels off. When we want these we want these.
        '@typescript-eslint/no-non-null-assertion': 'off',
        '@typescript-eslint/no-unsafe-argument': 'off',
        '@typescript-eslint/no-unsafe-return': 'off',
        '@typescript-eslint/no-explicit-any': 'off'
    }
};
