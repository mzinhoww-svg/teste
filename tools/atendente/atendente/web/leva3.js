/* leva 3: abas Base e Pós-venda, Novo cliente e Virar cliente (no painel do lead). Carregado depois do app.js.
   Todo texto vindo do banco entra com textContent (A.h), nunca innerHTML. */
window.Atendente_leva3 = function (A) {
  'use strict';
  var h = A.h, limpar = A.limpar;
  var STATUS = [['', 'Todas'], ['base', 'Na base'], ['na_cadencia', 'Na central'], ['pedido', 'Pedidas'], ['sem_cadencia', 'Sem cadência']];
  var ROTULO_STATUS = { base: 'Na base', pedido: 'Pedida', na_cadencia: 'Na central', sem_cadencia: 'Sem cadência' };
  var GRUPOS = [['todos', 'Todos'], ['hoje', 'Para hoje'], ['andamento', 'Em andamento'], ['pausado', 'Pausados'], ['concluido', 'Concluídos']];
  var ROTULO_GRUPO = { hoje: 'Para hoje', andamento: 'Em andamento', pausado: 'Pausado', concluido: 'Concluído' };
  var POR = 50, LOTE = 50;

  /* rótulo fora do controle: o nome acessível fica só o texto do rótulo */
  function campo(id, rotulo, ctrl, classe) {
    return h('div', { class: 'l3-campo' + (classe ? ' ' + classe : '') }, h('label', { for: id, text: rotulo }), ctrl);
  }
  function erroMsg(e) { return A.eRede(e) ? A.ERRO_REDE : e.message; }
  function plural(n, um, varios) { return n + ' ' + (n === 1 ? um : varios); }
  function milhar(n) { return Number(n || 0).toLocaleString('pt-BR'); }
  function lugar(d) { return d.cidade && d.uf ? d.cidade + '/' + d.uf : (d.cidade || d.uf || ''); }

  /* ======================================================== BASE */
  var base = { filtros: { busca: '', segmento: '', tier: '', icp: '', uf: '', status: '' }, pagina: 1, dados: null,
               marcados: {}, confirmar: false, ocupado: false, pedido: 0, timer: null };
  var B = {};   // elementos fixos da aba

  function seletor(id, rotulo, chave) {
    var s = h('select', { id: id, onchange: function () { base.filtros[chave] = s.value; base.pagina = 1; carregarBase(); } });
    B[chave] = s;
    return campo(id, rotulo, s);
  }

  function montarBase(sec) {
    B.busca = h('input', { id: 'l3-base-busca', type: 'search', autocomplete: 'off', placeholder: 'Nome, site, decisor ou cidade',
      oninput: function () {
        clearTimeout(base.timer);
        base.timer = setTimeout(function () { base.filtros.busca = B.busca.value.trim(); base.pagina = 1; carregarBase(); }, 250);
      } });
    B.status = h('div', { class: 'l3-grupos', role: 'group', 'aria-label': 'Situação na Base' });
    B.resumo = h('p', { id: 'l3-base-resumo', class: 'l3-resumo', role: 'status', 'aria-live': 'polite' });
    B.lote = h('div', { class: 'l3-lote' });
    B.lista = h('ul', { class: 'l3-lista', 'aria-label': 'Empresas da Base' });
    B.paginas = h('nav', { class: 'l3-paginas', 'aria-label': 'Páginas da Base' });
    sec.append(
      h('div', { class: 'l3-topo' },
        h('h2', { class: 'l3-titulo', text: 'Base Explee (faixas B e C)' }),
        h('p', { class: 'suave', text: 'Empresas que já receberam o e-mail da Explee e não responderam. Promover cria o lead com os três toques; ele fica em Sem contato até o enriquecimento achar o celular do decisor.' })),
      B.status,
      h('div', { class: 'l3-filtros', role: 'group', 'aria-label': 'Filtrar a Base' },
        campo('l3-base-busca', 'Buscar na Base', B.busca, 'l3-busca'),
        seletor('l3-base-segmento', 'Segmento', 'segmento'), seletor('l3-base-tier', 'Faixa', 'tier'),
        seletor('l3-base-icp', 'ICP', 'icp'), seletor('l3-base-uf', 'Estado', 'uf'),
        h('button', { class: 'btn', type: 'button', onclick: limparFiltrosBase }, 'Limpar filtros')),
      B.resumo, B.lote, B.lista, B.paginas);
  }

  function limparFiltrosBase() {
    base.filtros = { busca: '', segmento: '', tier: '', icp: '', uf: '', status: base.filtros.status };
    B.busca.value = '';
    base.pagina = 1;
    carregarBase();
  }

  function carregarBase() {
    var f = base.filtros, q = new URLSearchParams();
    Object.keys(f).forEach(function (k) { if (f[k]) q.set(k, f[k]); });
    q.set('pagina', String(base.pagina));
    q.set('por', String(POR));
    var n = ++base.pedido;
    return A.api('api/base?' + q.toString()).then(function (r) {
      if (n !== base.pedido) return;
      base.dados = r;
      pintarBase();
    }).catch(function (e) { if (n === base.pedido) A.aviso(erroMsg(e), true); });
  }

  function opcoes(sel, lista, todos, semRotulo, semN, rotuloDe) {
    var atual = sel.value;
    limpar(sel);
    sel.append(h('option', { value: '', text: todos }));
    lista.forEach(function (o) {
      sel.append(h('option', { value: o[0], text: (rotuloDe ? rotuloDe(o) : o[0]) + ' (' + milhar(o[o.length - 1]) + ')' }));
    });
    if (semN) sel.append(h('option', { value: 'sem', text: semRotulo + ' (' + milhar(semN) + ')' }));
    sel.value = atual;
    if (sel.value !== atual) sel.value = '';
  }

  function pintarBase() {
    var r = base.dados, f = base.filtros;
    var focoId = document.activeElement && B.lista.contains(document.activeElement) ? document.activeElement.id : null;
    // situação: botões com contagem (seguem os outros filtros)
    limpar(B.status);
    STATUS.forEach(function (s) {
      var n = s[0] ? r.contagens[s[0]] : r.contagens.todas;
      if (s[0] === 'pedido' && !n && f.status !== 'pedido') return;   // "pedida" só existe nos dados antigos
      B.status.append(h('button', { type: 'button', class: 'filtro', 'aria-pressed': f.status === s[0] ? 'true' : 'false',
        onclick: function () { base.filtros.status = s[0]; base.pagina = 1; carregarBase(); } },
        s[1] + ' ', h('span', { class: 'num', text: milhar(n) })));
    });
    opcoes(B.segmento, r.opcoes.segmento, 'Todos os segmentos');
    opcoes(B.tier, r.opcoes.tier, 'Todas as faixas', null, 0, function (o) { return 'Faixa ' + o[0]; });
    opcoes(B.icp, r.opcoes.icp, 'Todos os ICPs', 'Sem cadência', r.opcoes.semIcp, function (o) { return o[0] + ' · ' + o[1]; });
    opcoes(B.uf, r.opcoes.uf, 'Todos os estados', 'Sem informação', r.opcoes.semUf);

    var ini = r.total ? (r.pagina - 1) * r.por + 1 : 0, fim = Math.min(r.total, r.pagina * r.por);
    B.resumo.textContent = r.totalBase === 0 ? 'A Base está vazia.' : r.total === 0 ? 'Nenhuma empresa neste filtro.'
      : 'Mostrando ' + milhar(ini) + '–' + milhar(fim) + ' de ' + milhar(r.total) + (r.total === 1 ? ' empresa.' : ' empresas.');

    limpar(B.lista);
    if (!r.itens.length) {
      B.lista.append(h('li', { class: 'vazio', text: r.totalBase === 0
        ? 'Nenhuma empresa na Base ainda. Importe com: python -m atendente.importar --base PASTA'
        : 'Troque os filtros ou a busca para ver outras empresas.' }));
    }
    r.itens.forEach(function (d) { B.lista.append(linhaBase(d)); });
    pintarLote();
    pintarPaginas();
    if (focoId && document.getElementById(focoId)) document.getElementById(focoId).focus();
  }

  function promovivel(d) { return d.status === 'base' || d.status === 'pedido'; }

  function linhaBase(d) {
    var dec = d.decisor || {}, nome = d.nome || d.dominio || d.id;
    var sub = [d.segmento, d.tier ? 'faixa ' + d.tier : '', d.icp || 'sem cadência', lugar(d)].filter(Boolean).join(' · ');
    var marcar = promovivel(d) ? h('input', { type: 'checkbox', id: 'l3-sel-' + d.id, 'aria-label': 'Selecionar ' + nome,
      onchange: function (ev) { if (ev.target.checked) base.marcados[d.id] = true; else delete base.marcados[d.id]; base.confirmar = false; pintarLote(); } }) : null;
    if (marcar && base.marcados[d.id]) marcar.checked = true;
    var acoes = [];
    if (promovivel(d)) {
      acoes.push(h('button', { type: 'button', class: 'btn', id: 'l3-prom-' + d.id, 'aria-label': 'Promover ' + nome, disabled: base.ocupado,
        onclick: function () { promoverUma(d); } }, 'Promover'));
    }
    if (d.leadId) {
      acoes.push(h('button', { type: 'button', class: 'btn', id: 'l3-ver-' + d.id, 'aria-label': 'Ver lead ' + d.leadId + ' de ' + nome,
        onclick: function () { verLead(d.leadId); } }, 'Ver lead'));
    }
    if (dec.linkedin && /^https:\/\//.test(dec.linkedin)) {
      acoes.push(h('a', { class: 'btn', href: dec.linkedin, target: '_blank', rel: 'noopener', 'aria-label': 'LinkedIn de ' + (dec.nome || nome) }, 'LinkedIn'));
    }
    return h('li', { class: 'l3-linha', dataset: { id: d.id } },
      marcar ? h('div', { class: 'l3-marcar' }, marcar) : h('div', { class: 'l3-marcar', 'aria-hidden': 'true' }),
      h('div', { class: 'l3-info' },
        h('span', { class: 'l3-nome', text: nome }),
        h('span', { class: 'l3-sub', text: (d.dominio ? d.dominio + ' · ' : '') + sub }),
        h('span', { class: 'l3-sub', text: dec.nome ? 'Decide: ' + [dec.nome, dec.cargo].filter(Boolean).join(' · ') : 'Sem decisor na lista' }),
        h('span', { class: 'l3-estado ' + d.status, text: ROTULO_STATUS[d.status] + (d.leadId ? ' (' + d.leadId + ')' : '') + (d.status === 'sem_cadencia' && d.motivo ? ': ' + d.motivo : '') })),
      h('div', { class: 'acoes l3-acoes' }, acoes));
  }

  function idsMarcados() { return Object.keys(base.marcados); }

  function pintarLote() {
    limpar(B.lote);
    var ids = idsMarcados(), visiveis = (base.dados ? base.dados.itens : []).filter(promovivel);
    if (base.confirmar && ids.length) {
      var n = ids.length;
      B.lote.append(h('div', { id: 'l3-base-confirmar', class: 'l3-confirmar', role: 'group', 'aria-labelledby': 'l3-base-pergunta' },
        h('p', { id: 'l3-base-pergunta', text: 'Promover ' + plural(n, 'empresa', 'empresas') + '? Cada uma vira lead com os três toques e entra em Sem contato até o enriquecimento achar o celular.' }),
        h('div', { class: 'acoes' },
          h('button', { type: 'button', class: 'btn primario', id: 'l3-base-sim', disabled: base.ocupado, onclick: function () { promoverVarios(ids); } }, 'Sim, promover ' + n),
          h('button', { type: 'button', class: 'btn', onclick: function () { base.confirmar = false; pintarLote(); focar('l3-base-lote'); } }, 'Cancelar'))));
      focar('l3-base-sim');
      return;
    }
    var todosMarcados = visiveis.length && visiveis.every(function (d) { return base.marcados[d.id]; });
    B.lote.append(
      h('button', { type: 'button', class: 'btn', disabled: !visiveis.length || base.ocupado, onclick: function () {
        visiveis.forEach(function (d) { if (todosMarcados) delete base.marcados[d.id]; else if (idsMarcados().length < LOTE) base.marcados[d.id] = true; });
        pintarBase();
      } }, todosMarcados ? 'Desmarcar esta página' : 'Marcar esta página'),
      h('button', { type: 'button', class: 'btn primario', id: 'l3-base-lote', disabled: !ids.length || base.ocupado,
        onclick: function () { base.confirmar = true; pintarLote(); } }, 'Promover selecionadas (' + ids.length + ')'),
      ids.length >= LOTE ? h('span', { class: 'suave', text: 'Até ' + LOTE + ' por vez.' }) : null);
  }

  function pintarPaginas() {
    var r = base.dados;
    limpar(B.paginas);
    if (!r || r.paginas <= 1) return;
    B.paginas.append(
      h('button', { type: 'button', class: 'btn', disabled: r.pagina <= 1, onclick: function () { base.pagina--; carregarBase(); } }, 'Anterior'),
      h('span', { class: 'suave', text: 'Página ' + r.pagina + ' de ' + r.paginas }),
      h('button', { type: 'button', class: 'btn', disabled: r.pagina >= r.paginas, onclick: function () { base.pagina++; carregarBase(); } }, 'Próxima'));
  }

  function focar(id) { var e = document.getElementById(id); if (e) e.focus(); }

  function promoverUma(d) {
    if (base.ocupado) return;
    base.ocupado = true;
    A.api('api/base/' + encodeURIComponent(d.id) + '/promover', { method: 'POST', corpo: {} })
      .then(function (r) {
        delete base.marcados[d.id];
        A.aviso((d.nome || d.id) + (r.novo ? ' virou lead (' + r.leadId + ').' : ' já estava na central (' + r.leadId + ').'));
        A.atualizar();
      })
      .catch(function (e) { A.aviso(erroMsg(e), true); })
      .then(function () { base.ocupado = false; return carregarBase(); })
      .then(function () { focar('l3-ver-' + d.id); });
  }

  function promoverVarios(ids) {
    if (base.ocupado) return;
    base.ocupado = true;
    pintarLote();
    A.api('api/base/promover', { method: 'POST', corpo: { ids: ids } })
      .then(function (r) {
        base.marcados = {};
        var partes = [];
        if (r.promovidos.length) partes.push(r.promovidos.length === 1 ? '1 empresa virou lead' : r.promovidos.length + ' empresas viraram lead');
        if (r.jaNaCentral.length) partes.push(plural(r.jaNaCentral.length, 'já estava', 'já estavam') + ' na central');
        if (r.pulados.length) partes.push(plural(r.pulados.length, 'ficou', 'ficaram') + ' de fora (sem cadência)');
        A.aviso((partes.join('; ') || 'Nada mudou') + '.');
        A.atualizar();
      })
      .catch(function (e) { A.aviso(erroMsg(e), true); })
      .then(function () { base.ocupado = false; base.confirmar = false; return carregarBase(); })
      .then(function () { focar('l3-base-lote'); });
  }

  function verLead(id) {
    A.abas.ir('quadro');
    A.abrirPainel(id, null);
  }

  A.abas.registrar('base', 'Base', montarBase, function () { carregarBase(); });

  /* ======================================================== PÓS-VENDA */
  var pv = { dados: null, grupo: 'todos', novo: false, ocupado: {} };
  var P = {};

  function montarPV(sec) {
    P.placar = h('dl', { class: 'resumo l3-placar' });
    P.grupos = h('div', { class: 'l3-grupos', role: 'group', 'aria-label': 'Filtrar clientes' });
    P.aviso = h('p', { class: 'suave l3-padrao', hidden: true, text: 'Usando os textos padrão do pós-venda (o banco ainda não tem os textos próprios).' });
    P.form = h('div', { class: 'l3-form-lugar' });
    P.lista = h('ul', { class: 'l3-lista l3-clientes', 'aria-label': 'Clientes do pós-venda' });
    sec.append(
      h('div', { class: 'l3-topo l3-topo-pv' },
        h('h2', { class: 'l3-titulo', text: 'Pós-venda' }),
        h('button', { type: 'button', class: 'btn primario', id: 'l3-novo-cliente', 'aria-expanded': 'false',
          onclick: function () { pv.novo = !pv.novo; pintarForm(); } }, 'Novo cliente')),
      P.placar, P.aviso, P.form, P.grupos, P.lista);
  }

  function carregarPV() {
    return A.api('api/posvenda').then(function (r) { pv.dados = r; produtosCache = r.produtos; pintarPV(); })
      .catch(function (e) { A.aviso(erroMsg(e), true); });
  }

  function pintarPV() {
    var r = pv.dados, c = r.contagens;
    limpar(P.placar);
    [[c.hoje, 'Para hoje'], [c.hoje + c.andamento, 'Clientes ativos'], [c.gravacoes7d, 'Gravações em 7 dias'], [c.concluido, 'Concluídos']]
      .forEach(function (x) { P.placar.append(h('div', null, h('dt', { text: x[1] }), h('dd', { text: String(x[0]) }))); });
    P.aviso.hidden = !r.configPadrao;
    limpar(P.grupos);
    GRUPOS.forEach(function (g) {
      P.grupos.append(h('button', { type: 'button', class: 'filtro', 'aria-pressed': pv.grupo === g[0] ? 'true' : 'false',
        onclick: function () { pv.grupo = g[0]; pintarPV(); } }, g[1] + ' ', h('span', { class: 'num', text: String(g[0] === 'todos' ? c.todos : c[g[0]]) })));
    });
    if (pv.novo && !P.form.firstChild) pintarForm();
    var focoId = document.activeElement && P.lista.contains(document.activeElement) ? document.activeElement.id : null;
    limpar(P.lista);
    var lista = r.clientes.filter(function (x) { return pv.grupo === 'todos' || x.pv.grupo === pv.grupo; });
    if (!r.clientes.length) {
      P.lista.append(h('li', { class: 'vazio', text: 'Nenhum cliente no pós-venda ainda. Use Novo cliente para quem já comprou, ou Virar cliente no painel de um lead que fechou.' }));
    } else if (!lista.length) {
      P.lista.append(h('li', { class: 'vazio', text: 'Nada neste filtro.' }));
    }
    lista.forEach(function (x) { P.lista.append(cartaoCliente(x, r.config)); });
    if (focoId && document.getElementById(focoId)) document.getElementById(focoId).focus();
  }

  function acaoCliente(c, acao) {
    if (pv.ocupado[c.id]) return;
    pv.ocupado[c.id] = true;
    A.api('api/clientes/' + encodeURIComponent(c.id) + '/acao', { method: 'POST', corpo: { acao: acao } })
      .catch(function (e) { A.aviso(erroMsg(e), true); })
      .then(function () { delete pv.ocupado[c.id]; return carregarPV(); });
  }

  function marcarData(c, campo, valor) {
    A.api('api/clientes/' + encodeURIComponent(c.id) + '/data', { method: 'POST', corpo: { campo: campo, valor: valor } })
      .then(function () { A.aviso(valor ? 'Data salva.' : 'Data apagada.'); })
      .catch(function (e) { A.aviso(erroMsg(e), true); })
      .then(carregarPV);
  }

  function copiar(texto) {
    var feito = function () { A.aviso('Mensagem copiada.'); };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(texto).then(feito, function () { A.aviso('Não consegui copiar. Selecione o texto e copie.', true); });
    } else A.aviso('Não consegui copiar. Selecione o texto e copie.', true);
  }

  function cartaoCliente(c, cfg) {
    var p = c.pv, etapas = cfg.etapas || [], ocupado = !!pv.ocupado[c.id], nome = c.nome || c.id;
    var ativo = p.grupo === 'hoje' || p.grupo === 'andamento';
    var titulo = p.grupo === 'concluido' ? 'Todas as etapas concluídas' : 'Etapa ' + p.etapa + ' de ' + p.total + ' · ' + p.etapaNome;
    var passos = h('ol', { class: 'l3-etapas', 'aria-label': 'Etapas de ' + nome }, etapas.map(function (e) {
      var feito = p.grupo === 'concluido' || e.n < p.etapa, agora = !feito && e.n === p.etapa;
      return h('li', { class: feito ? 'feito' : agora ? 'agora' : null, 'aria-current': agora ? 'step' : null },
        h('span', { class: 'so-leitor', text: feito ? 'Concluída: ' : agora ? 'Atual: ' : 'Depois: ' }), e.n + ' · ' + e.nome);
    }));
    var corpo = [];
    if (ativo && p.campoData) {
      var rotulo = p.campoData === 'dataKickoff' ? 'Data do kickoff' : 'Data da gravação';
      var inp = h('input', { type: 'datetime-local', id: 'l3-data-' + c.id, value: c[p.campoData] || '', disabled: ocupado,
        onchange: function (ev) { marcarData(c, p.campoData, ev.target.value); } });
      corpo.push(campo(inp.id, rotulo, inp));
      if (p.precisaData) corpo.push(h('p', { class: 'suave', text: 'Marque a data combinada para liberar a mensagem desta etapa.' }));
    }
    if (ativo && !p.precisaData && p.texto) {
      corpo.push(h('p', { class: 'l3-msg', text: p.texto }));
      corpo.push(h('p', { class: 'suave', text: c.telefone ? 'Para o WhatsApp ' + c.telefone : c.email ? 'Para o e-mail ' + c.email : 'Sem WhatsApp nem e-mail cadastrado.' }));
      var envio = [h('button', { type: 'button', class: 'btn', onclick: function () { copiar(p.texto); } }, 'Copiar mensagem')];
      if (p.link) envio.push(h('a', { class: 'btn', href: p.link, target: '_blank', rel: 'noopener' }, p.porEmail ? 'Abrir e-mail' : 'Abrir no WhatsApp'));
      envio.push(p.enviado
        ? h('button', { type: 'button', class: 'btn', id: 'l3-desf-' + c.id, disabled: ocupado, onclick: function () { acaoCliente(c, 'desfazer-enviado'); } }, 'Desfazer envio')
        : h('button', { type: 'button', class: 'btn', id: 'l3-env-' + c.id, disabled: ocupado, onclick: function () { acaoCliente(c, 'enviado'); } }, 'Marcar como enviada'));
      corpo.push(h('div', { class: 'acoes' }, envio));
    }
    var gestao = [];
    if (ativo) gestao.push(h('button', { type: 'button', class: 'btn primario', id: 'l3-conc-' + c.id, disabled: ocupado,
      onclick: function () { acaoCliente(c, 'concluir'); } }, p.etapa >= p.total ? 'Concluir cliente' : 'Concluir etapa'));
    if (p.etapa > 1 && p.grupo !== 'pausado') gestao.push(h('button', { type: 'button', class: 'btn', id: 'l3-volt-' + c.id, disabled: ocupado,
      onclick: function () { acaoCliente(c, 'voltar'); } }, 'Voltar etapa'));
    if (p.grupo === 'pausado') gestao.push(h('button', { type: 'button', class: 'btn', id: 'l3-ret-' + c.id, disabled: ocupado,
      onclick: function () { acaoCliente(c, 'retomar'); } }, 'Retomar'));
    else if (ativo) gestao.push(h('button', { type: 'button', class: 'btn', id: 'l3-paus-' + c.id, disabled: ocupado,
      onclick: function () { acaoCliente(c, 'pausar'); } }, 'Pausar'));
    var sobre = [c.produto, c.valor != null && c.valor !== '' ? 'R$ ' + Number(c.valor).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '',
                 c.leadId ? 'veio do lead ' + c.leadId : c.origem].filter(Boolean).join(' · ');
    return h('li', { class: 'l3-cliente' + (p.grupo === 'pausado' ? ' apagado' : ''), dataset: { id: c.id } },
      h('article', { 'aria-labelledby': 'l3-cn-' + c.id },
        h('div', { class: 'l3-cab' },
          h('h3', { id: 'l3-cn-' + c.id, class: 'l3-nome', text: nome }),
          h('span', { class: 'l3-estado ' + p.grupo, text: ROTULO_GRUPO[p.grupo] || p.grupo })),
        h('p', { class: 'l3-sub', text: sobre }),
        h('p', { class: 'l3-etapa-atual', text: titulo }),
        passos,
        corpo.length ? h('div', { class: 'l3-toque' }, corpo) : null,
        gestao.length ? h('div', { class: 'acoes', role: 'group', 'aria-label': 'Andamento de ' + nome }, gestao) : null));
  }

  /* ---- Novo cliente */
  var produtosCache = null;
  function produtos() {
    if (produtosCache) return Promise.resolve(produtosCache);
    return A.api('api/posvenda').then(function (r) { produtosCache = r.produtos; return produtosCache; });
  }

  function campoTexto(id, rotulo, extra) {
    var inp = h('input', Object.assign({ id: id, type: 'text' }, extra || {}));
    return { inp: inp, el: campo(id, rotulo, inp) };
  }

  function pintarForm() {
    limpar(P.form);
    var botao = document.getElementById('l3-novo-cliente');
    if (botao) botao.setAttribute('aria-expanded', pv.novo ? 'true' : 'false');
    if (!pv.novo) return;
    var nome = campoTexto('l3-nc-nome', 'Nome do cliente', { autocomplete: 'organization', maxlength: '120' });
    var saud = campoTexto('l3-nc-saudacao', 'Como a Letícia chama (opcional)', { maxlength: '80', placeholder: 'Ex.: Dra. Lara ou pessoal da Clínica' });
    var tel = campoTexto('l3-nc-tel', 'WhatsApp', { inputmode: 'tel', maxlength: '40', placeholder: 'DDD e número' });
    var mail = campoTexto('l3-nc-email', 'E-mail', { type: 'email', maxlength: '120' });
    var valor = campoTexto('l3-nc-valor', 'Valor (R$, opcional)', { inputmode: 'decimal', maxlength: '20', placeholder: 'Ex.: 1.500,00' });
    var prod = h('select', { id: 'l3-nc-produto' });
    var erro = h('p', { id: 'l3-nc-erro', class: 'erro-campo', role: 'alert' });
    var enviar = h('button', { type: 'submit', class: 'btn primario' }, 'Cadastrar e começar');
    produtos().then(function (lista) { lista.forEach(function (p) { prod.append(h('option', { value: p, text: p })); }); });
    var form = h('form', { class: 'l3-form', 'aria-labelledby': 'l3-nc-titulo', novalidate: true, onsubmit: function (ev) {
      ev.preventDefault();
      erro.textContent = '';
      if (!nome.inp.value.trim()) { erro.textContent = 'Preencha o nome do cliente.'; nome.inp.focus(); return; }
      enviar.disabled = true;
      A.api('api/clientes', { method: 'POST', corpo: { nome: nome.inp.value, saudacao: saud.inp.value, telefone: tel.inp.value,
        email: mail.inp.value, produto: prod.value, valor: valor.inp.value.trim() } })
        .then(function () {
          pv.novo = false;
          pintarForm();
          A.aviso('Cliente cadastrado: a mensagem de boas-vindas já está em Para hoje.');
          return carregarPV();
        })
        .catch(function (e) { erro.textContent = erroMsg(e); enviar.disabled = false; });
    } },
      h('h3', { id: 'l3-nc-titulo', text: 'Novo cliente' }),
      h('div', { class: 'l3-grade' }, nome.el, saud.el, tel.el, mail.el,
        campo('l3-nc-produto', 'Serviço contratado', prod), valor.el),
      erro,
      h('div', { class: 'acoes' }, enviar,
        h('button', { type: 'button', class: 'btn', onclick: function () { pv.novo = false; pintarForm(); focar('l3-novo-cliente'); } }, 'Cancelar')));
    P.form.append(form);
    nome.inp.focus();
  }

  A.abas.registrar('posvenda', 'Pós-venda', montarPV, function () { carregarPV(); });

  /* ======================================================== Virar cliente (painel do lead) */
  var virar = { id: null, sit: null };
  function lugarVirar() {
    var el = document.getElementById('l3-virar');
    if (!el) {
      el = h('section', { id: 'l3-virar', class: 'l3-virar', 'aria-label': 'Pós-venda' });
      A.$('painel-extra').append(el);
    }
    return el;
  }

  A.ganchos.painel.push(function (lead, primeiraVez) {
    if (!primeiraVez && virar.id === lead.id && virar.sit === lead.situacao) return;
    virar.id = lead.id;
    virar.sit = lead.situacao;
    var el = lugarVirar();
    limpar(el);
    if (lead.situacao !== 'fechou') { el.hidden = true; return; }
    el.hidden = false;
    var id = lead.id;
    A.api('api/clientes/' + encodeURIComponent(id)).then(function () {
      if (virar.id === id) jaCliente(el);
    }, function (e) {
      if (virar.id !== id) return;
      if (e && e.status === 404) formVirar(el, lead);
      else A.aviso(erroMsg(e), true);
    });
  });

  function jaCliente(el) {
    limpar(el);
    el.append(h('h3', { text: 'Pós-venda' }),
      h('p', { text: 'Já é cliente. As etapas seguem na aba Pós-venda.' }),
      h('button', { type: 'button', class: 'btn', onclick: function () { A.abas.ir('posvenda'); } }, 'Ver no Pós-venda'));
  }

  function formVirar(el, lead) {
    limpar(el);
    var prod = h('select', { id: 'l3-vc-produto' });
    var valor = h('input', { id: 'l3-vc-valor', type: 'text', inputmode: 'decimal', maxlength: '20', placeholder: 'Ex.: 1.500,00' });
    var botao = h('button', { type: 'submit', class: 'btn primario' }, 'Virar cliente');
    produtos().then(function (lista) { lista.forEach(function (p) { prod.append(h('option', { value: p, text: p })); }); });
    el.append(h('form', { class: 'l3-form-virar', onsubmit: function (ev) {
      ev.preventDefault();
      botao.disabled = true;
      A.api('api/leads/' + encodeURIComponent(lead.id) + '/virar-cliente', { method: 'POST', corpo: { produto: prod.value, valor: valor.value.trim() } })
        .then(function () {
          A.aviso('Pronto: ' + (lead.empresa || lead.nome || 'o lead') + ' virou cliente. A boas-vindas está em Pós-venda.');
          virar.sit = null;
          jaCliente(el);
          pv.dados = null;
        })
        .catch(function (e) { A.aviso(erroMsg(e), true); botao.disabled = false; });
    } },
      h('h3', { text: 'Fechou negócio' }),
      h('p', { class: 'suave', text: 'Leve este lead para o pós-venda. A primeira mensagem (boas-vindas) fica para hoje.' }),
      campo('l3-vc-produto', 'Serviço contratado', prod),
      campo('l3-vc-valor', 'Valor (R$, opcional)', valor),
      h('div', { class: 'acoes' }, botao)));
  }
};
