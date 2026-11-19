const LOGIN_PAGE = "login.html";
import { auth } from "./firebase.js";

if (document.body.dataset.page !== "public") {
  if (!auth) {
    window.location.replace(LOGIN_PAGE);
  } else {
    const { onAuthStateChanged, signOut } = await import("https://www.gstatic.com/firebasejs/13.3.0/firebase-auth.js");
    onAuthStateChanged(auth, (user) => {
      if (!user) window.location.replace(LOGIN_PAGE);
    });
    document.addEventListener("click", (event) => {
      if (!(event.target instanceof Element) || !event.target.closest("#logout-button")) return;
      signOut(auth).finally(() => window.location.replace(LOGIN_PAGE));
    });
  }
}
