// Glifo de conversa usado nos CTAs de WhatsApp — balão com as ondas do áudio.
// Genérico de propósito (não reproduz a marca); quem nomeia o canal é o texto
// visível ou o aria-label do link.
export function WhatsappGlyph({ className = "h-5 w-5" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      aria-hidden="true"
    >
      <path
        d="M21 11.5a8.5 8.5 0 0 1-12.6 7.4L3.5 20.5l1.6-4.8A8.5 8.5 0 1 1 21 11.5Z"
        strokeLinejoin="round"
      />
      <path d="M9 10.2c0 2.6 2.2 4.8 4.8 4.8" strokeLinecap="round" />
      <path d="M9 10.2c0-.7.6-1.2 1.2-1.2l.9 1.6-.8 1M13.8 15c.7 0 1.2-.5 1.2-1.2l-1.6-.9-1 .8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
