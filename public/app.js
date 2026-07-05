// CRM AI Studio (local) — SPA sem build. Fala apenas com a API local em /api.
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const api = async (url, opts) => {
  const res = await fetch(url, { headers: { 'Content-Type': 'application/json' }, ...opts });
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || res.statusText);
  return res.json();
};
const brl = (n) => 'R$ ' + Number(n || 0).toLocaleString('pt-BR');
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

const state = { pipelines: [], pipelineId: null, board: null, agents: [], ollama: false };

function toast(msg) {
  const t = $('#toast'); t.textContent = msg; t.classList.add('show');
  clearTimeout(toast._t); toast._t = setTimeout(() => t.classList.remove('show'), 2600);
}

// --- Boot -------------------------------------------------------------------
async function boot() {
  await refreshStatus();
  state.agents = await api('/api/agents');
  state.pipelines = await api('/api/pipelines');
  const sel = $('#pipelineSelect');
  sel.innerHTML = state.pipelines.map((p) => `<option value="${p.id}">${esc(p.name)}</option>`).join('');
  state.pipelineId = state.pipelines[0]?.id;
  sel.value = state.pipelineId;
  sel.onchange = () => { state.pipelineId = Number(sel.value); render(); };
  render();
}

async function refreshStatus() {
  try {
    const s = await api('/api/status');
    state.ollama = s.ollama;
    const el = $('#aiStatus');
    el.textContent = s.ollama ? `IA: ${s.model}` : 'IA: heurística';
    el.className = 'ai-status ' + (s.ollama ? 'on' : 'off');
    el.title = s.ollama ? `Ollama ativo em ${s.ollama_url}` : `Ollama offline (${s.ollama_url}). Usando heurísticas locais.`;
  } catch { /* ignore */ }
}

async function render() {
  const view = $('.tab.active').dataset.view;
  if (view === 'board') await renderBoard();
  if (view === 'dash') await renderDash();
  if (view === 'agents') await renderAgents();
}

// --- Board ------------------------------------------------------------------
async function renderBoard() {
  state.board = await api(`/api/pipelines/${state.pipelineId}/board`);
  const { phases, cards } = state.board;
  const board = $('#board');
  board.innerHTML = phases.map((ph) => {
    const list = cards.filter((c) => c.phase_id === ph.id);
    const sum = list.reduce((t, c) => t + Number(c.value || 0), 0);
    return `<div class="column ${ph.kind}" data-phase="${ph.id}">
      <div class="col-head"><span>${esc(ph.name)}</span><span class="count">${list.length}</span></div>
      <div class="col-sum">${brl(sum)}</div>
      <div class="col-body" data-phase="${ph.id}">${list.map(cardHtml).join('')}</div>
    </div>`;
  }).join('');
  wireDnD();
  $$('.card', board).forEach((el) => el.addEventListener('click', () => openCard(Number(el.dataset.id))));
}

function cardHtml(c) {
  return `<div class="card" draggable="true" data-id="${c.id}">
    <h4>${esc(c.title)}</h4>
    <div class="company">${esc(c.company || c.contact_name || '—')}</div>
    <div class="card-foot">
      <span class="value">${brl(c.value)}</span>
      <span class="pill pri-${c.priority}">${c.priority}</span>
    </div>
    <div class="card-foot">
      <span class="score-dot"><span class="score-bar"><i style="width:${c.score || 0}%"></i></span>${c.score || 0}</span>
      ${c.source ? `<span class="muted" style="font-size:11px">${esc(c.source)}</span>` : ''}
    </div>
  </div>`;
}

let dragId = null;
function wireDnD() {
  $$('.card').forEach((el) => {
    el.addEventListener('dragstart', () => { dragId = Number(el.dataset.id); el.classList.add('dragging'); });
    el.addEventListener('dragend', () => el.classList.remove('dragging'));
  });
  $$('.col-body').forEach((body) => {
    body.addEventListener('dragover', (e) => { e.preventDefault(); body.classList.add('dragover'); });
    body.addEventListener('dragleave', () => body.classList.remove('dragover'));
    body.addEventListener('drop', async (e) => {
      e.preventDefault(); body.classList.remove('dragover');
      const phaseId = Number(body.dataset.phase);
      if (!dragId) return;
      try {
        const { triggered } = await api(`/api/cards/${dragId}/move`, { method: 'POST', body: JSON.stringify({ phase_id: phaseId }) });
        if (triggered?.length) toast(`Automação: ${triggered.join(', ')} executado(s)`);
        await renderBoard();
      } catch (err) { toast('Erro: ' + err.message); }
      dragId = null;
    });
  });
}

// --- Card drawer ------------------------------------------------------------
const drawer = $('#drawer'), scrim = $('#scrim');
function closeDrawer() { drawer.classList.remove('show'); scrim.classList.remove('show'); }
scrim.addEventListener('click', closeDrawer);

async function openCard(id) {
  const c = await api(`/api/cards/${id}`);
  const agentBtns = [
    ['scorer', 'Lead Scoring'], ['qualifier', 'Qualificar'],
    ['enricher', 'Nutrir'], ['proposal', 'Gerar proposta'],
  ].map(([k, l]) => `<button class="btn sm" data-agent="${k}">${l}</button>`).join('');

  $('#drawerPanel').innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:start">
      <div><h2>${esc(c.title)}</h2><div class="sub">${esc(c.company || '—')} · ${brl(c.value)}</div></div>
      <button class="btn ghost" id="closeDrawer">✕</button>
    </div>
    <div class="kv">
      <label>Contato</label><input data-f="contact_name" value="${esc(c.contact_name)}"/>
      <label>E-mail</label><input data-f="email" value="${esc(c.email)}"/>
      <label>Telefone</label><input data-f="phone" value="${esc(c.phone)}"/>
      <label>Valor (R$)</label><input data-f="value" type="number" value="${c.value || 0}"/>
      <label>Prioridade</label><select data-f="priority">
        ${['baixa', 'media', 'alta'].map((p) => `<option ${p === c.priority ? 'selected' : ''}>${p}</option>`).join('')}</select>
      <label>Score</label><div><b>${c.score || 0}</b>/100</div>
      <label>Notas</label><textarea data-f="notes" rows="2">${esc(c.notes)}</textarea>
    </div>
    <div style="display:flex;gap:8px"><button class="btn sm primary" id="saveCard">Salvar</button>
      <button class="btn sm ghost" id="delCard" style="margin-left:auto;color:var(--red)">Excluir</button></div>

    <div class="section-title">Agentes de IA ${state.ollama ? '' : '· (heurística local)'}</div>
    <div class="agent-btns">${agentBtns}</div>

    <div class="section-title">Copilot de Vendas</div>
    <div class="copilot">
      <div class="copilot-log" id="copLog"></div>
      <div class="copilot-input">
        <input id="copInput" placeholder="Pergunte ao copilot sobre este deal…"/>
        <button class="btn sm primary" id="copSend">Enviar</button>
      </div>
    </div>

    <div class="section-title">Histórico</div>
    <div class="timeline" id="timeline">${(c.activities || []).map(eventHtml).join('') || '<span class="muted">Sem atividades ainda.</span>'}</div>
  `;
  drawer.classList.add('show'); scrim.classList.add('show');
  $('#closeDrawer').onclick = closeDrawer;

  $('#saveCard').onclick = async () => {
    const patch = {};
    $$('[data-f]', $('#drawerPanel')).forEach((el) => { patch[el.dataset.f] = el.type === 'number' ? Number(el.value) : el.value; });
    await api(`/api/cards/${id}`, { method: 'PATCH', body: JSON.stringify(patch) });
    toast('Salvo'); await renderBoard();
  };
  $('#delCard').onclick = async () => {
    if (!confirm('Excluir este card?')) return;
    await api(`/api/cards/${id}`, { method: 'DELETE' }); closeDrawer(); await renderBoard();
  };
  $$('[data-agent]', $('#drawerPanel')).forEach((btn) => btn.onclick = () => runAgent(id, btn));

  // Copilot
  const cop = { history: [] };
  const send = async () => {
    const q = $('#copInput').value.trim(); if (!q) return;
    $('#copInput').value = '';
    addMsg('user', q);
    cop.history.push({ role: 'user', content: q });
    const loading = addMsg('bot', '…');
    try {
      const r = await api(`/api/cards/${id}/agents/copilot`, { method: 'POST', body: JSON.stringify({ question: q, history: cop.history }) });
      loading.textContent = r.text;
      cop.history.push({ role: 'assistant', content: r.text });
    } catch (e) { loading.textContent = 'Erro: ' + e.message; }
  };
  $('#copSend').onclick = send;
  $('#copInput').addEventListener('keydown', (e) => { if (e.key === 'Enter') send(); });
  function addMsg(role, text) {
    const el = document.createElement('div'); el.className = 'msg ' + role; el.textContent = text;
    $('#copLog').appendChild(el); $('#copLog').scrollTop = 1e9; return el;
  }
}

function eventHtml(a) {
  return `<div class="event"><div class="meta"><span class="badge">${esc(a.agent || a.kind)}</span><span>${esc(a.created_at)}</span></div><pre>${esc(a.content)}</pre></div>`;
}

async function runAgent(cardId, btn) {
  const original = btn.textContent;
  btn.disabled = true; btn.innerHTML = '<span class="spin"></span>';
  try {
    await api(`/api/cards/${cardId}/agents/${btn.dataset.agent}`, { method: 'POST', body: JSON.stringify({}) });
    const c = await api(`/api/cards/${cardId}`);
    $('#timeline').innerHTML = (c.activities || []).map(eventHtml).join('');
    toast('Agente executado');
    await renderBoard();
  } catch (e) { toast('Erro: ' + e.message); }
  btn.disabled = false; btn.textContent = original;
}

// --- Dashboard --------------------------------------------------------------
async function renderDash() {
  const m = await api(`/api/pipelines/${state.pipelineId}/metrics`);
  const maxVal = Math.max(1, ...m.by_phase.map((p) => p.value));
  $('#dash').innerHTML = `
    <div class="stat"><div class="n">${m.open}</div><div class="l">Deals abertos</div></div>
    <div class="stat"><div class="n">${brl(m.open_value)}</div><div class="l">Pipeline aberto</div></div>
    <div class="stat"><div class="n">${brl(m.won_value)}</div><div class="l">Ganho</div></div>
    <div class="stat"><div class="n">${Math.round(m.win_rate * 100)}%</div><div class="l">Taxa de conversão</div></div>
    <div class="stat"><div class="n">${m.avg_score}</div><div class="l">Score médio (abertos)</div></div>
    <div class="funnel">
      <h3>Funil por fase</h3>
      ${m.by_phase.map((p) => `<div class="frow">
        <span class="name">${esc(p.name)}</span>
        <span class="bar"><i style="width:${(p.value / maxVal) * 100}%"></i></span>
        <span class="val">${p.count} · ${brl(p.value)}</span>
      </div>`).join('')}
    </div>`;
}

// --- Agents view ------------------------------------------------------------
async function renderAgents() {
  const autos = await api(`/api/pipelines/${state.pipelineId}/automations`);
  const phaseName = (id) => state.board?.phases.find((p) => p.id === id)?.name || '—';
  if (!state.board) state.board = await api(`/api/pipelines/${state.pipelineId}/board`);
  $('#agents').innerHTML = `
    <div class="agent-card" style="flex-direction:column;align-items:stretch">
      <h4>Agentes de IA embutidos</h4>
      <p style="margin-bottom:6px">Rodam localmente via Ollama (${state.ollama ? 'ativo' : 'offline → heurística'}).</p>
      ${state.agents.map((a) => `<div class="auto-row"><div><b>${esc(a.name)}</b><br><span class="muted">${esc(a.description)}</span></div></div>`).join('')}
    </div>
    <div class="agent-card" style="flex-direction:column;align-items:stretch">
      <h4>Automações por fase</h4>
      <p>Quando um card entra numa fase, o agente vinculado roda automaticamente.</p>
      ${autos.map((a) => `<div class="auto-row">
        <div><b>${esc(a.name)}</b><br><span class="muted">Fase "${esc(phaseName(a.trigger_phase_id))}" → agente <b>${esc(a.agent_key)}</b></span></div>
        <button class="switch ${a.enabled ? 'on' : ''}" data-auto="${a.id}" data-on="${a.enabled}"></button>
      </div>`).join('') || '<span class="muted">Nenhuma automação.</span>'}
    </div>`;
  $$('[data-auto]').forEach((sw) => sw.onclick = async () => {
    const on = sw.dataset.on === '1' ? 0 : 1;
    await api(`/api/automations/${sw.dataset.auto}`, { method: 'PATCH', body: JSON.stringify({ enabled: on }) });
    sw.dataset.on = on; sw.classList.toggle('on', !!on);
  });
}

// --- Tabs / modal -----------------------------------------------------------
$$('.tab').forEach((t) => t.onclick = () => {
  $$('.tab').forEach((x) => x.classList.remove('active'));
  $$('.view').forEach((x) => x.classList.remove('active'));
  t.classList.add('active');
  $('#view-' + t.dataset.view).classList.add('active');
  render();
});

const modal = $('#modal');
$('#newCardBtn').onclick = () => modal.classList.add('show');
$('#cancelNew').onclick = () => modal.classList.remove('show');
$('#newCardForm').onsubmit = async (e) => {
  e.preventDefault();
  const fd = Object.fromEntries(new FormData(e.target).entries());
  fd.pipeline_id = state.pipelineId; fd.value = Number(fd.value || 0);
  try {
    await api('/api/cards', { method: 'POST', body: JSON.stringify(fd) });
    modal.classList.remove('show'); e.target.reset(); toast('Lead criado'); await renderBoard();
  } catch (err) { toast('Erro: ' + err.message); }
};

boot();
