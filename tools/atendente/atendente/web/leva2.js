/* Leva 2: mover card (arrastar, menu "Mover para…", painel), desfazer, atalhos de teclado e enviar o toque agora.
   Carregado depois do app.js. Todo texto de lead entra com textContent (A.h), nunca innerHTML. */
window.Atendente_leva2 = function (A) {
  'use strict';
  var h = A.h, $ = A.$;
  var DESTINOS = ['Para hoje', 'Aguardando', 'Responderam', 'Fecharam', 'Saíram'];   // "Sem contato" é automático
  var ATALHO_SITUACAO = { '1': 'Aguardando', '2': 'Responderam', '3': 'Fecharam', '4': 'Saíram', 'r': 'Responderam' };
  var DESFAZER_MS = 8000;
  var sel = null;              // id do card selecionado (j/k)
  var arrastando = null;       // id do card sendo arrastado

  function erroTexto(e) { return A.eRede(e) ? A.ERRO_REDE : e.message; }
  function leadDaLista(id) {
    for (var i = 0; i < A.estado.leads.length; i++) if (A.estado.leads[i].id === id) return A.estado.leads[i];
    return null;
  }
  function nomeDe(l) { return (l && (l.empresa || l.nome)) || 'Sem nome'; }
  function noQuadro() { return !A.estado.aba || A.estado.aba === 'quadro'; }

  /* ---------- desfazer (aviso próprio com botão) ---------- */
  var barra = h('div', { id: 'desfazer', class: 'desfazer', role: 'status', 'aria-live': 'polite', hidden: true });
  var barraTexto = h('span');
  var barraBtn = h('button', { class: 'btn', type: 'button', text: 'Desfazer' });
  barra.append(barraTexto, barraBtn);
  document.body.append(barra);
  var desfazerTimer = null, desfazerAcao = null;
  function mostrarDesfazer(texto, acao) {
    barraTexto.textContent = texto;
    desfazerAcao = acao;
    barraBtn.hidden = !acao;
    barra.hidden = false;
    clearTimeout(desfazerTimer);
    desfazerTimer = setTimeout(esconderDesfazer, DESFAZER_MS);
  }
  function esconderDesfazer() { barra.hidden = true; desfazerAcao = null; clearTimeout(desfazerTimer); }
  barraBtn.addEventListener('click', function () {
    var acao = desfazerAcao;
    esconderDesfazer();
    if (acao) acao();
  });

  /* ---------- mover ---------- */
  function aplicarLocal(id, coluna, situacao) {
    var l = leadDaLista(id);
    if (l) { l.coluna = coluna; l.situacao = situacao; }
    A.estado.assinaturaLeads = '';          // a próxima atualização repinta com o que veio do servidor
    A.pintarQuadro();
  }
  /* Recarrega depois de uma ação. Se uma atualização já está no meio, ela pode trazer dados de antes da ação:
     espera ela terminar e busca de novo. */
  function depois() {
    return new Promise(function (pronto) {
      (function tentar() {
        if (A.estado.carregando) { setTimeout(tentar, 80); return; }
        A.estado.assinaturaLeads = '';
        A.atualizar().then(function () { return A.carregarPainel(false); }).then(pronto, pronto);
      })();
    });
  }
  function mover(id, coluna) {
    var l = leadDaLista(id);
    if (!l) return Promise.resolve();
    if (l.coluna === coluna) return Promise.resolve();
    var nome = nomeDe(l);
    return A.api('api/leads/' + encodeURIComponent(id) + '/mover', { method: 'POST', corpo: { coluna: coluna } })
      .then(function (r) {
        if (r.semMudanca) return;
        aplicarLocal(id, r.coluna, r.situacao);
        var antes = r.situacaoAntes;
        mostrarDesfazer((r.aviso ? r.aviso + ' ' : '') + nome + ' foi para ' + r.coluna + '.', function () {
          A.api('api/leads/' + encodeURIComponent(id) + '/situacao', { method: 'POST', corpo: { situacao: antes } })
            .then(function () { A.aviso('Desfeito.'); A.estado.assinaturaLeads = ''; return depois(); })
            .catch(function (e) { A.aviso(erroTexto(e), true); });
        });
        return depois();
      })
      .catch(function (e) { A.aviso(erroTexto(e), true); });
  }

  /* ---------- menu "Mover para…" ---------- */
  var menu = h('div', { id: 'menu-mover', class: 'menu-mover', role: 'menu', 'aria-label': 'Mover para', hidden: true });
  document.body.append(menu);
  var menuOrigem = null;
  function fecharMenu(devolverFoco) {
    if (menu.hidden) return;
    menu.hidden = true;
    A.limpar(menu);
    var o = menuOrigem; menuOrigem = null;
    if (o) o.setAttribute('aria-expanded', 'false');
    if (devolverFoco && o && document.contains(o)) o.focus();
  }
  function abrirMenu(id, origem) {
    var l = leadDaLista(id);
    if (!l) return;
    A.limpar(menu);
    if (menuOrigem && menuOrigem !== origem) menuOrigem.setAttribute('aria-expanded', 'false');
    menuOrigem = origem;
    origem.setAttribute('aria-expanded', 'true');
    menu.setAttribute('aria-label', 'Mover ' + nomeDe(l) + ' para');
    DESTINOS.filter(function (c) { return c !== l.coluna; }).forEach(function (c) {
      menu.append(h('button', { type: 'button', role: 'menuitem', class: 'menu-item', tabindex: '-1', text: c,
        onclick: function () { fecharMenu(true); mover(id, c); } }));
    });
    menu.hidden = false;
    var r = origem.getBoundingClientRect();
    var largura = menu.offsetWidth, altura = menu.offsetHeight;
    var x = Math.max(8, Math.min(r.right - largura, window.innerWidth - largura - 8));
    var y = r.bottom + 4;
    if (y + altura > window.innerHeight - 8) y = Math.max(8, r.top - altura - 4);
    menu.style.left = x + 'px';
    menu.style.top = y + 'px';
    var primeiro = menu.querySelector('[role=menuitem]');
    if (primeiro) primeiro.focus();
  }
  menu.addEventListener('keydown', function (ev) {
    var itens = Array.prototype.slice.call(menu.querySelectorAll('[role=menuitem]'));
    var i = itens.indexOf(document.activeElement);
    if (ev.key === 'ArrowDown' || ev.key === 'ArrowUp') {
      ev.preventDefault();
      var n = itens[(i + (ev.key === 'ArrowDown' ? 1 : itens.length - 1)) % itens.length];
      if (n) n.focus();
    } else if (ev.key === 'Home' || ev.key === 'End') {
      ev.preventDefault();
      (ev.key === 'Home' ? itens[0] : itens[itens.length - 1]).focus();
    } else if (ev.key === 'Escape') {
      ev.preventDefault(); ev.stopPropagation(); fecharMenu(true);
    } else if (ev.key === 'Tab') {
      fecharMenu(false);
    }
  });
  document.addEventListener('mousedown', function (ev) {
    if (!menu.hidden && !menu.contains(ev.target) && ev.target !== menuOrigem) fecharMenu(false);
  });
  window.addEventListener('resize', function () { fecharMenu(false); });

  /* ---------- card: arrastar, botão de mover, seleção ---------- */
  A.ganchos.cartao.push(function (l, li) {
    li.classList.add('movivel');
    li.draggable = true;
    li.addEventListener('dragstart', function (ev) {
      arrastando = l.id;
      li.classList.add('arrastando');
      try { ev.dataTransfer.setData('text/plain', l.id); ev.dataTransfer.effectAllowed = 'move'; } catch (e) { /* nada */ }
    });
    li.addEventListener('dragend', function () {
      arrastando = null;
      li.classList.remove('arrastando');
      document.querySelectorAll('.coluna.alvo').forEach(function (c) { c.classList.remove('alvo'); });
    });
    li.addEventListener('click', function (ev) { if (ev.target.closest('.card')) marcar(l.id, false); });
    var botao = h('button', { class: 'card-mover', type: 'button', 'aria-haspopup': 'menu', 'aria-expanded': 'false', title: 'Mover para…',
      'aria-label': 'Mover ' + nomeDe(l) + ' para outra coluna',
      onclick: function (ev) {
        ev.stopPropagation();
        if (!menu.hidden && menuOrigem === ev.currentTarget) { fecharMenu(true); return; }
        abrirMenu(l.id, ev.currentTarget);
      } }, h('span', { 'aria-hidden': 'true', text: '⋯' }));
    li.append(botao);
    var b = li.querySelector('.card');
    if (b && l.id === sel) b.classList.add('selecionado');
  });

  A.ganchos.quadro.push(function (quadro) {
    quadro.querySelectorAll('.coluna').forEach(function (col) {
      var nome = col.dataset.coluna;
      col.addEventListener('dragover', function (ev) {
        if (!arrastando) return;
        ev.preventDefault();
        try { ev.dataTransfer.dropEffect = 'move'; } catch (e) { /* nada */ }
        col.classList.add('alvo');
      });
      col.addEventListener('dragleave', function (ev) {
        if (!col.contains(ev.relatedTarget)) col.classList.remove('alvo');
      });
      col.addEventListener('drop', function (ev) {
        ev.preventDefault();
        col.classList.remove('alvo');
        var id = arrastando;
        try { id = ev.dataTransfer.getData('text/plain') || id; } catch (e) { /* nada */ }
        arrastando = null;
        if (id) mover(id, nome);
      });
    });
  });

  /* ---------- seleção (j/k) ---------- */
  function cartoes() { return Array.prototype.slice.call(document.querySelectorAll('#quadro .card')); }
  function marcar(id, focar) {
    sel = id;
    cartoes().forEach(function (c) { c.classList.toggle('selecionado', c.dataset.id === id); });
    if (focar) {
      var c = document.querySelector('#quadro .card[data-id="' + CSS.escape(id) + '"]');
      if (c) { c.focus({ preventScroll: true }); c.scrollIntoView({ block: 'nearest', inline: 'nearest' }); }
    }
  }
  function andar(passo) {
    var lista = cartoes();
    if (!lista.length) return;
    var ids = lista.map(function (c) { return c.dataset.id; });
    var i = ids.indexOf(sel);
    var novo = i < 0 ? 0 : Math.max(0, Math.min(ids.length - 1, i + passo));
    marcar(ids[novo], true);
  }
  function alvo() {
    var foco = document.activeElement;
    if (foco && foco.classList && foco.classList.contains('card')) return foco.dataset.id;
    return A.estado.abertoId || sel;
  }

  /* ---------- copiar a mensagem do próximo toque ---------- */
  function copiarTexto(texto) {
    function reserva() {
      var ta = h('textarea', { readonly: true, 'aria-hidden': 'true' });
      ta.value = texto;
      ta.style.position = 'fixed'; ta.style.opacity = '0';
      document.body.append(ta);
      ta.select();
      var ok = false;
      try { ok = document.execCommand('copy'); } catch (e) { ok = false; }
      ta.remove();
      return ok ? Promise.resolve() : Promise.reject(new Error('copiar'));
    }
    if (navigator.clipboard && navigator.clipboard.writeText) return navigator.clipboard.writeText(texto).catch(reserva);
    return reserva();
  }
  function proximo(id) { return A.api('api/leads/' + encodeURIComponent(id) + '/proximo-toque'); }
  function copiarProximo(id) {
    if (!id) return;
    proximo(id).then(function (p) {
      if (!p.texto) { A.aviso(p.motivo || 'Este lead não tem mensagem para copiar.', true); return; }
      return copiarTexto(p.texto).then(function () { A.aviso('Mensagem do toque ' + p.n + ' copiada.'); },
        function () { A.aviso('Não deu para copiar. Abra o lead e selecione o texto.', true); });
    }).catch(function (e) { A.aviso(erroTexto(e), true); });
  }

  /* ---------- enviar o toque agora (com confirmação) ---------- */
  var dlgToque = h('dialog', { id: 'dlg-toque', class: 'dialogo dialogo-largo', 'aria-labelledby': 'dlg-toque-titulo' });
  var dlgTitulo = h('h2', { id: 'dlg-toque-titulo' });
  var dlgPara = h('p', { class: 'suave' });
  var dlgMsg = h('div', { class: 'previa-toque' });
  var dlgFoto = h('p', { class: 'suave' });
  var dlgSim = h('button', { class: 'btn primario', value: 'confirmar', text: 'Sim, enviar agora' });
  dlgToque.append(h('form', { method: 'dialog' }, dlgTitulo, dlgPara, dlgMsg, dlgFoto,
    h('div', { class: 'dlg-botoes' }, h('button', { class: 'btn', value: 'cancelar', text: 'Cancelar' }), dlgSim)));
  document.body.append(dlgToque);
  dlgToque.addEventListener('keydown', function (ev) { if (ev.key === 'Escape') ev.stopPropagation(); });
  var envio = null, focoAntesEnvio = null;

  function pedirEnvio(id, origem) {
    var l = leadDaLista(id);
    return proximo(id).then(function (p) {
      if (!p.podeEnviar) { A.aviso(p.motivo, true); return; }
      envio = { id: id, n: p.n };
      focoAntesEnvio = origem || document.activeElement;
      dlgTitulo.textContent = 'Enviar o toque ' + p.n + ' agora?';
      dlgPara.textContent = 'Para ' + nomeDe(l) + ', pelo WhatsApp da Reiners. Sai na hora.';
      dlgMsg.textContent = p.texto;
      dlgFoto.textContent = p.midiaUrl ? 'Vai junto a foto ' + (p.foto || '') + '.' : 'Sem foto.';
      dlgToque.returnValue = '';
      if (typeof dlgToque.showModal === 'function') dlgToque.showModal(); else dlgToque.setAttribute('open', '');
      dlgSim.focus();
    }).catch(function (e) { A.aviso(erroTexto(e), true); });
  }
  dlgToque.addEventListener('close', function () {
    var e = envio; envio = null;
    var volta = focoAntesEnvio; focoAntesEnvio = null;
    if (volta && document.contains(volta)) volta.focus();
    if (dlgToque.returnValue !== 'confirmar' || !e) return;
    A.api('api/leads/' + encodeURIComponent(e.id) + '/enviar-toque', { method: 'POST', corpo: {} })
      .then(function (r) {
        A.aviso('Toque ' + r.n + ' enviado. Vai sair em instantes pelo WhatsApp.');
        A.estado.assinaturaLeads = '';
        A.estado.assinaturaPainel = '';
        return depois();
      })
      .catch(function (err) { A.aviso(erroTexto(err), true); });
  });

  /* ---------- painel do lead ---------- */
  var painelVez = 0;
  A.ganchos.painel.push(function (lead) {
    var extra = $('painel-extra');
    if (!extra) return;
    var caixa = $('leva2-painel');
    if (!caixa) { caixa = h('div', { id: 'leva2-painel', class: 'leva2-painel' }); extra.prepend(caixa); }
    var vez = ++painelVez;
    var id = lead.id;
    var resumo = leadDaLista(id);
    var atual = resumo ? resumo.coluna : null;
    proximo(id).then(function (p) {
      if (vez !== painelVez || A.estado.abertoId !== id) return;
      A.limpar(caixa);
      var grupo = h('div', { class: 'acoes mover-grupo', role: 'group', 'aria-labelledby': 'leva2-mover-titulo' });
      DESTINOS.filter(function (c) { return c !== atual; }).forEach(function (c) {
        grupo.append(h('button', { class: 'btn', type: 'button', text: c, onclick: function () { mover(id, c); } }));
      });
      var rotulo = p.n ? 'Enviar toque ' + p.n + ' agora' : 'Enviar toque agora';
      var estadoToque = p.n ? (p.podeEnviar ? 'O toque ' + p.n + ' vence hoje.' : p.motivo) : p.motivo;
      caixa.append(
        h('h3', { id: 'leva2-mover-titulo', text: 'Mover para' }), grupo,
        h('h3', { text: 'Próximo toque' }),
        h('p', { class: 'toque-estado' + (p.podeEnviar ? '' : ' suave'), text: estadoToque }),
        p.texto ? h('details', { class: 'toque-previa' }, h('summary', { text: 'Ver a mensagem' }),
          h('div', { class: 'previa-toque', text: p.texto }),
          p.midiaUrl ? h('p', { class: 'suave', text: 'Vai junto a foto ' + (p.foto || '') + '.' }) : null) : null,
        h('div', { class: 'acoes' },
          h('button', { class: 'btn primario', type: 'button', text: rotulo, disabled: !p.podeEnviar,
            onclick: function (ev) { pedirEnvio(id, ev.currentTarget); } }),
          h('button', { class: 'btn', type: 'button', text: 'Copiar mensagem', disabled: !p.texto,
            onclick: function () { copiarProximo(id); } })));
    }).catch(function (e) {
      if (vez === painelVez) { A.limpar(caixa); caixa.append(h('p', { class: 'suave', text: erroTexto(e) })); }
    });
  });

  /* ---------- ajuda dos atalhos ---------- */
  var ATALHOS = [
    ['j / k', 'Próximo / anterior card'], ['Enter', 'Abrir o card selecionado'],
    ['c', 'Copiar a mensagem do próximo toque'], ['e', 'Enviar o próximo toque agora (pede confirmação)'],
    ['/', 'Buscar'], ['1', 'Voltar para a cadência'], ['2 ou r', 'Respondeu'], ['3', 'Fechou'], ['4', 'Saiu'],
    ['Esc', 'Fechar o painel ou esta ajuda'], ['?', 'Mostrar esta ajuda']];
  var dlgAjuda = h('dialog', { id: 'dlg-atalhos', class: 'dialogo', 'aria-labelledby': 'dlg-atalhos-titulo' });
  var lista = h('dl', { class: 'atalhos' });
  ATALHOS.forEach(function (a) { lista.append(h('div', null, h('dt', null, h('kbd', { text: a[0] })), h('dd', { text: a[1] }))); });
  dlgAjuda.append(h('form', { method: 'dialog' }, h('h2', { id: 'dlg-atalhos-titulo', text: 'Atalhos do teclado' }),
    h('p', { class: 'suave', text: 'Valem no quadro, fora dos campos de texto. Agem no card selecionado ou aberto.' }), lista,
    h('div', { class: 'dlg-botoes' }, h('button', { class: 'btn', value: 'fechar', text: 'Fechar' }))));
  document.body.append(dlgAjuda);
  dlgAjuda.addEventListener('keydown', function (ev) { if (ev.key === 'Escape') ev.stopPropagation(); });
  var focoAntesAjuda = null;
  function ajuda(abrir) {
    if (abrir) {
      focoAntesAjuda = document.activeElement;
      if (typeof dlgAjuda.showModal === 'function') dlgAjuda.showModal(); else dlgAjuda.setAttribute('open', '');
    } else if (dlgAjuda.open) dlgAjuda.close();
  }
  dlgAjuda.addEventListener('close', function () {
    var f = focoAntesAjuda; focoAntesAjuda = null;
    if (f && document.contains(f)) f.focus();
  });
  var barraAbas = document.querySelector('.abas-barra');
  if (barraAbas) {
    barraAbas.insertBefore(h('button', { id: 'btn-atalhos', class: 'btn texto', type: 'button', 'aria-keyshortcuts': '?',
      text: 'Atalhos', onclick: function () { ajuda(true); } }), $('btn-backup'));
  }

  /* ---------- teclado ---------- */
  function emCampo(t) {
    if (!t || !t.closest) return false;
    return !!t.closest('input, textarea, select, [contenteditable=""], [contenteditable="true"]');
  }
  function algumDialogo() {
    return Array.prototype.some.call(document.querySelectorAll('dialog'), function (d) { return d.open; });
  }
  document.addEventListener('keydown', function (ev) {
    if (ev.ctrlKey || ev.metaKey || ev.altKey || ev.defaultPrevented) return;
    var t = ev.target, k = ev.key;
    if (k === 'Escape') { fecharMenu(true); return; }
    if (emCampo(t) || !A.estado.logado || algumDialogo() || !menu.hidden) return;
    if (k === '?') { ev.preventDefault(); ajuda(true); return; }
    if (!noQuadro()) return;
    if (ev.repeat && (k === 'Enter' || k === 'c' || k === 'e')) return;   // tecla segurada não repete ação
    if (k === 'j' || k === 'k') { ev.preventDefault(); andar(k === 'j' ? 1 : -1); return; }
    if (k === '/') {
      var busca = $('busca-quadro');
      if (busca) { ev.preventDefault(); busca.focus(); if (busca.select) busca.select(); }
      return;
    }
    if (k === 'Enter') {
      if (t && t.closest && t.closest('a, button, summary, [role=menu], #painel')) return;   // o próprio botão age
      if (sel) { ev.preventDefault(); var c = document.querySelector('#quadro .card[data-id="' + CSS.escape(sel) + '"]'); if (c) c.click(); }
      return;
    }
    var id = alvo();
    if (!id) return;
    if (k === 'c') { ev.preventDefault(); copiarProximo(id); return; }
    if (k === 'e') { ev.preventDefault(); pedirEnvio(id, document.activeElement); return; }
    if (ATALHO_SITUACAO[k]) { ev.preventDefault(); marcar(id, false); mover(id, ATALHO_SITUACAO[k]); }
  });
};
