export const MESSAGE_TYPES = {
  SOLUTION_DETECTED: "SOLUTION_DETECTED",
  MANUAL_SYNC: "MANUAL_SYNC",
  GET_STATUS: "GET_STATUS",
  SAVE_SETTINGS: "SAVE_SETTINGS",
  START_GITHUB_OAUTH: "START_GITHUB_OAUTH",
  SIGN_OUT_GITHUB: "SIGN_OUT_GITHUB",
  LOAD_SETTINGS: "LOAD_SETTINGS",
  CLEAR_SETTINGS: "CLEAR_SETTINGS"
};

export const STORAGE_KEYS = {
  SETTINGS: "settings",
  LAST_SYNC: "lastSync",
  SYNC_HISTORY: "syncHistory",
  PROBLEM_STATS: "problemStats",
  PENDING_SOLUTION: "pendingSolution",
  LAST_ERROR: "lastError",
  AUTH_SESSION: "authSession"
};

export const DEFAULT_SETTINGS = {
  githubToken: "",
  githubOAuthClientId: "",
  githubOAuthToken: "",
  repositoryOwner: "",
  repositoryName: "my-leetcode-solutions",
  branch: "main",
  autoSync: true,
  generateReadme: true,
  createRepositoryIfMissing: true,
  folderStrategy: "difficulty-title"
};

export const SYNC_STATES = {
  IDLE: "IDLE",
  WAITING: "WAITING_FOR_ACCEPTED",
  EXTRACTING: "EXTRACTING",
  SYNCING: "SYNCING",
  SUCCESS: "SUCCESS",
  FAILED: "FAILED"
};

export const AUTH_STATES = {
  IDLE: "IDLE",
  PENDING: "PENDING",
  AUTHORIZED: "AUTHORIZED",
  FAILED: "FAILED",
  EXPIRED: "EXPIRED"
};

export const DIFFICULTIES = ["Easy", "Medium", "Hard"];

export const LANGUAGE_EXTENSIONS = {
  c: "c",
  cpp: "cpp",
  "c++": "cpp",
  java: "java",
  javascript: "js",
  typescript: "ts",
  python: "py",
  "python3": "py",
  go: "go",
  kotlin: "kt",
  rust: "rs",
  ruby: "rb",
  swift: "swift",
  csharp: "cs",
  "c#": "cs",
  php: "php",
  scala: "scala",
  dart: "dart",
  racket: "rkt",
  erlang: "erl",
  elixir: "ex",
  bash: "sh",
  mysql: "sql",
  "ms sql server": "sql",
  oracle: "sql",
  postgresql: "sql",
  pandas: "py"
};
