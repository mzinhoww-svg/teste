/* Busca geral da Central: acha lead, empresa da Base e cliente por nome, sócio, cidade, CNPJ, e-mail, site e telefone
   (inteiro ou só o final). Atalho: Ctrl+K (ou ⌘+K). Carregado depois do app.js; texto vindo do servidor entra só
   com textContent (A.h), nunca innerHTML. */
window.Atendente_busca = function (A) {
  'use strict';
  var h = A.h;
  var ATRASO_MS = 250;
  var ROTULO_TIPO = { lead: 'Lead', base: 'Base', cliente: 'Cliente' };
  var ROTULO_MOTIVO = { telefone: 'telefone', cnpj: 'CNPJ', contato: 'sócio ou contato' };
  var timer = null, pedido = 0, itens = [];

  var campo = h('input', {
    id: 'busca-geral', type: 'search', autocomplete: 'off', spellcheck: 'false', 'aria-controls': 'busca-lista',
    'aria-label': 'Buscar lead, empresa ou telefone', placeholder: 'Buscar lead, empresa ou telefone (Ctrl+K)'
  });
  var estado = h('p', { id: 'busca-estado', class: 'so-leitor', role: 'status', 'aria-live': 'polite' });
  var lista = h('ul', { id: 'busca-lista', class: 'busca-lista', role: 'listbox', 'aria-label': 'Resultados da busca', hidden: true });
  var caixa = h('div', { class: 'busca-caixa', role: 'search' }, campo, estado, lista);
  var barra = document.querySelector('.abas-barra');
  if (!barra) return;
  barra.insertBefore(caixa, document.getElementById('btn-backup'));

  function fechar() { lista.hidden = true; campo.removeAttribute('aria-expanded'); }

  function abrir(r) {
    fechar();
    if (r.tipo === 'lead') {
      A.abas.ir('quadro');
      A.abrirPainel(r.id, null);
    } else if (r.tipo === 'base') {
      A.abas.ir('base');
      var b = document.getElementById('l3-base-busca');
      if (b) { b.value = r.nome; b.dispatchEvent(new Event('input', { bubbles: true })); }
    } else {
      A.abas.ir('posvenda');
    }
  }

  function linha(r) {
    var onde = [ROTULO_TIPO[r.tipo] || r.tipo, r.coluna || (r.tipo === 'base' ? (r.status || 'na Base') : ''), r.cidade]
      .filter(Boolean).join(' · ');
    var por = r.motivo === 'telefone' ? 'telefone com final ' + r.final : (ROTULO_MOTIVO[r.motivo] ? 'achado por ' + ROTULO_MOTIVO[r.motivo] : '');
    return h('li', { role: 'presentation' },
      h('button', { class: 'busca-item', type: 'button', role: 'option', onclick: function () { abrir(r); } },
        h('span', { class: 'busca-nome', text: r.nome }),
        h('span', { class: 'busca-sub suave', text: onde }),
        por ? h('span', { class: 'busca-por', text: por }) : null));
  }

  function mostrar(d, q) {
    A.limpar(lista);
    itens = d.resultados || [];
    if (!itens.length) {
      lista.append(h('li', { class: 'busca-vazio suave', text: 'Nada encontrado para "' + q + '".' }));
      estado.textContent = 'Nada encontrado.';
    } else {
      itens.forEach(function (r) { lista.append(linha(r)); });
      estado.textContent = d.total > itens.length ? itens.length + ' de ' + d.total + ' resultados. Refine a busca.' : itens.length + ' resultado' + (itens.length > 1 ? 's' : '') + '.';
    }
    lista.hidden = false;
    campo.setAttribute('aria-expanded', 'true');
  }

  function buscar() {
    var q = campo.value.trim();
    var minimo = /^[\d\s().+\/-]+$/.test(q) ? 4 : 2;
    if (q.replace(/\s/g, '').length < minimo) { fechar(); estado.textContent = ''; return; }
    var meu = ++pedido;
    A.api('api/buscar?q=' + encodeURIComponent(q)).then(function (d) { if (meu === pedido) mostrar(d, q); })
      .catch(function (e) { if (meu === pedido) { A.aviso(A.eRede(e) ? A.ERRO_REDE : e.message, true); } });
  }

  campo.addEventListener('input', function () { clearTimeout(timer); timer = setTimeout(buscar, ATRASO_MS); });
  campo.addEventListener('keydown', function (ev) {
    if (ev.key === 'Escape') { campo.value = ''; fechar(); estado.textContent = ''; }
    if (ev.key === 'ArrowDown' && !lista.hidden) {
      var p = lista.querySelector('.busca-item'); if (p) { ev.preventDefault(); p.focus(); }
    }
    if (ev.key === 'Enter' && itens.length) { ev.preventDefault(); abrir(itens[0]); }
  });
  lista.addEventListener('keydown', function (ev) {
    var bts = [].slice.call(lista.querySelectorAll('.busca-item')), i = bts.indexOf(document.activeElement);
    if (ev.key === 'ArrowDown' && i < bts.length - 1) { ev.preventDefault(); bts[i + 1].focus(); }
    if (ev.key === 'ArrowUp') { ev.preventDefault(); (i > 0 ? bts[i - 1] : campo).focus(); }
    if (ev.key === 'Escape') { fechar(); campo.focus(); }
  });
  document.addEventListener('click', function (ev) { if (!caixa.contains(ev.target)) fechar(); });
  document.addEventListener('keydown', function (ev) {
    if ((ev.ctrlKey || ev.metaKey) && ev.key.toLowerCase() === 'k') { ev.preventDefault(); campo.focus(); campo.select(); }
  });
};
