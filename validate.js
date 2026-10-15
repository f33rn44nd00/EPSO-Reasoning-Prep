const fs = require('fs');
const path = require('path');

// Resolve paths strictly to the directory where this script is placed
const jsonPath = path.join(__dirname, 'numerical.json');
const outputPath = path.join(__dirname, 'validation_report.txt');

try {
  const data = require(jsonPath);
  const anomalies = [];
  const setCounts = {};

  data.forEach(q => {
    const issues = [];
    
    // 1. Missing or invalid core fields
    if (typeof q.correctIndex !== 'number') issues.push('Invalid correctIndex (not an integer)');
    if (!q.explanation || q.explanation.trim() === '') issues.push('Empty explanation');
    if (!q.prompt || q.prompt.trim() === '') issues.push('Empty prompt');

    // 2. Option bounds & array anomalies
    if (!q.options || q.options.length < 5 || q.options.length > 6) {
      issues.push(`Abnormal option count: ${q.options ? q.options.length : 0}`);
    }
    
    if (q.options && q.correctIndex >= q.options.length) {
      issues.push(`correctIndex (${q.correctIndex}) is out of bounds for the options array`);
    }

    // 3. Merged option strings
    if (q.options) {
      q.options.forEach((opt, idx) => {
        // Looks for multiple choice letters (e.g., "A. ... B.") trapped in one string
        if (/[A-F][.)]\s.*[A-F][.)]\s/.test(opt)) {
          issues.push(`Merged string in option ${idx}: ${opt}`);
        }
      });
    }

    // 4. Track sets for completeness
    if (q.set_image) {
      setCounts[q.set_image] = (setCounts[q.set_image] || 0) + 1;
    } else {
      issues.push('Missing set_image property');
    }

    if (issues.length > 0) {
      anomalies.push({ id: q.id, issues });
    }
  });

  // Check for orphaned or oversized sets
  const incompleteSets = Object.entries(setCounts)
    .filter(([_, count]) => count !== 3)
    .map(([img, count]) => `${img} has ${count} questions (Expected exactly 3)`);

  // Build the final report
  let report = "=== Corrupted Questions ===\n";
  report += JSON.stringify(anomalies, null, 2) + "\n\n";
  report += "=== Set Completeness Issues ===\n";
  report += incompleteSets.length > 0 ? incompleteSets.join('\n') : "All sets contain exactly 3 questions.\n";

  // Export to file
  fs.writeFileSync(outputPath, report, 'utf8');
  console.log(`✅ Validation complete! Found ${anomalies.length} corrupted questions.`);
  console.log(`📄 Review your hit-list here: ${outputPath}`);

} catch (error) {
  console.error("❌ Error running script. Ensure 'numerical.json' is in the same folder as this script.");
  console.error(error.message);
}