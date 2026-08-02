/**
 * `POST /api/upload` — TCK-005, `contracts/api/upload.yaml`.
 *
 * Recebe `multipart/form-data` com os campos `file` e `folder`, valida e grava
 * no Supabase Storage. A ordem das checagens segue o contrato:
 *
 * | Situação                          | Código                 | Status |
 * |-----------------------------------|------------------------|--------|
 * | janela de 10/min estourada        | RATE_LIMITED           | 429    |
 * | sem sessão                        | UNAUTHORIZED           | 401    |
 * | papel sem permissão               | FORBIDDEN              | 403    |
 * | form inválido / `file` ausente    | BAD_REQUEST            | 400    |
 * | arquivo > 5MB                     | PAYLOAD_TOO_LARGE      | 413    |
 * | MIME fora de jpeg/png/webp        | UNSUPPORTED_MEDIA_TYPE | 415    |
 * | `folder` fora do enum             | VALIDATION_ERROR       | 422    |
 * | objeto já existe no bucket        | CONFLICT               | 409    |
 * | falha do Storage                  | INTERNAL_ERROR         | 500    |
 *
 * O binário só chega ao bucket depois de tamanho, MIME e pasta validados
 * (`validateUploadMetadata` em `src/lib/upload.ts`).
 *
 * Falha do Storage responde SEMPRE com a mesma mensagem genérica: o texto do
 * Supabase cita bucket, política de RLS, host interno e às vezes credencial, e
 * vai só para o log (`UploadError.internalMessage`).
 */
import type { NextRequest } from 'next/server';
import type { NextResponse } from 'next/server';

import { requireEditor } from '@/app/api/podcasts/_lib/guard';
// `_lib/http` mora sob `podcasts/` porque ambas as rotas são de TCK-005 e um
// `src/lib/http.ts` ficaria fora dos write_paths deste ticket.
import {
  apiError,
  handleRouteError,
  logServerError,
  validatedJson,
} from '@/app/api/podcasts/_lib/http';
import { RATE_LIMIT_POLICIES, enforceRateLimit } from '@/lib/auth-helpers';
import { UPLOAD_MAX_BYTES, uploadResponseSchema } from '@/lib/schemas';
import { UploadError, uploadImage, validateUploadMetadata } from '@/lib/upload';

export const dynamic = 'force-dynamic';

/** Folga para o envelope multipart (boundaries e headers de parte). */
const MULTIPART_OVERHEAD_BYTES = 100 * 1024;

interface UploadedFileLike {
  name: string;
  type: string;
  size: number;
  arrayBuffer: () => Promise<ArrayBuffer>;
}

function isFileLike(value: unknown): value is UploadedFileLike {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as { arrayBuffer?: unknown }).arrayBuffer === 'function' &&
    typeof (value as { size?: unknown }).size === 'number'
  );
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    // Rate limit ANTES da autorização: um flood anônimo precisa consumir o
    // contador, senão cada requisição não autenticada custa uma verificação de
    // sessão no Supabase indefinidamente, sem nunca tocar o limitador.
    const limited = enforceRateLimit(request, 'POST /api/upload', RATE_LIMIT_POLICIES.upload);
    if (limited) return limited;

    const session = await requireEditor(request);
    if (!session.ok) return session.response;

    const contentType = request.headers.get('content-type') ?? '';
    if (!contentType.toLowerCase().includes('multipart/form-data')) {
      return apiError('BAD_REQUEST', 'Envie o arquivo como multipart/form-data');
    }

    // Corte barato antes de bufferizar o corpo: quando o cliente declara um
    // tamanho acima do teto, nem chegamos a ler o stream.
    const declaredLength = Number(request.headers.get('content-length') ?? '');
    if (
      Number.isFinite(declaredLength) &&
      declaredLength > UPLOAD_MAX_BYTES + MULTIPART_OVERHEAD_BYTES
    ) {
      return apiError('PAYLOAD_TOO_LARGE', `Arquivo excede o limite de ${UPLOAD_MAX_BYTES} bytes (5MB)`, {
        size: declaredLength,
        maxBytes: UPLOAD_MAX_BYTES,
      });
    }

    let form: FormData;
    try {
      form = await request.formData();
    } catch {
      return apiError('BAD_REQUEST', 'Formulário multipart inválido');
    }

    const file = form.get('file');
    if (!isFileLike(file)) {
      return apiError('BAD_REQUEST', 'Campo "file" ausente ou não é um arquivo');
    }

    const folder = form.get('folder');
    const filenameField = form.get('filename');
    const filename =
      typeof filenameField === 'string' && filenameField.trim() !== ''
        ? filenameField.trim()
        : (file.name ?? '');

    const validation = validateUploadMetadata({
      folder: typeof folder === 'string' ? folder : null,
      filename,
      contentType: file.type,
      size: file.size,
    });

    if (!validation.ok) {
      return apiError(validation.error.code, validation.error.message, validation.error.details);
    }

    const metadata = validation.metadata;
    const body = new Uint8Array(await file.arrayBuffer());

    const result = await uploadImage({
      folder: metadata.folder,
      filename: metadata.filename,
      contentType: metadata.contentType,
      body,
    });

    return validatedJson(uploadResponseSchema, { data: result });
  } catch (error) {
    if (error instanceof UploadError) {
      // `internalMessage` (mensagem crua do Storage) fica no log; o cliente
      // recebe apenas a mensagem genérica de `error.message`.
      if (error.internalMessage) logServerError('POST /api/upload', error.internalMessage);
      return apiError(error.code, error.message, error.details);
    }
    return handleRouteError(error);
  }
}
