// End-to-end checks with the APIs mocked, so no keys are needed. Map tiles are blocked to keep runs offline.
import { expect, test, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { bengaluruGoa } from '../unit/fixtures';

async function mockApis(page: Page, opts: { thin?: boolean } = {}) {
  await page.route('https://tiles.openfreemap.org/**', (r) => r.abort());
  await page.route('**/api/geocode', async (r) => {
    const q = (r.request().postDataJSON() as { q: string }).q;
    await r.fulfill({ json: q.startsWith('Beng') ? { lat: 12.9716, lng: 77.5946, label: 'Bengaluru, KA, India' } : { lat: 15.4909, lng: 73.8278, label: 'Panaji, GA, India' } });
  });
  await page.route('**/api/route', (r) => r.fulfill({ json: bengaluruGoa() }));
  await page.route('**/api/stops', async (r) => {
    const { corridor } = r.request().postDataJSON() as { corridor: [number, number][] };
    const [lng, lat] = corridor[Math.floor(corridor.length * 0.65)];
    await r.fulfill({
      json: {
        stops: [
          { id: `osm:node/${Math.round(lat * 1e5)}`, name: 'Highway Fuels', lat, lng, kinds: ['fuel', 'restroom'], osmTags: { amenity: 'fuel', name: 'Highway Fuels' } },
          { id: `osm:node/${Math.round(lat * 1e5) + 1}`, name: 'Coffee Stop', lat: lat + 0.001, lng, kinds: ['cafe'], osmTags: { amenity: 'cafe', name: 'Coffee Stop' } },
          { id: `osm:node/${Math.round(lat * 1e5) + 2}`, name: 'Dhaba', lat: lat + 0.01, lng: lng + 0.01, kinds: ['food', 'fuel'], osmTags: { amenity: 'restaurant' } },
        ],
      },
    });
  });
  await page.route('**/api/verify', (r) =>
    r.fulfill({
      json: opts.thin
        ? { checkedAt: new Date().toISOString(), summary: '', openAtEta: null, sources: [], thin: true }
        : { checkedAt: new Date().toISOString(), summary: 'Open 24 hours. Reviews mention clean restrooms.', openAtEta: true, sources: [{ title: 'Highway Fuels', uri: 'https://maps.google.com/?cid=1' }], thin: false },
    }),
  );
  await page.route('**/api/brief', (r) => r.fulfill({ json: { text: 'a\nb\nc\nd\ne', source: 'template' } }));
}

async function plan(page: Page, url = '/?now=2026-11-14T05:00:00%2B05:30#/plan') {
  await page.goto(url);
  await page.getByLabel('Leave at').fill('2026-11-14T06:00');
  await page.getByRole('button', { name: 'Plan the race' }).click();
  await expect(page.getByRole('heading', { name: /Bengaluru → Panaji/ })).toBeVisible();
}

test('Bengaluru → Goa at 06:00: ≥3 stints, fuel box, 1–3 candidates', async ({ page }) => {
  await mockApis(page);
  await plan(page);
  const stints = page.locator('.stint-row');
  expect(await stints.count()).toBeGreaterThanOrEqual(3);
  await expect(page.locator('.box-window').filter({ hasText: 'Fuel' }).first()).toBeVisible();
  const first = page.locator('.box-window').first();
  await expect(first.locator('.cand').first()).toBeVisible();
  const n = await first.locator('.cand').count();
  expect(n).toBeGreaterThanOrEqual(1);
  expect(n).toBeLessThanOrEqual(3);
  await expect(first.locator('.tag-osm').first()).toHaveText('OSM');
});

test('lock shows a Google Maps check with sources', async ({ page }) => {
  await mockApis(page);
  await plan(page);
  await page.locator('.box-window').first().getByRole('button', { name: 'Lock this stop' }).first().click();
  await expect(page.getByText('From Google Maps via Gemini', { exact: true })).toBeVisible();
  await expect(page.locator('.sources a').first()).toHaveAttribute('href', /^https:\/\//);
});

test('thin check keeps the backup', async ({ page }) => {
  await mockApis(page, { thin: true });
  await plan(page);
  await page.locator('.box-window').first().getByRole('button', { name: 'Lock this stop' }).first().click();
  await expect(page.getByText('Few reviews here. Keep the backup.')).toBeVisible();
  await expect(page.getByText(/Backup pinned:/)).toBeVisible();
});

test('night=avoid flags a night stint', async ({ page }) => {
  await mockApis(page);
  await page.goto('/?now=2026-11-14T12:00:00%2B05:30#/plan');
  await page.getByLabel('Leave at').fill('2026-11-14T13:00');
  await page.getByRole('button', { name: 'Plan the race' }).click();
  await expect(page.getByText('Night stint planned.')).toBeVisible();
  await expect(page.locator('.stint-row.tint-night').first()).toBeVisible();
});

for (const [time, phase] of [
  ['05:30', 'night'],
  ['11:30', 'afternoon'],
  ['17:30', 'evening'], // golden hour in Bengaluru mid-November is ~17:21
  ['20:00', 'night'],
] as const) {
  test(`?now=${time} → ${phase}`, async ({ page }) => {
    await page.goto(`/?now=2026-11-14T${time}:00%2B05:30#/plan`);
    await expect(page.locator('html')).toHaveAttribute('data-theme', phase);
  });
}

test('theme override persists across reloads', async ({ page }) => {
  await page.goto('/?now=2026-11-14T11:30:00%2B05:30#/plan');
  await page.getByLabel('Theme').selectOption('night');
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'night');
  await page.getByLabel('Theme').selectOption('auto');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'afternoon');
});

for (const phase of ['morning', 'afternoon', 'evening', 'night'] as const) {
  test(`axe: no WCAG 2.2 AA violations in ${phase}`, async ({ page }) => {
    await mockApis(page);
    await page.addInitScript((p) => localStorage.setItem('pitstop.theme', p), phase);
    await plan(page);
    await page.locator('.box-window').first().getByRole('button', { name: 'Lock this stop' }).first().click();
    await expect(page.getByText('From Google Maps via Gemini', { exact: true })).toBeVisible();
    for (const route of ['strategy', 'plan', 'drive', 'debrief']) {
      await page.evaluate((r) => (location.hash = `/${r}`), route);
      await page.waitForTimeout(700); // let the cross-fade finish
      const res = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']).exclude('.maplibregl-canvas').analyze();
      expect(res.violations, `${phase} ${route}: ${res.violations.map((v) => v.id).join(', ')}`).toEqual([]);
    }
  });
}

test('reduced motion: no theme transition', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/?now=2026-11-14T11:30:00%2B05:30#/plan');
  const t = await page.evaluate(() => {
    document.documentElement.classList.add('theme-fade');
    return getComputedStyle(document.body).transitionDuration;
  });
  expect(t).toBe('0s');
});

test('cross-fade is 600 ms without reduced motion', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.goto('/?now=2026-11-14T11:30:00%2B05:30#/plan');
  const t = await page.evaluate(() => {
    document.documentElement.classList.add('theme-fade');
    return getComputedStyle(document.body).transitionDuration;
  });
  expect(t.split(',')[0].trim()).toBe('0.6s');
});
