
const CATEGORY_COUNTS = {
  verbal: 20,
  numerical: 4, // 4 sets of 3 questions = 12 total questions
  abstract: 10
};

// Partial Fisher-Yates shuffle to randomly sample up to N items
function shuffleAndSample(array, size) {
  const pool = [...array];
  const count = Math.min(size, pool.length);
  for (let i = 0; i < count; i++) {
    const j = Math.floor(Math.random() * (pool.length - i)) + i;
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return pool.slice(0, count);
}

  // One fetch per category per page load; shared by the test loader and past-report rebuilds
  const bankCache = {};

  /**
   * Loads (and caches) the full question bank for a category.
   * @param {string} category - 'verbal', 'numerical', or 'abstract'
   * @returns {Promise<Array<Object>>}
   */
  export function loadQuestionBank(category) {
    if (!bankCache[category]) {
      const jsonUrl = new URL(`./${category}.json`, import.meta.url).href;
      bankCache[category] = fetch(jsonUrl)
        .then((response) => {
          if (!response.ok) throw new Error(`Failed to load ${category}.json (${response.status})`);
          return response.json();
        })
        .catch((err) => {
          delete bankCache[category]; // don't cache failures, so a retry can succeed
          throw err;
        });
    }
    return bankCache[category];
  }

  /**
   * Image path for a question, or null for verbal questions.
   * Numerical questions share one chart per set (set_image); abstract questions
   * have their own diagram.
   */
  export function getQuestionImagePath(q) {
    if (q.category === "numerical") return `./images/${q.set_image || q.id + ".png"}`;
    if (q.category === "abstract") return `./images/${q.image || q.id + ".png"}`;
    return null;
  }

/**
 * Main loader orchestrator
 * @param {string} category - 'verbal', 'numerical', or 'abstract'
 * @param {boolean} allowRepeats - If true, ignores seen questions history
 * @param {Array<string>} seenIds - User's answered question IDs passed from backend user state
 */
export async function initTestSession(category = "verbal", allowRepeats = false, seenIds = []) {
  try {
    const fullBank = await loadQuestionBank(category);
    let selected = [];

    if (category === "numerical") {
      // 1. Group numerical items into sets by set_id (or fallback to q.id)
      const groupMap = {};
      fullBank.forEach((q) => {
        const key = q.set_id || q.id;
        if (!groupMap[key]) groupMap[key] = [];
        groupMap[key].push(q);
      });

      const allSets = Object.values(groupMap);
      let setPool = allSets;

      // 2. Filter out sets where ANY question has been seen
      if (!allowRepeats && seenIds.length > 0) {
        const unseenSets = allSets.filter(
          (set) => !set.some((q) => seenIds.includes(q.id))
        );
        if (unseenSets.length > 0) setPool = unseenSets;
      }

      // 3. Shuffle sets, pick target set count (4), and flatten back to 1D
      const targetSetCount = CATEGORY_COUNTS.numerical;
      const selectedSets = shuffleAndSample(setPool, targetSetCount);
      selected = selectedSets.flat();

    } else {
      // Standard path for Verbal and Abstract
      const targetCount = CATEGORY_COUNTS[category] || 20;
      let pool = fullBank;

      if (!allowRepeats && seenIds.length > 0) {
        const unseen = fullBank.filter((q) => !seenIds.includes(q.id));
        if (unseen.length > 0) pool = unseen;
      }

      selected = shuffleAndSample(pool, targetCount);
    }

    return selected.map((q) => ({
      ...q,
      category: category,
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