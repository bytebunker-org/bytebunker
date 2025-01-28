import '@sveltejs/kit';
import 'unplugin-icons/types/svelte';

declare global {
	namespace App {
		// interface Error {}
		interface Locals {
			language: SupportedLocale;

			user: UserSessionDto | undefined;
		}
		// interface PageData {}
		// interface PageState {}
		// interface Platform {}

		namespace Superforms {
			type Message = ISuperformsMessage;
		}
	}

	interface Window {
		testingNavigationState?: 'during-navigation' | 'finished-navigation';
	}
}

declare module '$lib/asset/*' {
	const meta: unknown[];
	export default meta;
}

export {};
