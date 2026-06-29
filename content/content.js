(function initializeLeetSyncContentScript() {
  const MESSAGE_TYPES = {
    SOLUTION_DETECTED: "SOLUTION_DETECTED"
  };

  const syncState = {
    lastAcceptedKey: null,
    observer: null
  };

  startObserver();
  window.addEventListener("load", scheduleScan);
  document.addEventListener("visibilitychange", scheduleScan);
  setInterval(scheduleScan, 4000);

  function startObserver() {
    if (syncState.observer) {
      syncState.observer.disconnect();
    }

    syncState.observer = new MutationObserver(() => {
      scheduleScan();
    });

    syncState.observer.observe(document.body, {
      childList: true,
      subtree: true,
      characterData: true
    });
  }

  function scheduleScan() {
    window.requestIdleCallback?.(() => detectAcceptedSubmission(), { timeout: 1000 })
      || setTimeout(detectAcceptedSubmission, 300);
  }

  async function detectAcceptedSubmission() {
    if (!isRuntimeAvailable()) {
      stopBackgroundWork();
      return;
    }

    const submissionStatus = detectSubmissionStatus();
    if (submissionStatus !== "Accepted") {
      return;
    }

    const solution = extractProblemData();
    if (!solution.title || !solution.code) {
      return;
    }

    const acceptanceKey = solution.submissionId
      ? `submission:${solution.submissionId}`
      : `${solution.title}:${solution.language}:${solution.runtime}:${solution.memory}`;
    if (acceptanceKey === syncState.lastAcceptedKey) {
      return;
    }

    syncState.lastAcceptedKey = acceptanceKey;
    try {
      await chrome.runtime.sendMessage({
        type: MESSAGE_TYPES.SOLUTION_DETECTED,
        payload: {
          ...solution,
          status: submissionStatus
        }
      });
    } catch (error) {
      if (isExtensionContextInvalidated(error)) {
        stopBackgroundWork();
        return;
      }

      throw error;
    }
  }

  function stopBackgroundWork() {
    if (syncState.observer) {
      syncState.observer.disconnect();
      syncState.observer = null;
    }
  }

  function isRuntimeAvailable() {
    try {
      return Boolean(chrome?.runtime?.id);
    } catch (_error) {
      return false;
    }
  }

  function isExtensionContextInvalidated(error) {
    return /Extension context invalidated/i.test(error?.message || "");
  }

  function detectSubmissionStatus() {
    const selectors = [
      '[data-e2e-locator="submission-result"]',
      '[data-e2e-locator="console-result"]',
      '[data-e2e-locator="result-status"]',
      '[data-e2e-locator="submission-result-status"]',
      ".text-green-s",
      ".text-success",
      '[class*="text-success"]',
      '[class*="text-green"]'
    ];

    for (const selector of selectors) {
      const nodes = document.querySelectorAll(selector);
      for (const node of nodes) {
        const status = normalizeSubmissionStatus(node.textContent);
        if (status) {
          return status;
        }
      }
    }

    const pageText = document.body?.innerText || "";
    if (/(Wrong Answer|Time Limit Exceeded|Runtime Error|Compile Error|Memory Limit Exceeded|Output Limit Exceeded|Presentation Error)/i.test(pageText)) {
      return "Rejected";
    }

    if (/Accepted/i.test(pageText) && /(Runtime|Memory)/i.test(pageText)) {
      return "Accepted";
    }

    return "";
  }

  function extractProblemData() {
    const pageText = document.body?.innerText || "";
    const submissionId = extractSubmissionId();
    const code = extractCode();

    return {
      title: extractTitle(),
      difficulty: extractDifficulty(),
      language: extractLanguage(code),
      runtime: extractMetric(pageText, "Runtime"),
      memory: extractMetric(pageText, "Memory"),
      code,
      tags: extractTags(),
      url: location.href,
      submissionTime: new Date().toLocaleString(),
      submissionId
    };
  }

  function extractTitle() {
    const selectors = [
      '[data-cy="question-title"]',
      '[data-track-load="description_content"] h1',
      'div.text-title-large a',
      'meta[property="og:title"]'
    ];

    for (const selector of selectors) {
      const node = document.querySelector(selector);
      const content = node?.content?.trim();
      const text = node?.textContent?.trim();
      const value = content || text;
      const normalized = normalizeTitle(value);
      if (normalized) {
        return normalized;
      }
    }

    const heading = document.querySelector("h1");
    if (heading?.textContent?.trim()) {
      const normalized = normalizeTitle(heading.textContent.trim());
      if (normalized) {
        return normalized;
      }
    }

    return extractTitleFromPath();
  }

  function extractDifficulty() {
    const selectors = [
      '[diff]',
      '[data-difficulty]',
      'div.text-difficulty-easy',
      'div.text-difficulty-medium',
      'div.text-difficulty-hard'
    ];

    for (const selector of selectors) {
      const nodes = document.querySelectorAll(selector);
      for (const node of nodes) {
        const value = node.getAttribute("diff")
          || node.getAttribute("data-difficulty")
          || node.textContent;
        const difficulty = normalizeDifficulty(value);
        if (difficulty !== "Unknown") {
          return difficulty;
        }
      }
    }

    return normalizeDifficulty(document.body?.innerText || "");
  }

  function extractLanguage(code = "") {
    const uiLanguage = extractLanguageFromUi();
    if (uiLanguage !== "Unknown") {
      return uiLanguage;
    }

    const monacoEditable = document.querySelector(".monaco-editor textarea");
    const ariaLabel = monacoEditable?.getAttribute("aria-label");
    const monacoLanguage = normalizeLanguageCandidate(ariaLabel);
    if (monacoLanguage !== "Unknown") {
      return monacoLanguage;
    }

    const codeLanguage = inferLanguageFromCode(code);
    if (codeLanguage !== "Unknown") {
      return codeLanguage;
    }

    return "Unknown";
  }

  function extractLanguageFromUi() {
    const selectors = [
      '[data-e2e-locator="lang-select"]',
      '[data-mode-id]',
      'button[id*="headlessui-listbox-button"]',
      'button[class*="lang"]',
      '[class*="language-select"]',
      '[aria-label*="language"]'
    ];

    for (const selector of selectors) {
      const nodes = document.querySelectorAll(selector);
      for (const node of nodes) {
        const candidate = normalizeLanguageCandidate(
          node.getAttribute?.("data-mode-id")
          || node.getAttribute?.("value")
          || node.getAttribute?.("aria-label")
          || node.textContent
        );

        if (candidate !== "Unknown") {
          return candidate;
        }
      }
    }

    return "Unknown";
  }

  function extractMetric(text, label) {
    const patterns = [
      new RegExp(`${label}\\s*\\n?\\s*([\\d.]+\\s*(?:ms|MB|KB|Bytes|%))`, "i"),
      new RegExp(`${label}[:\\s]+([\\d.]+\\s*(?:ms|MB|KB|Bytes|%))`, "i"),
      new RegExp(`([\\d.]+\\s*(?:ms|MB|KB|Bytes|%))\\s*${label}`, "i")
    ];

    for (const pattern of patterns) {
      const match = text.match(pattern);
      if (match?.[1]) {
        return match[1].trim();
      }
    }

    return "Unknown";
  }

  function extractCode() {
    const monacoLines = Array.from(document.querySelectorAll(".view-lines .view-line"))
      .map((line) => line.textContent ?? "")
      .join("\n");
    if (monacoLines.trim()) {
      return monacoLines;
    }

    const preCode = document.querySelector("pre code");
    if (preCode?.textContent?.trim()) {
      return preCode.textContent.trim();
    }

    const codeMirror = document.querySelector(".CodeMirror-code");
    if (codeMirror?.textContent?.trim()) {
      return codeMirror.textContent.trim();
    }

    return "";
  }

  function extractTags() {
    return Array.from(document.querySelectorAll('a[href*="/tag/"]'))
      .map((node) => node.textContent?.trim())
      .filter(Boolean);
  }

  function extractSubmissionId() {
    const match = location.href.match(/submissions\/(?:detail\/)?(\d+)/);
    return match?.[1] || "";
  }

  function normalizeSubmissionStatus(value) {
    const text = String(value || "").trim();
    if (!text) {
      return "";
    }

    if (/^Accepted$/i.test(text) || /Accepted/i.test(text)) {
      return "Accepted";
    }

    if (/(Wrong Answer|Time Limit Exceeded|Runtime Error|Compile Error|Memory Limit Exceeded|Output Limit Exceeded|Presentation Error)/i.test(text)) {
      return "Rejected";
    }

    return "";
  }

  function normalizeDifficulty(value) {
    const text = String(value || "");
    if (/easy/i.test(text)) {
      return "Easy";
    }
    if (/medium/i.test(text)) {
      return "Medium";
    }
    if (/hard/i.test(text)) {
      return "Hard";
    }
    return "Unknown";
  }

  function normalizeTitle(value) {
    const text = String(value || "")
      .replace(/\s*-\s*LeetCode$/, "")
      .replace(/^\d+\.\s*/, "")
      .trim();

    if (!text) {
      return "";
    }

    if (isGenericLeetCodeTitle(text)) {
      return "";
    }

    return text;
  }

  function extractTitleFromPath() {
    const parts = location.pathname.split("/").filter(Boolean);
    const problemSlugIndex = parts.indexOf("problems");
    if (problemSlugIndex >= 0 && parts[problemSlugIndex + 1]) {
      return parts[problemSlugIndex + 1]
        .split("-")
        .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
        .join(" ");
    }

    return "";
  }

  function isGenericLeetCodeTitle(value) {
    const text = String(value || "").trim();
    return /LeetCode\s*-\s*The World's Leading Online Programming Learning Platform/i.test(text)
      || /^LeetCode$/i.test(text);
  }

  function inferLanguageFromCode(code) {
    const text = String(code || "").trim();
    if (!text) {
      return "Unknown";
    }

    if (
      /#include\s*<[^>]+>/.test(text)
      || /\bstd::/.test(text)
      || /\busing\s+namespace\s+std\s*;/.test(text)
      || /\bvector\s*</.test(text)
      || /\bclass\s+Solution\s*\{\s*public:/.test(text)
    ) {
      return "C++";
    }

    if (
      /\bimport\s+java\./.test(text)
      || /\bpublic\s+class\s+Solution\b/.test(text)
      || (/\bclass\s+Solution\s*\{/.test(text) && /\bpublic:/.test(text) === false && /\bpublic\s+\w+(?:<[^>]+>)?\s+\w+\s*\(/.test(text))
      || /\bSystem\.out\.print/.test(text)
      || /\bArrays\./.test(text)
    ) {
      return "Java";
    }

    if (
      /\bdef\s+\w+\s*\(/.test(text)
      || /\bclass\s+Solution\s*:/.test(text)
      || /\bfrom\s+\w+\s+import\b/.test(text)
      || /\bself\b/.test(text)
    ) {
      return "Python";
    }

    return "Unknown";
  }

  function normalizeLanguageCandidate(value) {
    const raw = String(value || "")
      .replace(/\s+/g, " ")
      .trim();
    if (!raw) {
      return "Unknown";
    }

    const attributeMatch = raw.match(/\b(cpp|csharp|python3|python|javascript|typescript|golang|mysql|oracle|postgresql|postgres|pandas|racket|erlang|elixir|bash|ruby|swift|kotlin|scala|rust|dart|java|php|c)\b/i);
    if (attributeMatch) {
      return canonicalizeLanguage(attributeMatch[1]);
    }

    const cleaned = raw
      .replace(/code editor/gi, "")
      .replace(/language/gi, "")
      .replace(/select/gi, "")
      .replace(/pick one/gi, "")
      .replace(/current/gi, "")
      .replace(/[():,]/g, " ")
      .replace(/\s+/g, " ")
      .trim();

    if (!cleaned || cleaned.length > 40) {
      return "Unknown";
    }

    return canonicalizeLanguage(cleaned);
  }

  function canonicalizeLanguage(value) {
    const compact = String(value || "").trim();
    if (!compact) {
      return "Unknown";
    }

    const aliases = {
      c: "C",
      cpp: "C++",
      "c++": "C++",
      cplusplus: "C++",
      java: "Java",
      python: "Python",
      python3: "Python3",
      javascript: "JavaScript",
      js: "JavaScript",
      typescript: "TypeScript",
      ts: "TypeScript",
      golang: "Go",
      go: "Go",
      "c#": "C#",
      csharp: "C#",
      php: "PHP",
      swift: "Swift",
      kotlin: "Kotlin",
      dart: "Dart",
      ruby: "Ruby",
      scala: "Scala",
      rust: "Rust",
      racket: "Racket",
      erlang: "Erlang",
      elixir: "Elixir",
      bash: "Bash",
      shell: "Bash",
      mysql: "MySQL",
      "ms sql server": "MS SQL Server",
      mssql: "MS SQL Server",
      oracle: "Oracle",
      postgresql: "PostgreSQL",
      postgres: "PostgreSQL",
      pandas: "Pandas"
    };

    const normalized = compact.toLowerCase();
    if (aliases[normalized]) {
      return aliases[normalized];
    }

    if (/^[A-Za-z0-9+# .-]{1,30}$/.test(compact)) {
      return compact;
    }

    return "Unknown";
  }

  function escapeRegExp(value) {
    return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }
})();
