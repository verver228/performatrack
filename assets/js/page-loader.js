import { showStartupError, startFirebaseApp } from "./firebase-client.js?v=student-risk-logistic-v1";

const appLoadingScreen = document.getElementById("appLoadingScreen");
const pageContent = Array.from(document.body.children).filter(
  (element) => element !== appLoadingScreen
);
pageContent.forEach((element) => {
  element.inert = true;
});

async function loadApplicationScripts() {
  const scripts = (document.body.dataset.appScripts || "")
    .split(",")
    .map((path) => path.trim())
    .filter(Boolean);

  for (const path of scripts) {
    await new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = `${path}?v=ml-attendance-walkthrough-v2`;
      script.onload = resolve;
      script.onerror = () => reject(new Error(`Could not load ${path}`));
      document.body.appendChild(script);
    });
  }
}

async function syncTeacherRiskModel() {
  const rawUser = sessionStorage.getItem("ptCurrentUser");
  const currentUser = rawUser ? JSON.parse(rawUser) : null;
  if (currentUser?.role !== "teacher" || typeof window.PT?.trainPerformanceRiskModel !== "function") {
    return;
  }

  const result = window.PT.trainPerformanceRiskModel();
  const nextModel = result.available ? result.model : null;
  const rawCurrentModel = sessionStorage.getItem("ptPerformanceRiskModel");
  let currentModel = null;
  if (rawCurrentModel) {
    try {
      currentModel = JSON.parse(rawCurrentModel);
    } catch (error) {
      console.warn("PERFORMATRACK could not read the cached performance model.", error);
    }
  }
  const sameModel =
    currentModel === null && nextModel === null ||
    currentModel &&
      nextModel &&
      currentModel.version === nextModel.version &&
      currentModel.trainingExamples === nextModel.trainingExamples &&
      currentModel.trainingStudents === nextModel.trainingStudents &&
      currentModel.belowThresholdExamples === nextModel.belowThresholdExamples &&
      currentModel.gradeThreshold === nextModel.gradeThreshold &&
      currentModel.bias === nextModel.bias &&
      ["means", "scales", "weights"].every((key) =>
        Array.isArray(currentModel[key]) &&
        currentModel[key].length === nextModel[key].length &&
        currentModel[key].every((value, index) => value === nextModel[key][index])
      );
  if (sameModel) {
    return;
  }

  await window.ptFirebase.setDoc(
    window.ptFirebase.doc(
      window.ptFirebase.db,
      "teacherSettings",
      window.ptFirebase.user.uid
    ),
    { performanceRiskModel: nextModel },
    { merge: true }
  );
  if (nextModel) {
    sessionStorage.setItem("ptPerformanceRiskModel", JSON.stringify(nextModel));
  } else {
    sessionStorage.removeItem("ptPerformanceRiskModel");
  }
}

const importGradeWorkbookBtn = document.getElementById("importGradeWorkbookBtn");
const gradeWorkbookFile = document.getElementById("gradeWorkbookFile");
const rosterFileInput = document.getElementById("studentRosterFile");
if (rosterFileInput) {
  rosterFileInput.addEventListener("change", () => {
    if (!window.ptTeacherDashboardReady) {
      window.ptPendingRosterFile = rosterFileInput.files[0] || null;
    }
  });
}

if (importGradeWorkbookBtn && gradeWorkbookFile) {
  importGradeWorkbookBtn.addEventListener("click", () => gradeWorkbookFile.click());
}

try {
  await startFirebaseApp();
  await loadApplicationScripts();
  try {
    await syncTeacherRiskModel();
  } catch (error) {
    console.error("PERFORMATRACK could not update the teacher's shared performance model.", error);
    const notice = document.createElement("div");
    notice.className = "alert alert-warning m-3";
    notice.setAttribute("role", "alert");
    notice.textContent =
      "The performance model could not be refreshed for the Parent Portal. Current teacher-side estimates may use the latest grades; try reloading when the connection is available.";
    document.body.prepend(notice);
  }
  pageContent.forEach((element) => {
    element.inert = false;
  });
  appLoadingScreen?.remove();
} catch (error) {
  console.error("PERFORMATRACK could not start.", error);
  const message = error.message || "PERFORMATRACK could not connect to Firebase.";
  showStartupError(message);
  if (appLoadingScreen) {
    appLoadingScreen.classList.add("is-error");
    appLoadingScreen.setAttribute("role", "alert");
    appLoadingScreen.textContent =
      `${message} Refresh the page to try again.`;
  }
}
