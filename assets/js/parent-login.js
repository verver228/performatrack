const parentLoginForm = document.getElementById("parentLoginForm");
const parentLoginError = document.getElementById("parentLoginError");
const parentUsernameInput = document.getElementById("parentUsername");
const parentPasswordInput = document.getElementById("parentPassword");
const toggleParentPasswordBtn = document.getElementById("toggleParentPasswordBtn");
const parentCapsLockHint = document.getElementById("parentCapsLockHint");
const parentRecentLoginHint = document.getElementById("parentRecentLoginHint");
const parentGoogleStudentId = document.getElementById("parentGoogleStudentId");
const parentGoogleLoginBtn = document.getElementById("parentGoogleLoginBtn");
const parentGoogleStudentIdModal = document.getElementById("parentGoogleStudentIdModal");
const parentGoogleStudentIdError = document.getElementById("parentGoogleStudentIdError");
const submitParentGoogleStudentIdBtn = document.getElementById("submitParentGoogleStudentIdBtn");

function requestParentGoogleStudentId() {
  const modal = bootstrap.Modal.getOrCreateInstance(parentGoogleStudentIdModal);
  parentGoogleStudentId.value = "";
  parentGoogleStudentIdError.classList.add("d-none");

  return new Promise((resolve) => {
    let resolved = false;
    const finish = (studentId) => {
      if (resolved) {
        return;
      }
      resolved = true;
      submitParentGoogleStudentIdBtn.removeEventListener("click", handleSubmit);
      parentGoogleStudentIdModal.removeEventListener("hidden.bs.modal", handleHidden);
      modal.hide();
      resolve(studentId);
    };
    const handleSubmit = () => {
      const studentId = parentGoogleStudentId.value.trim();
      if (!studentId) {
        parentGoogleStudentIdError.classList.remove("d-none");
        parentGoogleStudentId.focus();
        return;
      }
      finish(studentId);
    };
    const handleHidden = () => finish(null);

    submitParentGoogleStudentIdBtn.addEventListener("click", handleSubmit);
    parentGoogleStudentIdModal.addEventListener("hidden.bs.modal", handleHidden);
    modal.show();
    parentGoogleStudentIdModal.addEventListener(
      "shown.bs.modal",
      () => parentGoogleStudentId.focus(),
      { once: true }
    );
  });
}

function showParentLoginError(message) {
  parentLoginError.textContent = message;
  parentLoginError.classList.remove("d-none");
}

const params = new URLSearchParams(window.location.search);
if (params.get("notice") === "pending") {
  showParentLoginError(
    "Your request is pending. The school must verify your relationship and link your child before you can view student information."
  );
} else if (params.get("notice") === "setup") {
  showParentLoginError(
    "Your parent account is not linked to a student yet. Contact your school administrator to complete verification."
  );
}

const lastEmail = localStorage.getItem("ptLastParentUsername");
if (lastEmail) {
  parentUsernameInput.value = lastEmail;
  parentRecentLoginHint.textContent = `Recent email: ${lastEmail}`;
  parentRecentLoginHint.classList.remove("d-none");
}

toggleParentPasswordBtn.addEventListener("click", () => {
  const isHidden = parentPasswordInput.type === "password";
  parentPasswordInput.type = isHidden ? "text" : "password";
  toggleParentPasswordBtn.setAttribute("aria-pressed", String(isHidden));
  toggleParentPasswordBtn.setAttribute("aria-label", isHidden ? "Hide password" : "Show password");
});

parentPasswordInput.addEventListener("keyup", (event) => {
  const capsOn = event.getModifierState && event.getModifierState("CapsLock");
  parentCapsLockHint.classList.toggle("d-none", !capsOn);
});

parentLoginForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  parentLoginError.classList.add("d-none");

  const email = parentUsernameInput.value.trim();
  const password = parentPasswordInput.value;
  if (!email || !password) {
    showParentLoginError("Please enter your email and password.");
    return;
  }

  try {
    const { profile } = await window.ptFirebase.signIn(email, password);
    if (profile.role !== "parent") {
      await window.ptFirebase.signOut(window.ptFirebase.auth);
      showParentLoginError("This account is not set up as a parent account.");
      return;
    }
    if (!profile.studentId || !profile.studentDocId) {
      await window.ptFirebase.signOut(window.ptFirebase.auth);
      showParentLoginError("Your parent account is not linked to a student yet. Contact your school administrator.");
      return;
    }
    localStorage.setItem("ptLastParentUsername", email);
    window.location.href = `student-dashboard.html?id=${encodeURIComponent(profile.studentId)}`;
  } catch (error) {
    const messages = {
      "auth/invalid-credential": "The email or password is incorrect.",
      "auth/invalid-email": "Enter a valid email address.",
      "auth/too-many-requests": "Too many attempts. Please wait and try again.",
      "auth/network-request-failed": "Could not reach Firebase. Check your internet connection.",
    };
    const message = error.message?.includes("waiting for school approval")
      ? "Your request is pending. The school must verify your relationship and link your child before you can view student information."
      : messages[error.code] || error.message || "Sign-in failed.";
    showParentLoginError(message);
  }
});

parentGoogleLoginBtn.addEventListener("click", async () => {
  parentLoginError.classList.add("d-none");
  parentGoogleLoginBtn.disabled = true;
  parentGoogleLoginBtn.textContent = "Connecting to Google...";

  try {
    const { user, profile } = await window.ptFirebase.signInWithGoogle({
      requestedRole: "parent",
      email: parentUsernameInput.value.trim(),
      password: parentPasswordInput.value,
      requestParentStudentId: requestParentGoogleStudentId,
    });
    const email = user.email || "";
    if (email) {
      localStorage.setItem("ptLastParentUsername", email);
    }
    window.location.href = `student-dashboard.html?id=${encodeURIComponent(profile.studentId)}`;
  } catch (error) {
    const messages = {
      "auth/popup-closed-by-user": "Google sign-in was cancelled.",
      "auth/popup-blocked": "Allow popups for this site, then try Google sign-in again.",
      "auth/unauthorized-domain": "This website domain is not enabled for Google sign-in in Firebase.",
      "auth/operation-not-allowed": "Google sign-in is not enabled in Firebase Authentication yet.",
      "auth/network-request-failed": "Could not reach Firebase. Check your internet connection.",
      "auth/invalid-credential": "The email or password is incorrect. Check them and try linking Google again.",
    };
    const message = error.message?.includes("waiting for school approval")
      ? "Your request is pending. The school must verify your relationship and link your child before you can view student information."
      : messages[error.code] || error.message || "Google sign-in failed.";
    showParentLoginError(message);
  } finally {
    parentGoogleLoginBtn.disabled = false;
    parentGoogleLoginBtn.innerHTML = '<span class="google-mark" aria-hidden="true">G</span> Continue with Google';
  }
});
