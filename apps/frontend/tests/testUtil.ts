import type { Page } from '@playwright/test';

export async function waitForSveltekitNavigation(page: Page): Promise<void> {
	await page.waitForFunction(() => window.testingNavigationState === 'finished-navigation');
}

export async function gotoPage(page: Page, ...args: Parameters<Page['goto']>): Promise<void> {
	await page.goto(...args);
	await waitForSveltekitNavigation(page);
}
