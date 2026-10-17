import { apiPost, ApiError } from './api.js';

let activeUsername = "";

// Must stay in sync with validateUsername_ in the backend (the server is the authority)
const USERNAME_PATTERN = /^[\p{L}\p{N}][\p{L}\p{N} _.\-]*$/u;
const USERNAME_RULES = "1-30 characters, starting with a letter or number, using only letters, numbers, spaces, _ . -";

const LOGIN_ERROR_MESSAGES = {
  invalid_username: `Invalid username. Use ${USERNAME_RULES}.`,
  busy: "The server is busy. Please try again in a moment.",
  timeout: "The server took too long to respond. Please try again.",
  network_error: "Could not reach the server. Check your connection.",
  http_error: "The server returned an error. Please try again.",
  bad_response: "The server sent an unexpected reply. Please try again."
};

function describeLoginError(err) {
  const code = err && err.code ? err.code : "unknown";
  const base = LOGIN_ERROR_MESSAGES[code] || "Login failed.";
  return `${base} [${code}]`;
}

function setUserLoading(isLoading) {
  const loadingEl = document.getElementById("loading-indicator");
  const loginBtn = document.getElementById("login-btn");

  if (loadingEl) loadingEl.hidden = !isLoading;
  if (loginBtn) loginBtn.disabled = isLoading;
}

export async function handleUserLogin(inputName) {
  const cleanName = inputName.trim();
  if (!cleanName) {
    alert("Please enter a valid username.");
    return { success: false };
  }
  if (cleanName.length > 30 || !USERNAME_PATTERN.test(cleanName)) {
    alert(`Invalid username. Use ${USERNAME_RULES}.`);
    return { success: false };
  }

  setUserLoading(true);

  try {
    // Login is idempotent, so one automatic retry is safe
    const response = await apiPost({ action: "createUser", username: cleanName }, { retries: 1 });

    // Don't trust a reply that is missing what we need: an empty seen_ids list
    // here would silently re-serve questions the user has already seen
    if (typeof response.username !== "string" || !Array.isArray(response.seen_ids)) {
      throw new ApiError("bad_response", "Login reply was incomplete", JSON.stringify(response).slice(0, 200));
    }

    activeUsername = response.username;
    localStorage.setItem("epso_current_user", activeUsername);

    return {
      success: true,
      isNew: response.isNew === true,
      username: activeUsername,
      seen_ids: response.seen_ids
    };
  } catch (err) {
    console.error("User login error:", err, err && err.detail ? err.detail : "");
    alert(describeLoginError(err));
    return { success: false };
  } finally {
    setUserLoading(false);
  }
}