/* leva 5: aba Prospecção. Campanhas que acham donos e decisores de empresas de Mato Grosso, buscam o celular,
   conferem o WhatsApp e colocam na cadência. A tela cria a campanha, pede confirmação do teto, inicia, acompanha o
   funil ao vivo e para. Tudo roda na VPS. Todo texto vindo do servidor entra com textContent (A.h). */
window.Atendente_leva5 = function (A) {
  'use strict';
  var h = A.h, api = A.api;
  var POLL_RODANDO = 2000;
  var TETO_DIA = 10, TETO_CAMPANHA = 30, META_DIA = 20;
  var est = null, carregou = false, timer = null, aberta = false, sec = null;
  var formAberto = false, enviando = false, cidades = [];
  var confirmando = null, confMarcado = false, iniciando = false, funilAberto = {}, funis = {};

  /* As 142 cidades de Mato Grosso (IBGE). Só elas valem numa campanha. */
  var CIDADES_MT = ('Acorizal|Água Boa|Alta Floresta|Alto Araguaia|Alto Boa Vista|Alto Garças|Alto Paraguai|Alto Taquari|' +
    'Apiacás|Araguaiana|Araguainha|Araputanga|Arenápolis|Aripuanã|Barão de Melgaço|Barra do Bugres|Barra do Garças|' +
    'Boa Esperança do Norte|Bom Jesus do Araguaia|Brasnorte|Cáceres|Campinápolis|Campo Novo do Parecis|Campo Verde|' +
    'Campos de Júlio|Canabrava do Norte|Canarana|Carlinda|Castanheira|Chapada dos Guimarães|Cláudia|Cocalinho|Colíder|' +
    'Colniza|Comodoro|Confresa|Conquista D\'Oeste|Cotriguaçu|Cuiabá|Curvelândia|Denise|Diamantino|Dom Aquino|Feliz Natal|' +
    'Figueirópolis D\'Oeste|Gaúcha do Norte|General Carneiro|Glória D\'Oeste|Guarantã do Norte|Guiratinga|Indiavaí|' +
    'Ipiranga do Norte|Itanhangá|Itaúba|Itiquira|Jaciara|Jangada|Jauru|Juara|Juína|Juruena|Juscimeira|Lambari D\'Oeste|' +
    'Lucas do Rio Verde|Luciara|Marcelândia|Matupá|Mirassol D\'Oeste|Nobres|Nortelândia|Nossa Senhora do Livramento|' +
    'Nova Bandeirantes|Nova Brasilândia|Nova Canaã do Norte|Nova Guarita|Nova Lacerda|Nova Marilândia|Nova Maringá|' +
    'Nova Monte Verde|Nova Mutum|Nova Nazaré|Nova Olímpia|Nova Santa Helena|Nova Ubiratã|Nova Xavantina|' +
    'Novo Horizonte do Norte|Novo Mundo|Novo Santo Antônio|Novo São Joaquim|Paranaíta|Paranatinga|Pedra Preta|' +
    'Peixoto de Azevedo|Planalto da Serra|Poconé|Pontal do Araguaia|Ponte Branca|Pontes e Lacerda|Porto Alegre do Norte|' +
    'Porto dos Gaúchos|Porto Esperidião|Porto Estrela|Poxoréu|Primavera do Leste|Querência|Reserva do Cabaçal|' +
    'Ribeirão Cascalheira|Ribeirãozinho|Rio Branco|Rondolândia|Rondonópolis|Rosário Oeste|Salto do Céu|Santa Carmem|' +
    'Santa Cruz do Xingu|Santa Rita do Trivelato|Santa Terezinha|Santo Afonso|Santo Antônio de Leverger|' +
    'Santo Antônio do Leste|São Félix do Araguaia|São José do Povo|São José do Rio Claro|São José do Xingu|' +
    'São José dos Quatro Marcos|São Pedro da Cipa|Sapezal|Serra Nova Dourada|Sinop|Sorriso|Tabaporã|Tangará da Serra|' +
    'Tapurah|Terra Nova do Norte|Tesouro|Torixoréu|União do Sul|Vale de São Domingos|Várzea Grande|Vera|' +
    'Vila Bela da Santíssima Trindade|Vila Rica').split('|');
  function chave(s) {
    return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
      .replace(/[^a-z0-9]+/g, ' ').trim();
  }
  var POR_CHAVE = {};
  CIDADES_MT.forEach(function (c) { POR_CHAVE[chave(c)] = c; });

  var ETAPA = {
    empresa: 'Procurando empresas', pessoa: 'Procurando os donos', contato: 'Buscando celular e e-mail',
    qualificado: 'Conferindo o WhatsApp', qualificar: 'Conferindo o WhatsApp', promovido: 'Colocando na cadência',
    promover: 'Colocando na cadência'
  };
  var STATUS = {
    nova: 'Nova', rodando: 'Rodando', ativa: 'Ativa', pausada: 'Pausada', parada: 'Parada', concluida: 'Concluída',
    teto: 'Parou no teto', erro: 'Parou com erro'
  };
  var PORTES = [['pequena', 'Pequena: dono ou sócio'], ['media', 'Média: marketing, com o dono de reserva'],
    ['grande', 'Grande: RH e marketing']];

  function erroDe(e) { return A.eRede(e) ? A.ERRO_REDE : e.message; }
  function q(id) { return document.getElementById(id); }
  function n(v) { return Number(v) || 0; }
  function plural(qtd, um, varios) { return qtd + ' ' + (qtd === 1 ? um : varios); }

  /* "Achamos 120 empresas, 84 donos, 51 com WhatsApp" */
  function frase(f) {
    f = f || {};
    if (!n(f.empresas)) return 'Ainda não achamos nenhuma empresa.';
    return 'Achamos ' + plural(n(f.empresas), 'empresa', 'empresas') + ', ' + plural(n(f.pessoas), 'dono', 'donos') +
      ', ' + n(f.qualificados) + ' com WhatsApp.';
  }

  /* ---------- montagem ---------- */
  function montar(secao) {
    sec = secao;
    sec.classList.add('prosp');
    sec.append(
      h('div', { class: 'prosp-caixa' },
        h('h2', { text: 'Prospecção' }),
        h('p', { class: 'suave', text: 'Acha empresas de Mato Grosso, o dono de cada uma e o celular dele, confere se tem ' +
          'WhatsApp e coloca na cadência. Cada campanha para sozinha ao chegar no teto de gasto do dia ou da campanha.' }),
        h('p', { id: 'prosp-sem-token', class: 'prosp-alerta', hidden: true }),
        h('div', { class: 'prosp-botoes' },
          h('button', { id: 'prosp-nova', class: 'btn primario', type: 'button', disabled: true, 'aria-expanded': 'false',
                        'aria-controls': 'prosp-form', onclick: alternarForm }, 'Nova campanha'),
          h('button', { id: 'prosp-parar', class: 'btn perigo', type: 'button', hidden: true, onclick: parar }, 'Parar prospecção')),
        formulario(),
        h('div', { id: 'prosp-andamento', class: 'prosp-andamento', role: 'status', 'aria-live': 'polite' })),
      h('div', { class: 'prosp-caixa' },
        h('h2', { text: 'Campanhas' }),
        h('div', { id: 'prosp-lista', class: 'prosp-lista', 'aria-live': 'polite' },
          h('p', { class: 'vazio', text: 'Carregando…' }))));
    var principal = document.querySelector('#tela-app main');
    if (principal && sec.parentNode !== principal) principal.append(sec);
  }

  function campo(id, rotulo, controle, dica) {
    controle.id = id;
    if (dica) controle.setAttribute('aria-describedby', id + '-dica');
    return h('div', { class: 'prosp-campo' },
      h('label', { for: id, text: rotulo }), controle,
      dica ? h('p', { id: id + '-dica', class: 'suave prosp-dica', text: dica }) : null);
  }

  function formulario() {
    var lista = h('datalist', { id: 'prosp-cidades-mt' }, CIDADES_MT.map(function (c) { return h('option', { value: c }); }));
    var cidade = h('input', { id: 'prosp-cidade', type: 'text', list: 'prosp-cidades-mt', autocomplete: 'off',
      onkeydown: function (ev) { if (ev.key === 'Enter') { ev.preventDefault(); addCidade(); } } });
    return h('form', { id: 'prosp-form', class: 'prosp-form', hidden: true, novalidate: true, 'aria-labelledby': 'prosp-form-titulo',
                       onsubmit: function (ev) { ev.preventDefault(); criar(); } },
      h('h3', { id: 'prosp-form-titulo', text: 'Nova campanha' }),
      campo('prosp-nome', 'Nome da campanha', h('input', { type: 'text', maxlength: '80', autocomplete: 'off' })),
      campo('prosp-segmento', 'Segmento', h('input', { type: 'text', maxlength: '80', autocomplete: 'off' }),
        'Que tipo de empresa: restaurantes, academias, clínicas…'),
      h('div', { class: 'prosp-campo' },
        h('label', { for: 'prosp-cidade', text: 'Cidade de Mato Grosso' }),
        h('div', { class: 'prosp-linha' }, cidade,
          h('button', { class: 'btn', type: 'button', onclick: addCidade }, 'Adicionar cidade')),
        lista,
        h('ul', { id: 'prosp-cidades', class: 'prosp-chips', 'aria-label': 'Cidades escolhidas' })),
      campo('prosp-porte', 'Tamanho das empresas', h('select', null, PORTES.map(function (p) {
        return h('option', { value: p[0], text: p[1] });
      })), 'Define com quem vamos falar em cada empresa.'),
      campo('prosp-oferta', 'O que vamos oferecer (opcional)', h('input', { type: 'text', maxlength: '120', autocomplete: 'off' })),
      campo('prosp-cnaes', 'Códigos de atividade, CNAE (opcional)', h('input', { type: 'text', autocomplete: 'off', inputmode: 'numeric' }),
        'Se souber, separe por vírgula. Exemplo: 5611-2/01. Sem eles, o segmento decide.'),
      h('div', { class: 'prosp-grade' },
        campo('prosp-teto-dia', 'Teto por dia (US$)', h('input', { type: 'number', min: '1', step: '0.5', value: String(TETO_DIA), inputmode: 'decimal' })),
        campo('prosp-teto-camp', 'Teto da campanha (US$)', h('input', { type: 'number', min: '1', step: '0.5', value: String(TETO_CAMPANHA), inputmode: 'decimal' })),
        campo('prosp-meta', 'Leads por dia', h('input', { type: 'number', min: '1', max: '50', step: '1', value: String(META_DIA), inputmode: 'numeric' }))),
      h('p', { class: 'suave', text: 'Sugestão: US$ 10 por dia e US$ 30 por campanha. Só paga quando acha o contato.' }),
      h('p', { id: 'prosp-form-erro', class: 'erro-campo', role: 'alert' }),
      h('div', { class: 'prosp-botoes' },
        h('button', { id: 'prosp-criar', class: 'btn primario', type: 'submit' }, 'Criar campanha'),
        h('button', { class: 'btn texto', type: 'button', onclick: function () { fecharForm(true); } }, 'Cancelar')));
  }

  /* ---------- formulário ---------- */
  function alternarForm() { if (formAberto) fecharForm(true); else abrirForm(); }
  function abrirForm() {
    if (!carregou) return;
    formAberto = true;
    q('prosp-form').hidden = false;
    q('prosp-nova').setAttribute('aria-expanded', 'true');
    q('prosp-nome').focus();
  }
  function fecharForm(focarBotao) {
    formAberto = false;
    var f = q('prosp-form');
    f.hidden = true;
    f.reset();
    cidades = [];
    pintarCidades();
    erroForm('');
    q('prosp-nova').setAttribute('aria-expanded', 'false');
    if (focarBotao) q('prosp-nova').focus();
  }
  function erroForm(texto, campoId) {
    q('prosp-form-erro').textContent = texto;
    ['prosp-nome', 'prosp-segmento', 'prosp-cidade', 'prosp-cnaes', 'prosp-teto-dia', 'prosp-teto-camp', 'prosp-meta'].forEach(function (id) {
      if (id === campoId) q(id).setAttribute('aria-invalid', 'true'); else q(id).removeAttribute('aria-invalid');
    });
    if (campoId) q(campoId).focus();
    return false;
  }

  /* devolve true se a cidade digitada entrou (ou se o campo está vazio) */
  function addCidade() {
    var campo = q('prosp-cidade'), texto = campo.value.trim();
    if (!texto) return true;
    var certa = POR_CHAVE[chave(texto)];
    if (!certa) return erroForm(texto + ' não é uma cidade de Mato Grosso. Escolha uma das sugestões.', 'prosp-cidade');
    if (cidades.indexOf(certa) < 0) cidades.push(certa);
    campo.value = '';
    erroForm('');
    pintarCidades();
    return true;
  }
  function pintarCidades() {
    var ul = q('prosp-cidades');
    A.limpar(ul);
    cidades.forEach(function (c) {
      ul.append(h('li', null, h('span', { text: c }),
        h('button', { class: 'prosp-tirar', type: 'button', 'aria-label': 'Tirar ' + c, text: '×',
          onclick: function () { cidades = cidades.filter(function (x) { return x !== c; }); pintarCidades(); q('prosp-cidade').focus(); } })));
    });
  }

  function lerFormulario() {
    var nome = q('prosp-nome').value.trim(), segmento = q('prosp-segmento').value.trim();
    if (!nome) return erroForm('Dê um nome para a campanha.', 'prosp-nome');
    if (!segmento) return erroForm('Diga o segmento: que tipo de empresa vamos procurar.', 'prosp-segmento');
    if (!addCidade()) return false;
    if (!cidades.length) return erroForm('Escolha pelo menos uma cidade de Mato Grosso.', 'prosp-cidade');
    var cnaes = q('prosp-cnaes').value.split(/[,;\s]+/).map(function (s) { return s.trim(); }).filter(Boolean);
    var ruim = cnaes.filter(function (c) { return c.replace(/\D/g, '').length !== 7; });
    if (ruim.length) return erroForm('Código de atividade com formato estranho: ' + ruim[0] + '. Use 7 números, como 5611-2/01.', 'prosp-cnaes');
    var dia = parseFloat(q('prosp-teto-dia').value), camp = parseFloat(q('prosp-teto-camp').value), meta = parseInt(q('prosp-meta').value, 10);
    if (!(dia > 0)) return erroForm('O teto por dia tem de ser maior que zero.', 'prosp-teto-dia');
    if (!(camp > 0)) return erroForm('O teto da campanha tem de ser maior que zero.', 'prosp-teto-camp');
    if (dia > camp) return erroForm('O teto por dia não pode passar do teto da campanha.', 'prosp-teto-dia');
    if (!(meta >= 1 && meta <= 50)) return erroForm('Leads por dia: de 1 a 50 (é o que a cadência consegue enviar).', 'prosp-meta');
    return { nome: nome, segmento: segmento, cidades: cidades.slice(), cnaes: cnaes, porte: q('prosp-porte').value,
             oferta: q('prosp-oferta').value.trim(), tetoDiaUsd: dia, tetoCampanhaUsd: camp, metaPorDia: meta };
  }

  function criar() {
    if (enviando) return;
    var corpo = lerFormulario();
    if (!corpo) return;
    enviando = true;
    q('prosp-criar').disabled = true;
    api('api/prospeccao/campanhas', { method: 'POST', corpo: corpo })
      .then(function () { fecharForm(true); A.aviso('Campanha criada. Clique em Iniciar quando quiser começar.'); return carregar(); })
      .catch(function (e) { erroForm(erroDe(e)); })
      .then(function () { enviando = false; q('prosp-criar').disabled = false; });
  }

  /* ---------- rede ---------- */
  function carregar() {
    return api('api/prospeccao').then(function (d) { est = d || {}; carregou = true; pintar(); agendar(); })
      .catch(function (e) { if (aberta) A.aviso(erroDe(e), true); agendar(); });
  }
  function agendar() {
    clearTimeout(timer);
    timer = null;
    if (aberta && est && est.rodando) timer = setTimeout(carregar, POLL_RODANDO);
  }

  function iniciar(c) {
    var conf = q('prosp-confirmo');
    if (iniciando || !(conf && conf.checked)) { if (conf) conf.focus(); return; }
    iniciando = true;
    pintarLista(true);
    api('api/prospeccao/campanhas/' + encodeURIComponent(c.id) + '/iniciar', { method: 'POST', corpo: { confirmo: true } })
      .then(function () {
        iniciando = false; confirmando = null; confMarcado = false;
        A.aviso('A campanha começou. Acompanhe aqui.');
        return carregar().then(function () { var p = q('prosp-parar'); if (p && !p.hidden) p.focus(); });
      })
      .catch(function (e) { iniciando = false; A.aviso(erroDe(e), true); pintarLista(true); carregar(); });
  }

  function parar() {
    if (!window.confirm('Parar a prospecção agora? O que já foi encontrado fica gravado.')) return;
    q('prosp-parar').disabled = true;
    api('api/prospeccao/parar', { method: 'POST', corpo: {} })
      .then(function () { A.aviso('Pedido de parada enviado.'); })
      .catch(function (e) { A.aviso(erroDe(e), true); })
      .then(function () { q('prosp-parar').disabled = false; return carregar(); });
  }

  function verFunil(c) {
    funilAberto[c.id] = !funilAberto[c.id];
    pintarLista(true);
    if (!funilAberto[c.id]) return;
    api('api/prospeccao/campanhas/' + encodeURIComponent(c.id) + '/funil')
      .then(function (d) { funis[c.id] = d || {}; pintarLista(true); })
      .catch(function (e) { A.aviso(erroDe(e), true); });
  }

  /* ---------- pintura ---------- */
  function pintar() {
    if (!sec || !est) return;
    var aviso = q('prosp-sem-token');
    aviso.hidden = !!est.disponivel;
    aviso.textContent = est.disponivel ? '' : (est.semToken || 'Falta o token do treg na VPS.');
    q('prosp-nova').disabled = !carregou;
    var p = q('prosp-parar');
    p.hidden = !est.rodando;
    pintarAndamento();
    pintarLista(false);
  }

  function nomeCampanha(id) {
    var c = (est.campanhas || []).filter(function (x) { return x.id === id; })[0];
    return c ? c.nome : '';
  }

  function pintarAndamento() {
    var caixa = q('prosp-andamento');
    var pr = est.rodando ? (est.progresso || {}) : null;
    var assinatura = JSON.stringify([pr, est.rodando && nomeCampanha(pr && pr.campanhaId)]);
    if (caixa.dataset.sig === assinatura) return;
    caixa.dataset.sig = assinatura;
    A.limpar(caixa);
    if (!pr) return;
    var total = n(pr.total), feitos = n(pr.feitos), nome = nomeCampanha(pr.campanhaId);
    caixa.append(
      h('p', { class: 'prosp-estado', text: (ETAPA[pr.etapa] || 'Trabalhando') + (nome ? ': ' + nome : '') }),
      total ? h('progress', { max: String(total), value: String(Math.min(feitos, total)), 'aria-label': 'Feitos ' + feitos + ' de ' + total }) : null,
      total ? h('p', { class: 'suave', text: feitos + ' de ' + total }) : null);
  }

  function numeros(pares) {
    return h('dl', { class: 'prosp-numeros' }, pares.filter(Boolean).map(function (p) {
      return h('div', null, h('dt', { text: p[0] }), h('dd', { text: String(p[1]) }));
    }));
  }

  function pintarLista(forcar) {
    var caixa = q('prosp-lista');
    var camps = est.campanhas || [];
    var assinatura = JSON.stringify([camps, est.disponivel, est.rodando, confirmando, confMarcado, iniciando, funilAberto, funis]);
    if (!forcar && caixa.dataset.sig === assinatura) return;
    caixa.dataset.sig = assinatura;
    var focoId = document.activeElement && caixa.contains(document.activeElement) ? document.activeElement.id : null;
    A.limpar(caixa);
    if (!camps.length) { caixa.append(h('p', { class: 'vazio', text: 'Nenhuma campanha ainda. Comece em Nova campanha.' })); return; }
    caixa.append(h('ul', { class: 'prosp-camps' }, camps.map(cartao)));
    if (focoId && q(focoId)) q(focoId).focus();
  }

  function cartao(c) {
    var f = c.funil || {}, rodandoEsta = est.rodando && est.progresso && est.progresso.campanhaId === c.id;
    var porque = !est.disponivel ? 'Desligado: falta o token do treg.' : est.rodando ? 'Já tem uma campanha rodando.' : '';
    var promovidos = n(f.promovidos), gasto = n(c.gastoTotalUsd);
    var tituloId = 'prosp-c-' + c.id;
    var li = h('li', { class: 'prosp-camp' + (rodandoEsta ? ' rodando' : ''), 'aria-labelledby': tituloId },
      h('div', { class: 'prosp-camp-topo' },
        h('h3', { id: tituloId, text: c.nome || 'Sem nome' }),
        h('span', { class: 'prosp-status', text: rodandoEsta ? 'Rodando' : (STATUS[c.status] || c.status || '') })),
      h('p', { class: 'suave', text: [c.segmento, (c.cidades || []).join(', ')].filter(Boolean).join(' · ') }),
      h('p', { class: 'prosp-frase', text: frase(f) + (promovidos ? ' ' + plural(promovidos, 'entrou', 'entraram') + ' na cadência.' : '') }),
      numeros([
        ['Empresas', n(f.empresas)], ['Donos achados', n(f.pessoas)], ['Com celular ou e-mail', n(f.comContato)],
        ['Com WhatsApp', n(f.qualificados)], ['Na cadência', promovidos], ['Descartados', n(f.descartados)],
        ['Gasto hoje', A.dolar(c.gastoHojeUsd) + ' de ' + A.dolar(c.tetoDiaUsd)],
        ['Gasto total', A.dolar(gasto) + ' de ' + A.dolar(c.tetoCampanhaUsd)],
        promovidos ? ['Custo por lead', A.dolar(gasto / promovidos)] : null
      ]));
    var iniciarBtn = h('button', { id: 'prosp-ini-' + c.id, class: 'btn primario', type: 'button',
      disabled: !!porque || confirmando === c.id, 'aria-describedby': porque ? 'prosp-porque-' + c.id : null,
      onclick: function () { confirmando = c.id; confMarcado = false; pintarLista(true); var x = q('prosp-confirmo'); if (x) x.focus(); } }, 'Iniciar');
    li.append(h('div', { class: 'prosp-botoes' }, iniciarBtn,
      h('button', { id: 'prosp-fun-' + c.id, class: 'btn', type: 'button', 'aria-expanded': funilAberto[c.id] ? 'true' : 'false',
        onclick: function () { verFunil(c); } }, funilAberto[c.id] ? 'Esconder funil' : 'Ver funil')));
    if (porque) li.append(h('p', { id: 'prosp-porque-' + c.id, class: 'suave', text: porque }));
    if (confirmando === c.id && !porque) li.append(confirmacao(c));
    if (funilAberto[c.id]) li.append(detalheFunil(funis[c.id]));
    return li;
  }

  function confirmacao(c) {
    var texto = 'Confirmo que esta campanha pode gastar até ' + A.dolar(c.tetoDiaUsd) + ' por dia e ' +
      A.dolar(c.tetoCampanhaUsd) + ' no total.';
    return h('div', { class: 'prosp-confirma-caixa', role: 'group', 'aria-labelledby': 'prosp-conf-titulo' },
      h('h4', { id: 'prosp-conf-titulo', text: 'Antes de começar' }),
      h('p', { text: 'Já gastou ' + A.dolar(c.gastoTotalUsd) + ' nesta campanha. Ela para sozinha ao chegar no teto. ' +
        'Só entra na cadência quem tem WhatsApp confirmado.' }),
      h('label', { class: 'prosp-confirma' },
        h('input', { id: 'prosp-confirmo', type: 'checkbox', disabled: iniciando, checked: confMarcado,
          onchange: function () { confMarcado = this.checked; q('prosp-comecar').disabled = !this.checked || iniciando; } }), ' ' + texto),
      h('div', { class: 'prosp-botoes' },
        h('button', { id: 'prosp-comecar', class: 'btn primario', type: 'button', disabled: !confMarcado || iniciando, onclick: function () { iniciar(c); } }, 'Começar'),
        h('button', { class: 'btn texto', type: 'button', disabled: iniciando,
          onclick: function () { confirmando = null; confMarcado = false; pintarLista(true); var b = q('prosp-ini-' + c.id); if (b) b.focus(); } }, 'Cancelar')));
  }

  function detalheFunil(d) {
    var caixa = h('div', { class: 'prosp-funil-det' });
    if (!d) { caixa.append(h('p', { class: 'suave', text: 'Carregando o funil…' })); return caixa; }
    var etapas = d.etapas || [], descartes = d.descartes || [];
    caixa.append(h('h4', { text: 'Funil' }),
      etapas.length ? h('ol', { class: 'prosp-etapas' }, etapas.map(function (e) {
        return h('li', null, h('span', { text: e.nome || '' }), h('strong', { text: String(n(e.n)) }));
      })) : h('p', { class: 'suave', text: 'Nada ainda.' }));
    if (descartes.length) {
      caixa.append(h('h4', { text: 'Por que ficaram de fora' }),
        h('ul', { class: 'prosp-etapas' }, descartes.map(function (x) {
          return h('li', null, h('span', { text: x.motivo || '' }), h('strong', { text: String(n(x.n)) }));
        })));
    }
    caixa.append(numeros([['Custo até agora', A.dolar(d.custoUsd)],
      d.custoPorLeadUsd != null ? ['Custo por lead na cadência', A.dolar(d.custoPorLeadUsd)] : null]));
    return caixa;
  }

  function aoAbrir() {
    aberta = true;
    carregar();
  }

  A.abas.registrar('prospeccao', 'Prospecção', montar, aoAbrir);
  document.querySelector('.abas').addEventListener('click', function (ev) {
    var b = ev.target.closest('.aba');
    if (b && b.id !== 'aba-prospeccao') { aberta = false; clearTimeout(timer); timer = null; }
  });
  A.ganchos.atualizou.push(function (estado) {
    if (estado.aba !== 'prospeccao') { aberta = false; clearTimeout(timer); timer = null; return; }
    aberta = true;
    if (!timer) carregar();
  });
};
