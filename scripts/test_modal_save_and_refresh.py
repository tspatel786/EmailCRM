import time
import sys
import uuid

sys.stdout.reconfigure(encoding='utf-8')

from selenium import webdriver
from selenium.webdriver.chrome.options import Options as ChromeOptions
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC

def test_save_and_refresh():
    chrome_path = r'C:\Program Files\Google\Chrome\Application\chrome.exe'
    options = ChromeOptions()
    options.binary_location = chrome_path
    options.add_argument('--headless=new')
    options.add_argument('--window-size=1440,900')
    options.add_argument('--disable-gpu')
    options.add_argument('--no-sandbox')
    
    driver = webdriver.Chrome(options=options)
    wait = WebDriverWait(driver, 20)

    try:
        print("1. Opening local dev server http://localhost:5173/login...")
        driver.get("http://localhost:5173/login")
        time.sleep(2)
        driver.find_element(By.CSS_SELECTOR, "input[type='email']").send_keys("sales@smpatelithub.in")
        driver.find_element(By.CSS_SELECTOR, "input[type='password']").send_keys("DemoPass123!")
        driver.find_element(By.CSS_SELECTOR, "button[type='submit']").click()
        wait.until(lambda d: "/app" in d.current_url)
        print("   Logged in successfully!")

        # --- Test 1: Save Contact and verify immediate appearance in table ---
        print("\n2. Testing Contact Save & Instant List Refresh...")
        driver.get("http://localhost:5173/app/contacts")
        time.sleep(2)
        
        test_contact_name = f"Test Contact {uuid.uuid4().hex[:6]}"
        test_contact_email = f"contact_{uuid.uuid4().hex[:6]}@example.com"
        
        # Click + New Contact
        new_contact_btn = wait.until(EC.element_to_be_clickable((By.XPATH, "//button[contains(., 'New Contact')]")))
        new_contact_btn.click()
        time.sleep(1)

        # Fill modal form
        name_input = driver.find_element(By.NAME, "full_name")
        name_input.send_keys(test_contact_name)
        
        email_input = driver.find_element(By.NAME, "primary_email")
        email_input.send_keys(test_contact_email)

        phone_input = driver.find_element(By.NAME, "primary_phone")
        phone_input.send_keys("+91 98765 43210")

        # Submit form
        save_btn = driver.find_element(By.XPATH, "//div[@role='dialog']//button[@type='submit']")
        save_btn.click()
        print("   Submitted contact form, waiting for modal close and list refresh...")

        # Verify modal closes
        wait.until(EC.invisibility_of_element_located((By.XPATH, "//div[@role='dialog']")))
        print("   Modal closed successfully!")

        # Verify new contact is immediately visible in the table
        time.sleep(2)
        contact_in_table = driver.find_elements(By.XPATH, f"//table//td[contains(., '{test_contact_name}')]")
        if contact_in_table:
            print(f"   SUCCESS: '{test_contact_name}' is immediately present on the contacts list!")
        else:
            raise AssertionError(f"Contact '{test_contact_name}' did not appear in table immediately!")

        # --- Test 2: Save Company and verify immediate appearance in table ---
        print("\n3. Testing Company Save & Instant List Refresh...")
        driver.get("http://localhost:5173/app/companies")
        time.sleep(2)
        
        test_company_name = f"AAA Test Corp {uuid.uuid4().hex[:6]}"
        
        new_company_btn = wait.until(EC.element_to_be_clickable((By.XPATH, "//button[contains(., 'New Company')]")))
        new_company_btn.click()
        time.sleep(1)

        cname_input = driver.find_element(By.NAME, "name")
        cname_input.send_keys(test_company_name)

        save_btn = driver.find_element(By.XPATH, "//div[@role='dialog']//button[@type='submit']")
        save_btn.click()
        print("   Submitted company form...")

        wait.until(EC.invisibility_of_element_located((By.XPATH, "//div[@role='dialog']")))
        print("   Company modal closed!")

        time.sleep(2)
        company_in_table = driver.find_elements(By.XPATH, f"//table//td[contains(., '{test_company_name}')]")
        if company_in_table:
            print(f"   SUCCESS: '{test_company_name}' is immediately present on the companies list!")
        else:
            raise AssertionError(f"Company '{test_company_name}' did not appear in table immediately!")

        # --- Test 3: Save Deal and verify immediate appearance ---
        print("\n4. Testing Deal Save & Instant Refresh...")
        driver.get("http://localhost:5173/app/deals")
        time.sleep(2)
        
        test_deal_title = f"Cloud Migration Deal {uuid.uuid4().hex[:6]}"
        new_deal_btn = wait.until(EC.element_to_be_clickable((By.XPATH, "//button[contains(., 'New Deal')]")))
        new_deal_btn.click()
        time.sleep(1)

        deal_input = driver.find_element(By.NAME, "title")
        deal_input.send_keys(test_deal_title)

        value_input = driver.find_element(By.NAME, "estimated_value")
        value_input.clear()
        value_input.send_keys("75000")

        save_btn = driver.find_element(By.XPATH, "//div[@role='dialog']//button[@type='submit']")
        save_btn.click()
        print("   Submitted deal form...")

        wait.until(EC.invisibility_of_element_located((By.XPATH, "//div[@role='dialog']")))
        print("   Deal modal closed!")

        time.sleep(2)
        deal_in_view = driver.find_elements(By.XPATH, f"//*[contains(text(), '{test_deal_title}')]")
        if deal_in_view:
            print(f"   SUCCESS: '{test_deal_title}' is immediately present on the deals board!")
        else:
            raise AssertionError(f"Deal '{test_deal_title}' did not appear immediately!")

        print("\n==========================================")
        print("ALL BUTTON SAVE & INSTANT REFRESH TESTS PASSED!")
        print("==========================================")

    finally:
        driver.quit()

if __name__ == '__main__':
    test_save_and_refresh()
