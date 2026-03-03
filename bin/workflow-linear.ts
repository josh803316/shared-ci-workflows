#!/usr/bin/env bun

/**
 * workflow-linear — CLI helper invoked from GitHub Actions to transition
 * Linear issues based on PR / push events.
 *
 * Usage:
 *   bunx workflow-linear transition \
 *     --event-type PR_READY \
 *     --branch-name josh/PRO-123-feature \
 *     --api-key $LINEAR_API_KEY
 */

import {Command} from 'commander';
import * as core from '@actions/core';
import {
  extractIssueId,
  mapEventToState,
  transitionIssue,
  type GitHubEventType,
} from '../src/utils/linearUtils';

const program = new Command();

program
  .command('transition')
  .description('Transition a Linear issue state based on a GitHub event')
  .requiredOption('--event-type <type>', 'GitHub event type: PUSH | PR_DRAFT | PR_READY | PR_REVIEW_SUBMITTED | PR_MERGED')
  .option('--review-state <state>', 'Review state (approved | changes_requested) — required for PR_REVIEW_SUBMITTED')
  .option('--branch-name <name>', 'Git branch name')
  .option('--pr-title <title>', 'PR title')
  .option('--commit-messages <msgs>', 'Comma-separated commit messages')
  .option('--linear-key <key>', 'Explicit Linear issue key override (e.g. PRO-123)')
  .option('--api-key <key>', 'Linear API key (falls back to LINEAR_API_KEY env var)')
  .action(async (opts: {
    eventType: string;
    reviewState?: string;
    branchName?: string;
    prTitle?: string;
    commitMessages?: string;
    linearKey?: string;
    apiKey?: string;
  }) => {
    const apiKey = opts.apiKey ?? process.env.LINEAR_API_KEY;
    if (!apiKey) {
      core.setFailed('LINEAR_API_KEY is required');
      process.exit(1);
    }

    // Find the issue ID
    const issueId = opts.linearKey ?? extractIssueId({
      branchName: opts.branchName,
      prTitle: opts.prTitle,
      commitMessages: opts.commitMessages?.split(','),
    });

    if (!issueId) {
      console.log('No Linear issue ID found in branch, title, or commits. Skipping.');
      return;
    }

    console.log(`Found Linear issue: ${issueId}`);

    // Map the event to a target state
    const eventType = opts.eventType as GitHubEventType;
    const targetState = mapEventToState(eventType, opts.reviewState);

    if (!targetState) {
      console.log(`No state transition needed for event ${opts.eventType}`);
      return;
    }

    console.log(`Event ${opts.eventType} → target state "${targetState}"`);

    const success = await transitionIssue(apiKey, issueId, targetState);
    if (!success) {
      core.setFailed(`Failed to transition ${issueId} to "${targetState}"`);
      process.exit(1);
    }

    core.setOutput('issue-id', issueId);
    core.setOutput('target-state', targetState);
  });

program.parse(process.argv);
