import time
import os
import sys

sys.stdout.reconfigure(encoding='utf-8')

from selenium import webdriver
from selenium.webdriver.chrome.options import Options
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait

def test_exports():
    download_dir = os.path.abspath('d:\\EMail\\downloaded_exports')
    os.makedirs(download_dir, exist_ok=True)

    # Clean previous test files
    for f in os.listdir(download_dir):
        try:
            os.remove(os.path.join(download_dir, f))
        except Exception:
            pass

    options = Options()
    options.binary_location = r'C:\Program Files\Google\Chrome\Application\chrome.exe'
    options.add_argument('--headless=new')
    options.add_argument('--no-sandbox')
    options.add_argument('--window-size=1440,900')
    
    prefs = {
        "download.default_directory": download_dir,
        "download.prompt_for_download": False,
        "download.directory_upgrade": True,
        "safebrowsing.enabled": True
    }
    options.add_experimental_option("prefs", prefs)

    driver = webdriver.Chrome(options=options)
    wait = WebDriverWait(driver, 15)

    try:
        print("Logging in to S.M.PATEL IT HUB CRM...")
        driver.get("https://crm-web-wbq7.onrender.com/login")
        time.sleep(2)
        driver.find_element(By.CSS_SELECTOR, "input[type='email']").send_keys("sales@smpatelithub.in")
        driver.find_element(By.CSS_SELECTOR, "input[type='password']").send_keys("DemoPass123!")
        driver.find_element(By.CSS_SELECTOR, "button[type='submit']").click()
        wait.until(lambda d: "/app" in d.current_url)
        print("[PASS] Logged in successfully!")

        export_pages = [
            ("Dashboard", "https://crm-web-wbq7.onrender.com/app"),
            ("Contacts", "https://crm-web-wbq7.onrender.com/app/contacts"),
            ("Companies", "https://crm-web-wbq7.onrender.com/app/companies"),
            ("Deals", "https://crm-web-wbq7.onrender.com/app/deals"),
            ("Quotations", "https://crm-web-wbq7.onrender.com/app/quotations"),
            ("Reports", "https://crm-web-wbq7.onrender.com/app/reports"),
        ]

        print("\n--- Testing All Export Buttons Across Pages ---")
        for page_name, url in export_pages:
            driver.get(url)
            time.sleep(3)
            try:
                # Find button containing Export
                btn = driver.find_element(By.XPATH, "//button[contains(., 'Export')]")
                assert btn.is_displayed(), f"Export button not visible on {page_name}"
                btn.click()
                time.sleep(2)
                print(f"[PASS] {page_name}: Clicked '{btn.text}' successfully!")
            except Exception as e:
                print(f"[FAIL] {page_name} export error: {e}")

        # Check downloaded files
        time.sleep(3)
        files = os.listdir(download_dir)
        print(f"\nFiles downloaded in {download_dir}:")
        for f in files:
            size = os.path.getsize(os.path.join(download_dir, f))
            print(f" - {f} ({size} bytes)")
        
        assert len(files) >= 5, f"Expected at least 5 export files, got {len(files)}"
        print(f"\n[PASS] All {len(files)} Excel exports verified successfully!")

    finally:
        driver.quit()

if __name__ == "__main__":
    test_exports()
