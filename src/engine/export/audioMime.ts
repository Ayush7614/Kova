// MIME type for an audio file, given a path or a bare extension.
export function audioMime(pathOrExt: string): string {
  const ext = pathOrExt.replace(/^.*\./, '').toLowerCase();
  if (ext === 'wav')  return 'audio/wav';
  if (ext === 'ogg')  return 'audio/ogg';
  if (ext === 'm4a')  return 'audio/mp4';
  if (ext === 'aac')  return 'audio/aac';
  if (ext === 'flac') return 'audio/flac';
  if (ext === 'webm') return 'audio/webm';
  return 'audio/mpeg';
}
