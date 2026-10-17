const API_URL = "https://script.google.com/macros/s/AKfycbwzUfRD6R0ma0N5-YPnNBS70BGiW_hVzj6jwOzPLeD7H_YGAG59RX7U1xcn_YYkfueG/exec";

const DEFAULT_TIMEOUT_MS = 20000; // Apps Script cold starts can be slow
const RETRY_DELAY_MS = 1500;

/**
 * Every failure from this module is an ApiError with a short `code`:
 *   Client side : timeout, network_error, http_error, bad_response
 *   Server side : whatever code the backend returned (invalid_username, busy,
 *                 server_error, user_not_found, ...)
 * `detail` carries extra debugging text (e.g. start of an HTML error page).
 */
export class ApiError extends Error {
  constructor(code, message, detail = "") {
    super(message);
    this.name = "ApiError";
    this.code = code;
    this.detail = detail;
  }
}

// Failures that are worth retrying because Apps Script is flaky.
// Validation-type codes (invalid_*, user_not_found, ...) are never retried.
const RETRYABLE_CODES = new Set([
  "timeout", "network_error", "http_error", "bad_response", "busy", "server_error"
]);

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Single request: fetch -> text -> JSON -> verify `ok` flag.
 * Returns the parsed object only when the backend explicitly said ok: true.
 */
async function request(url, options = {}, timeoutMs = DEFAULT_TIMEOUT_MS) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  let text;

  try {
    const response = await fetch(url, { ...options, signal: controller.signal });
    if (!response.ok) {
      throw new ApiError("http_error", `HTTP ${response.status} ${response.statusText}`);
    }
    text = await response.text();
  } catch (err) {
    if (err instanceof ApiError) throw err;
    if (err.name === "AbortError") {
      throw new ApiError("timeout", `No response after ${timeoutMs / 1000}s`);
    }
    throw new ApiError("network_error", err.message || "Network request failed");
  } finally {
    clearTimeout(timer);
  }

  let data;
  try {
    data = JSON.parse(text);
  } catch (err) {
    // Apps Script sometimes answers with an HTML error page and status 200
    throw new ApiError("bad_response", "Server did not return JSON", text.slice(0, 200));
  }

  if (!data || typeof data !== "object") {
    throw new ApiError("bad_response", "Server returned an unexpected value", text.slice(0, 200));
  }
  if (data.ok === false) {
    throw new ApiError(data.error || "unknown_server_error", data.message || "Server reported an error");
  }
  if (data.ok !== true) {
    throw new ApiError("bad_response", "Server reply is missing the ok flag", text.slice(0, 200));
  }

  return data;
}

/** Runs `request`, retrying transient failures up to `retries` extra times. */
async function requestWithRetry(url, options, retries) {
  let attempt = 0;
  while (true) {
    try {
      return await request(url, options);
    } catch (err) {
      const canRetry = attempt < retries && err instanceof ApiError && RETRYABLE_CODES.has(err.code);
      if (!canRetry) throw err;
      attempt++;
      await sleep(RETRY_DELAY_MS * attempt);
    }
  }
}

/**
 * GET helper
 * @param {Object} params - Query string parameters
 * @param {{retries?: number}} opts
 */
export async function apiGet(params = {}, { retries = 0 } = {}) {
  const queryString = new URLSearchParams(params).toString();
  const url = queryString ? `${API_URL}?${queryString}` : API_URL;
  return requestWithRetry(url, {}, retries);
}

/**
 * POST helper. Only use retries > 0 for idempotent actions
 * (login, and saveResult because it carries an attemptId).
 * @param {Object} payload - JSON body object
 * @param {{retries?: number}} opts
 */
export async function apiPost(payload, { retries = 0 } = {}) {
  return requestWithRetry(API_URL, {
    method: "POST",
    headers: { "Content-Type": "text/plain;charset=utf-8" },
    body: JSON.stringify(payload)
  }, retries);
}