const AUTH_KEY = "haven-admin-session";
const LOGIN_PAGE = "login.html";

if (document.body.dataset.page !== "public" && sessionStorage.getItem(AUTH_KEY) !== "authenticated") {
  window.location.replace(LOGIN_PAGE);
}

document.addEventListener("click", (event) => {
  if (!(event.target instanceof Element) || !event.target.closest("#logout-button")) return;
  sessionStorage.removeItem(AUTH_KEY);
  window.location.replace(LOGIN_PAGE);
});
