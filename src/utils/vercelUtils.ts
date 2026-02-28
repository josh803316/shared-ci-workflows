import {spawnSync} from 'child_process';
import type {Environment} from './coreUtils';

export interface VercelDeployOptions {
  token: string;
  orgId?: string;
  projectId?: string;
  environment: Environment;
  prebuilt?: boolean;
}

/** Run a vercel CLI command and return stdout */
function vercel(args: string[], opts: {token: string; orgId?: string; projectId?: string}): string {
  const env: Record<string, string> = {
    ...process.env as Record<string, string>,
    VERCEL_TOKEN: opts.token,
    ...(opts.orgId ? {VERCEL_ORG_ID: opts.orgId} : {}),
    ...(opts.projectId ? {VERCEL_PROJECT_ID: opts.projectId} : {}),
  };

  const result = spawnSync('vercel', args, {
    encoding: 'utf8',
    env,
    stdio: ['inherit', 'pipe', 'pipe'],
  });

  if (result.status !== 0) {
    throw new Error(`vercel ${args[0]} failed:\n${result.stderr}`);
  }

  return result.stdout.trim();
}

/** Pull environment variables from Vercel into a local .env file */
export function pullEnv(opts: VercelDeployOptions, outputFile = '.env'): void {
  const envFlag = opts.environment === 'production' ? 'production' : 'preview';
  vercel(['env', 'pull', '--yes', `--environment=${envFlag}`, outputFile], opts);
}

/** Deploy a pre-built output directory to Vercel and return the deployment URL */
export function deploy(opts: VercelDeployOptions): string {
  const args = ['deploy'];
  if (opts.prebuilt) {
    args.push('--prebuilt');
  }
  if (opts.environment === 'production') {
    args.push('--prod');
  }
  return vercel(args, opts);
}

/** Promote a preview URL to production */
export function promote(url: string, opts: {token: string}): void {
  vercel(['promote', url], opts);
}

/** Assign an alias to a deployment */
export function setAlias(url: string, alias: string, opts: {token: string}): void {
  vercel(['alias', 'set', url, alias], opts);
}
