import { readFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

// process.cwd() é a raiz do projeto sob vitest e funciona em qualquer
// environment (jsdom não expõe import.meta.url como file://).
const SCHEMA_PATH = path.resolve(process.cwd(), 'prisma/schema.prisma');

const schema = readFileSync(SCHEMA_PATH, 'utf8');

/** Extrai o corpo de um `model X { ... }` do schema Prisma. */
function modelBlock(name: string): string {
  const match = new RegExp(`model\\s+${name}\\s*\\{([\\s\\S]*?)\\n\\}`, 'm').exec(
    schema,
  );

  expect(match, `model ${name} não encontrado em schema.prisma`).not.toBeNull();
  return match![1];
}

const EXPECTED_MODELS = [
  'Podcast',
  'Episode',
  'SiteConfig',
  'AdminUser',
  'EventLog',
  'Testimonial',
  'Plan',
] as const;

describe('prisma/schema.prisma — estrutura', () => {
  it('declara o datasource PostgreSQL com DATABASE_URL e DIRECT_URL', () => {
    expect(schema).toMatch(/provider\s*=\s*"postgresql"/);
    expect(schema).toMatch(/url\s*=\s*env\("DATABASE_URL"\)/);
    expect(schema).toMatch(/directUrl\s*=\s*env\("DIRECT_URL"\)/);
  });

  it('declara o generator prisma-client-js', () => {
    expect(schema).toMatch(/generator\s+client\s*\{[\s\S]*?provider\s*=\s*"prisma-client-js"/);
  });

  it.each(EXPECTED_MODELS)('declara o model %s', (model) => {
    expect(schema).toMatch(new RegExp(`model\\s+${model}\\s*\\{`));
  });

  it('não declara models além dos 7 previstos em DATA_MODEL.md', () => {
    const declared = Array.from(
      schema.matchAll(/^model\s+(\w+)\s*\{/gm),
      (m) => m[1],
    );
    expect(declared.sort()).toEqual([...EXPECTED_MODELS].sort());
  });
});

describe('Podcast', () => {
  const block = modelBlock('Podcast');

  it('tem slug único', () => {
    expect(block).toMatch(/slug\s+String\s+@unique/);
  });

  it('tem deletedAt opcional para soft delete', () => {
    expect(block).toMatch(/deletedAt\s+DateTime\?/);
  });

  it('tem hosts e socialLinks como Json opcional', () => {
    expect(block).toMatch(/hosts\s+Json\?/);
    expect(block).toMatch(/socialLinks\s+Json\?/);
  });

  it('tem accentColor com default do design system', () => {
    expect(block).toMatch(/accentColor\s+String\s+@default\("#d87dff"\)/);
  });

  it('tem featured e displayOrder com defaults', () => {
    expect(block).toMatch(/featured\s+Boolean\s+@default\(false\)/);
    expect(block).toMatch(/displayOrder\s+Int\s+@default\(0\)/);
  });

  it('tem a relação 1:N com Episode', () => {
    expect(block).toMatch(/episodes\s+Episode\[\]/);
  });

  it.each(['status', 'featured', 'displayOrder'])(
    'declara o índice @@index([%s])',
    (column) => {
      expect(block).toMatch(new RegExp(`@@index\\(\\[${column}\\]\\)`));
    },
  );
});

describe('Episode', () => {
  const block = modelBlock('Episode');

  it('referencia Podcast com onDelete: Cascade', () => {
    expect(block).toMatch(
      /podcast\s+Podcast\s+@relation\(fields:\s*\[podcastId\],\s*references:\s*\[id\],\s*onDelete:\s*Cascade\)/,
    );
  });

  it('tem os campos de trilha YouTube e Spotify opcionais', () => {
    for (const field of [
      'youtubeUrl',
      'youtubeEmbed',
      'spotifyUrl',
      'spotifyEmbed',
    ]) {
      expect(block).toMatch(new RegExp(`${field}\\s+String\\?`));
    }
  });

  it('tem duration como String e publishedAt obrigatório', () => {
    expect(block).toMatch(/duration\s+String\b/);
    expect(block).toMatch(/publishedAt\s+DateTime\b(?!\?)/);
  });

  it.each(['podcastId', 'publishedAt'])(
    'declara o índice @@index([%s])',
    (column) => {
      expect(block).toMatch(new RegExp(`@@index\\(\\[${column}\\]\\)`));
    },
  );
});

describe('AdminUser', () => {
  const block = modelBlock('AdminUser');

  it('tem email único', () => {
    expect(block).toMatch(/email\s+String\s+@unique/);
  });

  it('tem role com default EDITOR', () => {
    expect(block).toMatch(/role\s+String\s+@default\("EDITOR"\)/);
  });
});

describe('EventLog', () => {
  const block = modelBlock('EventLog');

  it.each(['eventType', 'createdAt'])(
    'declara o índice @@index([%s])',
    (column) => {
      expect(block).toMatch(new RegExp(`@@index\\(\\[${column}\\]\\)`));
    },
  );

  it('tem payload Json opcional', () => {
    expect(block).toMatch(/payload\s+Json\?/);
  });
});

describe('SiteConfig / Testimonial / Plan', () => {
  it('SiteConfig tem defaults de marca', () => {
    const block = modelBlock('SiteConfig');
    expect(block).toMatch(/siteName\s+String\s+@default\("Reiners Media"\)/);
    expect(block).toMatch(/primaryColor\s+String\s+@default\("#d87dff"\)/);
  });

  it('Testimonial tem podcastId opcional', () => {
    expect(modelBlock('Testimonial')).toMatch(/podcastId\s+String\?/);
  });

  it('Plan tem features Json obrigatório e isFeatured', () => {
    const block = modelBlock('Plan');
    expect(block).toMatch(/features\s+Json\b(?!\?)/);
    expect(block).toMatch(/isFeatured\s+Boolean\s+@default\(false\)/);
  });
});

describe('campos de texto longo', () => {
  it.each([
    ['Podcast', 'description'],
    ['Episode', 'description'],
    ['Testimonial', 'quote'],
  ])('%s.%s usa @db.Text', (model, field) => {
    expect(modelBlock(model)).toMatch(
      new RegExp(`${field}\\s+String\\s+@db\\.Text`),
    );
  });
});
