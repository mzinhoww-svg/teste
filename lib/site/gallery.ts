// Fotos do estúdio para a landing. Arquivos versionados em /public (mesma
// convenção de /public/convidados): as fotos são conteúdo editorial fixo, não
// dado do CMS. Origem, tamanhos e como trocar: ver README.md em cada pasta.

export type GalleryPhoto = {
  src: string;
  /** Dimensões reais do arquivo — reservam o espaço e evitam salto de layout. */
  width: number;
  height: number;
  alt: string;
  /** object-position do recorte (o quadro é sempre menor que a foto). */
  position?: string;
};

export type Scenario = GalleryPhoto & {
  id: string;
  name: string;
  description: string;
};

/**
 * Os cinco cenários do estúdio. Nomes e descrições seguem o material de
 * apresentação do estúdio; a ordem é a da apresentação.
 */
export const SCENARIOS: Scenario[] = [
  {
    id: "puff",
    name: "Puff",
    description: "Um estilo de podcast mais pessoal, para as pessoas se conectarem, com reflexões e insights.",
    src: "/estudio/cenario-puff.webp",
    width: 800,
    height: 1200,
    alt: "Cenário Puff: poltrona puff de couro caramelo com microfone, luminária de arco, plantas e cortina clara",
  },
  {
    id: "escritorio",
    name: "Escritório",
    description: "Direcionado para videoaulas.",
    src: "/estudio/cenario-escritorio.webp",
    width: 800,
    height: 1200,
    alt: "Cenário Escritório: mesa branca oval com microfone e notebook, com cortinas claras ao fundo",
  },
  {
    id: "mesa-reuniao",
    name: "Mesa de reunião",
    description: "Podcast com 4 pessoas, em bate-papo.",
    src: "/estudio/cenario-mesa-reuniao.webp",
    width: 800,
    height: 1200,
    alt: "Cenário Mesa de reunião: mesa de madeira com microfones articulados e xícaras, sob fundo branco",
  },
  {
    id: "sofa",
    name: "Sofá",
    description: "Podcast em dupla, perfeito para uma conversa casual.",
    src: "/estudio/cenario-sofa.webp",
    width: 1019,
    height: 1200,
    alt: "Cenário Sofá: sofá claro com tapete vermelho, planta, cortina bege e microfones sobre a mesa de apoio",
  },
  {
    id: "estante",
    name: "Estante",
    description: "Mesma ideia do puff, com podcast para reflexões.",
    src: "/estudio/cenario-estante.webp",
    width: 800,
    height: 1200,
    alt: "Cenário Estante: nichos brancos com vasos e plantas, parede rosa, banqueta e microfone",
  },
];

/**
 * Retrato da seção Sobre (imagem padrão — o CMS pode trocar): foto de quem
 * comanda o estúdio, gravando no cenário Puff. Vem do mesmo ensaio dos
 * cenários. O quadro do Sobre é 4:3 e a foto é retrato, por isso o recorte
 * (`position`) sobe a moldura até o rosto.
 */
export const ABOUT_PHOTO: GalleryPhoto = {
  src: "/estudio/sobre-retrato.webp",
  width: 1200,
  height: 1800,
  alt: "Gravação de podcast no cenário Puff do estúdio: sentada na poltrona de couro, ao microfone",
  position: "50% 86%",
};

/**
 * Foto do Estúdio Zura: a claquete em primeiro plano, com a mesa de gravação
 * ao fundo. Abre o carrossel de bastidores.
 */
export const ZURA_PHOTO: GalleryPhoto = {
  src: "/estudio/zura-claquete.webp",
  width: 1200,
  height: 1800,
  alt: "Bastidores: claquete do Estúdio Zura em primeiro plano, com a mesa de gravação de podcast ao fundo",
  position: "50% 70%",
};

/**
 * Bastidores de gravações com clientes, depois da claquete do Estúdio Zura.
 * Só fotos: sem nomes nem legendas.
 */
export const BACKSTAGE_PHOTOS: GalleryPhoto[] = [
  ZURA_PHOTO,
  {
    src: "/bastidores/bastidor-01.webp",
    width: 800,
    height: 1200,
    alt: "Bastidores: set de entrevista com duas cadeiras, refletor, câmera em tripé e monitor de operação",
    position: "50% 78%",
  },
  {
    src: "/bastidores/bastidor-02.webp",
    width: 800,
    height: 1200,
    alt: "Bastidores: convidada ao microfone, ao lado da câmera e do monitor de operação",
  },
  {
    src: "/bastidores/bastidor-03.webp",
    width: 800,
    height: 1200,
    alt: "Bastidores: convidada de vestido amarelo falando ao microfone durante a gravação",
    position: "50% 40%",
  },
  {
    src: "/bastidores/bastidor-04.webp",
    width: 800,
    height: 1200,
    alt: "Bastidores: convidada em conversa ao microfone, sob luz quente",
    position: "50% 40%",
  },
  {
    src: "/bastidores/bastidor-05.webp",
    width: 800,
    height: 1200,
    alt: "Bastidores: entrevistado de camisa branca sentado ao microfone, com luz verde ao fundo",
    position: "50% 45%",
  },
  {
    src: "/bastidores/bastidor-06.webp",
    width: 800,
    height: 1200,
    alt: "Bastidores: entrevista em duas cadeiras, com a câmera em primeiro plano e o refletor ao alto",
    position: "50% 62%",
  },
  {
    src: "/bastidores/bastidor-07.webp",
    width: 1200,
    height: 800,
    alt: "Bastidores: visão do set com refletor, cadeiras, microfones e câmeras em tripés",
  },
  {
    src: "/bastidores/bastidor-08.webp",
    width: 1200,
    height: 800,
    alt: "Bastidores: monitor de operação mostrando a imagem ao vivo do entrevistado",
    position: "62% 50%",
  },
];
