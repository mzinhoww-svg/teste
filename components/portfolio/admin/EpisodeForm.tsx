"use client";

import { useState } from "react";
import { useFormState } from "react-dom";
import { saveEpisode, type ActionResult } from "@/app/admin/portfolio/actions";
import { parseYouTubeId, parseSpotifyRef } from "@/lib/portfolio/embeds";
import type { Episode } from "@/lib/portfolio/types";
import { Alert, Button, Card, Field, Input, Select, SubmitButton, Textarea } from "./AdminUI";
import { ImageUpload } from "./ImageUpload";

// Formulário de episódio. As URLs de YouTube/Spotify são convertidas em IDs de
// embed no servidor (normalizeTracks); aqui o mesmo parser roda ao vivo só para
// confirmar ao editor que a URL colada foi reconhecida.

const INITIAL: ActionResult = { ok: false };

export function EpisodeForm({
  episode,
  podcasts,
  defaultPodcastId,
}: {
  episode?: Episode;
  podcasts: { id: string; title: string }[];
  defaultPodcastId?: string;
}) {
  const [state, formAction] = useFormState(saveEpisode, INITIAL);
  const [thumbnail, setThumbnail] = useState(episode?.thumbnail ?? "");
  const [youtube, setYoutube] = useState(episode?.youtubeUrl ?? "");
  const [spotify, setSpotify] = useState(episode?.spotifyUrl ?? "");

  const ytId = parseYouTubeId(youtube);
  const spRef = parseSpotifyRef(spotify);

  return (
    <form action={formAction} className="flex max-w-3xl flex-col gap-5">
      <input type="hidden" name="id" defaultValue={episode?.id ?? ""} />
      <input type="hidden" name="thumbnail" value={thumbnail} />

      {state.error ? <Alert kind="error">{state.error}</Alert> : null}
      {state.ok ? <Alert kind="success">Episódio salvo.</Alert> : null}

      <Card>
        <div className="grid gap-5 sm:grid-cols-2">
          <Field label="Programa">
            <Select
              name="podcastId"
              required
              defaultValue={episode?.podcastId ?? defaultPodcastId ?? ""}
            >
              <option value="">Selecione…</option>
              {podcasts.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.title}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Número">
            <Input name="number" type="number" min={0} defaultValue={episode?.number ?? 1} required />
          </Field>
          <Field label="Título">
            <Input name="title" defaultValue={episode?.title ?? ""} required />
          </Field>
          <Field label="Duração" hint="Formato livre — ex.: 58:12">
            <Input name="duration" defaultValue={episode?.duration ?? ""} placeholder="58:12" />
          </Field>
          <Field label="Publicado em">
            <Input
              name="publishedAt"
              type="date"
              defaultValue={(episode?.publishedAt ?? new Date().toISOString()).slice(0, 10)}
              required
            />
          </Field>
        </div>

        <div className="mt-5">
          <Field label="Descrição">
            <Textarea name="description" rows={4} defaultValue={episode?.description ?? ""} />
          </Field>
        </div>
      </Card>

      <Card>
        <h2 className="mb-4 text-pf-2xl font-medium text-pf-primary">Thumbnail</h2>
        <ImageUpload label="Thumbnail (16:9)" folder="thumbs" value={thumbnail} onChange={setThumbnail} />
      </Card>

      <Card>
        <h2 className="mb-4 text-pf-2xl font-medium text-pf-primary">Trilhas</h2>
        <div className="grid gap-5">
          <Field
            label="URL do YouTube"
            hint={
              youtube
                ? ytId
                  ? `Reconhecido — vídeo ${ytId}`
                  : "URL não reconhecida: o botão do YouTube ficará desabilitado."
                : "watch?v=…, youtu.be/…, /shorts/… ou /embed/…"
            }
          >
            <Input
              name="youtubeUrl"
              type="url"
              value={youtube}
              onChange={(e) => setYoutube(e.target.value)}
              placeholder="https://www.youtube.com/watch?v=…"
            />
          </Field>
          <Field
            label="URL do Spotify"
            hint={
              spotify
                ? spRef
                  ? `Reconhecido — ${spRef.kind} ${spRef.id}`
                  : "URL não reconhecida: o botão do Spotify ficará desabilitado."
                : "open.spotify.com/episode/… ou spotify:episode:…"
            }
          >
            <Input
              name="spotifyUrl"
              type="url"
              value={spotify}
              onChange={(e) => setSpotify(e.target.value)}
              placeholder="https://open.spotify.com/episode/…"
            />
          </Field>
        </div>
      </Card>

      <div className="flex gap-3">
        <SubmitButton>{episode ? "Salvar alterações" : "Criar episódio"}</SubmitButton>
        <Button type="button" variant="ghost" onClick={() => history.back()}>
          Cancelar
        </Button>
      </div>
    </form>
  );
}
