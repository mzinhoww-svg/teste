/* leva 6: aba Funil. Quantos leads há em cada etapa (do primeiro contato ao fechamento), a passagem de uma etapa
   para a outra, a taxa de resposta por segmento e, no card, os botões das etapas comerciais (em conversa, reunião
   marcada, proposta). Todo texto vindo do servidor entra com textContent (A.h). */
window.Atendente_leva6 = function (A) {
  'use strict';
  var h = A.h, api = A.api;
  var COMERCIAIS = [['respondeu', 'Respondeu'], ['conversa', 'Em conversa'], ['reuniao', 'Reunião marcada'],
    ['proposta', 'Proposta']];
  var sec = null, dados = null, segmento = '', carregando = false;

  function erroDe(e) { return A.eRede(e) ? A.ERRO_REDE : e.message; }
  function pct(v) { return v === null || v === undefined ? '—' : String(v).replace('.', ',') + '%'; }

  function carregar() {
    if (carregando) return;
    carregando = true;
    api('api/funil' + (segmento ? '?segmento=' + encodeURIComponent(segmento) : ''))
      .then(function (r) { dados = r; pintar(); })
      .catch(function (e) { A.aviso(erroDe(e), true); })
      .then(function () { carregando = false; });
  }

  function montar(secao) {
    sec = secao;
    sec.append(h('div', { class: 'funil-topo' },
      h('h2', { text: 'Funil' }),
      h('label', { class: 'funil-filtro' }, 'Segmento ',
        h('select', { id: 'funil-segmento', onchange: function (ev) { segmento = ev.target.value; carregar(); } },
          h('option', { value: '', text: 'Todos' }))),
      h('button', { class: 'btn', type: 'button', text: 'Atualizar', onclick: carregar })));
    sec.append(h('div', { id: 'funil-etapas', class: 'funil-etapas' }));
    sec.append(h('h3', { text: 'Resposta por segmento' }));
    sec.append(h('p', { class: 'suave', text: 'Contatados: receberam pelo menos o "Olá". Responderam: qualquer resposta de pessoa, até fechar.' }));
    sec.append(h('div', { class: 'tabela-rolagem' }, h('table', { id: 'funil-segmentos', class: 'funil-tabela' })));
  }

  function pintar() {
    if (!sec || !dados) return;
    var sel = document.getElementById('funil-segmento');
    var atual = sel.value;
    while (sel.options.length > 1) sel.remove(1);
    dados.segmentos.forEach(function (s) { sel.append(h('option', { value: s.segmento, text: s.segmento })); });
    sel.value = atual;

    var box = document.getElementById('funil-etapas'); A.limpar(box);
    dados.etapas.forEach(function (e) {
      var col = h('section', { class: 'funil-col', 'aria-label': e.nome + ': ' + e.qtd });
      var passagem = e.passagem !== null && e.passagem !== undefined
        ? pct(e.passagem) + ' passaram da etapa anterior' : '';
      col.append(h('header', null, h('strong', { text: e.nome }), h('span', { class: 'funil-qtd', text: String(e.qtd) })));
      if (passagem) col.append(h('p', { class: 'suave funil-passagem', text: passagem }));
      var lista = h('ul', { class: 'funil-lista' });
      e.leads.forEach(function (l) {
        lista.append(h('li', null, h('button', { type: 'button', class: 'funil-card',
          onclick: function (ev) { A.abrirPainel(l.id, ev.currentTarget); } },
          h('span', { class: 'funil-empresa', text: l.empresa || l.id }),
          h('span', { class: 'suave', text: [l.segmento, l.resumo].filter(Boolean).join(' · ') }))));
      });
      if (e.qtd > e.leads.length) lista.append(h('li', { class: 'suave', text: 'e mais ' + (e.qtd - e.leads.length) + '...' }));
      if (!e.qtd) lista.append(h('li', { class: 'suave', text: 'Nenhum lead aqui.' }));
      col.append(lista);
      box.append(col);
    });

    var t = document.getElementById('funil-segmentos'); A.limpar(t);
    t.append(h('thead', null, h('tr', null, h('th', { text: 'Segmento' }), h('th', { text: 'Leads' }),
      h('th', { text: 'Contatados' }), h('th', { text: 'Responderam' }), h('th', { text: 'Taxa de resposta' }),
      h('th', { text: 'Fecharam' }))));
    var corpo = h('tbody');
    dados.segmentos.forEach(function (s) {
      corpo.append(h('tr', null, h('td', { text: s.segmento }), h('td', { text: String(s.total) }),
        h('td', { text: String(s.contatados) }), h('td', { text: String(s.responderam) }),
        h('td', { text: pct(s.taxaResposta) }), h('td', { text: String(s.fecharam) })));
    });
    t.append(corpo);
  }

  /* No card: botões das etapas comerciais */
  A.ganchos.painel.push(function (lead) {
    var extra = document.getElementById('painel-extra');
    if (!extra) return;
    var velho = document.getElementById('funil-acoes');
    if (velho) velho.remove();
    if (lead.situacao === 'sair' || lead.situacao === 'fechou') return;
    var atual = lead.situacao === 'respondeu' ? (lead.funil || 'respondeu') : '';
    var grupo = h('div', { id: 'funil-acoes', class: 'acoes', role: 'group', 'aria-label': 'Etapa no funil' },
      h('span', { class: 'suave', text: 'Etapa no funil:' }));
    COMERCIAIS.forEach(function (p) {
      grupo.append(h('button', { class: 'btn', type: 'button', text: p[1], 'aria-pressed': atual === p[0] ? 'true' : 'false',
        onclick: function (ev) {
          var b = ev.currentTarget; b.disabled = true;
          api('api/leads/' + encodeURIComponent(lead.id) + '/funil', { method: 'POST', corpo: { etapa: p[0] } })
            .then(function () { A.aviso('Etapa: ' + p[1] + '.'); if (dados) carregar(); return A.atualizar(); })
            .catch(function (e) { A.aviso(erroDe(e), true); })
            .then(function () { b.disabled = false; });
        } }));
    });
    extra.prepend(grupo);
  });

  A.abas.registrar('funil', 'Funil', montar, carregar);
};
