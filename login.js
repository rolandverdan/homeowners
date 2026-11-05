const DEMO_EMAIL = "admin@haven.local";
const DEMO_PASSWORD = "HavenAdmin2026";
const AUTH_KEY = "haven-admin-session";

if (sessionStorage.getItem(AUTH_KEY) === "authenticated") {
  window.location.replace("dashboard.html");
}

document.getElementById("login-form").addEventListener("submit", (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  const email = String(new FormData(form).get("email")).trim().toLowerCase();
  const password = String(new FormData(form).get("password"));
  const error = document.getElementById("login-error");

  if (email !== DEMO_EMAIL || password !== DEMO_PASSWORD) {
    error.textContent = "The email or password is incorrect.";
    error.classList.remove("hidden");
    form.elements.password.focus();
    return;
  }

  sessionStorage.setItem(AUTH_KEY, "authenticated");
  window.location.replace("dashboard.html");
});

document.getElementById("password-toggle").addEventListener("click", () => {
  const password = document.getElementById("login-password");
  const showing = password.type === "text";
  password.type = showing ? "password" : "text";
  document.getElementById("password-toggle").setAttribute("aria-label", showing ? "Show password" : "Hide password");
});
