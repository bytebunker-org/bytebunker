import { test as setup, expect } from '@playwright/test';
import { join } from 'node:path';

const authFile = join(import.meta.dirname, '../.playwright/auth.json');

setup('authenticate', async ({ page }) => {
	await page.context().storageState({ path: authFile });

	const adminEmail = process.env['ADMIN_EMAIL'];
	const adminPassword = process.env['ADMIN_PASSWORD'];

	if (!adminEmail || !adminPassword) {
		throw new Error(
			'ADMIN_EMAIL and ADMIN_PASSWORD environment variables are required, add them to the .env.test.local file'
		);
	}

	await page.goto('/');

	if (page.url().includes('/auth/login')) {
		console.info('Redirected to login page, logging in...');

		await page.getByLabel('E-Mail').fill(adminEmail);
		await page.getByLabel('Password').fill(adminPassword);
		await page.getByRole('button', { name: 'Login' }).click();

		await page.waitForURL('/');
	}

	await expect(page.getByRole('img', { name: 'Luxfit' })).toBeVisible();

	await page.context().storageState({ path: authFile });
});
