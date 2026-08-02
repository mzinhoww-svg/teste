# Claude.md — Reiners Media Podcast Studio

## 1. Missão do Agente Principal

Orquestrar a execução paralela do desenvolvimento do Estúdio de Podcast Reiners Media, garantindo que tickets independentes sejam executados simultaneamente, dependências sejam respeitadas, e qualidade seja mantida através de revisão independente.

## 2. Contexto do Produto

- **Produto**: Portfólio digital + landing page para estúdio de podcast
- **Público**: Clientes em potencial, recrutadores, ouvintes
- **Superfície**: Web (Next.js App Router)
- **Identidade visual**: Reiners Media Design System 2026 (Navy #0B0B0F, Creme #FAF7F2, Ouro #9A7B35) integrado com tokens PodFactory (Borna, surface.base #000000, text.inverse #d87dff)
- **Stack**: Next.js 14+, TypeScript, Tailwind CSS, Prisma, Supabase, Vercel

## 3. Fontes de Verdade

1. `docs/PRD.md` — Requisitos funcionais e não-funcionais
2. `docs/ARCHITECTURE.md` — Diagramas, componentes, APIs
3. `contracts/` — Contratos de API, eventos, dados, frontend
4. `tickets/items/TCK-XXX.json` — Tickets canônicos (fonte de verdade do estado)
5. `docs/DATA_MODEL.md` — Schema Prisma
6. `docs/API_CONTRACTS.md` — OpenAPI specs

## 4. Hierarquia dos Documentos

```
PRD.md -> requisitos
  └── ARCHITECTURE.md -> componentes e fluxos
        └── API_CONTRACTS.md -> contratos de interface
              └── DATA_MODEL.md -> schema de dados
                    └── tickets/ -> execução
```

## 5. Protocolo de Inicialização Obrigatório

```
1. Ler START_HERE.md
2. Executar: python3 scripts/validate_delivery.py
3. Executar: python3 scripts/ticketctl.py validate
4. Executar: python3 scripts/ticketctl.py summary
5. Se válido, ler docs/PRD.md (seções 1-10)
6. Se inválido, abortar e reportar
```

## 6. Protocolo de Leitura Mínima

Antes de qualquer execução:
- `CLAUDE.md` (este arquivo)
- `docs/PRD.md` — Visão, escopo, requisitos P0
- `docs/ARCHITECTURE.md` — Componentes, fluxos, decisões
- `contracts/api/` — Endpoints que serão consumidos/produzidos
- `tickets/manifest.json` — Estado atual

## 7. Protocolo para Seleção de Tickets

```
1. Executar: python3 scripts/ticketctl.py ready
2. Executar: python3 scripts/ticketctl.py wave --max 8
3. Verificar: nenhum conflito de write_paths na onda
4. Priorizar: P0 > P1 > P2
5. Priorizar: maior independence_score
6. Priorizar: tickets que desbloqueiam mais dependentes
7. Selecionar: maior conjunto seguro
```

## 8. Regras de Claim

- Claim é atômico via lock file em `tickets/state/locks/`
- Um ticket só pode ser claimed por um agente
- Claim só é permitido em status READY
- Após claim, status = CLAIMED
- Após start, status = IN_PROGRESS
- Timeout padrão: 4 horas (configurável)

## 9. Estados Permitidos

BACKLOG -> READY -> CLAIMED -> IN_PROGRESS -> IN_REVIEW -> APPROVED -> INTEGRATING -> DONE

Transições alternativas:
- IN_PROGRESS -> BLOCKED (com razão registrada)
- BLOCKED -> READY (quando dependências resolvidas)
- IN_REVIEW -> CHANGES_REQUESTED -> IN_PROGRESS
- CLAIMED -> BACKLOG (se não iniciado em 30 min)

## 10. Regras de Dependência

- NUNCA executar ticket com dependência não concluída (DONE ou INTEGRATING)
- Verificar `dependencies` e `dependency_reasons` no ticket
- Executar `python3 scripts/ticketctl.py unlock` para atualizar estados

## 11. Regras de Paralelização

- Máximo 8 tickets simultâneos por onda
- Nenhuma sobreposição de `write_paths` na mesma onda
- Tickets com `shared_files` devem estar em ondas diferentes
- Contratos devem ser estabilizados antes de tickets consumidores

## 12. Regras de Ownership

- Cada ticket tem `write_paths` explícitos
- Agentes NÃO podem alterar arquivos fora de `write_paths`
- `forbidden_paths` inclui: .env*, credentials, node_modules, .git/
- `path_guard.py` valida antes de cada commit

## 13. Regras de Worktree

- Branch: `ticket/<ticket-id>-<slug>`
- Worktree: `.claude/worktrees/<ticket-id>`
- Nunca editar branch principal diretamente
- Cada worktree executa seu próprio bootstrap
- Limpeza automática após integração

## 14. Regras de Branch

- Formato: `ticket/TCK-001-design-tokens`
- Base: `main` ou `develop` (conforme projeto)
- Rebase antes de integração
- Nenhum force push

## 15. Regras de Commit

- Prefixo: `[TCK-001]` no início da mensagem
- Formato: `[TCK-001] feat: implement design token system`
- Commits atômicos, um por unidade lógica
- Nunca commitar credenciais

## 16. Regras de Pull Request

- PR deve referenciar ticket no título: `[TCK-001] Design Token System`
- Template: checklist de critérios de aceitação
- Revisão obrigatória por code-reviewer independente
- CI deve passar antes de merge

## 17. Regras de Testes

- Todo ticket deve ter testes conforme `test_plan`
- Unitários: cobertura mínima 80% para lógica de negócio
- Integração: testar contratos de API
- E2E: fluxos críticos (login, CRUD, player)
- Comando de validação deve passar antes de DONE

## 18. Regras de Segurança

- Nunca commitar .env, secrets, tokens
- Validar inputs em todos os endpoints
- Sanitizar dados antes de renderização
- Rate limiting em APIs públicas
- CSP headers configurados

## 19. Regras de Revisão

- Revisor NÃO pode ser o mesmo que implementou
- Revisar: correção, escopo, segurança, testes, performance, legibilidade
- Usar `code-reviewer.md` como guia
- Findings devem ser registrados no ticket

## 20. Regras de Integração

- Somente tickets APPROVED podem ser integrados
- Executar testes globais antes de merge
- Verificar regressões
- Atualizar contratos se necessário
- Atualizar TRACEABILITY.md

## 21. Regras de Rollback

- Todo ticket deve ter `rollback_plan`
- Rollback deve ser executável em < 15 minutos
- Feature flags para funcionalidades de alto risco
- Backup automático do banco antes de migrações

## 22. Critérios para Conclusão

- Escopo respeitado
- Critérios de aceitação atendidos
- Testes passando
- Lint passando
- Type check passando
- Build passando
- Revisão independente concluída
- Documentação atualizada
- Rollback validado

## 23. Formato de Handoff

```json
{
  "ticket_id": "TCK-001",
  "agent": "frontend-engineer",
  "outputs": ["src/lib/tokens.ts", "src/styles/globals.css"],
  "tests_passed": true,
  "notes": "Tokens aplicados em todos os componentes base",
  "next_steps": ["TCK-009 pode consumir os tokens"]
}
```

## 24. Condições que Exigem Bloqueio

- Dependência não concluída
- Conflito de write_paths detectado
- Falha de segurança identificada
- Testes quebrados não resolvidos
- Alteração fora de escopo

## 25. Condições que Proíbem Início

- Ticket em status diferente de READY
- Claim já realizado por outro agente
- Worktree em uso para outro ticket
- Dependências pendentes
- Falha na validação do pacote

## 26. Procedimento de Retomada

```
1. python3 scripts/ticketctl.py summary
2. Identificar tickets IN_PROGRESS ou CLAIMED
3. Verificar se worktree ainda existe
4. Se sim, retomar no worktree existente
5. Se não, recriar worktree e re-claim
6. Executar validações pendentes
7. Continuar do ponto de interrupção
```

## 27. Proibições Absolutas

1. NUNCA executar ticket com dependência não concluída
2. NUNCA alterar arquivos fora de `write_paths`
3. NUNCA executar dois tickets com conflito de arquivos na mesma onda
4. NUNCA considerar ticket concluído sem validação
5. NUNCA marcar DONE antes da revisão independente
6. NUNCA alterar PRD silenciosamente
7. NUNCA criar requisitos não aprovados
8. NUNCA ignorar falhas de segurança
9. NUNCA ocultar testes quebrados
10. NUNCA fazer alterações destrutivas sem rollback
