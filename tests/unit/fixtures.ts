import type { Route } from '../../src/types';

/** Synthetic Bengaluru → Goa (NH48 / NH748 via Hubballi and the Anmod ghat), with elevation. */
const WP = [
  [77.5946, 12.9716, 920], [77.1, 13.34, 820], [76.4, 14.23, 730], [75.92, 14.46, 600], [75.124, 15.3647, 640],
  [75.0, 15.46, 750], [74.62, 15.38, 700], [74.45, 15.4, 560], [74.3, 15.4, 80], [73.8278, 15.4909, 10],
];

export function bengaluruGoa(): Route {
  const geometry: number[][] = [];
  for (let i = 1; i < WP.length; i++) {
    const [a, b] = [WP[i - 1], WP[i]];
    for (let s = 0; s < 40; s++) {
      const t = s / 40;
      geometry.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]);
    }
  }
  geometry.push(WP[WP.length - 1]);
  return { geometry, distanceKm: 560, durationMin: 600 };
}
