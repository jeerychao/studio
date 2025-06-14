#!/bin/sh
echo "--- [SEED SCRIPT RUNNER] Executing prisma/seed.sh ---"

# Ensure we are in the project root directory for consistent pathing
# cd "$(dirname "$0")/.."

echo "--- [SEED SCRIPT RUNNER] Running: node ./node_modules/.bin/prisma generate ---"
node ./node_modules/.bin/prisma generate
if [ $? -ne 0 ]; then
  echo "--- [SEED SCRIPT RUNNER] ERROR: prisma generate failed ---"
  exit 1
fi
echo "--- [SEED SCRIPT RUNNER] prisma generate completed successfully. ---"

echo "--- [SEED SCRIPT RUNNER] Running: node ./node_modules/.bin/ts-node ./prisma/seed.ts ---"
node ./node_modules/.bin/ts-node ./prisma/seed.ts
if [ $? -ne 0 ]; then
  echo "--- [SEED SCRIPT RUNNER] ERROR: ts-node ./prisma/seed.ts failed ---"
  exit 1
fi
echo "--- [SEED SCRIPT RUNNER] ts-node ./prisma/seed.ts completed. ---"

echo "--- [SEED SCRIPT RUNNER] Finished prisma/seed.sh ---"
exit 0
