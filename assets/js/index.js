const loginForm = document.getElementById("loginForm");
const loginError = document.getElementById("loginError");
const loginSubtitle = document.getElementById("loginSubtitle");
const usernameInput = document.getElementById("username");
const passwordInput = document.getElementById("password");
const togglePasswordBtn = document.getElementById("togglePasswordBtn");
const passwordEyeIcon = document.getElementById("passwordEyeIcon");
const capsLockHint = document.getElementById("capsLockHint");
const recentLoginHint = document.getElementById("recentLoginHint");
const googleLoginBtn = document.getElementById("googleLoginBtn");
const googleTeacherSubjectModal = document.getElementById("googleTeacherSubjectModal");
const googleTeacherSubjectChecklist = document.getElementById("googleTeacherSubjectChecklist");
const googleTeacherSubjectError = document.getElementById("googleTeacherSubjectError");
const saveGoogleTeacherSubjectsBtn = document.getElementById("saveGoogleTeacherSubjectsBtn");
const TEACHER_SUBJECTS = [
  "Filipino",
  "English",
  "Math",
  "Science",
  "Araling Panlipunan",
  "MAPEH",
  "EPP",
  "ESP",
];

googleTeacherSubjectChecklist.innerHTML = TEACHER_SUBJECTS.map(
  (subject, index) => `
    <div class="form-check">
      <input class="form-check-input google-teacher-subject-option" type="checkbox" id="googleTeacherSubject${index}" value="${subject}" />
      <label class="form-check-label" for="googleTeacherSubject${index}">${subject}</label>
    </div>
  `
).join("");

function selectGoogleTeacherSubjects() {
  const modal = bootstrap.Modal.getOrCreateInstance(googleTeacherSubjectModal);
  const options = googleTeacherSubjectChecklist.querySelectorAll(".google-teacher-subject-option");
  options.forEach((option) => {
    option.checked = false;
  });
  googleTeacherSubjectError.classList.add("d-none");

  return new Promise((resolve) => {
    let resolved = false;
    const finish = (subjects) => {
      if (resolved) {
        return;
      }
      resolved = true;
      saveGoogleTeacherSubjectsBtn.removeEventListener("click", handleSubmit);
      googleTeacherSubjectModal.removeEventListener("hidden.bs.modal", handleHidden);
      modal.hide();
      resolve(subjects);
    };
    const handleSubmit = () => {
      const subjects = Array.from(
        googleTeacherSubjectChecklist.querySelectorAll(".google-teacher-subject-option:checked")
      ).map((subject) => subject.value);
      if (!subjects.length) {
        googleTeacherSubjectError.classList.remove("d-none");
        return;
      }
      finish(subjects);
    };
    const handleHidden = () => finish(null);

    saveGoogleTeacherSubjectsBtn.addEventListener("click", handleSubmit);
    googleTeacherSubjectModal.addEventListener("hidden.bs.modal", handleHidden);
    modal.show();
  });
}

function showLoginError(message) {
  loginError.textContent = message;
  loginError.classList.remove("d-none");
}

function updateSubtitle() {
  const email = usernameInput.value.trim();
  loginSubtitle.textContent = email
    ? `Welcome, ${email}. Sign in to continue.`
    : "Sign in to continue.";
}

function restoreLastEmail() {
  const lastEmail = localStorage.getItem("ptLastUsername");
  if (!lastEmail) {
    return;
  }
  usernameInput.value = lastEmail;
  recentLoginHint.textContent = `Recent email: ${lastEmail}`;
  recentLoginHint.classList.remove("d-none");
  updateSubtitle();
}

const params = new URLSearchParams(window.location.search);
if (params.get("notice") === "pending") {
  showLoginError("Your account needs school approval before you can sign in.");
}

togglePasswordBtn.addEventListener("click", () => {
  const isHidden = passwordInput.type === "password";
  passwordInput.type = isHidden ? "text" : "password";
  togglePasswordBtn.setAttribute("aria-pressed", String(isHidden));
  togglePasswordBtn.setAttribute("aria-label", isHidden ? "Hide password" : "Show password");
  passwordEyeIcon.innerHTML = isHidden
    ? '<path d="M3 3l18 18"></path><path d="M10.6 10.6a2 2 0 0 0 2.8 2.8"></path><path d="M9.9 5.2A10.8 10.8 0 0 1 12 5c7 0 11 7 11 7a14.8 14.8 0 0 1-3.1 3.8"></path><path d="M6.6 6.6C3.5 8.4 1 12 1 12s4 7 11 7a10.8 10.8 0 0 0 4.1-.8"></path>'
    : '<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle>';
});

passwordInput.addEventListener("keyup", (event) => {
  const capsOn = event.getModifierState && event.getModifierState("CapsLock");
  capsLockHint.classList.toggle("d-none", !capsOn);
});
usernameInput.addEventListener("input", updateSubtitle);
restoreLastEmail();
updateSubtitle();

loginForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  loginError.classList.add("d-none");

  const email = usernameInput.value.trim();
  const password = passwordInput.value;
  if (!email || !password) {
    showLoginError("Please enter your email and password.");
    return;
  }

  try {
    const { profile } = await window.ptFirebase.signIn(email, password);
    localStorage.setItem("ptLastUsername", email);
    window.location.href =
      profile.role === "parent" ? "student-dashboard.html" : "teacher-dashboard.html";
  } catch (error) {
    const messages = {
      "auth/invalid-credential": "The email or password is incorrect.",
      "auth/invalid-email": "Enter a valid email address.",
      "auth/too-many-requests": "Too many attempts. Please wait and try again.",
      "auth/network-request-failed": "Could not reach Firebase. Check your internet connection.",
    };
    showLoginError(messages[error.code] || error.message || "Sign-in failed.");
  }
});

googleLoginBtn.addEventListener("click", async () => {
  loginError.classList.add("d-none");
  googleLoginBtn.disabled = true;
  googleLoginBtn.textContent = "Connecting to Google...";

  try {
    const { profile } = await window.ptFirebase.signInWithGoogle({
      requestedRole: "teacher",
      email: usernameInput.value.trim(),
      password: passwordInput.value,
      selectTeacherSubjects: selectGoogleTeacherSubjects,
    });
    window.location.href =
      profile.role === "parent" ? "student-dashboard.html" : "teacher-dashboard.html";
  } catch (error) {
    const messages = {
      "auth/popup-closed-by-user": "Google sign-in was cancelled.",
      "auth/popup-blocked": "Allow popups for this site, then try Google sign-in again.",
      "auth/unauthorized-domain": "This website domain is not enabled for Google sign-in in Firebase.",
      "auth/operation-not-allowed": "Google sign-in is not enabled in Firebase Authentication yet.",
      "auth/network-request-failed": "Could not reach Firebase. Check your internet connection.",
      "auth/invalid-credential": "The email or password is incorrect. Check them and try linking Google again.",
    };
    showLoginError(messages[error.code] || error.message || "Google sign-in failed.");
  } finally {
    googleLoginBtn.disabled = false;
    googleLoginBtn.innerHTML = '<span class="google-mark" aria-hidden="true">G</span> Continue with Google';
  }
});
