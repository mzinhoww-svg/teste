import { describe, it, expect } from "vitest";
import { isCrmPassthrough, subdomainFor } from "@/lib/supabase/middleware";

describe("subdomainFor", () => {
  const root = "reiners.agency";

  it("resolve crm / app / apex / www", () => {
    expect(subdomainFor("crm.reiners.agency", root)).toBe("crm");
    expect(subdomainFor("app.reiners.agency", root)).toBe("app");
    expect(subdomainFor("reiners.agency", root)).toBeNull();
    expect(subdomainFor("www.reiners.agency", root)).toBeNull();
  });

  it("ignora porta e caixa alta", () => {
    expect(subdomainFor("CRM.Reiners.Agency:3000", root)).toBe("crm");
    expect(subdomainFor("app.reiners.agency:443", root)).toBe("app");
  });

  it("dev/preview sem raiz correspondente → null (roteamento por path)", () => {
    expect(subdomainFor("localhost:3000", root)).toBeNull();
    expect(subdomainFor("teste-git-x.vercel.app", root)).toBeNull();
    expect(subdomainFor("crm.reiners.agency", "")).toBeNull();
    expect(subdomainFor(null, root)).toBeNull();
    expect(subdomainFor("app.reiners.agency", null)).toBeNull();
  });

  it("subdomínio de cliente arbitrário", () => {
    expect(subdomainFor("biglar.reiners.agency", root)).toBe("biglar");
  });
});

describe("isCrmPassthrough", () => {
  it("passa direto o que já é rota final em crm.<root>", () => {
    expect(isCrmPassthrough("/app")).toBe(true);
    expect(isCrmPassthrough("/app/studio")).toBe(true);
    expect(isCrmPassthrough("/crm")).toBe(true);
    // /admin vive fora de /app — sem passthrough viraria /app/admin (404).
    expect(isCrmPassthrough("/admin")).toBe(true);
    expect(isCrmPassthrough("/admin/site")).toBe(true);
  });

  it("o resto entra na área logada (recebe o prefixo /app)", () => {
    expect(isCrmPassthrough("/contatos")).toBe(false);
    expect(isCrmPassthrough("/relatorios")).toBe(false);
    // Prefixo parecido não conta: /apps não é /app.
    expect(isCrmPassthrough("/apps")).toBe(false);
    expect(isCrmPassthrough("/administracao")).toBe(false);
  });
});
