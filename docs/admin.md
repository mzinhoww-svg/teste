# Admin da plataforma

Existem **dois níveis de administração** — não confunda:

| Nível | Onde | Quem | O que faz |
| --- | --- | --- | --- |
| **Admin de tenant** | `/app/org` | `owner` / `admin` da organização | Gerencia a própria org: marca, membros, convites, agentes. |
| **Admin da plataforma** | `/admin` | Operador do produto | Visão de todos os tenants da instância. |

Este documento trata do **admin da plataforma** (`/admin`).

## Acesso

A rota `/admin` é liberada para o usuário logado se **qualquer** condição for
verdadeira (ver `app/admin/page.tsx`, função `isPlatformAdmin`):

1. O e-mail está em `PLATFORM_ADMIN_EMAILS` (lista separada por vírgula) — o
   fallback inicial, útil no primeiro provisionamento.
2. Existe uma linha em `platform_admins` com o `user_id` da conta.

Quem não se enquadra vê uma tela de "área restrita" com link de volta ao CRM —
sem vazar dados.

> Segurança: a checagem é **server-side** e usa `auth.getUser()` (sessão real),
> nunca só um cookie. A visão de tenants vem da função
> `admin_overview` (`SECURITY DEFINER`), que só retorna dados a quem passou na
> checagem.

## Promover alguém a admin da plataforma

**Opção A — variável de ambiente (rápida):**
adicione o e-mail em `PLATFORM_ADMIN_EMAILS` na Vercel e refaça o deploy.

```
PLATFORM_ADMIN_EMAILS=voce@empresa.com,socio@empresa.com
```

**Opção B — tabela (persistente, recomendada):**
insira o `user_id` (de `auth.users`) em `platform_admins`.

```sql
insert into public.platform_admins (user_id)
select id from auth.users where email = 'voce@empresa.com'
on conflict do nothing;
```

## O que a tela mostra

`/admin` consome `admin_overview` e lista, por tenant: nome, nº de membros,
nº de deals e atividade recente — uma visão operacional da instância inteira,
sem entrar em nenhuma organização específica.

## Diferença para o admin de tenant

O admin da plataforma **não** edita dados de um tenant pela `/admin` — ele
observa. Para operar dentro de uma organização (mover deals, editar agentes,
convidar membros) é preciso ser membro dela com papel `owner`/`admin`, usando
`/app`. Isso mantém o isolamento multi-tenant: acesso à plataforma ≠ acesso aos
dados de um cliente.
