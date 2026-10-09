/* Leva 1: dados no card, painel com perfil/decisores/próximo toque, busca, filtros e visões rápidas do quadro.
   Carregado depois do app.js. Todo texto de lead entra com textContent (A.h), nunca innerHTML. */
window.Atendente_leva1 = function (A) {
  'use strict';
  var h = A.h, $ = A.$;
  var SEM = '__sem';
  var VISOES = [['todos', 'Todos'], ['nao_enviados', 'Não enviados'], ['hoje', 'Para hoje'], ['enviado1', 'Enviado 1'],
                ['enviado2', 'Enviado 2'], ['enviado3', 'Enviado 3'], ['responderam', 'Responderam'], ['resp_explee', 'Responderam Explee'], ['resp_wa', 'Responderam WA'], ['sem_contato', 'Sem contato'], ['enriquecidos', 'Enriquecidos']];
  var NOME_GRUPO = { hoje: 'Toque para hoje', aguardando: 'Aguardando o próximo toque', semcontato: 'Sem contato',
                     respondeu: 'Respondeu', fechou: 'Fechou', encerrado: 'Sem resposta (3 toques)', sair: 'Saiu' };
  var NOME_DECISOR = { contato: 'Decisor com contato', nome: 'Só o nome do decisor', sem: 'Sem decisor' };
  var PAPEIS = { decisor: 'Decisor', comunicacao: 'Comunicação', secretaria: 'Secretaria', comercial: 'Comercial', geral: 'Geral', setor: 'Setor' };
  var CAMPOS = [
    { k: 'segmento', rot: 'Segmento', todos: 'Todos' },
    { k: 'faixa', rot: 'Faixa', todos: 'Todas', nome: function (v) { return 'Faixa ' + v; } },
    { k: 'canal', rot: 'Canal', todos: 'Todos' },
    { k: 'uf', rot: 'Estado', todos: 'Todos' },
    { k: 'cidade', rot: 'Cidade', todos: 'Todas' },
    { k: 'decisor', rot: 'Quem decide', todos: 'Todos', nome: function (v) { return NOME_DECISOR[v] || v; } },
    { k: 'grupo', rot: 'Etapa', todos: 'Todas', nome: function (v) { return NOME_GRUPO[v] || v; } }
  ];
  var CHAVE = 'atendente-leva1-filtros';

  var f = { visao: 'todos', busca: '' };
  CAMPOS.forEach(function (c) { f[c.k] = ''; });
  try {
    var salvo = JSON.parse(localStorage.getItem(CHAVE) || 'null');
    if (salvo && typeof salvo === 'object') Object.keys(f).forEach(function (k) { if (typeof salvo[k] === 'string') f[k] = salvo[k]; });
  } catch (e) { /* sem armazenamento: começa limpo */ }
  function guardar() { try { localStorage.setItem(CHAVE, JSON.stringify(f)); } catch (e) { /* tudo bem */ } }

  /* ---------- regras do filtro ---------- */
  function semAcento(t) { return String(t == null ? '' : t).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase(); }
  function valor(l, k) { var v = l[k]; return v === null || v === undefined ? '' : String(v); }
  function casaCampo(l, k) {
    var alvo = f[k];
    if (!alvo) return true;
    var v = valor(l, k);
    if (alvo === SEM) return !v;
    return k === 'cidade' ? semAcento(v) === semAcento(alvo) : v === alvo;
  }
  function casaBusca(l) {
    var q = semAcento(f.busca).trim();
    if (!q) return true;
    var alvo = String(l.busca || '');
    if (alvo.indexOf(q) >= 0) return true;
    var dig = q.replace(/\D/g, '');
    if (dig.length < 3) return false;
    var fim = String(l.telefoneMascarado || '').replace(/\D/g, '').slice(-4);   // o resumo só traz os 4 últimos
    return alvo.replace(/[^\d|]/g, '').split('|').some(function (n) { return n.indexOf(dig) >= 0; }) ||
           (dig.length <= 4 && fim && fim.slice(-dig.length) === dig);
  }
  /* `ignorar`: um campo (ou 'visao') que não entra na conta, para os contadores de cada filtro. */
  function casa(l, ignorar) {
    if (ignorar !== 'visao' && f.visao !== 'todos' && (l.visoes || []).indexOf(f.visao) < 0) return false;
    for (var i = 0; i < CAMPOS.length; i++) if (CAMPOS[i].k !== ignorar && !casaCampo(l, CAMPOS[i].k)) return false;
    return casaBusca(l);
  }
  function ativos() {
    var n = f.busca.trim() ? 1 : 0;
    if (f.visao !== 'todos') n++;
    CAMPOS.forEach(function (c) { if (f[c.k]) n++; });
    return n;
  }

  var anterior = A.ganchos.filtro;
  A.ganchos.filtro = function (l) { return (!anterior || anterior(l)) && casa(l); };

  /* ---------- barra de filtros ---------- */
  var barra = $('filtros-quadro');
  var botoesVisao = {};
  var grupoVisoes = h('div', { class: 'l1-visoes', role: 'group', 'aria-label': 'Visões rápidas' },
    VISOES.map(function (v) {
      var num = h('span', { class: 'l1-num num', text: '0' });
      var b = h('button', { type: 'button', class: 'l1-visao', dataset: { visao: v[0] }, 'aria-pressed': 'false',
                            onclick: function () { mudar('visao', v[0]); } }, h('span', { text: v[1] }), ' ', num);
      botoesVisao[v[0]] = { botao: b, num: num };
      return b;
    }));
  var busca = h('input', { id: 'busca-quadro', type: 'search', autocomplete: 'off', spellcheck: 'false',
                           placeholder: 'Empresa, pessoa, CNPJ ou cidade', 'aria-keyshortcuts': '/' });
  busca.value = f.busca;
  var timer;
  busca.addEventListener('input', function () {
    clearTimeout(timer);
    timer = setTimeout(function () { mudar('busca', busca.value); }, 150);
  });
  busca.addEventListener('keydown', function (ev) {
    if (ev.key === 'Escape' && busca.value) { ev.preventDefault(); ev.stopPropagation(); busca.value = ''; mudar('busca', ''); }
  });
  var selects = {};
  var caixaSelects = h('div', { id: 'l1-selects', class: 'l1-selects' }, CAMPOS.map(function (c) {
    var s = h('select', { id: 'l1-f-' + c.k, onchange: function (ev) { mudar(c.k, ev.target.value); } });
    selects[c.k] = { el: s, assinatura: '' };
    return h('div', { class: 'l1-campo' }, h('label', { for: 'l1-f-' + c.k, text: c.rot }), s);
  }));
  var btnFiltros = h('button', { type: 'button', class: 'btn l1-btn-filtros', 'aria-expanded': 'true', 'aria-controls': 'l1-selects',
                                 onclick: function () { abrirSelects(caixaSelects.hidden); } });
  var contagem = h('p', { id: 'l1-contagem', class: 'l1-contagem', role: 'status', 'aria-live': 'polite' });
  var btnLimpar = h('button', { type: 'button', class: 'btn texto l1-limpar', text: 'Limpar filtros', onclick: limparTudo });
  barra.append(h('div', { class: 'l1-barra' },
    grupoVisoes,
    h('div', { class: 'l1-linha' },
      h('div', { class: 'l1-busca' }, h('label', { for: 'busca-quadro', text: 'Buscar' }), busca),
      btnFiltros, btnLimpar, contagem),
    caixaSelects));

  function abrirSelects(abrir) {
    caixaSelects.hidden = !abrir;
    btnFiltros.setAttribute('aria-expanded', abrir ? 'true' : 'false');
  }
  abrirSelects(!(window.matchMedia && window.matchMedia('(max-width: 599px)').matches) ||
               CAMPOS.some(function (c) { return !!f[c.k]; }));

  function mudar(k, v) {
    f[k] = v;
    if (k === 'uf' && f.cidade) f.cidade = '';   // a cidade escolhida pode não ser do novo estado
    guardar();
    A.pintarQuadro();
  }
  function limparTudo() {
    f.visao = 'todos'; f.busca = ''; busca.value = '';
    CAMPOS.forEach(function (c) { f[c.k] = ''; });
    guardar();
    A.pintarQuadro();
    busca.focus();
  }

  function opcoes(c, leads) {
    var cont = {}, falta = 0;
    leads.forEach(function (l) {
      if (!casa(l, c.k)) return;
      var v = valor(l, c.k);
      if (!v) { falta++; return; }
      var chave = c.k === 'cidade' ? semAcento(v) : v;
      if (!cont[chave]) cont[chave] = { v: v, n: 0 };
      cont[chave].n++;
    });
    var lista = Object.keys(cont).map(function (k) { return cont[k]; })
      .sort(function (a, b) { return (c.nome ? c.nome(a.v) : a.v).localeCompare(c.nome ? c.nome(b.v) : b.v, 'pt-BR'); });
    if (falta) lista.push({ v: SEM, n: falta, rot: 'Sem informação' });
    var atual = f[c.k];
    if (atual && !lista.some(function (o) { return o.v === atual || (c.k === 'cidade' && semAcento(o.v) === semAcento(atual)); })) {
      lista.push({ v: atual, n: 0, rot: atual === SEM ? 'Sem informação' : null });
    }
    return lista;
  }
  function pintarSelect(c, leads) {
    var s = selects[c.k], lista = opcoes(c, leads);
    var total = leads.filter(function (l) { return casa(l, c.k); }).length;
    var pares = [['', c.todos + ' (' + total + ')']].concat(lista.map(function (o) {
      return [o.v, (o.rot || (c.nome ? c.nome(o.v) : o.v)) + ' (' + o.n + ')'];
    }));
    var ass = JSON.stringify(pares) + '|' + f[c.k];
    if (ass === s.assinatura) return;
    s.assinatura = ass;
    A.limpar(s.el);
    pares.forEach(function (p) { s.el.add(new Option(p[1], p[0])); });
    s.el.value = f[c.k];
    if (s.el.value !== f[c.k]) {   // cidade escrita com outro acento
      var achou = pares.filter(function (p) { return semAcento(p[0]) === semAcento(f[c.k]); })[0];
      if (achou) s.el.value = achou[0];
    }
    s.el.classList.toggle('l1-ativo', !!f[c.k]);
  }

  function pintarBarra() {
    var leads = A.estado.leads || [];
    VISOES.forEach(function (v) {
      var n = leads.filter(function (l) { return casa(l, 'visao') && (v[0] === 'todos' || (l.visoes || []).indexOf(v[0]) >= 0); }).length;
      var x = botoesVisao[v[0]];
      x.num.textContent = String(n);
      x.botao.setAttribute('aria-pressed', f.visao === v[0] ? 'true' : 'false');
    });
    CAMPOS.forEach(function (c) { pintarSelect(c, leads); });
    var visiveis = leads.filter(A.ganchos.filtro).length;
    var n = ativos();
    contagem.textContent = n
      ? (visiveis ? 'Mostrando ' + visiveis + ' de ' + leads.length + (leads.length === 1 ? ' lead' : ' leads')
                  : 'Nenhum lead com esses filtros. Limpe os filtros para ver todos.')
      : leads.length + (leads.length === 1 ? ' lead' : ' leads');
    var nSel = CAMPOS.filter(function (c) { return !!f[c.k]; }).length;
    btnFiltros.textContent = nSel ? 'Filtros · ' + nSel : 'Filtros';
    btnLimpar.disabled = !n;
  }
  A.ganchos.quadro.push(pintarBarra);

  /* "/" vai para a busca (fora de campos de texto). */
  function emCampo(t) {
    return t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName));
  }
  document.addEventListener('keydown', function (ev) {
    if (ev.key !== '/' || ev.ctrlKey || ev.metaKey || ev.altKey || emCampo(ev.target)) return;
    if ($('vista-quadro').hidden || $('tela-app').hidden) return;
    ev.preventDefault();
    busca.focus();
    busca.select();
  });

  /* ---------- card ---------- */
  function diaMes(iso) {
    var m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso || ''));
    return m ? m[3] + '/' + m[2] : '';
  }
  function etiqueta(l) {
    var n = l.proximoToque;
    switch (l.grupo) {
      case 'hoje': return l.agendadoPara ? 'Toque ' + n + ' agendado · ' + A.quando(l.agendadoPara) : 'Toque ' + n + ' hoje';
      case 'aguardando': return n ? 'Toque ' + n + ' a partir de ' + diaMes(l.proximaEm) : 'Aguardando';
      case 'semcontato': return l.canal === 'E-mail' ? 'Sem WhatsApp' : 'Sem telefone';
      case 'respondeu': return 'Respondeu';
      case 'fechou': return 'Fechou';
      case 'encerrado': return 'Sem resposta';
      case 'sair': return 'Saiu';
      default: return '';
    }
  }
  A.ganchos.cartao.push(function (l, li) {
    var card = li.querySelector('.card');
    var ancora = card && card.querySelector('.card-empresa');
    if (!ancora) return;
    var meta = [l.segmento, l.faixa ? 'Faixa ' + l.faixa : '', l.canal, l.local].filter(Boolean).join(' · ');
    var nums = [typeof l.score === 'number' ? 'Score ' + l.score : '', l.icp].filter(Boolean).join(' · ');
    var precisaTel = !l.segmento && !l.local && l.telefoneMascarado;   // sem outro jeito de reconhecer o lead
    var rot = etiqueta(l);
    var linha = h('span', { class: 'l1-linha-card' },
      rot ? h('span', { class: 'l1-etiqueta g-' + (l.grupo || ''), text: rot }) : null,
      nums ? h('span', { class: 'l1-nums', text: nums }) : null);
    ancora.after.apply(ancora, [
      meta ? h('span', { class: 'l1-meta', text: meta }) : null,
      linha.childNodes.length ? linha : null,
      l.quemDecide ? h('span', { class: 'l1-decide' }, h('span', { class: 'suave', text: 'Decide: ' }), l.quemDecide) : null,
      precisaTel ? h('span', { class: 'l1-tel num', text: l.telefoneMascarado }) : null].filter(Boolean));
  });

  /* ---------- painel ---------- */
  function seguro(url) { return /^https?:\/\/\S+$/i.test(String(url || '')) ? String(url) : null; }
  function link(url, texto) {
    var u = seguro(url);
    return u ? h('a', { href: u, target: '_blank', rel: 'noopener noreferrer', text: texto || u.replace(/^https?:\/\/(www\.)?/i, '').slice(0, 60) }) : null;
  }
  function fonte(fte) {
    if (!fte) return null;
    return h('span', { class: 'l1-fonte' }, 'Fonte: ', link(fte) || String(fte));
  }
  function telefone(t) {
    var n = String(t || '').replace(/\D/g, '');
    if (n.length === 10 || n.length === 11) n = '55' + n;
    var m = /^55(\d{2})(\d{4,5})(\d{4})$/.exec(n);
    return m ? '+55 (' + m[1] + ') ' + m[2] + '-' + m[3] : String(t || '');
  }
  function secao(titulo, filhos, id) {
    var lista = [].concat(filhos).filter(Boolean);
    if (!lista.length) return null;
    return h('section', { class: 'l1-secao', 'aria-labelledby': id }, h('h3', { id: id, text: titulo }), lista);
  }
  function lista(arr) { return Array.isArray(arr) ? arr.filter(function (x) { return x && typeof x === 'object'; }) : []; }
  function copiar(texto) {
    function reserva() {
      var t = h('textarea', { class: 'so-leitor', 'aria-hidden': 'true' });
      t.value = texto; document.body.append(t); t.select();
      var ok = false;
      try { ok = document.execCommand('copy'); } catch (e) { ok = false; }
      t.remove();
      A.aviso(ok ? 'Mensagem copiada.' : 'Não consegui copiar. Selecione o texto e copie.', !ok);
    }
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(texto).then(function () { A.aviso('Mensagem copiada.'); }, reserva);
    } else reserva();
  }

  function blocoProximo(l) {
    var p = l.proximo;
    if (!p) {
      var motivo = { respondeu: 'O lead respondeu: a conversa segue com a equipe.', sair: 'O lead pediu para sair.',
                     fechou: 'Negócio fechado.' }[l.situacao] ||
        ((parseInt(l.etapa, 10) || 0) >= 3 ? 'Os três toques já saíram.' : 'Este lead não tem mensagem semeada para o próximo toque.');
      return secao('Próximo toque', h('p', { class: 'suave', text: motivo }), 'l1-t-prox');
    }
    var quando = p.agendadoPara ? 'agendado para ' + A.quando(p.agendadoPara)
      : p.quando === 'hoje' ? 'sai hoje' : p.quando ? 'a partir de ' + diaMes(p.quando) : '';
    var foto = null;
    if (p.foto) {
      var legenda = 'Foto do cenário ' + (p.foto.cenario || p.foto.id);
      foto = seguro(p.foto.url)
        ? h('figure', { class: 'l1-foto' },
            h('img', { src: seguro(p.foto.url), alt: legenda + ', que vai junto com o toque 1', loading: 'lazy', width: '320', height: '213' }),
            h('figcaption', { text: legenda }))
        : h('p', { class: 'l1-foto-txt', text: legenda + ' (vai junto com o toque 1)' });
    }
    return secao('Próximo toque', [
      h('p', { class: 'l1-toque-rot' }, h('b', { text: 'Toque ' + p.n + ' · ' + p.nome }), quando ? ' · ' + quando : '',
        p.para ? ' · para ' + p.para : ''),
      h('p', { class: 'l1-msg', text: p.texto }),
      h('button', { type: 'button', class: 'btn', text: 'Copiar mensagem', onclick: function () { copiar(p.texto); } }),
      foto
    ], 'l1-t-prox');
  }
  function blocoPerfil(l) {
    var pf = l.perfil && typeof l.perfil === 'object' ? l.perfil : {};
    var esp = typeof pf.especialidade === 'string' && pf.especialidade.trim() ? pf.especialidade.trim() : '';
    var linha = [l.categoria, pf.porte ? 'porte ' + pf.porte : '', [l.bairro, l.local].filter(Boolean).join(', ')].filter(Boolean).join(' · ');
    var nota = pf.nota ? 'Google ' + String(pf.nota).replace('.', ',') + (pf.avaliacoes ? ' (' + pf.avaliacoes + ' avaliações)' : '') : '';
    var classif = [l.segmento, l.faixa ? 'Faixa ' + l.faixa : '', l.icp, typeof l.score === 'number' ? 'Score ' + l.score : ''].filter(Boolean).join(' · ');
    return secao('Perfil', [
      esp ? h('p', { text: esp.charAt(0).toUpperCase() + esp.slice(1) + '.' }) : null,
      linha ? h('p', { class: 'suave', text: linha }) : null,
      nota ? h('p', { class: 'suave', text: nota }) : null,
      classif ? h('p', { class: 'suave', text: classif }) : null,
      l.fraseUnica ? h('p', { class: 'l1-gancho' }, h('b', { text: 'Gancho: ' }), String(l.fraseUnica)) : null,
      pf.fonteDados ? fonte(pf.fonteDados) : null
    ], 'l1-t-perfil');
  }
  function blocoDecisores(l) {
    var ds = lista(l.decisores);
    return secao('Quem decide', ds.length ? ds.map(function (d) {
      return h('div', { class: 'l1-pessoa' },
        h('b', { text: d.nome || 'Sem nome' }), d.cargo ? h('span', { text: d.cargo }) : null,
        d.linkedin ? link(d.linkedin, 'LinkedIn') : null, fonte(d.fonte));
    }) : h('p', { class: 'suave', text: 'A pesquisa ainda não achou quem decide.' }), 'l1-t-dec');
  }
  function blocoContatos(l) {
    var cs = lista(l.contatos);
    return secao('Contatos', cs.length ? cs.map(function (c) {
      var nome = c.nome || (c.papel === 'geral' ? 'Contato da empresa' : PAPEIS[c.papel] || 'Contato');
      var wa = c.whatsapp === 'sim' ? ' · WhatsApp' : c.whatsapp === 'nao' ? ' · sem WhatsApp' : '';
      return h('div', { class: 'l1-pessoa' + (l.contatoAtivo && l.contatoAtivo === c.id ? ' l1-ativo' : '') },
        h('b', { text: nome }),
        c.papel ? h('span', { class: 'l1-papel', text: PAPEIS[c.papel] || c.papel }) : null,
        l.contatoAtivo && l.contatoAtivo === c.id ? h('span', { class: 'l1-papel', text: 'usado na cadência' }) : null,
        c.cargo ? h('span', { text: c.cargo }) : null,
        c.telefone ? h('span', { class: 'num', text: telefone(c.telefone) + wa }) : null,
        c.email ? h('span', { text: c.email }) : null,
        c.linkedin ? link(c.linkedin, 'LinkedIn') : null, fonte(c.fonte));
    }) : h('p', { class: 'suave', text: 'Nenhum contato enriquecido ainda.' }), 'l1-t-cont');
  }
  function blocoEmpresa(l) {
    var e = l.empresaDados && typeof l.empresaDados === 'object' ? l.empresaDados : {};
    var cnpj = String(e.cnpj || '').replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5');
    var partes = [cnpj ? 'CNPJ ' + cnpj : '', e.razaoSocial, e.porte ? 'Porte ' + e.porte : '',
                  e.abertura ? 'Desde ' + String(e.abertura).slice(0, 4) : '',
                  e.situacao && !/ativa/i.test(e.situacao) ? 'Situação: ' + e.situacao : ''].filter(Boolean);
    var socios = lista(l.socios);
    return secao('Empresa na Receita', [
      partes.length ? h('p', { text: partes.join(' · ') }) : h('p', { class: 'suave', text: 'CNPJ ainda não confirmado na Receita.' }),
      e.cnae ? h('p', { class: 'suave', text: String(e.cnae) }) : null,
      socios.length ? h('details', null, h('summary', { text: 'Quadro de sócios (' + socios.length + ')' }),
        h('ul', { class: 'l1-socios' }, socios.map(function (s) { return h('li', { text: (s.nome || '') + (s.qualificacao ? ' · ' + s.qualificacao : '') }); }))) : null
    ], 'l1-t-emp');
  }
  function blocoSinais(l) {
    var ss = (Array.isArray(l.sinais) ? l.sinais : []).map(function (s) { return typeof s === 'string' ? { texto: s } : s; })
      .filter(function (s) { return s && s.texto; });
    return secao('O que já tem', ss.map(function (s) { return h('p', null, String(s.texto), s.fonte ? ' ' : null, fonte(s.fonte)); }), 'l1-t-sinais');
  }
  function blocoCuidado(l) {
    var al = (Array.isArray(l.alertas) ? l.alertas : []).map(function (s) { return typeof s === 'string' ? s : s && s.texto; }).filter(Boolean);
    var pend = (Array.isArray(l.pendencias) ? l.pendencias : []).filter(function (x) { return typeof x === 'string' && x; });
    return secao('Cuidado e pendências', al.map(function (t) { return h('p', { class: 'l1-alerta', text: 'Alerta: ' + t }); })
      .concat(pend.length ? [h('p', { class: 'suave', text: pend.join(' · ') })] : []), 'l1-t-cuid');
  }
  function blocoLinks(l) {
    var ls = lista(l.links).map(function (x) { return link(x.url, x.rotulo); }).filter(Boolean);
    return secao('Links', ls.length ? h('p', { class: 'l1-links' }, ls) : null, 'l1-t-links');
  }

  A.ganchos.painel.push(function (lead) {
    var extra = $('painel-extra');
    var alvo = $('painel-leva1');
    if (!alvo) { alvo = h('div', { id: 'painel-leva1', class: 'l1-painel' }); extra.prepend(alvo); }
    A.limpar(alvo);
    alvo.append.apply(alvo, [blocoProximo(lead), blocoPerfil(lead), blocoDecisores(lead), blocoContatos(lead),
                             blocoEmpresa(lead), blocoSinais(lead), blocoCuidado(lead), blocoLinks(lead)].filter(Boolean));
  });
};
