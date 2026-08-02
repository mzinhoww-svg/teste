/**
 * Seed idempotente — Reiners Media Podcast Studio (TCK-002).
 *
 * Regras de negócio exercitadas pelos dados (docs/PRD.md §Regras):
 *  - BR-003: todo programa tem pelo menos 1 host.
 *  - BR-004: todo episódio tem pelo menos 1 trilha (YouTube ou Spotify).
 *  - BR-005: no máximo 3 programas em destaque.
 *  - BR-006: programa ENDED nunca aparece em destaques.
 *
 * Todas as escritas usam `upsert` com chave estável (slug, e-mail ou UUID
 * determinístico), portanto rodar o seed N vezes produz sempre o mesmo estado.
 *
 * Os dados são exportados como constantes puras para que os testes possam
 * validá-los sem qualquer acesso ao banco. `main()` só executa quando o arquivo
 * é rodado diretamente (`prisma db seed` / `tsx prisma/seed.ts`).
 */
import { createHash } from 'node:crypto';

import { PrismaClient, type Prisma } from '@prisma/client';

/* -------------------------------------------------------------------------- */
/* Tipos                                                                       */
/* -------------------------------------------------------------------------- */

export type PodcastStatus = 'ACTIVE' | 'ENDED' | 'HIATUS';

export type VisualStyle =
  | 'PHOTO_REAL'
  | 'ILLUSTRATION'
  | 'MINIMAL'
  | 'DUOTONE'
  | 'COLLAGE';

export interface HostSeed {
  name: string;
  photo: string;
  bio: string;
  initial: string;
}

export interface SocialLinksSeed {
  instagram?: string;
  twitter?: string;
  tiktok?: string;
  linkedin?: string;
  website?: string;
  github?: string;
}

export interface PodcastSeed {
  slug: string;
  title: string;
  tagline: string;
  description: string;
  coverImage: string;
  heroImage: string;
  category: string;
  status: PodcastStatus;
  visualStyle: VisualStyle;
  year: number;
  accentColor: string;
  hosts: HostSeed[];
  socialLinks: SocialLinksSeed;
  featured: boolean;
  displayOrder: number;
}

export interface EpisodeSeed {
  podcastSlug: string;
  number: number;
  title: string;
  description: string;
  thumbnail: string;
  duration: string;
  publishedAt: string;
  youtubeUrl: string | null;
  youtubeEmbed: string | null;
  spotifyUrl: string | null;
  spotifyEmbed: string | null;
}

export interface PlanSeed {
  name: string;
  price: string;
  period: string;
  description: string;
  features: string[];
  isFeatured: boolean;
  displayOrder: number;
}

export interface TestimonialSeed {
  name: string;
  role: string;
  quote: string;
  avatarUrl: string;
  podcastSlug: string | null;
}

export interface SiteConfigSeed {
  siteName: string;
  tagline: string;
  logoUrl: string;
  faviconUrl: string;
  primaryColor: string;
  seoTitle: string;
  seoDescription: string;
  analyticsId: string | null;
  facebookPixel: string | null;
  customCss: string | null;
}

export interface AdminUserSeed {
  email: string;
  name: string;
  role: 'ADMIN' | 'EDITOR';
}

interface EpisodeBlueprint {
  number: number;
  title: string;
  description: string;
  duration: string;
  publishedAt: string;
  youtubeId?: string;
  spotifyId?: string;
}

/* -------------------------------------------------------------------------- */
/* Identificadores determinísticos (UUID v5) — garantem idempotência           */
/* -------------------------------------------------------------------------- */

const SEED_NAMESPACE = '9f3a1c7e-5b2d-4e8a-9c1f-6d0b2a7e4f13';

export function deterministicId(name: string): string {
  const namespaceBytes = Buffer.from(SEED_NAMESPACE.replace(/-/g, ''), 'hex');
  const digest = createHash('sha1')
    .update(namespaceBytes)
    .update(name, 'utf8')
    .digest();

  const bytes = Buffer.from(digest.subarray(0, 16));
  bytes[6] = (bytes[6] & 0x0f) | 0x50; // versão 5
  bytes[8] = (bytes[8] & 0x3f) | 0x80; // variante RFC 4122

  const hex = bytes.toString('hex');
  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    hex.slice(12, 16),
    hex.slice(16, 20),
    hex.slice(20, 32),
  ].join('-');
}

export const episodeId = (podcastSlug: string, number: number): string =>
  deterministicId(`episode:${podcastSlug}:${number}`);

export const planId = (name: string): string => deterministicId(`plan:${name}`);

export const testimonialId = (name: string): string =>
  deterministicId(`testimonial:${name}`);

export const SITE_CONFIG_ID = deterministicId('site-config:default');

/* -------------------------------------------------------------------------- */
/* Podcasts (BR-003 / BR-005 / BR-006)                                         */
/* -------------------------------------------------------------------------- */

export const PODCAST_SEED: PodcastSeed[] = [
  {
    slug: 'horizonte-digital',
    title: 'Horizonte Digital',
    tagline: 'A tecnologia que chega antes da manchete',
    description:
      'Um programa semanal sobre as tecnologias que estão redesenhando a próxima década. A cada episódio destrinchamos uma inovação — de passkeys a chips soberanos — com quem constrói de verdade, sem hype e sem jargão desnecessário. Conversas longas, técnicas quando precisa ser, mas sempre acessíveis para quem só quer entender para onde o mundo está indo.',
    coverImage: '/images/podcasts/horizonte-digital-cover.jpg',
    heroImage: '/images/podcasts/horizonte-digital-hero.jpg',
    category: 'tech',
    status: 'ACTIVE',
    visualStyle: 'PHOTO_REAL',
    year: 2023,
    accentColor: '#d87dff',
    hosts: [
      {
        name: 'Marina Alcântara',
        photo: '/images/hosts/marina-alcantara.jpg',
        bio: 'Jornalista de tecnologia há 12 anos, cobriu Vale do Silício e política de dados em Brasília.',
        initial: 'MA',
      },
      {
        name: 'Rafael Toledo',
        photo: '/images/hosts/rafael-toledo.jpg',
        bio: 'Engenheiro de plataforma e ex-fundador. Gosta de explicar sistemas distribuídos com analogias ruins.',
        initial: 'RT',
      },
    ],
    socialLinks: {
      instagram: 'https://instagram.com/horizontedigital',
      twitter: 'https://twitter.com/horizontedig',
      linkedin: 'https://linkedin.com/company/horizonte-digital',
      website: 'https://reiners.media/programas/horizonte-digital',
    },
    featured: true,
    displayOrder: 1,
  },
  {
    slug: 'ressonancia',
    title: 'Ressonância',
    tagline: 'Saúde sem promessa milagrosa',
    description:
      'Ressonância é uma conversa sobre corpo e mente com base em evidência. Recebemos médicos, pesquisadores e pacientes para falar de sono, dor crônica, microbioma e saúde mental — separando o que a ciência sustenta do que virou produto de prateleira. Um episódio a cada quinze dias, com fontes citadas na descrição.',
    coverImage: '/images/podcasts/ressonancia-cover.jpg',
    heroImage: '/images/podcasts/ressonancia-hero.jpg',
    category: 'saúde',
    status: 'ACTIVE',
    visualStyle: 'ILLUSTRATION',
    year: 2022,
    accentColor: '#5ad1c8',
    hosts: [
      {
        name: 'Dra. Helena Vasques',
        photo: '/images/hosts/helena-vasques.jpg',
        bio: 'Médica de família e divulgadora científica. Doutora em saúde coletiva pela USP.',
        initial: 'HV',
      },
    ],
    socialLinks: {
      instagram: 'https://instagram.com/ressonanciapod',
      tiktok: 'https://tiktok.com/@ressonanciapod',
      website: 'https://reiners.media/programas/ressonancia',
    },
    featured: true,
    displayOrder: 2,
  },
  {
    slug: 'codigo-aberto',
    title: 'Código Aberto',
    tagline: 'Software livre, opiniões idem',
    description:
      'O programa para quem escreve código e precisa decidir de verdade: monorepo ou polirepo, qual licença adotar, como manter observabilidade em um time de quatro pessoas. Sem tutorial de fundamentos — aqui a conversa começa onde a documentação termina, com mantenedores e engenheiros que já erraram bastante para contar.',
    coverImage: '/images/podcasts/codigo-aberto-cover.jpg',
    heroImage: '/images/podcasts/codigo-aberto-hero.jpg',
    category: 'dev',
    status: 'ACTIVE',
    visualStyle: 'MINIMAL',
    year: 2021,
    accentColor: '#9a7b35',
    hosts: [
      {
        name: 'Caio Bittencourt',
        photo: '/images/hosts/caio-bittencourt.jpg',
        bio: 'Mantenedor de duas bibliotecas open source e staff engineer em uma fintech.',
        initial: 'CB',
      },
      {
        name: 'Nayara Prado',
        photo: '/images/hosts/nayara-prado.jpg',
        bio: 'Engenheira de infraestrutura, fala sobre confiabilidade e sobre o custo real da nuvem.',
        initial: 'NP',
      },
    ],
    socialLinks: {
      github: 'https://github.com/codigo-aberto-pod',
      twitter: 'https://twitter.com/codigoabertopod',
      website: 'https://reiners.media/programas/codigo-aberto',
    },
    featured: true,
    displayOrder: 3,
  },
  {
    slug: 'latitud',
    title: 'Latitud',
    tagline: 'Viagem é o que acontece no caminho',
    description:
      'Latitud percorre rotas que não cabem em roteiro de agência: a Patagônia fora de temporada, o sertão do Ceará de moto, trens noturnos pela Europa. Cada episódio traz um viajante contando a logística real — custo, erro, medo e o que valeu a pena. Em pausa desde o fim da última temporada, com retorno previsto.',
    coverImage: '/images/podcasts/latitud-cover.jpg',
    heroImage: '/images/podcasts/latitud-hero.jpg',
    category: 'viagens',
    status: 'HIATUS',
    visualStyle: 'DUOTONE',
    year: 2020,
    accentColor: '#f2a65a',
    hosts: [
      {
        name: 'Téo Aguiar',
        photo: '/images/hosts/teo-aguiar.jpg',
        bio: 'Fotógrafo documental. Já dormiu em 41 países e em quase todos os aeroportos do Brasil.',
        initial: 'TA',
      },
    ],
    socialLinks: {
      instagram: 'https://instagram.com/latitudpod',
      tiktok: 'https://tiktok.com/@latitudpod',
      website: 'https://reiners.media/programas/latitud',
    },
    featured: false,
    displayOrder: 4,
  },
  {
    slug: 'oficio',
    title: 'Ofício',
    tagline: 'Negócio pequeno, decisão grande',
    description:
      'Ofício acompanhou donos de negócios pequenos nas decisões que ninguém ensina: como precificar um serviço criativo, quando contratar a primeira pessoa, o que colocar no contrato antes de virar sócio de um amigo. A temporada foi encerrada, mas o acervo continua sendo o material mais procurado do estúdio.',
    coverImage: '/images/podcasts/oficio-cover.jpg',
    heroImage: '/images/podcasts/oficio-hero.jpg',
    category: 'negócios',
    status: 'ENDED',
    visualStyle: 'COLLAGE',
    year: 2019,
    accentColor: '#e2574c',
    hosts: [
      {
        name: 'Beatriz Nunes',
        photo: '/images/hosts/beatriz-nunes.jpg',
        bio: 'Consultora de pequenos negócios e ex-dona de uma cafeteria que durou sete anos.',
        initial: 'BN',
      },
      {
        name: 'Gustavo Rehm',
        photo: '/images/hosts/gustavo-rehm.jpg',
        bio: 'Contador especializado em prestadores de serviço e entusiasta de planilhas honestas.',
        initial: 'GR',
      },
    ],
    socialLinks: {
      linkedin: 'https://linkedin.com/company/oficio-podcast',
      instagram: 'https://instagram.com/oficiopod',
      website: 'https://reiners.media/programas/oficio',
    },
    featured: false,
    displayOrder: 5,
  },
];

/* -------------------------------------------------------------------------- */
/* Episódios (BR-004)                                                          */
/* -------------------------------------------------------------------------- */

const EPISODE_BLUEPRINTS: Record<string, EpisodeBlueprint[]> = {
  'horizonte-digital': [
    {
      number: 5,
      title: 'O fim da senha: passkeys na prática',
      description:
        'Passkeys prometem aposentar a senha, mas a migração trava em detalhes de produto. Conversamos com quem já implantou em escala sobre recuperação de conta, dispositivos compartilhados e o que fazer com o usuário que perdeu o celular.',
      duration: '58:12',
      publishedAt: '2026-07-15T12:00:00.000Z',
      youtubeId: 'hRzD7kQ2xLm',
      spotifyId: 'hRzD4kL9mQ2xVb7nZr3TcW',
    },
    {
      number: 4,
      title: 'Chips soberanos e a nova geopolítica',
      description:
        'Semicondutores viraram política externa. Mapeamos a cadeia de fabricação, o que o Brasil consegue e o que não consegue fazer sozinho, e por que litografia é o gargalo que dinheiro nenhum resolve em cinco anos.',
      duration: '1:04:37',
      publishedAt: '2026-07-01T12:00:00.000Z',
      youtubeId: 'hRzD9nR4zPv',
      spotifyId: 'hRzD6pR2sN8dJw5yBq1XvT',
    },
    {
      number: 3,
      title: 'IA generativa dentro da empresa',
      description:
        'Depois do piloto bonito vem a parte difícil: governança, custo por token e times que não confiam na saída do modelo. Três líderes de engenharia contam o que sobreviveu ao contato com a operação real.',
      duration: '52:48',
      publishedAt: '2026-06-17T12:00:00.000Z',
      youtubeId: 'hRzD3bK8wYc',
      spotifyId: 'hRzD9tG4hM7fKz2cLp6QnD',
    },
    {
      number: 2,
      title: 'Computação quântica sem hype',
      description:
        'O que já existe, o que é marketing e o que muda quando a correção de erro amadurecer. Uma pesquisadora explica por que criptografia pós-quântica é um problema de hoje, e não de 2040.',
      duration: '47:05',
      publishedAt: '2026-06-03T12:00:00.000Z',
      youtubeId: 'hRzD5vM1qJs',
      spotifyId: 'hRzD3wY8bV1jHx4mRt9ZsE',
    },
    {
      number: 1,
      title: 'A internet que perdemos',
      description:
        'Episódio de estreia. Da web aberta dos feeds RSS às plataformas fechadas de hoje: o que ganhamos em conveniência, o que perdemos em controle e quais experimentos estão tentando reverter a rota.',
      duration: '43:29',
      publishedAt: '2026-05-20T12:00:00.000Z',
      youtubeId: 'hRzD2pW6dNe',
      spotifyId: 'hRzD5nC6dP3qLv8kFj2WgU',
    },
  ],
  ressonancia: [
    {
      number: 5,
      title: 'Sono: o pilar esquecido',
      description:
        'Antes de suplemento e antes de academia, sono. Uma neurologista explica o que acontece em cada estágio, por que a dívida de sono não se paga no fim de semana e o que realmente ajuda quem trabalha em turnos.',
      duration: '49:41',
      publishedAt: '2026-07-10T12:00:00.000Z',
      youtubeId: 'rSnC7kQ2xLm',
      spotifyId: 'rSnC4kL9mQ2xVb7nZr3TcW',
    },
    {
      number: 4,
      title: 'Microbioma e humor',
      description:
        'O eixo intestino-cérebro rendeu manchetes ousadas e muitos probióticos caros. Separamos o que os estudos sustentam do que ainda é hipótese, com uma pesquisadora que trabalha com o tema há dez anos.',
      duration: '44:16',
      publishedAt: '2026-06-26T12:00:00.000Z',
      youtubeId: 'rSnC9nR4zPv',
      spotifyId: 'rSnC6pR2sN8dJw5yBq1XvT',
    },
    {
      number: 3,
      title: 'Dor crônica não é frescura',
      description:
        'Milhões de brasileiros convivem com dor persistente e escutam que é psicológico. Explicamos sensibilização central, o papel da fisioterapia e por que o tratamento eficaz quase nunca é só um remédio.',
      duration: '56:03',
      publishedAt: '2026-06-12T12:00:00.000Z',
      spotifyId: 'rSnC9tG4hM7fKz2cLp6QnD',
    },
    {
      number: 2,
      title: 'Longevidade além dos suplementos',
      description:
        'A indústria da longevidade fatura bilhões vendendo atalhos. Revisamos o que tem evidência robusta — força muscular, capacidade cardiorrespiratória, vínculo social — e o que ainda é promessa de laboratório.',
      duration: '51:27',
      publishedAt: '2026-05-29T12:00:00.000Z',
      youtubeId: 'rSnC5vM1qJs',
      spotifyId: 'rSnC3wY8bV1jHx4mRt9ZsE',
    },
    {
      number: 1,
      title: 'Saúde mental no trabalho',
      description:
        'Episódio de estreia. Burnout virou diagnóstico ocupacional, mas a conversa dentro das empresas continua rasa. Uma psiquiatra do trabalho fala sobre carga, autonomia e o limite entre cuidado e vigilância.',
      duration: '45:50',
      publishedAt: '2026-05-15T12:00:00.000Z',
      youtubeId: 'rSnC2pW6dNe',
      spotifyId: 'rSnC5nC6dP3qLv8kFj2WgU',
    },
  ],
  'codigo-aberto': [
    {
      number: 5,
      title: 'Monorepo: quando vale a pena',
      description:
        'Monorepo não é decisão de ferramenta, é decisão de time. Discutimos limite de CI, ownership de código, o custo escondido do cache remoto e em que ponto separar os repositórios volta a fazer sentido.',
      duration: '1:02:14',
      publishedAt: '2026-07-08T12:00:00.000Z',
      youtubeId: 'cDab7kQ2xLm',
      spotifyId: 'cDab4kL9mQ2xVb7nZr3TcW',
    },
    {
      number: 4,
      title: 'Type safety de ponta a ponta',
      description:
        'Do schema do banco ao componente React sem perder o tipo no caminho. Falamos de geração de código, validação em runtime e por que tipagem forte no cliente não substitui validar a entrada no servidor.',
      duration: '55:38',
      publishedAt: '2026-06-24T12:00:00.000Z',
      youtubeId: 'cDab9nR4zPv',
      spotifyId: 'cDab6pR2sN8dJw5yBq1XvT',
    },
    {
      number: 3,
      title: 'Observabilidade para times pequenos',
      description:
        'Você não precisa de uma plataforma de observabilidade inteira para saber por que a API caiu. Log estruturado, três métricas que importam e um orçamento de erro que cabe em um time de quatro pessoas.',
      duration: '48:22',
      publishedAt: '2026-06-10T12:00:00.000Z',
      youtubeId: 'cDab3bK8wYc',
      spotifyId: 'cDab9tG4hM7fKz2cLp6QnD',
    },
    {
      number: 2,
      title: 'Licenças open source explicadas',
      description:
        'MIT, Apache, GPL, AGPL e as licenças "quase abertas" que apareceram nos últimos anos. Um advogado especializado explica o que cada uma exige de quem usa e de quem publica, com casos reais.',
      duration: '41:09',
      publishedAt: '2026-05-27T12:00:00.000Z',
      youtubeId: 'cDab5vM1qJs',
      spotifyId: 'cDab3wY8bV1jHx4mRt9ZsE',
    },
    {
      number: 1,
      title: 'Do bootcamp ao primeiro emprego',
      description:
        'Episódio de estreia. Três pessoas que migraram de carreira contam o que funcionou no portfólio, o que foi perda de tempo e como é a primeira semana quando o código deixa de ser exercício.',
      duration: '46:55',
      publishedAt: '2026-05-13T12:00:00.000Z',
      youtubeId: 'cDab2pW6dNe',
      spotifyId: 'cDab5nC6dP3qLv8kFj2WgU',
    },
  ],
  latitud: [
    {
      number: 5,
      title: 'Patagônia fora de temporada',
      description:
        'Trilhas vazias, vento de 90 km/h e metade dos refúgios fechados. O relato de uma travessia em maio, com custos reais, equipamento que fez diferença e a decisão de voltar antes do topo.',
      duration: '53:31',
      publishedAt: '2025-11-20T12:00:00.000Z',
      youtubeId: 'lTtD7kQ2xLm',
      spotifyId: 'lTtD4kL9mQ2xVb7nZr3TcW',
    },
    {
      number: 4,
      title: 'Rotas de trem pela Europa',
      description:
        'Como montar um mês de trem sem gastar como quem voa. Passes que valem a pena, noturnos que economizam hospedagem e as três conexões que dão errado com mais frequência do que qualquer site admite.',
      duration: '47:44',
      publishedAt: '2025-11-06T12:00:00.000Z',
      youtubeId: 'lTtD9nR4zPv',
      spotifyId: 'lTtD6pR2sN8dJw5yBq1XvT',
    },
    {
      number: 3,
      title: 'Comer bem em Lisboa sem fila',
      description:
        'Fora do circuito de guias, Lisboa continua barata para quem sabe onde sentar. Um cozinheiro português mapeia tascas de bairro, horários que evitam turista e o que pedir quando o menu não tem tradução.',
      duration: '38:17',
      publishedAt: '2025-10-23T12:00:00.000Z',
      youtubeId: 'lTtD3bK8wYc',
      spotifyId: 'lTtD9tG4hM7fKz2cLp6QnD',
    },
    {
      number: 2,
      title: 'Sertão do Ceará de moto',
      description:
        'Mil e duzentos quilômetros entre Fortaleza e a Chapada do Araripe. Estrada de terra, calor de 40 graus e a hospitalidade que resolve pneu furado mais rápido que qualquer seguro.',
      duration: '50:26',
      publishedAt: '2025-10-09T12:00:00.000Z',
      spotifyId: 'lTtD3wY8bV1jHx4mRt9ZsE',
    },
    {
      number: 1,
      title: 'Primeira viagem solo',
      description:
        'Episódio de estreia. O medo antes de embarcar, a solidão do terceiro dia e o momento em que viajar sozinho deixa de ser desafio e vira preferência. Com dicas práticas de segurança e orçamento.',
      duration: '42:03',
      publishedAt: '2025-09-25T12:00:00.000Z',
      youtubeId: 'lTtD2pW6dNe',
      spotifyId: 'lTtD5nC6dP3qLv8kFj2WgU',
    },
  ],
  oficio: [
    {
      number: 5,
      title: 'Vender sem parecer vendedor',
      description:
        'Episódio de encerramento da temporada. Como prestadores de serviço constroem uma rotina de vendas que não depende de indicação nem de desconto, com roteiro de primeira conversa e critérios para recusar cliente.',
      duration: '54:09',
      publishedAt: '2024-12-12T12:00:00.000Z',
      youtubeId: 'oFcO7kQ2xLm',
      spotifyId: 'oFcO4kL9mQ2xVb7nZr3TcW',
    },
    {
      number: 4,
      title: 'Precificação para serviços criativos',
      description:
        'Hora, escopo ou valor percebido? Comparamos os três modelos com números de estúdios reais e mostramos como calcular o custo da própria hora antes de colocar qualquer preço na proposta.',
      duration: '49:52',
      publishedAt: '2024-11-28T12:00:00.000Z',
      youtubeId: 'oFcO9nR4zPv',
      spotifyId: 'oFcO6pR2sN8dJw5yBq1XvT',
    },
    {
      number: 3,
      title: 'Quando contratar o primeiro funcionário',
      description:
        'O salto de autônomo para empregador muda o risco do negócio. Falamos de custo total de contratação no Brasil, alternativas de terceirização e os sinais de que adiar está custando mais caro que contratar.',
      duration: '45:33',
      publishedAt: '2024-11-14T12:00:00.000Z',
      youtubeId: 'oFcO3bK8wYc',
    },
    {
      number: 2,
      title: 'Sociedade: contrato antes da amizade',
      description:
        'A maioria das sociedades quebra sem contrato de sócios. Um advogado empresarial percorre vesting, cláusula de saída, divisão de decisão e o que fazer quando um dos dois quer vender e o outro não.',
      duration: '58:47',
      publishedAt: '2024-10-31T12:00:00.000Z',
      youtubeId: 'oFcO5vM1qJs',
      spotifyId: 'oFcO3wY8bV1jHx4mRt9ZsE',
    },
    {
      number: 1,
      title: 'Do freela à empresa',
      description:
        'Episódio de estreia. Quando abrir CNPJ, qual regime tributário faz sentido no começo e como separar a conta da pessoa da conta do negócio sem transformar a contabilidade em um segundo trabalho.',
      duration: '40:18',
      publishedAt: '2024-10-17T12:00:00.000Z',
      youtubeId: 'oFcO2pW6dNe',
      spotifyId: 'oFcO5nC6dP3qLv8kFj2WgU',
    },
  ],
};

/**
 * Monta os episódios de um programa, derivando URL e embed a partir dos IDs.
 * BR-007/BR-008: o embed do YouTube é o video ID (11 caracteres) e o do Spotify
 * é a URI canônica `spotify:episode:<id>`.
 */
export function buildEpisodes(podcastSlug: string): EpisodeSeed[] {
  const blueprints = EPISODE_BLUEPRINTS[podcastSlug];

  if (!blueprints) {
    throw new Error(`Nenhum episódio definido para o programa "${podcastSlug}".`);
  }

  return blueprints.map((blueprint) => ({
    podcastSlug,
    number: blueprint.number,
    title: blueprint.title,
    description: blueprint.description,
    thumbnail: `/images/episodes/${podcastSlug}-${blueprint.number}.jpg`,
    duration: blueprint.duration,
    publishedAt: blueprint.publishedAt,
    youtubeUrl: blueprint.youtubeId
      ? `https://www.youtube.com/watch?v=${blueprint.youtubeId}`
      : null,
    youtubeEmbed: blueprint.youtubeId ?? null,
    spotifyUrl: blueprint.spotifyId
      ? `https://open.spotify.com/episode/${blueprint.spotifyId}`
      : null,
    spotifyEmbed: blueprint.spotifyId
      ? `spotify:episode:${blueprint.spotifyId}`
      : null,
  }));
}

export const EPISODE_SEED: EpisodeSeed[] = PODCAST_SEED.flatMap((podcast) =>
  buildEpisodes(podcast.slug),
);

/* -------------------------------------------------------------------------- */
/* Planos, depoimentos, configuração e admin                                   */
/* -------------------------------------------------------------------------- */

export const PLAN_SEED: PlanSeed[] = [
  {
    name: 'Essencial',
    price: 'R$ 1.900',
    period: 'por episódio',
    description:
      'Para quem está começando e precisa de um episódio bem gravado sem montar estúdio próprio.',
    features: [
      'Gravação em estúdio com 2 câmeras 4K',
      'Até 2 horas de sala',
      'Captação de áudio em microfone dinâmico',
      'Edição de corte e tratamento de áudio',
      'Entrega em até 5 dias úteis',
    ],
    isFeatured: false,
    displayOrder: 1,
  },
  {
    name: 'Profissional',
    price: 'R$ 3.400',
    period: 'por episódio',
    description:
      'O pacote mais contratado: episódio completo mais os cortes que sustentam o programa nas redes.',
    features: [
      'Gravação em estúdio com 3 câmeras 4K',
      'Até 4 horas de sala',
      'Edição completa com trilha e identidade visual',
      '5 cortes verticais legendados',
      'Miniatura e descrição otimizadas',
      'Entrega em até 48 horas',
    ],
    isFeatured: true,
    displayOrder: 2,
  },
  {
    name: 'Estúdio Completo',
    price: 'R$ 12.800',
    period: 'por mês',
    description:
      'Operação mensal ponta a ponta para quem publica com constância e quer o estúdio como parceiro fixo.',
    features: [
      '4 episódios por mês',
      'Gravação multicâmera com direção de cena',
      'Edição completa e 20 cortes verticais',
      'Publicação e distribuição em YouTube e Spotify',
      'Relatório mensal de audiência',
      'Gerente de conta dedicado',
    ],
    isFeatured: false,
    displayOrder: 3,
  },
];

export const TESTIMONIAL_SEED: TestimonialSeed[] = [
  {
    name: 'Marina Alcântara',
    role: 'Apresentadora, Horizonte Digital',
    quote:
      'Chegamos com um roteiro e saímos com o episódio pronto para publicar. A equipe entende de conteúdo, não só de câmera — isso mudou o ritmo do programa.',
    avatarUrl: '/images/testimonials/marina-alcantara.jpg',
    podcastSlug: 'horizonte-digital',
  },
  {
    name: 'Dra. Helena Vasques',
    role: 'Apresentadora, Ressonância',
    quote:
      'Precisava de um estúdio que respeitasse o rigor do assunto. Os cortes que eles produzem levam a informação inteira, sem distorcer para render mais clique.',
    avatarUrl: '/images/testimonials/helena-vasques.jpg',
    podcastSlug: 'ressonancia',
  },
  {
    name: 'Eduardo Marchetti',
    role: 'Head de Marca, Grupo Vertente',
    quote:
      'Contratamos para uma série institucional de seis episódios. Prazo cumprido, qualidade constante e um cuidado com a identidade da marca que não esperávamos de um estúdio deste porte.',
    avatarUrl: '/images/testimonials/eduardo-marchetti.jpg',
    podcastSlug: null,
  },
];

export const SITE_CONFIG_SEED: SiteConfigSeed = {
  siteName: 'Reiners Media',
  tagline: 'Conteúdo que conecta',
  logoUrl: '/images/brand/reiners-media-logo.svg',
  faviconUrl: '/favicon.ico',
  primaryColor: '#d87dff',
  seoTitle: 'Reiners Media — Estúdio de Podcast',
  seoDescription:
    'Estúdio de podcast full service: gravação multicâmera, edição, cortes e distribuição. Conheça os programas produzidos pela Reiners Media.',
  analyticsId: null,
  facebookPixel: null,
  customCss: null,
};

export const DEFAULT_ADMIN_EMAIL = 'admin@reiners.media';

/**
 * Fonte de variáveis de ambiente aceita por `buildAdminUser`.
 *
 * Deliberadamente mais frouxo que `NodeJS.ProcessEnv`: os tipos globais do Next
 * (`next-env.d.ts`) tornam `NODE_ENV` obrigatório em `ProcessEnv`, o que
 * impediria os testes de passar um env parcial como `{ SEED_ADMIN_EMAIL: '...' }`.
 * `process.env` continua sendo aceito por ser compatível com esta forma.
 */
export type SeedEnv = Partial<Record<string, string | undefined>>;

export function buildAdminUser(env: SeedEnv = process.env): AdminUserSeed {
  const email = env.SEED_ADMIN_EMAIL?.trim() || DEFAULT_ADMIN_EMAIL;

  return {
    email,
    name: 'Administrador Reiners Media',
    role: 'ADMIN',
  };
}

export const ADMIN_USER_SEED: AdminUserSeed = buildAdminUser();

/* -------------------------------------------------------------------------- */
/* Guarda de ambiente                                                          */
/* -------------------------------------------------------------------------- */

/** Variável que libera explicitamente o seed contra um banco de produção. */
export const PRODUCTION_SEED_OVERRIDE = 'ALLOW_PRODUCTION_SEED';

export const PRODUCTION_SEED_BLOCKED_MESSAGE =
  `Seed bloqueado: NODE_ENV=production. Este script insere programas de demonstração ` +
  `e um AdminUser com role ADMIN. Se a intenção é mesmo popular produção, rode novamente ` +
  `com ${PRODUCTION_SEED_OVERRIDE}=true.`;

/**
 * Impede que `pnpm db:seed` apontado para a DATABASE_URL de produção insira
 * dados de demonstração e um administrador. Exige confirmação explícita.
 */
export function assertSeedAllowed(env: SeedEnv = process.env): void {
  const isProduction = env.NODE_ENV === 'production';
  const hasOverride = env[PRODUCTION_SEED_OVERRIDE]?.trim() === 'true';

  if (isProduction && !hasOverride) {
    throw new Error(PRODUCTION_SEED_BLOCKED_MESSAGE);
  }
}

/* -------------------------------------------------------------------------- */
/* Execução                                                                    */
/* -------------------------------------------------------------------------- */

const asJson = (value: unknown): Prisma.InputJsonValue =>
  value as Prisma.InputJsonValue;

export async function seed(prisma: PrismaClient): Promise<void> {
  for (const podcast of PODCAST_SEED) {
    const data = {
      title: podcast.title,
      tagline: podcast.tagline,
      description: podcast.description,
      coverImage: podcast.coverImage,
      heroImage: podcast.heroImage,
      category: podcast.category,
      status: podcast.status,
      visualStyle: podcast.visualStyle,
      year: podcast.year,
      accentColor: podcast.accentColor,
      hosts: asJson(podcast.hosts),
      socialLinks: asJson(podcast.socialLinks),
      featured: podcast.featured,
      displayOrder: podcast.displayOrder,
      deletedAt: null,
    };

    const record = await prisma.podcast.upsert({
      where: { slug: podcast.slug },
      update: data,
      create: { slug: podcast.slug, ...data },
    });

    for (const episode of buildEpisodes(podcast.slug)) {
      const id = episodeId(podcast.slug, episode.number);
      const episodeData = {
        podcastId: record.id,
        number: episode.number,
        title: episode.title,
        description: episode.description,
        thumbnail: episode.thumbnail,
        duration: episode.duration,
        publishedAt: new Date(episode.publishedAt),
        youtubeUrl: episode.youtubeUrl,
        youtubeEmbed: episode.youtubeEmbed,
        spotifyUrl: episode.spotifyUrl,
        spotifyEmbed: episode.spotifyEmbed,
      };

      await prisma.episode.upsert({
        where: { id },
        update: episodeData,
        create: { id, ...episodeData },
      });
    }
  }

  for (const plan of PLAN_SEED) {
    const id = planId(plan.name);
    const data = {
      name: plan.name,
      price: plan.price,
      period: plan.period,
      description: plan.description,
      features: asJson(plan.features),
      isFeatured: plan.isFeatured,
      displayOrder: plan.displayOrder,
    };

    await prisma.plan.upsert({
      where: { id },
      update: data,
      create: { id, ...data },
    });
  }

  for (const testimonial of TESTIMONIAL_SEED) {
    const id = testimonialId(testimonial.name);
    const podcast = testimonial.podcastSlug
      ? await prisma.podcast.findUnique({
          where: { slug: testimonial.podcastSlug },
          select: { id: true },
        })
      : null;

    const data = {
      name: testimonial.name,
      role: testimonial.role,
      quote: testimonial.quote,
      avatarUrl: testimonial.avatarUrl,
      podcastId: podcast?.id ?? null,
    };

    await prisma.testimonial.upsert({
      where: { id },
      update: data,
      create: { id, ...data },
    });
  }

  await prisma.siteConfig.upsert({
    where: { id: SITE_CONFIG_ID },
    update: SITE_CONFIG_SEED,
    create: { id: SITE_CONFIG_ID, ...SITE_CONFIG_SEED },
  });

  const admin = buildAdminUser();
  await prisma.adminUser.upsert({
    where: { email: admin.email },
    // `role` fica DE FORA do update de propósito: se a conta já existe como
    // EDITOR, rodar o seed não pode promovê-la silenciosamente a ADMIN.
    // O papel só é definido na criação inicial.
    update: { name: admin.name },
    create: admin,
  });
}

async function main(): Promise<void> {
  assertSeedAllowed();

  const prisma = new PrismaClient();

  try {
    await seed(prisma);
    // eslint-disable-next-line no-console
    console.log(
      `Seed concluído: ${PODCAST_SEED.length} programas, ${EPISODE_SEED.length} episódios, ` +
        `${PLAN_SEED.length} planos, ${TESTIMONIAL_SEED.length} depoimentos, 1 configuração, 1 admin.`,
    );
  } finally {
    await prisma.$disconnect();
  }
}

const entrypoint = process.argv[1] ?? '';
const isDirectRun = /(^|[\\/])seed\.(ts|mts|cts|js|mjs|cjs)$/.test(entrypoint);

if (isDirectRun) {
  void main().catch((error: unknown) => {
    // eslint-disable-next-line no-console
    console.error(error);
    process.exitCode = 1;
  });
}
