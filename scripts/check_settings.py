import sys, time
from selenium import webdriver
from selenium.webdriver.chrome.options import Options
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait

options = Options()
options.binary_location = r'C:\Program Files\Google\Chrome\Application\chrome.exe'
options.add_argument('--headless=new')
options.add_argument('--no-sandbox')
driver = webdriver.Chrome(options=options)
wait = WebDriverWait(driver, 15)

try:
    driver.get('https://crm-web-wbq7.onrender.com/login')
    time.sleep(2)
    driver.find_element(By.CSS_SELECTOR, "input[type='email']").send_keys('sales@smpatelithub.in')
    driver.find_element(By.CSS_SELECTOR, "input[type='password']").send_keys('DemoPass123!')
    driver.find_element(By.CSS_SELECTOR, "button[type='submit']").click()
    wait.until(lambda d: '/app' in d.current_url)

    driver.get('https://crm-web-wbq7.onrender.com/app/settings')
    time.sleep(3)
    print('Current URL:', driver.current_url)
    buttons = [b.text for b in driver.find_elements(By.TAG_NAME, 'button')]
    print('All buttons on Settings page:', buttons)
    body_text = driver.find_element(By.TAG_NAME, 'body').text
    print('Body text snippet:\n', body_text)
finally:
    driver.quit()
