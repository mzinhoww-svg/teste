import { describe, it, expect } from "vitest";
import { subdomainFor } from "@/lib/supabase/middleware";

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
