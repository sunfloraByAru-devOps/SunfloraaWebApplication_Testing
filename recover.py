import sys

log_path = "/home/someone_practicing/.gemini/antigravity/brain/c6581941-de68-4e66-a230-4f124edff85f/.system_generated/logs/overview.txt"

with open(log_path, "r") as f:
    text = f.read()

# Replace all JSON encoded newlines with actual newlines
text = text.replace("\\\\n", "\\n")

import re

m = re.search(r'Showing lines 1 to 800.*?((?:\\d+: .*?\\n)+)', text, re.DOTALL)
if m:
    block1 = m.group(1)
    lines1 = [re.sub(r'^\\d+: ', '', l) for l in block1.split("\\n") if l.strip()]
else:
    print("Failed 1")
    sys.exit(1)

m2 = re.search(r'Showing lines 790 to 809.*?((?:\\d+: .*?\\n)+)', text, re.DOTALL)
if m2:
    block2 = m2.group(1)
    lines2 = [re.sub(r'^\\d+: ', '', l) for l in block2.split("\\n") if l.strip()]
else:
    print("Failed 2")
    sys.exit(1)

final_lines = lines1[:789]
final_lines.extend(lines2)

with open("src/components/landing/LandingNav.astro", "w") as f:
    f.write("\\n".join(final_lines) + "\\n")
print(f"Recovered {len(final_lines)} lines!")
