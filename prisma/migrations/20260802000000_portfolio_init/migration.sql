-- CreateTable
CREATE TABLE "portfolio_podcasts" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "tagline" TEXT,
    "description" TEXT NOT NULL,
    "coverImage" TEXT NOT NULL,
    "heroImage" TEXT,
    "category" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "visualStyle" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "accentColor" TEXT NOT NULL DEFAULT '#d87dff',
    "hosts" JSONB,
    "socialLinks" JSONB,
    "featured" BOOLEAN NOT NULL DEFAULT false,
    "displayOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "portfolio_podcasts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "portfolio_episodes" (
    "id" TEXT NOT NULL,
    "podcastId" TEXT NOT NULL,
    "number" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "thumbnail" TEXT,
    "duration" TEXT NOT NULL,
    "publishedAt" TIMESTAMP(3) NOT NULL,
    "youtubeUrl" TEXT,
    "youtubeEmbed" TEXT,
    "spotifyUrl" TEXT,
    "spotifyEmbed" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "portfolio_episodes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "portfolio_site_config" (
    "id" TEXT NOT NULL,
    "siteName" TEXT NOT NULL DEFAULT 'Reiners Media',
    "tagline" TEXT NOT NULL DEFAULT 'Conteúdo que conecta',
    "logoUrl" TEXT,
    "faviconUrl" TEXT,
    "primaryColor" TEXT NOT NULL DEFAULT '#d87dff',
    "seoTitle" TEXT,
    "seoDescription" TEXT,
    "analyticsId" TEXT,
    "facebookPixel" TEXT,
    "customCss" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "portfolio_site_config_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "portfolio_admin_users" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT,
    "role" TEXT NOT NULL DEFAULT 'EDITOR',
    "lastLoginAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "portfolio_admin_users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "portfolio_event_log" (
    "id" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "payload" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "portfolio_event_log_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "portfolio_podcasts_slug_key" ON "portfolio_podcasts"("slug");

-- CreateIndex
CREATE INDEX "portfolio_podcasts_featured_displayOrder_idx" ON "portfolio_podcasts"("featured", "displayOrder");

-- CreateIndex
CREATE INDEX "portfolio_episodes_podcastId_publishedAt_idx" ON "portfolio_episodes"("podcastId", "publishedAt");

-- CreateIndex
CREATE UNIQUE INDEX "portfolio_episodes_podcastId_number_key" ON "portfolio_episodes"("podcastId", "number");

-- CreateIndex
CREATE UNIQUE INDEX "portfolio_admin_users_email_key" ON "portfolio_admin_users"("email");

-- CreateIndex
CREATE INDEX "portfolio_event_log_eventType_createdAt_idx" ON "portfolio_event_log"("eventType", "createdAt");

-- AddForeignKey
ALTER TABLE "portfolio_episodes" ADD CONSTRAINT "portfolio_episodes_podcastId_fkey" FOREIGN KEY ("podcastId") REFERENCES "portfolio_podcasts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

