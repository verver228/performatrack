let subjects = PT.SUBJECTS;

const studentDashboardSelect = document.getElementById("studentDashboardSelect");
const studentSelectorWrap = document.getElementById("studentSelectorWrap");
const studentPerformanceTableBody = document.getElementById("studentPerformanceTableBody");

const studentNameCard = document.getElementById("studentNameCard");
const studentMetaCard = document.getElementById("studentMetaCard");
const studentAverageCard = document.getElementById("studentAverageCard");
const studentPredictionCard = document.getElementById("studentPredictionCard");
const studentConfidenceCard = document.getElementById("studentConfidenceCard");
const studentAttendanceCard = document.getElementById("studentAttendanceCard");

let subjectBarChart;
let quarterLineChart;

const students = PT.getStudents();

const currentUser = window.ptCurrentUser || null;
const sidebarWelcome = document.getElementById("sidebarWelcome");
const parentFirstName = String(currentUser?.fullName || "").trim().split(/\s+/)[0];
if (sidebarWelcome && parentFirstName) {
  sidebarWelcome.textContent = `Welcome, ${parentFirstName}`;
}
const parentLockedStudentId =
  currentUser && currentUser.role === "parent" ? currentUser.studentId || students[0].id : null;

function fmt(value, suffix) {
  if (value === null || value === undefined) {
    return "—";
  }
  return suffix ? `${value}${suffix}` : String(value);
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function populateStudentDropdown() {
  const list = parentLockedStudentId
    ? students.filter((student) => student.id === parentLockedStudentId)
    : students;

  studentDashboardSelect.innerHTML = list
    .map(
      (student) =>
        `<option value="${escapeHtml(student.id)}">${escapeHtml(student.name)} - ${escapeHtml(student.gradeLevel)}, ${escapeHtml(student.section)}</option>`
    )
    .join("");
}

function renderPerformanceTable(grades) {
  studentPerformanceTableBody.innerHTML = subjects
    .map((subject) => {
      const scores = grades[subject];
      const avg = PT.average(scores);
      return `
        <tr>
          <td>${escapeHtml(subject)}</td>
          <td>${fmt(scores[0])}</td>
          <td>${fmt(scores[1])}</td>
          <td>${fmt(scores[2])}</td>
          <td>${fmt(scores[3])}</td>
          <td><strong>${avg === null ? "—" : avg.toFixed(1)}</strong></td>
        </tr>
      `;
    })
    .join("");
}

function renderCharts(grades) {
  const subjectAverages = subjects.map((subject) => {
    const avg = PT.average(grades[subject]);
    return avg === null ? null : Number(avg.toFixed(1));
  });
  const quarterAverages = PT.QUARTERS.map((_, index) => {
    const values = subjects.map((subject) => grades[subject][index]);
    const avg = PT.average(values);
    return avg === null ? null : Number(avg.toFixed(1));
  });

  if (subjectBarChart) {
    subjectBarChart.destroy();
  }
  if (quarterLineChart) {
    quarterLineChart.destroy();
  }

  subjectBarChart = new Chart(document.getElementById("studentSubjectBarChart"), {
    type: "bar",
    data: {
      labels: subjects,
      datasets: [
        {
          label: "Average Grade",
          data: subjectAverages,
          backgroundColor: "#811518",
          borderColor: "#ffcc00",
          borderWidth: 1,
          borderRadius: 6,
          hoverBackgroundColor: "#681014",
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
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
          beginAtZero: false,
          min: 70,
          max: 100,
          ticks: { color: "#685f58" },
          grid: { color: "rgba(129, 21, 24, 0.12)" },
        },
      },
    },
  });

  quarterLineChart = new Chart(document.getElementById("studentQuarterLineChart"), {
    type: "line",
    data: {
      labels: PT.QUARTERS,
      datasets: [
        {
          label: "Quarter Average",
          data: quarterAverages,
          borderColor: "#811518",
          backgroundColor: "rgba(255, 204, 0, 0.2)",
          fill: true,
          tension: 0.35,
          pointRadius: 4,
          pointBackgroundColor: "#ffcc00",
          pointBorderColor: "#811518",
          spanGaps: true,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
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
          beginAtZero: false,
          min: 70,
          max: 100,
          ticks: { color: "#685f58" },
          grid: { color: "rgba(129, 21, 24, 0.12)" },
        },
      },
    },
  });
}

function renderStudentDashboard(studentId) {
  const student = PT.getStudent(studentId) || students[0];
  subjects = PT.getStudentSubjects(student.id);
  const grades = PT.getSubjectGrades(student.id);
  const generalAverage = PT.getGeneralAverage(student.id);
  const attendanceRate = PT.getAttendanceRate(student.id);
  const label = PT.getLabel(generalAverage, attendanceRate);
  const prediction = PT.getNextQuarterRiskPrediction(student.id);

  studentNameCard.textContent = student.name;
  studentMetaCard.textContent = `${student.gradeLevel} - ${student.section}`;
  studentAverageCard.textContent = generalAverage === null ? "—" : generalAverage.toFixed(1);
  studentPredictionCard.textContent = prediction.available
    ? `${Math.round(prediction.probability * 100)}% average estimated below-75 risk for ${prediction.nextQuarter}`
    : "ML estimate unavailable";
  studentConfidenceCard.textContent = prediction.available
    ? `Logistic regression · ${prediction.modelSource} · trained on ${prediction.trainingExamples} quarter transitions from ${prediction.trainingStudents} students · averaged across ${prediction.forecastSubjects} subject${prediction.forecastSubjects === 1 ? "" : "s"}`
    : prediction.reason;
  document.getElementById("studentCurrentStatusCard").innerHTML =
    `Current grade status: ${PT.labelBadge(label)}`;
  studentAttendanceCard.textContent = fmt(attendanceRate, "%");

  renderPerformanceTable(grades);
  renderCharts(grades);
}

function getStudentIdFromQuery() {
  if (parentLockedStudentId) {
    return parentLockedStudentId;
  }

  const params = new URLSearchParams(window.location.search);
  const requestedId = params.get("id");

  if (!requestedId) {
    return students[0].id;
  }

  const exists = students.some((student) => student.id === requestedId);
  return exists ? requestedId : students[0].id;
}

studentDashboardSelect.addEventListener("change", (event) => {
  if (parentLockedStudentId) {
    return;
  }

  const selectedId = event.target.value;
  const params = new URLSearchParams(window.location.search);
  params.set("id", selectedId);
  const newUrl = `${window.location.pathname}?${params.toString()}`;
  window.history.replaceState({}, "", newUrl);
  renderStudentDashboard(selectedId);
});

if (parentLockedStudentId) {
  if (studentSelectorWrap) {
    studentSelectorWrap.classList.add("d-none");
  }

  document.querySelectorAll(".sidebar .nav-link").forEach((link) => {
    const href = link.getAttribute("href") || "";
    const allowed = href.startsWith("student-dashboard.html") || href === "index.html";
    if (!allowed) {
      link.classList.add("d-none");
    }
  });
}

populateStudentDropdown();
const initialStudentId = getStudentIdFromQuery();
studentDashboardSelect.value = initialStudentId;
renderStudentDashboard(initialStudentId);
