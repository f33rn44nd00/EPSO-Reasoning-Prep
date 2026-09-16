import { apiGet, apiPost } from './api.js';

let activeUsername = "";

function setUserLoading(isLoading) {
  const loadingEl = document.getElementById("loading-indicator");
  const loginBtn = document.getElementById("login-btn");
  
  if (loadingEl) loadingEl.hidden = !isLoading;
  if (loginBtn) loginBtn.disabled = isLoading;
}

export async function checkUserExists(username) {
  const usersList = await apiGet({ action: "getUsers" });
  return usersList.some(name => String(name).toLowerCase() === username.toLowerCase());
}

export async function createRemoteUser(username) {
  return await apiPost({ action: "createUser", username: username });
}

export async function handleUserLogin(inputName) {
  const cleanName = inputName.trim();
  if (!cleanName) {
    alert("Please enter a valid username.");
    return { success: false };
  }

  setUserLoading(true);

  try {
    const exists = await checkUserExists(cleanName);
    if (!exists) {
      await createRemoteUser(cleanName);
    }

    activeUsername = cleanName;
    localStorage.setItem("epso_current_user", cleanName);

    return { success: true, isNew: !exists, username: cleanName };
  } catch (err) {
    console.error("User login error:", err);
    alert("Could not complete login. Verify your API URL or connection.");
    return { success: false };
  } finally {
    setUserLoading(false);
  }
}