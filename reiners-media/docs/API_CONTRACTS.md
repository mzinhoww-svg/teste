# API Contracts — Reiners Media Podcast Studio

## Base URL
`/api`

## Authentication
Todas as rotas admin requerem JWT Bearer token via cookie httpOnly.
Rotas públicas não requerem autenticação.

## Error Format
```json
{
  "error": {
    "code": "NOT_FOUND",
    "message": "Podcast not found",
    "details": {}
  }
}
```

## Endpoints

### Podcasts

#### GET /api/podcasts
Retorna lista paginada de podcasts.

**Query Parameters:**
- `page` (number, default: 1)
- `limit` (number, default: 20, max: 100)
- `status` (string, optional: ACTIVE|ENDED|HIATUS)
- `featured` (boolean, optional)
- `category` (string, optional)

**Response 200:**
```json
{
  "data": [Podcast],
  "meta": {
    "page": 1,
    "limit": 20,
    "total": 50,
    "totalPages": 3
  }
}
```

#### GET /api/podcasts/:slug
Retorna podcast único com episódios.

**Response 200:**
```json
{
  "data": Podcast & { episodes: Episode[] }
}
```

#### POST /api/podcasts
Cria novo podcast. Requer ADMIN ou EDITOR.

**Body:**
```json
{
  "title": "string",
  "slug": "string",
  "description": "string",
  "category": "string",
  "status": "ACTIVE",
  "visualStyle": "PHOTO_REAL",
  "year": 2024,
  "hosts": [{"name": "string", "initial": "string"}],
  "socialLinks": {},
  "featured": false
}
```

#### PATCH /api/podcasts/:id
Atualiza podcast. Requer ADMIN ou EDITOR.

#### DELETE /api/podcasts/:id
Soft delete. Requer ADMIN.

### Episodes

#### GET /api/episodes
Lista paginada de episódios.

**Query Parameters:**
- `page`, `limit`
- `podcastId` (string, required)

#### POST /api/episodes
Cria episódio. Requer ADMIN ou EDITOR.

**Body:**
```json
{
  "podcastId": "uuid",
  "number": 1,
  "title": "string",
  "description": "string",
  "duration": "45:30",
  "publishedAt": "2024-01-01T00:00:00Z",
  "youtubeUrl": "https://...",
  "spotifyUrl": "https://..."
}
```

**Auto-parse:**
- `youtubeUrl` -> extrair `youtubeEmbed` (video ID)
- `spotifyUrl` -> extrair `spotifyEmbed` (URI)

#### PATCH /api/episodes/:id
Atualiza episódio.

#### DELETE /api/episodes/:id
Remove episódio.

### Events

#### POST /api/events
Ingestão de evento de analytics.

**Body:**
```json
{
  "eventType": "PAGE_VIEW",
  "payload": {
    "path": "/portfolio",
    "referrer": "https://google.com",
    "userAgent": "..."
  }
}
```

**Rate Limit:** 100 req/min por IP

### Upload

#### POST /api/upload
Upload de imagem para Supabase Storage.

**Body:** multipart/form-data
- `file`: image/jpeg, image/png, image/webp (max 5MB)
- `folder`: "podcasts" | "episodes" | "avatars" | "logos"

**Response 200:**
```json
{
  "data": {
    "url": "https://...supabase.co/storage/...",
    "path": "podcasts/uuid-filename.jpg"
  }
}
```

### Auth

#### GET /api/auth/session
Retorna sessão atual.

#### POST /api/auth/login
Login com email/senha.

#### POST /api/auth/logout
Logout.

## Status Codes
- 200: OK
- 201: Created
- 400: Bad Request
- 401: Unauthorized
- 403: Forbidden
- 404: Not Found
- 429: Too Many Requests
- 500: Internal Server Error
