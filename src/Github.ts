import https from "https";

export interface GitHubRepoResult {
  name: string;
  fullName: string;
  cloneUrl: string;
  htmlUrl: string;
}

interface CreateRepoOptions {
  token: string;
  repoName: string;
  description?: string;
  isPrivate: boolean;
}

function githubApi<T>(
  method: string,
  urlPath: string,
  token: string,
  body?: object
): Promise<T> {
  return new Promise((resolve, reject) => {
    const payload = body ? JSON.stringify(body) : undefined;

    const options: https.RequestOptions = {
      hostname: "api.github.com",
      path: urlPath,
      method,
      headers: {
        Authorization: `token ${token}`,
        Accept: "application/vnd.github.v3+json",
        "User-Agent": "git-archaeologist/1.0",
        "Content-Type": "application/json",
        ...(payload ? { "Content-Length": Buffer.byteLength(payload) } : {}),
      },
    };

    const req = https.request(options, (res) => {
      let raw = "";
      res.on("data", (chunk: Buffer) => (raw += chunk.toString()));
      res.on("end", () => {
        let parsed: unknown;
        try {
          parsed = JSON.parse(raw);
        } catch {
          return reject(
            new Error(
              `Non-JSON GitHub response (${res.statusCode ?? "?"}): ${raw.slice(0, 200)}`
            )
          );
        }

        const code = res.statusCode ?? 0;
        if (code >= 400) {
          const msg = (parsed as Record<string, unknown>)?.message ?? raw;
          return reject(new Error(`GitHub API ${code}: ${msg}`));
        }
        resolve(parsed as T);
      });
    });

    req.on("error", reject);
    if (payload) req.write(payload);
    req.end();
  });
}

export async function createGitHubRepo(
  opts: CreateRepoOptions
): Promise<GitHubRepoResult> {
  const { token, repoName, description, isPrivate } = opts;

  const repo = await githubApi<{
    name: string;
    full_name: string;
    clone_url: string;
    html_url: string;
  }>("POST", "/user/repos", token, {
    name: repoName,
    description: description ?? "Reconstructed by Git Archaeologist",
    private: isPrivate,
    auto_init: false,
  });

  return {
    name: repo.name,
    fullName: repo.full_name,
    cloneUrl: repo.clone_url,
    htmlUrl: repo.html_url,
  };
}