"use client";

import { useState, useTransition } from "react";
import { useFormState } from "react-dom";
import {
  deleteAdminUser,
  saveAdminUser,
  type ActionResult,
} from "@/app/admin/portfolio/actions";
import { ADMIN_ROLES, type AdminUser } from "@/lib/portfolio/types";
import { Alert, Button, Card, Field, Input, Select, SubmitButton } from "./AdminUI";

const INITIAL: ActionResult = { ok: false };

export function AdminUserManager({
  users,
  currentEmail,
}: {
  users: AdminUser[];
  currentEmail: string;
}) {
  const [state, formAction] = useFormState(saveAdminUser, INITIAL);
  const [items, setItems] = useState(users);
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
      <Card>
        <h2 className="mb-4 text-pf-2xl font-medium text-pf-primary">Acessos</h2>
        {error ? <Alert kind="error">{error}</Alert> : null}

        {items.length ? (
          <ul className="flex flex-col gap-3">
            {items.map((user) => (
              <li
                key={user.id}
                className="flex flex-wrap items-center gap-4 border-b border-pf-muted/[0.06] pb-3"
              >
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-pf-base text-pf-primary">
                    {user.name ? `${user.name} — ` : ""}
                    {user.email}
                  </span>
                  <span className="mt-1 block text-pf-xs uppercase tracking-pf-meta text-pf-primary/50">
                    {user.role}
                    {user.lastLoginAt
                      ? ` · último acesso ${new Date(user.lastLoginAt).toLocaleDateString("pt-BR")}`
                      : " · nunca acessou"}
                  </span>
                </span>

                {user.email === currentEmail ? (
                  <span className="text-pf-xs uppercase tracking-pf-meta text-pf-inverse">
                    Você
                  </span>
                ) : (
                  <Button
                    type="button"
                    variant="danger"
                    onClick={() =>
                      startTransition(async () => {
                        const result = await deleteAdminUser(user.id);
                        if (result.ok) setItems((cur) => cur.filter((u) => u.id !== user.id));
                        else setError(result.error ?? "Falha ao remover.");
                      })
                    }
                  >
                    Remover
                  </Button>
                )}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-pf-sm text-pf-primary/30">
            Nenhum usuário cadastrado — o acesso está vindo de PORTFOLIO_ADMIN_EMAILS.
          </p>
        )}
      </Card>

      <Card>
        <h2 className="mb-4 text-pf-2xl font-medium text-pf-primary">Conceder acesso</h2>
        <form action={formAction} className="flex flex-col gap-5">
          {state.error ? <Alert kind="error">{state.error}</Alert> : null}
          {state.ok ? <Alert kind="success">Acesso salvo. Recarregue para ver na lista.</Alert> : null}

          <Field label="E-mail">
            <Input name="email" type="email" required placeholder="pessoa@reiners.agency" />
          </Field>
          <Field label="Nome">
            <Input name="name" />
          </Field>
          <Field label="Papel">
            <Select name="role" defaultValue="EDITOR">
              {ADMIN_ROLES.map((role) => (
                <option key={role} value={role}>
                  {role}
                </option>
              ))}
            </Select>
          </Field>

          <SubmitButton>Salvar acesso</SubmitButton>
        </form>
      </Card>
    </div>
  );
}
