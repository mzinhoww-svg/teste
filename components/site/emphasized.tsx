import * as React from "react";

/**
 * Só `**negrito**`. Usado em campos de texto livre do CMS (descrição de
 * plano, fecho de serviço) — o parser é intencionalmente burro (sem HTML,
 * sem itálico, sem links) porque quem edita esses campos não edita código, e
 * um parser mais permissivo seria vetor de injeção.
 */
export function Emphasized({ text }: { text: string }) {
  return (
    <>
      {text.split(/\*\*(.+?)\*\*/g).map((chunk, i) =>
        i % 2 === 1 ? (
          <strong key={i} className="font-semibold text-site-text-primary">
            {chunk}
          </strong>
        ) : (
          <React.Fragment key={i}>{chunk}</React.Fragment>
        ),
      )}
    </>
  );
}
