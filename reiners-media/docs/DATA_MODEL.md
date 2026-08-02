# Data Model — Reiners Media Podcast Studio

## Schema Prisma

```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
  directUrl = env("DIRECT_URL")
}

model Podcast {
  id            String    @id @default(uuid())
  slug          String    @unique
  title         String
  tagline       String?
  description   String    @db.Text
  coverImage    String
  heroImage     String?
  category      String
  status        String    // ACTIVE | ENDED | HIATUS
  visualStyle   String    // PHOTO_REAL | ILLUSTRATION | MINIMAL | DUOTONE | COLLAGE
  year          Int
  accentColor   String    @default("#d87dff")
  hosts         Json?     // [{name, photo, bio, initial}]
  socialLinks   Json?     // {instagram?, twitter?, tiktok?, linkedin?, website?, github?}
  episodes      Episode[]
  featured      Boolean   @default(false)
  displayOrder  Int       @default(0)
  deletedAt     DateTime?
  createdAt     DateTime  @default(now())
  updatedAt     DateTime  @updatedAt

  @@index([status])
  @@index([featured])
  @@index([displayOrder])
}

model Episode {
  id            String   @id @default(uuid())
  podcastId     String
  podcast       Podcast  @relation(fields: [podcastId], references: [id], onDelete: Cascade)
  number        Int
  title         String
  description   String   @db.Text
  thumbnail     String?
  duration      String   // "45:30"
  publishedAt   DateTime
  youtubeUrl    String?
  youtubeEmbed  String?
  spotifyUrl    String?
  spotifyEmbed  String?
  createdAt     DateTime @default(now())

  @@index([podcastId])
  @@index([publishedAt])
}

model SiteConfig {
  id              String   @id @default(uuid())
  siteName        String   @default("Reiners Media")
  tagline         String   @default("Conteúdo que conecta")
  logoUrl         String?
  faviconUrl      String?
  primaryColor    String   @default("#d87dff")
  seoTitle        String?
  seoDescription  String?
  analyticsId     String?
  facebookPixel   String?
  customCss       String?  @db.Text
  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt
}

model AdminUser {
  id          String   @id @default(uuid())
  email       String   @unique
  name        String?
  role        String   @default("EDITOR") // ADMIN | EDITOR
  lastLoginAt DateTime?
  createdAt   DateTime @default(now())
}

model EventLog {
  id          String   @id @default(uuid())
  eventType   String   // PAGE_VIEW | CARD_EXPAND | YOUTUBE_CLICK | SPOTIFY_CLICK | EPISODE_PLAY | ADMIN_LOGIN | EPISODE_CREATE
  payload     Json?
  createdAt   DateTime @default(now())

  @@index([eventType])
  @@index([createdAt])
}

model Testimonial {
  id        String   @id @default(uuid())
  name      String
  role      String
  quote     String   @db.Text
  avatarUrl String?
  podcastId String?
  createdAt DateTime @default(now())
}

model Plan {
  id          String   @id @default(uuid())
  name        String
  price       String
  period      String
  description String?  @db.Text
  features    Json     // ["Gravação 4K", "Edição em 48h", ...]
  isFeatured  Boolean  @default(false)
  displayOrder Int     @default(0)
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt
}
```

## Relacionamentos

- Podcast 1:N Episode (um programa tem muitos episódios)
- Podcast 1:N Testimonial (opcional)
- Podcast 0:1 Plan (opcional, se ligado a plano de serviço)

## Índices

| Tabela | Coluna(s) | Tipo | Razão |
|--------|-----------|------|-------|
| Podcast | status | B-tree | Filtragem por status em queries públicas |
| Podcast | featured | B-tree | Filtragem rápida de destaques |
| Podcast | displayOrder | B-tree | Ordenação do grid |
| Episode | podcastId | B-tree | Join com Podcast |
| Episode | publishedAt | B-tree | Ordenação cronológica |
| EventLog | eventType | B-tree | Agregação por tipo |
| EventLog | createdAt | B-tree | Filtro temporal, cleanup |

## Seed Data

5 podcasts com 5 episódios cada:
1. Horizonte Digital (tech, PHOTO_REAL)
2. Ressonância (saúde, ILLUSTRATION)
3. Código Aberto (dev, MINIMAL)
4. Latitud (viagens, DUOTONE)
5. Ofício (negócios, COLLAGE)

3 planos de serviço
3 depoimentos
1 usuário admin inicial
