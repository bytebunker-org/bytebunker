import { DateTime } from 'luxon';
import type { DurationLike } from 'luxon';
import type { Component } from 'svelte';
import type { SvelteHTMLElements } from 'svelte/elements';
import LucideCircleCheck from '~icons/lucide/circle-check';
import LucideCircleAlert from '~icons/lucide/circle-alert';
import LucideInfo from '~icons/lucide/info';
import LucideTriangleAlert from '~icons/lucide/triangle-alert';

export interface ToastOptions {
	message: string;
	duration: DurationLike;
	alertClass: string;
	/**
	 * Icon svelte component
	 */
	icon: Component<SvelteHTMLElements['svg']> | undefined;
	iconClass: string;
}

export interface ToastData extends ToastOptions {
	id: number;
	created: DateTime;
	lifetimeEnd: DateTime;
}

class ToastManager {
	private _visibleToasts = $state<ToastData[]>([]);
	private toastIdCounter = $state(0);

	public get visibleToasts(): ToastData[] {
		return this._visibleToasts;
	}

	public onMount() {
		$effect(() => {
			const intervalId = setInterval(() => this.updateToasts(), 500);
			this.updateToasts();

			return () => clearInterval(intervalId);
		});
	}

	public updateToasts() {
		const now = DateTime.now();

		this._visibleToasts = this.visibleToasts.filter((t) => now <= t.lifetimeEnd);
	}

	public hideToast(toastId: number) {
		this._visibleToasts = this.visibleToasts.filter((t) => t.id !== toastId);
	}

	public showToast(options: Partial<ToastOptions>): void {
		const defaultOptions: Omit<ToastData, 'lifetimeEnd'> = {
			id: this.toastIdCounter++,
			message: '',
			duration: {
				millisecond: 2500
			},
			alertClass: '',
			icon: undefined,
			iconClass: '',
			created: DateTime.now()
		};

		this._visibleToasts = [
			...this.visibleToasts.filter((t) => t.message !== options.message),
			{
				...defaultOptions,
				...options,
				lifetimeEnd: DateTime.now().plus(options.duration || defaultOptions.duration)
			}
		];
	}

	public showSuccess(message: string): void {
		this.showToast({
			message,
			alertClass: 'alert-success',
			icon: LucideCircleCheck
		});
	}

	public showMessage(message: string): void {
		this.showToast({
			message
		});
	}

	public showInfo(message: string): void {
		this.showToast({
			message,
			alertClass: 'alert-info',
			icon: LucideInfo
		});
	}

	public showWarning(message: string): void {
		this.showToast({
			message,
			alertClass: 'alert-warning',
			icon: LucideCircleAlert
		});
	}

	public showError(message: string): void {
		this.showToast({
			message,
			alertClass: 'alert-error',
			icon: LucideTriangleAlert
		});
	}
}

export const toastManager = new ToastManager();
