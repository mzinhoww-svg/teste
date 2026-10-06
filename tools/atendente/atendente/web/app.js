/* Tela do atendente. JS puro. URLs sempre relativas (funciona em / e em /central/).
   Todo texto vindo de lead ou do banco entra na página com textContent (função h), nunca com innerHTML. */
(function () {
  'use strict';

  var COLUNAS = ['Para hoje', 'Aguardando', 'Sem contato', 'Responderam', 'Fecharam', 'Saíram'];
  var VAZIO_COLUNA = 'Nenhum lead nesta coluna';
  var ERRO_REDE = 'Não consegui falar com a VPS. Tentando de novo.';
  var ROTULO_ACAO = {
    sozinha: 'IA respondeu sozinha', avisou: 'Avisou a equipe', humano: 'Equipe escreveu',
    sair: 'Lead pediu para sair', ignorou: 'Não respondeu'
  };
  var SITUACAO_ROTULO = { ativo: 'Na cadência', respondeu: 'Respondeu', sair: 'Saiu', fechou: 'Fechou' };

  var intervalo = parseInt(new URLSearchParams(location.search).get('intervalo'), 10);
  var POLL_MS = intervalo >= 300 ? intervalo : 15000;

  var estado = {
    logado: false, config: null, painel: null, wa: null,
    leads: [], assinaturaLeads: '', abaAtend: false, filtro: 'todos', atendimento: [], assinaturaAtend: '',
    abertoId: null, assinaturaPainel: '', ultimoFoco: null,
    mudandoConfig: false, carregando: false, timer: null
  };

  function $(id) { return document.getElementById(id); }

  /* Cria elemento; filhos string viram nós de texto (seguro contra HTML). */
  function h(tag, props) {
    var e = document.createElement(tag);
    var p = props || {};
    Object.keys(p).forEach(function (k) {
      var v = p[k];
      if (v === null || v === undefined || v === false) return;
      if (k === 'class') e.className = v;
      else if (k === 'text') e.textContent = v;
      else if (k === 'dataset') Object.keys(v).forEach(function (d) { e.dataset[d] = v[d]; });
      else if (k.slice(0, 2) === 'on') e.addEventListener(k.slice(2), v);
      else e.setAttribute(k, v === true ? '' : String(v));
    });
    for (var i = 2; i < arguments.length; i++) {
      var filhos = [].concat(arguments[i]);
      for (var j = 0; j < filhos.length; j++) {
        var c = filhos[j];
        if (c === null || c === undefined || c === false) continue;
        e.append(c && c.nodeType ? c : document.createTextNode(String(c)));
      }
    }
    return e;
  }
  function limpar(no) { while (no.firstChild) no.removeChild(no.firstChild); }

  /* ---------- formatação ---------- */
  var fmtData = new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'America/Cuiaba'
  });
  function quando(iso) {
    var d = new Date(iso);
    return iso && !isNaN(d) ? fmtData.format(d).replace(',', '') : '';
  }
  function numero(n) { return typeof n === 'number' ? String(n) : '–'; }
  function dolar(n) {
    return 'US$ ' + Number(n || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }
  function etapaTexto(etapa) {
    var n = parseInt(etapa, 10) || 0;
    return n === 0 ? 'Ainda sem toque' : 'Toque ' + n + ' enviado';
  }

  /* ---------- rede ---------- */
  var avisoTimer = null;
  function aviso(texto, erro) {
    var el = $('avisos');
    el.textContent = texto || '';
    el.className = 'avisos' + (erro ? ' erro' : '');
    clearTimeout(avisoTimer);
    if (texto && !erro) avisoTimer = setTimeout(function () { el.textContent = ''; }, 4000);
  }

  function ErroApi(status, msg) { this.status = status; this.message = msg; }

  function api(caminho, opcoes) {
    var o = opcoes || {};
    var init = { method: o.method || 'GET', credentials: 'same-origin', headers: { 'Accept': 'application/json' } };
    if (o.corpo !== undefined) {
      init.body = JSON.stringify(o.corpo);
      init.headers['Content-Type'] = 'application/json';
    }
    return fetch(caminho, init).then(function (r) {
      return r.text().then(function (t) {
        var dados = null;
        try { dados = t ? JSON.parse(t) : null; } catch (e) { dados = null; }
        if (r.status === 401 && caminho !== 'login') { mostrarLogin(); throw new ErroApi(401, 'Sessão encerrada.'); }
        if (!r.ok) throw new ErroApi(r.status, (dados && dados.erro) || 'Algo deu errado. Tente de novo.');
        return dados;
      });
    });
  }
  function eRede(e) { return !(e instanceof ErroApi); }

  /* ---------- login ---------- */
  function mostrarLogin() {
    estado.logado = false;
    clearInterval(estado.timer);
    $('tela-app').hidden = true;
    $('tela-login').hidden = false;
    fecharPainel(true);
    $('login-senha').value = '';
  }
  function mostrarApp() {
    estado.logado = true;
    $('tela-login').hidden = true;
    $('tela-app').hidden = false;
    medirFaixa();
    atualizar();
    clearInterval(estado.timer);
    estado.timer = setInterval(atualizar, POLL_MS);
  }
  $('form-login').addEventListener('submit', function (ev) {
    ev.preventDefault();
    $('login-erro').textContent = '';
    var botao = $('login-entrar');
    botao.disabled = true;
    api('login', { method: 'POST', corpo: { usuario: $('login-usuario').value.trim(), senha: $('login-senha').value } })
      .then(function () { mostrarApp(); })
      .catch(function (e) {
        $('login-erro').textContent = eRede(e) ? ERRO_REDE : e.message;
        $('login-senha').focus();
      })
      .then(function () { botao.disabled = false; });
  });
  $('btn-sessao').addEventListener('click', function () {
    api('logout', { method: 'POST', corpo: {} }).catch(function () {}).then(mostrarLogin);
  });

  /* ---------- faixa do topo ---------- */
  function medirFaixa() {
    var f = $('faixa');
    if (f && !$('tela-app').hidden) document.documentElement.style.setProperty('--faixa-h', f.offsetHeight + 'px');
  }
  if (window.ResizeObserver) new ResizeObserver(medirFaixa).observe($('faixa'));
  window.addEventListener('resize', medirFaixa);

  function pintarFaixa() {
    var c = estado.config || {}, p = estado.painel || {};
    var ligado = c.auto_resposta === true;
    var sw = $('interruptor');
    sw.setAttribute('aria-checked', ligado ? 'true' : 'false');
    $('interruptor-estado').textContent = ligado ? 'Ligadas: a IA responde sozinha' : 'Desligadas: só a equipe responde';
    sw.disabled = estado.mudandoConfig;

    var parado = c.status === 'parado';
    var botao = $('btn-parar');
    botao.textContent = parado ? 'Retomar' : 'Parar tudo';
    botao.className = 'btn ' + (parado ? 'retomar' : 'perigo');
    botao.disabled = estado.mudandoConfig;
    $('faixa-parado').hidden = !parado;
    var aguardando = c.status === 'aguardando';
    $('faixa-aguardando').hidden = !aguardando;
    $('btn-ligar').disabled = estado.mudandoConfig;

    var wa = $('wa-estado');
    var conectado = estado.wa && estado.wa.conectado === true;
    wa.textContent = conectado ? 'WhatsApp conectado' : 'WhatsApp desconectado';
    wa.className = 'chip' + (conectado ? ' ok' : '');

    $('r-fila').textContent = numero(p.naFila);
    $('r-enviadas').textContent = numero(p.enviadasHoje);
    $('r-auto').textContent = numero(p.autoHoje);
    $('r-avisos').textContent = numero(p.avisosHoje);
    var gasto = Number(p.gastoMesUsd || 0), teto = Number(c.teto_usd_mes || 0);
    var dd = $('r-gasto');
    dd.textContent = dolar(gasto) + ' de ' + dolar(teto) + (teto > 0 && gasto >= teto ? ' (teto atingido)' : '');
    dd.className = teto > 0 && gasto >= teto ? 'estouro' : (teto > 0 && gasto >= teto * 0.8 ? 'perto' : '');
    medirFaixa();
  }

  function gravarConfig(mudanca, voltar) {
    estado.mudandoConfig = true;
    pintarFaixa();
    return api('api/config', { method: 'POST', corpo: mudanca })
      .then(function (r) {
        estado.config = r.config;
        if (r.erroCancelar) aviso(r.erroCancelar, true);
        return r;
      })
      .catch(function (e) {
        if (voltar) voltar();
        aviso(eRede(e) ? ERRO_REDE : e.message, true);
        throw e;
      })
      .then(function (r) { estado.mudandoConfig = false; pintarFaixa(); return r; },
            function () { estado.mudandoConfig = false; pintarFaixa(); });
  }

  $('interruptor').addEventListener('click', function () {
    if (estado.mudandoConfig || !estado.config) return;
    var antes = estado.config.auto_resposta === true;
    estado.config.auto_resposta = !antes;           // otimista; volta se o servidor recusar
    gravarConfig({ auto_resposta: !antes }, function () { estado.config.auto_resposta = antes; })
      .then(function (r) { if (r) aviso(r.config.auto_resposta ? 'Respostas automáticas ligadas.' : 'Respostas automáticas desligadas.'); });
  });

  $('btn-ligar').addEventListener('click', function () {
    if (estado.mudandoConfig || !estado.config) return;
    gravarConfig({ status: 'ativo' }).then(function (r) { if (r) { aviso('Atendente ligado.'); atualizar(); } });
  });

  var dlg = $('dlg-parar');
  $('btn-parar').addEventListener('click', function () {
    if (estado.mudandoConfig || !estado.config) return;
    if (estado.config.status === 'parado') {
      gravarConfig({ status: 'ativo' }).then(function (r) { if (r) { aviso('Retomado. A fila volta a andar.'); atualizar(); } });
      return;
    }
    if (typeof dlg.showModal === 'function') dlg.showModal(); else dlg.setAttribute('open', '');
    $('dlg-cancelar').focus();
  });
  dlg.addEventListener('close', function () {
    if (dlg.returnValue === 'confirmar') {
      gravarConfig({ status: 'parado' }).then(function (r) {
        if (!r) return;
        var n = typeof r.cancelados === 'number' ? r.cancelados : 0;
        aviso('Tudo parado. ' + n + (n === 1 ? ' envio cancelado.' : ' envios cancelados.'));
        atualizar();
      });
    }
    dlg.returnValue = '';
    $('btn-parar').focus();
  });

  /* ---------- quadro ---------- */
  function cartao(l) {
    var ult = l.ultimaMensagem;
    return h('li', null,
      h('button', {
        class: 'card', type: 'button', dataset: { id: l.id }, 'aria-expanded': estado.abertoId === l.id ? 'true' : 'false',
        onclick: function (ev) { abrirPainel(l.id, ev.currentTarget); }
      },
        h('span', { class: 'card-empresa', text: l.empresa || l.nome || 'Sem nome' }),
        h('span', { class: 'card-etapa', text: etapaTexto(l.etapa) }),
        ult && ult.texto ? h('span', { class: 'card-msg' }, h('b', { text: ult.de_mim ? 'Nós: ' : 'Lead: ' }), ult.texto)
                         : h('span', { class: 'card-msg suave', text: 'Sem mensagens ainda' }),
        l.atencao ? h('span', { class: 'marca-atencao', text: 'ATENÇÃO' }) : null,
        l.atencao ? h('span', { class: 'so-leitor', text: l.atencao }) : null));
  }

  function pintarQuadro() {
    var quadro = $('quadro');
    var rolagemX = quadro.scrollLeft;
    var rolagemY = {};
    var focoId = document.activeElement && document.activeElement.classList && document.activeElement.classList.contains('card')
      ? document.activeElement.dataset.id : null;
    quadro.querySelectorAll('.coluna').forEach(function (c) { rolagemY[c.dataset.coluna] = c.querySelector('.cards').scrollTop; });

    limpar(quadro);
    var porColuna = {};
    COLUNAS.forEach(function (c) { porColuna[c] = []; });
    estado.leads.forEach(function (l) { (porColuna[l.coluna] || porColuna['Aguardando']).push(l); });
    COLUNAS.forEach(function (nome) {
      var lista = porColuna[nome];
      var titulo = 'col-' + COLUNAS.indexOf(nome);
      var ul = h('ul', { class: 'cards' }, lista.map(cartao));
      quadro.append(h('section', { class: 'coluna', dataset: { coluna: nome }, 'aria-labelledby': titulo },
        h('div', { class: 'coluna-topo' }, h('h2', { id: titulo, text: nome }), h('span', { class: 'num', text: String(lista.length) })),
        lista.length ? ul : h('p', { class: 'vazio', text: VAZIO_COLUNA })));
    });
    quadro.scrollLeft = rolagemX;
    quadro.querySelectorAll('.coluna').forEach(function (c) {
      var ul = c.querySelector('.cards');
      if (ul && rolagemY[c.dataset.coluna]) ul.scrollTop = rolagemY[c.dataset.coluna];
    });
    if (focoId) {
      var novo = quadro.querySelector('.card[data-id="' + CSS.escape(focoId) + '"]');
      if (novo) novo.focus({ preventScroll: true });
    }
  }

  /* ---------- painel do lead ---------- */
  function abrirPainel(id, origem) {
    var jaAberto = estado.abertoId === id;
    estado.abertoId = id;
    if (origem) estado.ultimoFoco = origem;
    estado.assinaturaPainel = '';
    if (!jaAberto) $('nota-texto').value = '';
    $('painel').hidden = false;
    medirFaixa();
    marcarCartaoAberto();
    carregarPainel(true);
  }
  function fecharPainel(semFoco) {
    estado.abertoId = null;
    estado.assinaturaPainel = '';
    $('painel').hidden = true;
    marcarCartaoAberto();
    var f = estado.ultimoFoco;
    estado.ultimoFoco = null;
    if (!semFoco && f && document.contains(f)) f.focus();
    else if (!semFoco) { var q = $('quadro'); if (q) q.focus(); }
  }
  function marcarCartaoAberto() {
    document.querySelectorAll('.card').forEach(function (c) {
      c.setAttribute('aria-expanded', c.dataset.id === estado.abertoId ? 'true' : 'false');
    });
  }
  $('painel-fechar').addEventListener('click', function () { fecharPainel(false); });
  document.addEventListener('keydown', function (ev) {
    if (ev.key === 'Escape' && estado.abertoId && !dlg.open) fecharPainel(false);
  });

  function carregarPainel(primeiraVez) {
    var id = estado.abertoId;
    if (!id) return Promise.resolve();
    return api('api/leads/' + encodeURIComponent(id)).then(function (lead) {
      if (estado.abertoId !== id) return;
      var assinatura = JSON.stringify([lead.mensagens, lead.historico, lead.situacao, lead.etapa, lead.empresa]);
      if (!primeiraVez && assinatura === estado.assinaturaPainel) return;
      estado.assinaturaPainel = assinatura;
      pintarPainel(lead, primeiraVez);
    }).catch(function (e) {
      if (e instanceof ErroApi && e.status === 404) { fecharPainel(true); aviso('Esse lead não existe mais.', true); }
      else if (primeiraVez && !(e instanceof ErroApi && e.status === 401)) aviso(eRede(e) ? ERRO_REDE : e.message, true);
    });
  }

  function pintarPainel(lead, primeiraVez) {
    $('painel-titulo').textContent = lead.empresa || lead.nome || 'Sem nome';
    var sub = [];
    if (lead.nome && lead.nome !== lead.empresa) sub.push(lead.nome);
    if (lead.telefone) sub.push(lead.telefone);
    sub.push(etapaTexto(lead.etapa));
    sub.push(SITUACAO_ROTULO[lead.situacao] || lead.situacao || '');
    $('painel-sub').textContent = sub.filter(Boolean).join(' · ');
    document.querySelectorAll('#painel-acoes .btn').forEach(function (b) {
      var atual = b.dataset.sit === lead.situacao;
      b.setAttribute('aria-pressed', atual ? 'true' : 'false');
    });

    var conversa = $('painel-conversa'); limpar(conversa);
    var msgs = lead.mensagens || [];
    if (!msgs.length) conversa.append(h('li', { class: 'vazio', text: 'Ainda não há mensagens com este lead.' }));
    msgs.forEach(function (m) {
      var texto = m.texto || (m.tipo && m.tipo !== 'TEXT' ? '[' + m.tipo + ']' : '');
      conversa.append(h('li', { class: 'bolha' + (m.de_mim ? ' minha' : '') },
        h('span', { class: 'quem', text: m.de_mim ? 'Nós' : 'Lead' }), h('div', { text: texto }),
        h('time', { datetime: m.em || '', text: quando(m.em) })));
    });

    var hist = $('painel-historico'); limpar(hist);
    var itens = (lead.historico || []).slice().reverse();
    if (!itens.length) hist.append(h('li', { class: 'vazio', text: 'Nada registrado ainda.' }));
    itens.forEach(function (it) {
      var t = typeof it === 'string' ? it : (it && it.texto) || '';
      hist.append(h('li', { class: 'hist-item' + (t.indexOf('ATENÇÃO:') !== -1 ? ' atencao' : '') },
        h('time', { datetime: (it && it.em) || '', text: quando(it && it.em) }), t));
    });
    if (primeiraVez) $('painel-titulo').focus({ preventScroll: true });
  }

  $('painel-acoes').addEventListener('click', function (ev) {
    var b = ev.target.closest('button[data-sit]');
    if (!b || !estado.abertoId) return;
    var id = estado.abertoId;
    var botoes = document.querySelectorAll('#painel-acoes .btn');
    botoes.forEach(function (x) { x.disabled = true; });
    api('api/leads/' + encodeURIComponent(id) + '/situacao', { method: 'POST', corpo: { situacao: b.dataset.sit } })
      .then(function () { aviso('Situação: ' + (SITUACAO_ROTULO[b.dataset.sit] || b.dataset.sit) + '.'); return atualizar(); })
      .catch(function (e) { aviso(eRede(e) ? ERRO_REDE : e.message, true); })
      .then(function () { botoes.forEach(function (x) { x.disabled = false; }); });
  });

  $('form-nota').addEventListener('submit', function (ev) {
    ev.preventDefault();
    var campo = $('nota-texto');
    var texto = campo.value.trim();
    if (!texto || !estado.abertoId) { aviso('Escreva a nota antes de salvar.', true); campo.focus(); return; }
    var id = estado.abertoId;
    api('api/leads/' + encodeURIComponent(id) + '/nota', { method: 'POST', corpo: { texto: texto } })
      .then(function () {
        if (estado.abertoId === id && campo.value.trim() === texto) campo.value = '';
        aviso('Nota salva.');
        return carregarPainel(false);
      })
      .catch(function (e) { aviso(eRede(e) ? ERRO_REDE : e.message, true); });   // mantém o texto digitado
  });

  /* ---------- atendimento ---------- */
  function pintarAtendimento() {
    var ol = $('lista-atend');
    var filtro = estado.filtro;
    var linhas = estado.atendimento.filter(function (r) { return filtro === 'todos' || r.acao === filtro; });
    limpar(ol);
    if (!linhas.length) {
      ol.append(h('li', { class: 'vazio', text: filtro === 'todos' ? 'Nada por aqui ainda. Quando um lead responder, aparece neste lugar.' : 'Nada neste filtro ainda.' }));
      return;
    }
    linhas.forEach(function (r) {
      ol.append(h('li', { class: 'atend-linha' },
        h('div', { class: 'atend-topo' },
          h('strong', { text: r.empresa || 'Lead sem empresa' }),
          h('span', { class: 'etiqueta ' + (r.acao || ''), text: ROTULO_ACAO[r.acao] || r.acao || 'Registro' }),
          h('time', { datetime: r.em || '', text: quando(r.em) })),
        r.mensagemLead ? h('p', null, h('span', { class: 'quem', text: 'Lead escreveu: ' }), r.mensagemLead) : null,
        r.respostaEnviada ? h('p', null, h('span', { class: 'quem', text: 'Resposta enviada: ' }), r.respostaEnviada) : null,
        r.motivoAviso ? h('p', null, h('span', { class: 'quem', text: 'Motivo: ' }), r.motivoAviso) : null));
    });
  }

  function trocarAba(atend) {
    estado.abaAtend = atend;
    $('aba-quadro').setAttribute('aria-selected', atend ? 'false' : 'true');
    $('aba-quadro').tabIndex = atend ? -1 : 0;
    $('aba-atend').setAttribute('aria-selected', atend ? 'true' : 'false');
    $('aba-atend').tabIndex = atend ? 0 : -1;
    $('vista-quadro').hidden = atend;
    $('vista-atend').hidden = !atend;
    if (atend) fecharPainel(true);
    atualizar();
  }
  $('aba-quadro').addEventListener('click', function () { trocarAba(false); });
  $('aba-atend').addEventListener('click', function () { trocarAba(true); });
  document.querySelector('.abas').addEventListener('keydown', function (ev) {
    if (ev.key === 'ArrowRight' || ev.key === 'ArrowLeft') {
      var vaiAtend = ev.key === 'ArrowRight';
      trocarAba(vaiAtend);
      (vaiAtend ? $('aba-atend') : $('aba-quadro')).focus();
    }
  });
  document.querySelector('.filtros').addEventListener('click', function (ev) {
    var b = ev.target.closest('.filtro');
    if (!b) return;
    estado.filtro = b.dataset.filtro;
    document.querySelectorAll('.filtro').forEach(function (x) { x.setAttribute('aria-pressed', x === b ? 'true' : 'false'); });
    pintarAtendimento();
  });

  /* ---------- atualização ---------- */
  function atualizar() {
    if (!estado.logado || estado.carregando) return Promise.resolve();
    estado.carregando = true;
    var pedidos = [api('api/estado'), api('api/leads')];
    if (estado.abaAtend) pedidos.push(api('api/atendimento?limite=100'));
    return Promise.all(pedidos).then(function (r) {
      if (!estado.mudandoConfig) { estado.config = r[0].config; }
      estado.painel = r[0].painel; estado.wa = r[0].wa;
      pintarFaixa();
      var ass = JSON.stringify(r[1]);
      if (ass !== estado.assinaturaLeads) { estado.assinaturaLeads = ass; estado.leads = r[1]; pintarQuadro(); }
      if (r[2]) {
        var a2 = JSON.stringify(r[2]);
        if (a2 !== estado.assinaturaAtend) { estado.assinaturaAtend = a2; estado.atendimento = r[2]; pintarAtendimento(); }
      }
      if ($('avisos').classList.contains('erro')) aviso('');
      return carregarPainel(false);
    }).catch(function (e) {
      if (e instanceof ErroApi && e.status === 401) return;
      aviso(eRede(e) ? ERRO_REDE : e.message, true);
    }).then(function () { estado.carregando = false; });
  }

  /* ---------- início ---------- */
  api('api/estado').then(function () { mostrarApp(); }, function (e) {
    if (e instanceof ErroApi && e.status === 401) return;   // api() já mostrou o login
    mostrarApp();                                            // sem rede: mostra o erro e tenta de novo sozinha
  });
})();
