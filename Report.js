import { getQuestionImagePath } from './questions.js';

/**
 * Renders a report object (from generateReport) into the report view.
 * Used for both the instant post-test report and reports rebuilt from history.
 *
 * @param {Object} report - Output of generateReport()
 * @param {{subtitle?: string, notice?: string}} [opts]
 *        subtitle: line under the header (e.g. category and date); notice: warning text
 */
export function renderReportView(report, { subtitle = "", notice = "" } = {}) {
  setOptionalText('report-subtitle', subtitle);
  setOptionalText('report-notice', notice);

  // Right Column Summary Metrics
  document.getElementById('diag-score').textContent = `${report.score} / ${report.total} (${report.percentage}%)`;
  document.getElementById('diag-pace').textContent = `Total: ${Math.floor(report.totalTimeSpentSec / 60)}m ${report.totalTimeSpentSec % 60}s | Avg: ${report.avgTimePerQ}s / q`;

  renderTagList('diag-missed-tags', report.diagnostics.missedTags);
  renderTagList('diag-flagged-tags', report.diagnostics.flaggedTags);
  renderTagList('diag-hesitation-tags', report.diagnostics.hesitationTags);

  const sinksContainer = document.getElementById('diag-time-sinks');
  sinksContainer.innerHTML = report.timeSinks.length > 0
    ? report.timeSinks.map(ts => `<li>Question ${ts.index}: <strong>${ts.timeSpentSec}s</strong></li>`).join('')
    : "<li>None identified</li>";

  // Left Column Review Stream
  const streamContainer = document.getElementById('review-stream-container');
  streamContainer.innerHTML = "";

  let lastSharedImage = null; // numerical sets share one chart: show it once per run

  report.details.forEach((q, idx) => {
    const isCorrect = q.selected_answer === q.correctIndex;
    const imagePath = getQuestionImagePath(q);

    // Numerical: reference chart once above the first question of each set
    if (q.category === "numerical") {
      if (imagePath !== lastSharedImage) {
        const block = document.createElement('div');
        block.style.cssText = "margin: 15px 0 8px; padding: 8px; background: #f7f9fb; border: 1px solid #e0e6eb; border-radius: 4px;";
        block.innerHTML = `
          <div style="font-size: 0.85rem; color: #555;">Reference chart for the questions below</div>
          ${imageHTML(imagePath, "Numerical Reference Chart")}
        `;
        streamContainer.appendChild(block);
        lastSharedImage = imagePath;
      }
    } else {
      lastSharedImage = null;
    }

    const card = document.createElement('div');
    card.className = `q-card ${isCorrect ? 'correct' : 'incorrect'}`;

    const tagsHTML = (q.tags || []).map(t => `<span class="tag-badge">${t.replace(/_/g, ' ')}</span>`).join('');
    const flagIndicator = q.was_flagged ? " 🚩 [Flagged]" : "";

    // Options already carry their own letter in the data (e.g. "A. text"), so show them as stored
    let optionsHTML = "";
    q.options.forEach((optText, optIdx) => {
      let optClass = "opt-review";
      if (optIdx === q.correctIndex) optClass += " opt-correct";
      else if (optIdx === q.selected_answer) optClass += " opt-wrong";

      optionsHTML += `
        <div class="${optClass}">
          ${optText}
          ${optIdx === q.correctIndex ? ' ✅' : ''}
          ${optIdx === q.selected_answer && !isCorrect ? ' ❌ (Your choice)' : ''}
        </div>
      `;
    });

    // Abstract: each question has its own diagram, shown inside its card
    const abstractImageHTML = q.category === "abstract" ? imageHTML(imagePath, "Abstract Diagram") : "";

    card.innerHTML = `
      <div style="display: flex; justify-content: space-between; font-size: 0.9rem; color: #555;">
        <span><strong>Q${idx + 1}</strong> (${isCorrect ? 'Correct' : 'Incorrect'})${flagIndicator}</span>
        <span>Time: ${q.time_spent_sec}s | Edits: ${q.change_count}</span>
      </div>
      ${abstractImageHTML}
      <p style="margin: 8px 0;">${q.prompt}</p>
      <div>${optionsHTML}</div>
      <div style="margin-top: 8px; font-size: 0.85rem; color: #444; background: #fff; padding: 6px; border-left: 3px solid #007bb5;">
        <strong>Explanation:</strong> ${q.explanation || "N/A"}
      </div>
      <div style="margin-top: 6px;">${tagsHTML}</div>
    `;

    streamContainer.appendChild(card);
  });
}

export function renderTagList(elementId, tagArray) {
  const el = document.getElementById(elementId);
  el.innerHTML = tagArray.length > 0
    ? tagArray.map(item => `<li>${item.tag.replace(/_/g, ' ')} (<strong>${item.count}</strong>)</li>`).join('')
    : "<li>None recorded</li>";
}

// ---- helpers

function setOptionalText(elementId, text) {
  const el = document.getElementById(elementId);
  if (!el) return;
  el.textContent = text;
  el.hidden = !text;
}

/** Image with the same missing-file fallback the test screen uses. */
function imageHTML(path, alt) {
  return `
    <div style="text-align: center; margin: 8px 0;">
      <img src="${path}" alt="${alt}" style="max-width: 100%; height: auto;"
           onerror="this.style.display='none'; this.nextElementSibling.style.display='block';"/>
      <p style="display: none; color: #888;">[ Image: ${path} ]</p>
    </div>
  `;
}