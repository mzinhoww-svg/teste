/**
 * TCK-016 — Render dos componentes de apresentação da página de programa.
 *
 * Todos recebem dados por prop e não tocam em banco, rede ou `window`: é isso
 * que permite testá-los como funções. O que se verifica aqui é o que quebra
 * silenciosamente em produção — texto acessível, `alt`, semântica de lista e
 * `<time>`, e a URL de cada trilha.
 */
import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { EpisodeList } from '@/components/programa/episode-list';
import { ProgramaAbout, toParagraphs } from '@/components/programa/programa-about';
import { ProgramaHero } from '@/components/programa/programa-hero';
import { ProgramaSocialLinks, resolveSocialLinks } from '@/components/programa/social-links';
import { ProgramaTabs } from '@/components/programa/tabs';
import { TrackLinks } from '@/components/programa/track-links';
import { podcastWithEpisodesSchema } from '@/lib/schemas';
import { SPOTIFY_ID, YOUTUBE_ID, makeEpisode, makePodcast } from './fixtures';

describe('fixture', () => {
  it('é um programa válido pelo contrato público', () => {
    // Um fixture que `podcastWithEpisodesSchema` rejeitaria testaria uma página
    // que a rota real nunca conseguiria renderizar.
    expect(() => podcastWithEpisodesSchema.parse(makePodcast())).not.toThrow();
  });
});

describe('ProgramaHero', () => {
  it('renderiza título como h1, tagline, categoria e situação', () => {
    render(<ProgramaHero podcast={makePodcast()} />);

    expect(screen.getByRole('heading', { level: 1, name: 'Ofício' })).toBeInTheDocument();
    expect(screen.getByText('Histórias de quem faz com as próprias mãos.')).toBeInTheDocument();
    expect(screen.getByText('Documental')).toBeInTheDocument();
    expect(screen.getByText('Em produção')).toBeInTheDocument();
    expect(screen.getByText('2024')).toBeInTheDocument();
  });

  it('a situação também é TEXTO, não só cor da variante', () => {
    render(<ProgramaHero podcast={makePodcast({ status: 'ENDED' })} />);
    expect(screen.getByText('Encerrado')).toBeInTheDocument();
  });

  it('dá alt significativo à capa e usa heroImage quando existe', () => {
    render(<ProgramaHero podcast={makePodcast()} />);

    const cover = screen.getByRole('img', { name: 'Capa do programa Ofício' });
    expect(cover).toBeInTheDocument();
    expect(cover.getAttribute('src')).toContain(encodeURIComponent('/capas/oficio-hero.jpg'));
  });

  it('cai para coverImage quando não há heroImage', () => {
    render(<ProgramaHero podcast={makePodcast({ heroImage: null })} />);

    const cover = screen.getByRole('img', { name: 'Capa do programa Ofício' });
    expect(cover.getAttribute('src')).toContain(encodeURIComponent('/capas/oficio.jpg'));
  });

  it('lista os hosts: foto com alt, e iniciais quando não há foto', () => {
    render(<ProgramaHero podcast={makePodcast()} />);

    expect(screen.getByRole('img', { name: 'Foto de Marina Reiners' })).toBeInTheDocument();
    expect(screen.getByText('Marina Reiners')).toBeInTheDocument();

    // Caio não tem foto: entram as iniciais, ocultas do leitor de tela (o nome
    // completo está no texto ao lado).
    expect(screen.queryByRole('img', { name: 'Foto de Caio Souza' })).not.toBeInTheDocument();
    expect(screen.getByText('CS')).toHaveAttribute('aria-hidden', 'true');
    expect(screen.getByText('Caio Souza')).toBeInTheDocument();
  });

  it('toda imagem renderizada tem atributo alt', () => {
    const { container } = render(<ProgramaHero podcast={makePodcast()} />);
    const images = Array.from(container.querySelectorAll('img'));

    expect(images.length).toBeGreaterThan(0);
    for (const image of images) {
      expect(image.getAttribute('alt')).toBeTruthy();
    }
  });

  it('declara sizes na capa (LCP não pode baixar imagem de 100vw por engano)', () => {
    render(<ProgramaHero podcast={makePodcast()} />);
    expect(screen.getByRole('img', { name: 'Capa do programa Ofício' })).toHaveAttribute(
      'sizes',
      '100vw',
    );
  });
});

describe('EpisodeList', () => {
  const podcast = makePodcast();

  it('usa lista ordenada e um artigo por episódio', () => {
    const { container } = render(
      <EpisodeList episodes={podcast.episodes} podcastTitle={podcast.title} />,
    );

    expect(container.querySelector('ol')).toBeInTheDocument();
    expect(screen.getAllByRole('article')).toHaveLength(1);
  });

  it('mostra número, título, duração e data', () => {
    render(<EpisodeList episodes={podcast.episodes} podcastTitle={podcast.title} />);

    expect(screen.getByText('Episódio 1')).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 3, name: 'O primeiro corte' })).toBeInTheDocument();
    expect(screen.getByText('45:30')).toBeInTheDocument();
    expect(screen.getByText('10 de março de 2025')).toBeInTheDocument();
  });

  it('expõe duração e data em <time> legível por máquina', () => {
    const { container } = render(
      <EpisodeList episodes={podcast.episodes} podcastTitle={podcast.title} />,
    );

    const times = Array.from(container.querySelectorAll('time')).map((node) =>
      node.getAttribute('dateTime'),
    );
    expect(times).toContain('PT45M30S');
    expect(times).toContain('2025-03-10');
  });

  it('anuncia a duração por extenso para leitor de tela', () => {
    render(<EpisodeList episodes={podcast.episodes} podcastTitle={podcast.title} />);
    expect(screen.getByText('45 min 30 s')).toBeInTheDocument();
  });

  it('dá alt significativo à miniatura e o sizes do slot real', () => {
    render(<EpisodeList episodes={podcast.episodes} podcastTitle={podcast.title} />);

    const thumb = screen.getByRole('img', {
      name: 'Miniatura do Episódio 1 de Ofício: O primeiro corte',
    });
    expect(thumb).toHaveAttribute('sizes', '(min-width: 768px) 160px, 96px');
  });

  it('sem miniatura não renderiza <img> quebrada', () => {
    const { container } = render(
      <EpisodeList
        episodes={[makeEpisode({ thumbnail: null })]}
        podcastTitle={podcast.title}
      />,
    );
    expect(container.querySelectorAll('img')).toHaveLength(0);
  });

  it('respeita o nível de heading pedido pela página', () => {
    render(
      <EpisodeList
        episodes={podcast.episodes}
        podcastTitle={podcast.title}
        headingLevel="h4"
      />,
    );
    expect(screen.getByRole('heading', { level: 4, name: 'O primeiro corte' })).toBeInTheDocument();
  });

  it('mostra estado vazio quando o programa não tem episódios', () => {
    render(<EpisodeList episodes={[]} podcastTitle={podcast.title} />);
    expect(screen.getByText(/Nenhum episódio publicado/)).toBeInTheDocument();
  });
});

describe('TrackLinks', () => {
  it('monta as duas URLs a partir dos dois formatos de embed', () => {
    render(<TrackLinks episode={makeEpisode()} context="Episódio 1" />);

    const youtube = screen.getByRole('link', { name: /YouTube/ });
    const spotify = screen.getByRole('link', { name: /Spotify/ });

    expect(youtube).toHaveAttribute('href', `https://www.youtube.com/watch?v=${YOUTUBE_ID}`);
    expect(spotify).toHaveAttribute('href', `https://open.spotify.com/episode/${SPOTIFY_ID}`);
    expect(youtube).toHaveAttribute(
      'data-embed-url',
      `https://www.youtube.com/embed/${YOUTUBE_ID}`,
    );
    expect(spotify).toHaveAttribute(
      'data-embed-url',
      `https://open.spotify.com/embed/episode/${SPOTIFY_ID}`,
    );
  });

  it('o nome acessível distingue o episódio e avisa da nova aba', () => {
    render(<TrackLinks episode={makeEpisode()} context="Episódio 1" />);

    expect(
      screen.getByRole('link', { name: 'Spotify — Ouvir Episódio 1 no Spotify (abre em nova aba)' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('link', {
        name: 'YouTube — Assistir Episódio 1 no YouTube (abre em nova aba)',
      }),
    ).toBeInTheDocument();
  });

  it('abre em nova aba com rel seguro', () => {
    render(<TrackLinks episode={makeEpisode()} context="Episódio 1" />);
    for (const link of screen.getAllByRole('link')) {
      expect(link).toHaveAttribute('target', '_blank');
      expect(link).toHaveAttribute('rel', 'noopener noreferrer');
    }
  });

  it('trilha ausente não vira botão morto (só YouTube)', () => {
    render(
      <TrackLinks
        episode={makeEpisode({ spotifyEmbed: null, spotifyUrl: null })}
        context="Episódio 1"
      />,
    );

    expect(screen.getAllByRole('link')).toHaveLength(1);
    expect(screen.queryByRole('link', { name: /Spotify/ })).not.toBeInTheDocument();
  });

  it('trilha ausente não vira botão morto (só Spotify)', () => {
    render(
      <TrackLinks
        episode={makeEpisode({ youtubeEmbed: null, youtubeUrl: null })}
        context="Episódio 1"
      />,
    );

    expect(screen.getAllByRole('link')).toHaveLength(1);
    expect(screen.queryByRole('link', { name: /YouTube/ })).not.toBeInTheDocument();
  });

  it('sem nenhuma trilha renderiza nada', () => {
    const { container } = render(
      <TrackLinks
        episode={makeEpisode({
          youtubeEmbed: null,
          youtubeUrl: null,
          spotifyEmbed: null,
          spotifyUrl: null,
        })}
        context="Episódio 1"
      />,
    );

    expect(container).toBeEmptyDOMElement();
  });
});

describe('ProgramaSocialLinks', () => {
  it('lista só as redes preenchidas, na ordem canônica', () => {
    render(
      <ProgramaSocialLinks
        links={{ website: 'https://x.example', instagram: 'https://i.example' }}
        podcastTitle="Ofício"
      />,
    );

    const links = screen.getAllByRole('link');
    expect(links).toHaveLength(2);
    // `SOCIAL_ORDER` põe Instagram antes de Site oficial, independente da ordem
    // das chaves do JSON.
    expect(links[0]).toHaveAccessibleName(/Instagram/);
    expect(links[1]).toHaveAccessibleName(/Site oficial/);
  });

  it('ignora chave nula, vazia ou ausente', () => {
    expect(resolveSocialLinks({ instagram: null, twitter: '   ' })).toEqual([]);
    expect(resolveSocialLinks(null)).toEqual([]);
    expect(resolveSocialLinks(undefined)).toEqual([]);
  });

  it('abre em nova aba com rel seguro contra tabnabbing', () => {
    // `rel="noopener noreferrer"` é a única defesa declarada contra tabnabbing
    // em link de terceiro vindo do banco: sem ele a página aberta recebe
    // `window.opener` e pode reescrever a aba de origem.
    render(
      <ProgramaSocialLinks
        links={{ instagram: 'https://i.example', website: 'https://x.example' }}
        podcastTitle="Ofício"
      />,
    );

    const links = screen.getAllByRole('link');
    expect(links).toHaveLength(2);
    for (const link of links) {
      expect(link).toHaveAttribute('target', '_blank');
      expect(link).toHaveAttribute('rel', 'noopener noreferrer');
    }
  });

  it('avisa da nova aba no nome acessível (WCAG 2.2 §3.2.5)', () => {
    render(<ProgramaSocialLinks links={{ instagram: 'https://i.example' }} podcastTitle="Ofício" />);
    expect(
      screen.getByRole('link', { name: 'Instagram — Ofício no Instagram (abre em nova aba)' }),
    ).toBeInTheDocument();
  });

  describe('XSS armazenado — href nunca recebe o valor cru do banco', () => {
    it.each([
      'javascript:alert(1)',
      'JAVASCRIPT:alert(1)',
      'java\tscript:alert(1)',
      ' javascript:alert(1)',
      'data:text/html,<script>alert(1)</script>',
      'vbscript:msgbox(1)',
    ])('não renderiza link para %s', (payload) => {
      const { container } = render(
        <ProgramaSocialLinks links={{ instagram: payload }} podcastTitle="Ofício" />,
      );

      // Nem como link, nem como âncora sem href, nem como texto.
      expect(screen.queryByRole('link')).not.toBeInTheDocument();
      expect(container.querySelectorAll('a')).toHaveLength(0);
      expect(container.innerHTML).not.toContain('javascript');
      expect(container.innerHTML).not.toContain('vbscript');
      // Cai no estado vazio, que é a resposta honesta: o programa não tem essa rede.
      expect(screen.getByText(/ainda não divulgou perfis/)).toBeInTheDocument();
    });

    it('descarta só a rede hostil e mantém as legítimas', () => {
      render(
        <ProgramaSocialLinks
          links={{ instagram: 'javascript:alert(1)', website: 'https://x.example' }}
          podcastTitle="Ofício"
        />,
      );

      const links = screen.getAllByRole('link');
      expect(links).toHaveLength(1);
      expect(links[0]).toHaveAttribute('href', 'https://x.example/');
    });

    it('o href renderizado é a forma normalizada, não a string crua', () => {
      render(
        <ProgramaSocialLinks
          links={{ website: 'HTTPS://Example.com/Path' }}
          podcastTitle="Ofício"
        />,
      );

      expect(screen.getByRole('link')).toHaveAttribute('href', 'https://example.com/Path');
    });
  });

  it('mostra estado vazio quando não há nenhuma rede', () => {
    render(<ProgramaSocialLinks links={{}} podcastTitle="Ofício" />);
    expect(screen.getByText(/ainda não divulgou perfis/)).toBeInTheDocument();
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
  });
});

describe('ProgramaAbout', () => {
  it('quebra a descrição em parágrafos de verdade', () => {
    expect(toParagraphs('um\n\ndois\n\n\ntrês')).toEqual(['um', 'dois', 'três']);
    expect(toParagraphs('   ')).toEqual([]);
  });

  it('renderiza a ficha técnica como pares rótulo/valor', () => {
    const podcast = makePodcast();
    const { container } = render(<ProgramaAbout podcast={podcast} episodeCount={12} />);

    expect(container.querySelector('dl')).toBeInTheDocument();
    expect(screen.getByText('Categoria')).toBeInTheDocument();
    expect(screen.getByText('Documental')).toBeInTheDocument();
    expect(screen.getByText('12 episódios')).toBeInTheDocument();
    expect(screen.getByText(/Programa em produção/)).toBeInTheDocument();
  });

  it('mostra a bio apenas dos hosts que têm bio', () => {
    render(<ProgramaAbout podcast={makePodcast()} episodeCount={1} />);

    expect(screen.getByText('Documentarista.')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Quem apresenta' })).toBeInTheDocument();
  });

  it('não renderiza o bloco de bios quando nenhum host tem bio', () => {
    const podcast = makePodcast({
      hosts: [{ name: 'Caio Souza', initial: 'CS', photo: null, bio: null }],
    });
    render(<ProgramaAbout podcast={podcast} episodeCount={1} />);

    expect(screen.queryByRole('heading', { name: 'Quem apresenta' })).not.toBeInTheDocument();
  });
});

describe('ProgramaTabs', () => {
  const sections = [
    { value: 'sobre', label: 'Sobre', content: <p>Painel sobre</p> },
    { value: 'episodios', label: 'Episódios', content: <p>Painel episódios</p> },
    { value: 'redes', label: 'Redes', content: <p>Painel redes</p> },
  ];

  it('expõe tablist nomeado com as três abas', () => {
    render(<ProgramaTabs sections={sections} label="Conteúdo do programa Ofício" />);

    const tablist = screen.getByRole('tablist', { name: 'Conteúdo do programa Ofício' });
    expect(within(tablist).getAllByRole('tab')).toHaveLength(3);
  });

  it('abre na primeira aba e troca ao clicar', () => {
    render(<ProgramaTabs sections={sections} label="Seções" />);

    expect(screen.getByRole('tab', { name: 'Sobre' })).toHaveAttribute('aria-selected', 'true');

    fireEvent.click(screen.getByRole('tab', { name: 'Episódios' }));

    expect(screen.getByRole('tab', { name: 'Episódios' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tab', { name: 'Sobre' })).toHaveAttribute('aria-selected', 'false');
    expect(screen.getByRole('tabpanel')).toHaveTextContent('Painel episódios');
  });

  it('ancora a hierarquia de headings com um h2 por painel', () => {
    render(
      <ProgramaTabs
        sections={[{ ...sections[0]!, heading: 'Sobre Ofício' }, ...sections.slice(1)]}
        label="Seções"
      />,
    );

    expect(screen.getByRole('heading', { level: 2, name: 'Sobre Ofício' })).toBeInTheDocument();
  });

  it('sem seções não renderiza nada', () => {
    const { container } = render(<ProgramaTabs sections={[]} label="Seções" />);
    expect(container).toBeEmptyDOMElement();
  });
});
