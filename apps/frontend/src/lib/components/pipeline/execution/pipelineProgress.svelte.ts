import { useQueryClient } from '@tanstack/svelte-query';
import { PUBLIC_API_BASE_URL } from '$env/static/public';
import { PipelineExecutionStatusEnum } from '@bytebunker/backend';
import type { NodeProgressDto, PipelineProgressDto } from '@bytebunker/backend';
import { PipelineApi } from '$lib/api/PipelineApi.js';

export const pipelineProgressQueryKey = (executionId: number) =>
	['pipeline-progress', executionId] as const;

export function isTerminalStatus(status: string | undefined): boolean {
	return (
		status === PipelineExecutionStatusEnum.SUCCESS ||
		status === PipelineExecutionStatusEnum.FAILED ||
		status === PipelineExecutionStatusEnum.ABORTED
	);
}

interface Options {
	executionId: () => number;
	/** True while the execution is not finished; then the SSE stream is used, otherwise one fetch. */
	live: () => boolean;
	/** Called once when the stream reports a finished execution. */
	onEnd?: () => void;
}

/**
 * Keeps the progress of an execution up to date: SSE while it is live, polling every 2 s if the
 * EventSource fails. The latest value is also written to the query cache so modals can read it.
 * Must be called during component initialisation.
 */
export function createPipelineProgress(options: Options) {
	const queryClient = useQueryClient();

	let progress = $state<PipelineProgressDto>();

	$effect(() => {
		const executionId = options.executionId();
		const live = options.live();

		let stopped = false;
		let source: EventSource | undefined;
		let pollTimer: ReturnType<typeof setInterval> | undefined;

		function stop() {
			stopped = true;
			source?.close();
			source = undefined;
			if (pollTimer) {
				clearInterval(pollTimer);
				pollTimer = undefined;
			}
		}

		function publish(value: PipelineProgressDto) {
			if (stopped) {
				return;
			}
			progress = value;
			queryClient.setQueryData(pipelineProgressQueryKey(executionId), value);
			if (live && isTerminalStatus(value.executionStatus)) {
				stop();
				options.onEnd?.();
			}
		}

		async function fetchOnce() {
			try {
				publish(await PipelineApi.getProgress(executionId));
			} catch {
				// keep the last known progress
			}
		}

		function startPolling() {
			if (!stopped && !pollTimer) {
				pollTimer = setInterval(fetchOnce, 2000);
			}
		}

		if (!live) {
			void fetchOnce();
		} else if (typeof EventSource === 'undefined') {
			void fetchOnce();
			startPolling();
		} else {
			source = new EventSource(PUBLIC_API_BASE_URL + PipelineApi.progressStreamPath(executionId), {
				withCredentials: true
			});
			source.onmessage = (event) => {
				try {
					publish(JSON.parse(event.data) as PipelineProgressDto);
				} catch {
					// ignore malformed events
				}
			};
			source.onerror = () => {
				// Browsers reconnect on their own, which would restart a finished stream. Poll instead.
				source?.close();
				source = undefined;
				void fetchOnce();
				startPolling();
			};
		}

		return stop;
	});

	return {
		get progress() {
			return progress;
		},
		get nodeProgress(): Record<number, NodeProgressDto> | undefined {
			if (!progress) {
				return undefined;
			}
			return Object.fromEntries(progress.nodes.map((n) => [n.nodeId, n]));
		}
	};
}
