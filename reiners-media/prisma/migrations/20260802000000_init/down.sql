-- Rollback manual da migration `20260802000000_init`.
--
-- ATENÇÃO: o Prisma Migrate não possui down migration nativa. Este arquivo é
-- mantido à mão e NÃO é executado por `prisma migrate deploy` (que lê apenas
-- `migration.sql`). Ele existe para o Passo 4 do docs/ROLLBACK_PLAN.md §2.
--
-- Uso (rollback completo, banco volta a ficar vazio):
--     psql "$DIRECT_URL" -f prisma/migrations/20260802000000_init/down.sql
--
-- Alternativa suportada pelo Prisma, quando o objetivo é apenas marcar a
-- migration como revertida no histórico (sem derrubar as tabelas):
--     npx prisma migrate resolve --rolled-back 20260802000000_init
--
-- O bloco final remove o registro desta migration de `_prisma_migrations`.
-- Sem isso, um `prisma migrate deploy` posterior responde "No pending
-- migrations to apply" e deixa o banco vazio com o app apontando para ele.

-- DropForeignKey
ALTER TABLE "Episode" DROP CONSTRAINT "Episode_podcastId_fkey";

-- DropTable
DROP TABLE "Podcast";

-- DropTable
DROP TABLE "Episode";

-- DropTable
DROP TABLE "SiteConfig";

-- DropTable
DROP TABLE "AdminUser";

-- DropTable
DROP TABLE "EventLog";

-- DropTable
DROP TABLE "Testimonial";

-- DropTable
DROP TABLE "Plan";

-- DropMigrationRecord
-- Guarda: em um banco onde o Prisma nunca rodou, `_prisma_migrations` não
-- existe e um DELETE direto abortaria o script inteiro.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = current_schema()
      AND table_name = '_prisma_migrations'
  ) THEN
    DELETE FROM "_prisma_migrations"
    WHERE "migration_name" = '20260802000000_init';
  END IF;
END $$;
