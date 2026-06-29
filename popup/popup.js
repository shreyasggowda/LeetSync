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
  repoName: document.getElementById("repository-name"),
  branch: document.getElementById("branch"),
  autoCreate: document.getElementById("auto-create")
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
  const originalText = elements.saveRepo.textContent;
  elements.saveRepo.textContent = "Connecting...";
  elements.saveRepo.disabled = true;
  elements.lastError.textContent = "";

  try {
    const payload = {
      repositoryName: elements.repoName.value.trim(),
      branch: elements.branch.value.trim() || "main",
      createRepositoryIfMissing: elements.autoCreate.checked
    };

    const response = await sendMessage({
      type: MESSAGE_TYPES.SAVE_SETTINGS,
      payload
    });
    
    if (response.settings) {
      elements.repoName.value = response.settings.repositoryName || "";
    }
    
    elements.saveRepo.textContent = "Successfully Connected!";
    elements.saveRepo.style.background = "var(--success)";
    setTimeout(() => {
      elements.saveRepo.textContent = originalText;
      elements.saveRepo.style.background = "";
    }, 2500);

    await refreshStatus();
  } catch (error) {
    elements.lastError.textContent = error.message;
    elements.saveRepo.textContent = originalText;
  } finally {
    elements.saveRepo.disabled = false;
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
  if (response?.settings) {
    elements.repoName.value = response.settings.repositoryName || "";
    elements.branch.value = response.settings.branch || "main";
    elements.autoCreate.checked = response.settings.createRepositoryIfMissing !== false;
  }
}

async function refreshStatus() {
  const response = await sendMessage({ type: MESSAGE_TYPES.GET_STATUS });
  elements.syncState.textContent = getFriendlySyncState(response.state);
  elements.lastSync.textContent = response.lastSync
    ? `Last sync: ${response.lastSync.title} at ${response.lastSync.syncedAt}`
    : "No sync yet.";
  elements.lastError.textContent = response.lastError || "";
  renderAuthSession(response.authSession);
  renderDashboard(response.problemStats);
}

function renderDashboard(problemStats) {
  if (!problemStats || Object.keys(problemStats).length === 0) {
    document.getElementById("dashboard-section").style.display = "none";
    return;
  }

  document.getElementById("dashboard-section").style.display = "block";
  
  let easy = 0, medium = 0, hard = 0;
  for (const key in problemStats) {
    const diff = problemStats[key].difficulty;
    if (diff === "Easy") easy++;
    else if (diff === "Medium") medium++;
    else if (diff === "Hard") hard++;
  }

  document.getElementById("stat-easy").textContent = easy;
  document.getElementById("stat-medium").textContent = medium;
  document.getElementById("stat-hard").textContent = hard;
  document.getElementById("stat-total").textContent = (easy + medium + hard);
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
    elements.oauthStatus.innerHTML = `Open GitHub and enter code:<div class="device-code-container">${renderDeviceCode(session.userCode)}</div>`;
    
    const copyBtn = document.getElementById("copy-code-btn");
    if (copyBtn) {
      copyBtn.addEventListener("click", () => {
        navigator.clipboard.writeText(session.userCode);
        copyBtn.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#22c55e" stroke-width="2"><polyline points="20 6 9 17 4 12"></polyline></svg>';
        setTimeout(() => {
          copyBtn.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>';
        }, 2000);
      });
    }

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
    elements.repoName,
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

function renderDeviceCode(code) {
  if (!code) return "";
  const boxes = code.split('').map(char => {
    if (char === '-') return `<span class="code-dash">-</span>`;
    return `<div class="code-box">${char}</div>`;
  }).join('');

  return `${boxes}
    <button id="copy-code-btn" class="copy-btn" title="Copy code">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
        <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
      </svg>
    </button>`;
}
