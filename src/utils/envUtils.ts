import fs from 'fs';

export type EnvMap = Record<string, string>;

/** Parse a .env file into a key→value map */
export function parseEnvFile(filePath: string): EnvMap {
  if (!fs.existsSync(filePath)) {
    return {};
  }
  const result: EnvMap = {};
  for (const line of fs.readFileSync(filePath, 'utf8').split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) {
      continue;
    }
    const eq = trimmed.indexOf('=');
    if (eq === -1) {
      continue;
    }
    const key = trimmed.slice(0, eq).trim();
    const raw = trimmed.slice(eq + 1).trim();
    result[key] = raw.replace(/^["']|["']$/g, '');
  }
  return result;
}

/** Serialize a key→value map back to .env file format */
export function serializeEnvFile(vars: EnvMap): string {
  return (
    Object.entries(vars)
      .map(([k, v]) => {
        const needsQuotes = v.includes(' ') || v.includes('#') || v.includes('"');
        return `${k}=${needsQuotes ? `"${v}"` : v}`;
      })
      .join('\n') + '\n'
  );
}

/** Write a key→value map to a .env file */
export function writeEnvFile(filePath: string, vars: EnvMap): void {
  fs.writeFileSync(filePath, serializeEnvFile(vars), 'utf8');
}

/**
 * Merge two EnvMaps — values in `overrides` win over `base`.
 * Useful when layering .env.local on top of .env.
 */
export function mergeEnvMaps(base: EnvMap, overrides: EnvMap): EnvMap {
  return {...base, ...overrides};
}

/**
 * Validate that all required keys are present in an EnvMap.
 * Throws with a descriptive error listing missing keys.
 */
export function validateRequiredKeys(vars: EnvMap, required: string[]): void {
  const missing = required.filter((k) => !(k in vars) || vars[k] === '');
  if (missing.length > 0) {
    throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
  }
}
