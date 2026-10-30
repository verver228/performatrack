const reportsSummaryBody = document.getElementById("reportsSummaryBody");
const exportPdfBtn = document.getElementById("exportPdfBtn");

let sectionChart;

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function buildSectionSummary() {
  const students = PT.getStudents();
  const sections = new Map();

  students.forEach((student) => {
    const sectionName = student.section || "—";
    if (!sections.has(sectionName)) {
      sections.set(sectionName, { section: sectionName, grades: [], attendance: [], atRisk: 0, count: 0 });
    }

    const bucket = sections.get(sectionName);
    bucket.count += 1;

    const summary = PT.getStudentSummary(student.id);
    if (summary.generalAverage !== null) {
      bucket.grades.push(summary.generalAverage);
    }
    if (summary.attendanceRate !== null) {
      bucket.attendance.push(summary.attendanceRate);
    }
    if (summary.label === "At Risk") {
      bucket.atRisk += 1;
    }
  });

  return Array.from(sections.values())
    .map((bucket) => ({
      section: bucket.section,
      students: bucket.count,
      averageGrade: PT.average(bucket.grades),
      attendanceRate: PT.average(bucket.attendance),
      atRiskCount: bucket.atRisk,
    }))
    .sort((a, b) => a.section.localeCompare(b.section));
}

function renderSummaryTable(summary) {
  if (!summary.length) {
    reportsSummaryBody.innerHTML = `<tr><td colspan="5" class="text-muted text-center py-3">No student data yet.</td></tr>`;
    return;
  }

  reportsSummaryBody.innerHTML = summary
    .map(
      (row) => `
        <tr>
          <td>${escapeHtml(row.section)}</td>
          <td>${row.students}</td>
          <td>${row.averageGrade === null ? "—" : row.averageGrade.toFixed(1)}</td>
          <td>${row.attendanceRate === null ? "—" : `${Math.round(row.attendanceRate)}%`}</td>
          <td>${row.atRiskCount}</td>
        </tr>
      `
    )
    .join("");
}

function renderSectionBarChart(summary) {
  const ctx = document.getElementById("sectionAverageBarChart");

  if (sectionChart) {
    sectionChart.destroy();
  }

  sectionChart = new Chart(ctx, {
    type: "bar",
    data: {
      labels: summary.map((item) => item.section),
      datasets: [
        {
          label: "Section Average",
          data: summary.map((item) => (item.averageGrade === null ? null : Number(item.averageGrade.toFixed(1)))),
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
}

exportPdfBtn.addEventListener("click", () => {
  // Uses the browser's built-in print dialog (Save as PDF) — works offline.
  window.print();
});

const summary = buildSectionSummary();
renderSummaryTable(summary);
renderSectionBarChart(summary);
