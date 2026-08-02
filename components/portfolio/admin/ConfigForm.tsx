"use client";

import { useState } from "react";
import { useFormState } from "react-dom";
import { saveSiteConfig, type ActionResult } from "@/app/admin/portfolio/actions";
import { accentStyle } from "@/lib/portfolio/tokens";
import type { SiteConfig } from "@/lib/portfolio/types";
import { Alert, Card, Field, Input, SubmitButton, Textarea } from "./AdminUI";
import { ImageUpload } from "./ImageUpload";

// Configurações do site com preview em tempo real do cabeçalho público.

const INITIAL: ActionResult = { ok: false };

export function ConfigForm({ config }: { config: SiteConfig }) {
  const [state, formAction] = useFormState(saveSiteConfig, INITIAL);
  const [siteName, setSiteName] = useState(config.siteName);
  const [tagline, setTagline] = useState(config.tagline);
  const [primaryColor, setPrimaryColor] = useState(config.primaryColor);
  const [logoUrl, setLogoUrl] = useState(config.logoUrl ?? "");
  const [faviconUrl, setFaviconUrl] = useState(config.faviconUrl ?? "");

  return (
    <form action={formAction} className="grid gap-6 lg:grid-cols-[1fr_320px]">
      <input type="hidden" name="logoUrl" value={logoUrl} />
      <input type="hidden" name="faviconUrl" value={faviconUrl} />

      <div className="flex flex-col gap-5">
        {state.error ? <Alert kind="error">{state.error}</Alert> : null}
        {state.ok ? <Alert kind="success">Configurações salvas.</Alert> : null}

        <Card>
          <h2 className="mb-4 text-pf-2xl font-medium text-pf-primary">Identidade</h2>
          <div className="grid gap-5 sm:grid-cols-2">
            <Field label="Nome do site">
              <Input
                name="siteName"
                value={siteName}
                onChange={(e) => setSiteName(e.target.value)}
              />
            </Field>
            <Field label="Tagline">
              <Input name="tagline" value={tagline} onChange={(e) => setTagline(e.target.value)} />
            </Field>
            <Field label="Cor primária" hint="Hex — vira o accent padrão do catálogo.">
              <Input
                name="primaryColor"
                value={primaryColor}
                onChange={(e) => setPrimaryColor(e.target.value)}
                pattern="#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})"
              />
            </Field>
          </div>
          <div className="mt-5 grid gap-5 sm:grid-cols-2">
            <ImageUpload label="Logo" folder="brand" value={logoUrl} onChange={setLogoUrl} />
            <ImageUpload label="Favicon" folder="brand" value={faviconUrl} onChange={setFaviconUrl} />
          </div>
        </Card>

        <Card>
          <h2 className="mb-4 text-pf-2xl font-medium text-pf-primary">SEO</h2>
          <div className="grid gap-5">
            <Field label="Título SEO">
              <Input name="seoTitle" defaultValue={config.seoTitle ?? ""} />
            </Field>
            <Field label="Descrição SEO">
              <Textarea name="seoDescription" rows={3} defaultValue={config.seoDescription ?? ""} />
            </Field>
          </div>
        </Card>

        <Card>
          <h2 className="mb-4 text-pf-2xl font-medium text-pf-primary">Integrações</h2>
          <div className="grid gap-5 sm:grid-cols-2">
            <Field label="ID de analytics">
              <Input name="analyticsId" defaultValue={config.analyticsId ?? ""} placeholder="G-…" />
            </Field>
            <Field label="Facebook Pixel">
              <Input name="facebookPixel" defaultValue={config.facebookPixel ?? ""} />
            </Field>
          </div>
        </Card>

        <Card>
          <h2 className="mb-4 text-pf-2xl font-medium text-pf-primary">CSS customizado</h2>
          <Field
            label="customCss"
            hint="Injetado no escopo .pf-root do catálogo. Prefira sobrescrever as variáveis --pf-* a redeclarar regras."
          >
            <Textarea
              name="customCss"
              rows={8}
              defaultValue={config.customCss ?? ""}
              spellCheck={false}
              className="font-mono"
            />
          </Field>
        </Card>

        <div>
          <SubmitButton>Salvar configurações</SubmitButton>
        </div>
      </div>

      <aside className="lg:sticky lg:top-6 lg:self-start">
        <Card>
          <h2 className="mb-3 text-pf-xs uppercase tracking-pf-meta text-pf-primary/50">
            Preview do cabeçalho
          </h2>
          <div
            style={accentStyle(primaryColor)}
            className="rounded-pf-md border border-pf-muted/[0.06] bg-pf-base p-4"
          >
            <div className="flex items-center gap-2">
              {logoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={logoUrl} alt="" aria-hidden className="h-7 w-auto" />
              ) : (
                <span
                  aria-hidden
                  className="grid h-7 w-7 place-items-center rounded-pf-sm bg-pf-inverse/15 text-pf-xs font-medium text-pf-inverse"
                >
                  RM
                </span>
              )}
              <span className="text-pf-xl font-medium text-pf-primary">{siteName}</span>
            </div>
            <p className="mt-3 text-pf-xs uppercase tracking-pf-meta text-pf-primary/50">
              {tagline}
            </p>
            <span className="mt-4 inline-flex min-h-[36px] items-center rounded-pf-md bg-pf-inverse px-3 text-pf-xs font-medium uppercase tracking-pf-track text-pf-base">
              CTA primário
            </span>
          </div>
        </Card>
      </aside>
    </form>
  );
}
