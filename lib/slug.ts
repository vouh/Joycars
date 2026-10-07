import { randomBytes } from 'node:crypto';

export function slugify(value: string) {
  return value
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 100);
}

/** Stable, unique-by-construction slug, e.g. `2018-toyota-corolla-k3f9q2`. */
export function vehicleSlug(make: string, model: string, year?: number | null) {
  const base = slugify([year, make, model].filter(Boolean).join(' ')) || 'vehicle';
  return `${base}-${randomBytes(4).toString('hex').slice(0, 6)}`;
}
