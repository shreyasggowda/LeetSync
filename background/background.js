import { validateGitHubToken } from "../github/auth.js";
import { createSolutionCommitMessage } from "../github/commit.js";
import { createOrUpdateFile, createRepository, deleteFile, getRepository } from "../github/githubApi.js";
import {
  addSyncHistoryItem,
  clearSettings,
  clearAuthSession,
  clearPendingSolution,
  getAuthSession,
  getLastError,
  getLastSync,
  getProblemStats,
  getSyncHistory,
  getPendingSolution,
  getSettings,
  saveAuthSession,
  saveLastError,
  saveLastSync,
  savePendingSolution,
  saveProblemStats,
  saveSettings
} from "../storage/storage.js";
import { generateReadme, generateRepositoryReadme } from "../templates/readmeGenerator.js";
import { AUTH_STATES, MESSAGE_TYPES, SYNC_STATES } from "../utils/constants.js";
import { buildProblemFolder, buildProblemKey, inferFileExtension, normalizeLanguageLabel, parseEnvFile } from "../utils/helpers.js";

let currentState = SYNC_STATES.IDLE;
const GITHUB_DEVICE_FLOW_ALARM = "github-device-flow-poll";
let hasValidatedStoredAuth = false;

chrome.runtime.onInstalled.addListener(() => {
  void initializeExtensionState();
});

chrome.runtime.onStartup.addListener(() => {
  void initializeExtensionState();
});

chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name !== GITHUB_DEVICE_FLOW_ALARM) {
    return;
  }

  await pollGitHubDeviceFlow();
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  handleMessage(message)
    .then((result) => sendResponse({ ok: true, ...result }))
    .catch((error) => {
      currentState = SYNC_STATES.FAILED;
      saveLastError(error.message);
      sendResponse({ ok: false, error: error.message });
    });

  return true;
});

async function handleMessage(message) {
  switch (message.type) {
    case MESSAGE_TYPES.SOLUTION_DETECTED:
      return handleSolutionDetected(message.payload);
    case MESSAGE_TYPES.MANUAL_SYNC:
      return handleManualSync();
    case MESSAGE_TYPES.GET_STATUS:
      await validateStoredAuthIfNeeded();
      return {
        state: currentState,
        authSession: await getAuthSession(),
        lastSync: await getLastSync(),
        syncHistory: await getSyncHistory(),
        lastError: await getLastError(),
        pendingSolution: await getPendingSolution()
      };
    case MESSAGE_TYPES.SAVE_SETTINGS:
      return saveUserSettings(message.payload);
    case MESSAGE_TYPES.START_GITHUB_OAUTH:
      return startGitHubOAuth(message.payload);
    case MESSAGE_TYPES.SIGN_OUT_GITHUB:
      return signOutGitHub();
    case MESSAGE_TYPES.LOAD_SETTINGS:
      return { settings: await getSettings() };
    case MESSAGE_TYPES.CLEAR_SETTINGS:
      await clearSettings();
      currentState = SYNC_STATES.IDLE;
      return { message: "Stored settings cleared." };
    default:
      throw new Error(`Unsupported message type: ${message.type}`);
  }
}

async function saveUserSettings(settings) {
  const existingSettings = await getSettings();
  const accessToken = settings.githubToken?.trim()
    || settings.githubOAuthToken?.trim()
    || existingSettings.githubOAuthToken
    || "";

  if (!accessToken) {
    await saveSettings({
      ...existingSettings,
      ...settings
    });
    currentState = SYNC_STATES.IDLE;
    return {
      message: "Settings saved.",
      settings: await getSettings()
    };
  }

  const user = await validateGitHubToken(accessToken);
  const repositoryOwner = settings.repositoryOwner || user.login;
  const repositoryName = settings.repositoryName || "my-leetcode-solutions";
  const normalizedSettings = {
    ...existingSettings,
    ...settings,
    githubToken: settings.githubToken?.trim() || "",
    githubOAuthClientId: settings.githubOAuthClientId?.trim() || existingSettings.githubOAuthClientId || "",
    githubOAuthToken: settings.githubOAuthToken?.trim() || existingSettings.githubOAuthToken || "",
    repositoryOwner,
    repositoryName
  };

  const existingRepo = await getRepository({
    token: accessToken,
    owner: repositoryOwner,
    repo: repositoryName
  });

  if (!existingRepo) {
    if (!settings.createRepositoryIfMissing) {
      throw new Error(`Repository ${repositoryOwner}/${repositoryName} was not found. Enter an existing repo name or enable auto-create.`);
    }

    if (repositoryOwner !== user.login) {
      throw new Error(`Auto-create is only supported for your own account. Use ${user.login} as the owner or create the repo manually.`);
    }

    await createRepository({
      token: accessToken,
      name: repositoryName,
      description: "Automatically synced LeetCode solutions from LeetSync."
    });
  }

  await saveSettings(normalizedSettings);
  await saveLastError("");
  currentState = SYNC_STATES.IDLE;
  hasValidatedStoredAuth = true;

  return {
    message: "Settings saved.",
    settings: normalizedSettings
  };
}

async function handleSolutionDetected(solution) {
  if (solution.status !== "Accepted") {
    currentState = SYNC_STATES.WAITING;
    return { message: "Ignoring non-accepted submission." };
  }

  if (!solution.submissionId) {
    currentState = SYNC_STATES.WAITING;
    return { message: "Accepted submission detected, but submission id is missing. Skipping to avoid uncertain sync." };
  }

  currentState = SYNC_STATES.EXTRACTING;

  const normalizedSolution = {
    ...solution,
    submissionTime: solution.submissionTime || new Date().toLocaleString()
  };

  await savePendingSolution(normalizedSolution);

  const settings = await getSettings();
  if (!settings.autoSync) {
    currentState = SYNC_STATES.IDLE;
    return { message: "Solution captured and saved for manual sync." };
  }

  return syncSolution(normalizedSolution, settings);
}

async function handleManualSync() {
  const solution = await getPendingSolution();
  const settings = await getSettings();
  if (!solution) {
    return refreshRepositoryIndex(settings);
  }

  return syncSolution(solution, settings);
}

async function syncSolution(solution, settings) {
  currentState = SYNC_STATES.SYNCING;

  const accessToken = settings.githubToken || settings.githubOAuthToken;
  if (!accessToken || !settings.repositoryOwner || !settings.repositoryName) {
    throw new Error("Complete GitHub setup in the popup before syncing.");
  }

  const nextSolution = await enrichSolutionMetadata(solution);
  if (nextSolution.shouldSkipSync) {
    currentState = SYNC_STATES.IDLE;
    await clearPendingSolution();
    return {
      message: `Skipping duplicate accepted submission for ${nextSolution.title}.`,
      lastSync: await getLastSync()
    };
  }

  const folder = buildProblemFolder(nextSolution);
  const extension = inferFileExtension(nextSolution.language);
  const branch = settings.branch || "main";
  const baseMessage = createSolutionCommitMessage(nextSolution);
  const codePath = `${folder}/solution.${extension}`;
  const readmePath = `${folder}/README.md`;

  if (nextSolution.previousMetadata?.latestCodePath && nextSolution.previousMetadata.latestCodePath !== codePath) {
    await deleteFile({
      token: accessToken,
      owner: settings.repositoryOwner,
      repo: settings.repositoryName,
      path: nextSolution.previousMetadata.latestCodePath,
      branch,
      message: `${baseMessage}\nCleanup: remove previous language file`
    });
  }

  await createOrUpdateFile({
    token: accessToken,
    owner: settings.repositoryOwner,
    repo: settings.repositoryName,
    path: codePath,
    branch,
    content: nextSolution.code || "// Code could not be extracted automatically.",
    message: baseMessage
  });

  if (settings.generateReadme) {
    await createOrUpdateFile({
      token: accessToken,
      owner: settings.repositoryOwner,
      repo: settings.repositoryName,
      path: readmePath,
      branch,
      content: generateReadme(nextSolution),
      message: `${baseMessage}\nREADME: update metadata`
    });
  }

  const problemStats = await getNormalizedProblemStats();
  await writeRepositoryIndex({
    accessToken,
    settings,
    problemStats,
    branch,
    message: `${baseMessage}\nIndex: refresh catalog`
  });

  const lastSync = {
    title: nextSolution.title,
    difficulty: nextSolution.difficulty,
    language: nextSolution.language,
    runtime: nextSolution.runtime,
    memory: nextSolution.memory,
    syncedAt: new Date().toLocaleString(),
    branch,
    url: nextSolution.url,
    submissionCount: nextSolution.metadata?.submissionCount || 1
  };

  await saveLastSync(lastSync);
  await addSyncHistoryItem(lastSync);
  await clearPendingSolution();
  await saveLastError("");

  currentState = SYNC_STATES.SUCCESS;
  await notifySuccess(nextSolution.title);

  return {
    message: `Synced ${nextSolution.title} successfully.`,
    lastSync
  };
}

async function notifySuccess(title) {
  await chrome.notifications.create({
    type: "basic",
    iconUrl: chrome.runtime.getURL("icons/icon128.png"),
    title: "LeetSync",
    message: `Synced "${title}" to GitHub.`
  });
}

async function startGitHubOAuth(requestPayload = {}) {
  const existingSession = await getAuthSession();
  if (existingSession?.state === AUTH_STATES.PENDING && Date.now() < existingSession.expiresAt) {
    return {
      message: "GitHub OAuth already started.",
      authSession: existingSession
    };
  }

  const env = await loadExtensionEnv();
  const settings = await getSettings();
  const clientId = requestPayload.clientId?.trim()
    || settings.githubOAuthClientId
    || env.GITHUB_OAUTH_CLIENT_ID;

  if (!clientId) {
    throw new Error("Add your GitHub OAuth Client ID in the popup or in the extension .env file.");
  }

  if (requestPayload.clientId?.trim() && requestPayload.clientId.trim() !== settings.githubOAuthClientId) {
    await saveSettings({
      ...settings,
      githubOAuthClientId: requestPayload.clientId.trim()
    });
  }

  const response = await fetch("https://github.com/login/device/code", {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/x-www-form-urlencoded"
    },
    body: new URLSearchParams({
      client_id: clientId,
      scope: "repo"
    })
  });

  if (!response.ok) {
    throw new Error("Failed to start GitHub OAuth device flow.");
  }

  const oauthPayload = await parseOAuthResponse(response);
  if (oauthPayload.error) {
    throw new Error(oauthPayload.error_description || oauthPayload.error);
  }

  if (!oauthPayload.device_code || !oauthPayload.user_code || !oauthPayload.verification_uri) {
    throw new Error("GitHub OAuth app is not returning a valid device-flow response. Check the Client ID and ensure Device Flow is enabled.");
  }

  const authSession = {
    state: AUTH_STATES.PENDING,
    clientId,
    deviceCode: oauthPayload.device_code,
    userCode: oauthPayload.user_code,
    verificationUri: oauthPayload.verification_uri,
    intervalSeconds: oauthPayload.interval || 5,
    expiresAt: Date.now() + (oauthPayload.expires_in * 1000),
    startedAt: Date.now(),
    message: "Open GitHub and enter the device code to authorize LeetSync."
  };

  await saveAuthSession(authSession);
  await chrome.alarms.clear(GITHUB_DEVICE_FLOW_ALARM);
  await chrome.alarms.create(GITHUB_DEVICE_FLOW_ALARM, {
    periodInMinutes: Math.max((authSession.intervalSeconds || 5) / 60, 0.1)
  });
  await chrome.tabs.create({ url: authSession.verificationUri });

  return {
    message: "GitHub OAuth started.",
    authSession
  };
}

async function pollGitHubDeviceFlow() {
  const session = await getAuthSession();
  if (!session || session.state !== AUTH_STATES.PENDING) {
    await chrome.alarms.clear(GITHUB_DEVICE_FLOW_ALARM);
    return;
  }

  if (Date.now() >= session.expiresAt) {
    await saveAuthSession({
      ...session,
      state: AUTH_STATES.EXPIRED,
      message: "GitHub device code expired. Start OAuth again."
    });
    await chrome.alarms.clear(GITHUB_DEVICE_FLOW_ALARM);
    return;
  }

  const response = await fetch("https://github.com/login/oauth/access_token", {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/x-www-form-urlencoded"
    },
    body: new URLSearchParams({
      client_id: session.clientId,
      device_code: session.deviceCode,
      grant_type: "urn:ietf:params:oauth:grant-type:device_code"
    })
  });

  if (!response.ok) {
    await saveAuthSession({
      ...session,
      state: AUTH_STATES.FAILED,
      message: "GitHub OAuth polling failed."
    });
    await chrome.alarms.clear(GITHUB_DEVICE_FLOW_ALARM);
    return;
  }

  const tokenPayload = await parseOAuthResponse(response);
  if (tokenPayload.access_token) {
    const user = await validateGitHubToken(tokenPayload.access_token);
    const settings = await getSettings();
    const nextSettings = {
      ...settings,
      githubToken: "",
      githubOAuthClientId: settings.githubOAuthClientId || session.clientId,
      githubOAuthToken: tokenPayload.access_token,
      repositoryOwner: settings.repositoryOwner || user.login
    };

    await saveSettings(nextSettings);
    await saveAuthSession({
      ...session,
      state: AUTH_STATES.AUTHORIZED,
      userLogin: user.login,
      message: `Authorized as ${user.login}.`,
      completedAt: Date.now()
    });
    await saveLastError("");
    hasValidatedStoredAuth = true;
    await chrome.alarms.clear(GITHUB_DEVICE_FLOW_ALARM);
    return;
  }

  if (tokenPayload.error === "authorization_pending") {
    await saveAuthSession({
      ...session,
      message: "Waiting for GitHub authorization..."
    });
    return;
  }

  if (tokenPayload.error === "slow_down") {
    const intervalSeconds = (session.intervalSeconds || 5) + 5;
    await saveAuthSession({
      ...session,
      intervalSeconds,
      message: "GitHub asked LeetSync to slow down polling."
    });
    await chrome.alarms.clear(GITHUB_DEVICE_FLOW_ALARM);
    await chrome.alarms.create(GITHUB_DEVICE_FLOW_ALARM, {
      periodInMinutes: Math.max(intervalSeconds / 60, 0.1)
    });
    return;
  }

  const nextState = tokenPayload.error === "expired_token"
    ? AUTH_STATES.EXPIRED
    : AUTH_STATES.FAILED;

  await saveAuthSession({
    ...session,
    state: nextState,
    message: tokenPayload.error_description || tokenPayload.error || "GitHub OAuth failed."
  });
  await chrome.alarms.clear(GITHUB_DEVICE_FLOW_ALARM);
}

async function loadExtensionEnv() {
  const response = await fetch(chrome.runtime.getURL(".env"));
  if (!response.ok) {
    return {};
  }

  const text = await response.text();
  return parseEnvFile(text);
}

async function parseOAuthResponse(response) {
  const raw = await response.text();
  const trimmed = raw.trim();

  if (!trimmed) {
    throw new Error("GitHub OAuth returned an empty response.");
  }

  if (trimmed.startsWith("<")) {
    throw new Error("GitHub returned HTML instead of a device-flow response. This usually means the OAuth app configuration or Client ID is wrong.");
  }

  try {
    return JSON.parse(trimmed);
  } catch (_error) {
    const params = new URLSearchParams(trimmed);
    if ([...params.keys()].length > 0) {
      return Object.fromEntries(params.entries());
    }

    throw new Error(`Unexpected GitHub OAuth response: ${trimmed.slice(0, 200)}`);
  }
}

async function enrichSolutionMetadata(solution) {
  const stats = await getNormalizedProblemStats();
  const problemKey = buildProblemKey(solution);
  const previous = stats[problemKey];
  if (solution.submissionId && previous?.lastSubmissionId === solution.submissionId) {
    return {
      ...solution,
      metadata: previous,
      shouldSkipSync: true
    };
  }

  const now = solution.submissionTime || new Date().toLocaleString();
  const normalizedLanguage = normalizeLanguageLabel(solution.language);
  const languagesUsed = new Set(previous?.languagesUsed || []);
  languagesUsed.add(normalizedLanguage);
  const latestCodePath = `${buildProblemFolder(solution)}/solution.${inferFileExtension(normalizedLanguage)}`;
  const metadata = {
    firstSolved: previous?.firstSolved || now,
    lastSolved: now,
    lastUpdated: now,
    submissionCount: (previous?.submissionCount || 0) + 1,
    lastSubmissionId: solution.submissionId || previous?.lastSubmissionId || "",
    title: solution.title || previous?.title || "",
    difficulty: solution.difficulty || previous?.difficulty || "Unknown",
    language: normalizedLanguage || previous?.language || "Unknown",
    latestLanguage: normalizedLanguage || previous?.latestLanguage || "Unknown",
    languagesUsed: [...languagesUsed].sort((left, right) => left.localeCompare(right)),
    url: solution.url || previous?.url || "",
    folderPath: buildProblemFolder(solution),
    latestCodePath,
    tags: Array.isArray(solution.tags) && solution.tags.length > 0
      ? [...new Set([...(previous?.tags || []), ...solution.tags])].sort((left, right) => left.localeCompare(right))
      : (previous?.tags || [])
  };

  await saveProblemStats({
    ...stats,
    [problemKey]: metadata
  });

  return {
    ...solution,
    language: normalizedLanguage,
    metadata,
    previousMetadata: previous || null
  };
}

async function refreshRepositoryIndex(settings) {
  currentState = SYNC_STATES.SYNCING;

  const accessToken = settings.githubToken || settings.githubOAuthToken;
  if (!accessToken || !settings.repositoryOwner || !settings.repositoryName) {
    throw new Error("Complete GitHub setup in the popup before syncing.");
  }

  const branch = settings.branch || "main";
  const problemStats = await getNormalizedProblemStats();
  await writeRepositoryIndex({
    accessToken,
    settings,
    problemStats,
    branch,
    message: `Refresh repository index\nDate: ${new Date().toISOString()}`
  });

  const lastSync = await getLastSync();
  currentState = SYNC_STATES.SUCCESS;
  await saveLastError("");

  return {
    message: "Repository README refreshed.",
    lastSync
  };
}

async function writeRepositoryIndex({ accessToken, settings, problemStats, branch, message }) {
  await createOrUpdateFile({
    token: accessToken,
    owner: settings.repositoryOwner,
    repo: settings.repositoryName,
    path: "README.md",
    branch,
    content: generateRepositoryReadme(problemStats),
    message
  });
}

async function getNormalizedProblemStats() {
  const rawStats = await getProblemStats();
  const normalizedStats = normalizeProblemStats(rawStats);

  if (JSON.stringify(rawStats) !== JSON.stringify(normalizedStats)) {
    await saveProblemStats(normalizedStats);
  }

  return normalizedStats;
}

function normalizeProblemStats(stats) {
  const normalized = {};

  for (const entry of Object.values(stats || {})) {
    if (!entry?.title) {
      continue;
    }

    const problemKey = buildProblemKey(entry);
    const previous = normalized[problemKey];
    const normalizedLanguage = normalizeLanguageLabel(entry.latestLanguage || entry.language);
    const nextSubmissionCount = Number(entry.submissionCount || 1);
    const nextTags = Array.isArray(entry.tags) ? entry.tags.filter(Boolean) : [];
    const nextLanguages = [
      ...(Array.isArray(entry.languagesUsed) ? entry.languagesUsed : []),
      normalizedLanguage
    ].filter(Boolean);
    const folderPath = entry.folderPath || buildProblemFolder(entry);
    const latestCodePath = entry.latestCodePath || `${folderPath}/solution.${inferFileExtension(normalizedLanguage)}`;

    if (!previous) {
      normalized[problemKey] = {
        title: entry.title,
        difficulty: entry.difficulty || "Unknown",
        language: normalizedLanguage,
        latestLanguage: normalizedLanguage,
        languagesUsed: [...new Set(nextLanguages)].sort((left, right) => left.localeCompare(right)),
        url: entry.url || "",
        folderPath,
        latestCodePath,
        firstSolved: entry.firstSolved || entry.lastSolved || "",
        lastSolved: entry.lastSolved || entry.firstSolved || "",
        lastUpdated: entry.lastUpdated || entry.lastSolved || entry.firstSolved || "",
        submissionCount: nextSubmissionCount,
        lastSubmissionId: entry.lastSubmissionId || "",
        tags: [...new Set(nextTags)].sort((left, right) => left.localeCompare(right))
      };
      continue;
    }

    previous.difficulty = choosePreferredDifficulty(previous.difficulty, entry.difficulty);
    previous.firstSolved = pickEarlierValue(previous.firstSolved, entry.firstSolved || entry.lastSolved);
    previous.lastSolved = pickLaterValue(previous.lastSolved, entry.lastSolved || entry.firstSolved);
    previous.lastUpdated = pickLaterValue(previous.lastUpdated, entry.lastUpdated || entry.lastSolved || entry.firstSolved);
    previous.submissionCount += nextSubmissionCount;
    previous.url = previous.url || entry.url || "";

    const mergedLanguages = new Set([...(previous.languagesUsed || []), ...nextLanguages]);
    previous.languagesUsed = [...mergedLanguages].sort((left, right) => left.localeCompare(right));

    const mergedTags = new Set([...(previous.tags || []), ...nextTags]);
    previous.tags = [...mergedTags].sort((left, right) => left.localeCompare(right));

    if (isLaterValue(entry.lastSolved || entry.lastUpdated, previous.lastSolved || previous.lastUpdated)) {
      previous.language = normalizedLanguage;
      previous.latestLanguage = normalizedLanguage;
      previous.folderPath = folderPath;
      previous.latestCodePath = latestCodePath;
      previous.lastSubmissionId = entry.lastSubmissionId || previous.lastSubmissionId || "";
      previous.url = entry.url || previous.url || "";
    }
  }

  return normalized;
}

function choosePreferredDifficulty(current, next) {
  if (!current || current === "Unknown") {
    return next || "Unknown";
  }

  return current;
}

function pickEarlierValue(current, next) {
  if (!current) {
    return next || "";
  }

  if (!next) {
    return current;
  }

  return toComparableTimestamp(next) <= toComparableTimestamp(current) ? next : current;
}

function pickLaterValue(current, next) {
  if (!current) {
    return next || "";
  }

  if (!next) {
    return current;
  }

  return toComparableTimestamp(next) >= toComparableTimestamp(current) ? next : current;
}

function isLaterValue(next, current) {
  if (!next) {
    return false;
  }

  if (!current) {
    return true;
  }

  return toComparableTimestamp(next) >= toComparableTimestamp(current);
}

function toComparableTimestamp(value) {
  const timestamp = Date.parse(value || "");
  return Number.isNaN(timestamp) ? 0 : timestamp;
}

async function signOutGitHub() {
  const settings = await getSettings();
  await saveSettings({
    ...settings,
    githubToken: "",
    githubOAuthToken: ""
  });
  await clearAuthSession();
  await chrome.alarms.clear(GITHUB_DEVICE_FLOW_ALARM);
  await saveLastError("");
  currentState = SYNC_STATES.IDLE;
  hasValidatedStoredAuth = true;

  return {
    message: "Signed out of GitHub."
  };
}

async function initializeExtensionState() {
  currentState = SYNC_STATES.WAITING;
  hasValidatedStoredAuth = false;
  await validateStoredAuthIfNeeded();
}

async function validateStoredAuthIfNeeded() {
  if (hasValidatedStoredAuth) {
    return;
  }

  const settings = await getSettings();
  const authSession = await getAuthSession();
  const accessToken = settings.githubOAuthToken || settings.githubToken;

  if (!accessToken) {
    if (!authSession) {
      await saveAuthSession({
        state: AUTH_STATES.IDLE,
        message: "Connect GitHub to start syncing."
      });
    }
    currentState = SYNC_STATES.WAITING;
    hasValidatedStoredAuth = true;
    return;
  }

  try {
    const user = await validateGitHubToken(accessToken);
    await saveSettings({
      ...settings,
      repositoryOwner: settings.repositoryOwner || user.login
    });
    await saveAuthSession({
      state: AUTH_STATES.AUTHORIZED,
      userLogin: user.login,
      message: `Connected as ${user.login}.`
    });
    currentState = SYNC_STATES.WAITING;
  } catch (_error) {
    await saveSettings({
      ...settings,
      githubToken: "",
      githubOAuthToken: ""
    });
    await saveAuthSession({
      state: AUTH_STATES.FAILED,
      message: "Stored GitHub authentication expired. Sign in again."
    });
    currentState = SYNC_STATES.FAILED;
  }

  hasValidatedStoredAuth = true;
}
