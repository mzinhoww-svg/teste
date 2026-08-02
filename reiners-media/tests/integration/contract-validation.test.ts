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
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import * as analytics from '@/lib/analytics';
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
const APP_API_DIR = path.resolve(__dirname, '../../src/app/api');
const HTTP_METHODS = ['get', 'post', 'patch', 'put', 'delete'] as const;

/* -------------------------------------------------------------------------- */
/* Descoberta das rotas REAIS no sistema de arquivos                          */
/* -------------------------------------------------------------------------- */

/**
 * Comparar o YAML com uma lista fixa de endpoints nunca detecta uma rota
 * implementada e não publicada — a rota real jamais entra na comparação. Foi
 * assim que `GET /api/events/summary` viveu fora do contrato. Aqui as rotas
 * são descobertas varrendo `src/app/api/**\/route.ts`, derivando o path da
 * estrutura de diretórios e lendo quais verbos o módulo exporta.
 */
interface DiscoveredRoute {
  file: string;
  routePath: string;
  method: string;
  label: string;
}

/** Converte um segmento do App Router no equivalente OpenAPI. */
function segmentToOpenApi(segment: string): string | null {
  // Route group `(marketing)` e slot paralelo `@modal` não entram na URL.
  if (segment.startsWith('(') && segment.endsWith(')')) return null;
  if (segment.startsWith('@')) return null;
  // `_lib`, `_components`: pastas privadas, nunca são rota.
  if (segment.startsWith('_')) return null;
  // `[[...slug]]` (catch-all opcional), `[...slug]` (catch-all), `[id]`.
  const dynamic = /^\[{1,2}(?:\.{3})?([^\]]+?)\]{1,2}$/.exec(segment);
  if (dynamic !== null) return `{${dynamic[1]}}`;
  return segment;
}

function collectRouteFiles(dir: string, found: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      collectRouteFiles(full, found);
    } else if (/^route\.(ts|tsx|js|mjs)$/.test(entry.name)) {
      found.push(full);
    }
  }
  return found;
}

/** Verbos HTTP exportados por um módulo de rota. */
function exportedMethods(source: string): string[] {
  const methods = new Set<string>();
  const patterns = [
    /export\s+(?:async\s+)?function\s+(GET|POST|PATCH|PUT|DELETE)\s*\(/g,
    /export\s+const\s+(GET|POST|PATCH|PUT|DELETE)\s*[:=]/g,
    /export\s*\{[^}]*\b(GET|POST|PATCH|PUT|DELETE)\b[^}]*\}/g,
  ];
  for (const pattern of patterns) {
    let match = pattern.exec(source);
    while (match !== null) {
      methods.add(match[1].toLowerCase());
      match = pattern.exec(source);
    }
  }
  return [...methods];
}

function discoverRoutes(): DiscoveredRoute[] {
  if (!existsSync(APP_API_DIR)) return [];
  const routes: DiscoveredRoute[] = [];
  for (const file of collectRouteFiles(APP_API_DIR)) {
    const relativeDir = path.relative(path.resolve(APP_API_DIR, '..'), path.dirname(file));
    const segments = relativeDir.split(path.sep);
    // Pasta privada em qualquer nível invalida a rota inteira.
    if (segments.some((segment) => segment.startsWith('_'))) continue;
    const mapped = segments
      .map(segmentToOpenApi)
      .filter((segment): segment is string => segment !== null);
    const routePath = `/${mapped.join('/')}`;
    for (const method of exportedMethods(readFileSync(file, 'utf8'))) {
      routes.push({
        file: path.relative(path.resolve(APP_API_DIR, '../../..'), file),
        routePath,
        method,
        label: `${method.toUpperCase()} ${routePath}`,
      });
    }
  }
  return routes.sort((a, b) => a.label.localeCompare(b.label));
}

const discoveredRoutes = discoverRoutes();

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
  'DELETE /api/podcasts/{idOrSlug}',
  'GET /api/auth/session',
  'GET /api/episodes',
  'GET /api/episodes/{id}',
  'GET /api/events',
  'GET /api/events/summary',
  'GET /api/podcasts',
  'GET /api/podcasts/{idOrSlug}',
  'GET /api/site-config',
  'PATCH /api/episodes/{id}',
  'PATCH /api/podcasts/{idOrSlug}',
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

/**
 * Modulos que podem hospedar contrato executavel. `@/lib/schemas` e o padrao;
 * `@/lib/analytics` guarda as agregacoes de GET /api/events/summary, que nao
 * cabem no envelope paginado. A operacao/componente declara a origem com
 * `x-zod-module`; a busca cobre os dois de qualquer forma.
 */
const ZOD_MODULES: Record<string, Record<string, unknown>> = {
  '@/lib/schemas': schemas as unknown as Record<string, unknown>,
  '@/lib/analytics': analytics as unknown as Record<string, unknown>,
};

function zodExport(name: string): unknown {
  for (const moduleExports of Object.values(ZOD_MODULES)) {
    if (name in moduleExports) return moduleExports[name];
  }
  return undefined;
}

/** Resolve o enum Zod de um `x-zod-enum`, em qualquer modulo de contrato. */
function zodEnumByName(name: string): z.ZodEnum<[string, ...string[]]> | undefined {
  const registered = (schemas.ZOD_ENUMS as Record<string, z.ZodEnum<[string, ...string[]]>>)[name];
  if (registered !== undefined) return registered;
  const conventional = zodExport(`${name.charAt(0).toLowerCase()}${name.slice(1)}Schema`);
  return conventional instanceof z.ZodEnum
    ? (conventional as z.ZodEnum<[string, ...string[]]>)
    : undefined;
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

/** Chaves realmente obrigatorias de um objeto Zod (default e nullish nao contam). */
function zodRequiredKeys(objectSchema: z.ZodObject<z.ZodRawShape>): string[] {
  return Object.entries(objectSchema.shape)
    .filter(([, value]) => !(value as z.ZodTypeAny).isOptional())
    .map(([key]) => key)
    .sort();
}

/** Traduz um schema Zod para o `type` equivalente em OpenAPI. */
function zodTypeKind(schema: unknown): string | null {
  let current: unknown = schema;
  for (let depth = 0; depth < 12; depth += 1) {
    if (current instanceof z.ZodString) return 'string';
    if (current instanceof z.ZodNumber) {
      const checks = (current._def as { checks: { kind: string }[] }).checks;
      return checks.some((check) => check.kind === 'int') ? 'integer' : 'number';
    }
    if (current instanceof z.ZodBoolean) return 'boolean';
    if (current instanceof z.ZodArray) return 'array';
    if (current instanceof z.ZodObject || current instanceof z.ZodRecord) return 'object';
    if (current instanceof z.ZodEnum || current instanceof z.ZodNativeEnum) return 'string';
    if (current instanceof z.ZodLiteral) {
      return typeof (current._def as { value: unknown }).value === 'boolean' ? 'boolean' : 'string';
    }
    if (!(current instanceof z.ZodType)) return null;
    const def = current._def as { schema?: unknown; innerType?: unknown };
    const next = def.schema ?? def.innerType;
    if (next === undefined) return null;
    current = next;
  }
  return null;
}

interface ResolvedComponent {
  properties: Record<string, YamlNode>;
  required: string[];
  hasProperties: boolean;
}

/** Achata `allOf` (inclusive `$ref`) para comparar o componente inteiro. */
function resolveComponent(
  doc: Record<string, YamlNode>,
  component: YamlNode,
  depth = 0,
): ResolvedComponent {
  const record = asRecord(component);
  let properties: Record<string, YamlNode> = {};
  let hasProperties = false;
  if (isRecord(record.properties)) {
    properties = { ...record.properties };
    hasProperties = true;
  }
  let required = asStringArray(record.required);

  const allOf = Array.isArray(record.allOf) ? record.allOf : [];
  if (depth < 5) {
    for (const part of allOf) {
      const partRecord = asRecord(part);
      let target: YamlNode = partRecord;
      if (typeof partRecord.$ref === 'string') {
        const name = partRecord.$ref.replace('#/components/schemas/', '');
        target = asRecord(asRecord(doc.components).schemas)[name] ?? {};
      }
      const nested = resolveComponent(doc, target, depth + 1);
      if (nested.hasProperties) {
        properties = { ...properties, ...nested.properties };
        hasProperties = true;
      }
      required = [...required, ...nested.required];
    }
  }

  return { properties, required: [...new Set(required)], hasProperties };
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

  /**
   * O parser estrutural deste teste e mais permissivo que YAML de verdade: ele
   * corta a chave no primeiro `": "` e engole o resto. Um `description: Padrao:
   * 30 dias` passaria aqui e quebraria qualquer parser real. Este teste fecha a
   * diferenca, exigindo aspas quando o escalar contem `": "`.
   */
  it.each(EXPECTED_FILES)('%s nao tem escalar sem aspas com dois-pontos', (file) => {
    const offenders: string[] = [];
    const lines = readFileSync(path.join(CONTRACT_DIR, file), 'utf8').split('\n');
    lines.forEach((raw, index) => {
      const content = raw.trim();
      if (content === '' || content.startsWith('#')) return;
      const withoutDash = content.startsWith('- ') ? content.slice(2).trim() : content;
      const pair = splitKey(withoutDash);
      if (pair === null || pair.rest === '') return;
      const value = pair.rest;
      const quoted =
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"));
      if (quoted) return;
      if (/:\s/.test(value)) offenders.push(`${file}:${index + 1} -> ${content}`);
    });
    expect(offenders).toEqual([]);
  });
});

/* -------------------------------------------------------------------------- */
/* Rotas implementadas x rotas publicadas                                     */
/* -------------------------------------------------------------------------- */

describe('contracts/api — cobertura das rotas reais', () => {
  it('a varredura encontra as rotas do App Router', () => {
    // Sanidade: se a varredura quebrar e devolver vazio, os testes abaixo
    // passariam vacuamente — que e exatamente o defeito que estamos fechando.
    expect(discoveredRoutes.length).toBeGreaterThanOrEqual(15);
    expect(discoveredRoutes.map((route) => route.label)).toContain('GET /api/events/summary');
  });

  it('converte segmentos dinamicos e ignora pastas privadas e route groups', () => {
    expect(segmentToOpenApi('[id]')).toBe('{id}');
    expect(segmentToOpenApi('[idOrSlug]')).toBe('{idOrSlug}');
    expect(segmentToOpenApi('[...path]')).toBe('{path}');
    expect(segmentToOpenApi('[[...path]]')).toBe('{path}');
    expect(segmentToOpenApi('_lib')).toBeNull();
    expect(segmentToOpenApi('(marketing)')).toBeNull();
    expect(segmentToOpenApi('@modal')).toBeNull();
    expect(segmentToOpenApi('podcasts')).toBe('podcasts');
    // Nenhum helper de `_lib` pode ter virado rota.
    expect(discoveredRoutes.every((route) => !route.routePath.includes('_lib'))).toBe(true);
  });

  it('toda rota implementada esta publicada no contrato', () => {
    const published = new Set(operations.map((entry) => entry.label));
    const unpublished = discoveredRoutes
      .filter((route) => !published.has(route.label))
      .map((route) => `${route.label} (${route.file})`);
    expect(unpublished).toEqual([]);
  });

  it('toda operacao publicada tem rota implementada', () => {
    const implemented = new Set(discoveredRoutes.map((route) => route.label));
    const unimplemented = operations
      .filter((entry) => !implemented.has(entry.label))
      .map((entry) => `${entry.label} (${entry.file})`);
    expect(unimplemented).toEqual([]);
  });
});

describe('contracts/api — consistencia documental', () => {

  it('cobre todos os endpoints de docs/API_CONTRACTS.md', () => {
    const markdown = readFileSync(DOCS_API_CONTRACTS, 'utf8');
    const pattern = /^####\s+(GET|POST|PATCH|PUT|DELETE)\s+(\/\S+)/gm;
    // O nome da variavel de rota e detalhe de implementacao: o PRD escreve
    // `/api/podcasts/:slug` e `/api/podcasts/:id`, mas o App Router so admite um
    // segmento dinamico por nivel (e o OpenAPI considera os dois o MESMO path).
    // A comparacao e feita sobre a FORMA do path, com o nome da variavel
    // apagado, para nao travar o contrato num detalhe que o framework decide.
    const shapeOf = (label: string): string => label.replace(/\{[^}]*\}/g, '{}');
    const documented = new Set(operations.map((entry) => shapeOf(entry.label)));
    const missing: string[] = [];
    let match = pattern.exec(markdown);
    while (match !== null) {
      const normalized = match[2].replace(/\/:([A-Za-z][A-Za-z0-9]*)/g, '/{$1}');
      const label = shapeOf(`${match[1]} ${normalized}`);
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

  /**
   * Nome do componente de resposta -> status sob o qual ele pode ser
   * referenciado. Impede trocas silenciosas (um `"409": $ref NotFound` passaria
   * na checagem de envelope, que so olha se aponta para ErrorResponse).
   */
  const RESPONSE_COMPONENT_STATUS: Record<string, string> = {
    BadRequest: '400',
    Unauthorized: '401',
    Forbidden: '403',
    NotFound: '404',
    Conflict: '409',
    PayloadTooLarge: '413',
    UnsupportedMediaType: '415',
    UnprocessableEntity: '422',
    TooManyRequests: '429',
    InternalServerError: '500',
  };

  it('cada componente de erro e usado sob o status que lhe corresponde', () => {
    const mismatches: string[] = [];
    for (const entry of operations) {
      for (const [code, response] of Object.entries(asRecord(entry.operation.responses))) {
        const ref = asRecord(response).$ref;
        if (typeof ref !== 'string') continue;
        const componentName = ref.replace('#/components/responses/', '');
        const expected = RESPONSE_COMPONENT_STATUS[componentName];
        if (expected === undefined) {
          mismatches.push(`${entry.label}: componente desconhecido ${componentName}`);
        } else if (expected !== code) {
          mismatches.push(`${entry.label}: ${componentName} usado sob ${code}, esperado ${expected}`);
        }
      }
    }
    expect(mismatches).toEqual([]);
  });

  it('o status de cada componente de erro bate com ERROR_STATUS_BY_CODE', () => {
    // PAYLOAD_TOO_LARGE -> 413 e VALIDATION_ERROR -> 422 sao a regra de divisao
    // documentada: 413 e limite de bytes, 422 e limite estrutural.
    expect(schemas.ERROR_STATUS_BY_CODE.PAYLOAD_TOO_LARGE).toBe(413);
    expect(schemas.ERROR_STATUS_BY_CODE.VALIDATION_ERROR).toBe(422);
    const used = new Set<string>();
    for (const entry of operations) {
      for (const response of Object.values(asRecord(entry.operation.responses))) {
        const ref = asRecord(response).$ref;
        if (typeof ref === 'string') used.add(ref.replace('#/components/responses/', ''));
      }
    }
    expect(used.has('PayloadTooLarge')).toBe(true);
  });

  it('as operacoes que leem corpo com teto de bytes declaram 413', () => {
    // Lista explicita: a extracao estatica dos status a partir dos handlers foi
    // avaliada e rejeitada (ver contracts/README.md). Enquanto nao houver uma
    // fonte confiavel, o vinculo e mantido a mao — e falha alto se alguem
    // remover o 413 de uma destas.
    for (const label of ['POST /api/events', 'PATCH /api/site-config', 'POST /api/upload']) {
      const entry = operations.find((item) => item.label === label);
      expect(entry, label).toBeDefined();
      expect(responseCodes(entry?.operation ?? {}), label).toContain('413');
    }
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
        const zodEnum = zodEnumByName(enumName);
        expect(zodEnum, `${file} -> ${name}`).toBeDefined();
        expect(asStringArray(record.enum), `${file} -> ${name}`).toEqual(zodEnum?.options);
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
  /** Componentes com x-zod-schema, com allOf ja achatado. */
  const zodBackedComponents = documents.flatMap(({ file, doc }) =>
    Object.entries(asRecord(asRecord(doc.components).schemas))
      .filter(([, component]) => typeof asRecord(component)['x-zod-schema'] === 'string')
      .map(([name, component]) => ({
        file,
        name,
        zodName: String(asRecord(component)['x-zod-schema']),
        resolved: resolveComponent(doc, component),
      })),
  );

  it('cobre todos os componentes ligados a Zod, inclusive os que usam allOf', () => {
    const covered = zodBackedComponents.filter((entry) => entry.resolved.hasProperties);
    expect(covered.length).toBe(zodBackedComponents.length);
    // PodcastWithEpisodes so tem properties via allOf: prova que o achatamento funciona.
    const withEpisodes = covered.find((entry) => entry.name === 'PodcastWithEpisodes');
    expect(withEpisodes).toBeDefined();
    expect(Object.keys(withEpisodes?.resolved.properties ?? {})).toContain('episodes');
    expect(Object.keys(withEpisodes?.resolved.properties ?? {})).toContain('slug');
  });

  it('todo componente tem exatamente as chaves do objeto Zod', () => {
    const mismatches: string[] = [];
    for (const entry of zodBackedComponents) {
      if (!entry.resolved.hasProperties) continue;
      const objectSchema = unwrapObject(zodExport(entry.zodName));
      if (objectSchema === null) {
        mismatches.push(`${entry.file} ${entry.name}: ${entry.zodName} nao e um objeto Zod`);
        continue;
      }
      const yamlProps = Object.keys(entry.resolved.properties).sort();
      const zodProps = Object.keys(objectSchema.shape).sort();
      if (JSON.stringify(yamlProps) !== JSON.stringify(zodProps)) {
        mismatches.push(
          `${entry.file} ${entry.name} (${entry.zodName}): yaml=[${yamlProps.join(',')}] zod=[${zodProps.join(',')}]`,
        );
      }
    }
    expect(mismatches).toEqual([]);
  });

  it('o required do YAML bate com as chaves obrigatorias do Zod (nullable != optional)', () => {
    const mismatches: string[] = [];
    for (const entry of zodBackedComponents) {
      if (!entry.resolved.hasProperties) continue;
      const objectSchema = unwrapObject(zodExport(entry.zodName));
      if (objectSchema === null) continue;
      const yamlRequired = [...entry.resolved.required].sort();
      const zodRequired = zodRequiredKeys(objectSchema);
      if (JSON.stringify(yamlRequired) !== JSON.stringify(zodRequired)) {
        mismatches.push(
          `${entry.file} ${entry.name} (${entry.zodName}): yaml=[${yamlRequired.join(',')}] zod=[${zodRequired.join(',')}]`,
        );
      }
    }
    expect(mismatches).toEqual([]);
  });

  it('o type de cada property bate com o tipo do campo Zod', () => {
    const mismatches: string[] = [];
    for (const entry of zodBackedComponents) {
      if (!entry.resolved.hasProperties) continue;
      const objectSchema = unwrapObject(zodExport(entry.zodName));
      if (objectSchema === null) continue;
      for (const [propertyName, property] of Object.entries(entry.resolved.properties)) {
        const yamlType = asRecord(property).type;
        if (typeof yamlType !== 'string') continue;
        const field = objectSchema.shape[propertyName];
        if (field === undefined) continue;
        const zodKind = zodTypeKind(field);
        if (zodKind === null) continue;
        const accepted = zodKind === 'integer' ? ['integer', 'number'] : [zodKind];
        if (!accepted.includes(yamlType)) {
          mismatches.push(
            `${entry.file} ${entry.name}.${propertyName}: yaml=${yamlType} zod=${zodKind}`,
          );
        }
      }
    }
    expect(mismatches).toEqual([]);
  });

  /**
   * Corpus compartilhado: cada valor precisa ser aceito/rejeitado do MESMO jeito
   * pelo `pattern` publicado no YAML e pelo schema Zod que valida de fato. Foi
   * assim que a divergencia de `IMAGE_REF_PATTERN` passou despercebida — o
   * teste comparava chaves e tipos, mas nunca o `pattern`.
   */
  const PATTERN_PROBES = [
    'https://abc.supabase.co/storage/v1/object/public/podcasts/capa.jpg',
    'http://localhost:3000/images/capa.png',
    '/images/podcasts/horizonte-digital-cover.jpg',
    '/logo.svg',
    '/images/x.jpg?v=2',
    '/imagens/edição.jpg',
    '',
    '//evil.com/pwn.jpg',
    'javascript:alert(1)',
    'data:image/png;base64,AAAA',
    '/../../etc/passwd',
    '/images/../../secret.jpg',
    '../images/capa.jpg',
    'images/capa.jpg',
    '/images/ capa.jpg',
    'ftp://host/capa.jpg',
    '/a<script>b',
    '/foo..bar.jpg',
    '/foo/..',
    'horizonte-digital',
    'Horizonte_Digital',
    '#d87dff',
    '45:30',
    '45:60',
  ];

  /** Desembrulha optional/nullable/default (mantendo ZodEffects intacto). */
  function unwrapField(field: unknown): unknown {
    let current: unknown = field;
    for (let depth = 0; depth < 6; depth += 1) {
      if (
        current instanceof z.ZodOptional ||
        current instanceof z.ZodNullable ||
        current instanceof z.ZodDefault
      ) {
        current = (current._def as { innerType: unknown }).innerType;
        continue;
      }
      return current;
    }
    return current;
  }

  /** Regex declarado no `.regex()` de um ZodString, se houver. */
  function zodRegexSource(field: unknown): string | null {
    const inner = unwrapObject(field) === null ? unwrapField(field) : unwrapField(field);
    let current: unknown = inner;
    for (let depth = 0; depth < 6; depth += 1) {
      if (current instanceof z.ZodString) {
        const checks = (current._def as { checks: { kind: string; regex?: RegExp }[] }).checks;
        const regexCheck = checks.find((check) => check.kind === 'regex');
        return regexCheck?.regex?.source ?? null;
      }
      if (!(current instanceof z.ZodType)) return null;
      const def = current._def as { schema?: unknown; innerType?: unknown };
      const next = def.schema ?? def.innerType;
      if (next === undefined) return null;
      current = next;
    }
    return null;
  }

  const propertiesWithPattern = zodBackedComponents.flatMap((entry) => {
    const objectSchema = unwrapObject(zodExport(entry.zodName));
    if (objectSchema === null) return [];
    return Object.entries(entry.resolved.properties).flatMap(([propertyName, property]) => {
      const pattern = asRecord(property).pattern;
      const field = objectSchema.shape[propertyName];
      if (typeof pattern !== 'string' || field === undefined) return [];
      return [{ ...entry, propertyName, pattern, field }];
    });
  });

  it('existe pelo menos um pattern publicado para conferir', () => {
    expect(propertiesWithPattern.length).toBeGreaterThan(10);
  });

  it('o pattern do YAML e igual ao regex declarado no Zod, quando houver', () => {
    const mismatches: string[] = [];
    for (const entry of propertiesWithPattern) {
      const source = zodRegexSource(entry.field);
      if (source === null) continue;
      if (source !== entry.pattern) {
        mismatches.push(
          `${entry.file} ${entry.name}.${entry.propertyName}: yaml=${entry.pattern} zod=${source}`,
        );
      }
    }
    expect(mismatches).toEqual([]);
  });

  it('todo campo de imagem publica exatamente IMAGE_REF_PATTERN', () => {
    const imageFields = propertiesWithPattern.filter(
      (entry) => unwrapField(entry.field) === schemas.imageRefSchema,
    );
    expect(imageFields.length).toBeGreaterThan(0);
    for (const entry of imageFields) {
      expect(entry.pattern, `${entry.file} ${entry.name}.${entry.propertyName}`).toBe(
        schemas.IMAGE_REF_PATTERN,
      );
    }
  });

  it('pattern do YAML e schema Zod concordam em todo o corpus de probes', () => {
    const divergences: string[] = [];
    for (const entry of propertiesWithPattern) {
      const regex = new RegExp(entry.pattern);
      for (const probe of PATTERN_PROBES) {
        const yamlAccepts = regex.test(probe);
        const zodAccepts = (entry.field as z.ZodTypeAny).safeParse(probe).success;
        if (yamlAccepts !== zodAccepts) {
          divergences.push(
            `${entry.file} ${entry.name}.${entry.propertyName} ${JSON.stringify(probe)}: yaml=${yamlAccepts} zod=${zodAccepts}`,
          );
        }
      }
    }
    expect(divergences).toEqual([]);
  });

  it('todo campo required existe entre as properties do componente', () => {
    const mismatches: string[] = [];
    for (const { file, doc } of documents) {
      const componentSchemas = asRecord(asRecord(doc.components).schemas);
      for (const [name, component] of Object.entries(componentSchemas)) {
        const resolved = resolveComponent(doc, component);
        if (!resolved.hasProperties) continue;
        const properties = Object.keys(resolved.properties);
        for (const required of resolved.required) {
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
      'GET /api/podcasts/{idOrSlug}',
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
