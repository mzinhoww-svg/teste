// Regras puras da central de disparo: sem DOM, sem estado global. O chamador passa tudo que a regra precisa.
var Regras = (function () {
  "use strict";
  var DIA = 86400000;
  var DIAS_SEMANA = ["domingo", "segunda", "terça", "quarta", "quinta", "sexta", "sábado"];

  function inicioDoDia(d) { var x = new Date(d); x.setHours(0, 0, 0, 0); return x; }
  function dataCurta(d) {
    var x = new Date(d);
    if (isNaN(x)) return "";
    return x.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
  }
  // "2026-10-09T14:00" -> "quinta, 09/10, às 14h"
  function quando(valor) {
    if (!valor) return "";
    var d = new Date(valor);
    if (isNaN(d)) return "";
    var h = d.getHours() + "h" + (d.getMinutes() ? String(d.getMinutes()).padStart(2, "0") : "");
    return DIAS_SEMANA[d.getDay()] + ", " + dataCurta(d) + ", às " + h;
  }
  function waLink(tel, texto) { return "https://wa.me/" + tel + "?text=" + encodeURIComponent(texto); }
  // "5565999991111" -> "+55 (65) 99999-1111"; fixo "556530000000" -> "+55 (65) 3000-0000"
  function telefoneFormatado(d) {
    var n = String(d || "").replace(/\D/g, "");
    var m = /^55(\d{2})(\d{4,5})(\d{4})$/.exec(n);
    return m ? "+55 (" + m[1] + ") " + m[2] + "-" + m[3] : n;
  }

  // ---------- aquecimento ----------
  function etapa(l) { return Number(l.etapa) || 0; }
  function espera(esperaDias, n) { return Number((esperaDias || {})[String(n)]) || 0; }
  function vencimento(l, esperaDias) {
    var e = etapa(l);
    if (e >= 3) return null;
    if (e === 0) return inicioDoDia(new Date(0));
    var ultimo = l["enviado" + e];
    if (!ultimo) return inicioDoDia(new Date(0));
    return new Date(inicioDoDia(ultimo).getTime() + espera(esperaDias, e + 1) * DIA);
  }
  function grupo(l, esperaDias, agora) {
    if (l.situacao === "fechou") return "fechou";
    if (l.situacao === "respondeu") return "respondeu";
    if (l.situacao === "sair") return "sair";
    if (etapa(l) >= 3) return "encerrado";
    // Na cadência sem destino (lead migrado sem enriquecer): fica fora de "Para hoje" e da meta até ter telefone ou e-mail.
    if ((!l.situacao || l.situacao === "ativo") && !temDestino(l)) return "semcontato";
    var v = vencimento(l, esperaDias);
    return v && v.getTime() <= inicioDoDia(agora).getTime() ? "hoje" : "aguardando";
  }
  function toque(l, n) { return (l.toques || []).filter(function (t) { return Number(t.n) === n; })[0] || {}; }

  // ---------- contato da cadência ----------
  function contatoAtivo(l) {
    if (!l.contatoAtivo) return null;
    return (l.contatos || []).filter(function (c) { return c.id === l.contatoAtivo; })[0] || null;
  }
  function primeiroNome(nome) {
    var partes = String(nome || "").trim().split(/\s+/);
    if (!partes[0]) return "";
    if (/^(dr|dra)\.?$/i.test(partes[0]) && partes[1]) return partes[0].replace(/\.?$/, ".") + " " + partes[1];
    return partes[0].charAt(0).toUpperCase() + partes[0].slice(1).toLowerCase();
  }
  function comSaudacao(l, msg) {
    var c = contatoAtivo(l);
    if (!c || !c.nome || !l.saudacao) return msg;
    return msg.replace("Oi, " + l.saudacao + ",", "Oi, " + primeiroNome(c.nome) + ",");
  }
  function telefoneDestino(l) {
    var c = contatoAtivo(l);
    return c && c.telefone ? c.telefone : l.telefone;
  }
  function emailDestino(l) {
    var c = contatoAtivo(l);
    return c && c.email ? c.email : l.email;
  }
  // Destino que serve ao canal: e-mail no canal E-mail, telefone (o do contato ativo ou o do lead) nos outros.
  function temDestino(l) {
    var d = l.canal === "E-mail" ? emailDestino(l) : telefoneDestino(l);
    return !!String(d || "").trim();
  }

  // Contato achado (pelo enriquecimento ou à mão) que serviria ao canal, mas que ainda não foi escolhido para a
  // cadência: o decisor primeiro. A regra é dela: nada passa a contatoAtivo sozinho.
  function contatoEncontrado(l) {
    var campo = l.canal === "E-mail" ? "email" : "telefone";
    var uteis = (l.contatos || []).filter(function (c) { return c.id !== l.contatoAtivo && !c.invalido && String(c[campo] || "").trim(); });
    return uteis.filter(function (c) { return c.papel === "decisor"; })[0] || uteis[0] || null;
  }

  // ---------- foto do toque 1 ----------
  function fotoDe(l, fotos) {
    var cat = fotos || {};
    var id = l.fotoEscolhida && cat[l.fotoEscolhida] ? l.fotoEscolhida : l.foto;
    return id && cat[id] ? { id: id, dados: cat[id] } : null;
  }
  function mensagemToque(l, t, fotos) {
    var msg = comSaudacao(l, t.mensagem || "");
    var cat = fotos || {}, f = fotoDe(l, cat);
    if (Number(t.n) === 1 && f && l.foto && f.id !== l.foto && cat[l.foto]) {
      msg = msg.replace(cat[l.foto].linha, f.dados.linha);
    }
    return msg;
  }
  function linkToque(l, t, fotos) {
    var msg = mensagemToque(l, t, fotos), tel = telefoneDestino(l);
    // toque semeado sem link (lead migrado sem telefone que ganhou um depois): monta o link na hora
    return (msg === t.mensagem && tel === l.telefone && t.waLink) ? t.waLink : (tel ? waLink(tel, msg) : "");
  }

  // Próximo item que vence hoje depois de idAtual; se não houver, o primeiro antes dele; senão null.
  // O card TESTE (WhatsApp da própria Reiners) nunca é o próximo do dia.
  function proximoDoDia(fila, idAtual, grupoDe) {
    var i = -1, k;
    var vale = function (x) { return x.id !== "TESTE" && grupoDe(x) === "hoje"; };
    for (k = 0; k < fila.length; k++) { if (fila[k].id === idAtual) { i = k; break; } }
    for (k = i + 1; k < fila.length; k++) { if (vale(fila[k])) return fila[k].id; }
    for (k = 0; k < i; k++) { if (vale(fila[k])) return fila[k].id; }
    return null;
  }

  function ordenarLeads(a, b, abaAtual, esperaDias) {
    if (a.id === "TESTE") return -1;
    if (b.id === "TESTE") return 1;
    var ea = etapa(a) > 0 ? 0 : 1, eb = etapa(b) > 0 ? 0 : 1;
    if (abaAtual === "hoje" && ea !== eb) return ea - eb;
    if (abaAtual === "aguardando") {
      var va = vencimento(a, esperaDias), vb = vencimento(b, esperaDias);
      if (va && vb && va.getTime() !== vb.getTime()) return va - vb;
    }
    return (a.ordem || 9999) - (b.ordem || 9999);
  }

  // ---------- pós-venda ----------
  function etapaPV(c) { return Math.max(1, Number(c.etapa) || 1); }
  function defEtapa(etapas, n) { return (etapas || [])[n - 1] || null; }
  function textoPV(c, n, cfg) {
    var e = cfg && defEtapa(cfg.etapas, n);
    if (!cfg || !e) return "";
    var p = cfg.produtos[c.produto] || cfg.produtos["Outro"] || {};
    var preparo = c.produto === "Podcast In Loco" ? cfg.preparo.sede : cfg.preparo.estudio;
    var rec = cfg.recorrencia[c.produto] || cfg.recorrencia.padrao;
    var valores = {
      saudacao: c.saudacao || "", produto: c.produto || "", quando: quando(e.campoData ? c[e.campoData] : ""),
      local: p.local || "", entregaveis: p.entregaveis || "", preparo: preparo || "", recorrencia: rec || ""
    };
    return e.texto.replace(/\{(\w+)\}/g, function (m, k) { return k in valores ? valores[k] : m; });
  }
  // Quando a mensagem da etapa atual deve sair; null = depende de data que ainda não foi marcada.
  function vencimentoPV(c, etapas) {
    var n = etapaPV(c), e = defEtapa(etapas, n);
    if (!e) return null;
    if (e.quando === "imediato") return new Date(0);
    if (e.quando === "data") {
      var d = c[e.campoData];
      if (!d) return null;
      return e.vespera ? new Date(inicioDoDia(d).getTime() - DIA) : new Date(0);
    }
    var anterior = c["pvConcluido" + (n - 1)];
    return anterior ? new Date(inicioDoDia(anterior).getTime() + Number(e.quando) * DIA) : new Date(0);
  }
  function grupoPV(c, etapas, agora) {
    if (c.situacao === "pausado") return "pausado";
    if (c.situacao === "concluido" || etapaPV(c) > (etapas || []).length) return "concluido";
    var n = etapaPV(c);
    if (c["pvEnviado" + n]) return "andamento";
    var v = vencimentoPV(c, etapas);
    if (v === null) return "hoje"; // falta marcar a data: é a ação do dia
    return v.getTime() <= inicioDoDia(agora).getTime() ? "hoje" : "andamento";
  }
  function ordenarClientes(a, b, etapas) {
    var pa = a.situacao === "pausado" ? 1 : 0, pb = b.situacao === "pausado" ? 1 : 0;
    if (pa !== pb) return pa - pb;
    var va = vencimentoPV(a, etapas), vb = vencimentoPV(b, etapas);
    var ta = va ? va.getTime() : -1, tb = vb ? vb.getTime() : -1;
    if (ta !== tb) return ta - tb;
    return String(a.criadoEm || "").localeCompare(String(b.criadoEm || ""));
  }

  // Histórico: devolve novo array com a linha acrescentada, guardando as últimas 100.
  function registrar(historico, texto, tipo, agora) {
    var item = { em: agora.toISOString(), texto: texto };
    if (tipo) item.tipo = tipo;
    return (historico || []).concat([item]).slice(-100);
  }

  // Busca da central: nome, CNPJ, pessoa e contato (lead ou cliente). Sem acento e sem caixa; CNPJ e telefone casam também só pelos dígitos.
  function semAcento(t) { return String(t == null ? "" : t).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase(); }
  function casaBusca(item, busca) {
    var q = semAcento(busca).trim();
    if (!q) return true;
    var e = item.empresa || {};
    var partes = [item.nome, item.id, item.saudacao, item.email, item.telefone, item.cnpj, e.cnpj, e.razaoSocial]
      .concat((item.decisores || []).map(function (d) { return d.nome; }))
      .concat((item.contatos || []).reduce(function (a, c) { return a.concat([c.nome, c.email, c.telefone]); }, []));
    var alvo = partes.map(semAcento).join(" | ");
    if (alvo.indexOf(q) >= 0) return true;
    var dig = q.replace(/\D/g, "");
    if (dig.length < 3) return false;
    var numeros = [item.id, item.telefone, item.cnpj, e.cnpj].concat((item.contatos || []).map(function (c) { return c.telefone; }));
    return numeros.some(function (n) { return String(n == null ? "" : n).replace(/\D/g, "").indexOf(dig) >= 0; });
  }

  // ---------- enriquecimento (config/enriquecimento) ----------
  // Dinheiro em micro-dólar: 130000 -> "US$ 0,13".
  function dinheiroMicro(m) {
    var v = Number(m) || 0;
    return "US$ " + (v / 1e6).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }
  // Taxa de acerto: 0.333 -> "33%"; sem taxa -> "—".
  function porcento(taxa) {
    if (taxa == null || taxa === "" || isNaN(Number(taxa))) return "—";
    var v = Number(taxa);
    if (v <= 1) v *= 100;
    return Math.round(v) + "%";
  }
  var MOTIVOS = {
    "saldo insuficiente": "Parou: saldo insuficiente. Precisa recarregar o treg.",
    "acerto abaixo de 30%": "Parou: o acerto ficou abaixo de 30%, então não valia seguir pagando.",
    "teto de US$10": "Parou: chegou ao teto de US$ 10 desta execução.",
    "erros consecutivos": "Parou: o treg deu erro várias vezes seguidas. Vale tentar de novo mais tarde."
  };
  function motivoParada(m) {
    if (!m) return "Parou antes de terminar.";
    return MOTIVOS[m] || "Parou: " + String(m).replace(/\.$/, "") + ".";
  }
  // Enquanto o pedido espera o Claude ou a execução roda, não cabe outro pedido.
  function enriqOcupado(status) { return status === "pedido" || status === "estimando" || status === "executando"; }

  // ---------- Base (coleção base: faixas B e C da Explee) ----------
  var LOTE_BASE = 50;  // teto de pedidos por clique no botão dos filtrados
  function statusBase(d) { return d.status === "pedido" || d.status === "na_cadencia" ? d.status : "base"; }
  function casaBase(d, busca) {
    var q = semAcento(busca).trim();
    if (!q) return true;
    var dec = d.decisor || {};
    return [d.nome, d.dominio, d.id, d.segmento, dec.nome, dec.cargo].map(semAcento).join(" | ").indexOf(q) >= 0;
  }
  // Faixa, depois score maior, depois nome.
  function ordenarBase(a, b) {
    return String(a.tier || "").localeCompare(String(b.tier || "")) || (Number(b.score) || 0) - (Number(a.score) || 0) ||
      String(a.nome || "").localeCompare(String(b.nome || ""), "pt-BR");
  }
  // f = { grupo: "todos"|"base"|"pedido"|"na_cadencia", segmento, faixa, persona }
  function filtrarBase(lista, f, busca) {
    return lista.filter(function (d) {
      if (f.grupo && f.grupo !== "todos" && statusBase(d) !== f.grupo) return false;
      if (f.segmento && d.segmento !== f.segmento) return false;
      if (f.faixa && d.tier !== f.faixa) return false;
      if (f.persona && (d.decisor || {}).persona !== f.persona) return false;
      return casaBase(d, busca);
    });
  }
  // Quem do filtro ainda pode ser pedido, já no teto de um clique.
  function loteBase(filtrados) {
    var livres = filtrados.filter(function (d) { return statusBase(d) === "base"; });
    return { total: livres.length, ids: livres.slice(0, LOTE_BASE).map(function (d) { return d.id; }) };
  }

  return {
    LOTE_BASE: LOTE_BASE, statusBase: statusBase, casaBase: casaBase, ordenarBase: ordenarBase, filtrarBase: filtrarBase, loteBase: loteBase,
    dinheiroMicro: dinheiroMicro, porcento: porcento, motivoParada: motivoParada, enriqOcupado: enriqOcupado,
    casaBusca: casaBusca, DIA: DIA, inicioDoDia: inicioDoDia, dataCurta: dataCurta, quando: quando, waLink: waLink, telefoneFormatado: telefoneFormatado,
    etapa: etapa, vencimento: vencimento, grupo: grupo, toque: toque,
    contatoAtivo: contatoAtivo, primeiroNome: primeiroNome, comSaudacao: comSaudacao,
    contatoEncontrado: contatoEncontrado, telefoneDestino: telefoneDestino, emailDestino: emailDestino, temDestino: temDestino, fotoDe: fotoDe,
    mensagemToque: mensagemToque, linkToque: linkToque, proximoDoDia: proximoDoDia, ordenarLeads: ordenarLeads,
    etapaPV: etapaPV, vencimentoPV: vencimentoPV, grupoPV: grupoPV, textoPV: textoPV, ordenarClientes: ordenarClientes,
    registrar: registrar
  };
})();
if (typeof module !== "undefined") module.exports = Regras; else window.Regras = Regras;
