/**
 * TCK-016 — Fixture de programa usada pelos testes de componente.
 *
 * O objeto é montado no formato PÚBLICO (o que `toPublicPodcastWithEpisodes`
 * devolve), não no formato do Prisma: nada de `deletedAt`, timestamps já em
 * ISO-8601. `programa.test.tsx` valida a fixture contra
 * `podcastWithEpisodesSchema` — um fixture que o contrato rejeitaria testaria
 * uma página que nunca vai existir.
 */
import type { Episode, PodcastWithEpisodes } from '@/types/api';

export const YOUTUBE_ID = 'dQw4w9WgXcQ';
export const SPOTIFY_ID = '4rOoJ6Egrf8K2IrywzwOMk';

export function makeEpisode(overrides: Partial<Episode> = {}): Episode {
  return {
    id: '11111111-1111-4111-8111-111111111111',
    podcastId: '00000000-0000-4000-8000-000000000000',
    number: 1,
    title: 'O primeiro corte',
    description: 'Conversa sobre edição, ritmo e o que fica de fora do episódio.',
    thumbnail: '/episodios/01.jpg',
    duration: '45:30',
    publishedAt: '2025-03-10T02:00:00.000Z',
    youtubeUrl: `https://youtu.be/${YOUTUBE_ID}`,
    youtubeEmbed: YOUTUBE_ID,
    spotifyUrl: `https://open.spotify.com/episode/${SPOTIFY_ID}`,
    spotifyEmbed: `spotify:episode:${SPOTIFY_ID}`,
    createdAt: '2025-03-01T12:00:00.000Z',
    ...overrides,
  };
}

export function makePodcast(overrides: Partial<PodcastWithEpisodes> = {}): PodcastWithEpisodes {
  return {
    id: '00000000-0000-4000-8000-000000000000',
    slug: 'oficio',
    title: 'Ofício',
    tagline: 'Histórias de quem faz com as próprias mãos.',
    description:
      'Uma conversa longa com quem vive de fazer.\n\nCada episódio acompanha um ofício diferente, do começo ao fim.',
    coverImage: '/capas/oficio.jpg',
    heroImage: '/capas/oficio-hero.jpg',
    category: 'Documental',
    status: 'ACTIVE',
    visualStyle: 'PHOTO_REAL',
    year: 2024,
    accentColor: '#d87dff',
    hosts: [
      { name: 'Marina Reiners', initial: 'MR', photo: '/hosts/marina.jpg', bio: 'Documentarista.' },
      { name: 'Caio Souza', initial: 'CS', photo: null, bio: null },
    ],
    socialLinks: {
      instagram: 'https://instagram.com/oficio',
      website: 'https://oficio.example.com',
    },
    featured: true,
    displayOrder: 0,
    createdAt: '2024-01-05T10:00:00.000Z',
    updatedAt: '2025-03-10T10:00:00.000Z',
    episodes: [makeEpisode()],
    ...overrides,
  };
}
