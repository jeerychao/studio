/*
  Warnings:

  - You are about to drop the column `accessType` on the `OperatorDictionary` table. All the data in the column will be lost.

*/
-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_OperatorDictionary" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "operatorName" TEXT NOT NULL,
    "operatorDevice" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_OperatorDictionary" ("createdAt", "id", "operatorDevice", "operatorName", "updatedAt") SELECT "createdAt", "id", "operatorDevice", "operatorName", "updatedAt" FROM "OperatorDictionary";
DROP TABLE "OperatorDictionary";
ALTER TABLE "new_OperatorDictionary" RENAME TO "OperatorDictionary";
CREATE UNIQUE INDEX "OperatorDictionary_operatorName_key" ON "OperatorDictionary"("operatorName");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
