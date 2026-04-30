export type FilterCategory = 'json' | 'xml' | 'text' | 'html' | 'js' | 'css' | 'image' | 'font' | 'other';

export const FILTER_CATEGORIES: FilterCategory[] = [
  'json', 'xml', 'text', 'html', 'js', 'css', 'image', 'font', 'other',
];

export const DEFAULT_FILTER: Record<FilterCategory, boolean> = {
  json: true,
  xml: true,
  text: true,
  html: true,
  js: true,
  css: true,
  image: true,
  font: true,
  other: true,
};

export function categorize(mimeType: string, url: string): FilterCategory {
  const ct = (mimeType || '').toLowerCase();
  const u = (url || '').toLowerCase().split(/[?#]/)[0];

  if (ct.includes('json')) return 'json';
  if (ct.includes('xml')) return 'xml';
  if (ct.startsWith('image/') || /\.(png|jpe?g|gif|webp|svg|ico|bmp|avif)$/.test(u)) return 'image';
  if (ct.startsWith('font/') || ct.includes('font-woff') || /\.(woff2?|ttf|otf|eot)$/.test(u)) return 'font';
  if (ct.includes('javascript') || ct.includes('ecmascript') || /\.m?jsx?$/.test(u)) return 'js';
  if (ct.includes('css') || /\.css$/.test(u)) return 'css';
  if (ct.includes('html')) return 'html';
  if (ct.startsWith('text/')) return 'text';
  return 'other';
}
