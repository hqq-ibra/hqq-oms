import { join } from 'path';

/**
 * Resolves the root directory for user uploads.
 *
 * Exported separately from UPLOADS_ROOT so it can be unit-tested without
 * reimporting the module or mutating the real process environment.
 */
export function resolveUploadsRoot(
  env: NodeJS.ProcessEnv = process.env,
  cwd: string = process.cwd(),
): string {
  const configured = env.UPLOADS_DIR?.trim();
  return configured ? configured : join(cwd, 'uploads');
}

/** Root directory for all uploads. Resolved once at startup. */
export const UPLOADS_ROOT = resolveUploadsRoot();

/** Build a path inside the uploads root, e.g. uploadsPath('products'). */
export function uploadsPath(...segments: string[]): string {
  return join(UPLOADS_ROOT, ...segments);
}
