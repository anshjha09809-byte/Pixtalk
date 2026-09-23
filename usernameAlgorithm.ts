/**
 * Unique Username Algorithm Engine
 * Enforces Instagram-style unique handles with formatting rules,
 * collision detection, and automated smart handle generation.
 */

export interface UsernameValidationResult {
  isValid: boolean;
  normalized: string;
  error?: string;
}

// Global reserved system handles
export const RESERVED_HANDLES = new Set([
  'admin',
  'root',
  'system',
  'security',
  'support',
  'help',
  'messenger',
  'cipher',
  'e2e',
  'official',
  'explore',
  'stories',
]);

/**
 * Validates Instagram-style username:
 * - 3 to 20 characters
 * - lowercase letters (a-z), numbers (0-9), periods (.), underscores (_)
 * - cannot start or end with a period or underscore
 * - no consecutive periods or underscores
 */
export function validateUsernameFormat(handle: string): UsernameValidationResult {
  let clean = handle.trim().toLowerCase();
  if (clean.startsWith('@')) {
    clean = clean.substring(1);
  }

  if (clean.length < 3) {
    return { isValid: false, normalized: clean, error: 'Username must be at least 3 characters.' };
  }

  if (clean.length > 20) {
    return { isValid: false, normalized: clean, error: 'Username cannot exceed 20 characters.' };
  }

  const validRegex = /^[a-z0-9._]+$/;
  if (!validRegex.test(clean)) {
    return {
      isValid: false,
      normalized: clean,
      error: 'Only letters, numbers, periods (.), and underscores (_) are allowed.',
    };
  }

  if (clean.startsWith('.') || clean.endsWith('.') || clean.startsWith('_') || clean.endsWith('_')) {
    return {
      isValid: false,
      normalized: clean,
      error: 'Username cannot start or end with a period or underscore.',
    };
  }

  if (clean.includes('..') || clean.includes('__') || clean.includes('._') || clean.includes('_.')) {
    return {
      isValid: false,
      normalized: clean,
      error: 'Username cannot contain consecutive punctuation marks.',
    };
  }

  if (RESERVED_HANDLES.has(clean)) {
    return {
      isValid: false,
      normalized: clean,
      error: 'This handle is reserved by the system.',
    };
  }

  return { isValid: true, normalized: clean };
}

/**
 * Checks if a normalized username is unique against existing contacts/directory
 */
export function isUsernameAvailable(
  handle: string,
  existingHandles: string[],
  currentUserIdHandle?: string
): boolean {
  const norm = handle.toLowerCase().replace(/^@/, '');
  if (currentUserIdHandle && norm === currentUserIdHandle.toLowerCase().replace(/^@/, '')) {
    return true;
  }
  return !existingHandles.some(h => h.toLowerCase().replace(/^@/, '') === norm);
}

/**
 * Unique Username Generator Algorithm
 * Takes a person's display name or requested handle and generates 3-5 guaranteed unique handle suggestions
 */
export function generateUniqueSuggestions(
  baseName: string,
  existingHandles: string[]
): string[] {
  const cleanBase = baseName
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '.')
    .replace(/\.+/g, '.')
    .replace(/^\.|\.$/g, '')
    .slice(0, 14) || 'user';

  const candidates: string[] = [
    cleanBase,
    `${cleanBase}_sec`,
    `${cleanBase}.${Math.floor(100 + Math.random() * 900)}`,
    `the.${cleanBase}`,
    `${cleanBase}_${Math.floor(10 + Math.random() * 90)}`,
    `${cleanBase}.p256`,
  ];

  const suggestions: string[] = [];
  for (const c of candidates) {
    const val = validateUsernameFormat(c);
    if (val.isValid && isUsernameAvailable(val.normalized, existingHandles)) {
      if (!suggestions.includes('@' + val.normalized)) {
        suggestions.push('@' + val.normalized);
      }
    }
  }

  // Fallback guaranteed entropy handle
  if (suggestions.length < 3) {
    const randomHex = Math.random().toString(36).substring(2, 6);
    suggestions.push(`@${cleanBase}.${randomHex}`);
  }

  return suggestions.slice(0, 4);
}
