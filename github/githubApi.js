import { encodeBase64 } from "../utils/helpers.js";

function buildHeaders(token) {
  return {
    Authorization: `Bearer ${token}`,
    Accept: "application/vnd.github+json",
    "Content-Type": "application/json"
  };
}

async function githubRequest(url, token, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: {
      ...buildHeaders(token),
      ...(options.headers || {})
    }
  });

  if (response.status === 404) {
    return null;
  }

  if (!response.ok) {
    const bodyText = await response.text();
    let errorMessage = bodyText;
    try {
      const json = JSON.parse(bodyText);
      errorMessage = json.message || bodyText;
      if (response.status === 422 && json.errors?.length > 0) {
        errorMessage = `${json.message}: ${json.errors.map(e => e.message).join(", ")}`;
      } else if (response.status === 401 || response.status === 403) {
        errorMessage = `GitHub access denied. Please sign out and reconnect. (${json.message})`;
      }
    } catch (e) {
      // Body wasn't JSON
    }
    throw new Error(`GitHub Error: ${errorMessage}`);
  }

  return response.json();
}

export async function getRepository({ token, owner, repo }) {
  return githubRequest(`https://api.github.com/repos/${owner}/${repo}`, token);
}

export async function createRepository({ token, name, description, isPrivate = false }) {
  return githubRequest("https://api.github.com/user/repos", token, {
    method: "POST",
    body: JSON.stringify({
      name,
      description,
      private: isPrivate,
      auto_init: true
    })
  });
}

export async function getFile({ token, owner, repo, path, branch }) {
  const url = new URL(`https://api.github.com/repos/${owner}/${repo}/contents/${path}`);
  if (branch) {
    url.searchParams.set("ref", branch);
  }
  return githubRequest(url.toString(), token);
}

export async function createOrUpdateFile({
  token,
  owner,
  repo,
  path,
  branch,
  content,
  message
}) {
  const existing = await getFile({ token, owner, repo, path, branch });
  const payload = {
    message,
    content: encodeBase64(content),
    branch
  };

  if (existing?.sha) {
    payload.sha = existing.sha;
  }

  return githubRequest(`https://api.github.com/repos/${owner}/${repo}/contents/${path}`, token, {
    method: "PUT",
    body: JSON.stringify(payload)
  });
}

export async function deleteFile({
  token,
  owner,
  repo,
  path,
  branch,
  message
}) {
  const existing = await getFile({ token, owner, repo, path, branch });
  if (!existing?.sha) {
    return null;
  }

  return githubRequest(`https://api.github.com/repos/${owner}/${repo}/contents/${path}`, token, {
    method: "DELETE",
    body: JSON.stringify({
      message,
      sha: existing.sha,
      branch
    })
  });
}
