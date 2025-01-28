import { defineConfig } from 'vitest/config';
import { sveltekit } from '@sveltejs/kit/vite';
import tailwindcss from '@tailwindcss/vite';
import Icons from 'unplugin-icons/vite';
import { imagetools } from '@zerodevx/svelte-img/vite';
import { FileSystemIconLoader } from 'unplugin-icons/loaders';
import type { Plugin } from 'vite';

function autoInjectTWTheme() {
	return {
		name: 'auto-inject-tailwind-theme',
		transform(src, id) {
			if (/\.svelte$/.test(id)) {
				if (src.includes('<style')) {
					src = src.replace(/(<style ?.*?>)/g, `$1\n@import 'tailwindcss/theme' theme(reference);`);
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
		port: 5179,
		strictPort: true
	},
	preview: {
		host: true,
		port: 5179,
		strictPort: true
	}
});
