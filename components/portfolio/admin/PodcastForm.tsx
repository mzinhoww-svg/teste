"use client";

import { useState } from "react";
import { useFormState } from "react-dom";
import { savePodcast, type ActionResult } from "@/app/admin/portfolio/actions";
import { PosterArt } from "@/components/portfolio/PodcastPoster";
import { accentStyle, DEFAULT_ACCENT } from "@/lib/portfolio/tokens";
import {
  PODCAST_STATUS,
  STATUS_LABEL,
  VISUAL_STYLES,
  VISUAL_STYLE_LABEL,
  type Podcast,
  type VisualStyle,
} from "@/lib/portfolio/types";
import { Alert, Button, Card, Field, Input, Select, SubmitButton, Textarea } from "./AdminUI";
import { ImageUpload } from "./ImageUpload";

// Formulário de programa. O preview à direita re-renderiza a arte do poster ao
// vivo conforme o estilo visual / cor de acento escolhidos (spec §9).

const INITIAL: ActionResult = { ok: false };

export function PodcastForm({ podcast }: { podcast?: Podcast }) {
  const [state, formAction] = useFormState(savePodcast, INITIAL);

  const [visualStyle, setVisualStyle] = useState<VisualStyle>(podcast?.visualStyle ?? "MINIMAL");
  const [accent, setAccent] = useState(podcast?.accentColor ?? DEFAULT_ACCENT);
  const [title, setTitle] = useState(podcast?.title ?? "");
  const [cover, setCover] = useState(podcast?.coverImage ?? "");
  const [hero, setHero] = useState(podcast?.heroImage ?? "");

  const hostsText = (podcast?.hosts ?? [])
    .map((h) => [h.name, h.role ?? "", h.bio ?? "", h.initial ?? ""].join(" | "))
    .join("\n");

  return (
    <form action={formAction} className="grid gap-6 lg:grid-cols-[1fr_320px]">
      <input type="hidden" name="id" defaultValue={podcast?.id ?? ""} />
      <input type="hidden" name="coverImage" value={cover} />
      <input type="hidden" name="heroImage" value={hero} />

      <div className="flex flex-col gap-5">
        {state.error ? <Alert kind="error">{state.error}</Alert> : null}
        {state.ok ? <Alert kind="success">Programa salvo.</Alert> : null}

        <Card>
          <div className="grid gap-5 sm:grid-cols-2">
            <Field label="Título">
              <Input
                name="title"
                required
                value={title}
                onChange={(e) => setTitle(e.target.value)}
              />
            </Field>
            <Field label="Slug" hint="Vazio gera a partir do título.">
              <Input name="slug" defaultValue={podcast?.slug ?? ""} placeholder="in-loco" />
            </Field>
            <Field label="Tagline">
              <Input name="tagline" defaultValue={podcast?.tagline ?? ""} />
            </Field>
            <Field label="Categoria">
              <Input name="category" defaultValue={podcast?.category ?? ""} required />
            </Field>
            <Field label="Status">
              <Select name="status" defaultValue={podcast?.status ?? "ACTIVE"}>
                {PODCAST_STATUS.map((s) => (
                  <option key={s} value={s}>
                    {STATUS_LABEL[s]}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Estilo visual">
              <Select
                name="visualStyle"
                value={visualStyle}
                onChange={(e) => setVisualStyle(e.target.value as VisualStyle)}
              >
                {VISUAL_STYLES.map((v) => (
                  <option key={v} value={v}>
                    {VISUAL_STYLE_LABEL[v]}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Ano">
              <Input
                name="year"
                type="number"
                defaultValue={podcast?.year ?? new Date().getFullYear()}
                required
              />
            </Field>
            <Field label="Cor de acento" hint="Hex — sobrescreve o roxo padrão neste programa.">
              <Input
                name="accentColor"
                value={accent}
                onChange={(e) => setAccent(e.target.value)}
                pattern="#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})"
              />
            </Field>
            <Field label="Ordem de exibição">
              <Input name="displayOrder" type="number" defaultValue={podcast?.displayOrder ?? 0} />
            </Field>
            <label className="flex min-h-[44px] items-center gap-3 self-end">
              <input
                type="checkbox"
                name="featured"
                defaultChecked={podcast?.featured ?? false}
                className="h-5 w-5 accent-pf-inverse"
              />
              <span className="text-pf-base text-pf-primary">Destaque no carrossel</span>
            </label>
          </div>

          <div className="mt-5">
            <Field label="Descrição">
              <Textarea name="description" rows={5} defaultValue={podcast?.description ?? ""} />
            </Field>
          </div>
        </Card>

        <Card>
          <h2 className="mb-4 text-pf-2xl font-medium text-pf-primary">Imagens</h2>
          <div className="grid gap-5 sm:grid-cols-2">
            <ImageUpload label="Capa (2:3)" folder="covers" value={cover} onChange={setCover} />
            <ImageUpload label="Hero (21:9)" folder="heroes" value={hero} onChange={setHero} />
          </div>
        </Card>

        <Card>
          <h2 className="mb-4 text-pf-2xl font-medium text-pf-primary">Apresentação</h2>
          <Field
            label="Hosts"
            hint="Uma linha por host: Nome | Papel | Bio | Iniciais"
          >
            <Textarea
              name="hosts"
              rows={4}
              defaultValue={hostsText}
              placeholder="Marcelo Reiners | Apresentador | Fundador da Reiners Media | MR"
            />
          </Field>
        </Card>

        <Card>
          <h2 className="mb-4 text-pf-2xl font-medium text-pf-primary">Redes sociais</h2>
          <div className="grid gap-5 sm:grid-cols-2">
            {(["instagram", "twitter", "tiktok", "linkedin", "website", "github"] as const).map(
              (key) => (
                <Field key={key} label={key}>
                  <Input
                    name={`social_${key}`}
                    type="url"
                    defaultValue={podcast?.socialLinks?.[key] ?? ""}
                    placeholder="https://…"
                  />
                </Field>
              ),
            )}
          </div>
        </Card>

        <div className="flex gap-3">
          <SubmitButton>{podcast ? "Salvar alterações" : "Criar programa"}</SubmitButton>
          <Button type="button" variant="ghost" onClick={() => history.back()}>
            Cancelar
          </Button>
        </div>
      </div>

      {/* Preview ao vivo do poster */}
      <aside className="lg:sticky lg:top-6 lg:self-start">
        <Card>
          <h2 className="mb-3 text-pf-xs uppercase tracking-pf-meta text-pf-primary/50">
            Preview do poster
          </h2>
          <div
            style={accentStyle(accent)}
            className="relative aspect-[2/3] w-full overflow-hidden rounded-pf-sm border border-pf-muted/[0.06]"
          >
            <PosterArt
              visualStyle={visualStyle}
              coverImage={cover || undefined}
              title={title || "Título do programa"}
            />
            <span aria-hidden className="pf-poster-fade absolute inset-x-0 bottom-0 h-1/2" />
            <span className="absolute inset-x-0 bottom-0 p-3">
              <span className="line-clamp-2 block text-pf-lg font-medium text-pf-primary">
                {title || "Título do programa"}
              </span>
            </span>
          </div>
          <p className="mt-3 text-pf-sm text-pf-primary/50">
            {VISUAL_STYLE_LABEL[visualStyle]} — a arte é gerada por CSS e funciona mesmo sem capa.
          </p>
        </Card>
      </aside>
    </form>
  );
}
