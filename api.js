const API_URL = "YOUR_GOOGLE_APPS_SCRIPT_WEB_APP_URL";

/**
 * General GET request helper
 * @param {Object} params - Query string parameters
 */
export async function apiGet(params = {}) {
  const queryString = new URLSearchParams(params).toString();
  const url = queryString ? `${API_URL}?${queryString}` : API_URL;

  const response = await fetch(url);
  if (!response.ok) throw new Error(`API GET Failed: ${response.statusText}`);
  return await response.json();
}

/**
 * General POST request helper
 * @param {Object} payload - JSON body object
 */
export async function apiPost(payload) {
  const response = await fetch(API_URL, {
    method: "POST",
    headers: { "Content-Type": "text/plain;charset=utf-8" },
    body: JSON.stringify(payload)
  });
  if (!response.ok) throw new Error(`API POST Failed: ${response.statusText}`);
  return await response.json();
}