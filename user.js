import { apiGet, apiPost } from './api.js';

let activeUsername = "";

function setUserLoading(isLoading) {
  const loadingEl = document.getElementById("loading-indicator");
  const loginBtn = document.getElementById("login-btn");
  
  if (loadingEl) loadingEl.hidden = !isLoading;
  if (loginBtn) loginBtn.disabled = isLoading;
}

/* Unused in current version
export async function checkUserExists(username) {
  const usersList = await apiGet({ action: "getUsers" });
  return usersList.some(name => String(name).toLowerCase() === username.toLowerCase());
}

export async function createRemoteUser(username) {
  return await apiPost({ action: "createUser", username: username });
}
*/

export async function handleUserLogin(inputName) {
  const cleanName = inputName.trim();
  if (!cleanName) {
    alert("Please enter a valid username.");
    return { success: false };
  }

  setUserLoading(true);

  try {
    const response = await apiPost({ action: "createUser", username: cleanName });

    activeUsername = response.username || cleanName;
    localStorage.setItem("epso_current_user", activeUsername);

    return {
      success: true,
      isNew: response.isNew,
      username: activeUsername,
      seen_ids: response.seen_ids || []
    };
  } catch (err) {
    console.error("User login error:", err);
    alert("Could not complete login. Verify your API URL or connection.");
    return { success: false };
  } finally {
    setUserLoading(false);
  }
}