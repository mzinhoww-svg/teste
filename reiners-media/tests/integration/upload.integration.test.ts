// @vitest-environment node
/**
 * TCK-005 — testes de integração de `POST /api/upload`.
 *
 * Mesma abordagem de `podcasts.integration.test.ts`: o handler exportado roda
 * de verdade sobre um `NextRequest` com `multipart/form-data` real. São duplos
 * apenas as fronteiras externas — o Storage do Supabase e a resolução de sessão
 * de TCK-004 (`requireRole`) —, porque o ambiente não tem Supabase. Validação
 * de tamanho, de MIME, de pasta, ordem das checagens, rate limit e envelope de
 * resposta são exercitados sem simulação.
 */
import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { supabaseStub, storageState, authMock } = vi.hoisted(() => {
  const state = {
    uploadResult: { data: { path: 'ok' }, error: null } as {
      data: unknown;
      error: { message: string; statusCode?: string } | null;
    },
  };

  const bucketApi = {
    upload: vi.fn(async () => state.uploadResult),
    getPublicUrl: vi.fn((path: string) => ({
      data: {
        publicUrl: `https://projeto-de-teste.supabase.co/storage/v1/object/public/reiners-media/${path}`,
      },
    })),
  };

  return {
    supabaseStub: { storage: { from: vi.fn(() => bucketApi) } },
    storageState: { ...state, bucketApi },
    authMock: { requireRole: vi.fn() },
  };
});

// Storage: o `createClient` de `@supabase/supabase-js` devolve o duplo acima.
vi.mock('@supabase/supabase-js', () => ({ createClient: () => supabaseStub }));

// Sessão: mock PARCIAL de TCK-004 — só `requireRole` é substituído; o 401/403,
// o rate limit e o envelope de erro continuam sendo os do módulo real.
vi.mock('@/lib/auth-helpers', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/auth-helpers')>();
  return { ...actual, requireRole: authMock.requireRole };
});

import { POST } from '@/app/api/upload/route';
import { clearRateLimit, errorResponse, hasRoleRank } from '@/lib/auth-helpers';
import { UPLOAD_MAX_BYTES, errorResponseSchema, uploadResponseSchema } from '@/lib/schemas';

process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://projeto-de-teste.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'chave-de-teste';
process.env.SUPABASE_STORAGE_BUCKET = 'reiners-media';

type Role = 'ADMIN' | 'EDITOR';

/** Sessões válidas, indexadas pelo valor do cookie `sb-access-token`. */
const SESSION_BY_TOKEN: Record<string, { id: string; email: string; name: string | null; role: Role }> = {
  'token-admin': {
    id: 'aaaaaaaa-1111-4111-8111-111111111111',
    email: 'admin@reiners.media',
    name: 'Admin',
    role: 'ADMIN',
  },
  'token-editor': {
    id: 'bbbbbbbb-2222-4222-8222-222222222222',
    email: 'editor@reiners.media',
    name: 'Editor',
    role: 'EDITOR',
  },
};

interface UploadOptions {
  token?: string;
  folder?: string | null;
  file?: File | null;
  ip?: string;
}

function uploadRequest(options: UploadOptions = {}): NextRequest {
  const form = new FormData();
  if (options.file !== null) {
    form.set(
      'file',
      options.file ?? new File([new Uint8Array(2048)], 'capa.jpg', { type: 'image/jpeg' }),
    );
  }
  if (options.folder !== null) form.set('folder', options.folder ?? 'podcasts');

  const headers = new Headers();
  if (options.token) headers.set('cookie', `sb-access-token=${options.token}`);
  headers.set('x-forwarded-for', options.ip ?? '198.51.100.4');

  return new NextRequest('http://localhost/api/upload', { method: 'POST', headers, body: form });
}

function imageFile(sizeBytes: number, name = 'capa.jpg', type = 'image/jpeg'): File {
  return new File([new Uint8Array(sizeBytes)], name, { type });
}

async function readJson(response: Response): Promise<Record<string, unknown>> {
  return (await response.json()) as Record<string, unknown>;
}

beforeEach(() => {
  clearRateLimit();
  storageState.bucketApi.upload.mockClear();
  storageState.bucketApi.getPublicUrl.mockClear();
  storageState.uploadResult = { data: { path: 'ok' }, error: null };
  storageState.bucketApi.upload.mockImplementation(async () => storageState.uploadResult);

  authMock.requireRole.mockReset();
  authMock.requireRole.mockImplementation(
    async (required: Role, options: { request?: NextRequest }) => {
      const token = options?.request?.cookies.get('sb-access-token')?.value ?? '';
      const user = SESSION_BY_TOKEN[token];
      if (!user) return { ok: false, response: errorResponse('UNAUTHORIZED') };
      if (!hasRoleRank(user.role, required)) {
        return { ok: false, response: errorResponse('FORBIDDEN') };
      }
      return { ok: true, user, session: { authenticated: true, user, expiresAt: null } };
    },
  );
});

describe('POST /api/upload — autorização', () => {
  it('devolve 401 sem cookie de sessão e não toca no Storage', async () => {
    const response = await POST(uploadRequest());
    const body = await readJson(response);

    expect(response.status).toBe(401);
    expect(errorResponseSchema.parse(body).error.code).toBe('UNAUTHORIZED');
    expect(storageState.bucketApi.upload).not.toHaveBeenCalled();
  });

  it('devolve 401 com token que a sessão recusa', async () => {
    const response = await POST(uploadRequest({ token: 'token-forjado' }));
    expect(response.status).toBe(401);
  });

  it('aceita ADMIN e EDITOR (papel mínimo EDITOR)', async () => {
    for (const token of ['token-admin', 'token-editor']) {
      const response = await POST(uploadRequest({ token }));
      expect(response.status).toBe(200);
    }
    expect(authMock.requireRole).toHaveBeenCalledWith('EDITOR', expect.anything());
  });
});

describe('POST /api/upload — validação do arquivo', () => {
  it('rejeita arquivo de 6MB com 413 e sem escrever no bucket', async () => {
    const response = await POST(
      uploadRequest({ token: 'token-admin', file: imageFile(6 * 1024 * 1024, 'gigante.jpg') }),
    );
    const body = await readJson(response);

    expect(response.status).toBe(413);
    expect(errorResponseSchema.parse(body).error.code).toBe('PAYLOAD_TOO_LARGE');
    expect(body).toMatchObject({
      error: { details: { maxBytes: UPLOAD_MAX_BYTES } },
    });
    expect(storageState.bucketApi.upload).not.toHaveBeenCalled();
  });

  it('aceita exatamente 5MB (limite inclusivo)', async () => {
    const response = await POST(
      uploadRequest({ token: 'token-admin', file: imageFile(UPLOAD_MAX_BYTES, 'no-limite.jpg') }),
    );

    expect(response.status).toBe(200);
    expect(storageState.bucketApi.upload).toHaveBeenCalledTimes(1);
  });

  it('rejeita 5MB + 1 byte com 413', async () => {
    const response = await POST(
      uploadRequest({ token: 'token-admin', file: imageFile(UPLOAD_MAX_BYTES + 1, 'passou.jpg') }),
    );

    expect(response.status).toBe(413);
  });

  it('rejeita MIME não suportado com 415', async () => {
    for (const [name, type] of [
      ['animacao.gif', 'image/gif'],
      ['documento.pdf', 'application/pdf'],
      ['script.svg', 'image/svg+xml'],
    ]) {
      const response = await POST(
        uploadRequest({ token: 'token-admin', file: imageFile(1024, name, type) }),
      );
      const body = await readJson(response);

      expect(response.status).toBe(415);
      expect(errorResponseSchema.parse(body).error.code).toBe('UNSUPPORTED_MEDIA_TYPE');
    }
    expect(storageState.bucketApi.upload).not.toHaveBeenCalled();
  });

  it('aceita os três MIME da allowlist', async () => {
    for (const type of ['image/jpeg', 'image/png', 'image/webp']) {
      const response = await POST(
        uploadRequest({ token: 'token-admin', file: imageFile(512, 'imagem', type) }),
      );
      expect(response.status).toBe(200);
    }
  });

  it('rejeita pasta fora do enum com 422', async () => {
    const response = await POST(uploadRequest({ token: 'token-admin', folder: 'raiz' }));
    const body = await readJson(response);

    expect(response.status).toBe(422);
    expect(errorResponseSchema.parse(body).error.code).toBe('VALIDATION_ERROR');
    expect(storageState.bucketApi.upload).not.toHaveBeenCalled();
  });

  it('rejeita requisição sem o campo file com 400', async () => {
    const response = await POST(uploadRequest({ token: 'token-admin', file: null }));
    const body = await readJson(response);

    expect(response.status).toBe(400);
    expect(errorResponseSchema.parse(body).error.code).toBe('BAD_REQUEST');
  });

  it('rejeita corpo que não é multipart com 400', async () => {
    const headers = new Headers({
      'content-type': 'application/json',
      cookie: 'sb-access-token=token-admin',
    });
    const response = await POST(
      new NextRequest('http://localhost/api/upload', {
        method: 'POST',
        headers,
        body: JSON.stringify({ folder: 'podcasts' }),
      }),
    );

    expect(response.status).toBe(400);
  });

  it('rejeita arquivo vazio com 400', async () => {
    const response = await POST(
      uploadRequest({ token: 'token-admin', file: imageFile(0, 'vazio.jpg') }),
    );

    expect(response.status).toBe(400);
  });
});

describe('POST /api/upload — gravação no Storage', () => {
  it('devolve { url, path } dentro do contrato', async () => {
    const response = await POST(uploadRequest({ token: 'token-admin' }));
    const body = await readJson(response);

    expect(response.status).toBe(200);
    expect(uploadResponseSchema.safeParse(body).success).toBe(true);

    const data = body.data as { url: string; path: string };
    expect(data.path).toMatch(/^podcasts\/[0-9a-f-]{36}-capa\.jpg$/);
    expect(data.url).toContain(data.path);
    expect(supabaseStub.storage.from).toHaveBeenCalledWith('reiners-media');
    expect(storageState.bucketApi.upload).toHaveBeenCalledWith(
      data.path,
      expect.any(Uint8Array),
      expect.objectContaining({ contentType: 'image/jpeg', upsert: false }),
    );
  });

  it('grava na pasta pedida e normaliza o nome do arquivo', async () => {
    const response = await POST(
      uploadRequest({
        token: 'token-admin',
        folder: 'avatars',
        file: imageFile(256, 'Foto Do Host.PNG', 'image/png'),
      }),
    );
    const body = await readJson(response);

    expect(response.status).toBe(200);
    expect((body.data as { path: string }).path).toMatch(
      /^avatars\/[0-9a-f-]{36}-foto-do-host\.png$/,
    );
  });

  it('devolve 409 quando o objeto já existe no bucket', async () => {
    storageState.uploadResult = {
      data: null,
      error: { message: 'The resource already exists', statusCode: '409' },
    };

    const response = await POST(uploadRequest({ token: 'token-admin' }));
    const body = await readJson(response);

    expect(response.status).toBe(409);
    expect(errorResponseSchema.parse(body).error.code).toBe('CONFLICT');
  });

  it('devolve 500 quando o Storage falha', async () => {
    storageState.uploadResult = { data: null, error: { message: 'bucket indisponível' } };

    const response = await POST(uploadRequest({ token: 'token-admin' }));
    const body = await readJson(response);

    expect(response.status).toBe(500);
    expect(errorResponseSchema.parse(body).error.code).toBe('INTERNAL_ERROR');
  });

  it('REGRESSÃO: a mensagem do Storage nunca aparece no corpo do 500', async () => {
    // Mensagem de falha realista do Supabase Storage. Em produção esse texto
    // carrega política de RLS, nome de bucket, host interno e fragmento de
    // credencial — e o destinatário é um EDITOR autenticado, não um operador.
    const leak =
      'JWT expired for service_role key sb_secret_AbCdEf123456 on bucket reiners-media at postgres://user:hunter2@db.internal:5432';
    storageState.uploadResult = { data: null, error: { message: leak } };

    const response = await POST(uploadRequest({ token: 'token-editor' }));
    const body = await readJson(response);
    const serialized = JSON.stringify(body);

    expect(response.status).toBe(500);
    for (const secret of [
      'sb_secret_AbCdEf123456',
      'hunter2',
      'db.internal',
      'postgres://',
      'service_role',
      'JWT expired',
    ]) {
      expect(serialized).not.toContain(secret);
    }
    expect(errorResponseSchema.parse(body).error.message).toBe(
      'Não foi possível armazenar o arquivo',
    );
  });

  it('o diagnóstico não some: vai para o log do servidor, fora do corpo', async () => {
    const leak = 'JWT expired for service_role key sb_secret_AbCdEf123456 on bucket reiners-media';
    storageState.uploadResult = { data: null, error: { message: leak } };

    // `logServerError` é silencioso sob teste para não poluir a suíte; aqui
    // trocamos o ambiente justamente para provar que o log acontece.
    vi.stubEnv('NODE_ENV', 'production');
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    try {
      const response = await POST(uploadRequest({ token: 'token-admin' }));
      const body = await readJson(response);

      expect(response.status).toBe(500);
      expect(JSON.stringify(body)).not.toContain('sb_secret_AbCdEf123456');
      expect(consoleError).toHaveBeenCalledWith(
        '[POST /api/upload]',
        expect.stringContaining(leak),
      );
    } finally {
      consoleError.mockRestore();
      vi.unstubAllEnvs();
    }
  });

  it('REGRESSÃO: ambiente de Storage ausente não vaza nome de variável nem chave', async () => {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;

    try {
      const response = await POST(uploadRequest({ token: 'token-admin' }));
      const body = await readJson(response);

      expect(response.status).toBe(500);
      expect(JSON.stringify(body)).not.toContain('SUPABASE_SERVICE_ROLE_KEY');
    } finally {
      if (url !== undefined) process.env.NEXT_PUBLIC_SUPABASE_URL = url;
      if (key !== undefined) process.env.SUPABASE_SERVICE_ROLE_KEY = key;
    }
  });
});

describe('POST /api/upload — rate limiting', () => {
  it('conta a requisição ANÔNIMA: flood sem sessão chega a 429, não fica em 401', async () => {
    // Se o limite fosse aplicado depois da autorização, cada requisição anônima
    // sairia no 401 sem tocar o contador — e custaria uma verificação de sessão
    // no Supabase, indefinidamente.
    let last: Response | undefined;
    for (let i = 0; i < 11; i += 1) {
      last = await POST(uploadRequest({ ip: '203.0.113.99' }));
    }

    expect(last?.status).toBe(429);
    expect(storageState.bucketApi.upload).not.toHaveBeenCalled();
  });

  it('devolve 429 depois de 10 uploads por minuto do mesmo IP', async () => {
    let last: Response | undefined;
    for (let i = 0; i < 11; i += 1) {
      last = await POST(uploadRequest({ token: 'token-admin', ip: '203.0.113.42' }));
    }

    expect(last?.status).toBe(429);
    const body = await readJson(last as Response);
    expect(errorResponseSchema.parse(body).error.code).toBe('RATE_LIMITED');
    expect(storageState.bucketApi.upload).toHaveBeenCalledTimes(10);
  });
});
