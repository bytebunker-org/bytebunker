import type { ISuperformsMessage } from '$lib/type/SuperformsMessage.js';
import { toastManager } from '$lib/util/toastManager.svelte.js';

export const slugRegex = /^[a-z0-9-]{0,61}$/;

export function hasOwnProperty<X, Y extends PropertyKey>(
	obj: X,
	prop: Y
): obj is NonNullable<X> & Record<Y, unknown> {
	return typeof obj !== 'undefined' && obj !== null && Object.hasOwn(obj as object, prop);
}

export function clamp(value: number, min: number, max: number): number {
	return Math.min(Math.max(value, min), max);
}

export function preventEvent(e: Event): void {
	e.preventDefault();
}

export function exclude<T, K extends keyof T>(obj: T, ...keys: K[]): Omit<T, K> {
	if (!obj) {
		return obj;
	}

	const names = Object.getOwnPropertyNames(obj) as unknown as K[];
	const newObj = {};

	for (let i = 0; i < names.length; i++) {
		const name = names[i];

		if (keys.indexOf(name) !== -1) {
			continue;
		}

		// @ts-ignore
		newObj[name] = obj[name];
	}

	return newObj as Omit<T, K>;
}

export function range(start: number, stop: number, step = 1): number[] {
	return Array(Math.ceil((stop - start) / step))
		.fill(start)
		.map((x, y) => x + y * step);
}

/**
 * Convert all words longer than 3 characters found in the string to "Title Case"
 * @param str the string to convert
 */
export function convertTitleCase(str: string): string {
	return str.replace(/\w{4,}/g, (s) => s.slice(0, 1).toUpperCase() + s.slice(1).toLowerCase());
}

export function sendFormToasts(message: ISuperformsMessage | undefined) {
	if (message?.text) {
		if (message.type === 'general') {
			toastManager.showMessage(message.text);
		} else if (message.type === 'success') {
			toastManager.showSuccess(message.text);
		} else if (message.type === 'warning') {
			toastManager.showWarning(message.text);
		} else if (message.type === 'error') {
			toastManager.showError(message.text);
		}
	}
}

export function groupByKeySingle<T, KeyType extends string | number | symbol = string>(
	array: T[],
	key: keyof T
): Record<KeyType, T> {
	// @ts-ignore
	return array.reduce((hash, object) => {
		if (object[key] === undefined) {
			return hash;
		}

		// @ts-ignore
		return Object.assign(hash, { [object[key]]: object });
	}, {});
}

export async function copyText(text: string) {
	if ('clipboard' in navigator) {
		await navigator.clipboard.writeText(text);
	} else {
		/**
		 * This is the fallback deprecated way of copying text to the clipboard. Only runs if it can't find the clipboard API.
		 */
		const element = document.createElement('input');

		element.type = 'text';
		element.disabled = true;

		element.style.setProperty('position', 'fixed');
		element.style.setProperty('z-index', '-100');
		element.style.setProperty('pointer-events', 'none');
		element.style.setProperty('opacity', '0');

		element.value = text;

		document.body.appendChild(element);

		element.click();
		element.select();
		document.execCommand('copy');

		document.body.removeChild(element);
	}
}
