import { NextResponse } from "next/server";
import { createClient as createAdminClient } from "@supabase/supabase-js";
import { Document, Page, Text, View, StyleSheet, renderToBuffer } from "@react-pdf/renderer";
import { getTenantDesign } from "@/lib/tenant-design";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const brl = (n: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(Number(n || 0));

// PDF real da proposta (gerado no servidor com @react-pdf/renderer, sem
// dependência paga nem Chromium). Design vem do design system do tenant
// (cores da marca + refinamento por LLM — ver lib/tenant-design.ts).
export async function GET(_req: Request, { params }: { params: { token: string } }) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return NextResponse.json({ error: "PDF indisponível: SUPABASE_SERVICE_ROLE_KEY ausente" }, { status: 503 });
  const db = createAdminClient(url, key);

  const { data: p } = await db.from("proposals").select("*").eq("share_token", params.token).maybeSingle();
  if (!p) return NextResponse.json({ error: "proposta não encontrada" }, { status: 404 });

  const [{ data: deal }, { data: org }] = await Promise.all([
    db.from("deals").select("title, contact:contacts(name, company)").eq("id", p.deal_id).maybeSingle(),
    db.from("orgs").select("name").eq("id", p.org_id).maybeSingle(),
  ]);
  const contact: any = Array.isArray((deal as any)?.contact) ? (deal as any).contact[0] : (deal as any)?.contact;
  const design = await getTenantDesign(p.org_id);

  const styles = StyleSheet.create({
    page: { padding: 40, fontSize: 10, color: "#0f172a", fontFamily: "Helvetica" },
    bar: { height: 6, backgroundColor: design.primary, marginBottom: 18 },
    org: { fontSize: 9, color: design.accent, letterSpacing: 1, textTransform: "uppercase", marginBottom: 4 },
    title: { fontSize: 18, fontWeight: "bold", color: design.primary },
    tagline: { fontSize: 9, color: "#64748b", marginTop: 2, marginBottom: 14 },
    meta: { fontSize: 9, color: "#64748b", marginBottom: 12 },
    summary: { fontSize: 10, lineHeight: 1.5, marginBottom: 16 },
    th: { flexDirection: "row", borderBottomWidth: 1, borderColor: design.primary, paddingBottom: 4, marginBottom: 4 },
    row: { flexDirection: "row", paddingVertical: 3, borderBottomWidth: 0.5, borderColor: "#e2e8f0" },
    cItem: { flex: 3 }, cNum: { flex: 1, textAlign: "right" },
    totals: { marginTop: 10, alignItems: "flex-end" },
    totalLine: { flexDirection: "row", width: 200, justifyContent: "space-between", paddingVertical: 2 },
    grand: { fontSize: 13, fontWeight: "bold", color: design.primary },
    terms: { marginTop: 20, fontSize: 8, color: "#64748b", lineHeight: 1.5 },
  });

  const items: any[] = Array.isArray(p.items) ? p.items : [];

  const doc = (
    <Document>
      <Page size="A4" style={styles.page}>
        <View style={styles.bar} />
        <Text style={styles.org}>{design.heading || org?.name || "Proposta"}</Text>
        <Text style={styles.title}>{deal?.title || "Proposta comercial"}</Text>
        <Text style={styles.tagline}>{design.tagline}</Text>
        <Text style={styles.meta}>
          {[contact?.name, contact?.company, org?.name].filter(Boolean).join("  ·  ")}
        </Text>

        {p.summary ? <Text style={styles.summary}>{p.summary}</Text> : null}

        <View style={styles.th}>
          <Text style={styles.cItem}>Item</Text>
          <Text style={styles.cNum}>Qtd</Text>
          <Text style={styles.cNum}>Valor</Text>
          <Text style={styles.cNum}>Total</Text>
        </View>
        {items.map((it, i) => {
          const qty = Number(it.qty ?? 1);
          const price = Number(it.unitPrice ?? it.price ?? 0);
          const total = Number(it.total ?? qty * price);
          return (
            <View style={styles.row} key={i}>
              <Text style={styles.cItem}>{it.name ?? "Item"}</Text>
              <Text style={styles.cNum}>{qty}</Text>
              <Text style={styles.cNum}>{brl(price)}</Text>
              <Text style={styles.cNum}>{brl(total)}</Text>
            </View>
          );
        })}

        <View style={styles.totals}>
          <View style={styles.totalLine}><Text>Subtotal</Text><Text>{brl(p.subtotal)}</Text></View>
          {Number(p.discount_pct) > 0 ? (
            <View style={styles.totalLine}><Text>Desconto</Text><Text>-{p.discount_pct}%</Text></View>
          ) : null}
          <View style={styles.totalLine}><Text style={styles.grand}>Total</Text><Text style={styles.grand}>{brl(p.total)}</Text></View>
        </View>

        {p.terms ? <Text style={styles.terms}>{p.terms}</Text> : null}
      </Page>
    </Document>
  );

  const buffer = await renderToBuffer(doc);
  return new NextResponse(buffer as any, {
    headers: {
      "content-type": "application/pdf",
      "content-disposition": `inline; filename="proposta-${params.token.slice(0, 8)}.pdf"`,
    },
  });
}
