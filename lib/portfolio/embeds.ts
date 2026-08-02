// Parser de URLs de trilha → identificadores/URLs de embed.
// Usado tanto pelo admin (ao salvar um episódio) quanto pelo modal de player.
// Puro e sem I/O — coberto por testes unitários.

/**
 * Extrai o ID do vídeo de qualquer formato usual do YouTube:
 * watch?v=, youtu.be/, /embed/, /shorts/, /live/.
 * Retorna null quando não reconhece (o admin então mantém o campo vazio).
 */
export function parseYouTubeId(raw?: string | null): string | null {
  if (!raw) return null;
  const value = raw.trim();
  // Já é só o ID
  if (/^[\w-]{11}$/.test(value)) return value;

  let url: URL;
  try {
    url = new URL(value.startsWith("http") ? value : `https://${value}`);
  } catch {
    return null;
  }
  const host = url.hostname.replace(/^www\./, "");

  if (host === "youtu.be") {
    const id = url.pathname.slice(1).split("/")[0];
    return /^[\w-]{11}$/.test(id) ? id : null;
  }
  if (!/(^|\.)youtube(-nocookie)?\.com$/.test(host)) return null;

  const v = url.searchParams.get("v");
  if (v && /^[\w-]{11}$/.test(v)) return v;

  const m = url.pathname.match(/\/(embed|shorts|live|v)\/([\w-]{11})/);
  return m ? m[2] : null;
}

/** URL de embed do YouTube. `rel=0` evita sugerir vídeos de terceiros. */
export function youTubeEmbedUrl(idOrUrl?: string | null): string | null {
  const id = parseYouTubeId(idOrUrl);
  return id ? `https://www.youtube-nocookie.com/embed/${id}?rel=0` : null;
}

export type SpotifyKind = "episode" | "show" | "track" | "playlist" | "album";

export interface SpotifyRef {
  kind: SpotifyKind;
  id: string;
}

const SPOTIFY_KINDS: SpotifyKind[] = ["episode", "show", "track", "playlist", "album"];

/**
 * Aceita URL aberta (open.spotify.com/episode/ID), URI (spotify:episode:ID)
 * ou URL de embed já pronta.
 */
export function parseSpotifyRef(raw?: string | null): SpotifyRef | null {
  if (!raw) return null;
  const value = raw.trim();

  const uri = value.match(/^spotify:(\w+):([A-Za-z0-9]+)$/);
  if (uri && SPOTIFY_KINDS.includes(uri[1] as SpotifyKind)) {
    return { kind: uri[1] as SpotifyKind, id: uri[2] };
  }

  let url: URL;
  try {
    url = new URL(value.startsWith("http") ? value : `https://${value}`);
  } catch {
    return null;
  }
  if (!/(^|\.)spotify\.com$/.test(url.hostname.replace(/^www\./, ""))) return null;

  // /episode/ID, /embed/episode/ID e /intl-pt/episode/ID
  const parts = url.pathname.split("/").filter(Boolean);
  const idx = parts.findIndex((p) => SPOTIFY_KINDS.includes(p as SpotifyKind));
  if (idx === -1 || !parts[idx + 1]) return null;

  const id = parts[idx + 1].split("?")[0];
  return /^[A-Za-z0-9]+$/.test(id) ? { kind: parts[idx] as SpotifyKind, id } : null;
}

/** URL de embed do Spotify (tema escuro, sem autoplay). */
export function spotifyEmbedUrl(raw?: string | null): string | null {
  const ref = parseSpotifyRef(raw);
  return ref ? `https://open.spotify.com/embed/${ref.kind}/${ref.id}?theme=0` : null;
}

/**
 * Normaliza os quatro campos de trilha de um episódio a partir do que o
 * usuário colou no admin. Nunca inventa embed sem URL correspondente.
 */
export function normalizeTracks(input: {
  youtubeUrl?: string | null;
  spotifyUrl?: string | null;
}): {
  youtubeUrl: string | null;
  youtubeEmbed: string | null;
  spotifyUrl: string | null;
  spotifyEmbed: string | null;
} {
  const yt = input.youtubeUrl?.trim() || null;
  const sp = input.spotifyUrl?.trim() || null;
  return {
    youtubeUrl: yt,
    youtubeEmbed: youTubeEmbedUrl(yt),
    spotifyUrl: sp,
    spotifyEmbed: spotifyEmbedUrl(sp),
  };
}
