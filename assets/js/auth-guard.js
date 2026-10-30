function parseCurrentUser() {
  const raw = sessionStorage.getItem("ptCurrentUser");
  if (!raw) {
    return null;
  }

  try {
    return JSON.parse(raw);
  } catch (error) {
    return null;
  }
}

(function enforceRoleAccess() {
  const currentPage = window.location.pathname.split("/").pop().toLowerCase();
  const publicPages = ["index.html", "parent-login.html", "registration.html"];

  if (publicPages.includes(currentPage)) {
    return;
  }

  const user = parseCurrentUser();
  if (!user || !user.role) {
    if (currentPage === "student-dashboard.html") {
      window.location.href = "parent-login.html";
    } else {
      window.location.href = "index.html";
    }
    return;
  }

  const teacherOnlyPages = [
    "teacher-dashboard.html",
    "grades.html",
    "attendance.html",
    "reports.html",
  ];

  if (user.role === "parent" && teacherOnlyPages.includes(currentPage)) {
    const childId = user.studentId;
    if (!childId || !user.studentDocId) {
      window.location.href = "parent-login.html?notice=setup";
      return;
    }
    window.location.href = `student-dashboard.html?id=${encodeURIComponent(childId)}`;
    return;
  }

  if (user.role !== "teacher" && user.role !== "parent") {
    window.location.href = "index.html";
    return;
  }

  if (user.role === "parent" && currentPage === "student-dashboard.html") {
    const childId = user.studentId;
    if (!childId || !user.studentDocId) {
      window.location.replace("parent-login.html?notice=setup");
      return;
    }
    const params = new URLSearchParams(window.location.search);
    const requestedId = params.get("id");

    if (requestedId !== childId) {
      window.location.replace(`student-dashboard.html?id=${encodeURIComponent(childId)}`);
      return;
    }
  }

  window.ptCurrentUser = user;
  const sidebarWelcome = document.getElementById("sidebarWelcome");
  const firstName = String(user.fullName || "").trim().split(/\s+/)[0];
  if (sidebarWelcome && firstName) {
    sidebarWelcome.textContent = `Welcome, ${firstName}`;
  }
})();

// Make the "Logout" links actually end the session. Without this they only
// navigate to index.html while leaving ptCurrentUser in sessionStorage, which
// would let someone walk straight back into a protected page.
const logoutLinks = Array.from(document.querySelectorAll("a")).filter(
  (link) => link.textContent.trim().toLowerCase() === "logout"
);

logoutLinks.forEach((link) => {
  link.addEventListener("click", async (event) => {
    event.preventDefault();
    try {
      await window.ptFirebase.signOut(window.ptFirebase.auth);
    } catch (error) {
      console.error("PERFORMATRACK could not sign out of Firebase.", error);
    }
    sessionStorage.removeItem("ptCurrentUser");
    window.location.href = "index.html";
  });
});
