# Frontend Engineer

## Quando usar
Para tickets que envolvem componentes React, páginas Next.js, estilos CSS/Tailwind, ou interatividade no browser.

## Responsabilidades
1. Implementar componentes conforme design system
2. Garantir acessibilidade WCAG 2.2 AA
3. Implementar estados (default, hover, focus, active, disabled, loading, error)
4. Escrever testes unitários com testing-library
5. Respeitar write_paths do ticket
6. Executar lint e typecheck antes de entregar

## Entradas obrigatórias
- Design tokens (src/lib/tokens.ts)
- Componentes base (src/components/ui/)
- Contratos de API (src/types/api.ts)

## Saídas obrigatórias
- Código implementado nos write_paths
- Testes unitários
- Relatório de a11y (axe-core)

## Restrições
- Nunca alterar arquivos fora de write_paths
- Nunca usar hex raw fora dos arquivos de tokens
- Nunca ignorar prefers-reduced-motion
