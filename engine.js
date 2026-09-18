let questions = [];
let currentIndex = 0;
let focusStartTimestamp = null;
let timerInterval = null;
let totalTimeRemainingSec = 20 * 60; // 20 min default budget
let timerVisible = false;

// DOM Element References (bound on init)
let elements = {};

/**
 * Initializes the Module 3 Engine
 */
export function startTestSession(sessionQuestions, domElements) {
  questions = sessionQuestions;
  currentIndex = 0;
  elements = domElements;
  totalTimeRemainingSec = questions.length * 60; // 1 min per question default

  setupEventListeners();
  startGlobalTimer();
  renderQuestion(currentIndex);
  renderPalette();
}

// Global Timer Logic (Hidden by default)
function startGlobalTimer() {
  updateTimerDisplay();
  timerInterval = setInterval(() => {
    if (totalTimeRemainingSec > 0) {
      totalTimeRemainingSec--;
      updateTimerDisplay();
      
      if (totalTimeRemainingSec === 0) {
        alert("Global time is up!");
      }
    }
  }, 1000);
}

function updateTimerDisplay() {
  if (!elements.timerDisplay) return;
  if (!timerVisible) {
    elements.timerDisplay.textContent = "Time: [Hidden]";
    return;
  }
  
  const mins = String(Math.floor(totalTimeRemainingSec / 60)).padStart(2, '0');
  const secs = String(totalTimeRemainingSec % 60).padStart(2, '0');
  elements.timerDisplay.textContent = `Time Remaining: ${mins}:${secs}`;
}

// Category Dispatcher
function renderQuestion(index) {
  recordElapsedFocusTime(); // Flush focus duration for outgoing question

  const q = questions[index];
  q.view_count++;
  focusStartTimestamp = Date.now();

  elements.questionCounter.textContent = `Question ${index + 1} of ${questions.length}`;
  elements.flagBtn.textContent = q.was_flagged ? "🚩 Flagged" : "🏳️ Flag for Review";

  // Dispatch to category renderer
  switch (q.category || "verbal") {
    case "numerical":
      renderNumericalQuestion(q);
      break;
    case "abstract":
      renderAbstractQuestion(q);
      break;
    case "verbal":
    default:
      renderVerbalQuestion(q);
      break;
  }

  renderOptions(q);
  updatePaletteHighlight();
}

// Category Specific Renderers
function renderVerbalQuestion(q) {
  elements.questionContent.innerHTML = `
    <div class="prompt-verbal">
      <p style="font-size: 1.1rem; line-height: 1.5;">${q.prompt}</p>
    </div>
  `;
}

function renderNumericalQuestion(q) {
  // Container isolated for future table/chart parsing
  const tableHTML = q.tableData ? `<div class="numerical-table-wrapper">${q.tableData}</div>` : "";
  elements.questionContent.innerHTML = `
    <div class="prompt-numerical">
      ${tableHTML}
      <p style="font-size: 1.05rem; margin-top: 10px;">${q.prompt}</p>
    </div>
  `;
}

function renderAbstractQuestion(q) {
  // Container isolated for spatial image rendering
  elements.questionContent.innerHTML = `
    <div class="prompt-abstract" style="text-align: center;">
      <img src="./images/${q.id}.png" alt="Abstract Diagram" style="max-width: 100%; height: auto;" 
           onerror="this.style.display='none'; this.nextElementSibling.style.display='block';"/>
      <p style="display:none; color: #888;">[ Diagram image: ./images/${q.id}.png ]</p>
      <p style="font-size: 1.05rem; margin-top: 10px;">${q.prompt}</p>
    </div>
  `;
}

// Common Option Renderer & Selection Logic
function renderOptions(q) {
  elements.optionsContainer.innerHTML = "";

  q.options.forEach((optText, optIdx) => {
    const btn = document.createElement("button");
    btn.style.display = "block";
    btn.style.width = "100%";
    btn.style.margin = "8px 0";
    btn.style.padding = "10px";
    btn.style.textAlign = "left";
    btn.className = "option-btn" + (q.selected_answer === optIdx ? " selected" : "");
    btn.style.backgroundColor = (q.selected_answer === optIdx) ? "#9ad1e8" : "#fff";
    btn.style.border = (q.selected_answer === optIdx) ? "2px solid #1a6fa4" : "1px solid #ccc";
    btn.style.fontWeight = (q.selected_answer === optIdx) ? "bold" : "normal";
    btn.textContent = `${String.fromCharCode(65 + optIdx)}) ${optText}`;

    btn.onclick = () => {
      if (q.selected_answer !== null && q.selected_answer !== optIdx) {
        q.change_count++;
      }
      q.selected_answer = optIdx;
      renderOptions(q);
      renderPalette();
    };

    elements.optionsContainer.appendChild(btn);
  });
}

// Navigation & Time Tracking
function recordElapsedFocusTime() {
  if (focusStartTimestamp && questions[currentIndex]) {
    const elapsed = Math.round((Date.now() - focusStartTimestamp) / 1000);
    questions[currentIndex].time_spent_sec += elapsed;
  }
  focusStartTimestamp = Date.now();
}

function setupEventListeners() {
  elements.prevBtn.onclick = () => {
    if (currentIndex > 0) {
      currentIndex--;
      renderQuestion(currentIndex);
    }
  };

  elements.nextBtn.onclick = () => {
    if (currentIndex < questions.length - 1) {
      currentIndex++;
      renderQuestion(currentIndex);
    }
  };

  if (elements.finishBtn) {
    elements.finishBtn.onclick = () => {
      finishTestSession();
    };
  }

  elements.flagBtn.onclick = () => {
    const q = questions[currentIndex];
    q.was_flagged = !q.was_flagged;
    elements.flagBtn.textContent = q.was_flagged ? "🚩 Flagged" : "🏳️ Flag for Review";
    renderPalette();
  };

  elements.toggleTimerBtn.onclick = () => {
    timerVisible = !timerVisible;
    elements.toggleTimerBtn.textContent = timerVisible ? "Hide Time" : "Show Time Remaining";
    updateTimerDisplay();
  };

  // Tab switch focus handling
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) {
      recordElapsedFocusTime();
    } else {
      focusStartTimestamp = Date.now();
    }
  });
}

// Question Palette Matrix
function renderPalette() {
  if (!elements.paletteContainer) return;
  elements.paletteContainer.innerHTML = "";

  questions.forEach((q, idx) => {
    const pBtn = document.createElement("button");
    pBtn.textContent = idx + 1;
    pBtn.style.margin = "3px";
    pBtn.style.width = "32px";
    pBtn.style.height = "32px";

    let bg = "#fff";
    if (q.selected_answer !== null) bg = "#c8e6c9"; // Answered (Green)
    if (q.was_flagged) bg = "#fff9c4";              // Flagged (Yellow)
    if (idx === currentIndex) pBtn.style.border = "2px solid #000";

    pBtn.style.backgroundColor = bg;
    pBtn.onclick = () => {
      currentIndex = idx;
      renderQuestion(currentIndex);
    };

    elements.paletteContainer.appendChild(pBtn);
  });
}

function updatePaletteHighlight() {
  renderPalette();
}

/**
 * Stops timing and returns session data + answered IDs for GAS upload
 */
export function finishTestSession() {
  clearInterval(timerInterval);
  recordElapsedFocusTime();

  return {
    questions: questions,
    answeredIds: questions.filter(q => q.selected_answer !== null).map(q => q.id),
    totalTimeSpentSec: questions.reduce((acc, q) => acc + q.time_spent_sec, 0)
  };
}