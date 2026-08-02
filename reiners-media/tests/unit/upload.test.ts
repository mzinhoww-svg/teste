// @vitest-environment node
/**
 * TCK-005 — testes unitários de `src/lib/upload.ts`.
 *
 * Cobre o que precisa estar decidido ANTES de qualquer escrita no Supabase
 * Storage: limite de 5MB (critério de aceitação explícito do ticket), allowlist
 * de MIME, normalização do nome do arquivo e classificação das falhas do
 * Storage. O cliente de Storage é injetado como duplo — o ambiente não tem
 * Supabase e o objetivo aqui é a lógica, não a rede.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  UPLOAD_ALLOWED_MIME_TYPES,
  UPLOAD_MAX_BYTES,
  uploadResultSchema,
} from '@/lib/schemas';
import {
  DEFAULT_STORAGE_BUCKET,
  EXTENSION_BY_MIME_TYPE,
  UploadError,
  buildStoragePath,
  createStorageClient,
  getStorageBucket,
  isAllowedMimeType,
  sanitizeFilename,
  uploadImage,
  validateUploadMetadata,
} from '@/lib/upload';

type StorageStub = {
  upload: ReturnType<typeof vi.fn>;
  getPublicUrl: ReturnType<typeof vi.fn>;
};

function storageClientStub(overrides: Partial<StorageStub> = {}) {
  const bucketApi: StorageStub = {
    upload: vi.fn(async () => ({ data: { path: 'ok' }, error: null })),
    getPublicUrl: vi.fn((path: string) => ({
      data: { publicUrl: `https://project.supabase.co/storage/v1/object/public/reiners-media/${path}` },
    })),
    ...overrides,
  };
  const from = vi.fn(() => bucketApi);
  return { client: { storage: { from } } as never, bucketApi, from };
}

const validMetadata = {
  folder: 'podcasts',
  filename: 'capa.jpg',
  contentType: 'image/jpeg',
  size: 1024,
};

describe('sanitizeFilename', () => {
  it('reduz o nome a um slug seguro e descarta a extensão original', () => {
    expect(sanitizeFilename('Capa Do Programa.JPG')).toBe('capa-do-programa');
  });

  it('remove acentuação mantendo o nome legível', () => {
    expect(sanitizeFilename('edição especial.png')).toBe('edicao-especial');
  });

  it('descarta diretórios e neutraliza path traversal', () => {
    expect(sanitizeFilename('../../etc/passwd')).toBe('passwd');
    expect(sanitizeFilename('..\\..\\windows\\system32.png')).toBe('system32');
  });

  it('cai em um nome padrão quando nada sobra', () => {
    expect(sanitizeFilename('***.png')).toBe('arquivo');
    expect(sanitizeFilename('')).toBe('arquivo');
  });

  it('limita o comprimento do slug', () => {
    expect(sanitizeFilename(`${'a'.repeat(200)}.png`)).toHaveLength(60);
  });
});

describe('buildStoragePath', () => {
  it('monta <folder>/<id>-<nome>.<ext> com a extensão derivada do MIME', () => {
    expect(buildStoragePath('podcasts', 'capa.jpg', 'image/webp', 'fixed-id')).toBe(
      'podcasts/fixed-id-capa.webp',
    );
  });

  it('nunca deixa o nome do cliente ditar a extensão servida', () => {
    // `payload.svg` declarado como PNG vira `.png`: o objeto no bucket não pode
    // contradizer o content-type com que será servido.
    expect(buildStoragePath('avatars', 'payload.svg', 'image/png', 'fixed-id')).toBe(
      'avatars/fixed-id-payload.png',
    );
  });

  it('gera um id único quando nenhum é informado', () => {
    const first = buildStoragePath('logos', 'logo.png', 'image/png');
    const second = buildStoragePath('logos', 'logo.png', 'image/png');
    expect(first).not.toBe(second);
    expect(first.startsWith('logos/')).toBe(true);
  });

  it('cobre toda a allowlist de MIME', () => {
    for (const mime of UPLOAD_ALLOWED_MIME_TYPES) {
      expect(buildStoragePath('episodes', 'x.bin', mime, 'id')).toBe(
        `episodes/id-x.${EXTENSION_BY_MIME_TYPE[mime]}`,
      );
    }
  });
});

describe('isAllowedMimeType', () => {
  it('aceita apenas jpeg, png e webp', () => {
    expect(isAllowedMimeType('image/jpeg')).toBe(true);
    expect(isAllowedMimeType('image/png')).toBe(true);
    expect(isAllowedMimeType('image/webp')).toBe(true);
    expect(isAllowedMimeType('image/gif')).toBe(false);
    expect(isAllowedMimeType('application/pdf')).toBe(false);
    expect(isAllowedMimeType('image/svg+xml')).toBe(false);
  });
});

describe('validateUploadMetadata', () => {
  it('aceita metadados válidos', () => {
    const result = validateUploadMetadata(validMetadata);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.metadata).toEqual(validMetadata);
    }
  });

  it('aceita exatamente 5MB (limite inclusivo)', () => {
    const result = validateUploadMetadata({ ...validMetadata, size: UPLOAD_MAX_BYTES });
    expect(result.ok).toBe(true);
  });

  it('rejeita 5MB + 1 byte com PAYLOAD_TOO_LARGE', () => {
    const result = validateUploadMetadata({ ...validMetadata, size: UPLOAD_MAX_BYTES + 1 });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('PAYLOAD_TOO_LARGE');
      expect(result.error.details).toMatchObject({ maxBytes: UPLOAD_MAX_BYTES });
    }
  });

  it('rejeita um arquivo de 6MB (critério de aceitação do ticket)', () => {
    const result = validateUploadMetadata({ ...validMetadata, size: 6 * 1024 * 1024 });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('PAYLOAD_TOO_LARGE');
  });

  it('rejeita MIME fora da allowlist com UNSUPPORTED_MEDIA_TYPE', () => {
    for (const contentType of ['image/gif', 'application/pdf', 'text/html', '']) {
      const result = validateUploadMetadata({ ...validMetadata, contentType });
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error.code).toBe('UNSUPPORTED_MEDIA_TYPE');
    }
  });

  it('checa tamanho antes de MIME: 6MB de PDF ainda é 413', () => {
    const result = validateUploadMetadata({
      ...validMetadata,
      contentType: 'application/pdf',
      size: 6 * 1024 * 1024,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('PAYLOAD_TOO_LARGE');
  });

  it('rejeita pasta fora do enum com VALIDATION_ERROR', () => {
    const result = validateUploadMetadata({ ...validMetadata, folder: 'raiz' });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('VALIDATION_ERROR');
      expect(result.error.details).toHaveProperty('issues');
    }
  });

  it('rejeita nome de arquivo vazio com VALIDATION_ERROR', () => {
    const result = validateUploadMetadata({ ...validMetadata, filename: '' });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('VALIDATION_ERROR');
  });

  it('rejeita arquivo sem tamanho legível com BAD_REQUEST', () => {
    for (const size of [0, -1, Number.NaN, 'grande', undefined]) {
      const result = validateUploadMetadata({ ...validMetadata, size });
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error.code).toBe('BAD_REQUEST');
    }
  });
});

describe('getStorageBucket', () => {
  const original = process.env.SUPABASE_STORAGE_BUCKET;

  beforeEach(() => {
    process.env.SUPABASE_STORAGE_BUCKET = original;
  });

  it('usa a variável de ambiente quando definida', () => {
    process.env.SUPABASE_STORAGE_BUCKET = 'outro-bucket';
    expect(getStorageBucket()).toBe('outro-bucket');
  });

  it('cai no bucket padrão quando ausente ou em branco', () => {
    delete process.env.SUPABASE_STORAGE_BUCKET;
    expect(getStorageBucket()).toBe(DEFAULT_STORAGE_BUCKET);
    process.env.SUPABASE_STORAGE_BUCKET = '   ';
    expect(getStorageBucket()).toBe(DEFAULT_STORAGE_BUCKET);
  });
});

describe('createStorageClient', () => {
  it('falha com INTERNAL_ERROR quando o ambiente não está configurado', () => {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;

    try {
      expect(() => createStorageClient()).toThrowError(UploadError);
      try {
        createStorageClient();
      } catch (error) {
        expect((error as UploadError).code).toBe('INTERNAL_ERROR');
      }
    } finally {
      if (url !== undefined) process.env.NEXT_PUBLIC_SUPABASE_URL = url;
      if (key !== undefined) process.env.SUPABASE_SERVICE_ROLE_KEY = key;
    }
  });
});

describe('uploadImage', () => {
  it('grava no bucket e devolve { url, path } dentro do contrato', async () => {
    const { client, bucketApi, from } = storageClientStub();

    const result = await uploadImage(
      {
        folder: 'podcasts',
        filename: 'capa do programa.jpg',
        contentType: 'image/jpeg',
        body: new Uint8Array([1, 2, 3]),
      },
      client,
    );

    expect(uploadResultSchema.safeParse(result).success).toBe(true);
    expect(result.path).toMatch(/^podcasts\/[0-9a-f-]{36}-capa-do-programa\.jpg$/);
    expect(result.url).toContain(result.path);
    expect(from).toHaveBeenCalledWith(getStorageBucket());
    expect(bucketApi.upload).toHaveBeenCalledWith(
      result.path,
      expect.any(Uint8Array),
      expect.objectContaining({ contentType: 'image/jpeg', upsert: false }),
    );
  });

  it('traduz colisão de path em CONFLICT', async () => {
    const { client } = storageClientStub({
      upload: vi.fn(async () => ({
        data: null,
        error: { message: 'The resource already exists', statusCode: '409' },
      })),
    });

    await expect(
      uploadImage(
        { folder: 'avatars', filename: 'a.png', contentType: 'image/png', body: new Uint8Array(1) },
        client,
      ),
    ).rejects.toMatchObject({ code: 'CONFLICT' });
  });

  it('traduz falha genérica do Storage em INTERNAL_ERROR', async () => {
    const { client } = storageClientStub({
      upload: vi.fn(async () => ({ data: null, error: { message: 'bucket offline' } })),
    });

    await expect(
      uploadImage(
        { folder: 'logos', filename: 'l.png', contentType: 'image/png', body: new Uint8Array(1) },
        client,
      ),
    ).rejects.toMatchObject({ code: 'INTERNAL_ERROR' });
  });

  it('falha quando o Storage não devolve URL pública', async () => {
    const { client } = storageClientStub({
      getPublicUrl: vi.fn(() => ({ data: { publicUrl: '' } })),
    });

    await expect(
      uploadImage(
        { folder: 'logos', filename: 'l.png', contentType: 'image/png', body: new Uint8Array(1) },
        client,
      ),
    ).rejects.toMatchObject({ code: 'INTERNAL_ERROR' });
  });

  it('falha quando o Storage devolve URL fora do contrato', async () => {
    const { client } = storageClientStub({
      getPublicUrl: vi.fn(() => ({ data: { publicUrl: 'nao-e-url' } })),
    });

    await expect(
      uploadImage(
        { folder: 'logos', filename: 'l.png', contentType: 'image/png', body: new Uint8Array(1) },
        client,
      ),
    ).rejects.toMatchObject({ code: 'INTERNAL_ERROR' });
  });
});
