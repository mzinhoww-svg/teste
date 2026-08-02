import { PrismaClient } from "@prisma/client";
import { DEMO_PODCASTS, DEMO_SITE_CONFIG } from "../lib/portfolio/demo-data";
import { normalizeTracks } from "../lib/portfolio/embeds";
import { toJson } from "../lib/portfolio/json";

// Seed do catálogo: 5 programas (um por visualStyle), 5 episódios cada,
// 1 SiteConfig e o admin inicial (PORTFOLIO_SEED_ADMIN_EMAIL).
//
// Idempotente: rodar de novo atualiza em vez de duplicar.
//   npm run portfolio:seed

const prisma = new PrismaClient();

async function main() {
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL não definida — configure o .env antes do seed.");
  }

  for (const demo of DEMO_PODCASTS) {
    const { episodes, ...podcastData } = demo;

    const podcast = await prisma.podcast.upsert({
      where: { slug: demo.slug },
      create: {
        ...podcastData,
        hosts: toJson(podcastData.hosts),
        socialLinks: toJson(podcastData.socialLinks),
      },
      update: {
        ...podcastData,
        hosts: toJson(podcastData.hosts),
        socialLinks: toJson(podcastData.socialLinks),
      },
    });

    for (const episode of episodes) {
      const tracks = normalizeTracks({
        youtubeUrl: episode.youtubeUrl,
        spotifyUrl: episode.spotifyUrl,
      });

      await prisma.episode.upsert({
        where: { podcastId_number: { podcastId: podcast.id, number: episode.number } },
        create: {
          podcastId: podcast.id,
          number: episode.number,
          title: episode.title,
          description: episode.description,
          duration: episode.duration,
          publishedAt: new Date(episode.publishedAt),
          ...tracks,
        },
        update: {
          title: episode.title,
          description: episode.description,
          duration: episode.duration,
          publishedAt: new Date(episode.publishedAt),
          ...tracks,
        },
      });
    }

    console.log(`✓ ${demo.title} (${demo.visualStyle}) — ${episodes.length} episódios`);
  }

  const existingConfig = await prisma.siteConfig.findFirst();
  const configData = {
    siteName: DEMO_SITE_CONFIG.siteName,
    tagline: DEMO_SITE_CONFIG.tagline,
    primaryColor: DEMO_SITE_CONFIG.primaryColor,
    seoTitle: DEMO_SITE_CONFIG.seoTitle,
    seoDescription: DEMO_SITE_CONFIG.seoDescription,
  };
  if (existingConfig) {
    await prisma.siteConfig.update({ where: { id: existingConfig.id }, data: configData });
  } else {
    await prisma.siteConfig.create({ data: configData });
  }
  console.log("✓ SiteConfig");

  const adminEmail = (process.env.PORTFOLIO_SEED_ADMIN_EMAIL ?? "").trim().toLowerCase();
  if (adminEmail) {
    await prisma.adminUser.upsert({
      where: { email: adminEmail },
      create: { email: adminEmail, name: "Admin inicial", role: "ADMIN" },
      update: { role: "ADMIN" },
    });
    console.log(`✓ Admin inicial: ${adminEmail}`);
  } else {
    console.log(
      "! PORTFOLIO_SEED_ADMIN_EMAIL não definida — nenhum admin criado. " +
        "Use PORTFOLIO_ADMIN_EMAILS para o primeiro acesso.",
    );
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
