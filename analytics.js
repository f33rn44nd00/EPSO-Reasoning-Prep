import { apiPost, ApiError } from './api.js';

/**
 * Processes raw test session data into performance metrics and diagnostic tags.
 * @param {Object} sessionData - Object returned from finishTestSession()
 * @returns {Object} Structured report data
 */
const CATEGORY_TARGETS = {
  verbal: 105,    // 105s threshold
  numerical: 120, // 120s threshold
  abstract: 60    // 60s threshold
};

export function generateReport(sessionData) {
  const { questions, totalTimeSpentSec } = sessionData;
  const total = questions.length;
  
  let score = 0;
  const missedTagsMap = {};
  const flaggedTagsMap = {};
  const hesitationTagsMap = {};
  const timeSinks = [];

  const category = (questions[0] && questions[0].category) ? questions[0].category : "verbal";
  const targetTimePerQ = CATEGORY_TARGETS[category] || 105;
  const avgTimePerQ = total > 0 ? Math.round(totalTimeSpentSec / total) : 0;

  questions.forEach((q, idx) => {
    const isCorrect = q.selected_answer === q.correctIndex;
    
    if (isCorrect) {
      score++;
    } else if (q.tags) {
      // 1. Missed Concept Tags
      q.tags.forEach(tag => {
        missedTagsMap[tag] = (missedTagsMap[tag] || 0) + 1;
      });
    }

    // 2. Flagged Question Tags
    if (q.was_flagged && q.tags) {
      q.tags.forEach(tag => {
        flaggedTagsMap[tag] = (flaggedTagsMap[tag] || 0) + 1;
      });
    }

    // 3. Hesitation Tags (>1 answer change)
    if (q.change_count > 1 && q.tags) {
      q.tags.forEach(tag => {
        hesitationTagsMap[tag] = (hesitationTagsMap[tag] || 0) + 1;
      });
    }

    // Identify Time Sinks (spent over 2x average pace or >120s)
    if (q.time_spent_sec > targetTimePerQ) {
      timeSinks.push({ 
        index: idx + 1, 
        id: q.id, 
        timeSpentSec: q.time_spent_sec,
        targetSec: targetTimePerQ
      });
    }
  });

  return {
    score,
    total,
    percentage: Math.round((score / total) * 100),
    totalTimeSpentSec,
    avgTimePerQ,
    timeSinks,
    diagnostics: {
      missedTags: sortTagCounts(missedTagsMap),
      flaggedTags: sortTagCounts(flaggedTagsMap),
      hesitationTags: sortTagCounts(hesitationTagsMap)
    },
    details: questions
  };
}

/**
 * Sorts tag occurrences in descending order
 */
function sortTagCounts(tagMap) {
  return Object.entries(tagMap)
    .map(([tag, count]) => ({ tag, count }))
    .sort((a, b) => b.count - a.count);
}

/**
 * Unique ID for one test attempt. Lets the backend ignore duplicate saves,
 * so retrying a save can never create a second row.
 */
export function generateAttemptId() {
  if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
  return Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 10);
}

/**
 * Builds the exact object that is sent to the backend (and shown to the user
 * for manual saving if the upload fails). Per-question data is slimmed down to
 * the user-generated fields only.
 */
export function buildSavePayload(username, category, reportData, answeredIds, attemptId) {
  return {
    action: "saveResult",
    attemptId: attemptId,
    username: username,
    category: category,
    score: reportData.score,
    total: reportData.total,
    timeSpentSec: reportData.totalTimeSpentSec,
    answeredIds: answeredIds,
    details: reportData.details.map(q => ({
      id: q.id,
      selected_answer: q.selected_answer,
      time_spent_sec: q.time_spent_sec,
      change_count: q.change_count,
      was_flagged: q.was_flagged,
      view_count: q.view_count
    }))
  };
}

/**
 * Sends a payload from buildSavePayload() to the backend.
 * Retries transient failures twice (safe because of the attemptId), then
 * confirms the server echoed this attempt back. Throws ApiError on any failure.
 */
export async function sendResultToGAS(payload) {
  const res = await apiPost(payload, { retries: 2 });

  const statusOk = res.status === "result_saved" || res.status === "already_saved";
  if (!statusOk || res.attemptId !== payload.attemptId) {
    throw new ApiError("bad_response", "Save was not confirmed by the server", JSON.stringify(res).slice(0, 200));
  }
  return res;
}