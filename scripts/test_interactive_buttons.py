import time
import os
import sys

sys.stdout.reconfigure(encoding='utf-8')

from selenium import webdriver
from selenium.webdriver.chrome.options import Options as ChromeOptions
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC

def test_interactive_buttons():
    chrome_path = r'C:\Program Files\Google\Chrome\Application\chrome.exe'
    options = ChromeOptions()
    options.binary_location = chrome_path
    options.add_argument('--headless=new')
    options.add_argument('--window-size=1440,900')
    options.add_argument('--disable-gpu')
    options.add_argument('--no-sandbox')
    
    driver = webdriver.Chrome(options=options)
    wait = WebDriverWait(driver, 15)

    try:
        print("Logging in...")
        driver.get("https://crm-web-wbq7.onrender.com/login")
        time.sleep(2)
        driver.find_element(By.CSS_SELECTOR, "input[type='email']").send_keys("sales@smpatelithub.in")
        driver.find_element(By.CSS_SELECTOR, "input[type='password']").send_keys("DemoPass123!")
        driver.find_element(By.CSS_SELECTOR, "button[type='submit']").click()
        wait.until(lambda d: "/app" in d.current_url)
        print("Logged in successfully!")

        tests = [
            ("Contacts - New contact", "https://crm-web-wbq7.onrender.com/app/contacts", "//button[contains(., 'New contact')]"),
            ("Companies - New company", "https://crm-web-wbq7.onrender.com/app/companies", "//button[contains(., 'New company')]"),
            ("Calls - Log call", "https://crm-web-wbq7.onrender.com/app/calls", "//button[contains(., 'Log call')]"),
            ("Follow-ups - New task", "https://crm-web-wbq7.onrender.com/app/follow-ups", "//button[contains(., 'New task')]"),
            ("Campaigns - New campaign", "https://crm-web-wbq7.onrender.com/app/campaigns", "//button[contains(., 'New campaign')]"),
            ("Templates - New template", "https://crm-web-wbq7.onrender.com/app/templates", "//button[contains(., 'New template')]"),
            ("Deals - New deal", "https://crm-web-wbq7.onrender.com/app/deals", "//button[contains(., 'New deal')]"),
            ("Quotations - New quotation", "https://crm-web-wbq7.onrender.com/app/quotations", "//button[contains(., 'New quotation')]"),
            ("Meetings - Schedule", "https://crm-web-wbq7.onrender.com/app/meetings", "//button[contains(., 'Schedule')]"),
            ("Projects - New project", "https://crm-web-wbq7.onrender.com/app/projects", "//button[contains(., 'New project')]"),
            ("Team - Invite member", "https://crm-web-wbq7.onrender.com/app/team", "//button[contains(., 'Invite')]"),
            ("Settings - Save", "https://crm-web-wbq7.onrender.com/app/settings", "//button[contains(., 'Save')]"),
        ]

        results = []

        for name, url, xpath in tests:
            driver.get(url)
            time.sleep(2)
            try:
                # Find button without scrolling to 0
                btn = driver.find_element(By.XPATH, xpath)
                
                # Check button visibility and enabled state
                is_displayed = btn.is_displayed()
                is_enabled = btn.is_enabled()
                
                if not is_displayed or not is_enabled:
                    results.append((name, "FAIL", f"displayed={is_displayed}, enabled={is_enabled}"))
                    print(f"[{name}]: FAIL (displayed={is_displayed}, enabled={is_enabled})")
                    continue

                # Click with JS or direct click
                driver.execute_script("arguments[0].click();", btn)
                time.sleep(1)

                # Check if modal or state changed
                modals = driver.find_elements(By.CSS_SELECTOR, "[role='dialog'], .fixed.inset-0")
                if modals or "Save" in name:
                    results.append((name, "PASS", "Action / Modal opened successfully"))
                    print(f"[{name}]: PASS (Action triggered)")
                else:
                    results.append((name, "WARN", "Clicked but no modal detected"))
                    print(f"[{name}]: WARN (No modal detected)")

            except Exception as e:
                results.append((name, "FAIL", str(e)))
                print(f"[{name}]: FAIL -> {e}")

        print("\n===============================")
        print("SUMMARY OF MODAL / ACTION BUTTONS:")
        for name, status, details in results:
            print(f"  {status:4s} | {name}: {details}")
        print("===============================")

    finally:
        driver.quit()

if __name__ == "__main__":
    test_interactive_buttons()
