export interface ParsedGitHubSource {
  owner: string;
  repo: string;
  branch?: string;
  path?: string;
  fullName: string;
  canonicalUrl: string;
}

export function parseGitHubSource(value: string): ParsedGitHubSource | null {
  const trimmed = value.trim();
  const normalized = trimmed.startsWith("http") ? trimmed : `https://${trimmed}`;

  try {
    const url = new URL(normalized);
    if (!url.hostname.toLowerCase().endsWith("github.com")) return null;

    const parts = url.pathname.split("/").filter(Boolean);
    const [owner, repo, mode, branch, ...pathParts] = parts;
    if (!owner || !repo) return null;

    const cleanRepo = repo.replace(/\.git$/, "");
    const parsed: ParsedGitHubSource = {
      owner,
      repo: cleanRepo,
      branch: mode === "tree" || mode === "blob" ? branch : undefined,
      path: pathParts.length ? pathParts.join("/") : undefined,
      fullName: `${owner}/${cleanRepo}`,
      canonicalUrl: `https://github.com/${owner}/${cleanRepo}`,
    };

    return parsed;
  } catch {
    return null;
  }
}

export function describeGitHubSource(value: string): string | null {
  const parsed = parseGitHubSource(value);
  if (!parsed) return null;

  const details = [
    `owner ${parsed.owner}`,
    `repo ${parsed.repo}`,
    parsed.branch ? `branche ${parsed.branch}` : null,
    parsed.path ? `chemin ${parsed.path}` : null,
  ].filter(Boolean).join(", ");

  return `Depot GitHub detecte : ${parsed.fullName} (${details}). Analyse locale sans appel API.`;
}
