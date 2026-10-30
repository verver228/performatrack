const SUBJECTS = [
  "Filipino",
  "English",
  "Math",
  "Science",
  "Araling Panlipunan",
  "MAPEH",
  "EPP",
  "ESP",
];

const QUARTERS = ["Q1", "Q2", "Q3", "Q4"];

// Default grade categories applied to every subject until the teacher edits them.
const DEFAULT_CATEGORIES = [
  { id: "activities", name: "Activities", weight: 40 },
  { id: "performance", name: "Performance Tasks", weight: 40 },
  { id: "exam", name: "Exam", weight: 20 },
];

// Maps the previous fixed components to the new default categories.
const LEGACY_KEY_MAP = { ww: "activities", pt: "performance", qa: "exam" };

const STUDENTS_KEY = "ptStudents";
const RECORD_KEY = "ptClassRecord";
const CATEGORIES_KEY = "ptClassCategories";
const WEIGHT_SETTINGS_KEY = "__settings";
const DEFAULT_ATTENDANCE_WEIGHT = 5;

const studentSelect = document.getElementById("studentSelect");
const subjectSelect = document.getElementById("subjectSelect");
const quarterSelect = document.getElementById("quarterSelect");

const weightsBar = document.getElementById("weightsBar");
const categoryCards = document.getElementById("categoryCards");
const addCategoryBtn = document.getElementById("addCategoryBtn");

const resultCard = document.getElementById("resultCard");
const finalGrade = document.getElementById("finalGrade");
const remarkEl = document.getElementById("remark");
const resultBreakdown = document.getElementById("resultBreakdown");

const saveGradeBtn = document.getElementById("saveGradeBtn");
const saveNextBtn = document.getElementById("saveNextBtn");
const saveHint = document.getElementById("saveHint");

const selectedStudentLabel = document.getElementById("selectedStudentLabel");
const summaryTableBody = document.getElementById("summaryTableBody");
const avgCells = {
  Q1: document.getElementById("avgQ1"),
  Q2: document.getElementById("avgQ2"),
  Q3: document.getElementById("avgQ3"),
  Q4: document.getElementById("avgQ4"),
};
const avgFinalEl = document.getElementById("avgFinal");
const avgRemarkEl = document.getElementById("avgRemark");
const gradeSheetHead = document.getElementById("gradeSheetHead");
const gradeSheetBody = document.getElementById("gradeSheetBody");
const gradeSheetSaveStatus = document.getElementById("gradeSheetSaveStatus");
const gradeSheetWeightStatus = document.getElementById("gradeSheetWeightStatus");
const gradeWorkbookFile = document.getElementById("gradeWorkbookFile");
const gradeImportPreviewModal = new bootstrap.Modal(
  document.getElementById("gradeImportPreviewModal")
);
const gradeImportPreviewSummary = document.getElementById("gradeImportPreviewSummary");
const gradeImportOverwriteNotice = document.getElementById("gradeImportOverwriteNotice");
const gradeImportError = document.getElementById("gradeImportError");
const gradeImportPreviewBody = document.getElementById("gradeImportPreviewBody");
const gradeImportIssueList = document.getElementById("gradeImportIssueList");
const confirmGradeImportBtn = document.getElementById("confirmGradeImportBtn");
const gradeImportMappingToggle = document.getElementById("gradeImportMappingToggle");
const gradeImportMappingPanel = document.getElementById("gradeImportMappingPanel");
const gradeImportHeaderRow = document.getElementById("gradeImportHeaderRow");
const gradeImportStudentColumn = document.getElementById("gradeImportStudentColumn");
const gradeImportFirstNameColumn = document.getElementById("gradeImportFirstNameColumn");
const gradeImportSurnameColumn = document.getElementById("gradeImportSurnameColumn");
const gradeImportMiddleColumn = document.getElementById("gradeImportMiddleColumn");
const gradeImportGradeColumn = document.getElementById("gradeImportGradeColumn");
const gradeImportSectionColumn = document.getElementById("gradeImportSectionColumn");
const gradeImportSubjectColumn = document.getElementById("gradeImportSubjectColumn");
const gradeImportQuarterColumn = document.getElementById("gradeImportQuarterColumn");
const gradeImportMappingBody = document.getElementById("gradeImportMappingBody");
const gradeImportApplyMapping = document.getElementById("gradeImportApplyMapping");
let gradePersistTimer;
let pendingGradeImport = [];
let pendingWorkbookRows = [];

function safeRead(key, fallback) {
  const raw = localStorage.getItem(key);
  if (!raw) {
    return fallback;
  }
  try {
    const parsed = JSON.parse(raw);
    return parsed ?? fallback;
  } catch (error) {
    return fallback;
  }
}

function round1(value) {
  return Math.round(value * 10) / 10;
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function normalizeStudents(rawStudents) {
  if (!Array.isArray(rawStudents)) {
    return [];
  }
  return rawStudents
    .map((student) => ({
      id: String(student.id || "").trim(),
      name: String(student.name || "").trim(),
      firstName: String(student.firstName || "").trim(),
      surname: String(student.surname || "").trim(),
      middleInitial: String(student.middleInitial || "").trim(),
      gradeLevel: String(student.gradeLevel || "").trim(),
      section: String(student.section || "").trim(),
    }))
    .filter((student) => student.id && student.name);
}

function studentLabel(student) {
  const details = [student.gradeLevel, student.section].filter(Boolean).join(", ");
  return details ? `${student.name} - ${details}` : student.name;
}

function clampScore(value, max) {
  if (!Number.isFinite(value)) {
    return "";
  }
  return Math.min(Math.max(value, 0), max);
}

function makePair(percent, total) {
  const safePercent = Math.min(Math.max(percent, 0), 100);
  return { score: Math.round((safePercent / 100) * total), total };
}

function normalizeItem(item) {
  const score = Number(item?.score);
  const total = Number(item?.total);
  return {
    score: Number.isFinite(score) ? score : "",
    total: Number.isFinite(total) ? total : "",
  };
}

function uniqueId() {
  return `cat-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
}

function buildDefaultRecord() {
  return {};
}

// Convert any old ww/pt/qa keyed data to the new category ids.
function migrateRecord(rawRecord) {
  if (!rawRecord || typeof rawRecord !== "object") {
    return rawRecord;
  }

  Object.values(rawRecord).forEach((subjects) => {
    if (!subjects || typeof subjects !== "object") {
      return;
    }
    Object.values(subjects).forEach((quarters) => {
      if (!quarters || typeof quarters !== "object") {
        return;
      }
      Object.values(quarters).forEach((entry) => {
        if (!entry || typeof entry !== "object") {
          return;
        }
        Object.keys(LEGACY_KEY_MAP).forEach((legacyKey) => {
          if (Array.isArray(entry[legacyKey])) {
            const target = LEGACY_KEY_MAP[legacyKey];
            if (!Array.isArray(entry[target])) {
              entry[target] = entry[legacyKey];
            }
            delete entry[legacyKey];
          }
        });
      });
    });
  });

  return rawRecord;
}

let students = normalizeStudents(safeRead(STUDENTS_KEY, []));
let record = migrateRecord(safeRead(RECORD_KEY, null));
if (!record || typeof record !== "object") {
  record = buildDefaultRecord();
}

let categoriesBySubject = safeRead(CATEGORIES_KEY, {});
if (!categoriesBySubject || typeof categoriesBySubject !== "object") {
  categoriesBySubject = {};
}

function persist() {
  localStorage.setItem(RECORD_KEY, JSON.stringify(record));
}

function persistCategories() {
  localStorage.setItem(CATEGORIES_KEY, JSON.stringify(categoriesBySubject));
}

function attendanceGradeWeight() {
  const stored = Number(categoriesBySubject[WEIGHT_SETTINGS_KEY]?.attendanceWeight);
  return Number.isFinite(stored)
    ? Math.min(Math.max(round1(stored), 0), 10)
    : DEFAULT_ATTENDANCE_WEIGHT;
}

function setAttendanceGradeWeight(weight) {
  categoriesBySubject[WEIGHT_SETTINGS_KEY] = {
    ...categoriesBySubject[WEIGHT_SETTINGS_KEY],
    attendanceWeight: weight,
  };
  const subject = subjectSelect.value;
  const categories = getCategories(subject);
  const scaledCategories = scaleCategoryWeights(categories, 100 - weight);
  if (scaledCategories) {
    categoriesBySubject[subject] = scaledCategories;
  }
  persistCategories();
}

function scaleCategoryWeights(categories, targetTotal) {
  const currentTotal = categories.reduce((sum, category) => sum + category.weight, 0);
  if (currentTotal <= 0 || !categories.length) {
    return null;
  }
  let assigned = 0;
  return categories.map((category, index) => {
    const weight =
      index === categories.length - 1
        ? round1(targetTotal - assigned)
        : round1((category.weight / currentTotal) * targetTotal);
    assigned = round1(assigned + weight);
    return { ...category, weight };
  });
}

function getCategories(subject) {
  const stored = categoriesBySubject[subject];
  if (Array.isArray(stored) && stored.length) {
    return stored.map((category) => ({
      id: String(category.id),
      name: String(category.name ?? "Category"),
      weight: Number.isFinite(Number(category.weight)) ? Number(category.weight) : 0,
      assessmentCount: Number.isInteger(Number(category.assessmentCount))
        ? Math.max(0, Number(category.assessmentCount))
        : 0,
      assessmentCounts:
        category.assessmentCounts && typeof category.assessmentCounts === "object"
          ? Object.fromEntries(
              QUARTERS.map((quarter) => [
                quarter,
                Number.isInteger(Number(category.assessmentCounts[quarter]))
                  ? Math.max(0, Number(category.assessmentCounts[quarter]))
                  : Number.isInteger(Number(category.assessmentCount))
                    ? Math.max(0, Number(category.assessmentCount))
                    : 0,
              ])
            )
          : null,
    }));
  }
  return scaleCategoryWeights(DEFAULT_CATEGORIES, 100 - attendanceGradeWeight()) ||
    DEFAULT_CATEGORIES.map((category) => ({ ...category }));
}

function migrateCombinedWeights() {
  const settings = categoriesBySubject[WEIGHT_SETTINGS_KEY] || {};
  if (Number(settings.weightModelVersion) >= 1) {
    return;
  }

  const rawAttendanceWeight = Number(settings.attendanceWeight);
  const attendanceWeight = Number.isFinite(rawAttendanceWeight)
    ? Math.min(Math.max(round1(rawAttendanceWeight), 0), 10)
    : DEFAULT_ATTENDANCE_WEIGHT;
  const subjects = new Set([
    ...SUBJECTS,
    ...Object.keys(categoriesBySubject).filter(
      (subject) => subject !== WEIGHT_SETTINGS_KEY && Array.isArray(categoriesBySubject[subject])
    ),
  ]);

  subjects.forEach((subject) => {
    const scaledCategories = scaleCategoryWeights(getCategories(subject), 100 - attendanceWeight);
    if (scaledCategories) {
      categoriesBySubject[subject] = scaledCategories;
    }
  });
  categoriesBySubject[WEIGHT_SETTINGS_KEY] = {
    ...settings,
    attendanceWeight,
    weightModelVersion: 1,
  };
  persistCategories();
}

migrateCombinedWeights();

function setCategories(subject, categories) {
  categoriesBySubject[subject] = categories;
  persistCategories();
}

function categoriesTotal(subject) {
  return round1(getCategories(subject).reduce((sum, category) => sum + category.weight, 0));
}

function categoriesValid(subject) {
  const categories = getCategories(subject);
  return (
    categories.length > 0 &&
    Math.abs(categoriesTotal(subject) + attendanceGradeWeight() - 100) < 0.001
  );
}

function getStudentName(studentId) {
  const matched = students.find((student) => student.id === studentId);
  return matched ? matched.name : studentId;
}

function teacherSubjects() {
  const assigned = window.ptCurrentUser?.teacherSubjects;
  return Array.isArray(assigned)
    ? [...new Set(assigned.map((subject) => String(subject).trim()).filter(Boolean))]
    : SUBJECTS.slice();
}

function studentsForSubject(subject) {
  return students.filter((student) => PT.getStudentSubjects(student.id).includes(subject));
}

function ensureEntry(studentId, subject, quarter) {
  if (!record[studentId]) {
    record[studentId] = {};
  }
  if (!record[studentId][subject]) {
    record[studentId][subject] = {};
  }
  if (!record[studentId][subject][quarter]) {
    record[studentId][subject][quarter] = {};
  }

  const entry = record[studentId][subject][quarter];
  getCategories(subject).forEach((category) => {
    if (!Array.isArray(entry[category.id])) {
      entry[category.id] = [];
    } else {
      entry[category.id] = entry[category.id].map(normalizeItem);
    }
  });

  return entry;
}

function currentEntry() {
  return ensureEntry(studentSelect.value, subjectSelect.value, quarterSelect.value);
}

function componentPercent(items) {
  let sumScore = 0;
  let sumTotal = 0;
  let hasValid = false;

  (items || []).forEach((item) => {
    const score = Number(item.score);
    const total = Number(item.total);
    if (Number.isFinite(score) && Number.isFinite(total) && total > 0 && score >= 0) {
      sumScore += score;
      sumTotal += total;
      hasValid = true;
    }
  });

  if (!hasValid || sumTotal <= 0) {
    return null;
  }

  return (sumScore / sumTotal) * 100;
}

function remarkFor(finalValue) {
  if (finalValue >= 90) {
    return { text: "Excellent", pass: true };
  }
  if (finalValue >= 85) {
    return { text: "Very Good", pass: true };
  }
  if (finalValue >= 80) {
    return { text: "Good", pass: true };
  }
  if (finalValue >= 75) {
    return { text: "Passed", pass: true };
  }
  return { text: "Needs Improvement", pass: false };
}

function computeQuarter(entry, subject) {
  const categories = getCategories(subject);
  const validWeights = categoriesValid(subject);
  const academicWeight = categories.reduce((sum, category) => sum + category.weight, 0);

  let weightedTotal = 0;
  let scoresComplete = categories.length > 0;

  const parts = categories.map((category) => {
    const percent = componentPercent(entry[category.id]);
    const weighted =
      percent === null || academicWeight <= 0
        ? null
        : (percent * category.weight) / academicWeight;
    if (percent === null) {
      scoresComplete = false;
    } else {
      weightedTotal += weighted;
    }
    return { ...category, percent, weighted };
  });

  const complete = scoresComplete && validWeights && academicWeight > 0;
  const initial = complete ? weightedTotal : null;
  const final = complete ? Math.round(initial) : null;

  return { parts, initial, final, complete, scoresComplete, validWeights };
}

function fmt(value) {
  return value === null || value === undefined ? "&mdash;" : Number(value).toFixed(1);
}

function fmtPct(value) {
  return value === null ? "&mdash;" : `${Number(value).toFixed(1)}%`;
}

function renderWeightsBar() {
  const subject = subjectSelect.value;
  const categories = getCategories(subject);
  const attendanceWeight = attendanceGradeWeight();
  weightsBar.innerHTML = `
    <div class="weights-head">
      <strong>Grade weights</strong>
      <button type="button" class="weights-reset" data-reset title="Restore the default categories">Reset categories</button>
    </div>
    <p class="weights-help">${escapeHtml(subject)} category weights must total 100%. Attendance adds a small share to the overall average, not each quarter grade.</p>
    <div class="weights-fields">
      ${categories
        .map(
          (category) => `
            <label class="weights-field">
              <span>${escapeHtml(category.name)}</span>
              <span class="weights-input-wrap">
                <input
                  type="number"
                  class="weights-input category-weight"
                  data-cat-weight="${escapeHtml(category.id)}"
                  value="${category.weight}"
                  min="0"
                  max="100"
                  step="1"
                  aria-label="${escapeHtml(category.name)} weight percentage"
                />
                <span class="weights-sign">%</span>
              </span>
            </label>
          `
        )
        .join("")}
      <label class="weights-field">
        <span>Attendance (0-10%)</span>
        <span class="weights-input-wrap">
          <input
            type="number"
            class="weights-input category-weight"
            data-attendance-weight
            value="${attendanceWeight}"
            min="0"
            max="10"
            step="1"
            aria-label="Attendance weight percentage"
          />
          <span class="weights-sign">%</span>
        </span>
      </label>
    </div>
    <div class="weights-total" id="weightsTotal" role="status"></div>
  `;
  updateWeightsTotal();
}

function updateWeightsTotal() {
  const subject = subjectSelect.value;
  const total = categoriesTotal(subject);
  const valid = categoriesValid(subject);
  const totalEl = document.getElementById("weightsTotal");
  const attendanceWeightInput = weightsBar.querySelector("[data-attendance-weight]");
  const attendanceWeight = attendanceGradeWeight();

  if (totalEl) {
    totalEl.className = `weights-total ${valid ? "is-ok" : "is-bad"}`;
    const combinedTotal = round1(total + attendanceWeight);
    totalEl.innerHTML = valid
      ? `Total weight: <strong>${combinedTotal}%</strong> &#10003; (${total}% categories + ${attendanceWeight}% attendance)`
      : `Total weight: <strong>${combinedTotal}%</strong> &mdash; adjust category weights so the total is 100%`;
  }

  if (attendanceWeightInput && document.activeElement !== attendanceWeightInput) {
    attendanceWeightInput.value = String(attendanceWeight);
  }
  weightsBar.classList.toggle("is-invalid", !valid);
}

function renderScoreRows(category, items) {
  if (!items.length) {
    return `<p class="score-empty">No entries yet. Use the button below to add one.</p>`;
  }

  return items
    .map(
      (item, index) => `
        <div class="score-row" data-cat="${category.id}" data-index="${index}">
          <span class="score-row-label">${escapeHtml(category.name)} ${index + 1}</span>
          <input type="number" class="score-input" data-field="score" data-cat="${category.id}" data-index="${index}" value="${item.score}" min="0" placeholder="Score" />
          <span class="score-divider">/</span>
          <input type="number" class="score-input" data-field="total" data-cat="${category.id}" data-index="${index}" value="${item.total}" min="1" placeholder="Total" />
          <button type="button" class="remove-row-btn" data-remove-row="${category.id}" data-index="${index}" title="Remove">&times;</button>
        </div>
      `
    )
    .join("");
}

function renderCategoryCards() {
  const subject = subjectSelect.value;
  const entry = currentEntry();
  const categories = getCategories(subject);

  categoryCards.innerHTML = categories
    .map((category) => {
      const items = entry[category.id] || [];
      const removable = categories.length > 1;
      return `
        <article class="component-card" data-cat="${category.id}">
          <header class="component-head category-head">
            <div class="category-title-wrap">
              <input type="text" class="category-name" data-cat-name="${category.id}" value="${escapeHtml(category.name)}" placeholder="Category name" />
            </div>
            <div class="category-controls">
              <label class="weights-input-wrap" title="Category weight">
                <input type="number" class="weights-input category-weight" data-cat-weight="${category.id}" value="${category.weight}" min="0" max="100" step="any" />
                <span class="weights-sign">%</span>
              </label>
              <span class="component-pct" data-pct="${category.id}">&mdash;</span>
              ${
                removable
                  ? `<button type="button" class="remove-category-btn" data-remove-cat="${category.id}" title="Remove category">&times;</button>`
                  : ""
              }
            </div>
          </header>
          <div class="score-rows" data-rows="${category.id}">${renderScoreRows(category, items)}</div>
          <button type="button" class="add-row-btn" data-add="${category.id}">+ Add ${escapeHtml(category.name) || "score"}</button>
        </article>
      `;
    })
    .join("");
}

function updateComputedDisplays() {
  const entry = currentEntry();
  const subject = subjectSelect.value;
  const result = computeQuarter(entry, subject);

  result.parts.forEach((part) => {
    const pctEl = categoryCards.querySelector(`[data-pct="${part.id}"]`);
    if (pctEl) {
      pctEl.innerHTML = fmtPct(part.percent);
    }
  });

  resultBreakdown.innerHTML =
    result.parts
      .map(
        (part) =>
          `<div><dt>${escapeHtml(part.name)} (${round1(part.weight)}%)</dt><dd>${fmt(part.weighted)}</dd></div>`
      )
      .join("") +
    `<div class="result-initial"><dt>Weighted total</dt><dd>${fmt(result.initial)}</dd></div>`;

  resultCard.classList.remove("is-pass", "is-fail");
  remarkEl.classList.remove("is-pass", "is-fail", "is-incomplete");

  if (!result.validWeights) {
    finalGrade.innerHTML = "&mdash;";
    remarkEl.textContent = "Check weights";
    remarkEl.classList.add("is-incomplete");
    saveHint.textContent = "Category weights must total 100% before a grade is computed.";
    return;
  }

  if (!result.complete) {
    finalGrade.innerHTML = "&mdash;";
    remarkEl.textContent = "Incomplete";
    remarkEl.classList.add("is-incomplete");

    const missing = result.parts.filter((part) => part.percent === null).map((part) => part.name);
    saveHint.textContent = missing.length
      ? `Add ${missing.join(", ")} to finalize this grade.`
      : "Add scores to finalize this grade.";
    return;
  }

  const finalValue = result.final;
  const remark = remarkFor(finalValue);

  finalGrade.textContent = String(finalValue);
  remarkEl.textContent = remark.text;
  remarkEl.classList.add(remark.pass ? "is-pass" : "is-fail");
  resultCard.classList.add(remark.pass ? "is-pass" : "is-fail");
  saveHint.textContent = "Scores save automatically as you type.";
}

function subjectFinal(studentId, subject) {
  const quarterFinals = QUARTERS.map((quarter) => {
    const stored = record[studentId]?.[subject]?.[quarter];
    if (!stored) {
      return null;
    }
    return computeQuarter(ensureEntry(studentId, subject, quarter), subject).final;
  });

  const present = quarterFinals.filter((value) => value !== null && value !== undefined);
  const final = present.length ? present.reduce((sum, value) => sum + value, 0) / present.length : null;

  return { quarterFinals, final };
}

function renderSummary() {
  if (!students.length) {
    selectedStudentLabel.textContent = "Add students from the teacher dashboard to get started.";
    summaryTableBody.innerHTML = SUBJECTS.map(
      (subject) => `
        <tr>
          <td>${escapeHtml(subject)}</td>
          ${QUARTERS.map(() => "<td>&mdash;</td>").join("")}
          <td>&mdash;</td>
          <td>&mdash;</td>
        </tr>
      `
    ).join("");
    Object.values(avgCells).forEach((cell) => {
      cell.innerHTML = "&mdash;";
    });
    avgFinalEl.innerHTML = "&mdash;";
    avgRemarkEl.textContent = "&mdash;";
    return;
  }

  const studentId = studentSelect.value;
  const studentSubjects = PT.getStudentSubjects(studentId);
  const selectedStudent = students.find((student) => student.id === studentId);
  selectedStudentLabel.textContent = selectedStudent
    ? studentLabel(selectedStudent)
    : getStudentName(studentId);

  const quarterTotals = { Q1: [], Q2: [], Q3: [], Q4: [] };
  const subjectFinals = [];

  summaryTableBody.innerHTML = studentSubjects.map((subject) => {
    const { quarterFinals, final } = subjectFinal(studentId, subject);

    QUARTERS.forEach((quarter, index) => {
      const value = quarterFinals[index];
      if (value !== null && value !== undefined) {
        quarterTotals[quarter].push(value);
      }
    });

    const cells = quarterFinals
      .map((value) => `<td>${value === null || value === undefined ? "&mdash;" : Math.round(value)}</td>`)
      .join("");

    let finalCell = "&mdash;";
    let remarkCell = "&mdash;";
    if (final !== null) {
      const rounded = Math.round(final);
      subjectFinals.push(rounded);
      const remark = remarkFor(rounded);
      finalCell = `<span class="${remark.pass ? "record-grade-pass" : "record-grade-fail"}">${rounded}</span>`;
      remarkCell = remark.text;
    }

    return `
      <tr>
        <td>${escapeHtml(subject)}</td>
        ${cells}
        <td>${finalCell}</td>
        <td>${remarkCell}</td>
      </tr>
    `;
  }).join("");

  QUARTERS.forEach((quarter) => {
    const values = quarterTotals[quarter];
    avgCells[quarter].innerHTML = values.length
      ? String(Math.round(values.reduce((sum, value) => sum + value, 0) / values.length))
      : "&mdash;";
  });

  if (subjectFinals.length) {
    const general = Math.round(subjectFinals.reduce((sum, value) => sum + value, 0) / subjectFinals.length);
    const remark = remarkFor(general);
    avgFinalEl.innerHTML = `<span class="${remark.pass ? "record-grade-pass" : "record-grade-fail"}">${general}</span>`;
    avgRemarkEl.textContent = remark.text;
  } else {
    avgFinalEl.innerHTML = "&mdash;";
    avgRemarkEl.textContent = "&mdash;";
  }
}

function sheetAssessmentCounts(subject, quarter) {
  const subjectStudents = studentsForSubject(subject);
  return getCategories(subject).map((category) => {
    const quarterCount = category.assessmentCounts?.[quarter];
    const storedCount = Number.isInteger(quarterCount)
      ? Math.max(0, quarterCount)
      : Number.isInteger(category.assessmentCount)
        ? Math.max(0, category.assessmentCount)
      : 0;
    const count = subjectStudents.reduce((max, student) => {
      const items = record[student.id]?.[subject]?.[quarter]?.[category.id];
      return Math.max(max, Array.isArray(items) ? items.length : 0);
    }, storedCount);
    return { ...category, count: Math.max(1, count) };
  });
}

function sheetCellDescriptors(subject, quarter) {
  let column = 0;
  return sheetAssessmentCounts(subject, quarter).flatMap((category) =>
    Array.from({ length: Math.max(1, category.count) }, (_, index) =>
      ["score", "total"].map((field) => ({
        categoryId: category.id,
        categoryName: category.name,
        index,
        field,
        column: column++,
      }))
    ).flat()
  );
}

function getSheetQuarterResult(studentId, subject, quarter) {
  const entry = record[studentId]?.[subject]?.[quarter] || {};
  return computeQuarter(entry, subject);
}

function renderGradeSheet() {
  const subject = subjectSelect.value;
  const quarter = quarterSelect.value;
  const subjectStudents = studentsForSubject(subject);
  const categories = sheetAssessmentCounts(subject, quarter);
  const descriptors = sheetCellDescriptors(subject, quarter);
  const weightTotal = categories.reduce((sum, category) => sum + category.weight, 0);
  const combinedWeightTotal = round1(weightTotal + attendanceGradeWeight());
  const weightsValid =
    categories.length > 0 && Math.abs(combinedWeightTotal - 100) < 0.001;

  gradeSheetWeightStatus.textContent = weightsValid
    ? `Grade and attendance weights: ${combinedWeightTotal}%`
    : `Grade and attendance weights total ${combinedWeightTotal}% (must equal 100%)`;
  gradeSheetWeightStatus.classList.toggle("text-danger", !weightsValid);
  gradeSheetWeightStatus.classList.toggle("text-success", weightsValid);

  const headerGroups = categories
    .map(
      (category) => `
        <th colspan="${category.count * 2}">
          <div class="grade-sheet-assessment">
            <span>${escapeHtml(category.name)} (${round1(category.weight)}%)</span>
            <button type="button" class="grade-sheet-add-assessment" data-grade-sheet-add="${escapeHtml(category.id)}">+ Add assessment</button>
          </div>
        </th>
      `
    )
    .join("");
  const subHeaders = categories
    .map((category) =>
      Array.from(
        { length: category.count },
        (_, index) => `
          <th class="grade-sheet-assessment-col">
            <span>Assessment ${index + 1}</span>
            <button
              type="button"
              class="grade-sheet-remove-assessment"
              data-grade-sheet-remove="${escapeHtml(category.id)}"
              data-grade-sheet-index="${index}"
              aria-label="Remove ${escapeHtml(category.name)} assessment ${index + 1}"
              title="Remove this assessment"
              ${category.count <= 1 ? "disabled" : ""}
            >&times;</button>
            <small>Score</small>
          </th>
          <th>Out of</th>
        `
      ).join("")
    )
    .join("");

  gradeSheetHead.innerHTML = `
    <tr>
      <th class="grade-sheet-row-number-col" rowspan="2"></th>
      <th class="grade-sheet-student-col" rowspan="2">Student</th>
      ${headerGroups}
      <th rowspan="2">Quarter grade</th>
    </tr>
    <tr>${subHeaders}</tr>
  `;

  if (!subjectStudents.length) {
    const blankRows = Array.from({ length: 15 }, (_, rowIndex) => `
      <tr class="grade-sheet-empty-row">
        <td class="grade-sheet-row-number-col">${rowIndex + 1}</td>
        <td class="grade-sheet-student-col">&nbsp;</td>
        ${descriptors.map(() => "<td>&nbsp;</td>").join("")}
        <td class="grade-sheet-final">&mdash;</td>
      </tr>
    `).join("");
    gradeSheetBody.innerHTML = blankRows;
    return;
  }

  gradeSheetBody.innerHTML = subjectStudents
    .map((student, rowIndex) => {
      const metadata = [student.gradeLevel, student.section].filter(Boolean).join(" - ");
      const values = descriptors
        .map((descriptor) => {
          const item =
            record[student.id]?.[subject]?.[quarter]?.[descriptor.categoryId]?.[descriptor.index];
          const value = item?.[descriptor.field];
          const assessment = `${descriptor.categoryName} ${descriptor.index + 1} ${descriptor.field}`;
          return `
            <td>
              <input
                type="number"
                class="grade-sheet-cell"
                data-grade-sheet-cell
                data-student="${escapeHtml(student.id)}"
                data-category="${escapeHtml(descriptor.categoryId)}"
                data-index="${descriptor.index}"
                data-field="${descriptor.field}"
                data-grid-row="${rowIndex}"
                data-grid-col="${descriptor.column}"
                value="${value === undefined || value === null ? "" : escapeHtml(value)}"
                min="0"
                step="any"
                aria-label="${escapeHtml(student.name)} ${escapeHtml(assessment)}"
              />
            </td>
          `;
        })
        .join("");
      const result = getSheetQuarterResult(student.id, subject, quarter);
      const finalGrade = result.final === null ? "&mdash;" : String(result.final);
      return `
        <tr data-grade-row="${rowIndex}">
          <td class="grade-sheet-row-number-col">${rowIndex + 1}</td>
          <td class="grade-sheet-student-col">
            <span class="grade-sheet-student-name">${escapeHtml(student.name)}</span>
            <span class="grade-sheet-student-meta">${escapeHtml(metadata)}</span>
          </td>
          ${values}
          <td class="grade-sheet-final" data-grade-final>${finalGrade}</td>
        </tr>
      `;
    })
    .join("");
}

function updateGradeSheetRow(studentId) {
  const rowIndex = studentsForSubject(subjectSelect.value).findIndex(
    (student) => student.id === studentId
  );
  const row = gradeSheetBody.querySelector(`[data-grade-row="${rowIndex}"]`);
  if (!row) {
    return;
  }
  const result = getSheetQuarterResult(studentId, subjectSelect.value, quarterSelect.value);
  row.querySelector("[data-grade-final]").textContent =
    result.final === null ? "—" : String(result.final);
}

function scheduleGradePersist() {
  gradeSheetSaveStatus.textContent = "Unsaved changes...";
  gradeSheetSaveStatus.classList.add("is-saving");
  window.clearTimeout(gradePersistTimer);
  gradePersistTimer = window.setTimeout(() => {
    persist();
    gradeSheetSaveStatus.textContent = "All changes saved";
    gradeSheetSaveStatus.classList.remove("is-saving");
  }, 500);
}

function flushGradeSheetPersist() {
  window.clearTimeout(gradePersistTimer);
  persist();
  gradeSheetSaveStatus.textContent = "All changes saved";
  gradeSheetSaveStatus.classList.remove("is-saving");
}

function applyGradeSheetValue(studentId, categoryId, index, field, rawValue) {
  const entry = ensureEntry(studentId, subjectSelect.value, quarterSelect.value);
  if (!Array.isArray(entry[categoryId])) {
    entry[categoryId] = [];
  }
  while (entry[categoryId].length <= index) {
    entry[categoryId].push({ score: "", total: "" });
  }
  if (rawValue === "") {
    entry[categoryId][index][field] = "";
    return;
  }
  const numericValue = Number(rawValue);
  if (Number.isFinite(numericValue)) {
    entry[categoryId][index][field] = clampScore(numericValue, 1000);
  }
}

function handleGradeSheetInput(event) {
  const input = event.target;
  if (!input.matches("[data-grade-sheet-cell]")) {
    return;
  }
  if (input.validity.badInput) {
    return;
  }
  applyGradeSheetValue(
    input.dataset.student,
    input.dataset.category,
    Number(input.dataset.index),
    input.dataset.field,
    input.value.trim()
  );
  updateGradeSheetRow(input.dataset.student);
  if (studentSelect.value === input.dataset.student) {
    updateComputedDisplays();
    renderSummary();
  }
  scheduleGradePersist();
}

function handleGradeSheetPaste(event) {
  const input = event.target;
  if (!input.matches("[data-grade-sheet-cell]")) {
    return;
  }
  const text = event.clipboardData?.getData("text");
  if (!text || !/[\t\r\n]/.test(text)) {
    return;
  }
  event.preventDefault();
  const startRow = Number(input.dataset.gridRow);
  const startColumn = Number(input.dataset.gridCol);
  const descriptors = sheetCellDescriptors(subjectSelect.value, quarterSelect.value);
  const subjectStudents = studentsForSubject(subjectSelect.value);
  text.replace(/\r/g, "")
    .split("\n")
    .filter((row, index, rows) => row !== "" || index < rows.length - 1)
    .forEach((line, rowOffset) => {
      const student = subjectStudents[startRow + rowOffset];
      if (!student) {
        return;
      }
      line.split("\t").forEach((value, columnOffset) => {
        const descriptor = descriptors[startColumn + columnOffset];
        if (descriptor) {
          applyGradeSheetValue(
            student.id,
            descriptor.categoryId,
            descriptor.index,
            descriptor.field,
            value.trim()
          );
        }
      });
    });
  persist();
  renderGradeSheet();
  if (studentsForSubject(subjectSelect.value).some((student) => student.id === studentSelect.value)) {
    loadCurrentSelection();
  }
  gradeSheetSaveStatus.textContent = "All changes saved";
  gradeSheetSaveStatus.classList.remove("is-saving");
}

function handleGradeSheetKeydown(event) {
  const input = event.target;
  if (!input.matches("[data-grade-sheet-cell]")) {
    return;
  }
  const row = Number(input.dataset.gridRow);
  const column = Number(input.dataset.gridCol);
  const destinations = {
    ArrowDown: [row + 1, column],
    Enter: [row + 1, column],
    ArrowUp: [row - 1, column],
    ArrowRight: [row, column + 1],
    ArrowLeft: [row, column - 1],
  };
  const destination = destinations[event.key];
  if (!destination) {
    return;
  }
  const nextInput = gradeSheetBody.querySelector(
    `[data-grid-row="${destination[0]}"][data-grid-col="${destination[1]}"]`
  );
  if (nextInput) {
    event.preventDefault();
    nextInput.focus();
  }
}

function addGradeSheetAssessment(categoryId) {
  const subject = subjectSelect.value;
  const categories = getCategories(subject);
  const category = categories.find((item) => item.id === categoryId);
  if (!category) {
    return;
  }
  const currentCount = sheetAssessmentCounts(subject, quarterSelect.value)
    .find((item) => item.id === categoryId)?.count || 0;
  const nextCount = currentCount + 1;
  setCategories(
    subject,
    categories.map((item) =>
      item.id === categoryId
        ? {
            ...item,
            assessmentCounts: {
              ...Object.fromEntries(
                QUARTERS.map((quarter) => [
                  quarter,
                  item.assessmentCounts?.[quarter] ?? item.assessmentCount,
                ])
              ),
              [quarterSelect.value]: nextCount,
            },
          }
        : item
    )
  );
  studentsForSubject(subject).forEach((student) => {
    const entry = ensureEntry(student.id, subject, quarterSelect.value);
    while (entry[categoryId].length < nextCount) {
      entry[categoryId].push({ score: "", total: "" });
    }
  });
  persist();
  renderGradeSheet();
  renderCategoryCards();
  refreshComputed();
}

function removeGradeSheetAssessment(categoryId, assessmentIndex) {
  const subject = subjectSelect.value;
  const quarter = quarterSelect.value;
  const category = getCategories(subject).find((item) => item.id === categoryId);
  const currentCount = sheetAssessmentCounts(subject, quarter)
    .find((item) => item.id === categoryId)?.count || 1;
  if (!category || currentCount <= 1) {
    return;
  }
  const assessmentNumber = assessmentIndex + 1;
  const confirmed = window.confirm(
    `Remove ${category.name} Assessment ${assessmentNumber} from ${subject}, ${quarter}? Scores in this assessment will be deleted for this quarter only.`
  );
  if (!confirmed) {
    return;
  }

  studentsForSubject(subject).forEach(({ id: studentId }) => {
    const assessments = record[studentId]?.[subject]?.[quarter]?.[categoryId];
    if (Array.isArray(assessments)) {
      assessments.splice(assessmentIndex, 1);
    }
  });

  setCategories(
    subject,
    getCategories(subject).map((item) => {
      if (item.id !== categoryId) {
        return item;
      }
      const assessmentCounts = Object.fromEntries(
        QUARTERS.map((quarterName) => [
          quarterName,
          item.assessmentCounts?.[quarterName] ?? item.assessmentCount,
        ])
      );
      assessmentCounts[quarter] = currentCount - 1;
      return { ...item, assessmentCounts };
    })
  );
  persist();
  renderGradeSheet();
  renderCategoryCards();
  refreshComputed();
}

function gradeSheetHeaders(subject, quarter) {
  const categories = sheetAssessmentCounts(subject, quarter);
  const headers = ["Student", "Grade Level", "Section"];
  categories.forEach((category) => {
    for (let index = 0; index < Math.max(1, category.count); index += 1) {
      headers.push(
        `${category.name} ${index + 1} Score`,
        `${category.name} ${index + 1} Total`
      );
    }
  });
  headers.push("Quarter Grade");
  return { categories, headers };
}

function exportGradeWorkbook() {
  downloadGradeWorkbook();
}

function downloadGradeWorkbook() {
  if (!window.XLSX) {
    throw new Error("The spreadsheet tool is unavailable. Refresh the page and try again.");
  }
  const subject = subjectSelect.value;
  const quarter = quarterSelect.value;
  const { categories, headers } = gradeSheetHeaders(subject, quarter);
  const rows = [
    headers,
    ...students.map((student) => {
      const entry = record[student.id]?.[subject]?.[quarter] || {};
      const row = [student.name, student.gradeLevel || "", student.section || ""];
      categories.forEach((category) => {
        for (let index = 0; index < Math.max(1, category.count); index += 1) {
          const item = entry[category.id]?.[index];
          row.push(item?.score ?? "", item?.total ?? "");
        }
      });
      const result = getSheetQuarterResult(student.id, subject, quarter);
      row.push(result.final === null ? "" : result.final);
      return row;
    }),
  ];
  const sheet = window.XLSX.utils.aoa_to_sheet(rows);
  sheet["!freeze"] = { xSplit: 3, ySplit: 1 };
  sheet["!cols"] = headers.map((header, index) => ({
    wch: index === 0 ? 26 : index < 3 ? 16 : Math.max(12, Math.min(header.length + 2, 20)),
  }));
  const workbook = window.XLSX.utils.book_new();
  window.XLSX.utils.book_append_sheet(
    workbook,
    sheet,
    `${subject} ${quarter}`.slice(0, 31)
  );
  const filenameSubject = subject.replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "");
  window.XLSX.writeFile(
    workbook,
    `PERFORMATRACK-${filenameSubject}-${quarter}-Grades.xlsx`
  );
}

function normalizeImportText(value) {
  return String(value ?? "").trim().replace(/\s+/g, " ").toLocaleLowerCase();
}

function normalizeStudentName(value) {
  return String(value ?? "")
    .toLocaleLowerCase()
    .replace(/[.,]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizedGradeLevel(value) {
  const text = String(value ?? "").trim();
  const numericGrade = /^(?:grade\s*)?0*(\d+)$/i.exec(text);
  return numericGrade
    ? `grade ${Number(numericGrade[1])}`
    : normalizeImportText(text);
}

function displayGradeLevel(value) {
  const text = String(value ?? "").trim();
  const numericGrade = /^(?:grade\s*)?0*(\d+)$/i.exec(text);
  return numericGrade ? `Grade ${Number(numericGrade[1])}` : text;
}

function normalizedHeader(value) {
  return String(value ?? "").toLocaleLowerCase().replace(/[^a-z0-9]/g, "");
}

function findGradeImportHeader(rows) {
  const studentNames = new Set([
    "student",
    "studentname",
    "fullname",
    "nameofstudent",
    "studentsname",
    "learner",
    "learnername",
    "name",
  ]);
  const firstNameNames = new Set(["firstname", "givenname"]);
  const surnameNames = new Set(["surname", "lastname", "familyname"]);
  const gradeNames = new Set(["gradelevel", "grade", "yearlevel"]);
  const sectionNames = new Set(["section", "class", "advisory"]);
  const subjectNames = new Set(["subject", "subjects", "course"]);
  const quarterNames = new Set(["quarter", "term", "gradingperiod", "gradingquarter"]);
  for (let rowIndex = 0; rowIndex < Math.min(rows.length, 100); rowIndex += 1) {
    const row = rows[rowIndex];
    if (!Array.isArray(row) || !row.some((cell) => String(cell ?? "").trim())) {
      continue;
    }
    const headers = row.map(normalizedHeader);
    const studentColumn = headers.findIndex((header) => studentNames.has(header));
    const firstNameColumn = headers.findIndex((header) => firstNameNames.has(header));
    const surnameColumn = headers.findIndex((header) => surnameNames.has(header));
    const hasStudentIdentity =
      studentColumn >= 0 || (firstNameColumn >= 0 && surnameColumn >= 0);
    if (!hasStudentIdentity) {
      continue;
    }
    return {
      rowIndex,
      headers: row.map((header) => String(header ?? "").trim()),
      studentColumn,
      firstNameColumn,
      surnameColumn,
      middleInitialColumn: headers.findIndex((header) =>
        ["middleinitial", "middleinitials"].includes(header)
      ),
      gradeColumn: headers.findIndex((header) => gradeNames.has(header)),
      sectionColumn: headers.findIndex((header) => sectionNames.has(header)),
      subjectColumn: headers.findIndex((header) => subjectNames.has(header)),
      quarterColumn: headers.findIndex((header) => quarterNames.has(header)),
    };
  }
  return null;
}

function categoryForGradeHeader(header, categories) {
  const normalized = normalizeImportText(header);
  const normalizedHeaderValue = normalizedHeader(header);
  const categoryMatch = categories.find((category) =>
    normalized.includes(normalizeImportText(category.name))
  );
  if (categoryMatch) {
    return categoryMatch;
  }
  const categoryAliases = [
    {
      category: categories.find((item) => /activit|written work|assignment|quiz|seatwork/i.test(item.name)),
      patterns: /\b(activity|activities|written work|ww|quiz|quizzes|assignment|seatwork|recitation)\b/i,
    },
    {
      category: categories.find((item) => /performance|project|task/i.test(item.name)),
      patterns: /\b(performance task|performance|project|output|pt)\b/i,
    },
    {
      category: categories.find((item) => /exam|test/i.test(item.name)),
      patterns: /\b(exam|examination|test|quarterly assessment|qa)\b/i,
    },
  ];
  const alias = categoryAliases.find(
    (candidate) => candidate.category && candidate.patterns.test(normalized)
  );
  if (alias) {
    return alias.category;
  }
  if (
    /^(?:final(?:\s+(?:grade|mark|average|rating))?|quarter(?:ly)?\s+(?:grade|mark|average|rating)|q[1-4])$/i.test(normalized) ||
    /^q[1-4]$/.test(normalizedHeaderValue)
  ) {
    return { directGrade: true };
  }
  if (normalizedHeaderValue) {
    return null;
  }
  return null;
}

function findGradeImportColumns(headers, categories) {
  const importColumns = [];
  const genericColumns = [];
  const excludedHeaders =
    /^(student|student name|full name|name of student|students name|name|learner|learner name|first name|given name|middle initial|surname|last name|family name|grade level|year level|section|class|advisory|subject|subjects|course|student id|id|no|number|remarks?|rank|attendance)$/i;

  headers.forEach((header, columnIndex) => {
    const normalized = normalizeImportText(header);
    if (!normalized || excludedHeaders.test(normalized)) {
      return;
    }

    let matchedExplicit = false;
    categories.forEach((category) => {
      const categoryName = normalizeImportText(category.name);
      const escapedName = categoryName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const pattern = new RegExp(
        `^${escapedName}(?:\\s*[-:|]\\s*|\\s+)?(?:assessment\\s*)?(\\d+)?(?:\\s*[-:|]\\s*|\\s+)?(score|total|max(?:imum)?|points?)$`,
        "i"
      );
      const match = pattern.exec(normalized);
      if (match) {
        const field = /^(total|max(?:imum)?|points?)$/i.test(match[2])
          ? "total"
          : "score";
        importColumns.push({
          columnIndex,
          categoryId: category.id,
          index: Math.max(0, Number(match[1] || 1) - 1),
          field,
        });
        matchedExplicit = true;
      }
    });
    if (matchedExplicit) {
      return;
    }

    const category = categoryForGradeHeader(header, categories);
    const numberMatch = /(?:assessment|quiz|test|task|activity|exam|project|work|score|grade)?\s*(\d+)\s*$/i.exec(normalized);
    const scoreTotalMatch = /^(.*?)(?:\s*[-:|]\s*|\s+)(score|total|max(?:imum)?|points?)$/i.exec(normalized);
    if (scoreTotalMatch) {
      const baseHeader = scoreTotalMatch[1];
      const targetCategory = categoryForGradeHeader(baseHeader, categories);
      if (targetCategory?.id) {
        importColumns.push({
          columnIndex,
          categoryId: targetCategory.id,
          index: Math.max(0, Number(numberMatch?.[1] || 1) - 1),
          field: /^(total|max(?:imum)?|points?)$/i.test(scoreTotalMatch[2]) ? "total" : "score",
        });
        return;
      }
    }
    if (category?.id) {
      genericColumns.push({
        columnIndex,
        categoryId: category.id,
        index: Math.max(0, Number(numberMatch?.[1] || 1) - 1),
        field: "score",
      });
    } else if (category?.directGrade) {
      genericColumns.push({ columnIndex, directGrade: true });
    }
  });

  if (importColumns.length) {
    return importColumns.map((column) => {
      if (column.field !== "score") {
        return column;
      }
      const pairedTotal = importColumns.some(
        (candidate) =>
          candidate.categoryId === column.categoryId &&
          candidate.index === column.index &&
          candidate.field === "total"
      );
      return pairedTotal ? column : { ...column, implicitTotal: 100 };
    });
  }
  if (!genericColumns.length) {
    return [];
  }

  const hasAssessmentColumns = genericColumns.some((column) => column.categoryId);
  const fallbackColumns = hasAssessmentColumns
    ? genericColumns.filter((column) => column.categoryId)
    : genericColumns;
  const mapped = [];
  const nextIndexByCategory = new Map(categories.map((category) => [category.id, 0]));
  fallbackColumns.forEach((column, genericIndex) => {
    if (column.directGrade) {
      if (!hasAssessmentColumns) {
        mapped.push(column);
      }
      return;
    }
    let category = categories.find((item) => item.id === column.categoryId);
    if (!category && categories.length) {
      category = categories[Math.min(genericIndex, categories.length - 1)];
    }
    if (!category) {
      return;
    }
    const index = column.index ?? nextIndexByCategory.get(category.id) ?? 0;
    mapped.push({
      ...column,
      categoryId: category.id,
      index,
      field: column.field || "score",
      ...(column.field === "score" ? { implicitTotal: 100 } : {}),
    });
    nextIndexByCategory.set(category.id, Math.max(nextIndexByCategory.get(category.id) || 0, index + 1));
  });
  return mapped;
}

function parseImportedNumber(raw, column, studentName) {
  const text = String(raw ?? "").trim();
  if (!text) {
    return [];
  }
  const fraction = /^(-?\d+(?:\.\d+)?)\s*\/\s*(-?\d+(?:\.\d+)?)$/.exec(text);
  if (fraction) {
    const score = Number(fraction[1]);
    const total = Number(fraction[2]);
    if (score < 0 || score > 1000 || total <= 0 || total > 1000) {
      throw new Error(`Score for ${studentName} must be between 0 and 1000 and the total must be greater than zero.`);
    }
    const fractionColumn = { ...column };
    delete fractionColumn.implicitTotal;
    return [
      { ...fractionColumn, field: "score", value: score },
      { ...fractionColumn, field: "total", value: total },
    ];
  }

  const number = Number(text.replace(/%$/, "").replace(/,/g, ""));
  if (!Number.isFinite(number) || number < 0 || number > 1000) {
    throw new Error(`Grade for ${studentName} must be a number from 0 to 1000.`);
  }
  if (column.directGrade) {
    return categoriesForCurrentSubject().map((category) => ({
      categoryId: category.id,
      index: 0,
      field: "score",
      value: number,
      implicitTotal: 100,
    }));
  }
  return [{
    ...column,
    field: column.field || "score",
    value: number,
    ...(column.implicitTotal ? { implicitTotal: 100 } : {}),
  }];
}

function categoriesForCurrentSubject() {
  return getCategories(subjectSelect.value);
}

function importedRosterStudent(name, gradeLevel, section) {
  if (!gradeLevel || !section) {
    return null;
  }
  const trimmedName = String(name || "").trim();
  let firstName = "";
  let middleInitial = "";
  let surname = "";
  if (trimmedName.includes(",")) {
    const [surnamePart, givenPart] = trimmedName.split(",", 2).map((part) => part.trim());
    const givenNames = givenPart.split(/\s+/).filter(Boolean);
    firstName = givenNames.shift() || "";
    middleInitial = givenNames.length ? givenNames.join(" ") : "";
    surname = surnamePart;
  } else {
    const nameParts = trimmedName.split(/\s+/).filter(Boolean);
    firstName = nameParts.shift() || "";
    if (nameParts.length > 1 && /^[a-z]\.?$/i.test(nameParts[0])) {
      middleInitial = nameParts.shift().replace(/\./g, "");
    }
    surname = nameParts.join(" ");
  }
  if (!firstName || !surname) {
    return null;
  }
  const normalizedName = [firstName, middleInitial, surname].filter(Boolean).join(" ");
  return {
    name: normalizedName,
    firstName,
    surname,
    middleInitial,
    gradeLevel: displayGradeLevel(gradeLevel),
    section,
    subjects: [subjectSelect.value],
  };
}

function parseGradeWorkbook(rows) {
  const header = findGradeImportHeader(rows);
  if (!header) {
    if (!rows.some((row) => Array.isArray(row) && row.some((cell) => String(cell ?? "").trim()))) {
      throw new Error("The selected spreadsheet is empty.");
    }
    throw new Error("Could not find student columns. Add Student (or Student Name), or separate First Name and Surname columns to the header row.");
  }
  const {
    rowIndex: headerIndex,
    headers,
    studentColumn: nameColumn,
    firstNameColumn,
    surnameColumn,
    middleInitialColumn,
    gradeColumn,
    sectionColumn,
    subjectColumn,
    quarterColumn,
  } = header;
  if (headerIndex < 0) {
    throw new Error("The selected spreadsheet is empty.");
  }

  const categories = getCategories(subjectSelect.value);
  const importColumns = findGradeImportColumns(headers, categories);
  if (!importColumns.length) {
    throw new Error(`No grade columns were found. Include student names and assessment columns such as Quiz 1, Performance Task 1, Exam 1, or columns like Activities 1 Score and Activities 1 Total.`);
  }

  const seen = new Set();
  const valid = [];
  const issues = [];
  rows.slice(headerIndex + 1).forEach((row, index) => {
    if (!Array.isArray(row) || !row.some((cell) => String(cell ?? "").trim())) {
      return;
    }
    const rowNumber = headerIndex + index + 2;
    if (
      subjectColumn >= 0 &&
      normalizeImportText(row[subjectColumn]) &&
      normalizeImportText(row[subjectColumn]) !== normalizeImportText(subjectSelect.value)
    ) {
      return;
    }
    if (quarterColumn >= 0 && normalizeImportText(row[quarterColumn])) {
      const quarterMatch = /\b(?:q|quarter|term)\s*([1-4])\b/i.exec(String(row[quarterColumn]));
      const rowQuarter = normalizeImportText(
        quarterMatch ? `Q${quarterMatch[1]}` : row[quarterColumn]
      );
      if (rowQuarter !== normalizeImportText(quarterSelect.value)) {
        return;
      }
    }
    const name = nameColumn >= 0
      ? String(row[nameColumn] ?? "").trim()
      : [
          row[firstNameColumn],
          middleInitialColumn < 0 ? "" : row[middleInitialColumn],
          row[surnameColumn],
        ]
          .map((part) => String(part ?? "").trim())
          .filter(Boolean)
          .join(" ");
    const gradeValue = gradeColumn < 0 ? "" : String(row[gradeColumn] ?? "").trim();
    const sectionValue = sectionColumn < 0 ? "" : String(row[sectionColumn] ?? "").trim();
    const grade = normalizeImportText(gradeValue);
    const section = normalizeImportText(sectionValue);
    const normalizedName = normalizeStudentName(name);
    const nameTokens = normalizedName.split(" ").filter(Boolean).sort().join(" ");
    const matchingStudents = students.filter((student) => {
      const normalizedRosterName = normalizeStudentName(student.name);
      const reversedRosterName = normalizeStudentName(
        [student.surname, student.firstName, student.middleInitial]
          .filter(Boolean)
          .join(" ")
      );
      const firstLastName = normalizeStudentName(
        [student.firstName, student.surname].filter(Boolean).join(" ")
      );
      const rosterNames = [normalizedRosterName, reversedRosterName, firstLastName];
      const nameMatches = rosterNames.some(
        (candidate) =>
          candidate === normalizedName ||
          candidate.split(" ").filter(Boolean).sort().join(" ") === nameTokens
      );
      return nameMatches &&
        (!grade || normalizedGradeLevel(student.gradeLevel) === normalizedGradeLevel(gradeValue)) &&
        (!section || normalizeImportText(student.section) === section);
    });
    const matches = matchingStudents.filter((student) =>
      PT.getStudentSubjects(student.id).includes(subjectSelect.value)
    );
    if (matchingStudents.length && !matches.length) {
      issues.push(
        `Row ${rowNumber}: ${name} is not enrolled in ${subjectSelect.value}, so this teacher cannot import grades for this student in that subject.`
      );
      return;
    }
    if (matches.length > 1) {
      issues.push(
        `Row ${rowNumber}: student match is ambiguous for "${name}".`
      );
      return;
    }
    const matchedStudent = matches[0] || null;
    const rosterStudent = matchedStudent
      ? null
      : importedRosterStudent(name, gradeValue, sectionValue);
    if (!matchedStudent && !rosterStudent) {
      issues.push(
        `Row ${rowNumber}: "${name}" is not in the roster. To add new students here, include Grade Level and Section and use a first and last name.`
      );
      return;
    }
    const studentName = matchedStudent?.name || rosterStudent.name;
    const studentKey = matchedStudent?.id ||
      `new:${normalizeStudentName(studentName)}|${grade}|${section}`;
    if (seen.has(studentKey)) {
      issues.push(`Row ${rowNumber}: ${studentName} appears more than once in the file.`);
      return;
    }
    const values = [];
    for (const column of importColumns) {
      const raw = String(row[column.columnIndex] ?? "").trim();
      if (!raw) {
        continue;
      }
      try {
        values.push(...parseImportedNumber(raw, column, studentName));
      } catch (error) {
        issues.push(`Row ${rowNumber}: ${error.message}`);
        return;
      }
    }
    if (!values.length && !rosterStudent) {
      issues.push(`Row ${rowNumber}: no score values were provided for ${studentName}.`);
      return;
    }
    seen.add(studentKey);
    valid.push({
      studentId: matchedStudent?.id || "",
      studentName,
      rosterStudent,
      values,
      rowNumber,
    });
  });
  if (!valid.length && !issues.length) {
    throw new Error("No student grade rows were found below the header.");
  }
  return { valid, issues };
}

function renderGradeImportMapping(rows) {
  pendingWorkbookRows = rows;
  const nonemptyRows = rows
    .slice(0, 100)
    .map((row, rowIndex) => ({ row, rowIndex }))
    .filter(({ row }) => Array.isArray(row) && row.some((cell) => String(cell ?? "").trim()));
  if (!nonemptyRows.length) {
    throw new Error("The selected spreadsheet is empty.");
  }

  const detectedHeader = findGradeImportHeader(rows);
  const headerCandidate = detectedHeader
    ? detectedHeader.rowIndex
    : nonemptyRows.reduce((best, current) =>
        current.row.filter((cell) => String(cell ?? "").trim()).length >
        best.row.filter((cell) => String(cell ?? "").trim()).length
          ? current
          : best
      ).rowIndex;
  gradeImportHeaderRow.innerHTML = nonemptyRows
    .map(({ row, rowIndex }) => {
      const preview = row
        .slice(0, 3)
        .map((cell) => String(cell ?? "").trim())
        .filter(Boolean)
        .join(" | ");
      return `<option value="${rowIndex}">Row ${rowIndex + 1}: ${escapeHtml(preview || "(blank)")}</option>`;
    })
    .join("");
  gradeImportHeaderRow.value = String(headerCandidate);
  renderGradeImportMappingColumns(detectedHeader);
}

function renderGradeImportMappingColumns(detectedHeader = null) {
  const headerIndex = Number(gradeImportHeaderRow.value);
  const headers = pendingWorkbookRows[headerIndex] || [];
  const normalizedHeaders = headers.map(normalizedHeader);
  const columnOptions = headers
    .map((header, columnIndex) => {
      const label = String(header ?? "").trim() || `Column ${columnIndex + 1}`;
      return `<option value="${columnIndex}">${escapeHtml(label)}</option>`;
    })
    .join("");
  const optionalColumnOptions = `<option value="-1">Do not use</option>${columnOptions}`;
  gradeImportStudentColumn.innerHTML = `<option value="-1">Do not use</option>${columnOptions}`;
  gradeImportFirstNameColumn.innerHTML = optionalColumnOptions;
  gradeImportSurnameColumn.innerHTML = optionalColumnOptions;
  gradeImportMiddleColumn.innerHTML = optionalColumnOptions;
  gradeImportGradeColumn.innerHTML = optionalColumnOptions;
  gradeImportSectionColumn.innerHTML = optionalColumnOptions;
  gradeImportSubjectColumn.innerHTML = optionalColumnOptions;
  gradeImportQuarterColumn.innerHTML = optionalColumnOptions;
  const identity = detectedHeader?.rowIndex === headerIndex
    ? detectedHeader
    : findGradeImportHeader([headers]);
  const nameColumn = identity?.studentColumn >= 0
    ? identity.studentColumn
    : identity?.firstNameColumn >= 0 && identity?.surnameColumn >= 0
      ? -1
      : headers.findIndex((cell) => String(cell ?? "").trim());
  gradeImportStudentColumn.value = String(nameColumn);
  gradeImportFirstNameColumn.value = String(identity?.firstNameColumn ?? -1);
  gradeImportSurnameColumn.value = String(identity?.surnameColumn ?? -1);
  gradeImportMiddleColumn.value = String(identity?.middleInitialColumn ?? -1);
  gradeImportGradeColumn.value = String(
    identity?.gradeColumn >= 0
      ? identity.gradeColumn
      : normalizedHeaders.findIndex((header) => ["gradelevel", "grade", "yearlevel"].includes(header))
  );
  gradeImportSectionColumn.value = String(
    identity?.sectionColumn >= 0
      ? identity.sectionColumn
      : normalizedHeaders.findIndex((header) => ["section", "class", "advisory"].includes(header))
  );
  gradeImportSubjectColumn.value = String(
    identity?.subjectColumn >= 0
      ? identity.subjectColumn
      : normalizedHeaders.findIndex((header) => ["subject", "subjects", "course"].includes(header))
  );
  gradeImportQuarterColumn.value = String(
    identity?.quarterColumn >= 0
      ? identity.quarterColumn
      : normalizedHeaders.findIndex((header) => ["quarter", "term", "gradingperiod", "gradingquarter"].includes(header))
  );

  const categories = categoriesForCurrentSubject();
  const categoryOptions = [
    '<option value="skip">Ignore this column</option>',
    ...categories.map((category) =>
      `<option value="${escapeHtml(category.id)}">${escapeHtml(category.name)}</option>`
    ),
    '<option value="directGrade">Quarter grade (used only without assessments)</option>',
  ].join("");
  const sampleRow = pendingWorkbookRows
    .slice(headerIndex + 1)
    .find((row) => Array.isArray(row) && row.some((cell) => String(cell ?? "").trim())) || [];
  gradeImportMappingBody.innerHTML = headers
    .map((header, columnIndex) => {
      if (
        [
          Number(gradeImportStudentColumn.value),
          Number(gradeImportFirstNameColumn.value),
          Number(gradeImportSurnameColumn.value),
          Number(gradeImportMiddleColumn.value),
          Number(gradeImportGradeColumn.value),
          Number(gradeImportSectionColumn.value),
          Number(gradeImportSubjectColumn.value),
          Number(gradeImportQuarterColumn.value),
        ]
          .includes(columnIndex)
      ) {
        return "";
      }
      const headerText = String(header ?? "").trim() || `Column ${columnIndex + 1}`;
      const inferred = categoryForGradeHeader(headerText, categories);
      const assessmentMatch = /(\d+)\s*$/.exec(headerText);
      const assessmentIndex = Number(assessmentMatch?.[1] || 1);
      return `
        <tr data-import-column="${columnIndex}">
          <td>${escapeHtml(headerText)}</td>
          <td class="grade-import-mapping-sample">${escapeHtml(sampleRow[columnIndex] ?? "")}</td>
          <td><select class="form-select form-select-sm" data-import-category>${categoryOptions}</select></td>
          <td><input class="form-control form-control-sm" type="number" data-import-assessment min="1" max="100" value="${assessmentIndex}" aria-label="Assessment number for ${escapeHtml(headerText)}" /></td>
          <td>
            <select class="form-select form-select-sm" data-import-field aria-label="Value type for ${escapeHtml(headerText)}">
              <option value="score">Score</option>
              <option value="total">Out of / Total</option>
            </select>
          </td>
        </tr>
      `;
    })
    .join("");

  gradeImportMappingBody.querySelectorAll("[data-import-column]").forEach((row) => {
    const columnIndex = Number(row.dataset.importColumn);
    const headerText = String(headers[columnIndex] ?? "").trim();
    const inferred = categoryForGradeHeader(headerText, categories);
    row.querySelector("[data-import-category]").value = inferred?.directGrade
      ? "directGrade"
      : inferred?.id || "skip";
    row.querySelector("[data-import-field]").value =
      /\b(total|max(?:imum)?|out of|points?)\b/i.test(headerText) ? "total" : "score";
  });
}

function selectedGradeImportHeader() {
  const rowIndex = Number(gradeImportHeaderRow.value);
  const header = findGradeImportHeader([pendingWorkbookRows[rowIndex]]);
  return header ? { ...header, rowIndex } : null;
}

function parseMappedGradeWorkbook() {
  const headerIndex = Number(gradeImportHeaderRow.value);
  const sourceHeaders = pendingWorkbookRows[headerIndex];
  if (!sourceHeaders) {
    throw new Error("Choose the row that contains your spreadsheet's column names.");
  }
  const studentColumn = Number(gradeImportStudentColumn.value);
  const firstNameColumn = Number(gradeImportFirstNameColumn.value);
  const surnameColumn = Number(gradeImportSurnameColumn.value);
  const middleColumn = Number(gradeImportMiddleColumn.value);
  const hasFullName = Number.isInteger(studentColumn) && studentColumn >= 0;
  const hasSplitName = firstNameColumn >= 0 && surnameColumn >= 0;
  if (!hasFullName && !hasSplitName) {
    throw new Error("Choose a full student-name column, or both first-name and surname columns.");
  }

  const mappedRows = pendingWorkbookRows.map((row) => Array.isArray(row) ? row.slice() : []);
  const mappedHeaders = Array(sourceHeaders.length).fill("");
  if (hasFullName) {
    mappedHeaders[studentColumn] = "Student Name";
  } else {
    mappedHeaders[firstNameColumn] = "First Name";
    mappedHeaders[surnameColumn] = "Surname";
    if (middleColumn >= 0) {
      mappedHeaders[middleColumn] = "Middle Initial";
    }
  }
  const gradeColumn = Number(gradeImportGradeColumn.value);
  const sectionColumn = Number(gradeImportSectionColumn.value);
  const subjectColumn = Number(gradeImportSubjectColumn.value);
  const quarterColumn = Number(gradeImportQuarterColumn.value);
  const selectedIdentityColumns = [
    studentColumn,
    ...(hasFullName ? [] : [firstNameColumn, surnameColumn, middleColumn]),
    gradeColumn,
    sectionColumn,
    subjectColumn,
    quarterColumn,
  ].filter((column) => column >= 0);
  if (new Set(selectedIdentityColumns).size !== selectedIdentityColumns.length) {
    throw new Error("Choose a different spreadsheet column for each student or class detail.");
  }
  if (gradeColumn >= 0) {
    mappedHeaders[gradeColumn] = "Grade Level";
  }
  if (sectionColumn >= 0) {
    mappedHeaders[sectionColumn] = "Section";
  }
  if (subjectColumn >= 0) {
    mappedHeaders[subjectColumn] = "Subject";
  }
  if (quarterColumn >= 0) {
    mappedHeaders[quarterColumn] = "Quarter";
  }
  const categories = categoriesForCurrentSubject();
  gradeImportMappingBody.querySelectorAll("[data-import-column]").forEach((row) => {
    const columnIndex = Number(row.dataset.importColumn);
    if (selectedIdentityColumns.includes(columnIndex)) {
      return;
    }
    const categoryId = row.querySelector("[data-import-category]").value;
    if (categoryId === "skip") {
      return;
    }
    const field = row.querySelector("[data-import-field]").value;
    if (categoryId === "directGrade") {
      mappedHeaders[columnIndex] = "Final Grade";
      return;
    }
    const category = categories.find((item) => item.id === categoryId);
    const assessmentIndex = Number(row.querySelector("[data-import-assessment]").value);
    if (!category || !Number.isInteger(assessmentIndex) || assessmentIndex < 1) {
      throw new Error("Choose a category and valid assessment number for each mapped grade column.");
    }
    mappedHeaders[columnIndex] = `${category.name} ${assessmentIndex} ${field === "total" ? "Total" : "Score"}`;
  });
  mappedRows[headerIndex] = mappedHeaders;
  return parseGradeWorkbook(mappedRows);
}

function showGradeImportPreview(valid, issues) {
  pendingGradeImport = valid;
  gradeImportMappingToggle.classList.toggle("d-none", !pendingWorkbookRows.length);
  const scoreCount = valid.reduce((sum, row) => sum + row.values.length, 0);
  const newStudentCount = valid.filter((row) => row.rosterStudent).length;
  gradeImportPreviewSummary.textContent =
    `${valid.length} student${valid.length === 1 ? "" : "s"}, ${scoreCount} score field${scoreCount === 1 ? "" : "s"}${newStudentCount ? `, and ${newStudentCount} new roster student${newStudentCount === 1 ? "" : "s"}` : ""} ready to import.`;
  gradeImportOverwriteNotice.textContent =
    `This imports into ${subjectSelect.value}, ${quarterSelect.options[quarterSelect.selectedIndex].text}. Unmatched students with grade and section details will be added to your roster. Filled spreadsheet cells replace matching saved values; blank cells leave existing grades unchanged.`;
  gradeImportError.classList.add("d-none");
  gradeImportPreviewBody.innerHTML = valid
    .slice(0, 30)
    .map((row) => `<tr><td>${escapeHtml(row.studentName)}</td><td>${row.values.length}</td><td>${row.rosterStudent ? "New student" : "In roster"}</td></tr>`)
    .join("");
  if (valid.length > 30) {
    gradeImportPreviewBody.insertAdjacentHTML(
      "beforeend",
      `<tr><td colspan="3" class="text-center text-muted">And ${valid.length - 30} more students</td></tr>`
    );
  }
  gradeImportIssueList.innerHTML = issues
    .slice(0, 30)
    .map((issue) => `<li>${escapeHtml(issue)}</li>`)
    .join("");
  gradeImportIssueList.classList.toggle("d-none", issues.length === 0);
  confirmGradeImportBtn.disabled = valid.length === 0;
  confirmGradeImportBtn.textContent = newStudentCount
    ? `Add ${newStudentCount} & import grades`
    : `Import ${valid.length} student${valid.length === 1 ? "" : "s"}`;
  gradeImportPreviewModal.show();
}

function invalidateGradeImportPreview() {
  pendingGradeImport = [];
  gradeImportPreviewSummary.textContent =
    "Column mappings changed. Preview again before importing.";
  gradeImportPreviewBody.innerHTML = "";
  gradeImportIssueList.innerHTML = "";
  gradeImportIssueList.classList.add("d-none");
  gradeImportError.classList.add("d-none");
  confirmGradeImportBtn.disabled = true;
  confirmGradeImportBtn.textContent = "Preview mapped grades first";
}

async function inspectGradeWorkbook(file) {
  if (!file) {
    return;
  }
  try {
    if (file.size > 5 * 1024 * 1024) {
      throw new Error("The file is too large. Choose a spreadsheet under 5 MB.");
    }
    if (!window.XLSX) {
      throw new Error("The spreadsheet tool did not load. Refresh the page and try again.");
    }
    const workbook = window.XLSX.read(await file.arrayBuffer(), {
      type: "array",
      cellDates: false,
    });
    if (!workbook.SheetNames.length) {
      throw new Error("The workbook has no worksheets.");
    }
    const sourceName = `${file.name} ${workbook.SheetNames.length === 1 ? workbook.SheetNames[0] : ""}`;
    const sourceQuarter = /\b(?:Q|Quarter|Term)\s*([1-4])\b/i.exec(sourceName);
    let selectionChanged = false;
    if (sourceQuarter) {
      quarterSelect.value = `Q${sourceQuarter[1]}`;
      selectionChanged = true;
    }
    const sourceSubject = SUBJECTS.find((subject) =>
      sourceName.toLocaleLowerCase().includes(subject.toLocaleLowerCase())
    );
    if (sourceSubject && Array.from(subjectSelect.options).some((option) => option.value === sourceSubject)) {
      subjectSelect.value = sourceSubject;
      selectionChanged = true;
    }
    if (selectionChanged) {
      loadCurrentSelection();
    }
    let parsedWorkbook = null;
    let parseError = null;
    let mappingRows = [];
    let mappingScore = 0;
    let hasContextMatchedSheet = false;
    for (const sheetName of workbook.SheetNames) {
      const sheet = workbook.Sheets[sheetName];
      if (!sheet) {
        continue;
      }
      const sheetQuarterMatch = /\b(?:q|quarter|term)\s*([1-4])\b/i.exec(sheetName);
      const sheetQuarter = sheetQuarterMatch ? `Q${sheetQuarterMatch[1]}` : "";
      const sheetSubject = SUBJECTS.find((subject) =>
        sheetName.toLocaleLowerCase().includes(subject.toLocaleLowerCase())
      );
      if (
        (sheetQuarter && normalizeImportText(sheetQuarter) !== normalizeImportText(quarterSelect.value)) ||
        (sheetSubject && sheetSubject !== subjectSelect.value)
      ) {
        continue;
      }
      hasContextMatchedSheet = true;
      const rows = window.XLSX.utils.sheet_to_json(sheet, {
        header: 1,
        raw: false,
        defval: "",
        blankrows: false,
      });
      const nonemptyRows = rows.filter(
        (row) => Array.isArray(row) && row.some((cell) => String(cell ?? "").trim())
      );
      const contentScore = nonemptyRows.reduce(
        (sum, row) => sum + row.filter((cell) => String(cell ?? "").trim()).length,
        0
      );
      if (contentScore > mappingScore) {
        mappingRows = rows;
        mappingScore = contentScore;
      }
      try {
        parsedWorkbook = parseGradeWorkbook(rows);
        pendingWorkbookRows = rows;
        if (parsedWorkbook.valid.length) {
          break;
        }
        parsedWorkbook = null;
      } catch (error) {
        parseError = error;
      }
    }
    if (parsedWorkbook) {
      renderGradeImportMapping(pendingWorkbookRows);
      gradeImportMappingPanel.classList.add("d-none");
      gradeImportMappingToggle.textContent = "Map spreadsheet columns";
      showGradeImportPreview(parsedWorkbook.valid, parsedWorkbook.issues);
    } else if (mappingRows.length) {
      renderGradeImportMapping(mappingRows);
      showGradeImportPreview([], []);
      gradeImportMappingPanel.classList.remove("d-none");
      gradeImportError.textContent =
        parseError?.message || "Set the column mappings below to preview this spreadsheet.";
      gradeImportError.classList.remove("d-none");
    } else {
      throw parseError || new Error(
        hasContextMatchedSheet
          ? "Could not find a worksheet containing student grades."
          : `This workbook has no worksheet for ${subjectSelect.value}, ${quarterSelect.options[quarterSelect.selectedIndex].text}. Choose the matching subject and quarter, then import again.`
      );
    }
  } catch (error) {
    console.error("PERFORMATRACK could not read the grade spreadsheet.", error);
    pendingGradeImport = [];
    gradeImportPreviewSummary.textContent = "The spreadsheet could not be imported.";
    gradeImportOverwriteNotice.textContent = `Selected gradebook: ${subjectSelect.value}, ${quarterSelect.options[quarterSelect.selectedIndex].text}.`;
    gradeImportError.textContent = error.message || "Could not read this spreadsheet.";
    gradeImportError.classList.remove("d-none");
    gradeImportPreviewBody.innerHTML = "";
    gradeImportIssueList.classList.add("d-none");
    gradeImportMappingToggle.classList.add("d-none");
    gradeImportMappingPanel.classList.add("d-none");
    confirmGradeImportBtn.disabled = true;
    confirmGradeImportBtn.textContent = "Import grades";
    gradeImportPreviewModal.show();
  } finally {
    gradeWorkbookFile.value = "";
  }
}

async function commitGradeImport() {
  confirmGradeImportBtn.disabled = true;
  confirmGradeImportBtn.textContent = "Importing...";
  const newStudentCount = pendingGradeImport.filter((row) => row.rosterStudent).length;
  try {
    const newRows = pendingGradeImport.filter((row) => row.rosterStudent);
    if (newRows.length) {
      if (!window.ptFirebase || typeof window.ptFirebase.addStudents !== "function") {
        throw new Error("The database connection is not ready. Refresh the page and try again.");
      }
      const createdStudents = await window.ptFirebase.addStudents(
        newRows.map((row) => row.rosterStudent)
      );
      if (createdStudents.length !== newRows.length) {
        throw new Error("The roster import did not return all created students. Refresh the page before retrying.");
      }
      newRows.forEach((row, index) => {
        row.studentId = createdStudents[index].id;
        row.studentName = createdStudents[index].name;
        row.rosterStudent = null;
      });
      students = normalizeStudents([...students, ...createdStudents]);
      populateStudentOptions();
      populateSubjectOptions();
    }

    pendingGradeImport.forEach((row) => {
      const entry = ensureEntry(row.studentId, subjectSelect.value, quarterSelect.value);
      row.values.forEach(({ categoryId, index, field, value, implicitTotal }) => {
        while (entry[categoryId].length <= index) {
          entry[categoryId].push({ score: "", total: "" });
        }
        entry[categoryId][index][field] = value;
        if (implicitTotal) {
          entry[categoryId][index].total = 100;
        }
      });
    });
    persist();
    renderGradeSheet();
    loadCurrentSelection();
    gradeImportPreviewModal.hide();
    gradeSheetSaveStatus.textContent =
      `Imported grades for ${pendingGradeImport.length} student${pendingGradeImport.length === 1 ? "" : "s"}${newStudentCount ? ` and added ${newStudentCount} to the roster` : ""}.`;
    gradeSheetSaveStatus.classList.remove("is-saving");
    pendingGradeImport = [];
  } catch (error) {
    console.error("PERFORMATRACK could not import the grade spreadsheet.", error);
    gradeImportError.textContent = error.message || "The grades could not be imported.";
    gradeImportError.classList.remove("d-none");
    confirmGradeImportBtn.disabled = true;
    confirmGradeImportBtn.textContent = "Import failed — refresh before retrying";
  }
}

function refreshComputed() {
  updateComputedDisplays();
  renderSummary();
  renderGradeSheet();
}

function populateStudentOptions() {
  studentSelect.innerHTML = students.length
    ? students
        .map((student) => `<option value="${escapeHtml(student.id)}">${escapeHtml(studentLabel(student))}</option>`)
        .join("")
    : '<option value="">No students yet — add one from the teacher dashboard</option>';
  studentSelect.disabled = !students.length;
  saveGradeBtn.disabled = !students.length;
  saveNextBtn.disabled = !students.length;
  addCategoryBtn.disabled = !students.length;
}

function populateSubjectOptions() {
  const previousSubject = subjectSelect.value;
  const allowedSubjects = teacherSubjects();
  const subjects = allowedSubjects;
  subjectSelect.innerHTML = subjects.map(
    (subject) => `<option value="${escapeHtml(subject)}">${escapeHtml(subject)}</option>`
  ).join("");
  if (subjects.includes(previousSubject)) {
    subjectSelect.value = previousSubject;
  } else if (subjects.length) {
    subjectSelect.value = subjects[0];
  }
}

function loadCurrentSelection() {
  if (!students.length) {
    renderGradeSheet();
    renderWeightsBar();
    categoryCards.innerHTML =
      '<p class="score-empty">Add a student from the teacher dashboard before entering grades.</p>';
    finalGrade.textContent = "—";
    remarkEl.textContent = "No student selected";
    remarkEl.classList.remove("is-pass", "is-fail");
    resultCard.classList.remove("is-pass", "is-fail");
    resultBreakdown.innerHTML = "";
    renderSummary();
    return;
  }

  renderWeightsBar();
  renderCategoryCards();
  refreshComputed();
}

function handleScoreInput(event) {
  const input = event.target;

  if (input.classList && input.classList.contains("category-weight")) {
    handleWeightInput(input);
    return;
  }

  if (input.classList && input.classList.contains("category-name")) {
    handleNameInput(input);
    return;
  }

  if (!input.classList || !input.classList.contains("score-input")) {
    return;
  }

  const categoryId = input.getAttribute("data-cat");
  const index = Number(input.getAttribute("data-index"));
  const field = input.getAttribute("data-field");
  const entry = currentEntry();

  if (!entry[categoryId] || !entry[categoryId][index]) {
    return;
  }

  const raw = input.value.trim();
  if (raw === "") {
    entry[categoryId][index][field] = "";
  } else {
    entry[categoryId][index][field] = clampScore(Number(raw), 1000);
  }

  persist();
  updateComputedDisplays();
  renderSummary();
  renderGradeSheet();
}

function handleWeightInput(input) {
  const subject = subjectSelect.value;
  const categoryId = input.getAttribute("data-cat-weight");
  const raw = input.value.trim();
  const parsed = raw === "" ? 0 : Number(raw);
  const categories = getCategories(subject);
  const categoryWeightLimit =
    100 -
    attendanceGradeWeight() -
    categories
      .filter((category) => category.id !== categoryId)
      .reduce((sum, category) => sum + category.weight, 0);
  const value = Number.isFinite(parsed)
    ? round1(Math.min(Math.max(parsed, 0), Math.max(0, categoryWeightLimit)))
    : 0;

  const updatedCategories = categories.map((category) =>
    category.id === categoryId ? { ...category, weight: value } : category
  );
  setCategories(subject, updatedCategories);
  input.value = String(value);

  updateWeightsTotal();
  refreshComputed();
}

function handleAttendanceWeightInput(input) {
  const raw = input.value.trim();
  const parsed = raw === "" ? 0 : Number(raw);
  const weight = Number.isFinite(parsed)
    ? round1(Math.min(Math.max(parsed, 0), 10))
    : DEFAULT_ATTENDANCE_WEIGHT;
  input.value = String(weight);
  setAttendanceGradeWeight(weight);
  renderWeightsBar();
  refreshComputed();
}

function handleNameInput(input) {
  const subject = subjectSelect.value;
  const categoryId = input.getAttribute("data-cat-name");
  const name = input.value;

  const categories = getCategories(subject).map((category) =>
    category.id === categoryId ? { ...category, name } : category
  );
  setCategories(subject, categories);

  const addBtn = categoryCards.querySelector(`button[data-add="${categoryId}"]`);
  if (addBtn) {
    addBtn.textContent = `+ Add ${name || "score"}`;
  }
  refreshComputed();
}

function handleAddRow(categoryId) {
  const entry = currentEntry();
  if (!Array.isArray(entry[categoryId])) {
    entry[categoryId] = [];
  }
  entry[categoryId].push({ score: "", total: "" });
  persist();
  renderCategoryCards();
  refreshComputed();
}

function handleRemoveRow(categoryId, index) {
  const entry = currentEntry();
  if (Array.isArray(entry[categoryId])) {
    entry[categoryId].splice(index, 1);
  }
  persist();
  renderCategoryCards();
  refreshComputed();
}

function handleAddCategory() {
  const subject = subjectSelect.value;
  const categories = getCategories(subject);
  categories.push({ id: uniqueId(), name: "New category", weight: 0 });
  setCategories(subject, categories);
  renderCategoryCards();
  refreshComputed();
}

function handleRemoveCategory(categoryId) {
  const subject = subjectSelect.value;
  const categories = getCategories(subject).filter((category) => category.id !== categoryId);
  setCategories(subject, categories);
  renderCategoryCards();
  refreshComputed();
}

function handleResetCategories() {
  const subject = subjectSelect.value;
  const resetCategories = scaleCategoryWeights(
    DEFAULT_CATEGORIES,
    100 - attendanceGradeWeight()
  );
  if (resetCategories) {
    setCategories(subject, resetCategories);
  }
  loadCurrentSelection();
}

function moveToNextStudent() {
  if (!studentSelect.options.length) {
    return;
  }
  const nextIndex = (studentSelect.selectedIndex + 1) % studentSelect.options.length;
  studentSelect.selectedIndex = nextIndex;
  loadCurrentSelection();
}

function flashSaved(message) {
  saveHint.textContent = message;
  saveGradeBtn.classList.add("btn-success");
  saveGradeBtn.classList.remove("btn-primary");
  saveGradeBtn.textContent = "Saved";
  window.setTimeout(() => {
    saveGradeBtn.classList.remove("btn-success");
    saveGradeBtn.classList.add("btn-primary");
    saveGradeBtn.textContent = "Save grade";
  }, 1200);
}

[studentSelect, subjectSelect, quarterSelect].forEach((select) => {
  select.addEventListener("change", () => {
    if (select === studentSelect) {
      populateSubjectOptions();
    }
    loadCurrentSelection();
  });
});

gradeSheetBody.addEventListener("input", handleGradeSheetInput);
gradeSheetBody.addEventListener("change", flushGradeSheetPersist);
gradeSheetBody.addEventListener("paste", handleGradeSheetPaste);
gradeSheetBody.addEventListener("keydown", handleGradeSheetKeydown);
gradeSheetHead.addEventListener("click", (event) => {
  const removeAssessmentBtn = event.target.closest("[data-grade-sheet-remove]");
  if (removeAssessmentBtn) {
    removeGradeSheetAssessment(
      removeAssessmentBtn.dataset.gradeSheetRemove,
      Number(removeAssessmentBtn.dataset.gradeSheetIndex)
    );
    return;
  }
  const addAssessmentBtn = event.target.closest("[data-grade-sheet-add]");
  if (addAssessmentBtn) {
    addGradeSheetAssessment(addAssessmentBtn.dataset.gradeSheetAdd);
  }
});

document.getElementById("exportGradeWorkbookBtn").addEventListener("click", () => {
  try {
    exportGradeWorkbook();
    gradeSheetSaveStatus.textContent = "Excel workbook exported";
    gradeSheetSaveStatus.classList.remove("is-saving");
  } catch (error) {
    console.error("PERFORMATRACK could not export grades.", error);
    gradeSheetSaveStatus.textContent = error.message || "Could not export workbook.";
    gradeSheetSaveStatus.classList.add("is-saving");
  }
});

gradeImportMappingToggle.addEventListener("click", () => {
  const isHidden = gradeImportMappingPanel.classList.toggle("d-none");
  if (!isHidden) {
    invalidateGradeImportPreview();
  }
  gradeImportMappingToggle.textContent = isHidden
    ? "Map spreadsheet columns"
    : "Hide column mapping";
});

gradeImportMappingPanel.addEventListener("input", invalidateGradeImportPreview);
gradeImportMappingPanel.addEventListener("change", invalidateGradeImportPreview);

gradeImportHeaderRow.addEventListener("change", () => {
  renderGradeImportMappingColumns(selectedGradeImportHeader());
});

gradeImportApplyMapping.addEventListener("click", () => {
  invalidateGradeImportPreview();
  try {
    const parsedWorkbook = parseMappedGradeWorkbook();
    gradeImportError.classList.add("d-none");
    showGradeImportPreview(parsedWorkbook.valid, parsedWorkbook.issues);
    gradeImportMappingPanel.classList.remove("d-none");
    gradeImportMappingToggle.textContent = "Hide column mapping";
  } catch (error) {
    gradeImportError.textContent = error.message || "Could not apply these column mappings.";
    gradeImportError.classList.remove("d-none");
  }
});

gradeWorkbookFile.addEventListener("change", () => {
  inspectGradeWorkbook(gradeWorkbookFile.files[0]);
});

confirmGradeImportBtn.addEventListener("click", commitGradeImport);

categoryCards.addEventListener("input", handleScoreInput);

categoryCards.addEventListener("click", (event) => {
  const addBtn = event.target.closest("button[data-add]");
  if (addBtn) {
    handleAddRow(addBtn.getAttribute("data-add"));
    return;
  }

  const removeRowBtn = event.target.closest("button[data-remove-row]");
  if (removeRowBtn) {
    handleRemoveRow(removeRowBtn.getAttribute("data-remove-row"), Number(removeRowBtn.getAttribute("data-index")));
    return;
  }

  const removeCatBtn = event.target.closest("button[data-remove-cat]");
  if (removeCatBtn) {
    handleRemoveCategory(removeCatBtn.getAttribute("data-remove-cat"));
  }
});

weightsBar.addEventListener("click", (event) => {
  if (event.target.closest("[data-reset]")) {
    handleResetCategories();
  }
});
weightsBar.addEventListener("input", (event) => {
  if (event.target.matches("[data-cat-weight]")) {
    handleWeightInput(event.target);
  }
});
weightsBar.addEventListener("change", (event) => {
  if (event.target.matches("[data-attendance-weight]")) {
    handleAttendanceWeightInput(event.target);
  }
});

addCategoryBtn.addEventListener("click", handleAddCategory);

saveGradeBtn.addEventListener("click", () => {
  persist();
  flashSaved("Grade saved for this student.");
});

saveNextBtn.addEventListener("click", () => {
  persist();
  moveToNextStudent();
});

populateStudentOptions();
populateSubjectOptions();
renderGradeSheet();
loadCurrentSelection();
if (gradeWorkbookFile.files[0]) {
  inspectGradeWorkbook(gradeWorkbookFile.files[0]);
}
