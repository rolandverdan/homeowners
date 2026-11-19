import { auth } from "./firebase.js";
import { signInWithEmailAndPassword, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/13.3.0/firebase-auth.js";

if (auth) onAuthStateChanged(auth, (user) => { if (user) window.location.replace("dashboard.html"); });

document.getElementById("login-form").addEventListener("submit", (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  const email = String(new FormData(form).get("email")).trim().toLowerCase();
  const password = String(new FormData(form).get("password"));
  const error = document.getElementById("login-error");

  if (!auth) {
    error.textContent = "Add your Firebase web app settings before signing in.";
    error.classList.remove("hidden");
    return;
  }
  signInWithEmailAndPassword(auth, email, password)
    .then(() => window.location.replace("dashboard.html"))
    .catch(() => {
      error.textContent = "Sign-in failed. Check your email and password.";
      error.classList.remove("hidden");
      form.elements.password.focus();
    });
});

document.getElementById("password-toggle").addEventListener("click", () => {
  const password = document.getElementById("login-password");
  const showing = password.type === "text";
  password.type = showing ? "password" : "text";
  document.getElementById("password-toggle").setAttribute("aria-label", showing ? "Show password" : "Hide password");
});
