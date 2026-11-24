import { describe, expect, test } from 'vitest';
import { tryLaunchDriver } from '../../src/browser/playwright.js';
import { fixturePath } from '../helpers/run.js';
import { startStaticServer } from '../helpers/server.js';

describe('PlaywrightDriver smoke', () => {
  test('launches Chromium, navigates and evaluates', async () => {
    const driver = await tryLaunchDriver();
    // If no browser is available (CI without Playwright), skip cleanly.
    if (!driver) {
      expect(driver).toBeNull();
      return;
    }
    const server = await startStaticServer(fixturePath('manifest-ok'));
    try {
      const page = await driver.newPage();
      const { status } = await page.goto(server.url, { waitUntil: 'load' });
      expect(status).toBe(200);
      const title = await page.evaluate(() => document.title);
      expect(title).toBe('Demo App');
      await page.setViewport({ width: 375, height: 800 });
      const width = await page.evaluate(() => document.documentElement.clientWidth);
      expect(width).toBe(375);
      await page.close();
    } finally {
      await driver.close();
      await server.close();
    }
  }, 30000);
});
