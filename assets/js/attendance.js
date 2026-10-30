const DEFAULT_RECORDS = [];

const STUDENTS_KEY = "ptStudents";
const ATTENDANCE_KEY = "ptAttendanceRecords";

const STATUS_VALUES = ["Present", "Late", "Excused", "Absent"];
const STATUS_POINTS = {
  Present: 1,
  Late: 0.75,
  Excused: 0.8,
  Absent: 0,
};

const attendanceDate = document.getElementById("attendanceDate");
const todayBtn = document.getElementById("todayBtn");
const markAllPresentBtn = document.getElementById("markAllPresentBtn");
const clearDayBtn = document.getElementById("clearDayBtn");
const attendanceSummary = document.getElementById("attendanceSummary");
const rollCallBody = document.getElementById("rollCallBody");
const rollCallDateLabel = document.getElementById("rollCallDateLabel");
const markedCountLabel = document.getElementById("markedCountLabel");
const attendanceFormMessage = document.getElementById("attendanceFormMessage");

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

function normalizeStudents(rawStudents) {
  if (!Array.isArray(rawStudents)) {
    return [];
  }

  return rawStudents
    .map((student) => ({
      id: String(student.id || "").trim(),
      name: String(student.name || "").trim(),
      gradeLevel: String(student.gradeLevel || "").trim(),
      section: String(student.section || "").trim(),
    }))
    .filter((student) => student.id && student.name);
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function normalizeRecords(rawRecords) {
  if (!Array.isArray(rawRecords) || !rawRecords.length) {
    return [...DEFAULT_RECORDS];
  }

  return rawRecords
    .map((record) => ({
      date: String(record.date || "").slice(0, 10),
      studentId: String(record.studentId || "").trim(),
      status: STATUS_VALUES.includes(record.status) ? record.status : "Absent",
    }))
    .filter((record) => record.date && record.studentId);
}

const students = normalizeStudents(safeRead(STUDENTS_KEY, []));
let attendanceRecords = normalizeRecords(safeRead(ATTENDANCE_KEY, DEFAULT_RECORDS));
let selectedDate = "";

function persist() {
  localStorage.setItem(ATTENDANCE_KEY, JSON.stringify(attendanceRecords));
}

function toISODate(date) {
  const offset = date.getTimezoneOffset();
  return new Date(date.getTime() - offset * 60000).toISOString().slice(0, 10);
}

function formatDateLabel(iso) {
  if (!iso) {
    return "";
  }
  const parts = iso.split("-");
  const date = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
  if (Number.isNaN(date.getTime())) {
    return iso;
  }
  return date.toLocaleDateString(undefined, {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

function getStatusFor(date, studentId) {
  const match = attendanceRecords.find(
    (record) => record.date === date && record.studentId === studentId
  );
  return match ? match.status : "";
}

function setStatusFor(date, studentId, status) {
  const index = attendanceRecords.findIndex(
    (record) => record.date === date && record.studentId === studentId
  );

  if (!status) {
    if (index !== -1) {
      attendanceRecords.splice(index, 1);
    }
    return;
  }

  if (index === -1) {
    attendanceRecords.push({ date, studentId, status });
  } else {
    attendanceRecords[index].status = status;
  }
}

function getAttendanceRate(studentId) {
  const records = attendanceRecords.filter((record) => record.studentId === studentId);
  if (!records.length) {
    return null;
  }

  const earned = records.reduce(
    (sum, record) => sum + (STATUS_POINTS[record.status] ?? 0),
    0
  );
  return (earned / records.length) * 100;
}

function rateClass(rate) {
  if (rate === null) {
    return "text-muted";
  }
  if (rate >= 90) {
    return "text-success fw-semibold";
  }
  if (rate >= 80) {
    return "text-warning fw-semibold";
  }
  return "text-danger fw-semibold";
}

function setMessage(text, tone = "muted") {
  attendanceFormMessage.textContent = text;
  attendanceFormMessage.className = `small mt-2 mb-0 text-${tone}`;
}

function renderRollCall() {
  rollCallDateLabel.textContent = selectedDate ? `— ${formatDateLabel(selectedDate)}` : "";

  if (!students.length) {
    rollCallBody.innerHTML =
      '<tr><td colspan="3" class="text-center text-muted py-4">No students yet. Add students from the dashboard.</td></tr>';
    markedCountLabel.textContent = "";
    return;
  }

  rollCallBody.innerHTML = students
    .map((student) => {
      const current = getStatusFor(selectedDate, student.id);
      const rate = getAttendanceRate(student.id);
      const rateText = rate === null ? "—" : `${rate.toFixed(1)}%`;

      const buttons = STATUS_VALUES.map((status) => {
        const active = current === status ? " is-active" : "";
        return `<button type="button" class="status-btn s-${status.toLowerCase()}${active}" data-student="${escapeHtml(student.id)}" data-status="${status}">${status}</button>`;
      }).join("");

      return `
        <tr>
          <td>
            <div class="att-student-name">${escapeHtml(student.name)}</div>
            <div class="small text-muted">${escapeHtml(student.gradeLevel)} - ${escapeHtml(student.section)}</div>
          </td>
          <td class="text-center">
            <div class="status-group">${buttons}</div>
          </td>
          <td class="text-end ${rateClass(rate)}">${rateText}</td>
        </tr>`;
    })
    .join("");

  const markedCount = students.filter((student) =>
    getStatusFor(selectedDate, student.id)
  ).length;
  markedCountLabel.textContent = `${markedCount} of ${students.length} marked`;
}

function renderSummary() {
  const counts = { Present: 0, Late: 0, Excused: 0, Absent: 0 };
  let marked = 0;
  let earned = 0;

  students.forEach((student) => {
    const status = getStatusFor(selectedDate, student.id);
    if (status) {
      counts[status] += 1;
      marked += 1;
      earned += STATUS_POINTS[status] ?? 0;
    }
  });

  const dayRate = marked ? `${((earned / marked) * 100).toFixed(0)}%` : "—";

  const tiles = [
    { label: "Present", value: counts.Present, cls: "is-present" },
    { label: "Late", value: counts.Late, cls: "is-late" },
    { label: "Excused", value: counts.Excused, cls: "is-excused" },
    { label: "Absent", value: counts.Absent, cls: "is-absent" },
    { label: "Day rate", value: dayRate, cls: "is-rate" },
  ];

  attendanceSummary.innerHTML = tiles
    .map(
      (tile) => `
      <div class="att-tile ${tile.cls}">
        <div class="att-tile-value">${tile.value}</div>
        <div class="att-tile-label">${tile.label}</div>
      </div>`
    )
    .join("");
}

function renderAll() {
  renderSummary();
  renderRollCall();
}

rollCallBody.addEventListener("click", (event) => {
  const button = event.target.closest(".status-btn");
  if (!button) {
    return;
  }

  const studentId = button.dataset.student;
  const status = button.dataset.status;
  const current = getStatusFor(selectedDate, studentId);

  // Tapping the active status again clears it (toggle off).
  setStatusFor(selectedDate, studentId, current === status ? "" : status);
  persist();
  renderAll();
});

attendanceDate.addEventListener("change", () => {
  selectedDate = attendanceDate.value || toISODate(new Date());
  attendanceDate.value = selectedDate;
  setMessage(`Showing ${formatDateLabel(selectedDate)}.`);
  renderAll();
});

todayBtn.addEventListener("click", () => {
  selectedDate = toISODate(new Date());
  attendanceDate.value = selectedDate;
  setMessage("Jumped to today.");
  renderAll();
});

markAllPresentBtn.addEventListener("click", () => {
  if (!students.length) {
    return;
  }
  students.forEach((student) => setStatusFor(selectedDate, student.id, "Present"));
  persist();
  renderAll();
  setMessage(`Marked all ${students.length} students present.`, "success");
});

clearDayBtn.addEventListener("click", () => {
  const before = attendanceRecords.length;
  attendanceRecords = attendanceRecords.filter((record) => record.date !== selectedDate);
  persist();
  renderAll();
  const removed = before - attendanceRecords.length;
  setMessage(removed ? `Cleared ${removed} record(s) for this day.` : "Nothing to clear for this day.");
});

(function init() {
  selectedDate = toISODate(new Date());
  attendanceDate.value = selectedDate;
  attendanceRecords = normalizeRecords(attendanceRecords);
  persist();
  setMessage("Tap a status for each student. Changes save automatically.");
  renderAll();
})();
