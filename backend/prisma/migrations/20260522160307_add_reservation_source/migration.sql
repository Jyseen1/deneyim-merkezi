-- AlterTable
ALTER TABLE "reservations" ADD COLUMN     "source" TEXT DEFAULT 'web',
ADD COLUMN     "telegramChatId" TEXT;
