/**
 * Shared utilities for local dev scripts.
 */

export const verbose = process.env.VERBOSE === "1";

// ── Colors ────────────────────────────────────────────────────────────────────
// Strip colors when stdout is not a TTY (CI, piped output, etc.)
const TTY = process.stdout.isTTY;
const c = {
  reset:   TTY ? "\x1b[0m"  : "",
  bold:    TTY ? "\x1b[1m"  : "",
  dim:     TTY ? "\x1b[2m"  : "",
  green:   TTY ? "\x1b[32m" : "",
  cyan:    TTY ? "\x1b[36m" : "",
  red:     TTY ? "\x1b[31m" : "",
  yellow:  TTY ? "\x1b[33m" : "",
};

/** Wrap a URL in an OSC 8 terminal hyperlink (clickable in VS Code, iTerm2, etc.) */
function hyperlink(url) {
  return TTY ? `\x1b]8;;${url}\x1b\\${url}\x1b]8;;\x1b\\` : url;
}

// ── Status line helpers ───────────────────────────────────────────────────────

/** "  ✓  message" in green — use for completed steps */
export function ok(message) {
  return `  ${c.green}✓${c.reset}  ${c.dim}${message}${c.reset}\n`;
}

/** "  ◆  message" dimmed — use for in-progress steps */
export function working(message) {
  return `  ${c.dim}◆  ${message}${c.reset}\n`;
}

/** "  ✗  [name] message" in red — use for errors */
export function fail(name, message) {
  return `  ${c.red}✗${c.reset}  ${c.dim}[${name}]${c.reset} ${message}\n`;
}

// ── Output filtering ──────────────────────────────────────────────────────────

// Patterns to suppress in the API process output when not verbose
const API_QUIET_PATTERNS = [
  /^\s*$/,
  /^> /,
  // tsup build output
  /^CLI /,
  /^ESM /,
  /^CJS /,
  /^DTS /,
  // Azure Functions startup noise
  /Azure Functions Core Tools/,
  /Core Tools Version/,
  /Function Runtime Version/,
  /For detailed output, run func with --verbose/,
  /Worker process started and initialized/,
  /Job host started/,
  /Hosting environment:/,
  /Content root path:/,
  /Application started\. Press Ctrl/,
  /Host lock lease acquired/,
  // Function registration list header
  /^Functions:\s*$/,
  /Skipping '.*' from local settings/,
  // Request execution logs (very noisy)
  /\] Executing 'Functions\./,
  /\] Executed 'Functions\./,
  // Function route lines — all forms Azure Functions emits them in:
  //   "  functionName: [GET] http://..."  (inline, indented or not)
  //   "  functionName:"                   (name alone, URL on next line)
  //   "  [GET] http://..."               (method+URL continuation, possibly indented)
  //   "  http://localhost:..."            (bare URL continuation, possibly indented)
  //   "  functionName: timerTrigger"
  /\w[\w.]+:\s+\[(?:GET|POST|DELETE|PATCH|PUT)\]/,
  /^\s*\[(?:GET|POST|DELETE|PATCH|PUT)\]/,
  /^\s*https?:\/\//,
  /^\s*\w[\w.]+:\s*$/,
  /timerTrigger/,
];

// Patterns to suppress in the web (Vite) process output when not verbose
const WEB_QUIET_PATTERNS = [
  /^\s*$/,
  /^> /,
  /^> @it-helpdesk/,
  /press h \+ enter/,
  // Proxy connection errors during API startup (race condition, not real errors)
  /http proxy error/,
  /ECONNREFUSED/,
  /at internalConnectMultiple/,
  /at afterConnectMultiple/,
  /AggregateError/,
];

// Process names that should be treated as web (Vite) processes
const WEB_PROCESS_NAMES = new Set(["web", "admin", "tech", "user"]);

/**
 * Returns true if the line should be printed for the given process name.
 * Always prints lines that look like errors regardless of process.
 */
export function shouldPrint(line, processName) {
  if (!line.trim()) return false;
  if (verbose) return true;
  // Always show real errors
  if (/error|Error|exception|Exception/.test(line) &&
      !/ECONNREFUSED|http proxy error|AggregateError/.test(line)) return true;

  if (processName === "api") {
    return !API_QUIET_PATTERNS.some((p) => p.test(line));
  }
  if (WEB_PROCESS_NAMES.has(processName)) {
    return !WEB_QUIET_PATTERNS.some((p) => p.test(line));
  }
  return true;
}

/**
 * Returns true if this is the "Host started" line from Azure Functions,
 * which we replace with a clean status message.
 */
export function isApiReady(line) {
  return /\] Host started/.test(line);
}

// ── Startup banner ────────────────────────────────────────────────────────────

/**
 * Print a Vite-style startup banner with colored URLs and notes.
 *
 * @param {{ title: string; rows: [string, string][]; notes?: string[] }} config
 */
export function printBanner({ title, rows, notes = [] }) {
  const labelWidth = Math.max(...rows.map(([l]) => l.length));

  // Title: "Help Desk" bold+cyan, " · Full Stack · Entra auth" dimmed
  const [appName, ...subtitles] = title.split("  ·  ");
  const titleLine = subtitles.length
    ? `${c.bold}${c.cyan}${appName}${c.reset}  ${c.dim}·  ${subtitles.join("  ·  ")}${c.reset}`
    : `${c.bold}${c.cyan}${appName}${c.reset}`;

  const out = ["", `  ${titleLine}`, ""];

  for (const [label, value] of rows) {
    const labelStr = `${c.dim}${label.padEnd(labelWidth)}${c.reset}`;
    const urlStr = value.startsWith("http")
      ? `${c.cyan}${hyperlink(value)}${c.reset}`
      : value;
    out.push(`  ${c.green}➜${c.reset}  ${labelStr}  ${urlStr}`);
  }

  if (notes.length > 0) {
    out.push("");
    for (const note of notes) {
      out.push(`  ${c.dim}${note}${c.reset}`);
    }
  }

  out.push("");
  process.stdout.write(out.join("\n") + "\n");
}
