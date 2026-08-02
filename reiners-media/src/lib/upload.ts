/**
 * Upload de imagens para o Supabase Storage (TCK-005, CONTRACT-003 `upload.yaml`).
 *
 * Este módulo concentra tudo o que dá para decidir ANTES de tocar no bucket:
 * - validação de tamanho (`UPLOAD_MAX_BYTES`, 5MB) -> 413 PAYLOAD_TOO_LARGE;
 * - validação de MIME (`UPLOAD_ALLOWED_MIME_TYPES`) -> 415 UNSUPPORTED_MEDIA_TYPE;
 * - validação de pasta/nome (`uploadRequestSchema`) -> 422 VALIDATION_ERROR;
 * - normalização do nome do arquivo e montagem do path no bucket.
 *
 * A ordem importa: o binário só é enviado depois que os três passos acima
 * passam. Um arquivo de 6MB nunca chega a gastar banda com o Storage.
 *
 * A extensão gravada no bucket é derivada do MIME **declarado e validado**, não
 * do nome enviado pelo cliente: `payload.svg` com `Content-Type: image/png` é
 * gravado como `.png`, então o objeto servido nunca contradiz o seu content-type.
 */
import { randomUUID } from 'node:crypto';

import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';

import {
  UPLOAD_ALLOWED_MIME_TYPES,
  UPLOAD_MAX_BYTES,
  uploadFolderSchema,
  uploadRequestSchema,
  uploadResultSchema,
} from '@/lib/schemas';

export type UploadFolder = z.infer<typeof uploadFolderSchema>;
export type UploadMimeType = (typeof UPLOAD_ALLOWED_MIME_TYPES)[number];
export type UploadMetadata = z.infer<typeof uploadRequestSchema>;
export type UploadResult = z.infer<typeof uploadResultSchema>;

/** Bucket padrão quando `SUPABASE_STORAGE_BUCKET` não está definido. */
export const DEFAULT_STORAGE_BUCKET = 'reiners-media';

/** Extensão canônica de cada MIME aceito. */
export const EXTENSION_BY_MIME_TYPE: Record<UploadMimeType, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};

/** Códigos de erro que uma falha de upload pode assumir (subconjunto de `ErrorCode`). */
export type UploadErrorCode =
  | 'BAD_REQUEST'
  | 'VALIDATION_ERROR'
  | 'PAYLOAD_TOO_LARGE'
  | 'UNSUPPORTED_MEDIA_TYPE'
  | 'CONFLICT'
  | 'INTERNAL_ERROR';

/**
 * Erro de upload já classificado para o envelope de erro da API. O route
 * handler só precisa repassar `code`/`message`/`details`.
 */
export class UploadError extends Error {
  readonly code: UploadErrorCode;
  readonly details?: Record<string, unknown>;

  constructor(code: UploadErrorCode, message: string, details?: Record<string, unknown>) {
    super(message);
    this.name = 'UploadError';
    this.code = code;
    this.details = details;
  }
}

export type UploadValidation =
  | { ok: true; metadata: UploadMetadata }
  | { ok: false; error: UploadError };

/** `true` quando o MIME está na allowlist de imagens do contrato. */
export function isAllowedMimeType(value: string): value is UploadMimeType {
  return (UPLOAD_ALLOWED_MIME_TYPES as readonly string[]).includes(value);
}

/**
 * Reduz o nome enviado pelo cliente a um slug seguro para o bucket.
 *
 * Remove diretórios (`../../etc/passwd` -> `etc-passwd` vira apenas `passwd`),
 * acentos, espaços e qualquer caractere fora de `[a-z0-9-]`. A extensão
 * original é descartada: quem manda é o MIME validado.
 */
export function sanitizeFilename(filename: string): string {
  const basename = filename.split(/[\\/]/).pop() ?? '';
  const withoutExtension = basename.replace(/\.[^.]*$/, '') || basename;
  const slug = withoutExtension
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
    .replace(/^-+|-+$/g, '');
  return slug.length > 0 ? slug : 'arquivo';
}

/**
 * Monta o path do objeto dentro do bucket: `<folder>/<uuid>-<nome>.<ext>`.
 * O UUID evita colisão entre uploads com o mesmo nome.
 */
export function buildStoragePath(
  folder: UploadFolder,
  filename: string,
  contentType: UploadMimeType,
  id: string = randomUUID(),
): string {
  return `${folder}/${id}-${sanitizeFilename(filename)}.${EXTENSION_BY_MIME_TYPE[contentType]}`;
}

/**
 * Valida os metadados do arquivo antes de qualquer escrita no Storage.
 *
 * Tamanho e MIME são checados ANTES do `uploadRequestSchema` de propósito: o
 * schema também rejeitaria os dois casos, mas com `VALIDATION_ERROR` (422),
 * enquanto o contrato exige 413 para arquivo grande e 415 para MIME não
 * suportado.
 */
export function validateUploadMetadata(input: {
  folder: unknown;
  filename: unknown;
  contentType: unknown;
  size: unknown;
}): UploadValidation {
  if (typeof input.size !== 'number' || !Number.isFinite(input.size) || input.size <= 0) {
    return {
      ok: false,
      error: new UploadError('BAD_REQUEST', 'Arquivo vazio ou sem tamanho legível', {
        size: input.size ?? null,
      }),
    };
  }

  if (input.size > UPLOAD_MAX_BYTES) {
    return {
      ok: false,
      error: new UploadError(
        'PAYLOAD_TOO_LARGE',
        `Arquivo excede o limite de ${UPLOAD_MAX_BYTES} bytes (5MB)`,
        { size: input.size, maxBytes: UPLOAD_MAX_BYTES },
      ),
    };
  }

  if (typeof input.contentType !== 'string' || !isAllowedMimeType(input.contentType)) {
    return {
      ok: false,
      error: new UploadError(
        'UNSUPPORTED_MEDIA_TYPE',
        `Tipo de arquivo não suportado. Aceitos: ${UPLOAD_ALLOWED_MIME_TYPES.join(', ')}`,
        { contentType: typeof input.contentType === 'string' ? input.contentType : null },
      ),
    };
  }

  const parsed = uploadRequestSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: new UploadError('VALIDATION_ERROR', 'Metadados de upload inválidos', {
        issues: parsed.error.flatten().fieldErrors,
      }),
    };
  }

  return { ok: true, metadata: parsed.data };
}

/** Nome do bucket configurado no ambiente. */
export function getStorageBucket(): string {
  const bucket = process.env.SUPABASE_STORAGE_BUCKET?.trim();
  return bucket && bucket.length > 0 ? bucket : DEFAULT_STORAGE_BUCKET;
}

/**
 * Cliente de Storage com a service role key.
 *
 * Criado por chamada (e não memoizado em módulo) para que o handler nunca
 * carregue credenciais em import time e para que testes possam trocar o
 * `@supabase/supabase-js` por um duplo sem lidar com cache.
 */
export function createStorageClient(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();

  if (!url || !serviceRoleKey) {
    throw new UploadError(
      'INTERNAL_ERROR',
      'Storage não configurado: defina NEXT_PUBLIC_SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY',
    );
  }

  return createClient(url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/** `true` quando a falha do Storage é colisão de path (objeto já existe). */
function isDuplicateObjectError(error: { message?: string; statusCode?: string | number }): boolean {
  const message = (error.message ?? '').toLowerCase();
  const status = String(error.statusCode ?? '');
  return status === '409' || message.includes('already exists') || message.includes('duplicate');
}

/**
 * Envia o binário ao bucket e devolve `{ url, path }` já validados por
 * `uploadResultSchema`.
 *
 * Lança `UploadError` classificado: `CONFLICT` para colisão de path e
 * `INTERNAL_ERROR` para qualquer outra falha do Storage.
 */
export async function uploadImage(
  input: {
    folder: UploadFolder;
    filename: string;
    contentType: UploadMimeType;
    body: ArrayBuffer | Uint8Array | Blob;
  },
  client: SupabaseClient = createStorageClient(),
): Promise<UploadResult> {
  const path = buildStoragePath(input.folder, input.filename, input.contentType);
  const bucket = client.storage.from(getStorageBucket());

  const { error } = await bucket.upload(path, input.body, {
    contentType: input.contentType,
    cacheControl: '3600',
    upsert: false,
  });

  if (error) {
    const failure = error as unknown as { message?: string; statusCode?: string | number };
    if (isDuplicateObjectError(failure)) {
      throw new UploadError('CONFLICT', 'Já existe um objeto com esse path no bucket', { path });
    }
    throw new UploadError('INTERNAL_ERROR', `Falha ao gravar no Storage: ${error.message}`, {
      path,
    });
  }

  const publicUrl = bucket.getPublicUrl(path)?.data?.publicUrl;
  if (!publicUrl) {
    throw new UploadError('INTERNAL_ERROR', 'Storage não devolveu URL pública para o objeto', {
      path,
    });
  }

  const result = uploadResultSchema.safeParse({ url: publicUrl, path });
  if (!result.success) {
    throw new UploadError('INTERNAL_ERROR', 'Storage devolveu um resultado fora do contrato', {
      issues: result.error.flatten().fieldErrors,
    });
  }

  return result.data;
}
