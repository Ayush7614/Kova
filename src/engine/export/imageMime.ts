// MIME type for an image, given a file path or a bare extension.
export function imageMime(pathOrExt: string): string {
  const ext = pathOrExt.replace(/[?#].*$/, '').split('.').pop()?.toLowerCase() ?? '';
  if (ext === 'jpg' || ext === 'jpeg') return 'image/jpeg';
  if (ext === 'svg')  return 'image/svg+xml';
  if (ext === 'gif')  return 'image/gif';
  if (ext === 'webp') return 'image/webp';
  if (ext === 'bmp')  return 'image/bmp';
  if (ext === 'avif') return 'image/avif';
  if (ext === 'ico')  return 'image/x-icon';
  if (ext === 'tif' || ext === 'tiff') return 'image/tiff';
  return 'image/png';
}
