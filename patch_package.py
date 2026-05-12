import json

with open("package.json", "r") as f:
    pkg = json.load(f)

pkg["scripts"]["test:targetResolver"] = "npx ts-node scripts/test-targetResolver.ts"

# also run it in security-check to make sure it runs during build/lint checks? Or maybe leave it
with open("package.json", "w") as f:
    json.dump(pkg, f, indent=2)
