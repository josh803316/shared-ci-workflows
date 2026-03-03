#!/usr/bin/env bun

/**
 * workflow-linear — CLI helper invoked from GitHub Actions to transition
 * Linear issues based on PR / push events.
 *
 * Usage:
 *   bunx workflow-linear transition \
 *     --event-type PR_OPENED \
 *     --branch-name feat/ELY-5-my-feature \
 *     --pr-title "fix: [ELY-5] Fix bug" \
 *     --preview-url https://my-preview.vercel.app
 *
 *   bunx workflow-linear transition \
 *     --event-type PR_MERGED \
 *     --commit-messages "fix: [ELY-5] Fix bug,feat: [ELY-6] New thing"
 *
 * Environment variables:
 *   LINEAR_API_KEY        — Linear personal API key (required)
 *   LINEAR_ISSUE_PREFIX   — Issue prefix, defaults to ELY
 */

import {Command} from 'commander';
import * as core from '@actions/core';
import {
  extractIssueId,
  extractAllIssueIds,
  mapEventToState,
  transitionIssue,
  addComment,
  type GitHubEventType,
} from '../src/utils/linearUtils';

const program = new Command();

program
  .command('transition')
  .description('Transition Linear issue(s) based on a GitHub event. Ticket refs are optional — no-op if none found.')
  .requiredOption(
    '--event-type <type>',
    'GitHub event type: PUSH | PR_OPENED | PR_DRAFT | PR_READY | PR_REVIEW_SUBMITTED | PR_MERGED',
  )
  .option('--review-state <state>', 'Review state (approved | changes_requested) — required for PR_REVIEW_SUBMITTED')
  .option('--branch-name <name>', 'Git branch name (checked first for ticket refs)')
  .option('--pr-title <title>', 'PR title (checked second for ticket refs)')
  .option(
    '--commit-messages <msgs>',
    'Comma or newline-separated commit messages (all tickets extracted for PR_MERGED/PUSH)',
  )
  .option('--linear-key <key>', 'Explicit Linear issue key override (e.g. ELY-5), bypasses extraction')
  .option('--preview-url <url>', 'Vercel preview URL — posted as a comment when ticket moves to In Progress')
  .option('--api-key <key>', 'Linear API key (falls back to LINEAR_API_KEY env var)')
  .action(
    async (opts: {
      eventType: string;
      reviewState?: string;
      branchName?: string;
      prTitle?: string;
      commitMessages?: string;
      linearKey?: string;
      previewUrl?: string;
      apiKey?: string;
    }) => {
      const apiKey = opts.apiKey ?? process.env.LINEAR_API_KEY;
      if (!apiKey) {
        console.log('LINEAR_API_KEY is not set — skipping Linear update (integration is optional).');
        return;
      }

      const eventType = opts.eventType as GitHubEventType;
      const targetState = mapEventToState(eventType, opts.reviewState);

      if (!targetState) {
        console.log(
          `No state transition defined for event "${opts.eventType}" (reviewState="${opts.reviewState ?? ''}"). Skipping.`,
        );
        return;
      }

      // Split commit messages on comma or newline
      const commitMessages = opts.commitMessages
        ? opts.commitMessages
            .split(/[,\n]/)
            .map((m) => m.trim())
            .filter(Boolean)
        : [];

      // For PR_MERGED / PUSH collect ALL ticket IDs across all commits.
      // For PR events find the first one (branch → title → commits).
      let issueIds: string[];

      if (opts.linearKey) {
        issueIds = [opts.linearKey.toUpperCase()];
      } else if (eventType === 'PR_MERGED' || eventType === 'PUSH') {
        issueIds = extractAllIssueIds({
          branchName: opts.branchName,
          prTitle: opts.prTitle,
          commitMessages,
        });
      } else {
        const single = extractIssueId({
          branchName: opts.branchName,
          prTitle: opts.prTitle,
          commitMessages,
        });
        issueIds = single ? [single] : [];
      }

      if (issueIds.length === 0) {
        console.log(
          'No Linear ticket refs found in branch, title, or commits. Skipping — ticket number is optional.',
        );
        return;
      }

      console.log(`Found ticket(s): ${issueIds.join(', ')} → transitioning to "${targetState}"`);

      let anyFailed = false;
      for (const id of issueIds) {
        const ok = await transitionIssue(apiKey, id, targetState);
        if (!ok) {
          anyFailed = true;
          continue;
        }

        // After moving to In Progress, post the preview URL as a comment if provided
        if (opts.previewUrl && targetState === 'In Progress') {
          await addComment(
            apiKey,
            id,
            `**Preview deployed** 🚀\n\n${opts.previewUrl}\n\n_Triggered by: ${opts.prTitle ?? opts.branchName ?? 'unknown'}_`,
          );
        }

        core.setOutput('issue-id', id);
        core.setOutput('target-state', targetState);
      }

      if (anyFailed) {
        core.setFailed('One or more Linear ticket transitions failed — see logs above');
        process.exit(1);
      }
    },
  );

program.parse(process.argv);
