"use client";

import { useRef, useState, useTransition } from "react";
import { uploadImage } from "@/app/admin/portfolio/actions";
import { Alert, Button, Field, Input } from "./AdminUI";

// Upload para o bucket `portfolio` do Supabase Storage. A URL pública
// resultante é gravada no campo correspondente do programa/episódio.
// O campo de texto continua editável — dá para colar uma URL externa.

export function ImageUpload({
  label,
  folder,
  value,
  onChange,
}: {
  label: string;
  folder: string;
  value: string;
  onChange: (url: string) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function onPick(file: File) {
    setError(null);
    const form = new FormData();
    form.set("file", file);
    form.set("folder", folder);

    startTransition(async () => {
      const result = await uploadImage(form);
      if (result.ok && result.url) onChange(result.url);
      else setError(result.error ?? "Falha no upload.");
    });
  }

  return (
    <div className="flex flex-col gap-3">
      <Field label={label} hint="Envie um arquivo ou cole uma URL.">
        <Input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="https://…"
        />
      </Field>

      {value ? (
        <div className="relative aspect-video w-full overflow-hidden rounded-pf-md border border-pf-muted/[0.06] bg-pf-strong">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={value} alt={`Pré-visualização: ${label}`} className="h-full w-full object-cover" />
        </div>
      ) : null}

      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/avif,image/svg+xml"
        className="sr-only"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) onPick(file);
          e.target.value = "";
        }}
      />

      <div className="flex gap-2">
        <Button
          type="button"
          variant="ghost"
          disabled={pending}
          onClick={() => inputRef.current?.click()}
        >
          {pending ? "Enviando…" : "Enviar arquivo"}
        </Button>
        {value ? (
          <Button type="button" variant="ghost" onClick={() => onChange("")}>
            Remover
          </Button>
        ) : null}
      </div>

      {error ? <Alert kind="error">{error}</Alert> : null}
    </div>
  );
}
