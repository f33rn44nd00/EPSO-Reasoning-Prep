/**
 * Processes raw test session data into performance metrics and diagnostic tags.
 * @param {Object} sessionData - Object returned from finishTestSession()
 * @returns {Object} Structured report data
 */
export function generateReport(sessionData) {
  const { questions, totalTimeSpentSec } = sessionData;
  const total = questions.length;
  
  let score = 0;
  const missedTagsMap = {};
  const flaggedTagsMap = {};
  const hesitationTagsMap = {};
  const timeSinks = [];

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
    if (q.time_spent_sec > Math.max(avgTimePerQ * 2, 120)) {
      timeSinks.push({ 
        index: idx + 1, 
        id: q.id, 
        timeSpentSec: q.time_spent_sec 
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
 * Sends session results and detail records to Google Apps Script backend
 */
export async function sendResultToGAS(gasUrl, username, category, reportData, answeredIds) {
  const payload = {
    action: "saveResult",
    username: username,
    category: category,
    score: reportData.score,
    total: reportData.total,
    timeSpentSec: reportData.totalTimeSpentSec,
    answeredIds: answeredIds,
    details: reportData.details
  };

  try {
    const response = await fetch(gasUrl, {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify(payload)
    });
    
    return await response.json();
  } catch (err) {
    console.error("GAS Cloud Sync Error:", err);
    throw err;
  }
}