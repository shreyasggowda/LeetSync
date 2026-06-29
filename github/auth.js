export async function validateGitHubToken(token) {
  const response = await fetch("https://api.github.com/user", {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json"
    }
  });

  if (!response.ok) {
    throw new Error("GitHub token is invalid or missing required scopes.");
  }

  return response.json();
}
