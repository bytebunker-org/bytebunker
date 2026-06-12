import { defineConfig } from 'vitest/config';
import { sveltekit } from '@sveltejs/kit/vite';
import tailwindcss from '@tailwindcss/vite';
import Icons from 'unplugin-icons/vite';
import { imagetools } from '@zerodevx/svelte-img/vite';
import { FileSystemIconLoader } from 'unplugin-icons/loaders';
import type { Plugin } from 'vite';
import { dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

// Absolute path to the app's main Tailwind entry, which carries the custom daisyui theme tokens.
const appCssPath = fileURLToPath(new URL('./src/lib/css/app.css', import.meta.url));

function autoInjectTWTheme() {
	return {
		name: 'auto-inject-tailwind-theme',
		transform(src, id) {
			if (/\.svelte$/.test(id)) {
				if (src.includes('<style')) {
					// Tailwind v4 `@reference` (vs `@import ... theme(reference)`) so component <style>
					// blocks can use theme()/@apply without emitting the theme. Under Vite 8/Rolldown an
					// `@import` is eagerly inlined by the CSS resolver before @tailwindcss/vite runs,
					// leaking raw `@theme` into lightningcss; `@reference` is left for Tailwind to strip.
					// Reference app.css (not bare `tailwindcss`) so the custom daisyui tokens resolve.
					let ref = relative(dirname(id), appCssPath).replaceAll('\\', '/');
					if (!ref.startsWith('.')) ref = `./${ref}`;
					src = src.replace(/(<style ?.*?>)/g, `$1\n@reference '${ref}';`);
				}
				return { code: src, map: null };
			}
		}
	} satisfies Plugin;
}

export default defineConfig({
	plugins: [
		tailwindcss(),
		autoInjectTWTheme(),
		sveltekit(),
		imagetools(),
		Icons({
			compiler: 'svelte',
			customCollections: {
				custom: FileSystemIconLoader('./src/lib/assets/icons')
			}
		})
	],
	test: {
		include: ['src/**/*.{test,spec}.{js,ts}']
	},
	server: {
		host: true,
		port: 12101,
		strictPort: true
	},
	preview: {
		host: true,
		port: 12101,
		strictPort: true
	}
});
