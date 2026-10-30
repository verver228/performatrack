const registrationForm = document.getElementById("registrationForm");
const childStudentId = document.getElementById("childStudentId");
const childStudentWrap = document.getElementById("childStudentWrap");
const privacyConsent = document.getElementById("privacyConsent");
const registrationError = document.getElementById("registrationError");
const registrationSuccess = document.getElementById("registrationSuccess");
const backToLoginLink = document.getElementById("backToLoginLink");
const passwordInput = document.getElementById("regPassword");
const ruleLength = document.getElementById("ruleLength");
const ruleUpper = document.getElementById("ruleUpper");
const ruleNumber = document.getElementById("ruleNumber");
const ruleSpecial = document.getElementById("ruleSpecial");
const passwordToggleButtons = document.querySelectorAll(".password-toggle-btn");
const teacherSubjectsWrap = document.getElementById("teacherSubjectsWrap");
const teacherSubjectChecklist = document.getElementById("teacherSubjectChecklist");
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

const params = new URLSearchParams(window.location.search);
const selectedRole = params.get("role") === "teacher" ? "teacher" : "parent";

function showError(message) {
  registrationSuccess.classList.add("d-none");
  registrationError.textContent = message;
  registrationError.classList.remove("d-none");
}

function showSuccess(message) {
  registrationError.classList.add("d-none");
  registrationSuccess.textContent = message;
  registrationSuccess.classList.remove("d-none");
}

function evaluatePassword(password) {
  return {
    hasLength: password.length >= 8,
    hasUpper: /[A-Z]/.test(password),
    hasNumber: /[0-9]/.test(password),
    hasSpecial: /[^A-Za-z0-9]/.test(password),
  };
}

function toggleRuleState(element, isValid) {
  element.classList.toggle("valid", isValid);
  element.classList.toggle("invalid", !isValid);
}

function updatePasswordRules() {
  const result = evaluatePassword(passwordInput.value);
  toggleRuleState(ruleLength, result.hasLength);
  toggleRuleState(ruleUpper, result.hasUpper);
  toggleRuleState(ruleNumber, result.hasNumber);
  toggleRuleState(ruleSpecial, result.hasSpecial);
  return result;
}

function applyRoleUI() {
  const isParent = selectedRole === "parent";
  childStudentWrap.classList.toggle("d-none", !isParent);
  childStudentId.required = isParent;
  teacherSubjectsWrap.classList.toggle("d-none", isParent);
  if (!isParent) {
    childStudentId.value = "";
  }
}

teacherSubjectChecklist.innerHTML = TEACHER_SUBJECTS.map(
  (subject, index) => `
    <div class="form-check">
      <input class="form-check-input teacher-subject-option" type="checkbox" id="teacherSubject${index}" value="${subject}" />
      <label class="form-check-label" for="teacherSubject${index}">${subject}</label>
    </div>
  `
).join("");

applyRoleUI();
updatePasswordRules();
passwordInput.addEventListener("input", updatePasswordRules);

passwordToggleButtons.forEach((button) => {
  button.addEventListener("click", () => {
    const target = document.getElementById(button.dataset.passwordTarget);
    const isVisible = target.type === "text";
    target.type = isVisible ? "password" : "text";
    button.setAttribute("aria-pressed", String(!isVisible));
    button.setAttribute(
      "aria-label",
      `${isVisible ? "Show" : "Hide"} ${target.id === "regPassword" ? "password" : "confirm password"}`
    );
  });
});

backToLoginLink.href = selectedRole === "teacher" ? "index.html" : "parent-login.html";

registrationForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  registrationError.classList.add("d-none");

  const fullName = document.getElementById("fullName").value.trim();
  const email = document.getElementById("regUsername").value.trim();
  const password = passwordInput.value;
  const confirmPassword = document.getElementById("confirmPassword").value;
  const selectedChild = childStudentId.value.trim();
  const teacherSubjects = Array.from(
    teacherSubjectChecklist.querySelectorAll(".teacher-subject-option:checked")
  ).map((subject) => subject.value);

  if (!fullName || !email || !password || !confirmPassword) {
    showError("Please complete all required fields.");
    return;
  }

  const passwordCheck = updatePasswordRules();
  if (!passwordCheck.hasLength || !passwordCheck.hasUpper || !passwordCheck.hasNumber || !passwordCheck.hasSpecial) {
    showError("Password must have at least 8 characters, 1 uppercase letter, 1 number, and 1 special character.");
    return;
  }
  if (password !== confirmPassword) {
    showError("Passwords do not match.");
    return;
  }
  if (!privacyConsent.checked) {
    showError("You must agree to the data privacy notice before registering.");
    return;
  }
  if (selectedRole === "parent" && !selectedChild) {
    showError("Enter the school-issued Student ID. The school will verify and link your child before granting access.");
    return;
  }
  if (selectedRole === "teacher" && !teacherSubjects.length) {
    showError("Select at least one subject that you teach.");
    return;
  }

  try {
    await window.ptFirebase.signUp({
      email,
      password,
      fullName,
      requestedRole: selectedRole,
      requestedStudentId: selectedRole === "parent" ? selectedChild : "",
      teacherSubjects: selectedRole === "teacher" ? teacherSubjects : [],
    });
    showSuccess(
      selectedRole === "parent"
        ? "Parent access request submitted. The school must verify your relationship and link your child before you can view any student information."
        : "Account request submitted. A school administrator must approve your role before you can sign in."
    );
    registrationForm.reset();
    applyRoleUI();
  } catch (error) {
    const messages = {
      "auth/email-already-in-use": "An account already exists for this email.",
      "auth/invalid-email": "Enter a valid email address.",
      "auth/weak-password": "Choose a stronger password.",
      "auth/network-request-failed": "Could not reach Firebase. Check your internet connection.",
    };
    showError(messages[error.code] || error.message || "Could not create the account.");
  }
});
