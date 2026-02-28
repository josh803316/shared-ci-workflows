#!/usr/bin/env bun

/**
 * workflow-vercel — CLI helper invoked from GitHub Actions to handle
 * Vercel deployment steps that are easier to express in TypeScript than shell.
 *
 * Commands:
 *   deploy           — Deploy to Vercel and output the deployment URL
 *   promote <url>    — Promote a preview deployment URL to production
 *   alias <url>      — Assign a custom alias to a deployment
 */

import {Command} from 'commander';
import * as core from '@actions/core';
import {spawnSync, execSync} from 'child_process';

const program = new Command();

function run(cmd: string, args: string[], opts: {capture?: boolean} = {}): string {
  const result = spawnSync(cmd, args, {
    stdio: opts.capture ? ['inherit', 'pipe', 'pipe'] : 'inherit',
    encoding: 'utf8',
  });
  if (result.status !== 0) {
    const msg = `Command failed: ${cmd} ${args.join(' ')}`;
    core.setFailed(msg);
    process.exit(result.status ?? 1);
  }
  return ((result.stdout as string) ?? '').trim();
}

// ---------------------------------------------------------------------------
// deploy
// ---------------------------------------------------------------------------
program
  .command('deploy')
  .description('Deploy current project to Vercel and output deployment URL')
  .option('--prod', 'Deploy to production', false)
  .option('--token <token>', 'Vercel auth token (falls back to VERCEL_TOKEN env var)')
  .option('--project <project>', 'Vercel project name/id (falls back to VERCEL_PROJECT_ID)')
  .option('--org <org>', 'Vercel org/team id (falls back to VERCEL_ORG_ID)')
  .action((options: {prod: boolean; token?: string; project?: string; org?: string}) => {
    const token = options.token ?? process.env.VERCEL_TOKEN;
    const project = options.project ?? process.env.VERCEL_PROJECT_ID;
    const org = options.org ?? process.env.VERCEL_ORG_ID;

    if (!token) {
      core.setFailed('VERCEL_TOKEN is required');
      process.exit(1);
    }

    const args = ['deploy', '--token', token];
    if (options.prod) {
      args.push('--prod');
    }
    if (project) {
      args.push('--project', project);
    }
    if (org) {
      args.push('--scope', org);
    }

    console.log(`Deploying to Vercel${options.prod ? ' (production)' : ' (preview)'}...`);
    const url = run('vercel', args, {capture: true});
    console.log(`Deployment URL: ${url}`);
    core.setOutput('deployment-url', url);
  });

// ---------------------------------------------------------------------------
// promote
// ---------------------------------------------------------------------------
program
  .command('promote <url>')
  .description('Promote a preview deployment URL to production')
  .option('--token <token>', 'Vercel auth token')
  .action((url: string, options: {token?: string}) => {
    const token = options.token ?? process.env.VERCEL_TOKEN;
    if (!token) {
      core.setFailed('VERCEL_TOKEN is required');
      process.exit(1);
    }
    console.log(`Promoting ${url} to production...`);
    run('vercel', ['promote', url, '--token', token]);
  });

// ---------------------------------------------------------------------------
// alias
// ---------------------------------------------------------------------------
program
  .command('alias <url> <alias>')
  .description('Assign a custom alias to a deployment')
  .option('--token <token>', 'Vercel auth token')
  .action((url: string, alias: string, options: {token?: string}) => {
    const token = options.token ?? process.env.VERCEL_TOKEN;
    if (!token) {
      core.setFailed('VERCEL_TOKEN is required');
      process.exit(1);
    }
    console.log(`Aliasing ${url} -> ${alias}...`);
    run('vercel', ['alias', 'set', url, alias, '--token', token]);
  });

program.parse(process.argv);
