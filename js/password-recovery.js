import { repository } from "./app-services.js?v=20260720-glimmer-timezones";

const form = document.querySelector("#recoveryForm");
const password = document.querySelector("#newPassword");
const confirmation = document.querySelector("#confirmNewPassword");
const submit = document.querySelector("#recoverySubmit");
const message = document.querySelector("#recoveryMessage");
let recoveryReady = false;
let recoveryEventReceived = false;

function setReady(ready, text) {
  recoveryReady = ready;
  password.disabled = !ready;
  confirmation.disabled = !ready;
  submit.disabled = !ready;
  message.textContent = text;
}

repository.onAuthStateChange((event, session) => {
  if (event === "PASSWORD_RECOVERY" && session) {
    recoveryEventReceived = true;
    setReady(true, "Enter and confirm your new password.");
  }
});

async function initializeRecovery() {
  const session = await repository.getSession().catch(() => null);
  const recoveryIntent = new URLSearchParams(window.location.hash.slice(1)).get("type") === "recovery"
    || new URLSearchParams(window.location.search).get("type") === "recovery";
  setReady(Boolean(session) && (recoveryEventReceived || recoveryIntent), session && (recoveryEventReceived || recoveryIntent)
    ? "Enter and confirm your new password."
    : "This recovery link is invalid or has expired. Request a new email from the sign-in page.");
}
initializeRecovery();

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!recoveryReady) return;
  if (password.value !== confirmation.value) {
    message.textContent = "Passwords do not match.";
    return;
  }
  setReady(false, "Updating password...");
  try {
    await repository.updatePassword(password.value);
    await repository.signOut();
    message.textContent = "Password updated. Returning to sign in...";
    window.setTimeout(() => window.location.replace("./index.html"), 1200);
  } catch (error) {
    setReady(true, error.message);
  }
});
