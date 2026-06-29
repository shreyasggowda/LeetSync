import { DEFAULT_SETTINGS, MESSAGE_TYPES } from "../utils/constants.js";

const elements = {
  form: document.getElementById("settings-form"),
  saveRepo: document.getElementById("save-repo"),
  manualSync: document.getElementById("manual-sync"),
  oauthLogin: document.getElementById("oauth-login"),
  oauthLogout: document.getElementById("oauth-logout"),
  oauthStatus: document.getElementById("oauth-status"),
  repoSetupHint: document.getElementById("repo-setup-hint"),
  syncState: document.getElementById("sync-state"),
  lastSync: document.getElementById("last-sync"),
  lastError: document.getElementById("last-error"),
  repositoryName: document.getElementById("repository-name"),
  branch: document.getElementById("branch")
};

bootstrap();
setInterval(refreshStatus, 2000);

elements.oauthLogin.addEventListener("click", async () => {
  try {
    const response = await sendMessage({
      type: MESSAGE_TYPES.START_GITHUB_OAUTH
    });
    renderAuthSession(response.authSession);
    elements.lastError.textContent = "";
  } catch (error) {
    elements.lastError.textContent = error.message;
  }
});

elements.oauthLogout.addEventListener("click", async () => {
  try {
    await sendMessage({ type: MESSAGE_TYPES.SIGN_OUT_GITHUB });
    elements.lastError.textContent = "";
    await loadSettings();
    await refreshStatus();
  } catch (error) {
    elements.lastError.textContent = error.message;
  }
});

elements.form.addEventListener("submit", async (event) => {
  event.preventDefault();
  try {
    const payload = {
      repositoryName: elements.repositoryName.value.trim(),
      branch: elements.branch.value.trim() || "main"
    };

    const response = await sendMessage({
      type: MESSAGE_TYPES.SAVE_SETTINGS,
      payload
    });
    if (response.settings) {
      elements.repositoryName.value = response.settings.repositoryName || "";
    }
    elements.lastError.textContent = "";
    await refreshStatus();
  } catch (error) {
    elements.lastError.textContent = error.message;
  }
});

elements.manualSync.addEventListener("click", async () => {
  try {
    await sendMessage({ type: MESSAGE_TYPES.MANUAL_SYNC });
    elements.lastError.textContent = "";
    await refreshStatus();
  } catch (error) {
    elements.lastError.textContent = error.message;
  }
});

async function bootstrap() {
  await loadSettings();
  await refreshStatus();
}

async function loadSettings() {
  const response = await sendMessage({ type: MESSAGE_TYPES.LOAD_SETTINGS });
  const settings = { ...DEFAULT_SETTINGS, ...(response.settings || {}) };
  elements.repositoryName.value = settings.repositoryName || "";
  elements.branch.value = settings.branch || "main";
}

async function refreshStatus() {
  const response = await sendMessage({ type: MESSAGE_TYPES.GET_STATUS });
  elements.syncState.textContent = getFriendlySyncState(response.state);
  elements.lastSync.textContent = response.lastSync
    ? `Last sync: ${response.lastSync.title} at ${response.lastSync.syncedAt}`
    : "No sync yet.";
  elements.lastError.textContent = response.lastError || "";
  renderAuthSession(response.authSession);
}

function renderAuthSession(session) {
  if (!session) {
    elements.oauthStatus.textContent = "Connect GitHub to unlock repo setup.";
    elements.oauthLogout.classList.add("hidden");
    elements.oauthLogin.classList.remove("hidden");
    elements.oauthLogin.textContent = "Connect GitHub";
    setRepositorySetupEnabled(false);
    return;
  }

  if (session.state === "PENDING") {
    elements.oauthStatus.textContent = `Open GitHub and enter code ${session.userCode}.`;
    elements.oauthLogout.classList.add("hidden");
    elements.oauthLogin.classList.remove("hidden");
    elements.oauthLogin.textContent = "Waiting for GitHub...";
    setRepositorySetupEnabled(false);
    return;
  }

  if (session.state === "AUTHORIZED") {
    elements.oauthStatus.textContent = session.message || "GitHub connected.";
    elements.oauthLogout.classList.remove("hidden");
    elements.oauthLogin.classList.add("hidden");
    setRepositorySetupEnabled(true);
    return;
  }

  elements.oauthLogout.classList.add("hidden");
  elements.oauthLogin.classList.remove("hidden");
  elements.oauthLogin.textContent = "Connect GitHub";
  elements.oauthStatus.textContent = session.message || `OAuth status: ${session.state}`;
  setRepositorySetupEnabled(false);
}

function setRepositorySetupEnabled(enabled) {
  const fields = [
    elements.repositoryName,
    elements.branch,
    elements.saveRepo,
    elements.manualSync
  ];

  for (const field of fields) {
    field.disabled = !enabled;
  }

  elements.form.classList.toggle("disabled-card", !enabled);
  elements.repoSetupHint.textContent = enabled
    ? "Choose your repo and save once. LeetSync handles the rest."
    : "Connect GitHub first, then save where solutions should be pushed.";
}

function getFriendlySyncState(state) {
  switch (state) {
    case "WAITING_FOR_ACCEPTED":
      return "Ready";
    case "EXTRACTING":
      return "Capturing";
    case "SYNCING":
      return "Syncing";
    case "SUCCESS":
      return "Synced";
    case "FAILED":
      return "Needs Attention";
    case "IDLE":
      return "Idle";
    default:
      return state || "Unknown";
  }
}

function sendMessage(message) {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage(message, (response) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
        return;
      }

      if (!response?.ok) {
        reject(new Error(response?.error || "Unknown extension error"));
        return;
      }

      resolve(response);
    });
  });
}
