/**
 * Canvas-based font detection. Compares measured text width against the
 * sans-serif fallback — if the font renders differently it's available.
 * Works synchronously for system fonts without any async Font Loading API.
 */
const cache = new Map<string, boolean>();
let sharedCanvas: HTMLCanvasElement | null = null;
let sharedCtx: CanvasRenderingContext2D | null = null;

export function isFontAvailable(family: string): boolean {
  if (cache.has(family)) return cache.get(family)!;
  const primaryFont = family.split(',')[0].trim().replace(/['"]/g, '');
  if (!sharedCanvas) {
    sharedCanvas = document.createElement('canvas');
    sharedCtx = sharedCanvas.getContext('2d');
  }
  const ctx = sharedCtx;
  if (!ctx) { cache.set(family, false); return false; }
  const text = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  ctx.font = `14px sans-serif`;
  const base = ctx.measureText(text).width;
  ctx.font = `14px "${primaryFont}", sans-serif`;
  const result = ctx.measureText(text).width !== base;
  cache.set(family, result);
  return result;
}
