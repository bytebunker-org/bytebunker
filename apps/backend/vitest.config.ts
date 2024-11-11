import swc from 'unplugin-swc';
import { defineConfig } from 'vitest/config';

export default defineConfig({
    test: {
        globals: true,
        root: './',
        coverage: {
            provider: 'v8',
            exclude: [
                'coverage/**',
                'dist/**',
                'packages/*/test?(s)/**',
                '**/*.d.ts',
                '**/virtual:*',
                '**/__x00__*',
                '**/\x00*',
                'cypress/**',
                'test?(s)/**',
                'test?(-*).?(c|m)[jt]s?(x)',
                '**/*{.,-}{test,spec}.?(c|m)[jt]s?(x)',
                '**/__tests__/**',
                '**/{karma,rollup,webpack,vite,vitest,jest,ava,babel,nyc,cypress,tsup,build}.config.*',
                '**/vitest.{workspace,projects}.[jt]s?(on)',
                '**/.{eslint,mocha,prettier}rc.{?(c|m)js,yml}',
                'src/**/*.constant.ts',
                'src/**/*.dto.ts',
                'src/**/*.decorator.ts',
                'src/**/*.entity.ts',
                'src/**/*.enum.ts',
                'src/**/*.type.ts',
            ],
        },
    },
    plugins: [
        // This is required to build the test files with SWC
        // @ts-ignore
        swc.vite({
            module: {
                // Explicitly set the module type to avoid inheriting this value from a `.swcrc` config file
                type: 'es6',
            },
        }),
    ],
});
