// Maps a lowercased file extension to an image MIME type for data: URLs.
export function extToMime(ext: string): string {
  if (ext === 'jpg' || ext === 'jpeg') return 'image/jpeg';
  if (ext === 'gif')  return 'image/gif';
  if (ext === 'webp') return 'image/webp';
  if (ext === 'svg')  return 'image/svg+xml';
  return 'image/png';
}
