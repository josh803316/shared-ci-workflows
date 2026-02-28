#!/usr/bin/env bun

/**
 * env-config — CLI for managing environment variables across local .env files
 * and optionally syncing with Vercel.
 *
 * Commands:
 *   list [env]          — List all variables for an environment
 *   get <key> [env]     — Print the value of a single variable
 *   set <key> <value>   — Set a variable in the active environment file
 *   delete <key> [env]  — Remove a variable from an environment file
 *   switch <env>        — Switch the active environment (.env -> .env.<name>)
 *   pull [env]          — Pull env vars from Vercel into a local .env file
 *   push [env]          — Push local .env file to Vercel (with confirmation)
 *   envs                — List available environments (local files + Vercel)
 */

import {Command} from 'commander';
import fs from 'fs';
import path from 'path';
import {spawnSync} from 'child_process';

const program = new Command();

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

type EnvMap = Record<string, string>;

function resolveEnvFile(env?: string): string {
  if (!env || env === 'local') {
    return path.resolve('.env');
  }
  return path.resolve(`.env.${env}`);
}

function parseEnvFile(filePath: string): EnvMap {
  if (!fs.existsSync(filePath)) {
    return {};
  }
  const lines = fs.readFileSync(filePath, 'utf8').split('\n');
  const result: EnvMap = {};
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) {
      continue;
    }
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx === -1) {
      continue;
    }
    const key = trimmed.slice(0, eqIdx).trim();
    const rawVal = trimmed.slice(eqIdx + 1).trim();
    // Strip surrounding quotes
    const val = rawVal.replace(/^["']|["']$/g, '');
    result[key] = val;
  }
  return result;
}

function writeEnvFile(filePath: string, vars: EnvMap): void {
  const lines = Object.entries(vars).map(([k, v]) => {
    const needsQuotes = v.includes(' ') || v.includes('#');
    return `${k}=${needsQuotes ? `"${v}"` : v}`;
  });
  fs.writeFileSync(filePath, lines.join('\n') + '\n', 'utf8');
}

function vercelAvailable(): boolean {
  const result = spawnSync('vercel', ['--version'], {stdio: 'pipe'});
  return result.status === 0;
}

function runVercel(args: string[]): void {
  const result = spawnSync('vercel', args, {stdio: 'inherit'});
  if (result.status !== 0) {
    console.error('vercel command failed');
    process.exit(result.status ?? 1);
  }
}

// ---------------------------------------------------------------------------
// CLI definition
// ---------------------------------------------------------------------------

program
  .name('env-config')
  .version('1.0.0')
  .description('Manage environment variables locally and sync with Vercel');

// list
program
  .command('list [env]')
  .description('List all variables in an environment file (defaults to .env)')
  .action((env?: string) => {
    const filePath = resolveEnvFile(env);
    const vars = parseEnvFile(filePath);
    if (Object.keys(vars).length === 0) {
      console.log(`No variables found in ${filePath}`);
      return;
    }
    console.log(`\n${filePath}:\n`);
    for (const [k, v] of Object.entries(vars)) {
      console.log(`  ${k}=${v}`);
    }
    console.log();
  });

// get
program
  .command('get <key> [env]')
  .description('Print the value of a variable')
  .action((key: string, env?: string) => {
    const vars = parseEnvFile(resolveEnvFile(env));
    if (key in vars) {
      console.log(vars[key]);
    } else {
      console.error(`Key "${key}" not found`);
      process.exit(1);
    }
  });

// set
program
  .command('set <key> <value> [env]')
  .description('Set a variable in an environment file')
  .action((key: string, value: string, env?: string) => {
    const filePath = resolveEnvFile(env);
    const vars = parseEnvFile(filePath);
    vars[key] = value;
    writeEnvFile(filePath, vars);
    console.log(`Set ${key} in ${filePath}`);
  });

// delete
program
  .command('delete <key> [env]')
  .description('Remove a variable from an environment file')
  .action((key: string, env?: string) => {
    const filePath = resolveEnvFile(env);
    const vars = parseEnvFile(filePath);
    if (!(key in vars)) {
      console.error(`Key "${key}" not found in ${filePath}`);
      process.exit(1);
    }
    delete vars[key];
    writeEnvFile(filePath, vars);
    console.log(`Deleted ${key} from ${filePath}`);
  });

// switch — symlinks .env -> .env.<name> so the app always reads .env
program
  .command('switch <env>')
  .description('Switch active environment by symlinking .env to .env.<env>')
  .action((env: string) => {
    const source = resolveEnvFile(env);
    const target = path.resolve('.env');

    if (!fs.existsSync(source)) {
      console.error(`Environment file ${source} does not exist. Create it first with 'env-config set'.`);
      process.exit(1);
    }

    if (fs.existsSync(target) || fs.lstatSync(target).isSymbolicLink?.()) {
      fs.unlinkSync(target);
    }

    fs.symlinkSync(source, target);
    console.log(`.env -> ${source}`);
  });

// envs — list available env files
program
  .command('envs')
  .description('List available .env files in the current directory')
  .action(() => {
    const files = fs.readdirSync('.').filter((f) => f.startsWith('.env') && !f.endsWith('.example'));
    if (files.length === 0) {
      console.log('No .env files found.');
    } else {
      console.log('\nAvailable environment files:');
      for (const f of files) {
        const active = f === '.env' ? ' (active)' : '';
        console.log(`  ${f}${active}`);
      }
      console.log();
    }
  });

// pull — pull from Vercel
program
  .command('pull [env]')
  .description('Pull environment variables from Vercel into a local .env file')
  .option('--yes', 'Skip confirmation prompt')
  .action((env?: string, options?: {yes: boolean}) => {
    if (!vercelAvailable()) {
      console.error('vercel CLI is not installed. Run: npm i -g vercel');
      process.exit(1);
    }
    const filePath = resolveEnvFile(env);
    const vercelEnv = env === 'production' ? 'production' : env === 'preview' ? 'preview' : 'development';
    console.log(`Pulling ${vercelEnv} environment from Vercel into ${filePath}...`);
    runVercel(['env', 'pull', filePath, '--environment', vercelEnv]);
    console.log('Done.');
  });

// push — push to Vercel (with confirmation)
program
  .command('push [env]')
  .description('Push local .env file to Vercel (interactive, adds each variable)')
  .action((env?: string) => {
    if (!vercelAvailable()) {
      console.error('vercel CLI is not installed. Run: npm i -g vercel');
      process.exit(1);
    }
    const filePath = resolveEnvFile(env);
    const vars = parseEnvFile(filePath);
    const vercelEnv = env === 'production' ? 'production' : env === 'preview' ? 'preview' : 'development';

    console.log(`\nPushing ${Object.keys(vars).length} variable(s) to Vercel [${vercelEnv}] from ${filePath}...\n`);
    for (const [key, value] of Object.entries(vars)) {
      const result = spawnSync('vercel', ['env', 'add', key, vercelEnv], {
        input: value + '\n',
        stdio: ['pipe', 'inherit', 'inherit'],
      });
      if (result.status !== 0) {
        console.error(`Failed to push ${key}`);
        process.exit(1);
      }
    }
    console.log('\nAll variables pushed.');
  });

program.parse(process.argv);
