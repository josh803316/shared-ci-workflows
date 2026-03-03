/**
 * Linear integration utilities for GitHub Actions workflows.
 *
 * Extracts Linear issue IDs (e.g. ELY-123, PRO-42) from branch names, PR titles,
 * and commit messages, then transitions issue states via the Linear GraphQL API.
 *
 * Configure via environment variables:
 *   LINEAR_ISSUE_PREFIX  — team key prefix (e.g. "ELY" or "PRO") — required
 *   LINEAR_API_KEY       — Linear personal API key — required for API calls
 */

const LINEAR_API_URL = 'https://api.linear.app/graphql';

// Resolved at runtime so each project can set its own prefix via LINEAR_ISSUE_PREFIX.
// If unset, extraction functions return no matches (graceful no-op).
const ISSUE_PREFIX = process.env.LINEAR_ISSUE_PREFIX ?? '';

// Linear workflow states — these are the display names in Linear.
// The actual IDs are fetched dynamically since they vary per team.
export enum LinearState {
  IN_PROGRESS = 'In Progress',
  IN_REVIEW = 'In Review',
  DONE = 'Done',
}

export enum GitHubEventType {
  PUSH = 'PUSH',
  PR_OPENED = 'PR_OPENED',
  PR_DRAFT = 'PR_DRAFT',
  PR_READY = 'PR_READY',
  PR_REVIEW_SUBMITTED = 'PR_REVIEW_SUBMITTED',
  PR_MERGED = 'PR_MERGED',
}

// ---------------------------------------------------------------------------
// Issue ID extraction
// ---------------------------------------------------------------------------

/**
 * Build a regex for the configured prefix.
 * Returns null when LINEAR_ISSUE_PREFIX is not set — callers should return early.
 */
function makePattern(flags = 'i'): RegExp | null {
  if (!ISSUE_PREFIX) return null;
  return new RegExp(`\\[?(${ISSUE_PREFIX}-\\d+)\\]?`, flags);
}

/** Extract the first Linear issue identifier (e.g. ELY-123) from a branch name */
export function extractIssueIdFromBranch(branchName: string): string | null {
  const pattern = makePattern();
  if (!pattern) return null;
  const match = branchName.match(pattern);
  return match ? match[1]!.toUpperCase() : null;
}

/** Extract the first Linear issue identifier from a PR title */
export function extractIssueIdFromTitle(title: string): string | null {
  const pattern = makePattern();
  if (!pattern) return null;
  const match = title.match(pattern);
  return match ? match[1]!.toUpperCase() : null;
}

/** Extract the first Linear issue identifier from a commit message */
export function extractIssueIdFromCommit(message: string): string | null {
  const pattern = makePattern();
  if (!pattern) return null;
  const match = message.match(pattern);
  return match ? match[1]!.toUpperCase() : null;
}

/** Extract ALL unique Linear issue identifiers from a string */
export function extractAllIssueIdsFromText(text: string): string[] {
  const pattern = makePattern('gi');
  if (!pattern) return [];
  const matches = [...text.matchAll(pattern)];
  return [...new Set(matches.map((m) => m[1]!.toUpperCase()))];
}

/**
 * Try all sources to find the first Linear issue ID.
 * Priority: branch name > PR title > commit messages
 */
export function extractIssueId(opts: {
  branchName?: string;
  prTitle?: string;
  commitMessages?: string[];
}): string | null {
  if (opts.branchName) {
    const id = extractIssueIdFromBranch(opts.branchName);
    if (id) return id;
  }
  if (opts.prTitle) {
    const id = extractIssueIdFromTitle(opts.prTitle);
    if (id) return id;
  }
  for (const msg of opts.commitMessages ?? []) {
    const id = extractIssueIdFromCommit(msg);
    if (id) return id;
  }
  return null;
}

/**
 * Collect ALL unique Linear issue IDs from all sources.
 * Used for release "done" flows where many commits may reference different tickets.
 */
export function extractAllIssueIds(opts: {
  branchName?: string;
  prTitle?: string;
  commitMessages?: string[];
}): string[] {
  const all: string[] = [];
  const text = [opts.branchName ?? '', opts.prTitle ?? '', ...(opts.commitMessages ?? [])].join('\n');
  return [...new Set([...all, ...extractAllIssueIdsFromText(text)])];
}

// ---------------------------------------------------------------------------
// Linear GraphQL helpers
// ---------------------------------------------------------------------------

async function linearQuery(apiKey: string, query: string, variables?: Record<string, unknown>) {
  const res = await fetch(LINEAR_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: apiKey,
    },
    body: JSON.stringify({query, variables}),
  });

  if (!res.ok) {
    throw new Error(`Linear API error: ${res.status} ${res.statusText}`);
  }

  const json = (await res.json()) as {data?: unknown; errors?: Array<{message: string}>};
  if (json.errors?.length) {
    throw new Error(`Linear GraphQL errors: ${json.errors.map((e) => e.message).join(', ')}`);
  }

  return json.data;
}

/** Look up a Linear issue by its human-readable identifier (e.g. PRO-34) */
export async function getIssue(apiKey: string, identifier: string) {
  // Parse "PRO-34" into team key "PRO" and number 34
  const match = identifier.match(/^([A-Z]+)-(\d+)$/);
  if (!match) {
    console.warn(`Invalid Linear identifier format: ${identifier}`);
    return null;
  }
  const [, teamKey, numberStr] = match;
  const issueNumber = parseInt(numberStr!, 10);

  const data = (await linearQuery(
    apiKey,
    `
    query GetIssue($number: Float!, $teamKey: String!) {
      issues(filter: { number: { eq: $number }, team: { key: { eq: $teamKey } } }) {
        nodes {
          id
          identifier
          title
          state { id name }
          team { id }
        }
      }
    }
  `,
    {number: issueNumber, teamKey},
  )) as {
    issues: {nodes: Array<{id: string; identifier: string; title: string; state: {id: string; name: string}; team: {id: string}}>};
  };

  return data?.issues?.nodes?.[0] ?? null;
}

/** Fetch workflow states for a team, returns a map of state name -> state ID */
export async function getTeamStates(apiKey: string, teamId: string): Promise<Map<string, string>> {
  const data = (await linearQuery(
    apiKey,
    `
    query TeamStates($teamId: ID!) {
      workflowStates(filter: { team: { id: { eq: $teamId } } }) {
        nodes { id name }
      }
    }
  `,
    {teamId},
  )) as {workflowStates: {nodes: Array<{id: string; name: string}>}};

  const map = new Map<string, string>();
  for (const state of data.workflowStates.nodes) {
    map.set(state.name, state.id);
  }
  return map;
}

/** Transition a Linear issue to a new state by name */
export async function transitionIssue(
  apiKey: string,
  issueIdentifier: string,
  targetStateName: string,
): Promise<boolean> {
  const issue = await getIssue(apiKey, issueIdentifier);
  if (!issue) {
    console.warn(`Linear issue ${issueIdentifier} not found`);
    return false;
  }

  if (issue.state.name === targetStateName) {
    console.log(`Issue ${issueIdentifier} is already in state "${targetStateName}"`);
    return true;
  }

  const states = await getTeamStates(apiKey, issue.team.id);
  const targetStateId = states.get(targetStateName);
  if (!targetStateId) {
    console.warn(`State "${targetStateName}" not found for team. Available: ${[...states.keys()].join(', ')}`);
    return false;
  }

  await linearQuery(
    apiKey,
    `
    mutation UpdateIssue($issueId: String!, $stateId: String!) {
      issueUpdate(id: $issueId, input: { stateId: $stateId }) {
        success
      }
    }
  `,
    {issueId: issue.id, stateId: targetStateId},
  );

  console.log(`Transitioned ${issueIdentifier} from "${issue.state.name}" to "${targetStateName}"`);
  return true;
}

/** Add a comment to a Linear issue by identifier */
export async function addComment(apiKey: string, issueIdentifier: string, body: string): Promise<boolean> {
  const issue = await getIssue(apiKey, issueIdentifier);
  if (!issue) {
    console.warn(`Linear issue ${issueIdentifier} not found — skipping comment`);
    return false;
  }

  await linearQuery(
    apiKey,
    `
    mutation CreateComment($issueId: String!, $body: String!) {
      commentCreate(input: { issueId: $issueId, body: $body }) {
        success
      }
    }
  `,
    {issueId: issue.id, body},
  );

  console.log(`Added comment to ${issueIdentifier}`);
  return true;
}

// ---------------------------------------------------------------------------
// GitHub event → Linear state mapping
// ---------------------------------------------------------------------------

/**
 * Determine the target Linear state for a given GitHub event.
 */
export function mapEventToState(eventType: GitHubEventType, reviewState?: string): LinearState | null {
  switch (eventType) {
    case GitHubEventType.PUSH:
    case GitHubEventType.PR_DRAFT:
    case GitHubEventType.PR_OPENED:
      return LinearState.IN_PROGRESS;

    case GitHubEventType.PR_READY:
      return LinearState.IN_REVIEW;

    case GitHubEventType.PR_REVIEW_SUBMITTED:
      if (reviewState === 'changes_requested') return LinearState.IN_PROGRESS;
      if (reviewState === 'approved') return LinearState.IN_REVIEW; // stays in review until merged
      return null;

    case GitHubEventType.PR_MERGED:
      return LinearState.DONE;

    default:
      return null;
  }
}
