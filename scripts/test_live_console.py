from selenium import webdriver
from selenium.webdriver.chrome.options import Options as ChromeOptions
from selenium.webdriver.common.by import By
import time

options = ChromeOptions()
options.binary_location = r"C:\Program Files\Google\Chrome\Application\chrome.exe"
options.add_argument("--headless=new")
options.set_capability("goog:loggingPrefs", {"browser": "ALL"})

driver = webdriver.Chrome(options=options)
try:
    print("Navigating to https://crm-web-wbq7.onrender.com/login...")
    driver.get("https://crm-web-wbq7.onrender.com/login")
    time.sleep(3)

    print("Initial Console Logs:")
    for entry in driver.get_log("browser"):
        print(f"[{entry['level']}] {entry['message']}")

    email_input = driver.find_element(By.CSS_SELECTOR, "input[type='email']")
    email_input.send_keys("sales@smpatelithub.in")
    pass_input = driver.find_element(By.CSS_SELECTOR, "input[type='password']")
    pass_input.send_keys("DemoPass123!")

    btn = driver.find_element(By.CSS_SELECTOR, "button[type='submit']")
    btn.click()
    print("Clicked submit...")
    time.sleep(4)

    print("After Submit Console Logs:")
    for entry in driver.get_log("browser"):
        print(f"[{entry['level']}] {entry['message']}")

    print("Current URL:", driver.current_url)
finally:
    driver.quit()
