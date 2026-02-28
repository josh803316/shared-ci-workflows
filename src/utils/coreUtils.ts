import {spawnSync} from 'child_process';
import fs from 'fs';
import path from 'path';

export type Environment = 'development' | 'preview' | 'production';

/** Read the package name from the nearest package.json */
export async function getPackageName(): Promise<string> {
  const pkgPath = path.resolve('package.json');
  if (!fs.existsSync(pkgPath)) {
    throw new Error('No package.json found in current directory');
  }
  const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8')) as {name?: string};
  if (!pkg.name) {
    throw new Error('package.json has no "name" field');
  }
  return pkg.name;
}

/** Get current git branch name */
export function getBranchName(): string {
  const result = spawnSync('git', ['rev-parse', '--abbrev-ref', 'HEAD'], {encoding: 'utf8'});
  if (result.status !== 0) {
    throw new Error('Failed to determine git branch');
  }
  return result.stdout.trim();
}

/** Get current short git SHA */
export function getGitSha(): string {
  const result = spawnSync('git', ['rev-parse', '--short', 'HEAD'], {encoding: 'utf8'});
  if (result.status !== 0) {
    throw new Error('Failed to determine git SHA');
  }
  return result.stdout.trim();
}

/**
 * Map a branch name to a Vercel environment.
 *  main          -> production
 *  any other     -> preview
 */
export function determineEnvironment(branch: string): Environment {
  if (branch === 'main' || branch === 'master') {
    return 'production';
  }
  return 'preview';
}

/** Sanitize a branch name for use in URLs / tag names */
export function sanitizeBranch(branch: string): string {
  return branch.toLowerCase().replace(/[^a-z0-9-]/g, '-');
}

/** Record the wall-clock start time (ms since epoch) */
export function getStartTime(): number {
  return Date.now();
}

/** Return elapsed time in human-readable form */
export function formatElapsed(startMs: number): string {
  const elapsed = Date.now() - startMs;
  const s = Math.floor(elapsed / 1000);
  const m = Math.floor(s / 60);
  return m > 0 ? `${m}m ${s % 60}s` : `${s}s`;
}
