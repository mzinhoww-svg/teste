/* leva 4: aba Enriquecer. Busca o celular de quem decide (treg, pago, teto de US$ 10 por rodada) e o contato que a
   empresa publica no site (grátis). Tudo roda na VPS; a tela pede, acompanha ao vivo, para e mostra o histórico.
   Todo texto vindo do servidor entra com textContent (A.h). */
window.Atendente_leva4 = function (A) {
  'use strict';
  var h = A.h, api = A.api;
  var POLL_RODANDO = 2000;
  var est = null, plano = null, pedindoPlano = false, timer = null, aberta = false, sec = null;
  var MOTIVO_CURTO = {
    'teto de US$10': 'Teto de US$ 10', 'saldo insuficiente': 'Saldo insuficiente', 'acerto abaixo de 30%': 'Acerto abaixo de 30%', 'acerto muito baixo': 'Acerto muito baixo',
    'erros consecutivos': 'Erros seguidos', 'parado pela equipe': 'Parada pela equipe', 'atendente parado (Parar tudo)': 'Parar tudo',
    'falha inesperada': 'Falha', 'interrompida': 'Serviço reiniciou'
  };

  function micro(m) { return A.dolar((Number(m) || 0) / 1e6); }
  function pct(t) { return typeof t === 'number' ? Math.round(t * 100) + '%' : '–'; }
  function erroDe(e) { return A.eRede(e) ? A.ERRO_REDE : e.message; }
  function q(id) { return document.getElementById(id); }

  /* ---------- montagem ---------- */
  function montar(secao) {
    sec = secao;
    sec.classList.add('enriq');
    sec.append(
      h('div', { class: 'enriq-caixa' },
        h('h2', { text: 'Enriquecer a base' }),
        h('p', { class: 'suave', text: 'Busca o celular de quem decide em cada lead que ainda não tem (serviço pago, o treg) ' +
          'e o contato que a empresa publica no próprio site, para quem não tem telefone nenhum (grátis). ' +
          'Cada rodada para sozinha ao chegar em US$ 10. Leads que saíram ou fecharam ficam de fora.' }),
        h('p', { id: 'enriq-sem-token', class: 'enriq-alerta', hidden: true }),
        h('div', { class: 'enriq-botoes' },
          h('button', { id: 'enriq-btn', class: 'btn primario', type: 'button', disabled: true, onclick: pedirPlano }, 'Enriquecer base'),
          h('button', { id: 'enriq-parar', class: 'btn perigo', type: 'button', hidden: true, onclick: parar }, 'Parar rodada')),
        h('p', { id: 'enriq-motivo', class: 'suave', hidden: true }),
        h('div', { id: 'enriq-plano', class: 'enriq-plano', hidden: true }),
        h('div', { id: 'enriq-andamento', class: 'enriq-andamento', role: 'status', 'aria-live': 'polite' })),
      h('div', { class: 'enriq-caixa' },
        h('h2', { text: 'Rodadas anteriores' }),
        h('div', { id: 'enriq-hist' })));
    // o esqueleto acrescenta a seção no primeiro <main> (o do login); a aba tem de ficar no <main> da tela
    var principal = document.querySelector('#tela-app main');
    if (principal && sec.parentNode !== principal) principal.append(sec);
  }

  function aoAbrir() {
    aberta = true;
    carregar();
  }

  /* ---------- rede ---------- */
  function carregar() {
    return api('api/enriquecer').then(function (d) { est = d; pintar(); agendar(); })
      .catch(function (e) { if (aberta) A.aviso(erroDe(e), true); agendar(); });
  }
  function agendar() {
    clearTimeout(timer);
    if (aberta && est && est.rodando) timer = setTimeout(carregar, POLL_RODANDO);
  }

  function pedirPlano() {
    if (pedindoPlano || !est || !est.disponivel || est.rodando) return;
    pedindoPlano = true;
    q('enriq-btn').disabled = true;
    api('api/enriquecer/plano').then(function (p) { plano = p; pintarPlano(); })
      .catch(function (e) { A.aviso(erroDe(e), true); })
      .then(function () { pedindoPlano = false; pintarBotoes(); });
  }

  function iniciar(simular) {
    var conf = q('enriq-confirmo');
    if (!simular && !(conf && conf.checked)) { A.aviso('Marque a confirmação do teto de US$ 10 para começar.', true); if (conf) conf.focus(); return; }
    var botoes = q('enriq-plano').querySelectorAll('button');
    botoes.forEach(function (b) { b.disabled = true; });
    api('api/enriquecer/iniciar', { method: 'POST', corpo: { confirmo: true, simular: !!simular } })
      .then(function (d) {
        est = d; plano = null; pintarPlano(); pintar(); agendar();
        A.aviso(simular ? 'Simulação começou (não gasta nada nem muda os leads).' : 'Rodada começou. Acompanhe aqui.');
        var parar = q('enriq-parar'); if (parar && !parar.hidden) parar.focus();
      })
      .catch(function (e) { A.aviso(erroDe(e), true); botoes.forEach(function (b) { b.disabled = false; }); carregar(); });
  }

  function parar() {
    if (!window.confirm('Parar a rodada agora? O que já foi buscado fica gravado.')) return;
    q('enriq-parar').disabled = true;
    api('api/enriquecer/parar', { method: 'POST', corpo: {} })
      .then(function (d) { est = d; pintar(); agendar(); A.aviso('Pedido de parada enviado. Para antes do próximo lead.'); })
      .catch(function (e) { A.aviso(erroDe(e), true); carregar(); });
  }

  /* ---------- pintura ---------- */
  function pintar() {
    if (!sec || !est) return;
    var aviso = q('enriq-sem-token');
    aviso.hidden = !!est.disponivel;
    aviso.textContent = est.disponivel ? '' : (est.semToken || 'Falta o token do treg na VPS.');
    pintarBotoes();
    pintarAndamento();
    pintarHistorico();
  }

  function pintarBotoes() {
    var btn = q('enriq-btn'), motivo = q('enriq-motivo'), parar = q('enriq-parar');
    if (!btn || !est) return;
    var porque = !est.disponivel ? 'Desligado: falta o token do treg.' : est.rodando ? 'Já tem uma rodada em andamento.' : '';
    btn.disabled = !!porque || pedindoPlano || !!plano;
    if (porque) btn.setAttribute('aria-describedby', 'enriq-motivo'); else btn.removeAttribute('aria-describedby');
    motivo.textContent = porque;
    motivo.hidden = !porque;
    parar.hidden = !est.rodando;
    parar.disabled = !est.rodando || !!est.pararPor;
  }

  function numeros(pares) {
    return h('dl', { class: 'enriq-numeros' }, pares.filter(Boolean).map(function (p) {
      return h('div', null, h('dt', { text: p[0] }), h('dd', { text: String(p[1]) }));
    }));
  }

  function pintarPlano() {
    var caixa = q('enriq-plano');
    A.limpar(caixa);
    caixa.hidden = !plano;
    pintarBotoes();
    if (!plano) return;
    var nada = !plano.candidatos && !plano.site;
    caixa.append(
      h('h3', { id: 'enriq-plano-titulo', text: 'Antes de começar' }),
      numeros([
        ['Leads para buscar o celular de quem decide', plano.candidatos],
        ['Custo estimado', A.dolar(plano.custoEstimadoUsd)],
        ['Teto desta rodada', A.dolar(plano.tetoUsd)],
        ['Empresas sem telefone para olhar o site (grátis)', plano.site]
      ]),
      h('p', { class: 'suave', text: 'A estimativa usa ' + (plano.fonteTaxa === 'historico' ? 'o acerto das rodadas anteriores' : 'o acerto do piloto') +
        ' (' + pct(plano.taxa) + ' dos leads com telefone achado). Ficam de fora ' + plano.ignorados + ' que saíram ou fecharam e ' +
        plano.foraDoAlvo + ' sem quem decide, sem site e sem LinkedIn, ou já buscados nos últimos 90 dias.' }),
      nada ? h('p', { class: 'enriq-alerta', text: 'Nenhum lead para enriquecer agora.' }) :
        h('label', { class: 'enriq-confirma' },
          h('input', { id: 'enriq-confirmo', type: 'checkbox', onchange: function () { q('enriq-comecar').disabled = !this.checked; } }),
          ' Confirmo que esta rodada pode gastar até ' + A.dolar(plano.tetoUsd) + '.'),
      h('div', { class: 'enriq-botoes' },
        nada ? null : h('button', { id: 'enriq-comecar', class: 'btn primario', type: 'button', disabled: true, onclick: function () { iniciar(false); } }, 'Começar'),
        plano.candidatos ? h('button', { class: 'btn', type: 'button', onclick: function () { iniciar(true); } }, 'Simular sem gastar') : null,
        h('button', { class: 'btn texto', type: 'button', onclick: function () { plano = null; pintarPlano(); q('enriq-btn').focus(); } }, 'Cancelar')));
    var foco = q('enriq-confirmo') || caixa.querySelector('button');
    if (foco) foco.focus();
  }

  function pintarAndamento() {
    var caixa = q('enriq-andamento');
    var assinatura = JSON.stringify([est.status, est.progresso, est.motivoParada, est.pararPor, est.rodando]);
    if (caixa.dataset.sig === assinatura) return;
    caixa.dataset.sig = assinatura;
    A.limpar(caixa);
    var pr = est.progresso || {};
    if (est.status === 'executando') {
      var total = Number(pr.candidatos) || 0, feitos = Number(pr.consultados) || 0;
      var noSite = pr.etapa === 'site';
      caixa.append(
        h('p', { class: 'enriq-estado', text: (est.simulado ? 'Simulação: ' : '') +
          (est.pararPor ? 'Parando a pedido de ' + est.pararPor + '…' : noSite ? 'Olhando os sites das empresas sem telefone' : 'Buscando telefones') }),
        noSite ? h('progress', { max: String(pr.siteTotal || 1), value: String(pr.siteFeitos || 0), 'aria-label': 'Sites visitados' }) :
          total ? h('progress', { max: String(total), value: String(Math.min(feitos, total)), 'aria-label': 'Leads consultados de ' + total }) : null,
        numeros([
          ['Consultados', total ? feitos + ' de ' + total : feitos], ['Achados', pr.achados || 0],
          ['Acerto', pct(pr.taxa)], ['Gasto', micro(pr.gastoMicro) + ' de ' + A.dolar(est.tetoUsd)],
          noSite ? ['Sites', (pr.siteFeitos || 0) + ' de ' + (pr.siteTotal || 0)] : null
        ]),
        pr.atualizadoEm ? h('p', { class: 'suave', text: 'Atualizado em ' + A.quando(pr.atualizadoEm) }) : null);
      return;
    }
    if (est.status === 'concluido' || est.status === 'parado') {
      caixa.append(
        h('p', { class: 'enriq-estado' + (est.status === 'parado' ? ' parado' : ''), text: (est.simulado ? 'Simulação: ' : 'Última rodada: ') + (est.motivoTexto || '') }),
        numeros([['Consultados', pr.consultados || 0], ['Achados', pr.achados || 0], ['Acerto', pct(pr.taxa)],
          ['Gasto', micro(pr.gastoMicro)], pr.siteFeitos ? ['Contatos achados no site', (pr.siteAchados || 0) + ' de ' + pr.siteFeitos] : null]));
    }
  }

  function pintarHistorico() {
    var caixa = q('enriq-hist');
    var hist = (est.historicoExecucoes || []).slice().reverse();
    var assinatura = JSON.stringify(hist);
    if (caixa.dataset.sig === assinatura) return;
    caixa.dataset.sig = assinatura;
    A.limpar(caixa);
    if (!hist.length) { caixa.append(h('p', { class: 'vazio', text: 'Nenhuma rodada ainda.' })); return; }
    var corpo = h('tbody');
    hist.forEach(function (x) {
      var total = (x.achados || 0) + (x.siteAchados || 0);
      var ver = total && x.execucaoId && !x.simulado
        ? h('button', { type: 'button', class: 'btn texto', text: 'Ver os ' + total + ' leads',
            onclick: function (ev) { verAchados(x, ev.currentTarget); } })
        : null;
      corpo.append(h('tr', null,
        h('td', null, h('time', { datetime: x.em || '', text: A.quando(x.em) })),
        h('td', { text: (x.por || '–') + (x.simulado ? ' (simulação)' : '') }),
        h('td', { class: 'num', text: String(x.consultados || 0) }),
        h('td', { class: 'num', text: String(x.achados || 0) }),
        h('td', { class: 'num', text: micro(x.gastoMicro) }),
        h('td', { text: x.motivoParada ? (MOTIVO_CURTO[x.motivoParada] || x.motivoParada) : 'Concluída' }),
        h('td', null, ver)));
    });
    caixa.append(h('div', { class: 'enriq-tabela-rolagem' }, h('table', { class: 'enriq-tabela' },
      h('caption', { class: 'so-leitor', text: 'Rodadas de enriquecimento, da mais recente para a mais antiga' }),
      h('thead', null, h('tr', null, ['Quando', 'Quem pediu', 'Consultados', 'Achados', 'Gasto', 'Resultado', 'Leads'].map(function (t) {
        return h('th', { scope: 'col', text: t });
      }))),
      corpo)));
  }

  /* Lista dos leads em que uma rodada achou telefone, logo abaixo da tabela. Clicar abre o card. */
  function verAchados(rodada, botao) {
    var caixa = q('enriq-achados');
    if (!caixa) { caixa = h('section', { id: 'enriq-achados', class: 'enriq-achados', 'aria-live': 'polite' }); q('enriq-hist').after(caixa); }
    botao.disabled = true;
    A.api('api/enriquecer/achados?execucao=' + encodeURIComponent(rodada.execucaoId)).then(function (r) {
      A.limpar(caixa);
      caixa.append(h('h3', { text: 'Leads com telefone achado na rodada de ' + A.quando(rodada.em) }));
      if (!r.leads.length) { caixa.append(h('p', { class: 'vazio', text: 'Nenhum lead encontrado para esta rodada.' })); return; }
      var lista = h('ul', { class: 'enriq-achados-lista' });
      r.leads.forEach(function (l) {
        lista.append(h('li', null, h('button', { type: 'button', class: 'btn texto', text: l.empresa || l.id,
          onclick: function (ev) { A.abrirPainel(l.id, ev.currentTarget); } }),
          h('span', { class: 'suave', text: ' · ' + [l.segmento, 'origem: ' + l.origem, l.via].filter(Boolean).join(' · ') })));
      });
      caixa.append(lista);
      caixa.scrollIntoView({ block: 'nearest' });
    }).catch(function (e) { A.aviso(A.eRede(e) ? A.ERRO_REDE : e.message, true); })
      .then(function () { botao.disabled = false; });
  }

  /* ---------- resultado no painel do lead ---------- */
  var RESULTADO = { achou: 'Celular de quem decide achado', nao_achou: 'Não achou o celular de quem decide', erro: 'A busca deu erro' };
  function noPainel(lead) {
    var extra = document.getElementById('painel-extra');
    if (!extra) return;
    var caixa = document.getElementById('enriq-painel');
    if (!caixa) { caixa = h('section', { id: 'enriq-painel', class: 'enriq-painel', 'aria-labelledby': 'enriq-painel-titulo' }); extra.append(caixa); }
    A.limpar(caixa);
    var b = lead.buscaTreg, s = lead.siteContatos;
    if (!b && !s) { caixa.hidden = true; return; }
    caixa.hidden = false;
    caixa.append(h('h3', { id: 'enriq-painel-titulo', text: 'Enriquecimento' }));
    if (b) {
      var tel = (lead.contatos || []).filter(function (c) { return c.papel === 'decisor' && /^treg/.test(c.fonte || ''); }).pop();
      caixa.append(h('p', null, h('strong', { text: RESULTADO[b.resultado] || 'Busca feita' }),
        ' em ' + A.quando(b.em) + (b.custoMicro ? ' · ' + micro(b.custoMicro) : '')));
      if (b.resultado === 'achou' && tel) caixa.append(h('p', { class: 'suave', text: (tel.nome || 'Quem decide') + ': ' + (tel.telefone || '') }));
    }
    if (s) {
      caixa.append(h('p', null, s.achou ? 'Contato da empresa achado no site' : 'O site não mostrou contato novo',
        ' em ' + A.quando(s.em)));
    }
  }

  A.abas.registrar('enriquecer', 'Enriquecer', montar, aoAbrir);
  A.ganchos.painel.push(noPainel);
  // sair da aba para o polling rápido; o atualizar geral (15 s) mantém o estado em dia quando ela volta
  document.querySelector('.abas').addEventListener('click', function (ev) {
    var b = ev.target.closest('.aba');
    if (b && b.id !== 'aba-enriquecer') { aberta = false; clearTimeout(timer); }
  });
  A.ganchos.atualizou.push(function (estado) {
    if (estado.aba !== 'enriquecer') { aberta = false; clearTimeout(timer); return; }
    aberta = true;
    if (!timer || !(est && est.rodando)) carregar();
  });
};
