-- AlterEnum
ALTER TYPE "AuthMethod" ADD VALUE 'GOOGLE';

-- AlterTable
ALTER TABLE "auth_credentials" ADD COLUMN     "providerSubject" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "auth_credentials_providerSubject_key" ON "auth_credentials"("providerSubject");
