// @vitest-environment node
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

const MIGRATIONS_DIR = path.resolve(process.cwd(), 'prisma/migrations');
const INIT_DIR = path.join(MIGRATIONS_DIR, '20260802000000_init');

const UP_PATH = path.join(INIT_DIR, 'migration.sql');
const DOWN_PATH = path.join(INIT_DIR, 'down.sql');
const LOCK_PATH = path.join(MIGRATIONS_DIR, 'migration_lock.toml');

const up = readFileSync(UP_PATH, 'utf8');
const down = readFileSync(DOWN_PATH, 'utf8');

const TABLES = [
  'Podcast',
  'Episode',
  'SiteConfig',
  'AdminUser',
  'EventLog',
  'Testimonial',
  'Plan',
] as const;

const INDEXES = [
  'Podcast_status_idx',
  'Podcast_featured_idx',
  'Podcast_displayOrder_idx',
  'Episode_podcastId_idx',
  'Episode_publishedAt_idx',
  'EventLog_eventType_idx',
  'EventLog_createdAt_idx',
] as const;

const UNIQUE_INDEXES = ['Podcast_slug_key', 'AdminUser_email_key'] as const;

describe('migration inicial — arquivos', () => {
  it('a pasta da migration contém up e down', () => {
    expect(existsSync(UP_PATH)).toBe(true);
    expect(existsSync(DOWN_PATH)).toBe(true);
  });

  it('migration_lock.toml fixa o provider postgresql', () => {
    expect(existsSync(LOCK_PATH)).toBe(true);
    expect(readFileSync(LOCK_PATH, 'utf8')).toMatch(
      /provider\s*=\s*"postgresql"/,
    );
  });
});

describe('migration.sql (up)', () => {
  it.each(TABLES)('cria a tabela %s', (table) => {
    expect(up).toMatch(new RegExp(`CREATE TABLE "${table}"`));
  });

  it('cria exatamente 7 tabelas', () => {
    const created = Array.from(up.matchAll(/CREATE TABLE "(\w+)"/g), (m) => m[1]);
    expect(created.sort()).toEqual([...TABLES].sort());
  });

  it.each(INDEXES)('cria o índice %s', (index) => {
    expect(up).toMatch(new RegExp(`CREATE INDEX "${index}" ON`));
  });

  it.each(UNIQUE_INDEXES)('cria o índice único %s', (index) => {
    expect(up).toMatch(new RegExp(`CREATE UNIQUE INDEX "${index}" ON`));
  });

  it('cria a foreign key Episode -> Podcast com ON DELETE CASCADE', () => {
    expect(up).toMatch(
      /ALTER TABLE "Episode" ADD CONSTRAINT "Episode_podcastId_fkey" FOREIGN KEY \("podcastId"\) REFERENCES "Podcast"\("id"\) ON DELETE CASCADE/,
    );
  });

  it('define as primary keys de todas as tabelas', () => {
    for (const table of TABLES) {
      expect(up).toMatch(
        new RegExp(`CONSTRAINT "${table}_pkey" PRIMARY KEY \\("id"\\)`),
      );
    }
  });

  it('usa JSONB para os campos Json', () => {
    expect(up).toMatch(/"hosts" JSONB/);
    expect(up).toMatch(/"socialLinks" JSONB/);
    expect(up).toMatch(/"payload" JSONB/);
    expect(up).toMatch(/"features" JSONB NOT NULL/);
  });

  it('aplica os defaults do design system', () => {
    expect(up).toMatch(/"accentColor" TEXT NOT NULL DEFAULT '#d87dff'/);
    expect(up).toMatch(/"primaryColor" TEXT NOT NULL DEFAULT '#d87dff'/);
    expect(up).toMatch(/"role" TEXT NOT NULL DEFAULT 'EDITOR'/);
  });

  it('não contém comandos destrutivos', () => {
    expect(up).not.toMatch(/DROP TABLE/);
  });
});

describe('down.sql (rollback)', () => {
  it.each(TABLES)('derruba a tabela %s', (table) => {
    expect(down).toMatch(new RegExp(`DROP TABLE "${table}"`));
  });

  it('derruba exatamente as 7 tabelas criadas pelo up', () => {
    const dropped = Array.from(down.matchAll(/DROP TABLE "(\w+)"/g), (m) => m[1]);
    expect(dropped.sort()).toEqual([...TABLES].sort());
  });

  it('remove a foreign key antes de derrubar as tabelas', () => {
    const fkIndex = down.indexOf('DROP CONSTRAINT "Episode_podcastId_fkey"');
    const firstDrop = down.indexOf('DROP TABLE');

    expect(fkIndex).toBeGreaterThanOrEqual(0);
    expect(fkIndex).toBeLessThan(firstDrop);
  });

  it('não cria nada', () => {
    expect(down).not.toMatch(/CREATE TABLE/);
  });
});

describe('down.sql — histórico de migrations (docs/ROLLBACK_PLAN.md §2)', () => {
  it('remove o registro da migration em _prisma_migrations', () => {
    expect(down).toMatch(/DELETE FROM "_prisma_migrations"/);
    expect(down).toMatch(/"migration_name"\s*=\s*'20260802000000_init'/);
  });

  it('protege o DELETE quando _prisma_migrations não existe', () => {
    expect(down).toMatch(/information_schema\.tables/);
    expect(down).toMatch(/IF EXISTS/);
    expect(down).toMatch(/DO \$\$/);
  });

  it('limpa o histórico depois de derrubar as tabelas', () => {
    const lastDrop = down.lastIndexOf('DROP TABLE');
    const cleanup = down.indexOf('DELETE FROM "_prisma_migrations"');

    expect(cleanup).toBeGreaterThan(lastDrop);
  });

  it('documenta a ausência de down nativa e a alternativa suportada', () => {
    expect(down).toMatch(/prisma migrate resolve --rolled-back 20260802000000_init/);
  });

  it('o nome da migration no down bate com a pasta da migration', () => {
    const folder = path.basename(INIT_DIR);
    expect(down).toContain(folder);
  });
});
