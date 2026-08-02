import type { Podcast, SiteConfig } from "./types";
import { normalizeTracks } from "./embeds";

// ==========================================================================
// Dataset de demonstração — 5 programas (um por visualStyle), 5 episódios cada.
//
// Serve a dois propósitos:
//   1. `prisma/seed.ts` popula o banco a partir daqui;
//   2. `lib/portfolio/data.ts` usa como fallback quando não há DATABASE_URL,
//      para que /portfolio nunca quebre em preview/CI (ver docs/portfolio.md).
//
// `coverImage: ""` é intencional: sem imagem, o poster renderiza apenas a arte
// gerada por CSS da sua variante — que é justamente o que os 5 estilos provam.
// ==========================================================================

interface DemoEpisode {
  number: number;
  title: string;
  description: string;
  duration: string;
  publishedAt: string;
  youtubeUrl?: string;
  spotifyUrl?: string;
}

interface DemoPodcast extends Omit<Podcast, "episodes" | "id"> {
  episodes: DemoEpisode[];
}

function ep(
  number: number,
  title: string,
  description: string,
  duration: string,
  publishedAt: string,
  youtubeUrl?: string,
  spotifyUrl?: string,
): DemoEpisode {
  return { number, title, description, duration, publishedAt, youtubeUrl, spotifyUrl };
}

export const DEMO_PODCASTS: DemoPodcast[] = [
  {
    slug: "in-loco",
    title: "In Loco",
    tagline: "A conversa acontece onde o trabalho acontece",
    description:
      "Episódios gravados dentro da operação do cliente — cooperativa, indústria, associação. Sem estúdio neutro, sem roteiro decorado: a estrutura vai até a sede e transforma bastidor em presença institucional. Cada episódio entrega o programa editado, cinco cortes verticais, um reel e o banco de fotos da gravação.",
    coverImage: "",
    heroImage: null,
    category: "Institucional",
    status: "ACTIVE",
    visualStyle: "PHOTO_REAL",
    year: 2024,
    accentColor: "#d87dff",
    hosts: [
      { name: "Marcelo Reiners", role: "Apresentador", bio: "Fundador da Reiners Media. Conduz a conversa a partir da operação, não do briefing.", initial: "MR" },
      { name: "Paula Andrade", role: "Direção", bio: "Responsável pela direção de conteúdo e pauta institucional.", initial: "PA" },
    ],
    socialLinks: { instagram: "https://instagram.com/reinersmedia", website: "https://reiners.agency" },
    featured: true,
    displayOrder: 1,
    episodes: [
      ep(1, "Sicredi MT: o estúdio dentro da cooperativa", "Como uma cooperativa passou a produzir comunicação própria sem terceirizar a voz institucional.", "58:12", "2024-03-11", "https://www.youtube.com/watch?v=aqz-KE-bpKQ", "https://open.spotify.com/episode/5Xt5DXGzch68nYYamXrNxZ"),
      ep(2, "Indústria Norte: quem conta a história da fábrica", "Três turnos, uma narrativa. O que muda quando o operador entra no enquadramento.", "47:30", "2024-04-08", "https://youtu.be/aqz-KE-bpKQ"),
      ep(3, "Associação e o custo do silêncio", "Entidades que só falam em crise pagam mais caro para serem ouvidas.", "52:04", "2024-05-13", undefined, "https://open.spotify.com/episode/5Xt5DXGzch68nYYamXrNxZ"),
      ep(4, "Agro que não vira commodity de conteúdo", "Posicionamento contínuo em um setor que confunde volume com autoridade.", "61:47", "2024-06-10", "https://www.youtube.com/watch?v=aqz-KE-bpKQ", "https://open.spotify.com/episode/5Xt5DXGzch68nYYamXrNxZ"),
      ep(5, "O diagnóstico antes do microfone", "Duas horas de escuta que decidem o que o programa vai ser pelos próximos 12 meses.", "44:19", "2024-07-15", "https://www.youtube.com/watch?v=aqz-KE-bpKQ"),
    ],
  },
  {
    slug: "campanha-viva",
    title: "Campanha Viva",
    tagline: "Videocast de temporada eleitoral",
    description:
      "Programa sazonal de agosto a outubro. Não é gestão de campanha nem cobertura de agenda: é o registro editorial de quem disputa espaço público, com rigor de estúdio e compromisso explícito de não prometer resultado eleitoral.",
    coverImage: "",
    heroImage: null,
    category: "Eleitoral",
    status: "HIATUS",
    visualStyle: "ILLUSTRATION",
    year: 2024,
    accentColor: "#d87dff",
    hosts: [{ name: "Marcelo Reiners", role: "Apresentador", bio: "Conduz as entrevistas de temporada.", initial: "MR" }],
    socialLinks: { instagram: "https://instagram.com/reinersmedia", twitter: "https://x.com/reinersmedia" },
    featured: true,
    displayOrder: 2,
    episodes: [
      ep(1, "Abertura de temporada", "O que este programa é — e o que ele deliberadamente não é.", "38:22", "2024-08-05", "https://www.youtube.com/watch?v=aqz-KE-bpKQ"),
      ep(2, "Cuiabá, 20 minutos de escuta", "A regra da casa: os primeiros vinte minutos são do entrevistado.", "55:10", "2024-08-19", undefined, "https://open.spotify.com/episode/5Xt5DXGzch68nYYamXrNxZ"),
      ec(3),
      ep(4, "Interior do estado", "Deslocamento, estrutura e o que muda fora da capital.", "49:58", "2024-09-16", "https://youtu.be/aqz-KE-bpKQ", "https://open.spotify.com/episode/5Xt5DXGzch68nYYamXrNxZ"),
      ep(5, "Encerramento sem placar", "Balanço editorial da temporada, sem leitura de resultado.", "41:33", "2024-10-07"),
    ],
  },
  {
    slug: "sala-de-escuta",
    title: "sala de escuta",
    tagline: "Conversas longas, edição curta",
    description:
      "Formato minimalista: um convidado, uma pergunta de abertura e o tempo que a resposta pedir. Sem vinheta, sem bloco patrocinado, sem corte para caber no algoritmo. O programa que a Reiners usa para testar a hipótese de que atenção ainda existe.",
    coverImage: "",
    heroImage: null,
    category: "Entrevista",
    status: "ACTIVE",
    visualStyle: "MINIMAL",
    year: 2023,
    accentColor: "#d87dff",
    hosts: [{ name: "Paula Andrade", role: "Apresentadora", bio: "Direção de conteúdo da Reiners Media.", initial: "PA" }],
    socialLinks: { website: "https://reiners.agency", linkedin: "https://linkedin.com/company/reinersmedia" },
    featured: true,
    displayOrder: 3,
    episodes: [
      ep(1, "o que sobra quando tira a trilha", "Abertura do formato: por que este programa não tem vinheta.", "72:05", "2023-09-12", "https://www.youtube.com/watch?v=aqz-KE-bpKQ", "https://open.spotify.com/episode/5Xt5DXGzch68nYYamXrNxZ"),
      ep(2, "arquitetura e tempo", "Um projeto de trinta anos contado sem acelerar.", "68:41", "2023-10-10", undefined, "https://open.spotify.com/episode/5Xt5DXGzch68nYYamXrNxZ"),
      ep(3, "quem edita a memória da empresa", "Acervo, arquivo e a comunicação que sobrevive à diretoria.", "64:19", "2023-11-14", "https://youtu.be/aqz-KE-bpKQ"),
      ep(4, "silêncio institucional", "Quando não falar também comunica.", "59:27", "2023-12-12", "https://www.youtube.com/watch?v=aqz-KE-bpKQ", "https://open.spotify.com/episode/5Xt5DXGzch68nYYamXrNxZ"),
      ep(5, "primeira temporada, sem conclusão", "O encerramento que não amarra as pontas.", "77:52", "2024-01-16"),
    ],
  },
  {
    slug: "domo",
    title: "Domo",
    tagline: "Podcast e domo geodésico em eventos",
    description:
      "A estrutura vai para dentro do evento: domo geodésico montado no piso da feira, episódios gravados ao vivo com quem passa. Produção contínua durante os dias de operação, com entrega diária de cortes para o cliente publicar ainda no evento.",
    coverImage: "",
    heroImage: null,
    category: "Eventos",
    status: "ACTIVE",
    visualStyle: "DUOTONE",
    year: 2025,
    accentColor: "#d87dff",
    hosts: [
      { name: "Marcelo Reiners", role: "Apresentador", bio: "Conduz as gravações no domo.", initial: "MR" },
      { name: "Time Reiners", role: "Operação", bio: "Equipe de captação, edição e entrega em campo.", initial: "TR" },
    ],
    socialLinks: { instagram: "https://instagram.com/reinersmedia", tiktok: "https://tiktok.com/@reinersmedia", website: "https://reiners.agency" },
    featured: false,
    displayOrder: 4,
    episodes: [
      ep(1, "Dia 1 — montagem e primeira conversa", "O domo sobe em quatro horas; o primeiro episódio sai na quinta.", "33:14", "2025-04-22", "https://www.youtube.com/watch?v=aqz-KE-bpKQ", "https://open.spotify.com/episode/5Xt5DXGzch68nYYamXrNxZ"),
      ep(2, "Dia 2 — o corredor como pauta", "Quem passa vira convidado: pauta aberta durante a feira.", "29:48", "2025-04-23", "https://youtu.be/aqz-KE-bpKQ"),
      ep(3, "Dia 3 — expositores e autoridade", "O que separa estande de posicionamento.", "36:02", "2025-04-24", undefined, "https://open.spotify.com/episode/5Xt5DXGzch68nYYamXrNxZ"),
      ep(4, "Dia 4 — encerramento ao vivo", "Último episódio gravado com a feira ainda aberta.", "41:55", "2025-04-25", "https://www.youtube.com/watch?v=aqz-KE-bpKQ", "https://open.spotify.com/episode/5Xt5DXGzch68nYYamXrNxZ"),
      ep(5, "Depois do desmonte", "O que fica publicado quando a estrutura vai embora.", "27:31", "2025-05-06"),
    ],
  },
  {
    slug: "bastidor",
    title: "Bastidor",
    tagline: "Recorrência institucional, episódio a episódio",
    description:
      "O programa de contrato contínuo: a Reiners assume a produção institucional da organização e publica em cadência fixa. Colagem de registros de campo, entrevistas internas e arquivo — o formato que transforma comunicação em ativo e não em campanha.",
    coverImage: "",
    heroImage: null,
    category: "Recorrência",
    status: "ENDED",
    visualStyle: "COLLAGE",
    year: 2022,
    accentColor: "#d87dff",
    hosts: [{ name: "Marcelo Reiners", role: "Direção", bio: "Direção da série institucional.", initial: "MR" }],
    socialLinks: { instagram: "https://instagram.com/reinersmedia", github: "https://github.com/reinersmedia" },
    featured: false,
    displayOrder: 5,
    episodes: [
      ep(1, "Piloto: o que é presença contínua", "A diferença entre publicar e sustentar posicionamento.", "45:00", "2022-02-15", "https://www.youtube.com/watch?v=aqz-KE-bpKQ"),
      ep(2, "Arquivo vivo", "Trinta anos de material bruto viram pauta.", "50:12", "2022-03-15", undefined, "https://open.spotify.com/episode/5Xt5DXGzch68nYYamXrNxZ"),
      ep(3, "Quem fala pela organização", "Porta-voz não é cargo — é preparo.", "43:36", "2022-04-19", "https://youtu.be/aqz-KE-bpKQ", "https://open.spotify.com/episode/5Xt5DXGzch68nYYamXrNxZ"),
      ep(4, "Cadência acima de volume", "Por que doze episódios bons superam cem posts.", "48:21", "2022-05-17", "https://www.youtube.com/watch?v=aqz-KE-bpKQ"),
      ep(5, "Encerramento da série", "O contrato acabou; o acervo ficou.", "39:44", "2022-06-21"),
    ],
  },
];

/** Episódio sem trilha publicada — exercita o estado `disabled` do TrilhaButton. */
function ec(number: number): DemoEpisode {
  return {
    number,
    title: "Debate na capital",
    description: "Gravação disponível apenas no acervo do cliente; trilhas públicas não publicadas.",
    duration: "62:41",
    publishedAt: "2024-09-02",
  };
}

export const DEMO_SITE_CONFIG: SiteConfig = {
  id: "demo-config",
  siteName: "Reiners Media",
  tagline: "Conteúdo que conecta",
  logoUrl: null,
  faviconUrl: null,
  primaryColor: "#d87dff",
  seoTitle: "Portfólio — Reiners Media",
  seoDescription:
    "Catálogo de programas da Reiners Media: podcasts institucionais, videocasts de temporada e séries de recorrência produzidos em Cuiabá/MT.",
  analyticsId: null,
  facebookPixel: null,
  customCss: null,
};

/** Converte o dataset de demonstração no formato de domínio (com ids sintéticos). */
export function demoPodcasts(): Podcast[] {
  return DEMO_PODCASTS.map((p, i) => ({
    ...p,
    id: `demo-${p.slug}`,
    hosts: p.hosts,
    socialLinks: p.socialLinks,
    episodes: p.episodes.map((e) => ({
      id: `demo-${p.slug}-${e.number}`,
      podcastId: `demo-${p.slug}`,
      number: e.number,
      title: e.title,
      description: e.description,
      thumbnail: null,
      duration: e.duration,
      publishedAt: new Date(e.publishedAt).toISOString(),
      ...normalizeTracks({ youtubeUrl: e.youtubeUrl, spotifyUrl: e.spotifyUrl }),
    })),
    displayOrder: p.displayOrder ?? i,
  }));
}
