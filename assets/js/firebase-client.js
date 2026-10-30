import { initializeApp } from "https://www.gstatic.com/firebasejs/11.10.0/firebase-app.js";
import {
  createUserWithEmailAndPassword,
  deleteUser,
  getAuth,
  GoogleAuthProvider,
  linkWithCredential,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut,
  updateProfile,
} from "https://www.gstatic.com/firebasejs/11.10.0/firebase-auth.js";
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  getFirestore,
  query,
  serverTimestamp,
  setDoc,
  where,
  writeBatch,
} from "https://www.gstatic.com/firebasejs/11.10.0/firebase-firestore.js";
import { firebaseConfig } from "../../firebase/firebase-config.js";

const DATABASE_KEYS = [
  "ptStudents",
  "ptAttendanceRecords",
  "ptClassRecord",
  "ptClassCategories",
];
const STUDENT_MIGRATION_KEY = "ptFirebaseStudentMigrationComplete";
const studentDocumentIdsByTeacher = new Map();

const SAMPLE_STUDENT_IDS = new Set([
  "STU-001",
  "STU-002",
  "STU-003",
  "STU-004",
  "STU-005",
  "STU-006",
  "STU-007",
  "STU-008",
  "STU-009",
  "STU-010",
]);
const FIRST_REAL_STUDENT_NUMBER = 11;

const nativeSetItem = Storage.prototype.setItem;
const nativeRemoveItem = Storage.prototype.removeItem;

function studentDocumentId(ownerUid, studentId) {
  return `${ownerUid}__${encodeURIComponent(studentId)}`;
}

function writableGradeSubjects(data, teacherSubjects) {
  if (!Array.isArray(teacherSubjects)) {
    return data && typeof data === "object" ? data : {};
  }
  const allowed = new Set(teacherSubjects.map(String));
  return Object.fromEntries(
    Object.entries(data && typeof data === "object" ? data : {}).filter(([subject]) =>
      allowed.has(subject)
    )
  );
}

function isConfigured() {
  return (
    firebaseConfig.apiKey &&
    firebaseConfig.apiKey !== "PASTE_API_KEY_HERE" &&
    firebaseConfig.authDomain &&
    !firebaseConfig.authDomain.startsWith("PASTE_") &&
    firebaseConfig.projectId &&
    firebaseConfig.projectId !== "PASTE_PROJECT_ID_HERE" &&
    firebaseConfig.appId &&
    firebaseConfig.appId !== "PASTE_APP_ID_HERE"
  );
}

function waitForAuth(auth) {
  return new Promise((resolve, reject) => {
    const unsubscribe = onAuthStateChanged(
      auth,
      (user) => {
        unsubscribe();
        resolve(user);
      },
      (error) => {
        unsubscribe();
        reject(error);
      }
    );
  });
}

async function readProfile(db, user) {
  for (const collectionName of ["teachers", "parents", "users"]) {
    const snapshot = await getDoc(doc(db, collectionName, user.uid));
    if (snapshot.exists()) {
      return { ...snapshot.data(), _profileCollection: collectionName };
    }
  }
  return null;
}

async function loadCloudState(db, user, profile) {
  const students = [];
  if (profile.role === "teacher") {
    const result = await getDocs(
      query(collection(db, "students"), where("ownerUid", "==", user.uid))
    );
    result.forEach((studentDoc) =>
      students.push({ ...studentDoc.data(), documentId: studentDoc.id })
    );
    studentDocumentIdsByTeacher.set(
      user.uid,
      new Map(students.map((student) => [String(student.id || ""), student.documentId]))
    );
  } else if (profile.role === "parent" && profile.studentDocId) {
    const studentSnapshot = await getDoc(doc(db, "students", profile.studentDocId));
    if (!studentSnapshot.exists()) {
      throw new Error("The linked student record was not found. Contact your school administrator.");
    }
    students.push({
      ...studentSnapshot.data(),
      documentId: studentSnapshot.id,
    });
  } else if (profile.role === "parent") {
    throw new Error("Your parent account is not linked to a student yet. Contact your school administrator.");
  }

  const attendanceRecords = [];
  const classRecord = {};
  await Promise.all(
    students.map(async (student) => {
      const [grades, attendance] = await Promise.all([
        getDoc(doc(db, "students", student.documentId, "grades", "current")),
        getDocs(collection(db, "students", student.documentId, "attendance")),
      ]);

      if (grades.exists()) {
        classRecord[student.id] = grades.data().data || {};
      }
      attendance.forEach((record) => attendanceRecords.push(record.data()));
    })
  );

  const ownerUid =
    profile.role === "teacher"
      ? user.uid
      : students.length
        ? students[0].ownerUid
        : null;
  let classCategories = {};
  let performanceRiskModel = null;
  let studentDataInitialized = false;
  if (ownerUid) {
    const settings = await getDoc(doc(db, "teacherSettings", ownerUid));
    if (settings.exists()) {
      const settingsData = settings.data();
      classCategories = settingsData.categoriesBySubject || {};
      performanceRiskModel = settingsData.performanceRiskModel || null;
      studentDataInitialized =
        settingsData.studentDataInitialized === true ||
        (Number.isInteger(Number(settingsData.nextStudentNumber)) &&
          Number(settingsData.nextStudentNumber) > 1);
    }
  }

  return {
    ptStudentDataInitialized: studentDataInitialized,
    ptStudents: students.map(({ id, name, firstName = "", surname = "", middleInitial = "", gradeLevel = "", section = "", subjects }) => ({
      id,
      name,
      firstName,
      surname,
      middleInitial,
      gradeLevel,
      section,
      ...(Array.isArray(subjects) ? { subjects } : {}),
    })),
    ptAttendanceRecords: attendanceRecords,
    ptClassRecord: classRecord,
    ptClassCategories: classCategories,
    ptPerformanceRiskModel: performanceRiskModel,
  };
}

async function saveStudents(db, user, value) {
  const current = await getDocs(
    query(collection(db, "students"), where("ownerUid", "==", user.uid))
  );
  const nextIds = new Set(value.map((student) => String(student.id)));
  const writes = [];

  for (const studentDoc of current.docs) {
    if (!nextIds.has(String(studentDoc.data().id))) {
      await deleteStudentData(studentDoc);
    }
  }
  value.forEach((student) => {
    const id = String(student.id || "").trim();
    if (!id) {
      return;
    }
    writes.push(
      setDoc(
        doc(db, "students", studentDocumentId(user.uid, id)),
        {
          id,
          name: String(student.name || "").trim(),
          firstName: String(student.firstName || "").trim(),
          surname: String(student.surname || "").trim(),
          middleInitial: String(student.middleInitial || "").trim(),
          gradeLevel: String(student.gradeLevel || ""),
          section: String(student.section || ""),
          ...(Array.isArray(student.subjects)
            ? { subjects: student.subjects.map((subject) => String(subject).trim()).filter(Boolean) }
            : {}),
          ownerUid: user.uid,
        },
        { merge: true }
      )
    );
  });
  await Promise.all(writes);
  const documentIds = new Map(
    current.docs
      .filter((studentDoc) => nextIds.has(String(studentDoc.data().id)))
      .map((studentDoc) => [String(studentDoc.data().id), studentDoc.id])
  );
  value.forEach((student) => {
    const id = String(student.id || "").trim();
    if (id && !documentIds.has(id)) {
      documentIds.set(id, studentDocumentId(user.uid, id));
    }
  });
  studentDocumentIdsByTeacher.set(user.uid, documentIds);
}

async function createStudentRecord(db, user, student, profile) {
  const snapshot = await getDocs(
    query(collection(db, "students"), where("ownerUid", "==", user.uid))
  );
  const students = snapshot.docs.map((studentDoc) => studentDoc.data());
  const maxId = students.reduce((max, current) => {
    const match = /^STU-(\d+)$/.exec(String(current.id || ""));
    return match ? Math.max(max, Number(match[1])) : max;
  }, FIRST_REAL_STUDENT_NUMBER - 1);
  const studentData = {
    name: String(student.name || "").trim(),
    firstName: String(student.firstName || "").trim(),
    surname: String(student.surname || "").trim(),
    middleInitial: String(student.middleInitial || "").trim(),
    gradeLevel: String(student.gradeLevel || "").trim(),
    section: String(student.section || "").trim(),
    subjects: Array.isArray(student.subjects)
      ? [...new Set(student.subjects.map((subject) => String(subject).trim()).filter(Boolean))]
      : [],
    ownerUid: user.uid,
  };
  if (
    Array.isArray(profile.teacherSubjects) &&
    studentData.subjects.some((subject) => !profile.teacherSubjects.includes(subject))
  ) {
    throw new Error("Students can only be assigned subjects that are assigned to your teacher account.");
  }

  if (
    !studentData.firstName ||
    !studentData.surname ||
    !studentData.gradeLevel ||
    !studentData.section ||
    !studentData.subjects.length
  ) {
    throw new Error("Enter the student's name, grade level, section, and at least one subject.");
  }

  const id = `STU-${String(Math.max(FIRST_REAL_STUDENT_NUMBER, maxId + 1)).padStart(3, "0")}`;
  const createdStudent = { ...studentData, id };
  await setDoc(
    doc(db, "students", studentDocumentId(user.uid, id)),
    createdStudent
  );
  const documentIds = studentDocumentIdsByTeacher.get(user.uid) || new Map();
  documentIds.set(id, studentDocumentId(user.uid, id));
  studentDocumentIdsByTeacher.set(user.uid, documentIds);

  await cacheCreatedStudents(db, user, students, [createdStudent]);

  return createdStudent;
}

function studentRosterIdentity(student) {
  const name = student.name || [student.firstName, student.middleInitial, student.surname]
    .filter(Boolean)
    .join(" ");
  return [name, student.gradeLevel, student.section]
    .map((value) => String(value || "").trim().replace(/\s+/g, " ").toLocaleLowerCase())
    .join("|");
}

async function cacheCreatedStudents(db, user, existingStudents, createdStudents) {
  const currentStudents = existingStudents.map((student) => ({
    id: String(student.id || ""),
    name: String(student.name || ""),
    firstName: String(student.firstName || ""),
    surname: String(student.surname || ""),
    middleInitial: String(student.middleInitial || ""),
    gradeLevel: String(student.gradeLevel || ""),
    section: String(student.section || ""),
    ...(Array.isArray(student.subjects) ? { subjects: student.subjects } : {}),
  }));
  currentStudents.push(
    ...createdStudents.map((student) => ({
      id: student.id,
      name: student.name,
      firstName: student.firstName,
      surname: student.surname,
      middleInitial: student.middleInitial,
      gradeLevel: student.gradeLevel,
      section: student.section,
      subjects: student.subjects,
    }))
  );
  nativeSetItem.call(localStorage, "ptStudents", JSON.stringify(currentStudents));
  nativeSetItem.call(
    localStorage,
    `${STUDENT_MIGRATION_KEY}:${user.uid}`,
    "true"
  );
  try {
    await setDoc(
      doc(db, "teacherSettings", user.uid),
      { studentDataInitialized: true },
      { merge: true }
    );
  } catch (error) {
    console.error("Student records were saved, but the migration marker could not be saved.", error);
  }
}

async function createStudentRecords(db, user, roster, profile) {
  if (!Array.isArray(roster) || !roster.length) {
    throw new Error("Choose at least one valid student row to import.");
  }
  const snapshot = await getDocs(
    query(collection(db, "students"), where("ownerUid", "==", user.uid))
  );
  const existingStudents = snapshot.docs.map((studentDoc) => studentDoc.data());
  const seen = new Set(existingStudents.map(studentRosterIdentity));
  let nextNumber = existingStudents.reduce((max, current) => {
    const match = /^STU-(\d+)$/.exec(String(current.id || ""));
    return match ? Math.max(max, Number(match[1])) : max;
  }, FIRST_REAL_STUDENT_NUMBER - 1);

  const createdStudents = roster.map((student) => {
    const studentData = {
      name: String(student.name || "").trim(),
      firstName: String(student.firstName || "").trim(),
      surname: String(student.surname || "").trim(),
      middleInitial: String(student.middleInitial || "").trim(),
      gradeLevel: String(student.gradeLevel || "").trim(),
      section: String(student.section || "").trim(),
      subjects: Array.isArray(student.subjects)
        ? [...new Set(student.subjects.map((subject) => String(subject).trim()).filter(Boolean))]
        : [],
      ownerUid: user.uid,
    };
    if (
      !studentData.firstName ||
      !studentData.surname ||
      !studentData.gradeLevel ||
      !studentData.section ||
      !studentData.subjects.length
    ) {
      throw new Error("Each imported student must have a first name, surname, grade level, section, and at least one subject.");
    }
    if (
      Array.isArray(profile.teacherSubjects) &&
      studentData.subjects.some((subject) => !profile.teacherSubjects.includes(subject))
    ) {
      throw new Error(
        `${studentData.name} has a subject that is not assigned to your teacher account.`
      );
    }
    const identity = studentRosterIdentity(studentData);
    if (seen.has(identity)) {
      throw new Error(`${studentData.name} (${studentData.gradeLevel}, ${studentData.section}) already exists in the class roster.`);
    }
    seen.add(identity);
    nextNumber += 1;
    return {
      ...studentData,
      id: `STU-${String(nextNumber).padStart(3, "0")}`,
    };
  });

  const documentRefs = createdStudents.map((student) =>
    doc(db, "students", studentDocumentId(user.uid, student.id))
  );
  let committedCount = 0;
  for (let start = 0; start < createdStudents.length; start += 450) {
    const batch = writeBatch(db);
    createdStudents.slice(start, start + 450).forEach((student, index) => {
      batch.set(documentRefs[start + index], student);
    });
    try {
      await batch.commit();
      committedCount += Math.min(450, createdStudents.length - start);
    } catch (error) {
      if (committedCount > 0) {
        throw new Error(
          `The import stopped after saving ${committedCount} student${committedCount === 1 ? "" : "s"}. Reload the page to see saved students, then import the remaining rows.`
        );
      }
      throw error;
    }
  }

  await cacheCreatedStudents(db, user, existingStudents, createdStudents);
  const documentIds = new Map(
    snapshot.docs.map((studentDoc) => [String(studentDoc.data().id || ""), studentDoc.id])
  );
  createdStudents.forEach((student) => {
    documentIds.set(student.id, studentDocumentId(user.uid, student.id));
  });
  studentDocumentIdsByTeacher.set(user.uid, documentIds);
  return createdStudents;
}

async function deleteStudentData(studentDoc) {
  const [grades, attendance] = await Promise.all([
    getDocs(collection(studentDoc.ref, "grades")),
    getDocs(collection(studentDoc.ref, "attendance")),
  ]);
  await Promise.all([
    ...grades.docs.map((record) => deleteDoc(record.ref)),
    ...attendance.docs.map((record) => deleteDoc(record.ref)),
  ]);
  await deleteDoc(studentDoc.ref);
}

async function removeSampleStudentsFromFirebase(db, user) {
  const snapshot = await getDocs(
    query(collection(db, "students"), where("ownerUid", "==", user.uid))
  );
  const sampleDocs = snapshot.docs.filter((studentDoc) =>
    SAMPLE_STUDENT_IDS.has(String(studentDoc.data().id))
  );
  await Promise.all(sampleDocs.map(deleteStudentData));
}

function removeSampleStudentsFromLocalStorage() {
  const studentsRaw = localStorage.getItem("ptStudents");
  if (studentsRaw !== null) {
    try {
      const students = JSON.parse(studentsRaw);
      if (Array.isArray(students)) {
        nativeSetItem.call(
          localStorage,
          "ptStudents",
          JSON.stringify(
            students.filter((student) => !SAMPLE_STUDENT_IDS.has(String(student?.id || "")))
          )
        );
      }
    } catch (error) {
      console.warn("Could not remove sample students from local student data.", error);
    }
  }

  const attendanceRaw = localStorage.getItem("ptAttendanceRecords");
  if (attendanceRaw !== null) {
    try {
      const records = JSON.parse(attendanceRaw);
      if (Array.isArray(records)) {
        nativeSetItem.call(
          localStorage,
          "ptAttendanceRecords",
          JSON.stringify(
            records.filter((record) => !SAMPLE_STUDENT_IDS.has(String(record?.studentId || "")))
          )
        );
      }
    } catch (error) {
      console.warn("Could not remove sample attendance data from local storage.", error);
    }
  }

  const gradesRaw = localStorage.getItem("ptClassRecord");
  if (gradesRaw !== null) {
    try {
      const grades = JSON.parse(gradesRaw);
      if (grades && typeof grades === "object" && !Array.isArray(grades)) {
        for (const studentId of SAMPLE_STUDENT_IDS) {
          delete grades[studentId];
        }
        nativeSetItem.call(localStorage, "ptClassRecord", JSON.stringify(grades));
      }
    } catch (error) {
      console.warn("Could not remove sample grades from local storage.", error);
    }
  }
}

function localCacheContainsCloudStudent() {
  const raw = localStorage.getItem("ptStudents");
  if (!raw) {
    return false;
  }

  try {
    const students = JSON.parse(raw);
    return (
      Array.isArray(students) &&
      students.some(
        (student) =>
          student &&
          !SAMPLE_STUDENT_IDS.has(String(student.id || "")) &&
          String(student.firstName || "").trim() &&
          String(student.surname || "").trim() &&
          Array.isArray(student.subjects) &&
          student.subjects.length > 0
      )
    );
  } catch (error) {
    console.warn("Could not inspect cached students before Firebase migration.", error);
    return false;
  }
}

async function saveAttendance(db, user, value) {
  const studentSnapshot = await getDocs(
    query(collection(db, "students"), where("ownerUid", "==", user.uid))
  );
  const students = studentSnapshot.docs.map((studentDoc) => ({
    documentId: studentDoc.id,
    id: studentDoc.data().id,
  }));
  await Promise.all(
    students.map(async (student) => {
      const attendanceRef = collection(db, "students", student.documentId, "attendance");
      const existing = await getDocs(attendanceRef);
      const entries = value.filter((record) => record.studentId === student.id);
      const nextDates = new Set(entries.map((record) => String(record.date).slice(0, 10)));
      const writes = [];
      existing.forEach((recordDoc) => {
        if (!nextDates.has(recordDoc.id)) {
          writes.push(deleteDoc(recordDoc.ref));
        }
      });
      entries.forEach((record) => {
        const date = String(record.date).slice(0, 10);
        if (!date) {
          return;
        }
        writes.push(
          setDoc(doc(db, "students", student.documentId, "attendance", date), {
            date,
            studentId: student.id,
            status: record.status,
          })
        );
      });
      await Promise.all(writes);
    })
  );
}

async function saveState(db, user, key, value, profile) {
  if (key === "ptStudents") {
    await saveStudents(db, user, Array.isArray(value) ? value : []);
    return;
  }
  if (key === "ptAttendanceRecords") {
    await saveAttendance(db, user, Array.isArray(value) ? value : []);
    return;
  }
  if (key === "ptClassRecord") {
    const records = value && typeof value === "object" ? value : {};
    let studentDocuments = studentDocumentIdsByTeacher.get(user.uid);
    if (!studentDocuments) {
      const studentSnapshot = await getDocs(
        query(collection(db, "students"), where("ownerUid", "==", user.uid))
      );
      studentDocuments = new Map(
        studentSnapshot.docs.map((studentDoc) => [
          String(studentDoc.data().id || ""),
          studentDoc.id,
        ])
      );
      studentDocumentIdsByTeacher.set(user.uid, studentDocuments);
    }
    const orphanedStudentIds = [];
    await Promise.all(
      Object.entries(records).map(([studentId, data]) => {
        const studentDocument = studentDocuments.get(studentId);
        if (!studentDocument) {
          orphanedStudentIds.push(studentId);
          return Promise.resolve();
        }
        const gradeRef = doc(db, "students", studentDocument, "grades", "current");
        const writableSubjects = writableGradeSubjects(data, profile.teacherSubjects);
        return setDoc(gradeRef, { data: writableSubjects }, { merge: true });
      })
    );
    if (orphanedStudentIds.length) {
      console.warn(
        "Skipped Firebase grade saves for students no longer in this teacher's roster.",
        orphanedStudentIds
      );
    }
    return;
  }
  if (key === "ptClassCategories") {
    await setDoc(
      doc(db, "teacherSettings", user.uid),
      { categoriesBySubject: value && typeof value === "object" ? value : {} },
      { merge: true }
    );
  }
}

function installStorageBridge(db, user, profile) {
  if (profile.role !== "teacher") {
    return;
  }

  let writes = Promise.resolve();
  const reportSaveError = (key, error) => {
    console.error(`PERFORMATRACK could not save ${key} to Firebase.`, error);
    const notice = document.querySelector("[data-firebase-save-error]") ||
      document.createElement("div");
    notice.className = "alert alert-danger m-3";
    notice.dataset.firebaseSaveError = "true";
    notice.setAttribute("role", "alert");
    const label = key === "ptClassCategories" ? "gradebook setup" : "a change";
    const code = typeof error?.code === "string" ? ` (${error.code})` : "";
    notice.textContent =
      `Could not save ${label} to Firebase${code}. The change is on this device but may not appear on other devices. Check your connection and try again.`;
    if (!notice.isConnected) {
      document.body.prepend(notice);
    }
  };

  Storage.prototype.setItem = function (key, value) {
    nativeSetItem.call(this, key, value);
    if (this !== localStorage || !DATABASE_KEYS.includes(String(key))) {
      return;
    }
    let parsed;
    try {
      parsed = JSON.parse(String(value));
    } catch (error) {
      console.error(`PERFORMATRACK could not parse ${key} for cloud saving.`, error);
      return;
    }
    writes = writes
      .then(() => saveState(db, user, String(key), parsed, profile))
      .catch((error) => {
        reportSaveError(String(key), error);
      });
  };

  Storage.prototype.removeItem = function (key) {
    nativeRemoveItem.call(this, key);
    if (this === localStorage && DATABASE_KEYS.includes(String(key))) {
      console.warn(`PERFORMATRACK removed local ${key}; reload to restore its Firebase copy.`);
    }
  };
}

async function prepareUserData(db, user, profile) {
  if (profile.role === "teacher") {
    await removeSampleStudentsFromFirebase(db, user);
    removeSampleStudentsFromLocalStorage();
  }
  const remoteState = await loadCloudState(db, user, profile);
  if (remoteState.ptPerformanceRiskModel) {
    sessionStorage.setItem(
      "ptPerformanceRiskModel",
      JSON.stringify(remoteState.ptPerformanceRiskModel)
    );
  } else {
    sessionStorage.removeItem("ptPerformanceRiskModel");
  }
  const migrationKey = `${STUDENT_MIGRATION_KEY}:${user.uid}`;
  const migrationAlreadyComplete =
    profile.role === "teacher" &&
    (localStorage.getItem(migrationKey) === "true" ||
      remoteState.ptStudentDataInitialized === true ||
      localCacheContainsCloudStudent());
  const shouldMigrateLocalData =
    profile.role === "teacher" && !migrationAlreadyComplete;

  for (const key of DATABASE_KEYS) {
    const remoteValue = remoteState[key];
    const hasRemoteValue =
      (Array.isArray(remoteValue) && remoteValue.length > 0) ||
      (remoteValue && typeof remoteValue === "object" && Object.keys(remoteValue).length > 0);

    if (shouldMigrateLocalData && !hasRemoteValue) {
      const localValue = localStorage.getItem(key);
      if (localValue !== null) {
        let parsed;
        try {
          parsed = JSON.parse(localValue);
        } catch (error) {
          console.warn(`Skipped invalid local data for ${key}.`, error);
          parsed = null;
        }
        const hasLocalValue =
          (Array.isArray(parsed) && parsed.length > 0) ||
          (parsed && typeof parsed === "object" && Object.keys(parsed).length > 0);
        if (hasLocalValue) {
          remoteState[key] = parsed;
          await saveState(db, user, key, parsed, profile);
        }
      }
    }
    nativeSetItem.call(localStorage, key, JSON.stringify(remoteState[key]));
  }

  if (profile.role === "teacher") {
    if (!remoteState.ptStudentDataInitialized) {
      await setDoc(
        doc(db, "teacherSettings", user.uid),
        { studentDataInitialized: true },
        { merge: true }
      );
    }
    nativeSetItem.call(localStorage, migrationKey, "true");
  }

  installStorageBridge(db, user, profile);
}

function showStartupError(message) {
  const notice = document.createElement("div");
  notice.className = "alert alert-danger m-3";
  notice.setAttribute("role", "alert");
  notice.textContent = message;
  document.body.prepend(notice);
}

export async function startFirebaseApp() {
  if (!isConfigured()) {
    throw new Error(
      "Firebase is not configured yet. Add your Firebase web app settings to firebase/firebase-config.js."
    );
  }

  const app = initializeApp(firebaseConfig);
  const auth = getAuth(app);
  const db = getFirestore(app);
  const user = await waitForAuth(auth);
  sessionStorage.removeItem("ptCurrentUser");
  for (const key of ["ptAccounts", "ptTeacherAccounts"]) {
    if (localStorage.getItem(key) !== null) {
      localStorage.removeItem(key);
      console.warn(`Removed legacy plaintext account data from ${key}. Register accounts with Firebase Authentication.`);
    }
  }
  const currentPage = window.location.pathname.split("/").pop().toLowerCase();
  const publicPages = ["index.html", "parent-login.html", "registration.html"];
  let profile = null;

  if (user) {
    profile = await readProfile(db, user);
    if (profile) {
      sessionStorage.setItem(
        "ptCurrentUser",
        JSON.stringify({
          uid: user.uid,
          fullName: profile.fullName || user.displayName || "",
          email: user.email || "",
          username: user.email || "",
          role: profile.role,
          studentId: profile.studentId || "",
          studentDocId: profile.studentDocId || "",
          teacherSubjects: Array.isArray(profile.teacherSubjects)
            ? profile.teacherSubjects
            : null,
        })
      );
    }
  }

  if (!publicPages.includes(currentPage)) {
    if (!user || !profile) {
      window.location.replace(
        currentPage === "student-dashboard.html" ? "parent-login.html" : "index.html"
      );
      return;
    }
    if (profile.role !== "teacher" && profile.role !== "parent") {
      await signOut(auth);
      window.location.replace("index.html?notice=pending");
      return;
    }
    if (profile.role === "parent" && (!profile.studentId || !profile.studentDocId)) {
      await signOut(auth);
      window.location.replace("parent-login.html?notice=setup");
      return;
    }
    await prepareUserData(db, user, profile);
  }

  window.ptFirebase = {
    auth,
    db,
    user,
    profile,
    createUserWithEmailAndPassword,
    signInWithEmailAndPassword,
    signOut,
    updateProfile,
    doc,
    getDoc,
    setDoc,
    async addStudent(student) {
      if (profile?.role !== "teacher") {
        throw new Error("Only teacher accounts can add students.");
      }
      return createStudentRecord(db, user, student, profile);
    },
    async addStudents(roster) {
      if (profile?.role !== "teacher") {
        throw new Error("Only teacher accounts can import students.");
      }
      return createStudentRecords(db, user, roster, profile);
    },
    async signUp({
      email,
      password,
      fullName,
      requestedRole,
      requestedStudentId,
      teacherSubjects = [],
    }) {
      const credential = await createUserWithEmailAndPassword(auth, email, password);
      try {
        await updateProfile(credential.user, { displayName: fullName });
        const profileCollection = requestedRole === "parent" ? "parents" : "teachers";
        await setDoc(doc(db, profileCollection, credential.user.uid), {
          fullName,
          email: credential.user.email || email,
          role: "pending",
          requestedRole,
          ...(requestedRole === "parent"
            ? { requestedStudentId: String(requestedStudentId || "").trim() }
            : {}),
          ...(requestedRole === "teacher" ? { teacherSubjects } : {}),
          createdAt: serverTimestamp(),
        });
      } catch (error) {
        try {
          await deleteUser(credential.user);
        } catch (cleanupError) {
          console.error("PERFORMATRACK could not remove a partially created Firebase account.", cleanupError);
        }
        await signOut(auth);
        throw error;
      }
      await signOut(auth);
    },
    async signIn(email, password) {
      const credential = await signInWithEmailAndPassword(auth, email, password);
      const signedInProfile = await readProfile(db, credential.user);
      if (!signedInProfile || !["teacher", "parent"].includes(signedInProfile.role)) {
        await signOut(auth);
        throw new Error(
          signedInProfile?.role === "pending"
            ? "Your account is waiting for school approval. Please try again after it has been approved."
            : "Your account profile is missing. Please contact your administrator."
        );
      }
      return { user: credential.user, profile: signedInProfile };
    },
    async signInWithGoogle({
      requestedRole,
      requestedStudentId = "",
      email = "",
      password = "",
      selectTeacherSubjects,
      requestParentStudentId,
    }) {
      const provider = new GoogleAuthProvider();
      let credential;

      try {
        credential = await signInWithPopup(auth, provider);
      } catch (error) {
        if (error.code !== "auth/account-exists-with-different-credential") {
          throw error;
        }
        const googleCredential = GoogleAuthProvider.credentialFromError(error);
        if (!googleCredential || !email || !password) {
          throw new Error(
            "This Google email already has a password account. Enter that email and password, then select Continue with Google again to link it."
          );
        }
        const passwordCredential = await signInWithEmailAndPassword(auth, email, password);
        await linkWithCredential(passwordCredential.user, googleCredential);
        credential = passwordCredential;
      }

      const requestTeacherSubjects = async () => {
        const selectedSubjects =
          typeof selectTeacherSubjects === "function"
            ? await selectTeacherSubjects()
            : null;
        const allowedSubjects = new Set([
          "Filipino",
          "English",
          "Math",
          "Science",
          "Araling Panlipunan",
          "MAPEH",
          "EPP",
          "ESP",
        ]);
        const teacherSubjects = Array.isArray(selectedSubjects)
          ? [...new Set(selectedSubjects.filter((subject) => allowedSubjects.has(subject)))]
          : [];
        if (selectedSubjects === null) {
          await signOut(auth);
          throw new Error("Subject selection was cancelled. No teacher request was submitted.");
        }
        if (!teacherSubjects.length) {
          await signOut(auth);
          throw new Error("Select at least one subject to submit a teacher access request.");
        }
        return teacherSubjects;
      };

      let signedInProfile = await readProfile(db, credential.user);
      if (!signedInProfile) {
        let parentStudentId = "";
        if (requestedRole === "parent") {
          const requestedId =
            typeof requestParentStudentId === "function"
              ? await requestParentStudentId()
              : requestedStudentId;
          parentStudentId = String(requestedId || "").trim();
          if (!parentStudentId) {
            await signOut(auth);
            throw new Error(
              "Enter the school-issued Student ID to submit a first-time parent access request."
            );
          }
          if (parentStudentId.length > 64) {
            await signOut(auth);
            throw new Error("The Student ID must be 64 characters or fewer.");
          }
        }

        const teacherSubjects =
          requestedRole === "teacher" ? await requestTeacherSubjects() : [];
        const profileCollection = requestedRole === "parent" ? "parents" : "teachers";
        signedInProfile = {
          fullName: credential.user.displayName || credential.user.email || "",
          email: credential.user.email || "",
          role: "pending",
          requestedRole,
          ...(requestedRole === "teacher" ? { teacherSubjects } : {}),
          ...(requestedRole === "parent"
            ? { requestedStudentId: parentStudentId }
            : {}),
        };
        try {
          await setDoc(doc(db, profileCollection, credential.user.uid), {
            fullName: signedInProfile.fullName,
            email: signedInProfile.email,
            role: signedInProfile.role,
            requestedRole: signedInProfile.requestedRole,
            ...(requestedRole === "teacher"
              ? { teacherSubjects: signedInProfile.teacherSubjects }
              : {}),
            ...(requestedRole === "parent"
              ? { requestedStudentId: signedInProfile.requestedStudentId }
              : {}),
            createdAt: serverTimestamp(),
          });
          signedInProfile._profileCollection = profileCollection;
        } catch (error) {
          await signOut(auth);
          throw error;
        }
      }

      if (signedInProfile.role === "pending") {
        if (
          requestedRole === "teacher" &&
          signedInProfile.requestedRole === "teacher" &&
          !Array.isArray(signedInProfile.teacherSubjects)
        ) {
          const teacherSubjects = await requestTeacherSubjects();
          try {
            await setDoc(
              doc(
                db,
                signedInProfile._profileCollection || "users",
                credential.user.uid
              ),
              { teacherSubjects },
              { merge: true }
            );
          } catch (error) {
            await signOut(auth);
            throw error;
          }
        }
        await signOut(auth);
        throw new Error(
          "Your account request is waiting for school approval. Please try again after it has been approved."
        );
      }
      if (signedInProfile.role !== requestedRole) {
        await signOut(auth);
        throw new Error(
          `This Google account is not set up for ${requestedRole} access. Use the correct portal or contact your school administrator.`
        );
      }
      if (
        requestedRole === "parent" &&
        (!signedInProfile.studentId || !signedInProfile.studentDocId)
      ) {
        await signOut(auth);
        throw new Error(
          "Your parent account is not linked to a student yet. Contact your school administrator."
        );
      }

      return { user: credential.user, profile: signedInProfile };
    },
  };
}

export { showStartupError };
