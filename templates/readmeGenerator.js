export function generateReadme(solution) {
  const tags = Array.isArray(solution.tags) && solution.tags.length > 0
    ? solution.tags.map((tag) => `- ${tag}`).join("\n")
    : "- Not captured";
  const metadata = solution.metadata || {};
  const languagesUsed = Array.isArray(metadata.languagesUsed) && metadata.languagesUsed.length > 0
    ? metadata.languagesUsed.join(", ")
    : (solution.language || "Unknown");
  const solveMode = (metadata.submissionCount || 1) > 1
    ? "Updated solution after revisiting the same problem."
    : "Initial accepted solution.";

  return `# ${solution.title}

- Difficulty: ${solution.difficulty || "Unknown"}
- Latest Language: ${solution.language || "Unknown"}
- Languages Used: ${languagesUsed}
- Runtime: ${solution.runtime || "Unknown"}
- Memory: ${solution.memory || "Unknown"}
- Solve Mode: ${solveMode}
- First Solved: ${metadata.firstSolved || solution.submissionTime || new Date().toLocaleString()}
- Last Solved: ${metadata.lastSolved || solution.submissionTime || new Date().toLocaleString()}
- Last Updated: ${metadata.lastUpdated || solution.submissionTime || new Date().toLocaleString()}
- Submission Count: ${metadata.submissionCount || 1}
- Problem URL: ${solution.url || "Unknown"}

## Tags
${tags}
`;
}

export function generateRepositoryReadme(problemStats) {
  const entries = Object.values(problemStats || {});
  const groupedProblems = groupEntriesByTitle(entries);
  const totalSolved = groupedProblems.length;
  const difficultySections = ["Easy", "Medium", "Hard", "Unknown"];
  const difficultySummary = Object.fromEntries(
    difficultySections.map((difficulty) => [
      difficulty,
      groupedProblems.filter((entry) => normalizeDifficulty(entry.difficulty) === difficulty).length
    ])
  );
  const sortedEntries = sortEntries(groupedProblems);
  const topicMap = buildTopicMap(sortedEntries);

  const lines = [
    "# My-LeetCode-Journey",
    "",
    "A collection of accepted LeetCode solutions synced automatically by LeetSync.",
    "",
    "## Overview",
    "",
    `- Total solved problems: ${totalSolved}`,
    `- Easy: ${difficultySummary.Easy}`,
    `- Medium: ${difficultySummary.Medium}`,
    `- Hard: ${difficultySummary.Hard}`,
    `- Uncategorized difficulty: ${difficultySummary.Unknown}`,
    "",
    "## All Problems",
    "",
    "| Problem | Difficulty | Languages | Topics | Last Solved | Submissions | Folder |",
    "| --- | --- | --- | --- | --- | ---: | --- |"
  ];

  if (!sortedEntries.length) {
    lines.push("| No synced problems yet | - | - | - | - | - | - |");
  } else {
    for (const entry of sortedEntries) {
      lines.push(buildProblemRow(entry));
    }
  }

  lines.push("");
  lines.push("## LeetCode Topics");
  lines.push("");

  if (!topicMap.size) {
    lines.push("No topic data available yet. Solve an accepted problem and LeetSync will classify it here.");
    lines.push("");
  } else {
    for (const [topic, topicEntries] of topicMap) {
      lines.push(`### ${topic}`);
      lines.push("");
      for (const entry of topicEntries) {
        lines.push(`- ${buildProblemLink(entry)} (${normalizeDifficulty(entry.difficulty)}, ${formatLanguages(entry.languages)})`);
      }
      lines.push("");
    }
  }

  lines.push("## Difficulty Breakdown");
  lines.push("");

  let hasDifficultyEntries = false;
  for (const difficulty of difficultySections) {
    const difficultyEntries = sortedEntries.filter((entry) => normalizeDifficulty(entry.difficulty) === difficulty);
    if (!difficultyEntries.length) {
      continue;
    }

    hasDifficultyEntries = true;
    lines.push(`### ${difficulty}`);
    lines.push("");
    for (const entry of difficultyEntries) {
      lines.push(`- ${buildProblemLink(entry)}${buildTopicsSuffix(entry)}`);
    }
    lines.push("");
  }

  if (!hasDifficultyEntries) {
    lines.push("No accepted submissions have been indexed yet.");
    lines.push("");
  }

  return `${lines.join("\n")}\n`;
}

function buildTopicMap(entries) {
  const topicMap = new Map();

  for (const entry of entries) {
    const tags = Array.isArray(entry.tags) && entry.tags.length > 0
      ? entry.tags
      : ["Uncategorized"];

    for (const rawTag of tags) {
      const tag = rawTag || "Uncategorized";
      const currentEntries = topicMap.get(tag) || [];
      currentEntries.push(entry);
      topicMap.set(tag, currentEntries);
    }
  }

  return new Map(
    [...topicMap.entries()].sort((left, right) => left[0].localeCompare(right[0]))
  );
}

function sortEntries(entries) {
  return [...entries].sort((left, right) => {
    const titleCompare = String(left.title || "").localeCompare(String(right.title || ""));
    if (titleCompare !== 0) {
      return titleCompare;
    }

    return String(left.lastSolved || "").localeCompare(String(right.lastSolved || ""));
  });
}

function buildProblemRow(entry) {
  const primaryFolder = entry.folders?.[0] || entry.folderPath || "";
  const folderLink = primaryFolder
    ? `[${escapeMarkdown(primaryFolder)}](./${primaryFolder.replaceAll(" ", "%20")})`
    : "-";
  const tags = Array.isArray(entry.tags) && entry.tags.length > 0
    ? entry.tags.map((tag) => escapeMarkdown(tag)).join(", ")
    : "Uncategorized";

  return `| ${buildProblemLink(entry)} | ${normalizeDifficulty(entry.difficulty)} | ${escapeMarkdown(formatLanguages(entry.languages))} | ${tags} | ${escapeMarkdown(entry.lastSolved || "-")} | ${entry.submissionCount || 1} | ${folderLink} |`;
}

function buildProblemLink(entry) {
  const label = escapeMarkdown(entry.title || "Untitled");
  const url = normalizeProblemUrl(entry.url);
  return url
    ? `[${label}](${url})`
    : label;
}

function buildTopicsSuffix(entry) {
  const tags = Array.isArray(entry.tags) && entry.tags.length > 0
    ? entry.tags.join(", ")
    : "Uncategorized";

  return ` - ${normalizeDifficulty(entry.difficulty)} - ${escapeMarkdown(tags)}`;
}

function normalizeDifficulty(value) {
  if (value === "Easy" || value === "Medium" || value === "Hard") {
    return value;
  }

  return "Unknown";
}

function groupEntriesByTitle(entries) {
  const grouped = new Map();

  for (const entry of entries) {
    const normalizedTitle = normalizeTrackedTitle(entry.title);
    if (!normalizedTitle) {
      continue;
    }

    const key = normalizedTitle;
    const current = grouped.get(key) || createGroupedProblem(entry);

    current.title = current.title || normalizedTitle;
    current.url = current.url || entry.url || "";
    current.difficulty = pickPreferredDifficulty(current.difficulty, entry.difficulty);
    current.lastSolved = pickLatestDate(current.lastSolved, entry.lastSolved);
    current.firstSolved = pickEarliestDate(current.firstSolved, entry.firstSolved);
    current.submissionCount += entry.submissionCount || 1;

    for (const language of entry.languagesUsed || []) {
      if (language) {
        current.languages.add(language);
      }
    }

    if (entry.language) {
      current.languages.add(entry.language);
    }

    if (entry.folderPath) {
      current.folders.add(entry.folderPath);
    }

    for (const tag of entry.tags || []) {
      if (tag) {
        current.tags.add(tag);
      }
    }

    grouped.set(key, current);
  }

  return [...grouped.values()].map((entry) => ({
    ...entry,
    languages: [...entry.languages].sort((left, right) => left.localeCompare(right)),
    folders: [...entry.folders].sort((left, right) => left.localeCompare(right)),
    tags: [...entry.tags].sort((left, right) => left.localeCompare(right))
  }));
}

function createGroupedProblem(entry) {
  const normalizedTitle = normalizeTrackedTitle(entry.title) || "Untitled";
  return {
    title: normalizedTitle,
    url: entry.url || "",
    difficulty: normalizeDifficulty(entry.difficulty),
    firstSolved: entry.firstSolved || "",
    lastSolved: entry.lastSolved || "",
    submissionCount: 0,
    languages: new Set(),
    folders: new Set(),
    tags: new Set()
  };
}

function pickPreferredDifficulty(current, next) {
  const currentDifficulty = normalizeDifficulty(current);
  const nextDifficulty = normalizeDifficulty(next);
  return currentDifficulty === "Unknown" ? nextDifficulty : currentDifficulty;
}

function pickLatestDate(current, next) {
  if (!current) {
    return next || "";
  }

  if (!next) {
    return current;
  }

  return toTimestamp(next) >= toTimestamp(current) ? next : current;
}

function pickEarliestDate(current, next) {
  if (!current) {
    return next || "";
  }

  if (!next) {
    return current;
  }

  return toTimestamp(next) <= toTimestamp(current) ? next : current;
}

function toTimestamp(value) {
  const timestamp = Date.parse(value || "");
  return Number.isNaN(timestamp) ? 0 : timestamp;
}

function formatLanguages(languages) {
  if (Array.isArray(languages) && languages.length > 0) {
    return languages.join(", ");
  }

  return "Unknown";
}

function normalizeProblemUrl(value) {
  const url = String(value || "").trim();
  if (!url) {
    return "";
  }

  const match = url.match(/(https:\/\/leetcode\.com\/problems\/[^/]+\/)/);
  return match?.[1] || url;
}

function normalizeTrackedTitle(value) {
  const title = String(value || "")
    .replace(/\s*-\s*LeetCode$/, "")
    .trim();

  if (!title) {
    return "";
  }

  if (/LeetCode\s*-\s*The World's Leading Online Programming Learning Platform/i.test(title)) {
    return "";
  }

  return title;
}

function escapeMarkdown(value) {
  return String(value || "")
    .replaceAll("|", "\\|")
    .replaceAll("\n", " ");
}
