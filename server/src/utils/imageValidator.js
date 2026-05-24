const ALLOWED_MIME_PREFIXES = [
  'data:image/jpeg;base64,',
  'data:image/jpg;base64,',
  'data:image/png;base64,',
  'data:image/gif;base64,',
  'data:image/webp;base64,',
];

const MAX_IMAGE_BYTES = 8 * 1024 * 1024; // 8MB as base64 string

/**
 * Validates that a value is either null/undefined (optional) or a valid image data URL
 * within size limits. Returns true if valid, false otherwise.
 */
export function isValidImageDataUrl(value) {
  if (value === null || value === undefined || value === '') return true;
  if (typeof value !== 'string') return false;
  if (value.length > MAX_IMAGE_BYTES) return false;
  return ALLOWED_MIME_PREFIXES.some((prefix) => value.startsWith(prefix));
}
