(function () {
  "use strict";
  var NOMES_TOQUE = { 1: "Visita", 2: "Diagnóstico", 3: "Piloto" };
  var DIA = Regras.DIA;
  var ABAS = {
    aq: [["hoje", "Para hoje"], ["aguardando", "Aguardando"], ["semcontato", "Sem contato"], ["respondeu", "Responderam"], ["fechou", "Fecharam"],
         ["encerrado", "Sem resposta"], ["sair", "Saíram"], ["todos", "Todos"]],
    pv: [["hoje", "Para hoje"], ["andamento", "Em andamento"], ["pausado", "Pausados"], ["concluido", "Concluídos"], ["todos", "Todos"]],
    ld: [["todos", "Todos"], ["completo", "Completos"], ["parcial", "Parciais"], ["bruto", "Sem enriquecimento"], ["setor", "Contato de setor"]],
    bs: [["base", "Na base"], ["pedido", "Na fila do Claude"], ["na_cadencia", "Na cadência"], ["todos", "Todas"]]
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
    enriq: null,                                    // config/enriquecimento (o Claude grava; a página só pede)
    base: {},                                       // coleção base (faixas B e C da Explee), assinada só quando o funil Base abre
    baseLista: [],                                  // a mesma coleção já ordenada (faixa, score)
    baseAssinada: false,
    bsLimite: 100,                                  // linhas mostradas; "Mostrar mais" soma 100
    bsConfirmar: false,                             // confirmação do pedido dos filtrados, no próprio lugar
    bsLote: null,                                   // { feitos, total } enquanto o pedido em lote grava
    carregado: { leads: false, clientes: false, enriq: false, base: false },
    fechando: null,
    novoCliente: false,
    filtro: {
      aq: { grupo: "hoje", segmento: "", faixa: "", canal: "" },
      pv: { grupo: "hoje", etapa: "", produto: "" },
      ld: { grupo: "todos", segmento: "" },
      bs: { grupo: "base", segmento: "", faixa: "", persona: "" }
    },
    busca: "",                                      // só em memória; vale para os três funis
    novoContato: null,
    sel: { aq: null, pv: null, ld: null, bs: null }, // um item selecionado por funil (a Base não usa)
    selIni: { aq: false, pv: false, ld: false, bs: false },  // a seleção salva já foi conferida com a fila?
    abaDetalhe: { aq: "perfil", pv: "etapa", ld: "perfil" },
    visiveis: { aq: [], pv: [], ld: [], bs: [] },
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
  // #toast é a única região aria-live: nunca some com hidden (o leitor de tela deixa de anunciar). Vazio, o CSS o
  // deixa sem caixa; o texto entra no tick seguinte à limpeza para ser anunciado como mudança.
  var toastTimer, toastVez = 0;
  var DESFAZER_MS = 8000;
  var FIXO = -1;  // aviso que só sai por ação dela
  // Envio não marcado: o aviso fixo fica pendente. Um aviso comum aparece no lugar dele e, ao sumir, ele volta.
  // Só sai com "Marcar como enviado" dando certo, com Fechar ou com um envio bem-sucedido do mesmo toque.
  var avisoFixo = null;
  function esconderToast() { limparToast(); if (avisoFixo) avisoFixo.mostrar(); }
  function soltarFixo(chave) { if (avisoFixo && avisoFixo.chave === chave) avisoFixo = null; }
  function limparToast() {
    toastVez++;
    clearTimeout(toastTimer);
    $("toast").textContent = "";
  }
  function toast(txt, conteudo, ms) {
    var t = $("toast");
    limparToast();
    var vez = toastVez;
    setTimeout(function () {
      if (vez !== toastVez) return;  // outro aviso já tomou o lugar
      t.appendChild(document.createTextNode(txt));
      if (conteudo) t.appendChild(conteudo);
      if (ms !== FIXO) toastTimer = setTimeout(function () { if (vez === toastVez) esconderToast(); }, ms || 2400);
    }, 0);
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
  // valores: ["a", "b"] ou [["valor", "rótulo"], ...]
  function preencherSelect(id, valores) {
    var s = $(id), atual = s.value, pares = valores.map(function (v) { return Array.isArray(v) ? v : [v, v]; });
    var chave = JSON.stringify(pares);
    if (s.dataset.chave === chave) return;
    s.dataset.chave = chave;
    while (s.options.length > 1) s.remove(1);
    pares.forEach(function (v) { s.add(new Option(v[1], v[0])); });
    s.value = pares.some(function (v) { return v[0] === atual; }) ? atual : "";
  }

  // ---------- escrita ----------
  var SEM_ACESSO = { revoked: 1, not_granted: 1, capability_disabled: 1, capability_removed: 1, invalid_argument: 1 };
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
  // aoFalhar troca o aviso genérico de erro (exceto quando a conta perdeu o acesso: aí vale o aviso fixo do topo).
  function gravar(caminho, dados, msg, criar, aoFalhar) {
    if (!estado.podeMarcar || estado.gravando[caminho]) return Promise.resolve(false);
    estado.gravando[caminho] = true;
    render();
    var ref = estado.db.doc(caminho);
    return (criar ? ref.set(dados) : ref.update(dados)).then(function () { if (msg) toast(msg); return true; },
      function (e) { if (aoFalhar && !SEM_ACESSO[e && e.code]) aoFalhar(e); else falhou(e); return false; })
      .then(function (ok) { delete estado.gravando[caminho]; render(); focarSePerdido(); return ok; });
  }
  // Depois de uma ação o foco fica no lead: no título do detalhe aberto em gaveta, senão na linha selecionada.
  function focoPerdido() {
    var a = document.activeElement;
    return !a || a === document.body || !a.isConnected;
  }
  function focarSelecao() {
    if (estado.detalheAberto && $("detalhe-titulo")) { $("detalhe-titulo").focus({ preventScroll: true }); return; }
    var linha = sel() && $("fila").querySelector('[data-id="' + sel() + '"]');
    if (linha) linha.focus({ preventScroll: true });
  }
  function focarSePerdido() { if (focoPerdido()) focarSelecao(); }
  // Ao mudar a seleção depois de uma gravação, o foco acompanha se estava na fila ou tinha se perdido.
  function focoAcompanha() { return focoPerdido() || $("fila").contains(document.activeElement); }
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
    marcarToque(l, Math.min(etapa(l) + 1, 3), new Date().toISOString());
  }
  // Grava o toque n; se a gravação falhar, a conversa já abriu: o aviso fica até ela marcar de novo (sem reabrir) ou fechar.
  function marcarToque(l, n, quando) {
    var fila = estado.visiveis.aq;
    var dados = { etapa: n };
    dados["enviado" + n] = quando;
    var chave = "leads/" + l.id + "/" + n;
    var falha = function () {
      avisoFalhaEnvio(chave, "A conversa abriu, mas o toque " + n + " não foi marcado", function () {
        var atual = estado.leads[l.id];
        if (!atual) { soltarFixo(chave); toast("Este lead não está mais na central"); return; }
        if (etapa(atual) >= n) { soltarFixo(chave); toast("O toque " + n + " já está marcado"); return; }
        if (etapa(atual) !== n - 1) { soltarFixo(chave); toast("Nada a marcar: o lead mudou de etapa"); return; }  // nunca pula um toque
        marcarToque(atual, n, quando);
      });
    };
    gravar("leads/" + l.id, registrar(l, dados, "Toque " + n + " enviado"), null, false, falha).then(function (ok) {
      if (!ok) return;  // falha: o aviso fixo já está na tela e a seleção fica onde está
      soltarFixo(chave);
      avisoDesfazer(l, n);
      var prox = estado.funil === "aq" ? Regras.proximoDoDia(fila, l.id, grupo) : null;  // fora do Aquecimento o envio não mexe na seleção
      // o foco segue para o próximo quando estava na fila ou se perdeu (a linha enviada saiu de Para hoje)
      if (prox) selecionar(prox, { foco: focoAcompanha() });
    });
  }
  // Aviso de 8 segundos com Desfazer, igual para Aquecimento e pós-venda.
  function avisoComDesfazer(texto, desfazer) {
    var b = el("button", { type: "button", class: "desfazer", onclick: desfazer }, ["Desfazer"]);
    toast(texto + " · ", b, DESFAZER_MS);
  }
  // Aviso fixo de envio não marcado: "Marcar como enviado" só regrava (o link não abre de novo); Fechar descarta.
  function avisoFalhaEnvio(chave, texto, marcar) {
    avisoFixo = { chave: chave, mostrar: function () {
      var acoes = el("span", null, [
        el("button", { type: "button", class: "marcar", onclick: marcar }, ["Marcar como enviado"]),
        " · ",
        el("button", { type: "button", class: "fechar", "aria-label": "Fechar o aviso", onclick: function () { avisoFixo = null; limparToast(); focarSePerdido(); } }, ["Fechar"])
      ]);
      toast(texto + ". ", acoes, FIXO);
    } };
    avisoFixo.mostrar();
  }
  function avisoDesfazer(l, n) { avisoComDesfazer("Toque " + n + " marcado", function () { desfazerToque(l, n); }); }
  // n = o toque que o aviso ou a linha do histórico promete desfazer; se o lead já andou, não desfaz outro.
  function desfazerToque(l, n) {
    var atual = estado.leads[l.id] || l;
    var e = etapa(atual);
    esconderToast();
    if (e < 1 || (n != null && e !== n)) { toast("Nada a desfazer"); return; }
    var dados = { etapa: e - 1 };
    dados["enviado" + e] = null;
    gravar("leads/" + l.id, registrar(atual, dados, "Toque " + e + " desfeito")).then(function (ok) {
      if (ok && estado.funil === "aq") selecionar(l.id, { foco: focoAcompanha() });  // trocou de funil: não mexe na seleção do outro
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

  // ---------- hot leads da Explee ----------
  // Quem respondeu uma campanha da Explee chega sem cadência (toques: []) e já como "respondeu". O primário é
  // responder o e-mail; nada aqui marca envio.
  function semCadencia(l) { return !(l.toques || []).length; }
  function temMensagem(t) { return !!(t && (t.mensagem || t.corpo)); }
  function emailExplee(l) { return ((l.explee && l.explee.email) || emailDestino(l) || "").trim(); }
  function mailtoExplee(l) { return mailto(emailExplee(l), "Re: " + (l.nome || ""), ""); }
  function chipExplee(l) { return l.explee ? el("span", { class: "chip explee", text: "Explee" }) : null; }
  // Lead da base Explee que entrou sem telefone (sem verba para enriquecer agora).
  function migradoSemEnriquecer(l) {
    return (l.flags || []).indexOf("migrado sem enriquecer") >= 0 || !!(l.enriquecimento && l.enriquecimento.migradoSemEnriquecer);
  }
  function chipMigrado(l) { return migradoSemEnriquecer(l) ? el("span", { class: "chip migrado", text: "Migrado sem enriquecer" }) : null; }
  function textoSemContato(l) { return l.canal === "E-mail" ? "Sem e-mail" : "Sem telefone"; }
  function dataHora(iso) {
    var d = new Date(iso);
    if (!iso || isNaN(d)) return "";
    return dataCurta(d) + " " + String(d.getHours()).padStart(2, "0") + ":" + String(d.getMinutes()).padStart(2, "0");
  }
  function blocoExplee(l) {
    var x = l.explee || {};
    var curta = x.respostaCurta || x.resposta || "";
    var completa = x.resposta && x.resposta.trim() !== curta.trim() ? x.resposta : "";
    var quem = [x.pessoa, x.cargo].filter(Boolean).join(", ");
    var meta = [quem, x.campanha ? "campanha " + x.campanha : ""].filter(Boolean).join(" · ");
    return el("section", { class: "resposta-explee", id: "explee-" + l.id, "aria-labelledby": "explee-titulo-" + l.id }, [
      el("h3", { id: "explee-titulo-" + l.id, text: "Resposta na Explee" }),
      el("p", { class: "resposta", text: curta || "A Explee não mandou o texto da resposta." }),
      el("p", { class: "explee-meta" }, [meta ? meta + (x.quenteEm ? " · " : "") : "",
        x.quenteEm ? el("time", { datetime: x.quenteEm, text: dataHora(x.quenteEm) }) : null]),
      completa ? el("details", { class: "explee-completo" }, [
        el("summary", { text: "E-mail completo, com a mensagem da campanha" }),
        el("p", { class: "resposta", text: completa })
      ]) : null
    ]);
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
      if (ok && viz && !ainda && sel() === l.id) selecionar(viz, { foco: focoAcompanha() });
      return ok;
    });
  }
  function resultado(l, g, semMarca) {
    var b = function (id, txt, fn, cls) {
      return el("button", { type: "button", id: id + "-" + l.id, class: "btn" + (cls ? " " + cls : ""), disabled: semMarca, onclick: fn }, [txt]);
    };
    var filhos;
    var semVolta = g === "respondeu" && semCadencia(l);  // sem cadência não há para onde voltar
    if (g === "hoje" || g === "aguardando" || g === "semcontato" || g === "encerrado" || semVolta) {
      if (estado.confirmarSair === l.id) {
        filhos = [
          b("r-sair-ok", "Confirmar saída", function () { estado.confirmarSair = null; situacao(l, "sair", "Não contatar de novo"); }, "alerta"),
          b("r-sair-nao", "Cancelar", function () { estado.confirmarSair = null; render(); $("r-sair-" + l.id) && $("r-sair-" + l.id).focus(); })
        ];
      } else {
        filhos = [
          semVolta ? null : b("r-resp", "Respondeu", function () { situacao(l, "respondeu", "Marcado como respondeu"); }),
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
    return el("div", { class: "resultado", role: "group", "aria-label": "Resultado" }, filhos.filter(Boolean));
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
      if (atual === "cadencia") return el("div", { class: "perfil" }, semCadencia(l) ? [secaoCadencia(l)] : [trilho(l), secaoCadencia(l)]);
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
    // sem contato ainda é cadência: o detalhe mostra o próximo toque, o Copiar e o Enviar desativado com o motivo
    var naCadencia = ativo || g === "semcontato";
    var semMarca = !estado.podeMarcar || !!estado.gravando["leads/" + l.id];
    var email = l.canal === "E-mail";
    var n = Math.min(e + 1, 3), t = toque(l, n);
    var teste = l.id === "TESTE";

    var rotulo = { hoje: "Toque " + n + " hoje", aguardando: "Aguardando", semcontato: textoSemContato(l), respondeu: "Respondeu", fechou: "Fechou",
                   encerrado: "Sem resposta", sair: "Saiu" }[g];
    var cab = el("div", { class: "cab" }, [
      teste ? el("div", null, [
        el("h2", { text: "Card de teste" }),
        el("div", { class: "meta", text: "Manda as mensagens para o WhatsApp da própria Reiners." })
      ]) : el("div", null, [
        el("h2", { text: l.nome || l.id }),
        el("div", { class: "meta" }, [el("span", { class: "num", text: l.id }), l.categoria && !(l.explee && l.categoria === "Explee") ? " · " + l.categoria : null, chipExplee(l), chipMigrado(l),
          (l.alertas || []).length ? el("a", { class: "chip alerta", href: "#alertas-" + l.id, onclick: function (ev) { ev.preventDefault(); irParaAlertas(l); } },
            [(l.alertas.length === 1 ? "1 alerta" : l.alertas.length + " alertas")]) : null])
      ]),
      el("span", { class: "estado " + g, text: rotulo })
    ]);

    var emLeads = estado.funil === "ld";  // na aba Leads o detalhe abre no perfil; só mostra o Enviar se o lead está na cadência
    var verToque = naCadencia ? n : e || 1;
    var tv = toque(l, verToque);
    var texto = email ? ("Assunto: " + (tv.assunto || "") + "\n\n" + (tv.corpo || "")) : mensagemToque(l, tv);
    var comFoto = !email && naCadencia && n === 1;
    var dest = destinoDe(l, email);
    var ca = contatoAtivo(l);
    var semDestino = email ? "Sem e-mail cadastrado" : "Sem telefone cadastrado";
    var semCad = semCadencia(l);
    var comExplee = !!l.explee && !teste;

    var acoes = [];
    // Hot lead da Explee: o primário é responder o e-mail dela. Mailto simples, que não marca nada.
    if (comExplee && emailExplee(l)) {
      acoes.push(el("a", { id: "acao-email-" + l.id, class: "btn principal abrir-email", href: mailtoExplee(l), target: "_blank", rel: "noopener" }, ["Abrir e-mail"]));
    }
    if (naCadencia && !semCad) {
      var podeHoje = g === "hoje";
      var link = !dest || !temMensagem(t) ? "" : email ? mailtoToque(l, t) : linkToque(l, t);
      var liberado = podeHoje && !!link;
      acoes.push(el("a", { id: "acao-enviar-" + l.id, class: "btn enviar" + (comExplee ? "" : " principal"), href: liberado ? link : null, target: liberado ? "_blank" : null, rel: liberado ? "noopener" : null,
        "aria-disabled": liberado ? null : "true", onclick: function () { if (liberado) enviar(l); } }, ["Enviar"]));
      if (email) {
        acoes.push(el("button", { type: "button", id: "acao-copiar-assunto-" + l.id, class: "btn copiar", onclick: function () { copiar(t.assunto || "", "Assunto"); } }, ["Copiar assunto"]));
        acoes.push(el("button", { type: "button", id: "acao-copiar-" + l.id, class: "btn copiar", onclick: function () { copiar(t.corpo || "", "Corpo"); } }, ["Copiar corpo"]));
      } else {
        acoes.push(el("button", { type: "button", id: "acao-copiar-" + l.id, class: "btn copiar", onclick: function () { copiar(mensagemToque(l, t), "Mensagem"); } }, ["Copiar"]));
      }
    }

    return el("article", { "data-detalhe": l.id, class: "lead" + (teste ? " teste" : "") + (g === "sair" || g === "encerrado" ? " apagado" : "") }, [
      cab,
      comExplee ? blocoExplee(l) : null,
      (emLeads && !naCadencia) || semCad ? null : el("div", { class: "toque-atual" }, [
        el("div", { class: "toque-rotulo", text: "Toque " + verToque + " · " + NOMES_TOQUE[verToque] + (email ? " · e-mail" : " · WhatsApp") }),
        el("p", { class: "msg", text: texto }),
        el("div", { class: "destino" + (dest ? "" : " sem") }, dest
          ? ["Para: ", ca && ca.nome ? ca.nome + " · " : "", email ? dest : el("span", { class: "num", text: dest })]
          : [semDestino]),
        // o alerta fica colado no Enviar que ele deve segurar (a cópia completa continua em Perfil, em Cuidado e pendências)
        (l.alertas || []).length ? el("div", { class: "alertas-toque", id: "alertas-" + l.id, tabindex: "-1" }, linhasAlerta(l, true)) : null
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
    var cont = { hoje: 0, aguardando: 0, semcontato: 0, respondeu: 0, fechou: 0, encerrado: 0, sair: 0, todos: reais.length };
    var toquesHoje = 0;
    reais.forEach(function (l) {
      cont[grupo(l)]++;
      [1, 2, 3].forEach(function (n) { if (mesmoDia(l["enviado" + n], agora)) toquesHoje++; });
    });
    placar([cont.hoje, "Para hoje"], [toquesHoje, "Toques hoje"], [cont.hoje + cont.aguardando, "Em cadência"],
      [cont.respondeu + cont.fechou, "Responderam"]);
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
      else if (f.grupo === "semcontato") vazio(alvo, "Todos têm contato", "Lead na cadência sem telefone ou e-mail aparece aqui até ganhar um destino.");
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
    if (g === "semcontato") return [textoSemContato(l)];
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
    var semCad = semCadencia(l);
    var link = !destinoDe(l, email) || !temMensagem(t) ? "" : email ? mailtoToque(l, t) : linkToque(l, t);
    // enquanto a gravação deste lead não volta, o link não abre de novo (sem banco ele abre normalmente)
    var podeEnviar = g === "hoje" && !!link && !estado.gravando["leads/" + l.id];
    // só a linha selecionada leva o Enviar cheio; nas outras ele é contornado, para a fila não virar uma coluna de primários
    var btnEnviar = el("a", { class: "btn enviar" + (sel() === l.id ? " principal" : ""), href: podeEnviar ? link : null, target: podeEnviar ? "_blank" : null, rel: podeEnviar ? "noopener" : null,
      "aria-disabled": podeEnviar ? null : "true", "aria-label": "Enviar toque " + n + " para " + (l.nome || l.id),
      onclick: function () { if (podeEnviar) enviar(l); } }, ["Enviar"]);
    var btnCopiar = el("button", { type: "button", class: "btn copiar", disabled: !ativo, "aria-label": "Copiar mensagem do toque " + n + " de " + (l.nome || l.id),
      onclick: function () { copiar(email ? (t.corpo || "") : mensagemToque(l, t), email ? "Corpo" : "Mensagem"); } }, ["Copiar"]);
    // Sem cadência (hot lead da Explee): nada de Enviar/Copiar; a linha leva o Abrir e-mail, que não marca nada.
    var acoes = [btnEnviar, btnCopiar];
    // Sem contato: em vez de um Enviar desativado, a linha só diz o que falta (em "situação") e leva a flag. Se o
    // enriquecimento já achou o contato, a linha mostra quem é e o "Usar na cadência" (a escolha é dela).
    var achado = g === "semcontato" && !teste ? Regras.contatoEncontrado(l) : null;
    if (g === "semcontato") acoes = achado ? [botaoUsarContato(l, achado, semMarca, true)] : [];
    if (semCad) acoes = l.explee && emailExplee(l) ? [el("a", { class: "btn abrir-email" + (sel() === l.id ? " principal" : ""), href: mailtoExplee(l), target: "_blank", rel: "noopener",
      "aria-label": "Abrir e-mail para " + (l.nome || l.id) }, ["Abrir e-mail"])] : [];
    var x = l.explee || {};
    var sub = teste ? "WhatsApp da própria Reiners" : l.explee ? [x.pessoa, l.segmento].filter(Boolean).join(" · ") : [l.categoria, l.bairro].filter(Boolean).join(" · ");
    var quandoTxt = semCad && l.explee ? ["respondeu na Explee", x.quenteEm ? " · " : "", x.quenteEm ? el("span", { class: "num", text: dataCurta(x.quenteEm) }) : null] : quandoDe(l);
    return el("div", { class: "linha" + (teste ? " teste" : "") + (g === "sair" || g === "encerrado" ? " apagado" : ""), "data-id": l.id, tabindex: "0",
      role: "group", "aria-label": teste ? "Card de teste" : (l.nome || l.id), "aria-current": sel() === l.id ? "true" : null }, [
      el("div", { class: "info" }, [
        el("span", { class: "nome", text: teste ? "Card de teste" : (l.nome || l.id) }),
        el("span", { class: "sub", text: sub }),
        el("div", { class: "situacao" }, [
          semCad || g === "semcontato" ? null : el("span", { class: "pontos", role: "img", "aria-label": pontos.fala }, pontos.classes.map(function (c) { return el("i", { class: c }); })),
          el("span", { class: "quando" }, quandoTxt),
          chipExplee(l),
          achado ? el("span", { class: "achado", text: (email ? "E-mail encontrado: " : "Celular encontrado: ") + (achado.nome || PAPEIS[achado.papel] || "contato") }) : null,
          g === "semcontato" && !achado ? chipMigrado(l) : null,
          (l.alertas || []).length ? el("span", { class: "chip alerta", text: "Alerta" }) : null
        ])
      ]),
      acoes.length ? el("div", { class: "acoes" }, acoes) : null
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
  function colecaoDoFunil() { return estado.funil === "pv" ? estado.clientes : estado.funil === "bs" ? estado.base : estado.leads; }
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
    } else if (estado.focoPendente && (!ativo || ativo === document.body)) {
      idFoco = estado.focoPendente;  // o botão estava desativado durante a gravação: volta para ele agora
    }
    estado.focoPendente = null;
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
        if (novo.disabled) estado.focoPendente = idFoco;
        else {
          novo.focus({ preventScroll: true });
          try { if (ini != null) novo.setSelectionRange(ini, fim); } catch (e) { /* tudo bem */ }
        }
      }
    }
  }

  // ---------- detalhe como gaveta (760–1023px) ou tela cheia (<760px) ----------
  function emGaveta() { var l = document.body.dataset.layout; return l === "gaveta" || l === "uma"; }
  function abrirDetalhe(id) {
    if (!emGaveta() || estado.funil === "bs") return;
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
    $("btn-atalhos").setAttribute("aria-expanded", String(v));
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
  // Procura o controle da seleção na linha e, se a linha não o tem (aba Leads), nas ações do topo do detalhe.
  // Só vale a classe própria (a.enviar, button.copiar): um atalho nunca cai em outro botão que grava.
  function botaoDaSelecao(seletor) {
    var id = sel();
    if (!id) return null;
    var linha = $("fila").querySelector('[data-id="' + id + '"]');
    var b = linha && linha.querySelector(seletor);
    if (!b) b = Array.prototype.filter.call($("detalhe").querySelectorAll(".acoes " + seletor), function (x) { return !x.closest("[aria-hidden='true']"); })[0] || null;
    return b && !b.disabled && b.getAttribute("aria-disabled") !== "true" ? b : null;
  }
  // Mesmo caminho do clique em Enviar: o link abre a conversa e o clique grava, avisa com Desfazer e avança.
  function enviarSelecionado() {
    var b = botaoDaSelecao("a.enviar");
    if (b) b.click();
  }
  function copiarSelecionado() {
    var b = botaoDaSelecao("button.copiar");
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
        if (t.value) { t.value = ""; aplicarBusca(""); }
        else if (!LARGO.matches) { painel(false); $("btn-filtros").focus(); }  // o campo some: o foco vai para o botão que o abre
        else t.blur();
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
      if (!LARGO.matches) painel(true);  // no trilho largo o painel já está aberto e o botão Filtros nem aparece
      $("f-busca").focus();
      return;
    }
    if (k === "1" || k === "2" || k === "3" || k === "4") {
      var f = { "1": "aq", "2": "pv", "3": "ld", "4": "bs" }[k];
      if (f !== estado.funil) trocarFunil(f);
      return;
    }
    if (estado.funil === "bs") return;  // a Base não tem seleção nem envio: j, k, c, r e Enter não fazem nada
    if (k === "j" || k === "k") { e.preventDefault(); andar(k === "j" ? 1 : -1, t); return; }
    if (k === "c") { copiarSelecionado(); return; }
    if (k === "r") { e.preventDefault(); focarResultado(); return; }
    if (k === "Enter") {
      // Dentro do detalhe, da lista de atalhos e do aviso, Enter nunca envia: lá ela usa o botão Enviar visível.
      if (t && t.closest && t.closest("#detalhe, #atalhos, #toast")) return;
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
  $("btn-atalhos").addEventListener("click", function () { mostrarAtalhos(!atalhosAbertos()); });

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
    if (c.telefone) dados.push(el("span", { class: "dado", text: Regras.telefoneFormatado(c.telefone) + (c.whatsapp === "sim" ? " · WhatsApp" : c.whatsapp === "nao" ? " · sem WhatsApp" : "") }));
    if (c.email) dados.push(el("span", { class: "dado", text: c.email }));
    if (c.linkedin) dados.push(el("a", { class: "dado", href: c.linkedin, target: "_blank", rel: "noopener", text: "LinkedIn" }));
    var acoes = [];
    if (ehContato && (c.telefone || c.email)) {
      acoes.push(ativo ?
        el("button", { type: "button", id: "contato-" + l.id + "-" + c.id, class: "btn", disabled: semMarca, onclick: function () { gravar(caminho, registrar(l, { contatoAtivo: null }, "Cadência voltou para o contato original"), "A cadência volta para o contato original"); } }, ["Voltar ao contato original"]) :
        botaoUsarContato(l, c, semMarca, false));
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
  // "Usar na cadência": a mesma ação no cartão de contato e na linha de Sem contato (que tira o lead do filtro).
  function usarContato(l, c) {
    var quem = c.nome || PAPEIS[c.papel];
    return gravar("leads/" + l.id, registrar(l, { contatoAtivo: c.id }, "Cadência passou para " + quem), "Cadência vai para " + quem);
  }
  function botaoUsarContato(l, c, semMarca, naLinha) {
    return el("button", { type: "button", id: (naLinha ? "usar-" : "contato-") + l.id + "-" + c.id, class: "btn ok" + (naLinha ? " usar" : ""), disabled: semMarca,
      "aria-label": naLinha ? "Usar " + (c.nome || PAPEIS[c.papel]) + " na cadência de " + (l.nome || l.id) : null,
      onclick: function () { if (naLinha) comVizinho(l, function () { return usarContato(l, c); }); else usarContato(l, c); } }, ["Usar na cadência"]);
  }
  // Erro de formulário: anunciado (role="alert"), ligado ao campo que falhou (aria-invalid + aria-describedby) e com o foco nele.
  function mostrarErro(erro, campos, ruim, msg) {
    Object.keys(campos).forEach(function (k) { campos[k].removeAttribute("aria-invalid"); campos[k].removeAttribute("aria-describedby"); });
    erro.textContent = msg || "";
    erro.hidden = !msg;
    if (!msg) return false;
    if (ruim) { ruim.setAttribute("aria-invalid", "true"); ruim.setAttribute("aria-describedby", erro.id); ruim.focus(); }
    return true;
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
    var erro = el("p", { class: "erro", id: "nk-erro-" + id, role: "alert", hidden: "" });
    function campo(rot, k) { return el("label", { class: "campo", for: campos[k].id }, [rot, campos[k]]); }
    function salvar() {
      var tel = campos.telefone.value.trim() ? limparTelefone(campos.telefone.value) : "";
      var email = campos.email.value.trim().toLowerCase();
      var msg = (campos.telefone.value.trim() && !tel) ? "O telefone precisa ter DDD, como (65) 99999-0000." :
        (!tel && !email) ? "Informe um telefone ou um e-mail." : !campos.fonte.value.trim() ? "Diga de onde veio o contato." : "";
      var ruim = !msg ? null : /telefone|DDD/.test(msg) ? campos.telefone : campos.fonte;
      if (mostrarErro(erro, campos, ruim, msg)) return;
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
    var sinais = (l.sinais || []).map(function (s) { return typeof s === "string" ? { texto: s } : s; });
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
  function linhasAlerta(l, rotulo) {
    return (l.alertas || []).map(function (s) {
      if (typeof s === "string") s = { texto: s };  // dado antigo: alerta em texto simples
      return el("div", { class: "aviso" }, [rotulo ? el("b", { text: "Alerta: " }) : null, (s.texto || "") + (s.fonte ? " · " : ""), linkFonte(s.fonte)]);
    });
  }
  // O chip do cabeçalho leva ao alerta junto do Enviar; sem bloco de toque (Leads fora da cadência), à seção Cuidado do Perfil.
  function irParaAlertas(l) {
    var alvo = $("alertas-" + l.id) || $("cuidado-" + l.id);
    if (!alvo) { estado.abaDetalhe[estado.funil] = "perfil"; render(); alvo = $("cuidado-" + l.id); }
    if (!alvo) return;
    if (alvo.scrollIntoView) alvo.scrollIntoView({ block: "nearest" });
    alvo.focus({ preventScroll: true });
  }
  function secaoCuidado(l) {
    var pend = (l.pendencias || []).concat((l.enriquecimento || {}).observacao ? [l.enriquecimento.observacao] : []);
    var filhos = linhasAlerta(l, false);
    if (pend.length) filhos.push(el("p", { class: "dica", text: pend.join(" · ") }));
    if (!filhos.length) return null;
    var s = secao("Cuidado e pendências", filhos);
    s.id = "cuidado-" + l.id;
    s.tabIndex = -1;
    return s;
  }
  // As três mensagens da cadência, já com a saudação, o contato e a foto escolhidos.
  function secaoCadencia(l) {
    if (semCadencia(l)) {
      return secao("Mensagens da cadência", [el("p", { class: "vazio-p", text: l.explee ?
        "Sem cadência: veio da Explee já respondendo. Responda pelo e-mail da Explee ou ligue." : "Sem cadência: este lead não tem mensagens semeadas." })]);
    }
    var e = etapa(l), g = grupo(l), v = vencimento(l), email = l.canal === "E-mail";
    var ativo = g === "hoje" || g === "aguardando";
    return secao("Mensagens da cadência", [el("div", { class: "toques" }, [1, 2, 3].map(function (n) {
      var t = toque(l, n), enviado = l["enviado" + n], proximo = ativo && n === e + 1;
      var quandoTxt = enviado ? "enviado " + dataCurta(enviado) :
        proximo ? (g === "hoje" ? "sai hoje" : "a partir de " + dataCurta(v)) :
        ativo && n > e + 1 ? espera(n) + " dias depois do toque " + (n - 1) :
        g === "semcontato" ? "espera um contato" : "não vai sair";
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
    var salvar = el("button", { type: "button", id: "nota-salvar-" + l.id, class: "btn principal", disabled: !estado.podeMarcar || !!estado.gravando["leads/" + l.id],
      onclick: function () {
        var txt = campo.value.trim();
        if (!txt) { toast("Escreva a anotação antes de salvar."); return; }
        gravar("leads/" + l.id, registrar(l, {}, txt, "nota"), "Anotação salva").then(function (ok) { if (ok) { delete estado.rascunho[id]; render(); } });
      } }, ["Salvar anotação"]);
    return secao("Histórico", [
      lista.length ? el("ol", { class: "tempo" }, lista.map(function (x) {
        var d = new Date(x.em);
        return el("li", { class: x.tipo === "nota" || x.tipo === "explee" ? x.tipo : null }, [
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
          chipExplee(l),
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
      el("th", { scope: "row", class: "nome" }, [l.nome || l.id, l.explee ? " " : null, chipExplee(l)]),
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
    placar([cont.completo, "Completos"], [decisor, "Com quem lidera"], [direto, "Contato direto"], [semCnpj, "Sem CNPJ"]);
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

  // ---------- Enriquecer base: pedido e andamento ao vivo (config/enriquecimento) ----------
  // A página só pede (status "pedido" + pedidoEm); quem roda é o Claude, no próximo turno da conversa, e ele grava o resto.
  // O cartão não é região aria-live: só o clique dela avisa, pelo #toast.
  var CAMINHO_ENRIQ = "config/enriquecimento";
  function horaDe(iso) {
    var d = new Date(iso);
    if (!iso || isNaN(d)) return "";
    var h = String(d.getHours()).padStart(2, "0") + ":" + String(d.getMinutes()).padStart(2, "0");
    return mesmoDia(d, new Date()) ? h : dataCurta(d) + " às " + h;
  }
  function motivoEnriq() {
    var st = (estado.enriq || {}).status;
    if (!estado.podeMarcar) return "Sem acesso para gravar no banco: o pedido fica desligado.";
    if (estado.enriqErro) return "Não deu para ler o andamento no banco. Recarregue a página.";
    if (!estado.carregado.enriq) return "Carregando o andamento.";
    if (estado.gravando[CAMINHO_ENRIQ]) return "Registrando o pedido.";
    if (st === "pedido") return "Já tem um pedido esperando o Claude.";
    if (st === "estimando" || st === "executando") return "Já tem uma execução em andamento. O botão volta quando ela terminar.";
    return "";
  }
  function pedirEnriq() {
    if (motivoEnriq()) return;
    // update exige o documento; se o Claude ainda não o criou, set grava só os mesmos dois campos.
    gravar(CAMINHO_ENRIQ, { status: "pedido", pedidoEm: new Date().toISOString() }, null, !estado.enriq).then(function (ok) {
      if (ok) toast("Pedido registrado. Abra a conversa com o Claude e mande qualquer mensagem para ele começar.", null, 10000);
    });
  }
  function numerosEnriq(pares) {
    return el("dl", { class: "enriq-numeros" }, pares.filter(Boolean).map(function (p) {
      return el("div", null, [el("dt", { text: p[0] }), el("dd", { class: "num", text: String(p[1]) })]);
    }));
  }
  function statusEnriq(d) {
    var st = d.status, est = d.estimativa || {}, pr = d.progresso || {};
    var hist = d.historicoExecucoes || [];
    var custoEst = est.custoEstimadoMicro != null ? est.custoEstimadoMicro : est.custoMicro;
    if (st === "pedido") return [el("p", { class: "enriq-estado", text: "Pedido em " + (horaDe(d.pedidoEm) || "instantes atrás") + ". Esperando o Claude começar." })];
    if (st === "estimando") {
      return [el("p", { class: "enriq-estado", text: "Estimando o custo" }), numerosEnriq([
        ["Candidatos", est.candidatos != null ? est.candidatos : "—"],
        ["Custo estimado", custoEst != null ? Regras.dinheiroMicro(custoEst) : "—"],
        ["Taxa usada", Regras.porcento(est.taxa)],
        typeof est.foraDoAlvo === "number" ? ["Fora do alvo", est.foraDoAlvo] : null
      ])];
    }
    if (st === "executando") {
      var total = Number(est.candidatos) || 0, feitos = Number(pr.consultados) || 0;
      return [
        el("p", { class: "enriq-estado", text: "Buscando telefones · lote " + (pr.lote || 0) }),
        numerosEnriq([["Consultados", total ? feitos + " de " + total : feitos], ["Achados", pr.achados || 0],
          ["Taxa", Regras.porcento(pr.taxa)], ["Gasto", Regras.dinheiroMicro(pr.gastoMicro)]]),
        total ? el("progress", { class: "barra", max: String(total), value: String(Math.min(feitos, total)), "aria-label": "Consultados de " + total + " candidatos" }) : null,
        pr.atualizadoEm ? el("p", { class: "enriq-hora", text: "Atualizado às " + horaDe(pr.atualizadoEm) }) : null
      ];
    }
    if (st === "concluido" || st === "parado") {
      // resumo final: o progresso gravado no fim, ou a última execução do histórico
      var fim = d.progresso || hist[hist.length - 1] || {};
      return [
        el("p", { class: "enriq-estado" + (st === "parado" ? " parado" : ""), text: st === "parado" ? Regras.motivoParada(d.motivoParada) : "Execução concluída" }),
        numerosEnriq([["Consultados", fim.consultados || 0], ["Achados", fim.achados || 0],
          ["Taxa", Regras.porcento(fim.taxa)], ["Gasto", Regras.dinheiroMicro(fim.gastoMicro)]])
      ];
    }
    return null;
  }
  function desenharEnriq() {
    var sec = $("enriq");
    sec.hidden = estado.funil !== "ld";
    if (sec.hidden) return;
    var d = estado.enriq || {};
    var motivo = motivoEnriq(), btn = $("btn-enriq"), m = $("enriq-motivo");
    // aria-disabled em vez de disabled: o foco fica no botão depois do clique, e o motivo é lido junto
    if (motivo) { btn.setAttribute("aria-disabled", "true"); btn.setAttribute("aria-describedby", "enriq-motivo"); }
    else { btn.removeAttribute("aria-disabled"); btn.removeAttribute("aria-describedby"); }
    m.textContent = motivo;
    m.hidden = !motivo;
    var sig = JSON.stringify([d, hoje().getTime()]);
    if (sec._sig === sig) return;
    sec._sig = sig;
    var card = $("enriq-status"), filhos = statusEnriq(d);
    card.textContent = "";
    card.hidden = !filhos;
    card.dataset.status = d.status || "ocioso";
    (filhos || []).forEach(function (f) { if (f) card.appendChild(f); });
    var lista = $("enriq-hist"), hist = (d.historicoExecucoes || []).slice(-3).reverse();
    var antes = lista.querySelector("details"), aberto = !!(antes && antes.open);  // aberto e foco sobrevivem ao snapshot
    var comFoco = !!(antes && antes.contains(document.activeElement));
    lista.textContent = "";
    lista.hidden = !hist.length;
    if (hist.length) {
      // recolhido: no celular o cartão não empurra a fila para longe
      var det = el("details", { open: aberto ? "" : null }, [
        el("summary", { text: "Últimas execuções (" + hist.length + ")" })]);
      lista.appendChild(det);
      det.appendChild(el("ol", null, hist.map(function (x) {
        var partes = [x.achados || 0, (x.achados === 1 ? " achado em " : " achados em "), x.consultados || 0, " · ", Regras.porcento(x.taxa), " · ", Regras.dinheiroMicro(x.gastoMicro)].join("");
        return el("li", null, [el("time", { datetime: x.em || "", text: x.em ? dataCurta(x.em) : "—" }), el("span", { text: partes + (x.motivoParada ? " · parou: " + x.motivoParada : "") })]);
      })));
      if (comFoco) det.querySelector("summary").focus({ preventScroll: true });
    }
  }
  $("btn-enriq").addEventListener("click", pedirEnriq);

  // ================= BASE: faixas B e C da Explee =================
  // Lista leve (coleção base, um documento enxuto por empresa). A página só pede: grava status "pedido" e pedidoEm
  // no documento da base. Quem monta o lead (e o põe na fila do enriquecimento) é o Claude, na conversa.
  var ROTULO_BASE = { base: "Na base", pedido: "Na fila do Claude", na_cadencia: "Na cadência" };
  var PERSONAS = { decisor: "Decisor", comunicacao: "Comunicação", gestao: "Gestão", operacional: "Operacional" };
  var PAGINA_BASE = 100;
  var TEXTO_PEDIDO = " na fila. Abra a conversa com o Claude para ele montar os cards.";
  function assinarBase() {
    if (estado.baseAssinada || !estado.db) return;
    estado.baseAssinada = true;
    estado.db.collection("base").onSnapshot(function (snap) {
      var novo = {};
      snap.docs.forEach(function (d) {
        if (!d.exists) return;
        var dados = Object.assign({}, d.data());
        dados.id = d.id;
        novo[d.id] = dados;
      });
      estado.base = novo;
      estado.baseLista = Object.keys(novo).map(function (k) { return novo[k]; }).sort(Regras.ordenarBase);
      estado.carregado.base = true;
      render();
    }, function () {
      estado.carregado.base = true;
      estado.baseErro = true;
      render();
    });
  }
  function empresasNaFila(n) { return (n === 1 ? "1 empresa" : n + " empresas") + TEXTO_PEDIDO; }
  function pedidoBase() { return { status: "pedido", pedidoEm: new Date().toISOString() }; }
  function pedirUma(d) {
    if (!estado.podeMarcar || estado.bsLote || Regras.statusBase(estado.base[d.id] || d) !== "base") return;
    gravar("base/" + d.id, pedidoBase()).then(function (ok) { if (ok) toast(empresasNaFila(1), null, 10000); });
  }
  // Pedido em lote: um update por documento, em sequência (um de cada vez, para não estourar o limite de escritas).
  // Para no primeiro erro; quem já mudou de status no meio do caminho é pulado.
  function pedirLote(ids) {
    if (!estado.podeMarcar || estado.bsLote || !ids.length) return;
    estado.bsConfirmar = false;
    estado.bsLote = { feitos: 0, total: ids.length };
    var feitos = 0, falhou = false;
    var passo = ids.reduce(function (p, id) {
      return p.then(function () {
        var d = estado.base[id];
        if (falhou || !d || Regras.statusBase(d) !== "base") return;
        return gravar("base/" + id, pedidoBase(), null, false, function () { falhou = true; }).then(function (ok) {
          if (ok) feitos++; else falhou = true;
          if (estado.bsLote) estado.bsLote.feitos = feitos;
        });
      });
    }, Promise.resolve());
    render();
    return passo.then(function () {
      estado.bsLote = null;
      render();
      if (feitos) toast(empresasNaFila(feitos) + (falhou ? " As outras não foram gravadas: tente de novo." : ""), null, 10000);
      else if (falhou) toast("Não foi possível pedir. Tente de novo em instantes.");
      var b = $("bs-lote-btn");
      if (b && focoPerdido()) b.focus();
    });
  }
  function filtradosBase() { return Regras.filtrarBase(estado.baseLista, estado.filtro.bs, estado.busca); }
  function desenharLote(filtrados) {
    var caixa = $("bs-lote");
    caixa.hidden = estado.funil !== "bs";
    if (caixa.hidden) return;
    var lote = Regras.loteBase(filtrados), n = Math.min(lote.total, Regras.LOTE_BASE);
    var sig = JSON.stringify([lote.total, estado.bsConfirmar, estado.bsLote, estado.podeMarcar, estado.carregado.base]);
    if (caixa._sig === sig) return;
    caixa._sig = sig;
    var foco = document.activeElement && caixa.contains(document.activeElement) ? document.activeElement.id : null;
    caixa.textContent = "";
    if (estado.bsLote) {
      caixa.appendChild(el("p", { class: "bs-lote-texto", text: "Pedindo " + estado.bsLote.feitos + " de " + estado.bsLote.total + " empresas…" }));
    } else if (estado.bsConfirmar && lote.total) {
      caixa.appendChild(el("p", { class: "bs-lote-texto", id: "bs-lote-pergunta", text: lote.total > n
        ? "Pedir as primeiras " + n + " de " + lote.total + " empresas filtradas? Elas vão para a fila do Claude."
        : "Pedir " + (n === 1 ? "1 empresa" : n + " empresas") + "? Elas vão para a fila do Claude." }));
      caixa.appendChild(el("div", { class: "acoes" }, [
        el("button", { type: "button", id: "bs-lote-ok", class: "btn principal", "aria-describedby": "bs-lote-pergunta",
          onclick: function () { pedirLote(lote.ids); } }, ["Confirmar (" + n + ")"]),
        el("button", { type: "button", id: "bs-lote-nao", class: "btn", onclick: function () { estado.bsConfirmar = false; render(); if ($("bs-lote-btn")) $("bs-lote-btn").focus(); } }, ["Cancelar"])
      ]));
      if (foco && foco !== "bs-lote-nao") foco = "bs-lote-ok";
    } else {
      caixa.appendChild(el("button", { type: "button", id: "bs-lote-btn", class: "btn principal", disabled: !estado.podeMarcar || !lote.total,
        onclick: function () { estado.bsConfirmar = true; render(); if ($("bs-lote-ok")) $("bs-lote-ok").focus(); } },
        ["Enriquecer e iniciar cadência dos filtrados (" + lote.total + ")"]));
      if (lote.total > Regras.LOTE_BASE) caixa.appendChild(el("p", { class: "bs-lote-texto", text: "Até " + Regras.LOTE_BASE + " por clique." }));
      if (foco) foco = "bs-lote-btn";
    }
    if (foco && $(foco)) $(foco).focus({ preventScroll: true });
  }
  function irParaLead(id) {
    estado.filtro.ld = { grupo: "todos", segmento: "" };
    guardarSel("ld", id);
    trocarFunil("ld");
  }
  function quemDecide(d) { var x = d.decisor || {}; return [x.nome, x.cargo].filter(Boolean).join(" · "); }
  function partesBase(d) {
    var st = Regras.statusBase(d), x = d.decisor || {};
    var semMarca = !estado.podeMarcar || !!estado.gravando["base/" + d.id] || !!estado.bsLote;
    var nome = d.nome || d.dominio || d.id;
    return {
      st: st,
      estado: el("span", { class: "estado bs-" + st, id: "bs-st-" + d.id, text: ROTULO_BASE[st] }),
      linkedin: x.linkedin ? el("a", { href: x.linkedin, target: "_blank", rel: "noopener", "aria-label": "LinkedIn de " + (x.nome || nome) }, ["LinkedIn"]) : null,
      lead: d.leadId ? el("a", { class: "ir-lead", href: "#leads", "aria-label": "Ver o lead " + d.leadId + " de " + nome,
        onclick: function (ev) { ev.preventDefault(); irParaLead(d.leadId); } }, ["Ver lead ", el("span", { class: "num", text: d.leadId })]) : null,
      // contornado: numa lista de 100 linhas, botão cheio em todas vira uma coluna de primários; o cheio é o dos filtrados
      botao: el("button", { type: "button", class: "btn pedir", id: "bs-pedir-" + d.id,
        disabled: st !== "base" || semMarca, "aria-describedby": st === "base" ? null : "bs-st-" + d.id, "aria-label": "Enriquecer e iniciar cadência de " + nome,
        onclick: function () { pedirUma(d); } }, ["Enriquecer e iniciar cadência"])
    };
  }
  function linhaBase(d) {
    var p = partesBase(d), dec = quemDecide(d);
    return el("div", { class: "linha bs", "data-id": d.id, role: "group", "aria-label": d.nome || d.dominio }, [
      el("div", { class: "info" }, [
        el("span", { class: "nome", text: d.nome || d.dominio }),
        el("span", { class: "sub", text: [d.segmento, d.tier ? "faixa " + d.tier : ""].filter(Boolean).join(" · ") }),
        el("span", { class: "sub", text: dec ? "Decide: " + dec : "Sem decisor na lista" }),
        el("div", { class: "situacao" }, [p.estado])
      ]),
      // no celular os links viram botões de 44px
      el("div", { class: "acoes" }, [p.botao, p.lead ? (p.lead.classList.add("btn"), p.lead) : null, p.linkedin ? el("a", { class: "btn", href: d.decisor.linkedin, target: "_blank", rel: "noopener",
        "aria-label": "LinkedIn de " + (d.decisor.nome || d.nome) }, ["LinkedIn"]) : null])
    ]);
  }
  function linhaTabelaBase(d) {
    var p = partesBase(d);
    return el("tr", { "data-id": d.id }, [
      el("th", { scope: "row", class: "nome" }, [d.nome || d.dominio, el("span", { class: "dominio", text: d.dominio })]),
      el("td", { text: d.segmento || "—" }),
      el("td", { class: "faixa", text: d.tier || "—" }),
      el("td", { text: quemDecide(d) || "—" }),
      el("td", null, [p.linkedin || "—"]),
      el("td", null, [p.estado, p.lead ? " " : null, p.lead]),
      el("td", { class: "acao" }, [p.botao])
    ]);
  }
  function listaBase(tabela) {
    var alvo = prepararFila(tabela ? "bstab" : "bs"), lista = alvo.querySelector(".bs-lista");
    if (!lista) {
      if (tabela) {
        var cab = el("tr", null, [["Empresa"], ["Segmento"], ["Faixa"], ["Quem decide"], ["LinkedIn"], ["Status"], ["Ação", "sr"]].map(function (c) {
          return el("th", { scope: "col" }, [c[1] ? el("span", { class: c[1], text: c[0] }) : c[0]]);
        }));
        var t = el("table", { class: "tabela base" }, [el("caption", { class: "sr", text: "Base Explee: empresas das faixas B e C" }), el("thead", null, [cab]), el("tbody", { class: "bs-lista" })]);
        alvo.appendChild(el("div", { class: "tabela-wrap" }, [t]));
        lista = t.tBodies[0];
      } else {
        lista = el("div", { class: "bs-lista" });
        alvo.appendChild(lista);
      }
      alvo.appendChild(el("div", { class: "bs-mais", id: "bs-mais" }));
    }
    return { alvo: alvo, lista: lista, mais: alvo.querySelector(".bs-mais") };
  }
  function renderBS() {
    assinarBase();
    var chave = JSON.stringify([estado.filtro.bs, estado.busca]);
    if (estado.bsChave !== chave) { estado.bsChave = chave; estado.bsLimite = PAGINA_BASE; estado.bsConfirmar = false; }
    var todos = estado.baseLista;
    var cont = { todos: todos.length, base: 0, pedido: 0, na_cadencia: 0 }, comLinkedin = 0;
    var segs = {}, faixas = {}, personas = {};
    todos.forEach(function (d) {
      cont[Regras.statusBase(d)]++;
      if ((d.decisor || {}).linkedin) comLinkedin++;
      if (d.segmento) segs[d.segmento] = 1;
      if (d.tier) faixas[d.tier] = 1;
      if ((d.decisor || {}).persona) personas[d.decisor.persona] = 1;
    });
    placar([cont.base, "Na base"], [cont.pedido, "Na fila do Claude"], [cont.na_cadencia, "Na cadência"], [comLinkedin, "Decisor com LinkedIn"]);
    abas(cont);
    preencherSelect("f-bs-segmento", Object.keys(segs).sort());
    preencherSelect("f-bs-faixa", Object.keys(faixas).sort().map(function (f) { return [f, "Faixa " + f]; }));
    preencherSelect("f-bs-persona", Object.keys(PERSONAS).filter(function (k) { return personas[k]; }).map(function (k) { return [k, PERSONAS[k]]; }));
    var filtrados = filtradosBase();
    desenharLote(filtrados);
    if (!estado.carregado.base) { limparFila(); carregando($("fila")); return; }
    if (estado.baseErro) { limparFila(); vazio($("fila"), "Não deu para ler a base", "Recarregue a página para tentar de novo."); return; }
    if (!todos.length) { limparFila(); vazio($("fila"), "A base está vazia", "Quando o Claude gravar as empresas das faixas B e C, elas aparecem aqui."); return; }
    var tabela = document.body.dataset.layout === "tres" || document.body.dataset.layout === "dois";
    var mostrados = filtrados.slice(0, estado.bsLimite);
    estado.visiveis.bs = mostrados;
    var r = listaBase(tabela);
    Array.prototype.forEach.call(r.alvo.querySelectorAll(":scope > .vazio"), function (v) { r.alvo.removeChild(v); });
    reconciliar(mostrados, { alvo: r.lista, fabrica: tabela ? linhaTabelaBase : linhaBase, colecao: "base", ctx: JSON.stringify([estado.podeMarcar, !!estado.bsLote]) });
    r.lista.closest(".tabela-wrap") && (r.lista.closest(".tabela-wrap").hidden = !mostrados.length);
    var faltam = filtrados.length - mostrados.length;
    var sigMais = filtrados.length + "/" + mostrados.length;
    if (r.mais._sig !== sigMais) {
      r.mais._sig = sigMais;
      var tinhaFoco = r.mais.contains(document.activeElement);
      r.mais.textContent = "";
      if (mostrados.length) r.mais.appendChild(el("p", { class: "bs-conta", text: "Mostrando " + mostrados.length + " de " + filtrados.length }));
      if (faltam > 0) {
        r.mais.appendChild(el("button", { type: "button", class: "btn", id: "bs-mais-btn", onclick: function () {
          var antes = estado.bsLimite;
          estado.bsLimite += PAGINA_BASE;
          render();
          if (!$("bs-mais-btn")) {  // acabou a lista: o foco vai para a primeira linha nova
            var nova = estado.visiveis.bs[antes], alvo = nova && $("bs-pedir-" + nova.id);
            if (alvo && alvo.disabled) alvo = $("fila").querySelector('[data-id="' + nova.id + '"] a');
            if (alvo) alvo.focus();
          }
        } }, ["Mostrar mais " + Math.min(PAGINA_BASE, faltam)]));
        if (tinhaFoco) $("bs-mais-btn").focus({ preventScroll: true });
      }
    }
    if (!filtrados.length) vazio(r.alvo, "Nada neste filtro", estado.filtro.bs.grupo === "pedido" ? "Nenhuma empresa esperando o Claude." : "Troque a aba, os filtros ou a busca.");
  }

  // ================= PÓS-VENDA =================
  function etapasPV() { return (estado.pv && estado.pv.etapas) || []; }
  var etapaPV = Regras.etapaPV;
  function defEtapa(n) { return etapasPV()[n - 1] || null; }
  function textoPV(c, n) { return Regras.textoPV(c, n, estado.pv); }
  function vencimentoPV(c) { return Regras.vencimentoPV(c, etapasPV()); }
  function grupoPV(c) { return Regras.grupoPV(c, etapasPV(), new Date()); }

  function marcarPV(c, n, quando) {
    var dados = {};
    dados["pvEnviado" + n] = quando || new Date().toISOString();
    var chave = "clientes/" + c.id + "/" + n;
    var falha = function () {
      avisoFalhaEnvio(chave, "A conversa abriu, mas a mensagem da etapa " + n + " não foi marcada", function () {
        var atual = estado.clientes[c.id];
        if (!atual) { soltarFixo(chave); toast("Este cliente não está mais na central"); return; }
        if (atual["pvEnviado" + n] || etapaPV(atual) !== n) { soltarFixo(chave); toast("A mensagem da etapa " + n + " já está marcada"); return; }
        marcarPV(atual, n, dados["pvEnviado" + n]);
      });
    };
    var ok = comVizinho(c, function () { return gravar("clientes/" + c.id, dados, null, false, falha); });
    ok.then(function (feito) { if (feito) { soltarFixo(chave); avisoComDesfazer("Mensagem da etapa " + n + " marcada", function () { desfazerPV(c, n); }); } });
    return ok;
  }
  // Só desfaz se a marca ainda está lá e o cliente continua nessa etapa.
  function desfazerPV(c, n) {
    var atual = estado.clientes[c.id] || c;
    esconderToast();
    if (!atual["pvEnviado" + n] || etapaPV(atual) !== n) { toast("Nada a desfazer"); return; }
    var dados = {};
    dados["pvEnviado" + n] = null;
    if (Array.isArray(atual.historico)) registrar(atual, dados, "Mensagem da etapa " + n + " desfeita");
    gravar("clientes/" + c.id, dados).then(function (ok) { if (ok && estado.funil === "pv") selecionar(c.id, { foco: focoAcompanha() }); });
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
    var podeEnviar = p.g === "hoje" && !!p.link && !estado.gravando["clientes/" + c.id];
    var btnEnviar = el("a", { class: "btn enviar" + (sel() === c.id ? " principal" : ""), href: podeEnviar ? p.link : null, target: podeEnviar ? "_blank" : null, rel: podeEnviar ? "noopener" : null,
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
        var acoes = [el("a", { id: "pv-enviar-" + c.id, class: "btn" + (p.enviado ? "" : " principal enviar"), href: p.link, target: "_blank", rel: "noopener",
          onclick: function () { if (!semMarca && !p.enviado) marcarPV(c, n); } }, [p.enviado ? (p.email ? "Abrir e-mail de novo" : "Abrir WhatsApp de novo") : "Enviar"])];
        acoes.push(el("button", { type: "button", id: "pv-copiar-" + c.id, class: "btn copiar", onclick: function () { copiarPV(c, p); } }, ["Copiar"]));
        corpo.push(el("div", { class: "acoes" }, acoes));
      }
    } else if (destino) {
      corpo.push(el("div", { class: "destino" }, ["Para: ", el("span", { class: "num", text: destino })]));
    }
    var gestao = [];
    if (p.ativo && e) gestao.push(el("button", { type: "button", id: "pv-concluir-" + c.id, class: "btn ok", disabled: semMarca, onclick: function () { concluirPV(c); } },
      [n >= total ? "Concluir cliente" : "Concluir etapa"]));
    if (n > 1 && g !== "pausado") gestao.push(el("button", { type: "button", id: "pv-voltar-" + c.id, class: "btn", disabled: semMarca, onclick: function () { voltarPV(c); } }, ["Voltar etapa"]));
    if (g === "pausado") gestao.push(el("button", { type: "button", id: "pv-retomar-" + c.id, class: "btn", disabled: semMarca,
      onclick: function () { comVizinho(c, function () { return gravar(caminho, { situacao: "ativo" }, "Cliente retomado"); }); } }, ["Retomar"]));
    else if (p.ativo) gestao.push(el("button", { type: "button", id: "pv-pausar-" + c.id, class: "btn alerta", disabled: semMarca,
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
    var erro = el("p", { class: "erro", id: "nc-erro", role: "alert", hidden: "" });
    function campo(rotulo, k) { return el("label", { class: "campo", for: campos[k].id }, [rotulo, campos[k]]); }
    function salvar() {
      var nome = campos.nome.value.trim(), saudacao = campos.saudacao.value.trim();
      var tel = campos.telefone.value.trim() ? limparTelefone(campos.telefone.value) : "";
      var email = campos.email.value.trim();
      var msg = !nome ? "Preencha o nome do cliente." : !saudacao ? "Preencha como a Letícia chama o cliente." :
        (campos.telefone.value.trim() && !tel) ? "O WhatsApp precisa ter DDD, como (65) 99999-0000." :
        (!tel && !email) ? "Informe um WhatsApp ou um e-mail." : "";
      var ruim = !msg ? null : !nome ? campos.nome : !saudacao ? campos.saudacao : campos.telefone;
      if (mostrarErro(erro, campos, ruim, msg)) return;
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
      [cont.concluido, "Concluídos"]);
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
  function placar(a, b, c, d) {
    [a, b, c, d].forEach(function (x, i) { $("p" + (i + 1)).textContent = x[0]; $("p" + (i + 1) + "l").textContent = x[1]; });
  }
  function metaDiaria() { var m = Number(estado.meta.metaDiaria); return isFinite(m) && m > 0 ? m : 20; }
  // Meta do dia: toques de aquecimento enviados hoje (sem o card TESTE), em qualquer funil. Sem animação nem confete.
  function desenharMeta() {
    var agora = new Date(), n = 0, hoje = 0;
    Object.keys(estado.leads).forEach(function (k) {
      if (k === "TESTE") return;
      var l = estado.leads[k];
      if (grupo(l) === "hoje") hoje++;
      [1, 2, 3].forEach(function (i) { if (mesmoDia(l["enviado" + i], agora)) n++; });
    });
    var meta = metaDiaria(), batida = n >= meta;
    var texto = batida ? "Meta do dia batida · " + hoje + " ainda vencem hoje" : n + " de " + meta + " toques · " + hoje + " para hoje";
    // fora do Aquecimento a linha diz de que meta se trata, para não ser lida como contagem do pós-venda ou de Leads
    if (estado.funil !== "aq") texto = batida ? "Meta de toques batida · " + hoje + " leads ainda vencem hoje" : "Meta de toques: " + n + " de " + meta + " · " + hoje + " leads para hoje";
    var barra = $("barra");
    barra.max = meta;
    barra.value = Math.min(n, meta);
    barra.classList.toggle("batida", batida);
    $("meta-texto").textContent = texto;
    $("meta-texto").classList.toggle("batida", batida);
    $("linha-meta").textContent = texto;
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
    var pv = estado.funil === "pv", ld = estado.funil === "ld", bs = estado.funil === "bs";
    $("f-aq").setAttribute("aria-pressed", String(estado.funil === "aq"));
    $("f-pv").setAttribute("aria-pressed", String(pv));
    $("f-ld").setAttribute("aria-pressed", String(ld));
    $("f-bs").setAttribute("aria-pressed", String(bs));
    $("sel-aq").hidden = estado.funil !== "aq";
    $("sel-pv").hidden = !pv;
    $("sel-ld").hidden = !ld;
    $("sel-bs").hidden = !bs;
    if (!bs) $("bs-lote").hidden = true;
    $("f-busca").placeholder = bs ? "Empresa, domínio ou pessoa" : "Empresa, pessoa ou CNPJ";
    $("novo-cliente").hidden = !pv;
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
    // Base: o número é de quem espera o Claude montar o card (só depois que a base foi aberta uma vez).
    var nbs = $("n-bs"), naFila = estado.baseLista.filter(function (d) { return d.status === "pedido"; }).length;
    if (nbs.dataset.v !== String(naFila)) {
      nbs.dataset.v = String(naFila);
      nbs.textContent = "";
      if (naFila) { nbs.appendChild(document.createTextNode(String(naFila))); nbs.appendChild(el("span", { class: "rot", text: " na fila" })); }
    }
    document.body.dataset.funil = estado.funil;
    if (pv) renderPV(); else if (ld) renderLD(); else if (bs) renderBS(); else renderAQ();
    desenharMeta();
    desenharEnriq();
    contarFiltros();
    aplicarDetalhe();
  }
  // Painel de filtros: recolhido abaixo de 1280px (botão Filtros), sempre aberto no trilho largo.
  var LARGO = window.matchMedia ? window.matchMedia("(min-width: 1280px)") : { matches: true };
  function painelAberto() { return $("painel-filtros").classList.contains("aberto"); }
  function painel(abrir) {
    $("painel-filtros").classList.toggle("aberto", abrir);
    $("btn-filtros").setAttribute("aria-expanded", String(abrir));
  }
  function contarFiltros() {
    var n = $("f-busca").value.trim() ? 1 : 0;
    Array.prototype.forEach.call(document.querySelectorAll(".selects:not([hidden]) select"), function (sel) { if (sel.value) n++; });
    $("btn-filtros-rot").textContent = n ? "Filtros · " + n : "Filtros";
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
  $("f-bs").addEventListener("click", function () { trocarFunil("bs"); });
  ["segmento", "faixa", "persona"].forEach(function (k) {
    $("f-bs-" + k).addEventListener("change", function (e) { estado.filtro.bs[k] = e.target.value; render(); });
  });
  $("f-ld-segmento").addEventListener("change", function (e) { estado.filtro.ld.segmento = e.target.value; render(); });
  var buscaTimer;
  function aplicarBusca(v) { clearTimeout(buscaTimer); estado.busca = v; render(); }
  $("btn-filtros").addEventListener("click", function () { painel(!painelAberto()); });
  $("painel-filtros").addEventListener("change", contarFiltros);
  $("f-busca").addEventListener("input", function (e) {
    contarFiltros();
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
    if (!linha || e.target.closest("a, button") || estado.funil === "bs") return;  // Enviar e Copiar têm ação própria; a Base não seleciona
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
      estado.carregado = { leads: true, clientes: true, enriq: true };
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
    db.doc(CAMINHO_ENRIQ).onSnapshot(function (d) {
      estado.enriq = d.exists ? d.data() : null;
      estado.carregado.enriq = true;
      render();
    }, function () { estado.enriqErro = true; render(); });  // sem leitura, nada de pedido: um set às cegas apagaria o histórico
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
    var salvo = location.hash === "#posvenda" ? "pv" : location.hash === "#leads" ? "ld" : location.hash === "#base" ? "bs" : localStorage.getItem("central-funil");
    if (salvo === "pv" || salvo === "aq" || salvo === "ld" || salvo === "bs") estado.funil = salvo;
    ["aq", "pv", "ld"].forEach(function (f) { estado.sel[f] = localStorage.getItem("central-sel-" + f) || null; });
    if (!estado.sel.aq) estado.sel.aq = localStorage.getItem("central-selecionado") || null;  // chave da versão anterior: era só do Aquecimento
  } catch (e) { /* sem armazenamento: começa no aquecimento */ }
  render();
  var usar = window.claude && typeof window.claude.use === "function" ? window.claude.use("db") : Promise.resolve(null);
  Promise.resolve(usar).then(iniciar, function () { iniciar(null); });
  var usarDownloads = window.claude && typeof window.claude.use === "function" ? window.claude.use("downloads") : Promise.resolve(null);
  Promise.resolve(usarDownloads).then(function (d) { estado.downloads = d || null; render(); }, function () {});
})();
