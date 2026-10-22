<script lang="ts">
	import MainLayout from '$lib/components/MainLayout.svelte';
	import LucideSettings from '~icons/lucide/settings';
	import LucideMapPin from '~icons/lucide/map-pin';

	const sections = [
		{
			href: '/settings/places',
			icon: LucideMapPin,
			title: 'Eigene Orte',
			description:
				'Zuhause, Arbeit und andere Orte mit eigenem Namen. Sie gehen allen Geocoding-Anbietern vor und bestimmen, wann du wo gewohnt und gearbeitet hast.'
		}
	];
</script>

<MainLayout icon={LucideSettings} title="Einstellungen">
	<div class="grid grid-cols-1 gap-4 pb-8 md:grid-cols-2 xl:grid-cols-3">
		{#each sections as section (section.href)}
			<a href={section.href} class="card bg-base-100 hover:bg-base-300 shadow-sm transition-colors">
				<div class="card-body">
					<h2 class="card-title">
						<section.icon />
						{section.title}
					</h2>
					<p class="text-base-content/70 text-sm">{section.description}</p>
				</div>
			</a>
		{/each}
	</div>
</MainLayout>
