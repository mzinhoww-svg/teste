(function () {
  "use strict";
  var NOMES_TOQUE = { 1: "Visita", 2: "Diagnóstico", 3: "Piloto" };
  var DIA = Regras.DIA;
  var ABAS = {
    aq: [["hoje", "Para hoje"], ["aguardando", "Aguardando"], ["respondeu", "Responderam"], ["fechou", "Fecharam"],
         ["encerrado", "Sem resposta"], ["sair", "Saíram"], ["todos", "Todos"]],
    pv: [["hoje", "Para hoje"], ["andamento", "Em andamento"], ["pausado", "Pausados"], ["concluido", "Concluídos"], ["todos", "Todos"]],
    ld: [["todos", "Todos"], ["completo", "Completos"], ["parcial", "Parciais"], ["bruto", "Sem enriquecimento"], ["setor", "Contato de setor"]]
  };
  var PAPEIS = { decisor: "Decisor", comunicacao: "Comunicação", secretaria: "Secretaria", comercial: "Comercial", geral: "Geral", setor: "Setor" };
  var estado = {
    funil: "aq",
    leads: {},
    clientes: {},
    meta: { metaDiaria: 20, esperaDias: { "1": 0, "2": 4, "3": 6 } },
    pv: null,
    fotos: null,
    downloads: null,
    db: null,
    podeMarcar: false,
    gravando: {},
    carregado: { leads: false, clientes: false },
    fechando: null,
    novoCliente: false,
    filtro: {
      aq: { grupo: "hoje", segmento: "", faixa: "", canal: "" },
      pv: { grupo: "hoje", etapa: "", produto: "" },
      ld: { grupo: "todos", segmento: "" }
    },
    busca: "",                                      // só em memória; vale para os três funis
    novoContato: null,
    sel: { aq: null, pv: null, ld: null },          // um item selecionado por funil
    selIni: { aq: false, pv: false, ld: false },    // a seleção salva já foi conferida com a fila?
    abaDetalhe: { aq: "perfil", pv: "etapa", ld: "perfil" },
    visiveis: { aq: [], pv: [], ld: [] },
    ordemLD: { col: null, dir: "asc" },
    confirmarSair: null,
    rascunho: {}
  };
  var $ = function (id) { return document.getElementById(id); };
  function sel() { return estado.sel[estado.funil]; }
  function aba() { return estado.abaDetalhe[estado.funil]; }

  // ---------- utilidades ----------
  function el(tag, attrs, filhos) {
    var n = document.createElement(tag);
    if (attrs) Object.keys(attrs).forEach(function (k) {
      if (k === "text") n.textContent = attrs[k];
      else if (k === "class") n.className = attrs[k];
      else if (k === "value") n.value = attrs[k];
      else if (k.slice(0, 2) === "on") n.addEventListener(k.slice(2), attrs[k]);
      else if (attrs[k] !== null && attrs[k] !== undefined && attrs[k] !== false) n.setAttribute(k, attrs[k]);
    });
    (filhos || []).forEach(function (f) { if (f) n.appendChild(typeof f === "string" ? document.createTextNode(f) : f); });
    // Formulários sobrevivem ao redesenho: o que foi digitado volta do rascunho.
    if (n.id && /^(nc|nk|nh)-/.test(n.id) && estado.rascunho[n.id] != null) n.value = estado.rascunho[n.id];
    return n;
  }
  var inicioDoDia = Regras.inicioDoDia;
  function hoje() { return inicioDoDia(new Date()); }
  function mesmoDia(iso, ref) { return iso && inicioDoDia(iso).getTime() === inicioDoDia(ref).getTime(); }
  var dataCurta = Regras.dataCurta;
  var quando = Regras.quando;
  var toastTimer;
  var DESFAZER_MS = 8000;
  function toast(txt, conteudo, ms) {
    var t = $("toast");
    t.textContent = ""; t.hidden = false;
    if (conteudo) { t.appendChild(document.createTextNode(txt)); t.appendChild(conteudo); } else t.textContent = txt;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.hidden = true; }, ms || 2400);
  }
  function copiar(texto, rotulo) {
    function reserva() {
      var ta = el("textarea", { readonly: "", "aria-hidden": "true" });
      ta.value = texto;
      ta.style.position = "fixed"; ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      var ok = false;
      try { ok = document.execCommand("copy"); } catch (e) { ok = false; }
      document.body.removeChild(ta);
      toast(ok ? rotulo + " copiado" : "Não deu para copiar. Abra a mensagem e selecione o texto.");
    }
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(texto).then(function () { toast(rotulo + " copiado"); }, reserva);
    } else { reserva(); }
  }
  var waLink = Regras.waLink;
  function mailto(email, assunto, corpo) {
    return "mailto:" + encodeURIComponent(email || "") + "?subject=" + encodeURIComponent(assunto || "") +
      "&body=" + encodeURIComponent(corpo || "");
  }
  function limparTelefone(v) {
    var d = String(v || "").replace(/\D/g, "").replace(/^0+/, "");
    if (d.length === 10 || d.length === 11) d = "55" + d;
    return /^55\d{10,11}$/.test(d) ? d : "";
  }
  function limparRascunho(prefixo) {
    Object.keys(estado.rascunho).forEach(function (k) { if (k.indexOf(prefixo) === 0) delete estado.rascunho[k]; });
  }
  function preencherSelect(id, valores) {
    var s = $(id), atual = s.value, chave = valores.join("|");
    if (s.dataset.chave === chave) return;
    s.dataset.chave = chave;
    while (s.options.length > 1) s.remove(1);
    valores.forEach(function (v) { s.add(new Option(v, v)); });
    s.value = valores.indexOf(atual) >= 0 ? atual : "";
  }

  // ---------- escrita ----------
  function falhou(e) {
    var code = e && e.code;
    if (code === "revoked" || code === "not_granted" || code === "capability_disabled" || code === "capability_removed") {
      desligar("A conexão com o banco caiu. Copiar e abrir mensagens continua funcionando; a marcação foi desativada.");
    } else if (code === "invalid_argument") {
      desligar("Sua conta pode ver a central, mas não pode marcar envios. Copiar e abrir mensagens continua funcionando.");
    } else if (code === "quota_exceeded") {
      toast("O banco da central está cheio. Avise o Claude para liberar espaço.");
    } else {
      toast("Não foi possível salvar. Tente de novo em instantes.");
    }
  }
  function gravar(caminho, dados, msg, criar) {
    if (!estado.podeMarcar || estado.gravando[caminho]) return Promise.resolve(false);
    estado.gravando[caminho] = true;
    render();
    var ref = estado.db.doc(caminho);
    return (criar ? ref.set(dados) : ref.update(dados)).then(function () { if (msg) toast(msg); return true; },
      function (e) { falhou(e); return false; })
      .then(function (ok) { delete estado.gravando[caminho]; render(); return ok; });
  }
  function desligar(msg) {
    estado.podeMarcar = false;
    $("aviso").textContent = msg;
    $("aviso").hidden = false;
    $("conexao").className = "conexao";
    $("conexao").textContent = "Sem banco";
    render();
  }

  // ================= AQUECIMENTO =================
  var etapa = Regras.etapa;
  function vencimento(l) { return Regras.vencimento(l, estado.meta.esperaDias); }
  function espera(n) { var e = estado.meta.esperaDias || {}; return Number(e[String(n)]) || 0; }
  function grupo(l) { return Regras.grupo(l, estado.meta.esperaDias, new Date()); }
  var toque = Regras.toque;

  // Envio de um clique (WhatsApp e e-mail): o link abre no navegador; aqui só marca, avisa com Desfazer e avança.
  function enviar(l) {
    if (!estado.podeMarcar || estado.gravando["leads/" + l.id]) return;
    var n = Math.min(etapa(l) + 1, 3);
    var fila = estado.visiveis.aq;
    var dados = { etapa: n };
    dados["enviado" + n] = new Date().toISOString();
    gravar("leads/" + l.id, registrar(l, dados, "Toque " + n + " enviado")).then(function (ok) {
      if (!ok) return;  // falha: o erro já foi avisado e a seleção fica onde está
      avisoDesfazer(l, n);
      var prox = estado.funil === "aq" ? Regras.proximoDoDia(fila, l.id, grupo) : null;  // fora do Aquecimento o envio não mexe na seleção
      if (prox) selecionar(prox);
    });
  }
  // Aviso de 8 segundos com Desfazer, igual para Aquecimento e pós-venda.
  function avisoComDesfazer(texto, desfazer) {
    var b = el("button", { type: "button", class: "desfazer", onclick: desfazer }, ["Desfazer"]);
    toast(texto + " · ", b, DESFAZER_MS);
  }
  function avisoDesfazer(l, n) { avisoComDesfazer("Toque " + n + " marcado", function () { desfazerToque(l, n); }); }
  // n = o toque que o aviso ou a linha do histórico promete desfazer; se o lead já andou, não desfaz outro.
  function desfazerToque(l, n) {
    var atual = estado.leads[l.id] || l;
    var e = etapa(atual);
    $("toast").hidden = true;
    if (e < 1 || (n != null && e !== n)) { toast("Nada a desfazer"); return; }
    var dados = { etapa: e - 1 };
    dados["enviado" + e] = null;
    gravar("leads/" + l.id, registrar(atual, dados, "Toque " + e + " desfeito")).then(function (ok) {
      if (ok) selecionar(l.id);
    });
  }
  // Histórico do lead: cada ação da central entra como uma linha com data. Os envios vêm de enviado1..3.
  function registrar(l, dados, texto, tipo) {
    var item = { em: new Date().toISOString(), texto: texto };
    if (tipo) item.tipo = tipo;
    dados.historico = (l.historico || []).concat([item]).slice(-100);
    return dados;
  }
  var SITUACOES = { respondeu: "Marcado como respondeu", sair: "Pediu para sair", ativo: "Voltou para a cadência", fechou: "Fechou negócio" };
  function situacao(l, s, msg) { return comVizinho(l, function () { return gravar("leads/" + l.id, registrar(l, { situacao: s }, SITUACOES[s] || s), msg); }); }

  function fecharNegocio(l, produto) {
    var cliente = {
      nome: l.nome || "", saudacao: l.saudacao || "", telefone: l.canal === "WhatsApp" ? (l.telefone || "") : "",
      email: l.email || "", produto: produto, origem: "Prospecção", leadId: l.id, segmento: l.segmento || "",
      etapa: 1, situacao: "ativo", criadoEm: new Date().toISOString(), dataKickoff: null, dataGravacao: null
    };
    gravar("clientes/" + l.id, cliente, null, true).then(function (ok) {
      if (!ok) return;
      estado.fechando = null;
      comVizinho(l, function () { return gravar("leads/" + l.id, registrar(l, { situacao: "fechou" }, "Fechou negócio: " + produto), "Foi para o pós-venda: boas-vindas para hoje"); });
    });
  }

  function trilho(l) {
    var e = etapa(l), g = grupo(l), v = vencimento(l);
    return el("div", { class: "passos", "aria-label": "Cadência" }, [1, 2, 3].map(function (n) {
      var feito = n <= e, agora = !feito && n === e + 1 && (g === "hoje" || g === "aguardando");
      var sub = feito ? "Enviado " + dataCurta(l["enviado" + n]) :
        agora ? (g === "hoje" ? "Enviar hoje" : "A partir de " + dataCurta(v)) : "";
      return el("div", { class: "passo" + (feito ? " feito" : "") + (agora ? " agora" : "") }, [
        el("b", { text: n + " · " + NOMES_TOQUE[n] }), el("span", { text: sub || " " })
      ]);
    }));
  }

  function formFechar(l) {
    var produtos = Object.keys((estado.pv && estado.pv.produtos) || { "Outro": 1 });
    var sel = el("select", { id: "fechar-produto-" + l.id }, produtos.map(function (p) { return el("option", { value: p, text: p }); }));
    return el("div", { class: "acoes" }, [
      el("label", { class: "campo", for: "fechar-produto-" + l.id }, ["Produto contratado", sel]),
      el("button", { type: "button", class: "btn principal", disabled: !estado.podeMarcar,
        onclick: function () { fecharNegocio(l, sel.value); } }, ["Mover para o pós-venda"]),
      el("button", { type: "button", class: "btn", onclick: function () { estado.fechando = null; render(); } }, ["Cancelar"])
    ]);
  }

  // ---------- contato da cadência ----------
  // Por padrão a cadência usa o telefone/e-mail do lead; "Usar na cadência" escolhe outro contato.
  var contatoAtivo = Regras.contatoAtivo;
  var primeiroNome = Regras.primeiroNome;
  var comSaudacao = Regras.comSaudacao;
  var telefoneDestino = Regras.telefoneDestino;
  var emailDestino = Regras.emailDestino;

  // ---------- foto do toque 1 ----------
  function fotoDe(l) { return Regras.fotoDe(l, estado.fotos); }
  function mensagemToque(l, t) { return Regras.mensagemToque(l, t, estado.fotos); }
  function linkToque(l, t) { return Regras.linkToque(l, t, estado.fotos); }
  function salvarFoto(f) {
    if (!estado.downloads) return;
    fetch(f.dados.arquivo).then(function (r) { if (!r.ok) throw new Error("foto"); return r.blob(); })
      .then(function (blob) {
        return estado.downloads.save({ filename: "reiners-" + f.id + ".jpg", data: blob });
      })
      .then(function () { toast("Foto salva"); }, function (e) {
        var code = e && e.code;
        if (code === "declined") return;
        if (code === "rate_limited") { toast("Já tem um download aberto. Confirme ou feche e tente de novo."); return; }
        toast("Não deu para salvar por aqui. Toque e segure a foto para salvar.");
      });
  }
  function blocoFoto(l, semMarca) {
    var f = fotoDe(l), cat = estado.fotos || {};
    if (!f) return null;
    var opcoes = Object.keys(cat).sort(function (a, b) { return cat[a].cenario.localeCompare(cat[b].cenario) || a.localeCompare(b); });
    var sel = el("select", { id: "foto-" + l.id, disabled: semMarca,
      onchange: function (ev) { gravar("leads/" + l.id, registrar(l, { fotoEscolhida: ev.target.value === l.foto ? null : ev.target.value }, "Foto do toque 1 trocada para " + ((cat[ev.target.value] || {}).cenario || ev.target.value)), "Foto trocada"); } },
      opcoes.map(function (k) {
        return el("option", { value: k, text: cat[k].cenario + " · " + cat[k].descricao + (k === l.foto ? " (sugerida)" : "") });
      }));
    sel.value = f.id;
    var passos = el("ol", null, [
      el("li", { text: estado.downloads ? "Salve a foto (ou toque e segure a imagem)." : "Toque e segure a imagem para salvar." }),
      el("li", { text: "Abra o WhatsApp: a mensagem já vai escrita." }),
      el("li", { text: "Envie a foto pelo + e, em seguida, a mensagem." })
    ]);
    return el("figure", { class: "foto" }, [
      el("a", { class: "img", href: f.dados.arquivo, target: "_blank", rel: "noopener", "aria-label": "Abrir a foto em tamanho cheio" }, [
        el("img", { src: f.dados.arquivo, alt: f.dados.descricao, loading: "lazy", width: "1067", height: "1600" })
      ]),
      el("figcaption", null, [
        el("b", { text: "Foto do cenário " + f.dados.cenario }),
        el("label", { class: "campo", for: sel.id }, ["Trocar foto", sel]),
        passos,
        estado.downloads ? el("button", { type: "button", class: "btn", onclick: function () { salvarFoto(f); } }, ["Salvar foto"]) : null
      ])
    ]);
  }

  function mailtoToque(l, t) {
    var ca = contatoAtivo(l);
    return mailto(emailDestino(l), t.assunto, comSaudacao(l, t.corpo || "").replace("Olá, " + l.saudacao + ",", "Olá, " + (ca && ca.nome ? primeiroNome(ca.nome) : l.saudacao) + ","));
  }

  // Detalhe do lead selecionado: o topo decide o toque (mensagem, destino, Enviar, Copiar, foto, Resultado);
  // o que ajuda a decidir vem em três abas: Perfil, Cadência e Histórico.
  function destinoDe(l, email) {
    if (email) return emailDestino(l) || "";
    var t = telefoneDestino(l);
    return t ? Regras.telefoneFormatado(t) : "";
  }
  // Próxima linha da fila visível depois desta; se ela era a última, a anterior. O card de teste não conta.
  function vizinhoNaFila(id) {
    var fila = estado.visiveis[estado.funil].filter(function (x) { return x.id !== "TESTE"; });
    var i = fila.map(function (x) { return x.id; }).indexOf(id);
    if (i < 0) return null;
    var v = fila[i + 1] || fila[i - 1];
    return v ? v.id : null;
  }
  // Roda uma gravação que pode tirar o lead do filtro; se tirou e deu certo, a seleção vai para o vizinho.
  function comVizinho(l, gravacao) {
    var viz = vizinhoNaFila(l.id);
    return gravacao().then(function (ok) {
      var ainda = estado.visiveis[estado.funil].some(function (x) { return x.id === l.id; });
      if (ok && viz && !ainda && sel() === l.id) selecionar(viz);
      return ok;
    });
  }
  function resultado(l, g, semMarca) {
    var b = function (id, txt, fn, cls) {
      return el("button", { type: "button", id: id + "-" + l.id, class: "btn" + (cls ? " " + cls : ""), disabled: semMarca, onclick: fn }, [txt]);
    };
    var filhos;
    if (g === "hoje" || g === "aguardando" || g === "encerrado") {
      if (estado.confirmarSair === l.id) {
        filhos = [
          b("r-sair-ok", "Confirmar saída", function () { estado.confirmarSair = null; situacao(l, "sair", "Não contatar de novo"); }, "alerta"),
          b("r-sair-nao", "Cancelar", function () { estado.confirmarSair = null; render(); $("r-sair-" + l.id) && $("r-sair-" + l.id).focus(); })
        ];
      } else {
        filhos = [
          b("r-resp", "Respondeu", function () { situacao(l, "respondeu", "Marcado como respondeu"); }),
          b("r-fecha", "Fechou negócio", function () { estado.fechando = l.id; render(); }),
          b("r-sair", "Pediu para sair", function () { estado.confirmarSair = l.id; render(); $("r-sair-nao-" + l.id) && $("r-sair-nao-" + l.id).focus(); })
        ];
      }
    } else if (g === "fechou") {
      filhos = [b("r-pv", "Ver no pós-venda", function () { if (estado.clientes[l.id]) guardarSel("pv", l.id); trocarFunil("pv"); })];
      filhos[0].disabled = false;
    } else {
      filhos = [b("r-volta", "Voltar para a cadência", function () { situacao(l, "ativo", "De volta à cadência"); })];
    }
    return el("div", { class: "resultado", role: "group", "aria-label": "Resultado" }, filhos);
  }

  var ABAS_DETALHE = {
    aq: [["perfil", "Perfil"], ["cadencia", "Cadência"], ["historico", "Histórico"]],
    ld: [["perfil", "Perfil"], ["cadencia", "Cadência"], ["historico", "Histórico"]],
    pv: [["etapa", "Etapa"], ["cliente", "Cliente"], ["historico", "Histórico"]]
  };
  // Abas do detalhe: lista e foco por teclado são comuns; conteudo(k) devolve o painel da aba escolhida.
  function abasDetalhe(rotulo, conteudo) {
    var lista = ABAS_DETALHE[estado.funil], atual = aba();
    function ir(k, foco) {
      estado.abaDetalhe[estado.funil] = k;
      render();
      if (foco && $("tab-" + k)) $("tab-" + k).focus();
    }
    var tabs = el("div", { class: "abas-detalhe", role: "tablist", "aria-label": rotulo }, lista.map(function (a, i) {
      return el("button", { type: "button", role: "tab", id: "tab-" + a[0], class: "aba", "aria-selected": String(a[0] === atual),
        "aria-controls": "painel-detalhe", tabindex: a[0] === atual ? "0" : "-1",
        onclick: function () { ir(a[0], false); },
        onkeydown: function (e) {
          var d = e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : 0, alvo = null;
          if (d) alvo = lista[(i + d + lista.length) % lista.length][0];
          else if (e.key === "Home") alvo = lista[0][0];
          else if (e.key === "End") alvo = lista[lista.length - 1][0];
          if (alvo) { e.preventDefault(); ir(alvo, true); }
        } }, [a[1]]);
    }));
    return [tabs, el("div", { role: "tabpanel", tabindex: "0", id: "painel-detalhe", "aria-labelledby": "tab-" + atual, class: "painel" }, [conteudo(atual)])];
  }
  function abasLead(l) {
    return abasDetalhe("Sobre o lead", function (atual) {
      if (atual === "cadencia") return el("div", { class: "perfil" }, [trilho(l), secaoCadencia(l)]);
      if (atual === "historico") return el("div", { class: "perfil" }, [secaoHistorico(l)]);
      return el("div", { class: "perfil perfil-cols" }, [
        el("div", { class: "perfil-esq" }, [secaoFaz(l), secaoGancho(l), secaoJaTem(l), secaoEmpresa(l), secaoCuidado(l)]),
        el("div", { class: "perfil-dir" }, secaoPessoas(l))
      ]);
    });
  }

  function cardLead(l) {
    var g = grupo(l), e = etapa(l);
    var ativo = g === "hoje" || g === "aguardando";
    var semMarca = !estado.podeMarcar || !!estado.gravando["leads/" + l.id];
    var email = l.canal === "E-mail";
    var n = Math.min(e + 1, 3), t = toque(l, n);
    var teste = l.id === "TESTE";

    var rotulo = { hoje: "Toque " + n + " hoje", aguardando: "Aguardando", respondeu: "Respondeu", fechou: "Fechou",
                   encerrado: "Sem resposta", sair: "Saiu" }[g];
    var cab = el("div", { class: "cab" }, [
      teste ? el("div", null, [
        el("h2", { text: "Card de teste" }),
        el("div", { class: "meta", text: "Manda as mensagens para o WhatsApp da própria Reiners." })
      ]) : el("div", null, [
        el("h2", { text: l.nome || l.id }),
        el("div", { class: "meta" }, [el("span", { class: "num", text: l.id }), l.categoria ? " · " + l.categoria : null,
          (l.alertas || []).length ? el("span", { class: "chip alerta", text: "Alerta no perfil" }) : null])
      ]),
      el("span", { class: "estado " + g, text: rotulo })
    ]);

    var emLeads = estado.funil === "ld";  // na aba Leads o detalhe abre no perfil; só mostra o Enviar se o lead está na cadência
    var verToque = ativo ? n : e || 1;
    var tv = toque(l, verToque);
    var texto = email ? ("Assunto: " + (tv.assunto || "") + "\n\n" + (tv.corpo || "")) : mensagemToque(l, tv);
    var comFoto = !email && ativo && n === 1;
    var dest = destinoDe(l, email);
    var ca = contatoAtivo(l);
    var semDestino = email ? "Sem e-mail cadastrado" : "Sem telefone cadastrado";

    var acoes = [];
    if (ativo) {
      var podeHoje = g === "hoje";
      var link = !dest ? "" : email ? mailtoToque(l, t) : linkToque(l, t);
      var liberado = podeHoje && !!link;
      acoes.push(el("a", { class: "btn principal", href: liberado ? link : null, target: liberado ? "_blank" : null, rel: liberado ? "noopener" : null,
        "aria-disabled": liberado ? null : "true", onclick: function () { if (liberado) enviar(l); } }, ["Enviar"]));
      if (email) {
        acoes.push(el("button", { type: "button", class: "btn", onclick: function () { copiar(t.assunto || "", "Assunto"); } }, ["Copiar assunto"]));
        acoes.push(el("button", { type: "button", class: "btn", onclick: function () { copiar(t.corpo || "", "Corpo"); } }, ["Copiar corpo"]));
      } else {
        acoes.push(el("button", { type: "button", class: "btn", onclick: function () { copiar(mensagemToque(l, t), "Mensagem"); } }, ["Copiar"]));
      }
    }

    return el("article", { "data-detalhe": l.id, class: "lead" + (teste ? " teste" : "") + (g === "sair" || g === "encerrado" ? " apagado" : "") }, [
      cab,
      emLeads && !ativo ? null : el("div", { class: "toque-atual" }, [
        el("div", { class: "toque-rotulo", text: "Toque " + verToque + " · " + NOMES_TOQUE[verToque] + (email ? " · e-mail" : " · WhatsApp") }),
        el("p", { class: "msg", text: texto }),
        el("div", { class: "destino" + (dest ? "" : " sem") }, dest
          ? ["Para: ", ca && ca.nome ? ca.nome + " · " : "", email ? dest : el("span", { class: "num", text: dest })]
          : [semDestino])
      ]),
      acoes.length ? el("div", { class: "acoes" }, acoes) : null,
      comFoto && !emLeads ? blocoFoto(l, semMarca) : null,
      emLeads ? null : resultado(l, g, semMarca),
      !emLeads && estado.fechando === l.id ? formFechar(l) : null
    ].concat(teste ? [] : abasLead(l)));
  }

  function ordenarLeads(a, b) { return Regras.ordenarLeads(a, b, estado.filtro.aq.grupo, estado.meta.esperaDias); }

  function renderAQ() {
    var todos = Object.keys(estado.leads).map(function (k) { return estado.leads[k]; }).sort(ordenarLeads);
    var reais = todos.filter(function (l) { return l.id !== "TESTE"; });
    var agora = new Date();
    var cont = { hoje: 0, aguardando: 0, respondeu: 0, fechou: 0, encerrado: 0, sair: 0, todos: reais.length };
    var toquesHoje = 0;
    reais.forEach(function (l) {
      cont[grupo(l)]++;
      [1, 2, 3].forEach(function (n) { if (mesmoDia(l["enviado" + n], agora)) toquesHoje++; });
    });
    var meta = Number(estado.meta.metaDiaria) || 20;
    placar([cont.hoje, "Para hoje"], [toquesHoje, "Toques hoje / " + meta], [cont.hoje + cont.aguardando, "Em cadência"],
      [cont.respondeu + cont.fechou, "Responderam"], toquesHoje / meta, toquesHoje + "/" + meta + " toques · " + cont.hoje + " para hoje");
    abas(cont);
    var unicos = function (campo) {
      var vs = {};
      reais.forEach(function (l) { if (l[campo]) vs[l[campo]] = 1; });
      return Object.keys(vs).sort();
    };
    preencherSelect("f-segmento", unicos("segmento"));
    preencherSelect("f-faixa", unicos("faixa"));
    preencherSelect("f-canal", unicos("canal"));

    var f = estado.filtro.aq;
    var visiveis = todos.filter(function (l) {
      if (!Regras.casaBusca(l, estado.busca)) return false;
      if (l.id === "TESTE") return f.grupo === "todos" || grupo(l) === f.grupo || f.grupo === "hoje";
      if (f.grupo !== "todos" && grupo(l) !== f.grupo) return false;
      if (f.segmento && l.segmento !== f.segmento) return false;
      if (f.faixa && l.faixa !== f.faixa) return false;
      if (f.canal && l.canal !== f.canal) return false;
      return true;
    });
    if (!estado.carregado.leads) { limparFila(); carregando($("fila")); return desenharDetalhe(); }
    if (!todos.length) { limparFila(); vazio($("fila"), "Nenhum lead na fila", "Quando o Claude semear a central, as linhas aparecem aqui."); return desenharDetalhe(); }
    estado.visiveis.aq = visiveis;
    escolherSelecao(visiveis);
    desenharFila(visiveis);
    var alvo = $("fila");
    if (!visiveis.some(function (l) { return l.id !== "TESTE"; })) {
      if (f.grupo === "hoje") vazio(alvo, "Nada para hoje", "Os próximos toques aparecem na aba Aguardando, com a data de cada um.");
      else vazio(alvo, "Nada neste filtro", "Troque a aba ou limpe os filtros.");
    }
    desenharDetalhe();
  }

  // ---------- fila: linhas compactas reconciliadas por id ----------
  function limparFila() { var a = $("fila"); while (a.firstChild) a.removeChild(a.firstChild); a.dataset.modo = ""; }
  var ROTULO_ESTADO = { respondeu: "respondeu", fechou: "fechou negócio", sair: "pediu para sair", encerrado: "sem resposta" };

  // Estado de cada um dos três toques: feito, agora ou depois (e o texto para leitor de tela).
  function pontosDe(l) {
    var e = etapa(l), g = grupo(l), v = vencimento(l), ativo = g === "hoje" || g === "aguardando";
    var classes = [], falas = [];
    [1, 2, 3].forEach(function (n) {
      var feito = n <= e, agora = !feito && n === e + 1 && ativo;
      classes.push(feito ? "feito" : agora ? "agora" : "depois");
      falas.push("toque " + n + " " + (feito ? "enviado" : agora ? (g === "hoje" ? "hoje" : "a partir de " + dataCurta(v)) : ativo ? "depois" : "não vai sair"));
    });
    var fala = falas.join(", ");
    return { classes: classes, fala: fala.charAt(0).toUpperCase() + fala.slice(1) };
  }
  function quandoDe(l) {
    var g = grupo(l), e = etapa(l);
    if (g === "hoje") return ["hoje"];
    if (g === "aguardando") return ["a partir de ", el("span", { class: "num", text: dataCurta(vencimento(l)) })];
    var ultimo = l["enviado" + e];
    var partes = [ROTULO_ESTADO[g] || g];
    if (g === "encerrado" && ultimo) partes = partes.concat([" · enviado ", el("span", { class: "num", text: dataCurta(ultimo) })]);
    return partes;
  }
  function linhaLead(l) {
    var g = grupo(l), e = etapa(l), email = l.canal === "E-mail";
    var ativo = g === "hoje" || g === "aguardando";
    var semMarca = !estado.podeMarcar || !!estado.gravando["leads/" + l.id];
    var n = Math.min(e + 1, 3), t = toque(l, n);
    var teste = l.id === "TESTE";
    var pontos = pontosDe(l);
    var link = !destinoDe(l, email) ? "" : email ? mailtoToque(l, t) : linkToque(l, t);
    var podeEnviar = g === "hoje" && !!link;
    var btnEnviar = el("a", { class: "btn principal enviar", href: podeEnviar ? link : null, target: podeEnviar ? "_blank" : null, rel: podeEnviar ? "noopener" : null,
      "aria-disabled": podeEnviar ? null : "true", "aria-label": "Enviar toque " + n + " para " + (l.nome || l.id),
      onclick: function () { if (podeEnviar) enviar(l); } }, ["Enviar"]);
    var btnCopiar = el("button", { type: "button", class: "btn copiar", disabled: !ativo, "aria-label": "Copiar mensagem do toque " + n + " de " + (l.nome || l.id),
      onclick: function () { copiar(email ? (t.corpo || "") : mensagemToque(l, t), email ? "Corpo" : "Mensagem"); } }, ["Copiar"]);
    return el("div", { class: "linha" + (teste ? " teste" : "") + (g === "sair" || g === "encerrado" ? " apagado" : ""), "data-id": l.id, tabindex: "0",
      role: "group", "aria-label": teste ? "Card de teste" : (l.nome || l.id), "aria-current": sel() === l.id ? "true" : null }, [
      el("div", { class: "info" }, [
        el("span", { class: "nome", text: teste ? "Card de teste" : (l.nome || l.id) }),
        el("span", { class: "sub", text: teste ? "WhatsApp da própria Reiners" : [l.categoria, l.bairro].filter(Boolean).join(" · ") }),
        el("div", { class: "situacao" }, [
          el("span", { class: "pontos", role: "img", "aria-label": pontos.fala }, pontos.classes.map(function (c) { return el("i", { class: c }); })),
          el("span", { class: "quando" }, quandoDe(l)),
          (l.alertas || []).length ? el("span", { class: "chip alerta", text: "Alerta" }) : null
        ])
      ]),
      el("div", { class: "acoes" }, [btnEnviar, btnCopiar])
    ]);
  }
  function assinaturaLinha(item, ctx, colecao) {
    return JSON.stringify(item) + ctx + (sel() === item.id ? "1" : "0") + (estado.gravando[colecao + "/" + item.id] ? "g" : "");
  }
  function atualizarLinha(n, novo) {
    var ativo = document.activeElement, guarda = null;
    if (ativo && n.contains(ativo) && ativo !== n) guarda = ativo.classList.contains("copiar") ? ".copiar" : ativo.classList.contains("enviar") ? ".enviar" : null;
    n.className = novo.className;
    ["aria-current", "aria-label"].forEach(function (a) {
      if (novo.hasAttribute(a)) n.setAttribute(a, novo.getAttribute(a)); else n.removeAttribute(a);
    });
    while (n.firstChild) n.removeChild(n.firstChild);
    while (novo.firstChild) n.appendChild(novo.firstChild);
    if (guarda) { var f = n.querySelector(guarda); if (f && !f.disabled) f.focus(); }
  }
  // Reconcilia as linhas de um contêiner com o filtro atual: cria as que faltam, atualiza no próprio nó as que mudaram,
  // remove as que saíram e só mexe na ordem quando preciso. Nada de limpar a fila inteira. Serve aos três funis
  // (linhas da fila e linhas da tabela de Leads): cfg = { alvo, fabrica(item), colecao, ctx }.
  function reconciliar(itens, cfg) {
    var alvo = cfg.alvo, mapa = {}, manter = {};
    Array.prototype.slice.call(alvo.children).forEach(function (c) {
      if (c.dataset.id) mapa[c.dataset.id] = c;
      else if (!c.classList.contains("form")) alvo.removeChild(c);  // o formulário de novo cliente fica onde está
    });
    itens.forEach(function (x) { manter[x.id] = 1; });
    Object.keys(mapa).forEach(function (id) { if (!manter[id]) { alvo.removeChild(mapa[id]); delete mapa[id]; } });
    var base = alvo.querySelector(":scope > .form") ? 1 : 0;
    itens.forEach(function (x, i) {
      var sig = assinaturaLinha(x, cfg.ctx, cfg.colecao), n = mapa[x.id];
      if (!n) { n = cfg.fabrica(x); n._sig = sig; }
      else if (n._sig !== sig) { atualizarLinha(n, cfg.fabrica(x)); n._sig = sig; }
      if (alvo.children[i + base] !== n) alvo.insertBefore(n, alvo.children[i + base] || null);
    });
  }
  // Cada funil tem o seu modo de fila; trocar de modo recomeça do zero (os ids dos itens se repetem entre funis).
  function prepararFila(modo) {
    var alvo = $("fila");
    if (alvo.dataset.modo !== modo) { limparFila(); alvo.dataset.modo = modo; }
    return alvo;
  }
  function desenharFila(visiveis) {
    var alvo = prepararFila("aq");
    var ctx = JSON.stringify([estado.meta.esperaDias, estado.fotos, estado.podeMarcar, hoje().getTime()]);
    reconciliar(visiveis, { alvo: alvo, fabrica: linhaLead, colecao: "leads", ctx: ctx });
  }

  // ---------- seleção (uma por funil) ----------
  function colecaoDoFunil() { return estado.funil === "pv" ? estado.clientes : estado.leads; }
  function escolherSelecao(visiveis) {
    var f = estado.funil, ids = visiveis.map(function (l) { return l.id; });
    var primeiro = ids.filter(function (id) { return id !== "TESTE"; })[0] || ids[0] || null;  // o card de teste não abre sozinho
    if (!estado.selIni[f]) {
      // Primeira vez com dados: vale o item salvo se ele estiver na fila de agora, senão o primeiro da fila.
      estado.selIni[f] = true;
      if (ids.indexOf(estado.sel[f]) < 0) estado.sel[f] = primeiro;
    } else if (estado.sel[f] && !colecaoDoFunil()[estado.sel[f]]) {
      estado.sel[f] = primeiro;  // o item sumiu do banco
    }
  }
  function guardarSel(f, id) {
    estado.sel[f] = id;
    try { localStorage.setItem("central-sel-" + f, id); } catch (e) { /* tudo bem */ }
  }
  function selecionar(id, opcoes) {
    if (sel() !== id) estado.confirmarSair = null;
    guardarSel(estado.funil, id);
    render();
    if (opcoes && opcoes.foco) {
      var linha = $("fila").querySelector('[data-id="' + id + '"]');
      if (linha) linha.focus();
    }
  }

  // ---------- detalhe: só refaz quando o item selecionado ou o seu documento mudou ----------
  function desenharDetalhe() {
    var alvo = $("detalhe"), f = estado.funil, pv = f === "pv";
    var l = sel() ? (pv ? (estado.pv ? estado.clientes[sel()] : null) : estado.leads[sel()]) : null;
    var chave = l ? f + ":" + l.id : null;
    var sig = l ? JSON.stringify([f, l, estado.podeMarcar, !!estado.gravando[(pv ? "clientes/" : "leads/") + l.id], estado.fechando === l.id, estado.novoContato === l.id, aba(), estado.confirmarSair === l.id,
      estado.fotos, !!estado.downloads, estado.meta.esperaDias, pv ? estado.pv : Object.keys((estado.pv && estado.pv.produtos) || {}), hoje().getTime()]) : "vazio" + f;
    if (alvo._sig === sig) return;
    var mesmo = !!l && alvo._id === chave;
    var ativo = document.activeElement, idFoco = null, ini = null, fim = null, topo = mesmo ? alvo.scrollTop : 0;
    if (ativo && alvo.contains(ativo) && ativo.id) {
      idFoco = ativo.id;
      try { ini = ativo.selectionStart; fim = ativo.selectionEnd; } catch (e) { /* campo sem seleção */ }
    }
    while (alvo.firstChild) alvo.removeChild(alvo.firstChild);
    alvo.appendChild(el("div", { class: "barra-detalhe" }, [el("button", { type: "button", class: "btn fechar-detalhe", onclick: fecharDetalhe }, ["Fechar"])]));
    if (l) alvo.appendChild(pv ? detalheCliente(l) : cardLead(l));
    else if (pv) vazio(alvo, "Nenhum cliente selecionado", "Selecione um cliente na fila para ver a mensagem da etapa, os dados e o histórico.");
    else vazio(alvo, "Nenhum lead selecionado", "Selecione um lead na fila para ver a mensagem, o perfil e o histórico.");
    alvo.setAttribute("aria-label", pv ? "Detalhe do cliente" : "Detalhe do lead");
    alvo._sig = sig; alvo._id = chave;
    alvo.scrollTop = topo;
    if (idFoco) {
      var novo = $(idFoco);
      if (novo && alvo.contains(novo)) {
        novo.focus({ preventScroll: true });
        try { if (ini != null) novo.setSelectionRange(ini, fim); } catch (e) { /* tudo bem */ }
      }
    }
  }

  // ---------- detalhe como gaveta (760–1023px) ou tela cheia (<760px) ----------
  function emGaveta() { var l = document.body.dataset.layout; return l === "gaveta" || l === "uma"; }
  function abrirDetalhe(id) {
    if (!emGaveta()) return;
    var item = id || sel();
    if (!item || !colecaoDoFunil()[item]) return;
    if (sel() !== item) guardarSel(estado.funil, item);
    estado.detalheAberto = true;
    estado.origemDetalhe = item;
    estado.focarTitulo = true;
    render();
  }
  function fecharDetalhe() {
    if (!estado.detalheAberto) return;
    estado.detalheAberto = false;
    render();  // aplicarDetalhe devolve o foco à linha
  }
  // Mantém a classe, o papel de diálogo, o título focável, o véu e a trava de rolagem de acordo com o estado.
  function aplicarDetalhe() {
    var d = $("detalhe"), titulo = d.querySelector("h2");
    if (estado.detalheAberto && (!emGaveta() || !titulo || !sel())) estado.detalheAberto = false;
    var aberto = !!estado.detalheAberto, estava = !!estado.detalheVisto;
    estado.detalheVisto = aberto;
    d.classList.toggle("aberto", aberto);
    ["trilho", "fila"].forEach(function (id) { if (aberto) $(id).setAttribute("inert", ""); else $(id).removeAttribute("inert"); });
    $("veu").hidden = !aberto;
    document.documentElement.classList.toggle("detalhe-aberto", aberto);
    document.body.classList.toggle("detalhe-aberto", aberto);
    var fechar = d.querySelector(".fechar-detalhe");
    if (fechar) fechar.textContent = document.body.dataset.layout === "uma" ? "Voltar" : "Fechar";
    if (titulo) { titulo.id = "detalhe-titulo"; titulo.tabIndex = -1; }
    if (aberto) {
      d.setAttribute("role", "dialog"); d.setAttribute("aria-modal", "true"); d.setAttribute("aria-labelledby", "detalhe-titulo");
      var ativo = document.activeElement;
      if (estado.focarTitulo || !ativo || ativo === document.body || !d.contains(ativo)) { estado.focarTitulo = false; titulo.focus({ preventScroll: true }); }
    } else {
      ["role", "aria-modal", "aria-labelledby"].forEach(function (a) { d.removeAttribute(a); });
      if (estava) {  // fechou por qualquer caminho: o foco volta à linha de origem, ou à fila
        var ativo2 = document.activeElement;
        if (!ativo2 || ativo2 === document.body || d.contains(ativo2)) {
          var linha = $("fila").querySelector('[data-id="' + estado.origemDetalhe + '"]') || $("fila").querySelector('[data-id="' + sel() + '"]') || $("fila").querySelector("[data-id]");
          if (linha) linha.focus(); else { $("fila").tabIndex = -1; $("fila").focus(); }
        }
      }
    }
  }
  $("veu").addEventListener("click", fecharDetalhe);
  // ---------- atalhos de teclado ----------
  function emCampo(t) {
    return !!t && (t.nodeType === 1) && (/^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName) || t.isContentEditable);
  }
  function atalhosAbertos() { return !$("atalhos").hidden; }
  var focoAntesAtalhos = null;
  function mostrarAtalhos(v) {
    if (v === atalhosAbertos()) return;
    $("atalhos").hidden = !v;
    if (v) { focoAntesAtalhos = document.activeElement; $("atalhos-fechar").focus(); }
    else {
      var volta = focoAntesAtalhos; focoAntesAtalhos = null;
      if (volta && volta !== document.body && document.contains(volta) && !volta.closest("[inert]")) volta.focus();
    }
  }
  function andar(passo, t) {
    var fila = estado.visiveis[estado.funil];
    if (!fila.length) return;
    var i = fila.map(function (x) { return x.id; }).indexOf(sel());
    var novo = fila[Math.max(0, Math.min(fila.length - 1, i < 0 ? 0 : i + passo))];
    if (!novo || novo.id === sel()) return;
    var naLinha = !!(t && t.closest && t.closest(LINHA));
    selecionar(novo.id, { foco: naLinha });
    var linha = $("fila").querySelector('[data-id="' + novo.id + '"]');
    if (linha && linha.scrollIntoView) linha.scrollIntoView({ block: "nearest" });
  }
  // Procura o botão da seleção na linha e, se a linha não o tem (aba Leads), no detalhe.
  function botaoDaSelecao(seletorLinha, seletorDetalhe) {
    var id = sel();
    if (!id) return null;
    var linha = $("fila").querySelector('[data-id="' + id + '"]');
    var b = linha && linha.querySelector(seletorLinha);
    if (!b) b = Array.prototype.filter.call($("detalhe").querySelectorAll(seletorDetalhe), function (x) { return !x.closest("[aria-hidden='true']"); })[0] || null;
    return b && !b.disabled && b.getAttribute("aria-disabled") !== "true" ? b : null;
  }
  // Mesmo caminho do clique em Enviar: o link abre a conversa e o clique grava, avisa com Desfazer e avança.
  function enviarSelecionado() {
    var b = botaoDaSelecao("a.enviar", ".acoes a.btn.principal");
    if (b) b.click();
  }
  function copiarSelecionado() {
    var b = botaoDaSelecao("button.copiar", ".acoes button.btn");
    if (b) b.click();
  }
  function focarResultado() {
    if (!sel() || estado.funil === "ld") return;
    if (emGaveta() && !estado.detalheAberto) abrirDetalhe(sel());
    var b = $("detalhe").querySelector(".resultado button:not(:disabled)");
    if (b) b.focus();
  }
  function teclado(e) {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    var t = e.target, k = e.key;
    if (k === "Escape") {
      if (atalhosAbertos()) { e.preventDefault(); mostrarAtalhos(false); return; }
      if (t === $("f-busca")) {
        e.preventDefault();
        if (t.value) { t.value = ""; aplicarBusca(""); } else t.blur();
        return;
      }
      if (estado.detalheAberto) { e.preventDefault(); fecharDetalhe(); }
      return;
    }
    if (k === "Tab" && estado.detalheAberto) {
      var foc = Array.prototype.filter.call($("detalhe").querySelectorAll("button, a[href], input, select, textarea, summary, [tabindex]:not([tabindex='-1'])"),
        function (n) { return !n.disabled && n.offsetParent !== null; });
      if (!foc.length) return;
      var primeiro = foc[0], ultimo = foc[foc.length - 1], ativo = document.activeElement;
      if (e.shiftKey && ativo === primeiro) { e.preventDefault(); ultimo.focus(); }
      else if (!e.shiftKey && ativo === ultimo) { e.preventDefault(); primeiro.focus(); }
      return;
    }
    if (emCampo(t)) return;  // digitando: nenhum atalho age
    if (k === "?") { e.preventDefault(); mostrarAtalhos(!atalhosAbertos()); return; }
    if (atalhosAbertos()) return;  // com a lista aberta só Esc e ? agem
    if (e.repeat && (k === "Enter" || k === "c")) return;  // tecla segurada não envia lead atrás de lead
    if (k === "/") {
      e.preventDefault();
      if (estado.detalheAberto) fecharDetalhe();  // o trilho fica inert enquanto o detalhe está aberto
      $("f-busca").focus();
      return;
    }
    if (k === "1" || k === "2" || k === "3") {
      var f = { "1": "aq", "2": "pv", "3": "ld" }[k];
      if (f !== estado.funil) trocarFunil(f);
      return;
    }
    if (k === "j" || k === "k") { e.preventDefault(); andar(k === "j" ? 1 : -1, t); return; }
    if (k === "c") { copiarSelecionado(); return; }
    if (k === "r") { e.preventDefault(); focarResultado(); return; }
    if (k === "Enter") {
      // Botão, link e resumo fazem a própria ação; a linha só abre o detalhe na gaveta e na tela cheia.
      if (t && t.closest && t.closest("a, button, summary")) return;
      var linha = t && t.closest && t.closest(LINHA);
      if (linha) { if (emGaveta()) return; if (linha.dataset.id !== sel()) selecionar(linha.dataset.id, { foco: true }); }
      e.preventDefault();
      enviarSelecionado();
    }
  }
  document.addEventListener("keydown", teclado);
  $("atalhos-fechar").addEventListener("click", function () { mostrarAtalhos(false); });
  window.Central = Object.assign(window.Central || {}, { abrirDetalhe: abrirDetalhe, fecharDetalhe: fecharDetalhe, teclado: teclado });

  // ================= LEADS: estrutura e enriquecimento =================
  function statusLD(l) { return (l.enriquecimento && l.enriquecimento.status) || "bruto"; }
  function deSetor(l) { return (l.flags || []).indexOf("número de setor") >= 0 && !l.contatoAtivo; }
  function linkFonte(f) {
    if (!f) return null;
    return /^https?:\/\//.test(f) ? el("a", { href: f, target: "_blank", rel: "noopener", text: f.replace(/^https?:\/\/(www\.)?/, "").slice(0, 60) }) : document.createTextNode(f);
  }
  function blocoPessoa(l, c, ehContato) {
    var ativo = ehContato && l.contatoAtivo === c.id;
    var caminho = "leads/" + l.id, semMarca = !estado.podeMarcar || !!estado.gravando[caminho];
    var dados = [];
    if (c.telefone) dados.push(el("span", { class: "dado", text: "+" + c.telefone + (c.whatsapp === "sim" ? " · WhatsApp" : c.whatsapp === "nao" ? " · sem WhatsApp" : "") }));
    if (c.email) dados.push(el("span", { class: "dado", text: c.email }));
    if (c.linkedin) dados.push(el("a", { class: "dado", href: c.linkedin, target: "_blank", rel: "noopener", text: "LinkedIn" }));
    var acoes = [];
    if (ehContato && (c.telefone || c.email)) {
      acoes.push(ativo ?
        el("button", { type: "button", class: "btn", disabled: semMarca, onclick: function () { gravar(caminho, registrar(l, { contatoAtivo: null }, "Cadência voltou para o contato original"), "A cadência volta para o contato original"); } }, ["Voltar ao contato original"]) :
        el("button", { type: "button", class: "btn ok", disabled: semMarca, onclick: function () { gravar(caminho, registrar(l, { contatoAtivo: c.id }, "Cadência passou para " + (c.nome || PAPEIS[c.papel])), "Cadência vai para " + (c.nome || PAPEIS[c.papel])); } }, ["Usar na cadência"]));
    }
    return el("div", { class: "pessoa" + (ativo ? " ativo" : "") }, [
      el("div", { class: "topo" }, [
        el("span", { class: "nome", text: c.nome || (ehContato ? PAPEIS[c.papel] : "") }),
        ehContato ? el("span", { class: "papel " + c.papel, text: PAPEIS[c.papel] || c.papel }) : null
      ]),
      c.cargo ? el("span", { text: c.cargo }) : null
    ].concat(dados).concat([
      el("span", { class: "fonte" }, ["Fonte: ", linkFonte(c.fonte), c.confianca ? el("span", { class: "conf", text: " · confiança " + c.confianca }) : null]),
      acoes.length ? el("div", { class: "acoes" }, acoes) : null
    ]));
  }
  function formContato(l) {
    var id = l.id;
    var campos = {
      papel: el("select", { id: "nk-papel-" + id }, Object.keys(PAPEIS).map(function (k) { return el("option", { value: k, text: PAPEIS[k] }); })),
      nome: el("input", { id: "nk-nome-" + id, placeholder: "Nome da pessoa" }),
      cargo: el("input", { id: "nk-cargo-" + id, placeholder: "Ex.: Diretora de marketing" }),
      telefone: el("input", { id: "nk-tel-" + id, inputmode: "tel", placeholder: "(65) 99999-0000" }),
      whatsapp: el("select", { id: "nk-wa-" + id }, [["?", "Não sei"], ["sim", "Tem WhatsApp"], ["nao", "Sem WhatsApp"]].map(function (o) { return el("option", { value: o[0], text: o[1] }); })),
      email: el("input", { id: "nk-email-" + id, type: "email", placeholder: "nome@empresa.com.br" }),
      fonte: el("input", { id: "nk-fonte-" + id, placeholder: "Onde achou: link, cartão, indicação…" })
    };
    var erro = el("p", { class: "erro", hidden: "" });
    function campo(rot, k) { return el("label", { class: "campo", for: campos[k].id }, [rot, campos[k]]); }
    function salvar() {
      var tel = campos.telefone.value.trim() ? limparTelefone(campos.telefone.value) : "";
      var email = campos.email.value.trim().toLowerCase();
      var msg = (campos.telefone.value.trim() && !tel) ? "O telefone precisa ter DDD, como (65) 99999-0000." :
        (!tel && !email) ? "Informe um telefone ou um e-mail." : !campos.fonte.value.trim() ? "Diga de onde veio o contato." : "";
      if (msg) { erro.textContent = msg; erro.hidden = false; return; }
      var lista = (l.contatos || []).slice();
      var n = lista.reduce(function (m, c) { return Math.max(m, Number(String(c.id).slice(1)) || 0); }, 0) + 1;
      lista.push({ id: "k" + n, papel: campos.papel.value, nome: campos.nome.value.trim(), cargo: campos.cargo.value.trim(),
        telefone: tel, whatsapp: campos.whatsapp.value, email: email, fonte: campos.fonte.value.trim() + " (manual)", confianca: "alta" });
      gravar("leads/" + id, registrar(l, { contatos: lista }, "Contato adicionado: " + (campos.nome.value.trim() || PAPEIS[campos.papel.value])), "Contato adicionado").then(function (ok) { if (ok) { estado.novoContato = null; limparRascunho("nk-"); render(); } });
    }
    return el("div", { class: "card form" }, [
      el("div", { class: "grade" }, [campo("Papel", "papel"), campo("Nome", "nome"), campo("Cargo", "cargo"),
        campo("Telefone", "telefone"), campo("WhatsApp", "whatsapp"), campo("E-mail", "email"), campo("Fonte", "fonte")]),
      erro,
      el("div", { class: "acoes" }, [
        el("button", { type: "button", class: "btn principal", disabled: !estado.podeMarcar, onclick: salvar }, ["Salvar contato"]),
        el("button", { type: "button", class: "btn", onclick: function () { estado.novoContato = null; limparRascunho("nk-"); render(); } }, ["Cancelar"])
      ])
    ]);
  }
  function secao(titulo, filhos, extra) {
    return el("section", { class: "secao" }, [el("h3", null, [titulo, extra ? el("small", { text: extra }) : null])].concat(filhos));
  }
  function linksDe(l) {
    var redes = l.redes || {};
    return [["Site", l.site], ["Instagram", redes.instagram || l.instagram], ["LinkedIn", redes.linkedinEmpresa], ["YouTube", redes.youtube]]
      .filter(function (x) { return x[1]; }).map(function (x) {
        var href = /^https?:/.test(x[1]) ? x[1] : x[0] === "Instagram" ? "https://instagram.com/" + String(x[1]).replace(/^@/, "") : "https://" + x[1];
        return el("a", { href: href, target: "_blank", rel: "noopener", text: x[0] });
      });
  }
  function secaoFaz(l) {
    var p = l.perfil || {};
    var linha = [l.categoria, p.porte ? "porte " + p.porte : "", [l.bairro, p.cidade].filter(Boolean).join(", ")].filter(Boolean)
      .map(function (t) { return el("span", { text: t }); });
    if (p.nota) linha.push(el("b", { text: "Google " + String(p.nota).replace(".", ",") + (p.avaliacoes ? " (" + p.avaliacoes + " avaliações)" : "") }));
    var links = linksDe(l);
    var filhos = [
      p.especialidade ? el("p", { class: "faz", text: p.especialidade.charAt(0).toUpperCase() + p.especialidade.slice(1) + "." }) : null,
      linha.length ? el("div", { class: "resumo" }, linha) : null,
      links.length ? el("div", { class: "resumo" }, links) : null,
      p.fonteDados ? el("span", { class: "fonte-p" }, ["Fonte da pesquisa: ", linkFonte(p.fonteDados)]) : null
    ];
    return secao("O que faz", filhos);
  }
  function secaoGancho(l) {
    if (!l.fraseUnica) return null;
    var fonte = (l.perfil || {}).fonteFrase;
    return secao("Gancho da abordagem", [el("p", { class: "frase", text: l.fraseUnica })], fonte ? "baseado em " + fonte.toLowerCase() : "");
  }
  function secaoJaTem(l) {
    var sinais = l.sinais || [];
    return secao("O que já tem", sinais.length ? sinais.map(function (s) {
      return el("div", { class: "pessoa" }, [el("span", { text: s.texto }), s.fonte ? el("span", { class: "fonte" }, ["Fonte: ", linkFonte(s.fonte)]) : null]);
    }) : [el("p", { class: "vazio-p", text: "A pesquisa não registrou canal, podcast ou vídeo próprio. Vale perguntar na conversa." })]);
  }
  function secaoEmpresa(l) {
    var emp = l.empresa || {}, linha = [];
    if (emp.cnpj) linha.push(el("span", null, ["CNPJ ", el("b", { text: emp.cnpj.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, "$1.$2.$3/$4-$5") })]));
    if (emp.razaoSocial) linha.push(el("span", { text: emp.razaoSocial }));
    if (emp.porte) linha.push(el("span", { text: "Porte " + emp.porte }));
    if (emp.abertura) linha.push(el("span", { text: "Desde " + emp.abertura.slice(0, 4) }));
    if (emp.situacao && !/ativa/i.test(emp.situacao)) linha.push(el("b", { text: "Situação: " + emp.situacao }));
    var filhos = [linha.length ? el("div", { class: "resumo" }, linha) : el("p", { class: "vazio-p", text: "CNPJ ainda não confirmado na Receita." }),
      emp.cnae ? el("div", { class: "resumo", text: emp.cnae }) : null];
    if ((l.socios || []).length) {
      filhos.push(el("details", null, [el("summary", { text: "Quadro de sócios (" + l.socios.length + ")" }),
        el("ul", { class: "socios" }, l.socios.map(function (s) { return el("li", { text: s.nome + (s.qualificacao ? " · " + s.qualificacao : "") }); }))]));
    }
    return secao("Empresa na Receita", filhos);
  }
  function secaoPessoas(l) {
    var contatos = l.contatos || [];
    var filhos = [];
    if ((l.decisores || []).length) {
      filhos.push(secao("Quem lidera", l.decisores.map(function (d) { return blocoPessoa(l, d, false); })));
    }
    filhos.push(secao("Contatos", contatos.map(function (c) { return blocoPessoa(l, c, true); })
      .concat(contatos.length ? [] : [el("p", { class: "vazio-p", text: "Nenhum contato enriquecido ainda." })])
      .concat([estado.novoContato === l.id ? formContato(l) : el("div", { class: "acoes" }, [el("button", { type: "button", class: "btn", disabled: !estado.podeMarcar,
        onclick: function () { estado.novoContato = l.id; render(); } }, ["Adicionar contato"])])]),
      l.contatoAtivo ? "a cadência usa o contato marcado" : "a cadência usa o contato original"));
    return filhos;
  }
  function secaoCuidado(l) {
    var pend = (l.pendencias || []).concat((l.enriquecimento || {}).observacao ? [l.enriquecimento.observacao] : []);
    var filhos = (l.alertas || []).map(function (s) { return el("div", { class: "aviso" }, [s.texto + (s.fonte ? " · " : ""), linkFonte(s.fonte)]); });
    if (pend.length) filhos.push(el("p", { class: "dica", text: pend.join(" · ") }));
    return filhos.length ? secao("Cuidado e pendências", filhos) : null;
  }
  // As três mensagens da cadência, já com a saudação, o contato e a foto escolhidos.
  function secaoCadencia(l) {
    var e = etapa(l), g = grupo(l), v = vencimento(l), email = l.canal === "E-mail";
    var ativo = g === "hoje" || g === "aguardando";
    return secao("Mensagens da cadência", [el("div", { class: "toques" }, [1, 2, 3].map(function (n) {
      var t = toque(l, n), enviado = l["enviado" + n], proximo = ativo && n === e + 1;
      var quandoTxt = enviado ? "enviado " + dataCurta(enviado) :
        proximo ? (g === "hoje" ? "sai hoje" : "a partir de " + dataCurta(v)) :
        ativo && n > e + 1 ? espera(n) + " dias depois do toque " + (n - 1) : "não vai sair";
      var texto = email ? "Assunto: " + (t.assunto || "") + "\n\n" + (t.corpo || "") : mensagemToque(l, t);
      return el("details", { class: proximo ? "proximo" : null, open: proximo ? "" : null }, [
        el("summary", null, ["Toque " + n + " · " + NOMES_TOQUE[n], el("span", { text: quandoTxt })]),
        el("p", { class: "msg", text: texto || "Mensagem não semeada." })
      ]);
    }))], email ? "por e-mail" : "por WhatsApp");
  }
  function eventos(l) {
    var lista = (l.historico || []).map(function (x) { return Object.assign({}, x); });
    var g = grupo(l), e = etapa(l), desfazivel = e >= 1 && g !== "respondeu" && g !== "fechou" && g !== "sair";
    [1, 2, 3].forEach(function (n) {
      var quando = l["enviado" + n];
      if (!quando) return;
      var marca = desfazivel && n === e ? n : 0;
      // o envio da central já grava "Toque N enviado" no histórico; só deriva a linha quando for dado antigo
      var guardado = lista.filter(function (x) { return x.texto === "Toque " + n + " enviado" && Math.abs(new Date(x.em) - new Date(quando)) < 5000; })[0];
      if (guardado) { if (marca) guardado.desfazer = marca; return; }
      lista.push({ em: quando, texto: "Toque " + n + " (" + NOMES_TOQUE[n].toLowerCase() + ") enviado", desfazer: marca });
    });
    var enr = l.enriquecimento || {};
    if (enr.atualizadoEm) lista.push({ em: enr.atualizadoEm + "T12:00:00", texto: "Enriquecimento atualizado: " + ({ completo: "completo", parcial: "parcial", bruto: "sem enriquecimento" }[enr.status] || enr.status) });
    return lista.filter(function (x) { return x.em && !isNaN(new Date(x.em)); })
      .sort(function (a, b) { return new Date(b.em) - new Date(a.em); });
  }
  function secaoHistorico(l) {
    var lista = eventos(l), id = "nh-" + l.id;
    var campo = el("textarea", { id: id, class: "nota", placeholder: "Ex.: Falei com a secretária, pediu para ligar na segunda." });
    var salvar = el("button", { type: "button", class: "btn principal", disabled: !estado.podeMarcar || !!estado.gravando["leads/" + l.id],
      onclick: function () {
        var txt = campo.value.trim();
        if (!txt) { toast("Escreva a anotação antes de salvar."); return; }
        gravar("leads/" + l.id, registrar(l, {}, txt, "nota"), "Anotação salva").then(function (ok) { if (ok) { delete estado.rascunho[id]; render(); } });
      } }, ["Salvar anotação"]);
    return secao("Histórico", [
      lista.length ? el("ol", { class: "tempo" }, lista.map(function (x) {
        var d = new Date(x.em);
        return el("li", { class: x.tipo === "nota" ? "nota" : null }, [
          el("time", { datetime: x.em, text: dataCurta(d) + " " + String(d.getHours()).padStart(2, "0") + ":" + String(d.getMinutes()).padStart(2, "0") }),
          el("span", null, [x.texto, x.desfazer ? el("button", { type: "button", class: "btn desfazer-h", disabled: !estado.podeMarcar || !!estado.gravando["leads/" + l.id],
            onclick: function () { desfazerToque(l, x.desfazer); } }, ["Desfazer"]) : null])
        ]);
      })) : el("p", { class: "vazio-p", text: "Nada registrado ainda. Envios, respostas, trocas de contato e anotações aparecem aqui." }),
      el("label", { class: "campo", for: id }, ["Nova anotação", campo]),
      el("div", { class: "acoes" }, [salvar])
    ], lista.length ? lista.length + (lista.length === 1 ? " registro" : " registros") : "");
  }
  // Lead na aba Leads: status do enriquecimento, quem lidera e o contato direto sugerido.
  var ROTULO_ENRIQ = { completo: "Completo", parcial: "Parcial", bruto: "Sem enriquecimento" };
  var ORDEM_ENRIQ = { completo: 0, parcial: 1, bruto: 2 };
  function liderDe(l) { var d = (l.decisores || [])[0]; return d ? d.nome + (d.cargo ? ", " + d.cargo : "") : ""; }
  function diretoDe(l) {
    var sug = (l.contatos || []).filter(function (c) { return c.id === (l.enriquecimento || {}).contatoSugerido; })[0];
    return sug ? (sug.nome || PAPEIS[sug.papel]) + (sug.telefone ? (sug.whatsapp === "sim" ? " · WhatsApp" : " · telefone") : " · e-mail") : "";
  }
  function cnpjDe(l) {
    var c = l.empresa && l.empresa.cnpj;
    return c ? String(c).replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, "$1.$2.$3/$4-$5") : "";
  }
  function linhaLeadEnriq(l) {
    var st = statusLD(l), lider = liderDe(l);
    return el("div", { class: "linha", "data-id": l.id, tabindex: "0", role: "group", "aria-label": l.nome || l.id, "aria-current": sel() === l.id ? "true" : null }, [
      el("div", { class: "info" }, [
        el("span", { class: "nome", text: l.nome || l.id }),
        el("span", { class: "sub", text: [l.segmento, l.categoria].filter(Boolean).join(" · ") }),
        el("div", { class: "situacao" }, [
          el("span", { class: "estado " + st, text: ROTULO_ENRIQ[st] }),
          lider ? el("span", { class: "quando", text: "Lidera: " + lider }) : null,
          (l.alertas || []).length ? el("span", { class: "chip alerta", text: "Alerta" }) : null
        ])
      ])
    ]);
  }
  // Tabela da aba Leads (≥1024px): uma linha por lead, cabeçalhos que ordenam.
  var COLUNAS_LD = [
    ["empresa", "Empresa", function (l) { return String(l.nome || l.id).toLowerCase(); }],
    ["status", "Status", function (l) { return ORDEM_ENRIQ[statusLD(l)]; }],
    ["lidera", "Lidera", function (l) { return liderDe(l).toLowerCase(); }],
    ["contato", "Contato direto", function (l) { return diretoDe(l).toLowerCase(); }],
    ["cnpj", "CNPJ", function (l) { return cnpjDe(l); }],
    ["alertas", "Alertas", function (l) { return (l.alertas || []).length; }]
  ];
  function ordenarLD(lista) {
    var o = estado.ordemLD, col = COLUNAS_LD.filter(function (c) { return c[0] === o.col; })[0];
    var porOrdem = function (a, b) { return (a.ordem || 9999) - (b.ordem || 9999); };
    if (!col) return lista.sort(porOrdem);
    var sinal = o.dir === "desc" ? -1 : 1;
    return lista.sort(function (a, b) {
      var x = col[2](a), y = col[2](b);
      if (x === y) return porOrdem(a, b);
      if (x === "" || y === "") return x === "" ? 1 : -1;  // vazio sempre no fim
      return (x < y ? -1 : 1) * sinal;
    });
  }
  function linhaTabelaLD(l) {
    var st = statusLD(l), alertas = (l.alertas || []).length;
    return el("tr", { "data-id": l.id, tabindex: "0", "aria-current": sel() === l.id ? "true" : null }, [
      el("th", { scope: "row", class: "nome", text: l.nome || l.id }),
      el("td", null, [el("span", { class: "estado " + st, text: ROTULO_ENRIQ[st] })]),
      el("td", { text: liderDe(l) || "—" }),
      el("td", { text: diretoDe(l) || "—" }),
      el("td", { class: "num", text: cnpjDe(l) || "—" }),
      el("td", null, [alertas ? el("span", { class: "chip alerta", text: alertas === 1 ? "1 alerta" : alertas + " alertas" }) : "—"])
    ]);
  }
  function tabelaLeads(lista) {
    var alvo = prepararFila("ldtab"), tabela = alvo.querySelector("table");
    if (!tabela) {
      var cab = el("tr", null, COLUNAS_LD.map(function (c) {
        return el("th", { scope: "col", "data-col": c[0] }, [el("button", { type: "button", class: "ordenar", "data-col": c[0],
          onclick: function () {
            var o = estado.ordemLD;
            estado.ordemLD = o.col === c[0] ? { col: c[0], dir: o.dir === "asc" ? "desc" : "asc" } : { col: c[0], dir: "asc" };
            render();
            var b = $("fila").querySelector('th button[data-col="' + c[0] + '"]');
            if (b) b.focus();
          } }, [c[1]])]);
      }));
      tabela = el("table", { class: "tabela" }, [el("caption", { class: "sr", text: "Leads, com status do enriquecimento" }), el("thead", null, [cab]), el("tbody")]);
      alvo.appendChild(el("div", { class: "tabela-wrap" }, [tabela]));
    }
    Array.prototype.forEach.call(tabela.querySelectorAll("thead th"), function (th) {
      if (th.dataset.col === estado.ordemLD.col) th.setAttribute("aria-sort", estado.ordemLD.dir === "desc" ? "descending" : "ascending");
      else th.removeAttribute("aria-sort");
    });
    Array.prototype.forEach.call(alvo.children, function (c) { if (c.classList.contains("vazio")) alvo.removeChild(c); });
    reconciliar(lista, { alvo: tabela.tBodies[0], fabrica: linhaTabelaLD, colecao: "leads", ctx: "" });
  }
  function renderLD() {
    var todos = Object.keys(estado.leads).filter(function (k) { return k !== "TESTE"; }).map(function (k) { return estado.leads[k]; })
      .sort(function (a, b) { return (a.ordem || 9999) - (b.ordem || 9999); });
    var cont = { todos: todos.length, completo: 0, parcial: 0, bruto: 0, setor: 0 }, decisor = 0, direto = 0, semCnpj = 0;
    todos.forEach(function (l) {
      cont[statusLD(l)]++;
      if (deSetor(l)) cont.setor++;
      if ((l.decisores || []).length) decisor++;
      if (l.enriquecimento && l.enriquecimento.contatoSugerido) direto++;
      if (!(l.empresa && l.empresa.cnpj)) semCnpj++;
    });
    placar([cont.completo, "Completos"], [decisor, "Com quem lidera"], [direto, "Contato direto"], [semCnpj, "Sem CNPJ"],
      todos.length ? cont.completo / todos.length : 0);
    abas(cont);
    var segs = {};
    todos.forEach(function (l) { if (l.segmento) segs[l.segmento] = 1; });
    preencherSelect("f-ld-segmento", Object.keys(segs).sort());
    var f = estado.filtro.ld;
    var visiveis = todos.filter(function (l) {
      if (f.grupo === "setor" ? !deSetor(l) : (f.grupo !== "todos" && statusLD(l) !== f.grupo)) return false;
      if (f.segmento && l.segmento !== f.segmento) return false;
      return Regras.casaBusca(l, estado.busca);
    });
    var tabelaLayout = document.body.dataset.layout === "tres" || document.body.dataset.layout === "dois";
    if (tabelaLayout) ordenarLD(visiveis);
    var alvoEl = $("fila");
    if (!estado.carregado.leads) { limparFila(); carregando(alvoEl); return desenharDetalhe(); }
    estado.visiveis.ld = visiveis;
    escolherSelecao(visiveis);
    if (tabelaLayout) tabelaLeads(visiveis);
    else {
      prepararFila("ld");
      reconciliar(visiveis, { alvo: alvoEl, fabrica: linhaLeadEnriq, colecao: "leads", ctx: "" });
    }
    if (!visiveis.length) vazio(alvoEl, "Nada neste filtro", "Troque a aba, o segmento ou a busca.");
    desenharDetalhe();
  }

  // ================= PÓS-VENDA =================
  function etapasPV() { return (estado.pv && estado.pv.etapas) || []; }
  var etapaPV = Regras.etapaPV;
  function defEtapa(n) { return etapasPV()[n - 1] || null; }
  function textoPV(c, n) { return Regras.textoPV(c, n, estado.pv); }
  function vencimentoPV(c) { return Regras.vencimentoPV(c, etapasPV()); }
  function grupoPV(c) { return Regras.grupoPV(c, etapasPV(), new Date()); }

  function marcarPV(c, n) {
    var dados = {};
    dados["pvEnviado" + n] = new Date().toISOString();
    var ok = comVizinho(c, function () { return gravar("clientes/" + c.id, dados); });
    ok.then(function (feito) { if (feito) avisoComDesfazer("Mensagem da etapa " + n + " marcada", function () { desfazerPV(c, n); }); });
    return ok;
  }
  // Só desfaz se a marca ainda está lá e o cliente continua nessa etapa.
  function desfazerPV(c, n) {
    var atual = estado.clientes[c.id] || c;
    $("toast").hidden = true;
    if (!atual["pvEnviado" + n] || etapaPV(atual) !== n) { toast("Nada a desfazer"); return; }
    var dados = {};
    dados["pvEnviado" + n] = null;
    if (Array.isArray(atual.historico)) registrar(atual, dados, "Mensagem da etapa " + n + " desfeita");
    gravar("clientes/" + c.id, dados).then(function (ok) { if (ok) selecionar(c.id); });
  }
  function concluirPV(c) {
    var n = etapaPV(c), total = etapasPV().length;
    var dados = { etapa: n + 1 };
    dados["pvConcluido" + n] = new Date().toISOString();
    if (n >= total) dados.situacao = "concluido";
    return comVizinho(c, function () { return gravar("clientes/" + c.id, dados, n >= total ? "Cliente concluído" : "Etapa concluída: " + defEtapa(n + 1).nome); });
  }
  function voltarPV(c) {
    var n = etapaPV(c);
    if (n <= 1) return;
    var dados = { etapa: n - 1, situacao: "ativo" };
    dados["pvConcluido" + (n - 1)] = null;
    dados["pvEnviado" + (n - 1)] = null;
    return comVizinho(c, function () { return gravar("clientes/" + c.id, dados, "Voltou para " + defEtapa(n - 1).nome); });
  }
  function marcarData(c, campo, valor) {
    var dados = {};
    dados[campo] = valor || null;
    return gravar("clientes/" + c.id, dados, valor ? "Data salva" : "Data apagada");
  }

  function esteira(c) {
    var n = etapaPV(c), total = etapasPV().length, e = defEtapa(n), g = grupoPV(c);
    var segs = el("div", { class: "segs", "aria-hidden": "true" }, etapasPV().map(function (_, i) {
      var k = i + 1;
      return el("i", { class: k < n || g === "concluido" ? "feito" : (k === n ? "agora" : "") });
    }));
    var datas = [];
    if (c.dataKickoff) datas.push("Kickoff " + quando(c.dataKickoff));
    if (c.dataGravacao) datas.push("Gravação " + quando(c.dataGravacao));
    var titulo = g === "concluido" ? "Todas as etapas concluídas" : "Etapa " + n + " de " + total + " · " + (e ? e.nome : "");
    return el("div", { class: "esteira" }, [segs, el("div", { class: "rotulo" }, [
      el("b", { text: titulo }), datas.length ? el("span", { text: datas.join(" · ") }) : null
    ])]);
  }

  // O que a linha e o detalhe precisam saber do cliente numa conta só.
  function infoPV(c) {
    var g = grupoPV(c), n = etapaPV(c), e = defEtapa(n);
    var texto = e ? textoPV(c, n) : "";
    var precisaData = !!e && e.quando === "data" && !c[e.campoData];
    var email = !c.telefone && !!c.email;
    var link = !e || precisaData ? "" : c.telefone ? waLink(c.telefone, texto) : c.email ? mailto(c.email, "Reiners Media · " + e.nome, texto) : "";
    return { g: g, n: n, e: e, texto: texto, precisaData: precisaData, enviado: !!c["pvEnviado" + n], ativo: g === "hoje" || g === "andamento",
      email: email, link: link, semMarca: !estado.podeMarcar || !!estado.gravando["clientes/" + c.id] };
  }
  function copiarPV(c, p) { copiar(p.texto, "Mensagem"); }
  // Data que interessa na linha: kickoff ou gravação marcados, senão quando a mensagem sai.
  function dataLinhaPV(c, p) {
    if (p.g === "pausado") return "pausado";
    if (p.g === "concluido") return "concluído";
    var v = vencimentoPV(c);
    if (p.e && p.e.quando === "data") {
      var marcada = c[p.e.campoData];
      return marcada ? el("span", { class: "num", text: dataCurta(marcada) }) : "marcar a data";
    }
    if (p.g === "hoje") return "hoje";
    if (p.enviado) return ["enviada ", el("span", { class: "num", text: dataCurta(c["pvEnviado" + p.n]) })];
    return v ? ["a partir de ", el("span", { class: "num", text: dataCurta(v) })] : "";
  }
  function linhaCliente(c) {
    var p = infoPV(c), total = etapasPV().length;
    var podeEnviar = p.g === "hoje" && !!p.link;
    var btnEnviar = el("a", { class: "btn principal enviar", href: podeEnviar ? p.link : null, target: podeEnviar ? "_blank" : null, rel: podeEnviar ? "noopener" : null,
      "aria-disabled": podeEnviar ? null : "true", "aria-label": "Enviar mensagem de " + (p.e ? p.e.nome.toLowerCase() : "etapa") + " para " + (c.nome || c.id),
      onclick: function () { if (podeEnviar && !p.semMarca && !p.enviado) marcarPV(c, p.n); } }, ["Enviar"]);
    var btnCopiar = el("button", { type: "button", class: "btn copiar", disabled: !(p.ativo && p.e && !p.precisaData), "aria-label": "Copiar mensagem de " + (c.nome || c.id),
      onclick: function () { copiarPV(c, p); } }, ["Copiar"]);
    var etapaTxt = p.g === "concluido" ? "Todas as etapas concluídas" : "Etapa " + p.n + "/" + total + " · " + (p.e ? p.e.nome : "");
    return el("div", { class: "linha" + (p.g === "pausado" ? " apagado" : ""), "data-id": c.id, tabindex: "0", role: "group", "aria-label": c.nome || c.id,
      "aria-current": sel() === c.id ? "true" : null }, [
      el("div", { class: "info" }, [
        el("span", { class: "nome", text: c.nome || c.id }),
        el("span", { class: "sub", text: c.produto || "" }),
        el("div", { class: "situacao" }, [el("span", { class: "quando" }, [etapaTxt, " · ", el("span", null, [].concat(dataLinhaPV(c, p)))])])
      ]),
      el("div", { class: "acoes" }, [btnEnviar, btnCopiar])
    ]);
  }

  var QUANDO_PV_TXT = function (e) {
    if (e.quando === "data") return e.vespera ? "na véspera da gravação" : "depois que o kickoff estiver marcado";
    if (typeof e.quando === "number") return e.quando + " dias depois da etapa anterior";
    return "assim que entra na etapa";
  };
  function abaEtapaPV(c, p) {
    var etapas = etapasPV(), proxima = defEtapa(p.n + 1);
    return el("div", { class: "perfil" }, [
      secao("Esteira", [esteira(c), el("ol", { class: "etapas" }, etapas.map(function (e) {
        var feito = p.g === "concluido" || e.n < p.n, atual = !feito && e.n === p.n;
        var quandoTxt = c["pvConcluido" + e.n] ? "concluída " + dataCurta(c["pvConcluido" + e.n]) : c["pvEnviado" + e.n] ? "enviada " + dataCurta(c["pvEnviado" + e.n]) : QUANDO_PV_TXT(e);
        return el("li", { class: feito ? "feito" : atual ? "agora" : null, "aria-current": atual ? "step" : null }, [
          el("b", { text: e.n + " · " + e.nome }), el("span", { text: atual ? "agora · " + quandoTxt : quandoTxt })
        ]);
      }))]),
      secao("O que vem depois", [el("p", { class: "vazio-p", text: p.g === "concluido" ? "Todas as etapas foram concluídas."
        : proxima ? "Ao concluir esta etapa, a próxima é " + proxima.nome + ": " + QUANDO_PV_TXT(proxima) + "." : "Esta é a última etapa. Ao concluir, o cliente vai para Concluídos." })])
    ]);
  }
  function abaClientePV(c) {
    var tel = c.telefone ? Regras.telefoneFormatado(c.telefone) : "";
    var origem = c.leadId ? "veio da prospecção (" + c.leadId + ")" : (c.origem || "").toLowerCase();
    var dados = [
      tel ? el("div", { class: "resumo" }, ["WhatsApp ", el("b", { class: "num", text: tel })]) : null,
      c.email ? el("div", { class: "resumo" }, ["E-mail ", el("b", { text: c.email })]) : null,
      c.saudacao ? el("div", { class: "resumo" }, ["Letícia chama de ", el("b", { text: c.saudacao })]) : null
    ].filter(Boolean);
    var sobre = [
      c.produto ? el("div", { class: "resumo" }, ["Produto ", el("b", { text: c.produto })]) : null,
      c.segmento ? el("div", { class: "resumo" }, ["Segmento ", el("b", { text: c.segmento })]) : null,
      origem ? el("div", { class: "resumo" }, ["Origem: ", el("b", { text: origem })]) : null,
      c.criadoEm ? el("div", { class: "resumo" }, ["Cliente desde ", el("b", { class: "num", text: dataCurta(c.criadoEm) })]) : null
    ].filter(Boolean);
    return el("div", { class: "perfil perfil-cols" }, [
      el("div", { class: "perfil-esq" }, [secao("Contato", dados.length ? dados : [el("p", { class: "vazio-p", text: "Sem telefone nem e-mail cadastrado." })])]),
      el("div", { class: "perfil-dir" }, [secao("Sobre o cliente", sobre)])
    ]);
  }
  function eventosPV(c) {
    var lista = [];
    if (c.criadoEm) lista.push({ em: c.criadoEm, texto: "Cliente cadastrado" + (c.leadId ? " a partir do lead " + c.leadId : "") });
    etapasPV().forEach(function (e) {
      if (c["pvEnviado" + e.n]) lista.push({ em: c["pvEnviado" + e.n], texto: "Mensagem de " + e.nome.toLowerCase() + " enviada" });
      if (c["pvConcluido" + e.n]) lista.push({ em: c["pvConcluido" + e.n], texto: "Etapa concluída: " + e.nome });
    });
    return lista.filter(function (x) { return x.em && !isNaN(new Date(x.em)); }).sort(function (a, b) { return new Date(b.em) - new Date(a.em); });
  }
  function abaHistoricoPV(c) {
    var lista = eventosPV(c);
    return el("div", { class: "perfil" }, [secao("Histórico", [lista.length ? el("ol", { class: "tempo" }, lista.map(function (x) {
      var d = new Date(x.em);
      return el("li", null, [
        el("time", { datetime: x.em, text: dataCurta(d) + " " + String(d.getHours()).padStart(2, "0") + ":" + String(d.getMinutes()).padStart(2, "0") }),
        el("span", { text: x.texto })
      ]);
    })) : el("p", { class: "vazio-p", text: "Nada registrado ainda." })], lista.length ? lista.length + (lista.length === 1 ? " registro" : " registros") : "")]);
  }

  // Detalhe do cliente: o topo decide a mensagem da etapa (texto, destino, Enviar, Copiar, datas) e as ações; as abas explicam.
  function detalheCliente(c) {
    var p = infoPV(c), e = p.e, g = p.g, n = p.n, total = etapasPV().length;
    var caminho = "clientes/" + c.id, semMarca = p.semMarca;
    var rotulo = { hoje: p.precisaData ? "Marcar data" : "Enviar hoje", andamento: p.enviado ? "Mensagem enviada" : "A partir de " + dataCurta(vencimentoPV(c)),
                   pausado: "Pausado", concluido: "Concluído" }[g];
    var cab = el("div", { class: "cab" }, [
      el("div", null, [
        el("h2", { text: c.nome || c.id }),
        el("div", { class: "meta" }, [[c.produto, g === "concluido" ? "todas as etapas concluídas" : "etapa " + n + " de " + total + " · " + (e ? e.nome : "")].filter(Boolean).join(" · ")])
      ]),
      el("span", { class: "estado " + g, text: rotulo })
    ]);
    var corpo = [cab];
    var destino = c.telefone ? Regras.telefoneFormatado(c.telefone) : (c.email || "");
    if (p.ativo && e) {
      var bloco = [el("div", { class: "toque-rotulo", text: "Etapa " + n + " · " + e.nome + (p.email ? " · e-mail" : " · WhatsApp") })];
      if (e.quando === "data") {
        var inp = el("input", { type: "datetime-local", id: "data-" + c.id + "-" + e.campoData, value: c[e.campoData] || "",
          disabled: semMarca, onchange: function (ev) { marcarData(c, e.campoData, ev.target.value); } });
        bloco.push(el("label", { class: "campo", for: inp.id }, [e.nome === "Kickoff" ? "Data do kickoff" : "Data da gravação", inp]));
        if (p.precisaData) bloco.push(el("p", { class: "dica", text: e.vespera ?
          "Marque a data da gravação. O lembrete aparece em Para hoje na véspera." :
          "Marque a data do kickoff combinada na resposta às boas-vindas para liberar a confirmação." }));
      }
      if (!p.precisaData) {
        bloco.push(el("p", { class: "msg", text: p.texto }));
        bloco.push(el("div", { class: "destino" + (destino ? "" : " sem") }, destino
          ? ["Para: ", p.email ? destino : el("span", { class: "num", text: destino })] : [p.email ? "Sem e-mail cadastrado" : "Sem telefone cadastrado"]));
      }
      corpo.push(el("div", { class: "toque-atual" }, bloco));
      if (!p.precisaData && p.link) {
        var acoes = [el("a", { class: "btn" + (p.enviado ? "" : " principal"), href: p.link, target: "_blank", rel: "noopener",
          onclick: function () { if (!semMarca && !p.enviado) marcarPV(c, n); } }, [p.enviado ? (p.email ? "Abrir e-mail de novo" : "Abrir WhatsApp de novo") : "Enviar"])];
        acoes.push(el("button", { type: "button", class: "btn", onclick: function () { copiarPV(c, p); } }, ["Copiar"]));
        corpo.push(el("div", { class: "acoes" }, acoes));
      }
    } else if (destino) {
      corpo.push(el("div", { class: "destino" }, ["Para: ", el("span", { class: "num", text: destino })]));
    }
    var gestao = [];
    if (p.ativo && e) gestao.push(el("button", { type: "button", class: "btn ok", disabled: semMarca, onclick: function () { concluirPV(c); } },
      [n >= total ? "Concluir cliente" : "Concluir etapa"]));
    if (n > 1 && g !== "pausado") gestao.push(el("button", { type: "button", class: "btn", disabled: semMarca, onclick: function () { voltarPV(c); } }, ["Voltar etapa"]));
    if (g === "pausado") gestao.push(el("button", { type: "button", class: "btn", disabled: semMarca,
      onclick: function () { comVizinho(c, function () { return gravar(caminho, { situacao: "ativo" }, "Cliente retomado"); }); } }, ["Retomar"]));
    else if (p.ativo) gestao.push(el("button", { type: "button", class: "btn alerta", disabled: semMarca,
      onclick: function () { comVizinho(c, function () { return gravar(caminho, { situacao: "pausado" }, "Cliente pausado"); }); } }, ["Pausar"]));
    corpo.push(el("div", { class: "resultado", role: "group", "aria-label": "Andamento do cliente" }, gestao));
    corpo = corpo.concat(abasDetalhe("Sobre o cliente", function (atual) {
      return atual === "cliente" ? abaClientePV(c) : atual === "historico" ? abaHistoricoPV(c) : abaEtapaPV(c, p);
    }));
    return el("article", { "data-detalhe": c.id, class: "lead" + (g === "pausado" ? " apagado" : "") }, corpo);
  }

  function formNovoCliente() {
    var produtos = Object.keys((estado.pv && estado.pv.produtos) || { "Outro": 1 });
    var campos = {
      nome: el("input", { id: "nc-nome", autocomplete: "organization", placeholder: "Ex.: Clínica Exemplo" }),
      saudacao: el("input", { id: "nc-saudacao", placeholder: "Ex.: Dra. Lara ou pessoal da Clínica Exemplo" }),
      telefone: el("input", { id: "nc-telefone", inputmode: "tel", placeholder: "(65) 99999-0000" }),
      email: el("input", { id: "nc-email", type: "email", placeholder: "contato@empresa.com.br" }),
      produto: el("select", { id: "nc-produto" }, produtos.map(function (p) { return el("option", { value: p, text: p }); }))
    };
    var erro = el("p", { class: "erro", hidden: "" });
    function campo(rotulo, k) { return el("label", { class: "campo", for: campos[k].id }, [rotulo, campos[k]]); }
    function salvar() {
      var nome = campos.nome.value.trim(), saudacao = campos.saudacao.value.trim();
      var tel = campos.telefone.value.trim() ? limparTelefone(campos.telefone.value) : "";
      var email = campos.email.value.trim();
      var msg = !nome ? "Preencha o nome do cliente." : !saudacao ? "Preencha como a Letícia chama o cliente." :
        (campos.telefone.value.trim() && !tel) ? "O WhatsApp precisa ter DDD, como (65) 99999-0000." :
        (!tel && !email) ? "Informe um WhatsApp ou um e-mail." : "";
      if (msg) { erro.textContent = msg; erro.hidden = false; return; }
      var id = "C" + Date.now().toString(36).toUpperCase();
      gravar("clientes/" + id, {
        nome: nome, saudacao: saudacao, telefone: tel, email: email, produto: campos.produto.value,
        origem: "Cadastro manual", leadId: null, segmento: "", etapa: 1, situacao: "ativo",
        criadoEm: new Date().toISOString(), dataKickoff: null, dataGravacao: null
      }, "Cliente cadastrado: boas-vindas para hoje", true).then(function (ok) {
        if (ok) { estado.novoCliente = false; limparRascunho("nc-"); render(); }
      });
    }
    return el("article", { class: "card form" }, [
      el("h2", { text: "Novo cliente" }),
      el("div", { class: "grade" }, [campo("Nome", "nome"), campo("Saudação", "saudacao"),
        campo("WhatsApp", "telefone"), campo("E-mail", "email"), campo("Produto contratado", "produto")]),
      erro,
      el("div", { class: "acoes" }, [
        el("button", { type: "button", class: "btn principal", disabled: !estado.podeMarcar, onclick: salvar }, ["Cadastrar e começar"]),
        el("button", { type: "button", class: "btn", onclick: function () { estado.novoCliente = false; limparRascunho("nc-"); render(); } }, ["Cancelar"])
      ])
    ]);
  }

  function ordenarClientes(a, b) { return Regras.ordenarClientes(a, b, etapasPV()); }

  function renderPV() {
    var todos = Object.keys(estado.clientes).map(function (k) { return estado.clientes[k]; }).sort(ordenarClientes);
    var cont = { hoje: 0, andamento: 0, pausado: 0, concluido: 0, todos: todos.length };
    var limite = hoje().getTime() + 8 * DIA, gravacoes = 0;
    todos.forEach(function (c) {
      var g = grupoPV(c);
      cont[g]++;
      if (c.dataGravacao && g !== "concluido" && g !== "pausado") {
        var t = new Date(c.dataGravacao).getTime();
        if (t >= hoje().getTime() && t < limite) gravacoes++;
      }
    });
    placar([cont.hoje, "Para hoje"], [cont.hoje + cont.andamento, "Clientes ativos"], [gravacoes, "Gravações em 7 dias"],
      [cont.concluido, "Concluídos"], null);
    abas(cont);
    var etapas = etapasPV().map(function (e) { return e.n + " · " + e.nome; });
    preencherSelect("f-etapa", etapas);
    var prods = {};
    todos.forEach(function (c) { if (c.produto) prods[c.produto] = 1; });
    preencherSelect("f-produto", Object.keys(prods).sort());

    var f = estado.filtro.pv;
    var visiveis = todos.filter(function (c) {
      if (!Regras.casaBusca(c, estado.busca)) return false;
      if (f.grupo !== "todos" && grupoPV(c) !== f.grupo) return false;
      if (f.etapa && (etapaPV(c) + " · " + (defEtapa(etapaPV(c)) || {}).nome) !== f.etapa) return false;
      if (f.produto && c.produto !== f.produto) return false;
      return true;
    });
    var alvo = $("fila");
    if (!estado.carregado.clientes) { limparFila(); carregando(alvo); return desenharDetalhe(); }
    if (!estado.pv) {
      limparFila();
      vazio(alvo, "Faltam os textos do pós-venda", "Peça ao Claude para semear config/posvenda no banco da central.");
      return desenharDetalhe();
    }
    estado.visiveis.pv = visiveis;
    escolherSelecao(visiveis);
    prepararFila("pv");
    var form = alvo.querySelector(":scope > .form");
    if (estado.novoCliente && !form) alvo.insertBefore(formNovoCliente(), alvo.firstChild);
    else if (!estado.novoCliente && form) alvo.removeChild(form);
    reconciliar(visiveis, { alvo: alvo, fabrica: linhaCliente, colecao: "clientes", ctx: JSON.stringify([estado.pv, estado.podeMarcar, hoje().getTime()]) });
    if (!todos.length) {
      vazio(alvo, "Nenhum cliente no pós-venda", "Use Fechou negócio num lead do aquecimento ou Novo cliente para quem já comprou.");
    } else if (!visiveis.length) {
      if (f.grupo === "hoje") vazio(alvo, "Nada para hoje", "As próximas etapas aparecem em Em andamento.");
      else vazio(alvo, "Nada neste filtro", "Troque a aba ou limpe os filtros.");
    }
    desenharDetalhe();
  }

  // ================= comum =================
  function placar(a, b, c, d, progresso, linha) {
    [a, b, c, d].forEach(function (x, i) { $("p" + (i + 1)).textContent = x[0]; $("p" + (i + 1) + "l").textContent = x[1]; });
    $("linha-meta").textContent = linha || (a[0] + " " + a[1].toLowerCase() + " · " + b[0] + " " + b[1].toLowerCase());
    $("barra").style.transform = "scaleX(" + (progresso == null ? 0 : Math.min(1, progresso)) + ")";
    $("barra").parentNode.hidden = progresso == null;
  }
  function abas(cont) {
    var f = estado.filtro[estado.funil], nav = $("abas");
    var chave = estado.funil;
    if (nav.dataset.funil !== chave) {
      nav.dataset.funil = chave;
      nav.textContent = "";
      ABAS[chave].forEach(function (a) {
        nav.appendChild(el("button", { type: "button", "data-grupo": a[0] }, [a[1], el("span", { class: "n" })]));
      });
    }
    Array.prototype.forEach.call(nav.querySelectorAll("button"), function (b) {
      b.setAttribute("aria-pressed", String(b.dataset.grupo === f.grupo));
      b.querySelector(".n").textContent = cont[b.dataset.grupo];
    });
  }
  function carregando(alvo) {
    alvo.appendChild(el("div", { class: "vazio" }, [el("b", { text: "Carregando" }), "Conectando ao banco da central."]));
  }
  function vazio(alvo, titulo, texto) {
    alvo.appendChild(el("div", { class: "vazio" }, [el("b", { text: titulo }), texto]));
  }
  function render() {
    var pv = estado.funil === "pv", ld = estado.funil === "ld";
    $("f-aq").setAttribute("aria-pressed", String(estado.funil === "aq"));
    $("f-pv").setAttribute("aria-pressed", String(pv));
    $("f-ld").setAttribute("aria-pressed", String(ld));
    $("sel-aq").hidden = estado.funil !== "aq";
    $("sel-pv").hidden = !pv;
    $("sel-ld").hidden = !ld;
    $("novo-cliente").disabled = !estado.podeMarcar || !estado.pv;
    var leads = Object.keys(estado.leads).filter(function (k) { return k !== "TESTE"; }).map(function (k) { return estado.leads[k]; });
    var clientes = Object.keys(estado.clientes).map(function (k) { return estado.clientes[k]; });
    $("n-aq").textContent = leads.filter(function (l) { return grupo(l) === "hoje"; }).length || "";
    $("n-pv").textContent = estado.pv ? (clientes.filter(function (c) { return grupoPV(c) === "hoje"; }).length || "") : "";
    // Leads: o número é de quem ainda falta completar (o rótulo aparece no trilho largo e vai para leitor de tela nos outros).
    var faltam = leads.filter(function (l) { return statusLD(l) !== "completo"; }).length;
    var nld = $("n-ld");
    if (nld.dataset.v !== String(faltam)) {
      nld.dataset.v = String(faltam);
      nld.textContent = "";
      if (faltam) { nld.appendChild(document.createTextNode(String(faltam))); nld.appendChild(el("span", { class: "rot", text: " a completar" })); }
    }
    document.body.dataset.funil = estado.funil;
    if (pv) renderPV(); else if (ld) renderLD(); else renderAQ();
    aplicarDetalhe();
  }
  function trocarFunil(f) {
    estado.funil = f;
    estado.fechando = null;
    estado.detalheAberto = false;
    try { localStorage.setItem("central-funil", f); } catch (e) { /* sem armazenamento: tudo bem */ }
    render();
    window.scrollTo(0, 0);
  }

  // ---------- eventos ----------
  $("f-aq").addEventListener("click", function () { trocarFunil("aq"); });
  $("f-pv").addEventListener("click", function () { trocarFunil("pv"); });
  $("f-ld").addEventListener("click", function () { trocarFunil("ld"); });
  $("f-ld-segmento").addEventListener("change", function (e) { estado.filtro.ld.segmento = e.target.value; render(); });
  var buscaTimer;
  function aplicarBusca(v) { clearTimeout(buscaTimer); estado.busca = v; render(); }
  $("f-busca").addEventListener("input", function (e) {
    clearTimeout(buscaTimer);
    var v = e.target.value;
    buscaTimer = setTimeout(function () { estado.busca = v; render(); }, 200);
  });
  $("abas").addEventListener("click", function (e) {
    var b = e.target.closest("button");
    if (!b) return;
    estado.filtro[estado.funil].grupo = b.dataset.grupo;
    render();
  });
  ["segmento", "faixa", "canal"].forEach(function (k) {
    $("f-" + k).addEventListener("change", function (e) { estado.filtro.aq[k] = e.target.value; render(); });
  });
  ["etapa", "produto"].forEach(function (k) {
    $("f-" + k).addEventListener("change", function (e) { estado.filtro.pv[k] = e.target.value; render(); });
  });
  // Linhas da fila e linhas da tabela de Leads selecionam do mesmo jeito.
  var LINHA = ".linha[data-id], tr[data-id]";
  $("fila").addEventListener("click", function (e) {
    var linha = e.target.closest(LINHA);
    if (!linha || e.target.closest("a, button")) return;  // Enviar e Copiar têm ação própria
    selecionar(linha.dataset.id, { foco: true });
    abrirDetalhe(linha.dataset.id);
  });
  $("fila").addEventListener("keydown", function (e) {
    if (e.target.matches && e.target.matches(LINHA) && (e.key === "Enter" || e.key === " ")) {
      if (e.key === "Enter" && !emGaveta()) return;  // com o detalhe ao lado, Enter na linha envia (teclado)
      e.preventDefault();
      selecionar(e.target.dataset.id, { foco: true });
      abrirDetalhe(e.target.dataset.id);
    }
  });
  $("novo-cliente").addEventListener("click", function () { estado.novoCliente = true; render(); if ($("nc-nome")) $("nc-nome").focus(); });
  document.addEventListener("input", function (e) {
    if (e.target.id && /^(nc|nk|nh)-/.test(e.target.id)) estado.rascunho[e.target.id] = e.target.value;
  });
  document.addEventListener("change", function (e) {
    if (e.target.id && /^(nc|nk)-/.test(e.target.id)) estado.rascunho[e.target.id] = e.target.value;
  });
  // Vira o dia com a página aberta: recalcula o que vence hoje.
  setInterval(function () { if (estado.carregado.leads) render(); }, 10 * 60 * 1000);

  // ---------- banco ----------
  function iniciar(db) {
    if (!db) {
      estado.carregado = { leads: true, clientes: true };
      desligar("O banco da central não respondeu. Entre com a sua conta para ver a fila e marcar os envios.");
      return;
    }
    estado.db = db;
    estado.podeMarcar = true;
    $("conexao").className = "conexao on";
    $("conexao").textContent = "Ao vivo";
    function colecao(nome, chave) {
      db.collection(nome).onSnapshot(function (snap) {
        var novo = {};
        snap.docs.forEach(function (d) {
          if (!d.exists) return;
          var dados = Object.assign({}, d.data());
          dados.id = d.id;
          novo[d.id] = dados;
        });
        estado[chave] = novo;
        estado.carregado[chave] = true;
        render();
      }, function () {
        estado.carregado[chave] = true;
        desligar("A conexão com o banco caiu. Recarregue a página para tentar de novo.");
      });
    }
    colecao("leads", "leads");
    colecao("clientes", "clientes");
    db.doc("config/meta").onSnapshot(function (d) {
      if (d.exists) { estado.meta = Object.assign({}, estado.meta, d.data()); render(); }
    }, function () {});
    db.doc("config/fotos").onSnapshot(function (d) {
      estado.fotos = d.exists ? (d.data().fotos || null) : null;
      render();
    }, function () {});
    db.doc("config/posvenda").onSnapshot(function (d) {
      estado.pv = d.exists ? d.data() : null;
      render();
    }, function () {});
  }

  // Layout por largura: o CSS decide a grade; o atributo só espelha a faixa para os testes e para o drawer.
  function layoutAtual() {
    var w = window.matchMedia;
    return w("(min-width: 1280px)").matches ? "tres" : w("(min-width: 1024px)").matches ? "dois" : w("(min-width: 760px)").matches ? "gaveta" : "uma";
  }
  function sincronizarLayout() {
    var antes = document.body.dataset.layout;
    document.body.dataset.layout = layoutAtual();
    if (!emGaveta()) estado.detalheAberto = false;
    if (antes && antes !== document.body.dataset.layout) render();  // Leads troca entre tabela e linhas; o detalhe troca de gaveta
  }
  ["(min-width: 1280px)", "(min-width: 1024px)", "(min-width: 760px)"].forEach(function (q) {
    var m = window.matchMedia(q);
    if (m.addEventListener) m.addEventListener("change", sincronizarLayout); else m.addListener(sincronizarLayout);
  });
  sincronizarLayout();

  try {
    var salvo = location.hash === "#posvenda" ? "pv" : location.hash === "#leads" ? "ld" : localStorage.getItem("central-funil");
    if (salvo === "pv" || salvo === "aq" || salvo === "ld") estado.funil = salvo;
    ["aq", "pv", "ld"].forEach(function (f) { estado.sel[f] = localStorage.getItem("central-sel-" + f) || null; });
    if (!estado.sel.aq) estado.sel.aq = localStorage.getItem("central-selecionado") || null;  // chave da versão anterior: era só do Aquecimento
  } catch (e) { /* sem armazenamento: começa no aquecimento */ }
  render();
  var usar = window.claude && typeof window.claude.use === "function" ? window.claude.use("db") : Promise.resolve(null);
  Promise.resolve(usar).then(iniciar, function () { iniciar(null); });
  var usarDownloads = window.claude && typeof window.claude.use === "function" ? window.claude.use("downloads") : Promise.resolve(null);
  Promise.resolve(usarDownloads).then(function (d) { estado.downloads = d || null; render(); }, function () {});
})();
