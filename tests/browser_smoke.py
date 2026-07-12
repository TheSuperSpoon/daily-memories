import subprocess
import sys
import time

from playwright.sync_api import sync_playwright


BASE_URL = "http://127.0.0.1:4173"


def main():
    server = subprocess.Popen(
        [sys.executable, "-m", "http.server", "4173", "--bind", "127.0.0.1"],
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )
    time.sleep(0.5)
    try:
        with sync_playwright() as playwright:
            browser = playwright.chromium.launch(headless=True)
            page = browser.new_page()
            errors = []
            page.on("pageerror", lambda error: errors.append(str(error)))

            page.goto(f"{BASE_URL}/index.html", wait_until="networkidle")
            page.locator("#gate").wait_for(state="visible")
            assert page.locator("#site").is_hidden()
            assert page.locator("#authSubmitButton").text_content() == "Sign in"

            page.locator("#showRegisterMode").click()
            assert page.locator("#authDisplayName").is_visible()
            assert page.locator("#authConfirmPassword").is_visible()
            assert page.locator("#authSubmitButton").text_content() == "Create account"

            page.locator("#showLoginMode").click()
            assert page.locator("#authDisplayName").is_hidden()
            assert page.locator("#forgotPasswordButton").is_visible()

            recovery = browser.new_page()
            recovery.goto(f"{BASE_URL}/update-password.html", wait_until="networkidle")
            recovery.locator("#recoveryMessage").wait_for()
            assert "invalid or has expired" in recovery.locator("#recoveryMessage").text_content().lower()
            assert recovery.locator("#recoverySubmit").is_disabled()

            assert not errors, errors
            browser.close()
    finally:
        server.terminate()
        server.wait(timeout=5)


if __name__ == "__main__":
    main()
