// MIME type for a video, given a file path or a bare extension.
export function videoMime(pathOrExt: string): string {
  const ext = pathOrExt.replace(/[?#].*$/, '').split('.').pop()?.toLowerCase() ?? '';
  if (ext === 'webm') return 'video/webm';
  if (ext === 'ogv')  return 'video/ogg';
  if (ext === 'mov')  return 'video/quicktime';
  if (ext === 'm4v')  return 'video/x-m4v';
  if (ext === 'mkv')  return 'video/x-matroska';
  return 'video/mp4';
}
