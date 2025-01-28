<script lang="ts">
	import { FieldErrors } from 'formsnap';
	import { t } from 'svelte-i18n';
	import type { MessageFormatter } from '$lib/type/MessageFormatterType.js';

	const formErrorMessageKeys: Record<string, `formError.${string}`> = {
		'Invalid length: Expected !0': 'formError.notEmpty',
		'Invalid email': 'formError.invalidEmail'
	};

	function translateErrors(t: MessageFormatter, errors: string[]) {
		return errors.map((error) => {
			if (error.startsWith('formError.')) {
				return t(error);
			}

			for (const key in formErrorMessageKeys) {
				if (error.startsWith(key)) {
					return t(formErrorMessageKeys[key]);
				}
			}

			return error;
		});
	}
</script>

<FieldErrors>
	{#snippet children({ errors, errorProps })}
		{#each translateErrors($t, errors) as error}
			<div class="text-error" {...errorProps}>{error}</div>
		{/each}
	{/snippet}
</FieldErrors>
