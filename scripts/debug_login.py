from selenium import webdriver
from selenium.webdriver.chrome.options import Options as ChromeOptions
from selenium.webdriver.common.by import By
import time
import sys

sys.stdout.reconfigure(encoding='utf-8')

options = ChromeOptions()
options.binary_location = r'C:\Program Files\Google\Chrome\Application\chrome.exe'
options.add_argument('--headless=new')
options.set_capability('goog:loggingPrefs', {'browser': 'ALL'})
driver = webdriver.Chrome(options=options)
try:
    driver.get('http://localhost:5173/login')
    time.sleep(2)
    inputs = driver.find_elements(By.TAG_NAME, 'input')
    print('Inputs found:', len(inputs))
    for i in inputs:
        print('Input type:', i.get_attribute('type'), 'name:', i.get_attribute('name'), 'placeholder:', i.get_attribute('placeholder'))
    driver.find_element(By.CSS_SELECTOR, "input[type='email']").send_keys('sales@smpatelithub.in')
    driver.find_element(By.CSS_SELECTOR, "input[type='password']").send_keys('DemoPass123!')
    btn = driver.find_element(By.CSS_SELECTOR, "button[type='submit']")
    print('Submit button:', btn.text)
    btn.click()
    time.sleep(5)
    print('Current URL:', driver.current_url)
    for entry in driver.get_log('browser'):
        print('BROWSER LOG:', entry)
finally:
    driver.quit()
