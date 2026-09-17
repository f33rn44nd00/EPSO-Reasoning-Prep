const SEEN_KEY = "epso_seen_ids";

// Retrieve seen IDs from localStorage
function getSeenIds() {
  try {
    return JSON.parse(localStorage.getItem(SEEN_KEY)) || [];
  } catch (e) {
    return [];
  }
}

// Save a newly answered question ID to localStorage
export function markQuestionSeen(id) {
  const seen = getSeenIds();
  if (!seen.includes(id)) {
    seen.push(id);
    localStorage.setItem(SEEN_KEY, JSON.stringify(seen));
  }
}

// Partial Fisher-Yates shuffle to randomly sample up to N questions
function shuffleAndSample(array, size = 25) {
  const pool = [...array];
  const count = Math.min(size, pool.length);
  for (let i = 0; i < count; i++) {
    const j = Math.floor(Math.random() * (pool.length - i)) + i;
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return pool.slice(0, count);
}

/**
 * Main loader orchestrator
 * @param {string} category - 'verbal', 'numerical', or 'abstract'
 * @param {boolean} allowRepeats - If true, ignores seen questions history
 * @param {Array<string>} seenIds - User's answered question IDs passed from backend user state
 */
export async function initTestSession(category = "verbal", allowRepeats = false, seenIds = []) {
  try {
    const jsonUrl = new URL(`./${category}.json`, import.meta.url).href;
    const response = await fetch(jsonUrl);
    
    if (!response.ok) {
      throw new Error(`Failed to load ${category}.json (${response.status})`);
    }

    const fullBank = await response.json();

    let pool = fullBank;
    if (!allowRepeats && seenIds.length > 0) {
      const unseen = fullBank.filter((q) => !seenIds.includes(q.id));
      if (unseen.length > 0) pool = unseen;
    }

    const selected = shuffleAndSample(pool, 25);

    return selected.map((q) => ({
      ...q,
      selected_answer: null,
      time_spent_sec: 0,
      view_count: 0,
      change_count: 0,
      was_flagged: false
    }));
  } catch (err) {
    console.error("Question Loader Error:", err);
    throw err;
  }
}