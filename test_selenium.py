from selenium import webdriver
from selenium.webdriver.chrome.options import Options
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC
import time

options = Options()
options.add_argument("--headless")
options.add_argument("--no-sandbox")
options.add_argument("--disable-dev-shm-usage")

# Enable performance logging to capture console logs
options.set_capability('goog:loggingPrefs', {'browser': 'ALL'})

driver = webdriver.Chrome(options=options)
driver.get("http://localhost:4321")

time.sleep(2)

print("--- CONSOLE LOGS ---")
for entry in driver.get_log('browser'):
    print(entry['level'], entry['message'])
print("--------------------")

try:
    toggle = driver.find_element(By.ID, "kn-mobile-toggle")
    print("Found toggle, clicking...")
    toggle.click()
    time.sleep(1)
    print("--- CONSOLE LOGS AFTER CLICK ---")
    for entry in driver.get_log('browser'):
        print(entry['level'], entry['message'])
    print("--------------------------------")
except Exception as e:
    print("Error clicking:", e)

driver.quit()
