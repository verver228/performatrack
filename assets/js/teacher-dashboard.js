const studentsKey = "ptStudents";

const sidebarWelcome = document.getElementById("sidebarWelcome");
const currentUser = window.ptCurrentUser || {};
const firstName = String(currentUser.fullName || "").trim().split(/\s+/)[0];
if (sidebarWelcome && firstName) {
  sidebarWelcome.textContent = `Welcome, ${firstName}`;
}

const teacherTotalStudents = document.getElementById("teacherTotalStudents");
const teacherGradeAverage = document.getElementById("teacherGradeAverage");
const teacherAttendanceAverage = document.getElementById("teacherAttendanceAverage");
const teacherChartEmptyState = document.getElementById("teacherChartEmptyState");
const teacherPerformanceChartCanvas = document.getElementById("teacherPerformanceChart");
const riskDemoStudentSelect = document.getElementById("riskDemoStudentSelect");
const riskDemoGrade = document.getElementById("riskDemoGrade");
const riskDemoPrediction = document.getElementById("riskDemoPrediction");
const riskDemoModelInfo = document.getElementById("riskDemoModelInfo");
const riskDemoSubjects = document.getElementById("riskDemoSubjects");
const riskDemoRiskLabel = document.getElementById("riskDemoRiskLabel");
const riskDemoRiskBar = document.getElementById("riskDemoRiskBar");
const riskDemoSourceQuarter = document.getElementById("riskDemoSourceQuarter");
const riskDemoAttendance = document.getElementById("riskDemoAttendance");
const riskDemoForecastLabel = document.getElementById("riskDemoForecastLabel");
const riskDemoChartCaption = document.getElementById("riskDemoChartCaption");
const riskDemoTrendCanvas = document.getElementById("riskDemoTrendChart");
const riskDemoToggleButton = document.getElementById("riskDemoToggleButton");
const riskDemoContent = document.getElementById("riskDemoContent");
const riskDemoInputGrade = document.getElementById("riskDemoInputGrade");
const riskDemoInputTrend = document.getElementById("riskDemoInputTrend");
const riskDemoInputAttendance = document.getElementById("riskDemoInputAttendance");
const riskDemoInputGradeEffect = document.getElementById("riskDemoInputGradeEffect");
const riskDemoInputTrendEffect = document.getElementById("riskDemoInputTrendEffect");
const riskDemoInputAttendanceEffect = document.getElementById("riskDemoInputAttendanceEffect");
const riskDemoTrainingCount = document.getElementById("riskDemoTrainingCount");
const riskDemoCalculationNote = document.getElementById("riskDemoCalculationNote");
const riskDemoQuarterButtons = Array.from(
  document.querySelectorAll("[data-risk-demo-quarter]")
);
const riskDemoPreview = PT.getRiskDemoPreview();

const teacherAddStudentForm = document.getElementById("teacherAddStudentForm");
const teacherAddStudentMessage = document.getElementById("teacherAddStudentMessage");
const teacherSaveStudentBtn = document.getElementById("teacherSaveStudentBtn");
const addStudentModalElement = document.getElementById("addStudentModal");
const addStudentModal = bootstrap.Modal.getOrCreateInstance(addStudentModalElement);
const openAddStudentModalBtn = document.getElementById("openAddStudentModalBtn");
let teacherPerformanceChart;
let selectedRiskDemoQuarter = "Q2";
const studentSubjectChecklist = document.getElementById("studentSubjectChecklist");
const selectAllStudentSubjects = document.getElementById("selectAllStudentSubjects");
const teacherSubjects = Array.isArray(currentUser.teacherSubjects)
  ? [...new Set(currentUser.teacherSubjects.map((subject) => String(subject).trim()).filter(Boolean))]
  : PT.SUBJECTS.slice();
const rosterFileInput = document.getElementById("studentRosterFile");
const rosterImportError = document.getElementById("rosterImportError");
const rosterImportSuccess = document.getElementById("rosterImportSuccess");
const rosterPreview = document.getElementById("rosterPreview");
const rosterPreviewSummary = document.getElementById("rosterPreviewSummary");
const rosterPreviewIssues = document.getElementById("rosterPreviewIssues");
const rosterPreviewBody = document.getElementById("rosterPreviewBody");
const rosterIssueList = document.getElementById("rosterIssueList");
const importStudentsBtn = document.getElementById("importStudentsBtn");
const downloadRosterTemplateBtn = document.getElementById("downloadRosterTemplateBtn");
let rosterImportRows = [];

riskDemoToggleButton.addEventListener("click", () => {
  const isExpanded = riskDemoToggleButton.getAttribute("aria-expanded") === "true";
  riskDemoContent.hidden = isExpanded;
  riskDemoToggleButton.setAttribute("aria-expanded", String(!isExpanded));
  riskDemoToggleButton.textContent = isExpanded ? "Show sample data" : "Hide sample data";
});

openAddStudentModalBtn.addEventListener("click", () => addStudentModal.show());
document.querySelectorAll("[data-add-student-close]").forEach((button) => {
  button.addEventListener("click", () => addStudentModal.hide());
});

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function normalizeHeader(value) {
  return String(value || "").toLocaleLowerCase().replace(/[^a-z0-9]/g, "");
}

function rosterIdentity(student) {
  const name = student.name || [student.firstName, student.middleInitial, student.surname]
    .filter(Boolean)
    .join(" ");
  return [name, student.gradeLevel, student.section]
    .map((value) => String(value || "").trim().replace(/\s+/g, " ").toLocaleLowerCase())
    .join("|");
}

function splitRosterSubjects(value) {
  if (Array.isArray(value)) {
    return [...new Set(value.map((subject) => String(subject).trim()).filter(Boolean))];
  }
  const text = String(value || "").trim();
  return text
    ? [...new Set(text.split(/[;|,\n]/).map((subject) => subject.trim()).filter(Boolean))]
    : teacherSubjects.slice();
}

function parseRosterRows(rows) {
  const headerIndex = rows.findIndex((row) =>
    Array.isArray(row) && row.some((cell) => String(cell ?? "").trim())
  );
  if (headerIndex < 0) {
    throw new Error("The selected file is empty.");
  }

  const headers = rows[headerIndex].map(normalizeHeader);
  const findColumn = (aliases) => headers.findIndex((header) => aliases.includes(header));
  const columns = {
    surname: findColumn(["surname", "lastname", "familyname"]),
    firstName: findColumn(["firstname", "givenname"]),
    middleInitial: findColumn(["middleinitial", "middleinitials", "middlename"]),
    gradeLevel: findColumn(["gradelevel", "grade", "yearlevel"]),
    section: findColumn(["section", "class", "advisory"]),
    subjects: findColumn(["subjects", "subject"]),
  };
  const missing = ["surname", "firstName", "gradeLevel", "section"].filter(
    (column) => columns[column] < 0
  );
  if (missing.length) {
    const labels = {
      surname: "Surname",
      firstName: "First name",
      gradeLevel: "Grade Level",
      section: "Section",
    };
    throw new Error(`Missing required column${missing.length > 1 ? "s" : ""}: ${missing.map((column) => labels[column]).join(", ")}.`);
  }

  const existing = new Set(students.map(rosterIdentity));
  const seen = new Set();
  const valid = [];
  const issues = [];

  rows.slice(headerIndex + 1).forEach((row, index) => {
    const rowNumber = headerIndex + index + 2;
    if (!Array.isArray(row) || !row.some((cell) => String(cell ?? "").trim())) {
      return;
    }
    const value = (column) =>
      columns[column] < 0 ? "" : String(row[columns[column]] ?? "").trim();
    const surname = value("surname");
    const firstName = value("firstName");
    const middleInitial = value("middleInitial");
    const rawGradeLevel = value("gradeLevel");
    const gradeMatch = /^grade\s*(\d+)$/i.exec(rawGradeLevel);
    const gradeLevel = gradeMatch
      ? `Grade ${gradeMatch[1]}`
      : /^\d+$/.test(rawGradeLevel)
        ? `Grade ${rawGradeLevel}`
        : rawGradeLevel;
    const section = value("section");

    if (!surname || !firstName || !gradeLevel || !section) {
      issues.push(`Row ${rowNumber}: surname, first name, grade level, and section are required.`);
      return;
    }

    const student = {
      surname,
      firstName,
      middleInitial,
      name: [firstName, middleInitial, surname].filter(Boolean).join(" "),
      gradeLevel,
      section,
      subjects: splitRosterSubjects(value("subjects")),
    };
    const unauthorizedSubjects = student.subjects.filter(
      (subject) => !teacherSubjects.includes(subject)
    );
    if (unauthorizedSubjects.length) {
      issues.push(
        `Row ${rowNumber}: ${unauthorizedSubjects.join(", ")} ${unauthorizedSubjects.length === 1 ? "is" : "are"} not assigned to your account.`
      );
      return;
    }
    const identity = rosterIdentity(student);
    if (existing.has(identity) || seen.has(identity)) {
      issues.push(`Row ${rowNumber}: ${student.name} (${gradeLevel}, ${section}) is already in the roster or file.`);
      return;
    }
    seen.add(identity);
    valid.push({ rowNumber, student });
  });

  if (!valid.length && !issues.length) {
    throw new Error("No student rows were found below the header row.");
  }
  return { valid, issues };
}

function clearRosterPreview() {
  rosterImportRows = [];
  rosterPreview.classList.add("d-none");
  rosterPreviewBody.innerHTML = "";
  rosterIssueList.innerHTML = "";
  rosterIssueList.classList.add("d-none");
  rosterPreviewSummary.textContent = "";
  rosterPreviewIssues.textContent = "";
  importStudentsBtn.disabled = true;
  importStudentsBtn.textContent = "Import CSV/XL";
}

function showRosterImportError(message) {
  rosterImportError.textContent = message;
  rosterImportError.classList.remove("d-none");
}

function renderRosterPreview(valid, issues) {
  rosterImportRows = valid.map((entry) => entry.student);
  rosterPreviewSummary.textContent =
    `${valid.length} student${valid.length === 1 ? "" : "s"} ready to import`;
  rosterPreviewIssues.textContent = issues.length
    ? `${issues.length} row${issues.length === 1 ? "" : "s"} will be skipped`
    : "No row issues found";
  rosterPreviewBody.innerHTML = valid
    .slice(0, 20)
    .map(
      ({ rowNumber, student }) => `
        <tr>
          <td>${rowNumber}</td>
          <td>${escapeHtml(student.name)}</td>
          <td>${escapeHtml(student.gradeLevel)}</td>
          <td>${escapeHtml(student.section)}</td>
          <td>${escapeHtml(student.subjects.join(", "))}</td>
        </tr>
      `
    )
    .join("");
  if (valid.length > 20) {
    rosterPreviewBody.insertAdjacentHTML(
      "beforeend",
      `<tr><td colspan="5" class="text-muted text-center">And ${valid.length - 20} more students</td></tr>`
    );
  }
  rosterIssueList.innerHTML = issues
    .slice(0, 20)
    .map((issue) => `<li>${escapeHtml(issue)}</li>`)
    .join("");
  if (issues.length) {
    rosterIssueList.classList.remove("d-none");
  }
  rosterPreview.classList.remove("d-none");
  importStudentsBtn.disabled = valid.length === 0;
  importStudentsBtn.textContent = valid.length
    ? `Import ${valid.length} Student${valid.length === 1 ? "" : "s"}`
    : "Import CSV/XL";
}

async function inspectRosterFile(file) {
  rosterImportError.classList.add("d-none");
  rosterImportSuccess.classList.add("d-none");
  clearRosterPreview();
  if (!file) {
    return;
  }
  if (file.size > 5 * 1024 * 1024) {
    showRosterImportError("The file is too large. Choose a file under 5 MB.");
    return;
  }
  if (!/\.(xlsx|xls|csv)$/i.test(file.name)) {
    showRosterImportError("Choose an Excel (.xlsx or .xls) or CSV file.");
    return;
  }
  if (!window.XLSX) {
    showRosterImportError("The spreadsheet reader did not load. Refresh the page and try again.");
    return;
  }

  try {
    const workbook = window.XLSX.read(await file.arrayBuffer(), { type: "array" });
    const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
    if (!firstSheet) {
      throw new Error("The selected workbook has no worksheets.");
    }
    const rows = window.XLSX.utils.sheet_to_json(firstSheet, {
      header: 1,
      raw: false,
      defval: "",
      blankrows: false,
    });
    const { valid, issues } = parseRosterRows(rows);
    renderRosterPreview(valid, issues);
  } catch (error) {
    console.error("PERFORMATRACK could not read the roster file.", error);
    showRosterImportError(error.message || "Could not read this spreadsheet.");
  }
}

function downloadRosterTemplate() {
  const headers = ["Surname", "First name", "Middle Initial", "Grade Level", "Section", "Subjects"];
  const example = ["Sample", "Alex", "M", "Grade 4", "Sampaguita", teacherSubjects.join("; ")];
  const csvRow = (values) => values.map((value) => `"${value.replace(/"/g, '""')}"`).join(",");
  const csv = `${csvRow(headers)}\r\n${csvRow(example)}\r\n`;
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = "performatrack-student-roster-template.csv";
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

function renderSubjectChecklist(subjects = teacherSubjects, selectedSubjects = subjects) {
  const selected = new Set(selectedSubjects);
  studentSubjectChecklist.innerHTML = subjects
    .map(
      (subject, index) => `
        <div class="form-check">
          <input class="form-check-input student-subject-option" type="checkbox" id="studentSubject${index}" value="${escapeHtml(subject)}" ${selected.has(subject) ? "checked" : ""} />
          <label class="form-check-label" for="studentSubject${index}">${escapeHtml(subject)}</label>
        </div>
      `
    )
    .join("");
  syncSelectAllSubjects();
}

function syncSelectAllSubjects() {
  const options = Array.from(studentSubjectChecklist.querySelectorAll(".student-subject-option"));
  selectAllStudentSubjects.checked = options.length > 0 && options.every((option) => option.checked);
  selectAllStudentSubjects.indeterminate =
    options.some((option) => option.checked) && !selectAllStudentSubjects.checked;
}

renderSubjectChecklist();

function readStudents() {
  const raw = localStorage.getItem(studentsKey);
  if (!raw) {
    const seeded = PT.getStudents();
    localStorage.setItem(studentsKey, JSON.stringify(seeded));
    return seeded;
  }
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : PT.getStudents();
  } catch (error) {
    return PT.getStudents();
  }
}

let students = readStudents();

function fmtRate(value) {
  return value === null || value === undefined ? "—" : `${value}%`;
}

function buildSummaries() {
  return students.map((student) => {
    const summary = PT.getStudentSummary(student.id);
    return { ...student, ...summary };
  });
}

function renderStats(summaries) {
  teacherTotalStudents.textContent = String(students.length);
  const gradeAverage = PT.average(summaries.map((item) => item.generalAverage));
  const attendanceAverage = PT.average(summaries.map((item) => item.attendanceRate));
  teacherGradeAverage.textContent = fmtRate(gradeAverage === null ? null : Math.round(gradeAverage));
  teacherAttendanceAverage.textContent = fmtRate(attendanceAverage);
}

function renderPerformanceChart() {
  const studentQuarterAverages = students.map((student) =>
    PT.getQuarterAverages(student.id)
  );
  const quarterAverages = PT.QUARTERS.map((_, quarterIndex) =>
    PT.average(studentQuarterAverages.map((averages) => averages[quarterIndex]))
  );
  const hasGrades = quarterAverages.some((average) => average !== null);

  teacherChartEmptyState.hidden = hasGrades;
  if (teacherPerformanceChart) {
    teacherPerformanceChart.destroy();
  }

  teacherPerformanceChart = new Chart(teacherPerformanceChartCanvas, {
    type: "line",
    data: {
      labels: PT.QUARTERS,
      datasets: [
        {
          label: "Class Grade Average",
          data: quarterAverages.map((average) =>
            average === null ? null : Number(average.toFixed(1))
          ),
          borderColor: "#811518",
          backgroundColor: "rgba(255, 204, 0, 0.2)",
          pointBackgroundColor: "#ffcc00",
          pointBorderColor: "#811518",
          pointBorderWidth: 2,
          pointRadius: 5,
          pointHoverRadius: 7,
          borderWidth: 3,
          tension: 0.3,
          fill: true,
          spanGaps: false,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          labels: { color: "#685f58" },
        },
        tooltip: {
          backgroundColor: "#681014",
          titleColor: "#ffcc00",
          bodyColor: "#ffffff",
          borderColor: "#ffcc00",
          borderWidth: 1,
        },
      },
      scales: {
        x: {
          ticks: { color: "#685f58" },
          grid: { color: "rgba(129, 21, 24, 0.08)" },
        },
        y: {
          min: 0,
          max: 100,
          ticks: { color: "#685f58" },
          grid: { color: "rgba(129, 21, 24, 0.12)" },
        },
      },
    },
  });
}

function renderAll() {
  const summaries = buildSummaries();
  renderStats(summaries);
  renderPerformanceChart();
}

riskDemoPreview.students.forEach((student) => {
  const option = document.createElement("option");
  option.value = student.id;
  option.textContent = student.name;
  riskDemoStudentSelect.appendChild(option);
});
riskDemoModelInfo.textContent =
  `Model trained on ${riskDemoPreview.trainingExamples} quarter transitions from ${riskDemoPreview.trainingStudents} fictional students using grades, grade trend, and quarter attendance.`;
riskDemoTrainingCount.textContent =
  `${riskDemoPreview.trainingExamples} examples · ${riskDemoPreview.trainingStudents} students`;

function renderRiskDemoStudent(studentId, forecastQuarter = selectedRiskDemoQuarter) {
  const student = riskDemoPreview.students.find((item) => item.id === studentId);
  const forecast = student?.forecasts[forecastQuarter];
  if (!student || !forecast) {
    riskDemoGrade.textContent = "—";
    riskDemoPrediction.textContent = "—";
    riskDemoRiskLabel.textContent = "—";
    riskDemoSourceQuarter.textContent = "—";
    riskDemoAttendance.textContent = "—";
    riskDemoForecastLabel.textContent = "—";
    riskDemoSubjects.replaceChildren();
    riskDemoTrendCanvas.replaceChildren();
    return;
  }

  const riskPercent = Math.round(forecast.probability * 100);
  const riskLevel = riskPercent < 25
    ? { label: "Lower", color: "bg-success", text: "text-success" }
    : riskPercent < 60
      ? { label: "Moderate", color: "bg-warning", text: "text-warning" }
      : { label: "Higher", color: "bg-danger", text: "text-danger" };
  riskDemoGrade.textContent = `${forecast.previousQuarterAverage.toFixed(1)}%`;
  riskDemoPrediction.textContent = `${riskPercent}%`;
  riskDemoRiskLabel.textContent = `${riskLevel.label} estimated risk`;
  riskDemoRiskLabel.className = `risk-demo-risk-label ${riskLevel.text}`;
  riskDemoRiskBar.style.width = `${riskPercent}%`;
  riskDemoRiskBar.className = `progress-bar ${riskLevel.color}`;
  riskDemoRiskBar.parentElement.setAttribute("aria-valuenow", String(riskPercent));
  riskDemoSourceQuarter.textContent = forecast.previousQuarter;
  riskDemoAttendance.textContent = `${forecast.attendanceRate}%`;
  riskDemoForecastLabel.textContent =
    `${forecast.previousQuarter} grades → ${forecastQuarter} forecast`;
  riskDemoChartCaption.textContent =
    `${student.name} · grades available up to ${forecast.previousQuarter}`;
  riskDemoInputGrade.textContent = `${forecast.previousQuarterAverage.toFixed(1)}% average`;
  riskDemoInputTrend.textContent = forecast.averageGradeTrend === null
    ? "Not available yet"
    : `${forecast.averageGradeTrend > 0 ? "+" : ""}${forecast.averageGradeTrend.toFixed(1)} points`;
  riskDemoInputAttendance.textContent = `${forecast.attendanceRate}% average`;
  const gradeContribution = forecast.averageContributions[0].value;
  const trendContribution = forecast.averageContributions[1].value;
  const attendanceContribution = forecast.averageContributions[2].value;
  const describeContribution = (value) => {
    const direction = value > 0.01 ? "pushes risk up" : value < -0.01 ? "pushes risk down" : "has little effect";
    return `${value > 0 ? "+" : ""}${value.toFixed(2)} log-odds; ${direction}`;
  };
  riskDemoInputGradeEffect.textContent = describeContribution(gradeContribution);
  riskDemoInputTrendEffect.textContent = forecast.averageGradeTrend === null
    ? `No earlier quarter; missing-trend flag ${describeContribution(forecast.averageContributions[3].value)}`
    : describeContribution(trendContribution + forecast.averageContributions[3].value);
  riskDemoInputAttendanceEffect.textContent = describeContribution(attendanceContribution);
  riskDemoCalculationNote.textContent =
    `For each subject, Logistic Regression standardizes the previous grade, grade change (when available), ${forecast.previousQuarter} attendance, and whether an earlier grade exists. It multiplies these inputs by weights learned from the sample class, adds a bias, and applies the sigmoid function to produce a 0–100% estimate. The displayed ${riskPercent}% is the average of the subject estimates; input effects above are average log-odds contributions, not percentage points.`;

  riskDemoSubjects.replaceChildren();
  forecast.subjects.forEach((subject) => {
    const row = document.createElement("tr");
    const subjectCell = document.createElement("th");
    subjectCell.scope = "row";
    subjectCell.textContent = subject.subject;
    row.appendChild(subjectCell);

    const gradeCell = document.createElement("td");
    gradeCell.textContent = `${subject.previousGrade}%`;
    row.appendChild(gradeCell);

    const attendanceCell = document.createElement("td");
    attendanceCell.textContent = `${subject.attendanceRate}%`;
    row.appendChild(attendanceCell);

    const riskCell = document.createElement("td");
    const subjectRiskPercent = Math.round(subject.probability * 100);
    const riskRow = document.createElement("div");
    riskRow.className = "d-flex align-items-center gap-2";
    const progress = document.createElement("div");
    progress.className = "progress risk-demo-subject-progress flex-grow-1";
    progress.setAttribute("role", "progressbar");
    progress.setAttribute("aria-label", `${subject.subject} estimated below-75 risk`);
    progress.setAttribute("aria-valuemin", "0");
    progress.setAttribute("aria-valuemax", "100");
    progress.setAttribute("aria-valuenow", String(subjectRiskPercent));
    const progressBar = document.createElement("div");
    progressBar.className = `progress-bar ${
      subjectRiskPercent < 25 ? "bg-success" : subjectRiskPercent < 60 ? "bg-warning" : "bg-danger"
    }`;
    progressBar.style.width = `${subjectRiskPercent}%`;
    progress.appendChild(progressBar);
    const riskValue = document.createElement("strong");
    riskValue.className = "risk-demo-table-value";
    riskValue.textContent = `${subjectRiskPercent}%`;
    riskRow.append(progress, riskValue);
    riskCell.appendChild(riskRow);
    row.appendChild(riskCell);
    riskDemoSubjects.appendChild(row);
  });

  const availableQuarterCount = ["Q1", "Q2", "Q3"].indexOf(forecast.previousQuarter) + 1;
  const subjectColors = ["#811518", "#d19a00", "#426b8a"];
  renderRiskDemoChart(student, forecast, availableQuarterCount, subjectColors);
}

function renderRiskDemoChart(student, forecast, quarterCount, subjectColors) {
  const svgNamespace = "http://www.w3.org/2000/svg";
  const width = 640;
  const height = 220;
  const margin = { top: 12, right: 12, bottom: 30, left: 38 };
  const plotWidth = width - margin.left - margin.right;
  const plotHeight = height - margin.top - margin.bottom;
  const createElement = (name, attributes, text) => {
    const element = document.createElementNS(svgNamespace, name);
    Object.entries(attributes).forEach(([key, value]) => element.setAttribute(key, String(value)));
    if (text) {
      element.textContent = text;
    }
    return element;
  };
  const x = (index) => margin.left + (
    quarterCount === 1 ? plotWidth / 2 : (plotWidth * index) / (quarterCount - 1)
  );
  const y = (value) => margin.top + ((100 - value) / 50) * plotHeight;
  const svgChildren = [];

  [50, 75, 100].forEach((tick) => {
    svgChildren.push(createElement("line", {
      x1: margin.left,
      x2: width - margin.right,
      y1: y(tick),
      y2: y(tick),
      stroke: tick === 75 ? "#9b8e82" : "#eee6da",
      "stroke-dasharray": tick === 75 ? "5 4" : "none",
      "stroke-width": 1,
    }));
    svgChildren.push(createElement("text", {
      x: margin.left - 8,
      y: y(tick) + 4,
      fill: "#685f58",
      "font-size": 11,
      "text-anchor": "end",
    }, `${tick}%`));
  });

  const datasets = [
    ...Object.entries(student.gradesBySubject).map(([subject, grades], index) => ({
      label: subject,
      values: grades.slice(0, quarterCount),
      color: subjectColors[index % subjectColors.length],
      dashed: false,
    })),
    {
      label: "Attendance",
      values: student.attendanceByQuarter.slice(0, quarterCount),
      color: "#b8860b",
      dashed: true,
    },
  ];

  datasets.forEach((dataset) => {
    const points = dataset.values.map((value, index) => `${x(index)},${y(value)}`).join(" ");
    svgChildren.push(createElement("polyline", {
      points,
      fill: "none",
      stroke: dataset.color,
      "stroke-width": dataset.dashed ? 2 : 2.5,
      "stroke-dasharray": dataset.dashed ? "5 4" : "none",
      "stroke-linecap": "round",
      "stroke-linejoin": "round",
    }));
    dataset.values.forEach((value, index) => {
      svgChildren.push(createElement("circle", {
        cx: x(index),
        cy: y(value),
        r: 3.5,
        fill: "#ffffff",
        stroke: dataset.color,
        "stroke-width": 2,
      }));
    });
  });

  ["Q1", "Q2", "Q3"].slice(0, quarterCount).forEach((quarter, index) => {
    svgChildren.push(createElement("text", {
      x: x(index),
      y: height - 8,
      fill: "#685f58",
      "font-size": 11,
      "text-anchor": "middle",
    }, quarter));
  });

  riskDemoTrendCanvas.replaceChildren(...svgChildren);
  riskDemoTrendCanvas.setAttribute("viewBox", `0 0 ${width} ${height}`);
  riskDemoTrendCanvas.setAttribute("preserveAspectRatio", "none");
  riskDemoTrendCanvas.setAttribute(
    "aria-label",
    `${student.name} grade and attendance history through ${forecast.previousQuarter}; dashed line marks 75.`
  );
}

riskDemoStudentSelect.addEventListener("change", () => {
  renderRiskDemoStudent(riskDemoStudentSelect.value);
});
riskDemoQuarterButtons.forEach((button) => {
  button.addEventListener("click", () => {
    selectedRiskDemoQuarter = button.dataset.riskDemoQuarter;
    riskDemoQuarterButtons.forEach((quarterButton) => {
      const isSelected = quarterButton === button;
      quarterButton.classList.toggle("active", isSelected);
      quarterButton.setAttribute("aria-pressed", String(isSelected));
    });
    renderRiskDemoStudent(riskDemoStudentSelect.value);
  });
});
renderRiskDemoStudent(riskDemoStudentSelect.value, selectedRiskDemoQuarter);

selectAllStudentSubjects.addEventListener("change", () => {
  studentSubjectChecklist
    .querySelectorAll(".student-subject-option")
    .forEach((option) => {
      option.checked = selectAllStudentSubjects.checked;
    });
  selectAllStudentSubjects.indeterminate = false;
});

studentSubjectChecklist.addEventListener("change", syncSelectAllSubjects);

rosterFileInput.addEventListener("change", () => {
  inspectRosterFile(rosterFileInput.files[0]);
});

downloadRosterTemplateBtn.addEventListener("click", downloadRosterTemplate);

importStudentsBtn.addEventListener("click", async () => {
  rosterImportError.classList.add("d-none");
  rosterImportSuccess.classList.add("d-none");
  if (!rosterImportRows.length) {
    showRosterImportError("Choose a roster file and wait for the student preview before importing.");
    return;
  }
  importStudentsBtn.disabled = true;
  rosterFileInput.disabled = true;
  importStudentsBtn.textContent = "Saving students...";
  try {
    if (!window.ptFirebase || typeof window.ptFirebase.addStudents !== "function") {
      throw new Error("The database connection is not ready. Refresh the page and try again.");
    }
    const importedStudents = await window.ptFirebase.addStudents(rosterImportRows);
    students.push(...importedStudents);
    renderAll();
    rosterImportSuccess.textContent =
      `Successfully added ${importedStudents.length} student${importedStudents.length === 1 ? "" : "s"} to your class roster.`;
    rosterImportSuccess.classList.remove("d-none");
    rosterFileInput.value = "";
    clearRosterPreview();
  } catch (error) {
    console.error("PERFORMATRACK could not import the roster.", error);
    showRosterImportError(error.message || "The roster could not be saved. Please try again.");
    importStudentsBtn.disabled = rosterImportRows.length === 0;
  } finally {
    rosterFileInput.disabled = false;
    importStudentsBtn.textContent = rosterImportRows.length
      ? `Import ${rosterImportRows.length} Student${rosterImportRows.length === 1 ? "" : "s"}`
      : "Import CSV/XL";
  }
});

teacherAddStudentForm.addEventListener("submit", async (event) => {
  event.preventDefault();

  const surname = document.getElementById("newStudentSurname").value.trim();
  const firstName = document.getElementById("newStudentFirstName").value.trim();
  const middleInitial = document.getElementById("newStudentMiddleInitial").value.trim();
  const gradeLevel = document.getElementById("newStudentGrade").value;
  const section = document.getElementById("newStudentSection").value.trim();
  const subjects = Array.from(
    studentSubjectChecklist.querySelectorAll(".student-subject-option:checked")
  ).map((option) => option.value);

  if (!surname || !firstName || !gradeLevel || !section || !subjects.length) {
    teacherAddStudentMessage.textContent =
      "Enter the student's surname, first name, grade level, section, and select at least one subject.";
    teacherAddStudentMessage.classList.remove("d-none");
    return;
  }
  if (subjects.some((subject) => !teacherSubjects.includes(subject))) {
    teacherAddStudentMessage.textContent =
      "Students can only be assigned subjects that are assigned to your teacher account.";
    teacherAddStudentMessage.classList.remove("d-none");
    return;
  }

  const name = [firstName, middleInitial, surname].filter(Boolean).join(" ");
  teacherSaveStudentBtn.disabled = true;
  teacherSaveStudentBtn.textContent = "Saving...";
  teacherAddStudentMessage.classList.add("d-none");

  try {
    if (!window.ptFirebase || typeof window.ptFirebase.addStudent !== "function") {
      throw new Error("The database connection is not ready. Refresh the page and try again.");
    }
    const student = await window.ptFirebase.addStudent({
      name,
      surname,
      firstName,
      middleInitial,
      gradeLevel,
      section,
      subjects,
    });
    students.push(student);
    renderAll();
    teacherAddStudentForm.reset();
    renderSubjectChecklist();
    addStudentModal.hide();
  } catch (error) {
    console.error("PERFORMATRACK could not add the student to Firebase.", error);
    teacherAddStudentMessage.textContent =
      error.code
        ? `Database error (${error.code}): ${error.message || "The student could not be saved."}`
        : error.message || "The student could not be saved. Please try again.";
    teacherAddStudentMessage.classList.remove("d-none");
  } finally {
    teacherSaveStudentBtn.disabled = false;
    teacherSaveStudentBtn.textContent = "Save";
  }
});

renderAll();
window.ptTeacherDashboardReady = true;
const pendingRosterFile = window.ptPendingRosterFile;
window.ptPendingRosterFile = null;
if (pendingRosterFile && rosterFileInput.files.length) {
  inspectRosterFile(rosterFileInput.files[0]);
}
