/**
 * Pure userId validation and database filename derivation.
 *
 * No expo-sqlite import – this module is safely unit-testable under Jest
 * without any native module setup.
 */

/**
 * Allowlist: ASCII alphanumerics, hyphens, underscores, 1-64 characters.
 * Covers UUID format (hex + hyphens) comfortably and rejects:
 *   - empty string
 *   - path separators (/, \)
 *   - colon (:) and dot (.)
 *   - null bytes and other control characters
 *   - oversized values that would exceed native filename limits
 */
const VALID_USER_ID = /^[A-Za-z0-9_-]{1,64}$/;

/**
 * Validates `userId` and returns the per-user SQLite database filename.
 *
 * @throws if userId is not a non-empty string of 1-64 ASCII alphanumerics,
 *         underscores, or hyphens.
 */
export function deriveDbName(userId: string): string {
  if (typeof userId !== 'string' || !VALID_USER_ID.test(userId)) {
    throw new Error(
      `Invalid userId: must be 1–64 characters containing only A-Z, a-z, 0-9, _ or -`,
    );
  }
  return `hanyu-review-${userId}.db`;
}
