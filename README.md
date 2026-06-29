<p align="center">
  <img src="logo-text.png" alt="LeetSync Logo" width="400" />
</p>

# LeetSync

LeetSync is a Chrome extension MVP that detects accepted LeetCode submissions and syncs them into a GitHub repository with a clean problem folder structure.

## Current MVP

- Chrome Manifest V3 extension scaffold
- OAuth-first GitHub configuration with Device Flow
- Personal access token fallback
- Automatic repository creation for the signed-in GitHub user
- LeetCode accepted-submission observer
- Better parsing for title, difficulty, language, runtime, memory, and submission ids
- Background sync pipeline for pushing `solution.<ext>` and `README.md`
- Local storage for settings, pending solutions, sync history, last sync, and errors

## Folder Structure

```text
LeetSync/
  manifest.json
  background/
  content/
  github/
  popup/
  settings/
  storage/
  templates/
  utils/
```

## How To Run

1. Open Chrome and navigate to `chrome://extensions`.
2. Enable Developer Mode.
3. Choose `Load unpacked`.
4. Select `/Users/shreyasggowda/Desktop/LeetSync`.
5. Open the LeetSync popup.
6. Paste your GitHub OAuth Client ID in the popup once if you are not using `.env`.
7. Click `Sign in with GitHub`.
8. Enter the device code in the GitHub page that opens and approve access.
9. Back in the popup, choose a repository name and branch.
10. Keep automatic repository creation enabled if you want LeetSync to create the repo for you.
11. Visit a LeetCode problem and submit an accepted solution.

## Development

```bash
cd /Users/shreyasggowda/Desktop/LeetSync
npm install
npm run check
```

## OAuth Setup

You have two ways to provide the GitHub OAuth Client ID:

1. Recommended for everyday use: paste it directly into the popup field `GitHub OAuth Client ID`
2. Optional developer setup: keep it in:

`/Users/shreyasggowda/Desktop/LeetSync/.env`

Use `.env` like this:

```env
GITHUB_OAUTH_CLIENT_ID=your_client_id_here
GITHUB_OAUTH_CLIENT_SECRET=your_client_secret_here
```

Important:

- For the GitHub Device Flow implementation in the extension, only `GITHUB_OAUTH_CLIENT_ID` is used by the extension.
- `GITHUB_OAUTH_CLIENT_SECRET` should not be shipped inside the browser extension. Keep it only for reference right now, or for a future backend-assisted OAuth flow.
- Reload the extension after editing `.env` so the unpacked extension picks up the new `GITHUB_OAUTH_CLIENT_ID`.

## Notes

- OAuth is now the primary path. PAT is only a fallback for local development or troubleshooting.
- The parser is more resilient now, but LeetCode DOM changes can still require selector updates over time.
- `package.json` has been added so linting/formatting can be installed locally when you're ready.
