export async function createGitHubRepo(opts: {
  token: string;
  name: string;
  private: boolean;
}): Promise<{ cloneUrl: string; htmlUrl: string }> {
  const res = await fetch("https://api.github.com/user/repos", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${opts.token}`,
      Accept: "application/vnd.github+json",
      "Content-Type": "application/json",
      "X-GitHub-Api-Version": "2022-11-28"
    },
    body: JSON.stringify({
      name: opts.name,
      private: opts.private,
      auto_init: false
    })
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`GitHub repo create failed: ${res.status} ${text}`);
  }

  const data = await res.json() as {
    clone_url: string;
    html_url: string;
  };

  return {
    cloneUrl: data.clone_url,
    htmlUrl: data.html_url
  };
}