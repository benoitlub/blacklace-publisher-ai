export interface GitHubPagesPublication {
  status: "review-ready" | "not-configured" | "failed";
  repository?: string;
  branch?: string;
  baseBranch?: string;
  path?: string;
  url?: string;
  pullRequestUrl?: string;
  commitUrl?: string;
  message?: string;
}

export interface PublishGitHubPageInput {
  slug: string;
  html: string;
  title?: string;
  commitMessage?: string;
}

function cleanSlug(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80) || `harvest-${Date.now()}`;
}

function repositoryParts(value: string): { owner: string; repo: string } | null {
  const [owner, repo, ...rest] = value.trim().split("/");
  return owner && repo && rest.length === 0 ? { owner, repo } : null;
}

function base64Utf8(value: string): string {
  return Buffer.from(value, "utf8").toString("base64");
}

function pagesUrl(owner: string, repo: string, folder: string): string {
  if (repo.toLowerCase() === `${owner.toLowerCase()}.github.io`) return `https://${owner.toLowerCase()}.github.io/${folder}/`;
  return `https://${owner.toLowerCase()}.github.io/${repo}/${folder}/`;
}

async function githubJson<T>(url: string, init: RequestInit, headers: Record<string, string>): Promise<{ ok: boolean; status: number; payload: T }> {
  const response = await fetch(url, { ...init, headers: { ...headers, ...(init.headers ?? {}) }, cache: "no-store" });
  const payload = await response.json().catch(() => ({})) as T;
  return { ok: response.ok, status: response.status, payload };
}

export async function publishGitHubPage(input: PublishGitHubPageInput): Promise<GitHubPagesPublication> {
  const token = process.env.PUBLISHER_GITHUB_TOKEN?.trim();
  const repository = process.env.PUBLISHER_PAGES_REPOSITORY?.trim();
  const baseBranch = process.env.PUBLISHER_PAGES_BRANCH?.trim() || "main";
  const root = (process.env.PUBLISHER_PAGES_ROOT?.trim() || "harvests").replace(/^\/+|\/+$/g, "");

  if (!token || !repository) {
    return { status: "not-configured", message: "GitHub review requires PUBLISHER_GITHUB_TOKEN and PUBLISHER_PAGES_REPOSITORY." };
  }

  const parts = repositoryParts(repository);
  if (!parts) return { status: "failed", message: "PUBLISHER_PAGES_REPOSITORY must use owner/repository format." };

  const slug = cleanSlug(input.slug);
  const folder = root ? `${root}/${slug}` : slug;
  const path = `${folder}/index.html`;
  const branch = `publisher/${slug}-${Date.now()}`;
  const api = `https://api.github.com/repos/${encodeURIComponent(parts.owner)}/${encodeURIComponent(parts.repo)}`;
  const headers = {
    Accept: "application/vnd.github+json",
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
    "User-Agent": "blacklace-publisher",
    "X-GitHub-Api-Version": "2022-11-28",
  };

  try {
    const base = await githubJson<{ object?: { sha?: string }; message?: string }>(
      `${api}/git/ref/heads/${encodeURIComponent(baseBranch)}`,
      { method: "GET" },
      headers,
    );
    const baseSha = base.payload.object?.sha;
    if (!base.ok || !baseSha) {
      return { status: "failed", repository, baseBranch, path, message: base.payload.message ?? `GitHub base branch lookup failed (${base.status}).` };
    }

    const ref = await githubJson<{ message?: string }>(
      `${api}/git/refs`,
      { method: "POST", body: JSON.stringify({ ref: `refs/heads/${branch}`, sha: baseSha }) },
      headers,
    );
    if (!ref.ok) return { status: "failed", repository, branch, baseBranch, path, message: ref.payload.message ?? `GitHub branch creation failed (${ref.status}).` };

    const endpoint = `${api}/contents/${path.split("/").map(encodeURIComponent).join("/")}`;
    const current = await githubJson<{ sha?: string; message?: string }>(`${endpoint}?ref=${encodeURIComponent(branch)}`, { method: "GET" }, headers);
    const body: Record<string, unknown> = {
      message: input.commitMessage?.trim() || `Publisher: prepare ${slug} landing page`,
      content: base64Utf8(input.html),
      branch,
    };
    if (current.ok && current.payload.sha) body.sha = current.payload.sha;
    if (!current.ok && current.status !== 404) {
      return { status: "failed", repository, branch, baseBranch, path, message: current.payload.message ?? `GitHub file lookup failed (${current.status}).` };
    }

    const commit = await githubJson<{ commit?: { html_url?: string }; message?: string }>(
      endpoint,
      { method: "PUT", body: JSON.stringify(body) },
      headers,
    );
    if (!commit.ok) return { status: "failed", repository, branch, baseBranch, path, message: commit.payload.message ?? `GitHub commit failed (${commit.status}).` };

    const pull = await githubJson<{ html_url?: string; message?: string }>(
      `${api}/pulls`,
      {
        method: "POST",
        body: JSON.stringify({
          title: input.title?.trim() || `Publisher: ${slug}`,
          head: branch,
          base: baseBranch,
          body: [
            "## Récolte Blacklace Publisher",
            "",
            `Landing générée dans \`${path}\`.`,
            "",
            "La fusion de cette PR publiera ou mettra à jour la page via GitHub Pages.",
            "Aucune publication directe n’a été effectuée par Publisher.",
          ].join("\n"),
        }),
      },
      headers,
    );
    if (!pull.ok || !pull.payload.html_url) {
      return { status: "failed", repository, branch, baseBranch, path, commitUrl: commit.payload.commit?.html_url, message: pull.payload.message ?? `Pull request creation failed (${pull.status}).` };
    }

    return {
      status: "review-ready",
      repository,
      branch,
      baseBranch,
      path,
      url: pagesUrl(parts.owner, parts.repo, folder),
      pullRequestUrl: pull.payload.html_url,
      commitUrl: commit.payload.commit?.html_url,
      message: "Landing page committed on a review branch; merge the pull request to publish it.",
    };
  } catch (error) {
    return { status: "failed", repository, baseBranch, path, message: error instanceof Error ? error.message : "GitHub review preparation failed." };
  }
}
