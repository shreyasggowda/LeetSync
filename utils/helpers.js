import { LANGUAGE_EXTENSIONS } from "./constants.js";

export function slugify(value) {
  return String(value || "")
    .trim()
    .replace(/[\\/:*?"<>|]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-");
}

export function toTitleCase(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

export function inferFileExtension(language) {
  const normalized = normalizeLanguageLabel(language);
  return LANGUAGE_EXTENSIONS[normalized.toLowerCase()] || slugify(normalized).toLowerCase() || "txt";
}

export function buildProblemFolder(solution) {
  const difficulty = slugify(solution.difficulty || "Unknown");
  const title = slugify(solution.title || "Untitled");
  return `${difficulty}/${title}`;
}

export function buildCommitMessage(solution) {
  const difficulty = solution.difficulty || "Unknown";
  const language = normalizeLanguageLabel(solution.language);
  const action = solution.metadata?.submissionCount > 1 ? "Updated" : "Solved";
  return `${action}: ${solution.title} (${difficulty})\nLanguage: ${language}\nDate: ${new Date().toISOString()}`;
}

export function encodeBase64(value) {
  return btoa(unescape(encodeURIComponent(value)));
}

export function safeJsonParse(value, fallback = null) {
  try {
    return JSON.parse(value);
  } catch (error) {
    return fallback;
  }
}

export function parseEnvFile(text) {
  return String(text || "")
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("#"))
    .reduce((accumulator, line) => {
      const separatorIndex = line.indexOf("=");
      if (separatorIndex === -1) {
        return accumulator;
      }

      const key = line.slice(0, separatorIndex).trim();
      const value = line.slice(separatorIndex + 1).trim();
      accumulator[key] = value;
      return accumulator;
    }, {});
}

export function buildProblemKey(solution) {
  return slugify(solution.title || "untitled");
}

export function normalizeLanguageLabel(language) {
  const raw = String(language || "").trim();
  if (!raw) {
    return "Unknown";
  }

  const compact = raw
    .replace(/\s+/g, " ")
    .trim();
  const key = compact.toLowerCase();

  const aliases = {
    "c": "C",
    "c++": "C++",
    "cpp": "C++",
    "cplusplus": "C++",
    "java": "Java",
    "python": "Python",
    "python3": "Python3",
    "py": "Python",
    "javascript": "JavaScript",
    "js": "JavaScript",
    "typescript": "TypeScript",
    "ts": "TypeScript",
    "c#": "C#",
    "csharp": "C#",
    "php": "PHP",
    "swift": "Swift",
    "kotlin": "Kotlin",
    "dart": "Dart",
    "go": "Go",
    "golang": "Go",
    "ruby": "Ruby",
    "scala": "Scala",
    "rust": "Rust",
    "racket": "Racket",
    "erlang": "Erlang",
    "elixir": "Elixir",
    "bash": "Bash",
    "shell": "Bash",
    "mysql": "MySQL",
    "mssql": "MS SQL Server",
    "ms sql server": "MS SQL Server",
    "oracle": "Oracle",
    "postgresql": "PostgreSQL",
    "postgres": "PostgreSQL",
    "pandas": "Pandas"
  };

  return aliases[key] || compact;
}
