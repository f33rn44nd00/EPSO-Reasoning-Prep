import { apiGet, ApiError } from './api.js';
import { loadQuestionBank } from './questions.js';
import { generateReport } from './analytics.js';

/**
 * Past results are stored as raw answers only (id, selected answer, time,
 * changes, flag, views). Everything else - correctness, score, tags - is
 * recomputed here from the CURRENT question bank, so corrections made to the
 * bank apply retroactively to old tests.
 */

/**
 * Fetches every attempt of a user from the backend (newest first).
 * Each entry: { attemptId, timestamp, category, details }  (details is null if unreadable)
 */
async function fetchResultList(username) {
  const res = await apiGet({ action: "getResults", username }, { retries: 2 });
  if (!Array.isArray(res.results)) {
    throw new ApiError("bad_response", "Result list was missing from the reply", JSON.stringify(res).slice(0, 200));
  }
  return res.results;
}

/**
 * Rebuilds one attempt into a full report.
 * Saved questions that no longer exist in the bank are skipped and counted.
 * @returns {{report: Object|null, missing: number}} report is null if nothing can be shown
 */
function rebuildAttempt(entry, bankById) {
  if (!Array.isArray(entry.details) || !bankById) return { report: null, missing: 0 };

  const questions = [];
  let missing = 0;

  for (const rec of entry.details) {
    const base = bankById.get(rec.id);
    if (!base) {
      missing++;
      continue;
    }
    questions.push({
      ...base,
      category: entry.category,
      selected_answer: rec.selected_answer ?? null,
      time_spent_sec: rec.time_spent_sec || 0,
      change_count: rec.change_count || 0,
      was_flagged: !!rec.was_flagged,
      view_count: rec.view_count || 0
    });
  }

  if (questions.length === 0) return { report: null, missing };

  const totalTimeSpentSec = questions.reduce((acc, q) => acc + q.time_spent_sec, 0);
  return { report: generateReport({ questions, totalTimeSpentSec }), missing };
}

/**
 * Loads the user's past attempts and rebuilds a report for each.
 * Throws ApiError / Error if the list or a question bank cannot be loaded.
 *
 * @returns {Promise<Array<{attemptId: string, timestamp: string, category: string,
 *                          report: Object|null, missing: number}>>}
 *          report is null when the attempt is unreadable or has no surviving questions.
 */
export async function loadHistory(username) {
  const entries = await fetchResultList(username);

  // One bank fetch per category actually present (cached by questions.js)
  const categories = [...new Set(entries.filter((e) => Array.isArray(e.details)).map((e) => e.category))];
  const banks = {};
  await Promise.all(categories.map(async (category) => {
    const bank = await loadQuestionBank(category);
    banks[category] = new Map(bank.map((q) => [q.id, q]));
  }));

  return entries.map((entry) => {
    const { report, missing } = rebuildAttempt(entry, banks[entry.category]);
    return {
      attemptId: entry.attemptId,
      timestamp: entry.timestamp,
      category: entry.category,
      report,
      missing
    };
  });
}
