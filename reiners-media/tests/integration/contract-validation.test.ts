/**
 * TCK-003 — validacao de contrato entre `contracts/api/*.yaml` (CONTRACT-003) e
 * `src/lib/schemas.ts` (CONTRACT-004).
 *
 * O objetivo e impedir que a documentacao OpenAPI e a validacao executavel
 * divirjam: toda operacao documentada precisa apontar, via extensoes
 * `x-zod-query` / `x-zod-request` / `x-zod-response` / `x-zod-params`, para um
 * schema Zod realmente exportado; todo enum do YAML precisa ter exatamente os
 * mesmos valores do enum Zod; e todo componente com `x-zod-schema` precisa ter
 * as mesmas propriedades do objeto Zod correspondente.
 *
 * Nenhuma dependencia nova foi instalada: os YAMLs sao lidos por um parser
 * estrutural minimo (subconjunto de YAML em bloco, que e o estilo usado nos
 * contratos deste repositorio).
 */
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import * as schemas from '@/lib/schemas';

/* -------------------------------------------------------------------------- */
/* Parser estrutural de YAML em bloco                                         */
/* -------------------------------------------------------------------------- */

type YamlNode = string | number | boolean | null | YamlNode[] | { [key: string]: YamlNode };

interface YamlLine {
  indent: number;
  content: string;
}

function tokenize(source: string): YamlLine[] {
  const lines: YamlLine[] = [];
  for (const raw of source.split('\n')) {
    const normalized = raw.replace(/\t/g, '  ').replace(/\r$/, '');
    if (normalized.trim() === '') continue;
    const trimmed = normalized.trim();
    if (trimmed.startsWith('#')) continue;
    lines.push({ indent: normalized.length - normalized.trimStart().length, content: trimmed });
  }
  return lines;
}

function parseScalar(raw: string): YamlNode {
  const value = raw.trim();
  if (value === '' || value === 'null' || value === '~') return null;
  if (value === '[]') return [];
  if (value === '{}') return {};
  if (value === 'true') return true;
  if (value === 'false') return false;
  if (/^-?\d+(\.\d+)?$/.test(value)) return Number(value);
  if (value.startsWith('"') && value.endsWith('"') && value.length >= 2) {
    return value.slice(1, -1).replace(/\\"/g, '"').replace(/\\\\/g, '\\');
  }
  if (value.startsWith("'") && value.endsWith("'") && value.length >= 2) {
    return value.slice(1, -1).replace(/''/g, "'");
  }
  return value;
}

/** Separa `chave: valor` respeitando chaves entre aspas, como `"404": ...`. */
function splitKey(content: string): { key: string; rest: string } | null {
  if (content.startsWith('"') || content.startsWith("'")) {
    const quote = content[0];
    const end = content.indexOf(quote, 1);
    if (end === -1 || content[end + 1] !== ':') return null;
    return { key: content.slice(1, end), rest: content.slice(end + 2).trim() };
  }
  for (let i = 0; i < content.length; i += 1) {
    if (content[i] !== ':') continue;
    if (i === content.length - 1 || content[i + 1] === ' ') {
      return { key: content.slice(0, i).trim(), rest: content.slice(i + 1).trim() };
    }
  }
  return null;
}

function parseLines(lines: YamlLine[]): YamlNode {
  if (lines.length === 0) return null;
  const base = lines[0].indent;

  if (lines[0].content === '-' || lines[0].content.startsWith('- ')) {
    const items: YamlNode[] = [];
    let i = 0;
    while (i < lines.length) {
      const rest = lines[i].content === '-' ? '' : lines[i].content.slice(1).trim();
      const child: YamlLine[] = [];
      if (rest !== '') child.push({ indent: base + 2, content: rest });
      let j = i + 1;
      while (j < lines.length && lines[j].indent > base) {
        child.push(lines[j]);
        j += 1;
      }
      if (child.length === 1 && rest !== '' && splitKey(rest) === null) {
        items.push(parseScalar(rest));
      } else {
        items.push(parseLines(child));
      }
      i = j;
    }
    return items;
  }

  const map: Record<string, YamlNode> = {};
  let i = 0;
  while (i < lines.length) {
    const pair = splitKey(lines[i].content);
    if (pair === null) {
      i += 1;
      continue;
    }
    const child: YamlLine[] = [];
    let j = i + 1;
    while (j < lines.length && lines[j].indent > base) {
      child.push(lines[j]);
      j += 1;
    }
    if (pair.rest !== '') {
      map[pair.key] = parseScalar(pair.rest);
    } else if (child.length > 0) {
      map[pair.key] = parseLines(child);
    } else {
      map[pair.key] = null;
    }
    i = j;
  }
  return map;
}

function parseYaml(source: string): Record<string, YamlNode> {
  const parsed = parseLines(tokenize(source));
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('YAML raiz precisa ser um mapeamento');
  }
  return parsed;
}

/* -------------------------------------------------------------------------- */
/* Helpers de leitura                                                         */
/* -------------------------------------------------------------------------- */

function isRecord(value: YamlNode): value is Record<string, YamlNode> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function asRecord(value: YamlNode | undefined): Record<string, YamlNode> {
  return value !== undefined && isRecord(value) ? value : {};
}

function asStringArray(value: YamlNode | undefined): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === 'string');
}

const CONTRACT_DIR = path.resolve(__dirname, '../../contracts/api');
const DOCS_API_CONTRACTS = path.resolve(__dirname, '../../docs/API_CONTRACTS.md');
const HTTP_METHODS = ['get', 'post', 'patch', 'put', 'delete'] as const;

const EXPECTED_FILES = [
  'auth.yaml',
  'episodes.yaml',
  'events.yaml',
  'podcasts.yaml',
  'site-config.yaml',
  'upload.yaml',
];

const EXPECTED_ENDPOINTS = [
  'DELETE /api/episodes/{id}',
  'DELETE /api/podcasts/{id}',
  'GET /api/auth/session',
  'GET /api/episodes',
  'GET /api/episodes/{id}',
  'GET /api/events',
  'GET /api/podcasts',
  'GET /api/podcasts/{slug}',
  'GET /api/site-config',
  'PATCH /api/episodes/{id}',
  'PATCH /api/podcasts/{id}',
  'PATCH /api/site-config',
  'POST /api/auth/login',
  'POST /api/auth/logout',
  'POST /api/episodes',
  'POST /api/events',
  'POST /api/podcasts',
  'POST /api/upload',
];

interface OperationEntry {
  file: string;
  method: string;
  routePath: string;
  fullPath: string;
  label: string;
  operation: Record<string, YamlNode>;
}

const documents = EXPECTED_FILES.map((file) => ({
  file,
  doc: parseYaml(readFileSync(path.join(CONTRACT_DIR, file), 'utf8')),
}));

function serverPrefix(doc: Record<string, YamlNode>): string {
  const servers = doc.servers;
  if (!Array.isArray(servers) || servers.length === 0) return '';
  const first = servers[0];
  return isRecord(first) && typeof first.url === 'string' ? first.url : '';
}

const operations: OperationEntry[] = [];
for (const { file, doc } of documents) {
  const prefix = serverPrefix(doc);
  const paths = asRecord(doc.paths);
  for (const [routePath, pathItem] of Object.entries(paths)) {
    for (const [method, operation] of Object.entries(asRecord(pathItem))) {
      if (!HTTP_METHODS.includes(method as (typeof HTTP_METHODS)[number])) continue;
      if (!isRecord(operation)) continue;
      operations.push({
        file,
        method,
        routePath,
        fullPath: `${prefix}${routePath}`,
        label: `${method.toUpperCase()} ${prefix}${routePath}`,
        operation,
      });
    }
  }
}

/** Nomes de schemas Zod referenciados por uma operacao. */
const ZOD_REF_KEYS = ['x-zod-query', 'x-zod-request', 'x-zod-response', 'x-zod-params'] as const;

function zodExport(name: string): unknown {
  return (schemas as unknown as Record<string, unknown>)[name];
}

/** Desembrulha ZodEffects/ZodDefault/ZodOptional ate achar o ZodObject. */
function unwrapObject(schema: unknown): z.ZodObject<z.ZodRawShape> | null {
  let current: unknown = schema;
  for (let depth = 0; depth < 10; depth += 1) {
    if (current instanceof z.ZodObject) return current as z.ZodObject<z.ZodRawShape>;
    if (!(current instanceof z.ZodType)) return null;
    const def = current._def as { schema?: unknown; innerType?: unknown };
    const next = def.schema ?? def.innerType;
    if (next === undefined) return null;
    current = next;
  }
  return null;
}

function isProtected(operation: Record<string, YamlNode>): boolean {
  const security = operation.security;
  return Array.isArray(security) && security.length > 0;
}

function responseCodes(operation: Record<string, YamlNode>): string[] {
  return Object.keys(asRecord(operation.responses));
}

/* -------------------------------------------------------------------------- */
/* Estrutura dos arquivos                                                     */
/* -------------------------------------------------------------------------- */

describe('contracts/api — estrutura', () => {
  it('contem exatamente um arquivo YAML por recurso', () => {
    const found = readdirSync(CONTRACT_DIR)
      .filter((file) => file.endsWith('.yaml') || file.endsWith('.yml'))
      .sort();
    expect(found).toEqual(EXPECTED_FILES);
  });

  it.each(EXPECTED_FILES)('%s e um documento OpenAPI 3.1 valido na raiz', (file) => {
    const doc = documents.find((entry) => entry.file === file)?.doc;
    expect(doc).toBeDefined();
    expect(doc?.openapi).toBe('3.1.0');
    const info = asRecord(doc?.info);
    expect(typeof info.title).toBe('string');
    expect(typeof info.version).toBe('string');
    expect(typeof info.description).toBe('string');
    expect(serverPrefix(doc ?? {})).toBe('/api');
    expect(Object.keys(asRecord(doc?.paths)).length).toBeGreaterThan(0);
  });

  it('documenta exatamente os endpoints previstos', () => {
    expect(operations.map((entry) => entry.label).sort()).toEqual(EXPECTED_ENDPOINTS);
  });

  it('cobre todos os endpoints de docs/API_CONTRACTS.md', () => {
    const markdown = readFileSync(DOCS_API_CONTRACTS, 'utf8');
    const pattern = /^####\s+(GET|POST|PATCH|PUT|DELETE)\s+(\/\S+)/gm;
    const documented = new Set(operations.map((entry) => entry.label));
    const missing: string[] = [];
    let match = pattern.exec(markdown);
    while (match !== null) {
      const normalized = match[2].replace(/\/:([A-Za-z][A-Za-z0-9]*)/g, '/{$1}');
      const label = `${match[1]} ${normalized}`;
      if (!documented.has(label)) missing.push(label);
      match = pattern.exec(markdown);
    }
    expect(missing).toEqual([]);
  });

  it('nao repete operationId dentro do mesmo arquivo', () => {
    for (const file of EXPECTED_FILES) {
      const ids = operations
        .filter((entry) => entry.file === file)
        .map((entry) => entry.operation.operationId);
      expect(new Set(ids).size).toBe(ids.length);
      expect(ids.every((id) => typeof id === 'string' && id.length > 0)).toBe(true);
    }
  });
});

/* -------------------------------------------------------------------------- */
/* Respostas obrigatorias                                                     */
/* -------------------------------------------------------------------------- */

describe('contracts/api — respostas obrigatorias', () => {
  it.each(operations.map((entry) => [entry.label, entry] as const))(
    '%s declara os status esperados',
    (_label, entry) => {
      const codes = responseCodes(entry.operation);
      expect(codes.some((code) => code.startsWith('2'))).toBe(true);
      expect(codes).toContain('400');
      expect(codes).toContain('500');

      if (isProtected(entry.operation)) {
        expect(codes).toContain('401');
        expect(codes).toContain('403');
      }
      if (entry.routePath.includes('{')) {
        expect(codes).toContain('404');
      }
      if (entry.operation.requestBody !== undefined) {
        expect(codes).toContain('422');
      }
      if (entry.method === 'post' || entry.method === 'patch' || entry.method === 'delete') {
        expect(codes).toContain('429');
      }
    },
  );

  it('POST /api/events documenta o rate limit de 429', () => {
    const entry = operations.find((item) => item.label === 'POST /api/events');
    expect(entry).toBeDefined();
    expect(responseCodes(entry?.operation ?? {})).toContain('429');
  });

  it('POST /api/upload documenta 413 e 415', () => {
    const entry = operations.find((item) => item.label === 'POST /api/upload');
    const codes = responseCodes(entry?.operation ?? {});
    expect(codes).toContain('413');
    expect(codes).toContain('415');
  });

  it('toda resposta de erro aponta para o envelope padronizado', () => {
    for (const entry of operations) {
      const doc = documents.find((item) => item.file === entry.file)?.doc ?? {};
      const componentResponses = asRecord(asRecord(doc.components).responses);
      const responses = asRecord(entry.operation.responses);
      for (const [code, response] of Object.entries(responses)) {
        if (Number(code) < 400) continue;
        const ref = asRecord(response).$ref;
        expect(typeof ref, `${entry.label} -> ${code}`).toBe('string');
        const refName = String(ref).replace('#/components/responses/', '');
        expect(Object.keys(componentResponses), `${entry.label} -> ${code}`).toContain(refName);
        const schemaRef = asRecord(
          asRecord(asRecord(asRecord(componentResponses[refName]).content)['application/json'])
            .schema,
        ).$ref;
        expect(schemaRef, `${entry.label} -> ${code}`).toBe(
          '#/components/schemas/ErrorResponse',
        );
      }
    }
  });
});

/* -------------------------------------------------------------------------- */
/* Ligacao YAML <-> Zod                                                       */
/* -------------------------------------------------------------------------- */

describe('contracts/api — ligacao com src/lib/schemas.ts', () => {
  it('toda operacao declara ao menos um schema Zod', () => {
    for (const entry of operations) {
      const declared = ZOD_REF_KEYS.filter((key) => typeof entry.operation[key] === 'string');
      expect(declared.length, entry.label).toBeGreaterThan(0);
      expect(typeof entry.operation['x-zod-response'], entry.label).toBe('string');
    }
  });

  it('toda operacao com query documentada declara x-zod-query', () => {
    for (const entry of operations) {
      const parameters = Array.isArray(entry.operation.parameters) ? entry.operation.parameters : [];
      const hasQuery = parameters.some((param) => asRecord(param).in === 'query');
      if (hasQuery) expect(typeof entry.operation['x-zod-query'], entry.label).toBe('string');
      const hasPathParam = parameters.some((param) => asRecord(param).in === 'path');
      if (hasPathParam) expect(typeof entry.operation['x-zod-params'], entry.label).toBe('string');
    }
  });

  it('toda operacao com requestBody declara x-zod-request', () => {
    for (const entry of operations) {
      if (entry.operation.requestBody === undefined) continue;
      expect(typeof entry.operation['x-zod-request'], entry.label).toBe('string');
    }
  });

  it('todo schema referenciado por x-zod-* e exportado e e um schema Zod', () => {
    const missing: string[] = [];
    for (const entry of operations) {
      for (const key of ZOD_REF_KEYS) {
        const name = entry.operation[key];
        if (typeof name !== 'string') continue;
        const exported = zodExport(name);
        if (!(exported instanceof z.ZodType)) missing.push(`${entry.label} ${key}=${name}`);
      }
    }
    expect(missing).toEqual([]);
  });

  it('todo componente com x-zod-schema e exportado e e um schema Zod', () => {
    const missing: string[] = [];
    for (const { file, doc } of documents) {
      const componentSchemas = asRecord(asRecord(doc.components).schemas);
      for (const [name, component] of Object.entries(componentSchemas)) {
        const zodName = asRecord(component)['x-zod-schema'];
        if (typeof zodName !== 'string') continue;
        if (!(zodExport(zodName) instanceof z.ZodType)) missing.push(`${file} ${name}=${zodName}`);
      }
    }
    expect(missing).toEqual([]);
  });

  it('o requestBody de cada operacao aponta para o mesmo schema Zod de x-zod-request', () => {
    for (const entry of operations) {
      const requestBody = asRecord(entry.operation.requestBody);
      if (Object.keys(requestBody).length === 0) continue;
      const content = asRecord(requestBody.content);
      const mediaType = Object.keys(content)[0];
      const ref = asRecord(asRecord(content[mediaType]).schema).$ref;
      expect(typeof ref, entry.label).toBe('string');
      const componentName = String(ref).replace('#/components/schemas/', '');
      const doc = documents.find((item) => item.file === entry.file)?.doc ?? {};
      const component = asRecord(asRecord(asRecord(doc.components).schemas)[componentName]);
      expect(component['x-zod-schema'], `${entry.label} -> ${componentName}`).toBe(
        entry.operation['x-zod-request'],
      );
    }
  });

  it('a resposta 2xx de cada operacao aponta para o mesmo schema Zod de x-zod-response', () => {
    for (const entry of operations) {
      const responses = asRecord(entry.operation.responses);
      const successCode = Object.keys(responses).find((code) => code.startsWith('2'));
      expect(successCode, entry.label).toBeDefined();
      const content = asRecord(asRecord(responses[String(successCode)]).content);
      const ref = asRecord(asRecord(content['application/json']).schema).$ref;
      expect(typeof ref, entry.label).toBe('string');
      const componentName = String(ref).replace('#/components/schemas/', '');
      const doc = documents.find((item) => item.file === entry.file)?.doc ?? {};
      const component = asRecord(asRecord(asRecord(doc.components).schemas)[componentName]);
      expect(component['x-zod-schema'], `${entry.label} -> ${componentName}`).toBe(
        entry.operation['x-zod-response'],
      );
    }
  });
});

/* -------------------------------------------------------------------------- */
/* Enums                                                                      */
/* -------------------------------------------------------------------------- */

describe('contracts/api — enums', () => {
  it('todo x-zod-enum existe em ZOD_ENUMS com exatamente os mesmos valores', () => {
    const enumNames = new Set<string>();
    for (const { file, doc } of documents) {
      const componentSchemas = asRecord(asRecord(doc.components).schemas);
      for (const [name, component] of Object.entries(componentSchemas)) {
        const record = asRecord(component);
        const enumName = record['x-zod-enum'];
        if (typeof enumName !== 'string') continue;
        enumNames.add(enumName);
        const zodEnum = (schemas.ZOD_ENUMS as Record<string, z.ZodEnum<[string, ...string[]]>>)[
          enumName
        ];
        expect(zodEnum, `${file} -> ${name}`).toBeDefined();
        expect(asStringArray(record.enum), `${file} -> ${name}`).toEqual(zodEnum.options);
      }
    }
    expect(enumNames.has('PodcastStatus')).toBe(true);
    expect(enumNames.has('VisualStyle')).toBe(true);
    expect(enumNames.has('AdminRole')).toBe(true);
    expect(enumNames.has('EventType')).toBe(true);
    expect(enumNames.has('ErrorCode')).toBe(true);
  });

  it('todo componente sem x-zod-enum mas com enum inline usa valores conhecidos', () => {
    const knownValues = new Set<string>();
    for (const zodEnum of Object.values(schemas.ZOD_ENUMS)) {
      for (const option of zodEnum.options) knownValues.add(option);
    }
    for (const option of schemas.podcastSortFieldSchema.options) knownValues.add(option);
    for (const option of schemas.episodeSortFieldSchema.options) knownValues.add(option);

    for (const entry of operations) {
      const parameters = Array.isArray(entry.operation.parameters) ? entry.operation.parameters : [];
      for (const parameter of parameters) {
        const inlineEnum = asStringArray(asRecord(asRecord(parameter).schema).enum);
        for (const value of inlineEnum) {
          expect(knownValues, `${entry.label} -> ${value}`).toContain(value);
        }
      }
    }
  });
});

/* -------------------------------------------------------------------------- */
/* Propriedades dos componentes                                               */
/* -------------------------------------------------------------------------- */

describe('contracts/api — propriedades vs shape Zod', () => {
  it('todo componente com properties tem exatamente as chaves do objeto Zod', () => {
    const mismatches: string[] = [];
    for (const { file, doc } of documents) {
      const componentSchemas = asRecord(asRecord(doc.components).schemas);
      for (const [name, component] of Object.entries(componentSchemas)) {
        const record = asRecord(component);
        const zodName = record['x-zod-schema'];
        if (typeof zodName !== 'string') continue;
        if (!isRecord(record.properties)) continue;
        const objectSchema = unwrapObject(zodExport(zodName));
        if (objectSchema === null) {
          mismatches.push(`${file} ${name}: ${zodName} nao e um objeto Zod`);
          continue;
        }
        const yamlProps = Object.keys(record.properties).sort();
        const zodProps = Object.keys(objectSchema.shape).sort();
        if (JSON.stringify(yamlProps) !== JSON.stringify(zodProps)) {
          mismatches.push(
            `${file} ${name} (${zodName}): yaml=[${yamlProps.join(',')}] zod=[${zodProps.join(',')}]`,
          );
        }
      }
    }
    expect(mismatches).toEqual([]);
  });

  it('todo campo required existe entre as properties do componente', () => {
    const mismatches: string[] = [];
    for (const { file, doc } of documents) {
      const componentSchemas = asRecord(asRecord(doc.components).schemas);
      for (const [name, component] of Object.entries(componentSchemas)) {
        const record = asRecord(component);
        if (!isRecord(record.properties)) continue;
        const properties = Object.keys(record.properties);
        for (const required of asStringArray(record.required)) {
          if (!properties.includes(required)) mismatches.push(`${file} ${name}.${required}`);
        }
      }
    }
    expect(mismatches).toEqual([]);
  });
});

/* -------------------------------------------------------------------------- */
/* Regras de negocio refletidas no contrato                                   */
/* -------------------------------------------------------------------------- */

describe('contracts/api — regras de negocio', () => {
  it('BR-003: PodcastCreate exige hosts com minItems 1', () => {
    const doc = documents.find((entry) => entry.file === 'podcasts.yaml')?.doc ?? {};
    const component = asRecord(asRecord(asRecord(doc.components).schemas).PodcastCreate);
    expect(asStringArray(component.required)).toContain('hosts');
    expect(asRecord(asRecord(component.properties).hosts).minItems).toBe(1);
  });

  it('BR-004: o create de episodio nao aceita embeds e o schema Zod exige uma trilha', () => {
    const doc = documents.find((entry) => entry.file === 'episodes.yaml')?.doc ?? {};
    const component = asRecord(asRecord(asRecord(doc.components).schemas).EpisodeCreate);
    const properties = Object.keys(asRecord(component.properties));
    expect(properties).not.toContain('youtubeEmbed');
    expect(properties).not.toContain('spotifyEmbed');
    expect(component.additionalProperties).toBe(false);
    expect(
      schemas.episodeCreateSchema.safeParse({
        podcastId: '3f6c3f2e-6c2b-4c8f-9a5e-6b1f9a2d4c11',
        number: 1,
        title: 'Sem trilha',
        description: 'Sem trilha',
        duration: '10:00',
        publishedAt: '2024-01-01T00:00:00Z',
      }).success,
    ).toBe(false);
  });

  it('as rotas mutantes exigem cookieAuth e as publicas declaram security vazio', () => {
    const publicLabels = [
      'GET /api/podcasts',
      'GET /api/podcasts/{slug}',
      'GET /api/episodes',
      'GET /api/episodes/{id}',
      'GET /api/site-config',
      'POST /api/events',
      'GET /api/auth/session',
      'POST /api/auth/login',
    ];
    for (const entry of operations) {
      if (publicLabels.includes(entry.label)) {
        expect(isProtected(entry.operation), entry.label).toBe(false);
      } else {
        expect(isProtected(entry.operation), entry.label).toBe(true);
        const security = Array.isArray(entry.operation.security) ? entry.operation.security : [];
        expect(Object.keys(asRecord(security[0])), entry.label).toEqual(['cookieAuth']);
      }
    }
  });

  it('o esquema de seguranca cookieAuth existe em todo arquivo com rota protegida', () => {
    for (const { file, doc } of documents) {
      const hasProtected = operations.some(
        (entry) => entry.file === file && isProtected(entry.operation),
      );
      if (!hasProtected) continue;
      const securitySchemes = asRecord(asRecord(doc.components).securitySchemes);
      expect(Object.keys(securitySchemes), file).toContain('cookieAuth');
      expect(asRecord(securitySchemes.cookieAuth).in, file).toBe('cookie');
    }
  });
});
