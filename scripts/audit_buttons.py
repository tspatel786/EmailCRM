import time
import os
import sys

sys.stdout.reconfigure(encoding='utf-8')

from selenium import webdriver
from selenium.webdriver.chrome.options import Options as ChromeOptions
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC

def audit_all_buttons():
    chrome_path = r'C:\Program Files\Google\Chrome\Application\chrome.exe'
    options = ChromeOptions()
    options.binary_location = chrome_path
    options.add_argument('--headless=new')
    options.add_argument('--window-size=1440,900')
    options.add_argument('--disable-gpu')
    options.add_argument('--no-sandbox')
    
    # Enable browser logs to catch JS errors
    options.set_capability('goog:loggingPrefs', {'browser': 'ALL'})
    
    driver = webdriver.Chrome(options=options)
    wait = WebDriverWait(driver, 15)

    try:
        print("Logging in to CRM...")
        driver.get("https://sales.smpatelithub.in/login")
        time.sleep(2)

        # Login
        driver.find_element(By.CSS_SELECTOR, "input[type='email']").send_keys("sales@smpatelithub.in")
        driver.find_element(By.CSS_SELECTOR, "input[type='password']").send_keys("DemoPass123!")
        driver.find_element(By.CSS_SELECTOR, "button[type='submit']").click()
        
        wait.until(lambda d: "/app" in d.current_url)
        print("Logged in successfully!\n")

        pages = [
            ("Dashboard", "https://sales.smpatelithub.in/app"),
            ("Contacts", "https://sales.smpatelithub.in/app/contacts"),
            ("Companies", "https://sales.smpatelithub.in/app/companies"),
            ("Import Excel", "https://sales.smpatelithub.in/app/import"),
            ("Calls", "https://sales.smpatelithub.in/app/calls"),
            ("Follow-ups", "https://sales.smpatelithub.in/app/follow-ups"),
            ("Campaigns", "https://sales.smpatelithub.in/app/campaigns"),
            ("Templates", "https://sales.smpatelithub.in/app/templates"),
            ("Deals", "https://sales.smpatelithub.in/app/deals"),
            ("Quotations", "https://sales.smpatelithub.in/app/quotations"),
            ("Meetings", "https://sales.smpatelithub.in/app/meetings"),
            ("Projects", "https://sales.smpatelithub.in/app/projects"),
            ("Reports", "https://sales.smpatelithub.in/app/reports"),
            ("Team", "https://sales.smpatelithub.in/app/team"),
            ("Settings", "https://sales.smpatelithub.in/app/settings"),
            ("Audit Logs", "https://sales.smpatelithub.in/app/audit")
        ]

        issues_found = []

        for name, url in pages:
            print(f"--- Auditing Page: {name} ({url}) ---")
            driver.get(url)
            time.sleep(2)

            # Check console errors
            logs = driver.get_log('browser')
            errors = [log for log in logs if log['level'] == 'SEVERE']
            if errors:
                for err in errors:
                    print(f"  [CONSOLE ERROR] {err['message']}")
                    issues_found.append((name, "Console Error", err['message']))

            # Find all buttons on page
            buttons = driver.find_elements(By.TAG_NAME, "button")
            print(f"  Found {len(buttons)} buttons.")
            
            # Look for action buttons like 'New', 'Add', 'Create', 'Export', 'Save'
            action_buttons = []
            for btn in buttons:
                txt = btn.text.strip()
                if txt and not any(skip in txt for skip in ["Logout", "S.M.PATEL", "smpatelithub"]):
                    action_buttons.append((txt, btn))

            print(f"  Action buttons to test: {[t for t, _ in action_buttons]}")

            for txt, btn in action_buttons:
                try:
                    if any(act in txt.lower() for act in ["add", "new", "create", "export", "schedule", "filter"]):
                        print(f"    Testing click on: '{txt}'")
                        driver.execute_script("arguments[0].scrollIntoView({block: 'center', inline: 'nearest'});", btn)
                        time.sleep(0.3)
                        driver.execute_script("arguments[0].click();", btn)
                        time.sleep(1)
                        
                        # Check if a modal or dialog popped up
                        modals = driver.find_elements(By.CSS_SELECTOR, "[role='dialog'], .fixed.inset-0")
                        if modals:
                            print(f"      [OK] Modal opened for '{txt}'")
                            # Close modal if cancel or close button exists
                            close_btns = driver.find_elements(By.XPATH, "//button[contains(., 'Cancel') or contains(., 'Close') or contains(., '×')]")
                            for cb in close_btns:
                                if cb.is_displayed():
                                    cb.click()
                                    time.sleep(0.5)
                                    break
                except Exception as ex:
                    print(f"    [FAIL] Button '{txt}' failed: {ex}")
                    issues_found.append((name, f"Button '{txt}'", str(ex)))

            print()

        print("==================================================")
        print("AUDIT SUMMARY:")
        if not issues_found:
            print("No blocking issues or broken buttons detected!")
        else:
            print(f"Found {len(issues_found)} issues:")
            for page, element, msg in issues_found:
                print(f" - [{page}] {element}: {msg}")
        print("==================================================")

    finally:
        driver.quit()

if __name__ == "__main__":
    audit_all_buttons()
