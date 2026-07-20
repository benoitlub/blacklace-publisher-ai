export interface GitHubPagesPublication {
  status: "published" | "not-configured" | "failed";
  repository?: string;
  branch?: string;
  path?: string;
  url?: string;
  commitUrl?: string;
  message?: string;
}

export interface PublishGitHubPageInput {
  slug: string;
  html: string;
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

export async function publishGitHubPage(input: PublishGitHubPageInput): Promise<GitHubPagesPublication> {
  const token = process.env.PUBLISHER_GITHUB_TOKEN?.trim();
  const repository = process.env.PUBLISHER_PAGES_REPOSITORY?.trim();
  const branch = process.env.PUBLISHER_PAGES_BRANCH?.trim() || "main";
  const root = (process.env.PUBLISHER_PAGES_ROOT?.trim() || "harvests").replace(/^\/+|\/+$/g, "");

  if (!token || !repository) {
    return {
      status: "not-configured",
      message: "GitHub Pages publishing requires PUBLISHER_GITHUB_TOKEN and PUBLISHER_PAGES_REPOSITORY.",
    };
  }

  const parts = repositoryParts(repository);
  if (!parts) return { status: "failed", message: "PUBLISHER_PAGES_REPOSITORY must use owner/repository format." };

  const slug = cleanSlug(input.slug);
  const folder = root ? `${root}/${slug}` : slug;
  const path = `${folder}/index.html`;
  const endpoint = `https://api.github.com/repos/${encodeURIComponent(parts.owner)}/${encodeURIComponent(parts.repo)}/contents/${path.split("/").map(encodeURIComponent).join("/")}`;
  const headers = {
    Accept: "application/vnd.github+json",
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
    "User-Agent": "blacklace-publisher",
    "X-GitHub-Api-Version": "2022-11-28",
  };

  try {
    const current = await fetch(`${endpoint}?ref=${encodeURIComponent(branch)}`, { headers, cache: "no-store" });
    const currentPayload = await current.json().catch(() => ({})) as { sha?: unknown; message?: unknown };
    if (!current.ok && current.status !== 404) {
      return {
        status: "failed",
        repository,
        branch,
        path,
        message: typeof currentPayload.message === "string" ? currentPayload.message : `GitHub lookup failed (${current.status}).`,
      };
    }

    const body: Record<string, unknown> = {
      message: input.commitMessage?.trim() || `Publish ${slug} landing page`,
      content: base64Utf8(input.html),
      branch,
    };
    if (typeof currentPayload.sha === "string") body.sha = currentPayload.sha;

    const response = await fetch(endpoint, {
      method: "PUT",
      headers,
      body: JSON.stringify(body),
    });
    const payload = await response.json().catch(() => ({})) as {
      content?: { html_url?: unknown };
      commit?: { html_url?: unknown };
      message?: unknown;
    };
    if (!response.ok) {
      return {
        status: "failed",
        repository,
        branch,
        path,
        message: typeof payload.message === "string" ? payload.message : `GitHub publication failed (${response.status}).`,
      };
    }

    return {
      status: "published",
      repository,
      branch,
      path,
      url: pagesUrl(parts.owner, parts.repo, folder),
      commitUrl: typeof payload.commit?.html_url === "string" ? payload.commit.html_url : undefined,
      message: "Landing page committed to the configured GitHub Pages repository.",
    };
  } catch (error) {
    return {
      status: "failed",
      repository,
      branch,
      path,
      message: error instanceof Error ? error.message : "GitHub publication failed.",
    };
  }
}
