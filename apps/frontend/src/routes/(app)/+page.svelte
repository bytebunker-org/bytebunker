<script lang="ts">
	import { Card, CardBody } from '@bytebunker/daisyui-components';
	import MainLayout from '$lib/components/MainLayout.svelte';
	import LucideHouse from '~icons/lucide/house';
</script>

<MainLayout icon={LucideHouse} title="Home" isHome>
	<Card class="bg-base-100 border-base-300 rounded-box border shadow">
		<CardBody class="overflow-hidden p-4 pb-8">TODO</CardBody>
	</Card>
</MainLayout>

<div class="prose">
	<h1>Welcome to ByteBunker!</h1>

	The main page will soon contain a dashboard.
</div>
