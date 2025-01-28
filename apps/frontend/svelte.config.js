import adapter from '@sveltejs/adapter-cloudflare';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

/** @type {import('@sveltejs/kit').Config} */
const config = {
	preprocess: vitePreprocess(),
	kit: {
		adapter: adapter()
	},
	compilerOptions: {
		warningFilter: (warning) => {
			return !['a11y_no_noninteractive_element_interactions'].includes(warning.code);
		}
	}
};

export default config;
