<script lang="ts">
	import { Handle, Position } from '@xyflow/svelte';
	import type { BlueprintNodeProps } from '$lib/components/pipeline/blueprintUtil.js';
	import { default as generateColorFromTextExport } from 'material-color-hash';
	import type { default as generateColorFromTextExportType } from 'material-color-hash';
	import { browser } from '$app/environment';

	const generateColorFromText = browser
		? generateColorFromTextExport
		: (generateColorFromTextExport.default as typeof generateColorFromTextExportType);

	console.log('generateColorFromText', generateColorFromText);

	let { data }: BlueprintNodeProps = $props();

	const moduleColor = generateColorFromText(data.moduleId, 500);
</script>

<div class="rounded-box bg-base-100 shadow-md">
	<div
		class="rounded-t-box border-b border-neutral-300 p-2 font-bold"
		style="background: linear-gradient(200deg, rgba(255,255,255, 0.4), transparent 100%), linear-gradient(0deg, {moduleColor.backgroundColor}, {moduleColor.backgroundColor}); color: {moduleColor.color}"
	>
		{data.moduleId}
	</div>
	<div>
		Test zeugs ...
		<Handle
			type="target"
			position={Position.Right}
			class="!size-3 rounded-none border-none !bg-teal-500"
		/>
		<Handle
			type="target"
			position={Position.Right}
			class="!size-3 rounded-none border-none !bg-teal-500"
		/>
	</div>
</div>
<!--
<div class="rounded-box border border-neutral-400 bg-white px-4 py-2 shadow-md">
	<div class="flex">
		<div class="ml-2">
			<div>{data.moduleId}</div>
		</div>
	</div>
	<Handle
		type="target"
		position={Position.Top}
		class="!size-3 rounded-none border-none !bg-teal-500"
	/>
	<Handle
		type="source"
		position={Position.Bottom}
		class="!size-3 rounded-none border-none !bg-teal-500"
	/>
</div>
-->
