<script lang="ts">
	import {
		Breadcrumb,
		BreadcrumbItem,
		Button,
		Card,
		CardBody
	} from '@bytebunker/daisyui-components';
</script>

<svelte:head>
	<title>Blueprints</title>
</svelte:head>

<Breadcrumb class="pt-0 pb-2">
	<BreadcrumbItem href="/">Pipelines</BreadcrumbItem>
	<BreadcrumbItem>Blueprints</BreadcrumbItem>
</Breadcrumb>

<div class="mb-8 flex items-center justify-between">
	<h1 class="font-stratos mb-1 text-3xl font-bold uppercase">Pipeline Blueprints</h1>
	<Button color="primary" href="/pipelines/blueprints">Blueprint erstellen</Button>
</div>

<div role="tablist" class="tabs tabs-lift translate-y-[1px]">
	<a role="tab" class="tab" href="/pipelines">Pipelines</a>
	<a role="tab" class="tab tab-active" href="/pipelines/blueprints">Blueprints</a>
</div>

<Card class="bg-base-100 border-base-300 rounded-tl-none border shadow-sm ">
	<CardBody class="overflow-hidden"></CardBody>
</Card>
