import express from 'express';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { db, logActivity } from './db.js';
import { seedIfEmpty } from './seed.js';
import {
  runScorer, runQualifier, runEnricher, runProposal, runCopilot, runWhatsapp,
  ollamaAvailable, aiConfig,
} from './ai.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const app = express();
app.use(express.json({ limit: '1mb' }));
app.use(express.static(join(__dirname, '..', 'public')));

seedIfEmpty();

// --- Helpers ----------------------------------------------------------------
const parseCard = (c) => (c ? { ...c, fields: JSON.parse(c.fields || '{}') } : c);
const getCard = (id) => parseCard(db.prepare('SELECT * FROM cards WHERE id = ?').get(id));
const touchCard = (id) => db.prepare("UPDATE cards SET updated_at = datetime('now') WHERE id = ?").run(id);

function runAgent(key, card, extra = {}) {
  switch (key) {
    case 'scorer': return runScorer(card);
    case 'qualifier': return runQualifier(card);
    case 'enricher': return runEnricher(card);
    case 'proposal': return runProposal(card);
    case 'copilot': return runCopilot(card, extra.question, extra.history);
    case 'whatsapp': return runWhatsapp(card);
    default: throw new Error(`Agente desconhecido: ${key}`);
  }
}

const wrap = (fn) => (req, res) => Promise.resolve(fn(req, res)).catch((e) => {
  console.error(e);
  res.status(500).json({ error: e.message });
});

// --- Status / config --------------------------------------------------------
app.get('/api/status', wrap(async (_req, res) => {
  res.json({
    ok: true,
    ollama: await ollamaAvailable(),
    model: aiConfig.OLLAMA_MODEL,
    ollama_url: aiConfig.OLLAMA_URL,
    version: '0.1.0',
  });
}));

// --- Pipelines --------------------------------------------------------------
app.get('/api/pipelines', wrap((_req, res) => {
  res.json(db.prepare('SELECT * FROM pipelines ORDER BY id').all());
}));

app.post('/api/pipelines', wrap((req, res) => {
  const { name, description = '' } = req.body;
  if (!name) return res.status(400).json({ error: 'name obrigatório' });
  const id = db.prepare('INSERT INTO pipelines (name, description) VALUES (?, ?)').run(name, description).lastInsertRowid;
  ['Novos Leads', 'Qualificação', 'Proposta', 'Ganho', 'Perdido'].forEach((n, i) =>
    db.prepare('INSERT INTO phases (pipeline_id, name, position, kind) VALUES (?, ?, ?, ?)')
      .run(id, n, i, n === 'Ganho' ? 'won' : n === 'Perdido' ? 'lost' : 'open'));
  res.status(201).json(db.prepare('SELECT * FROM pipelines WHERE id = ?').get(id));
}));

// Board completo: fases + cards
app.get('/api/pipelines/:id/board', wrap((req, res) => {
  const pipeline = db.prepare('SELECT * FROM pipelines WHERE id = ?').get(req.params.id);
  if (!pipeline) return res.status(404).json({ error: 'pipeline não encontrado' });
  const phases = db.prepare('SELECT * FROM phases WHERE pipeline_id = ? ORDER BY position').all(pipeline.id);
  const cards = db.prepare('SELECT * FROM cards WHERE pipeline_id = ? ORDER BY position, id').all(pipeline.id).map(parseCard);
  res.json({ pipeline, phases, cards });
}));

// --- Cards ------------------------------------------------------------------
app.post('/api/cards', wrap((req, res) => {
  const b = req.body;
  if (!b.pipeline_id || !b.title) return res.status(400).json({ error: 'pipeline_id e title obrigatórios' });
  let phaseId = b.phase_id;
  if (!phaseId) phaseId = db.prepare('SELECT id FROM phases WHERE pipeline_id = ? ORDER BY position LIMIT 1').get(b.pipeline_id)?.id;
  const info = db.prepare(`INSERT INTO cards
    (pipeline_id, phase_id, title, company, contact_name, email, phone, source, value, priority, notes, fields)
    VALUES (@pipeline_id, @phase_id, @title, @company, @contact_name, @email, @phone, @source, @value, @priority, @notes, @fields)`)
    .run({
      pipeline_id: b.pipeline_id, phase_id: phaseId, title: b.title,
      company: b.company || '', contact_name: b.contact_name || '', email: b.email || '',
      phone: b.phone || '', source: b.source || '', value: Number(b.value || 0),
      priority: b.priority || 'media', notes: b.notes || '', fields: JSON.stringify(b.fields || {}),
    });
  logActivity(info.lastInsertRowid, 'system', 'Card criado.');
  res.status(201).json(getCard(info.lastInsertRowid));
}));

app.get('/api/cards/:id', wrap((req, res) => {
  const card = getCard(req.params.id);
  if (!card) return res.status(404).json({ error: 'card não encontrado' });
  const activities = db.prepare('SELECT * FROM activities WHERE card_id = ? ORDER BY id DESC').all(card.id);
  res.json({ ...card, activities });
}));

app.patch('/api/cards/:id', wrap((req, res) => {
  const card = getCard(req.params.id);
  if (!card) return res.status(404).json({ error: 'card não encontrado' });
  const allowed = ['title', 'company', 'contact_name', 'email', 'phone', 'source', 'value', 'priority', 'status', 'notes', 'position', 'score'];
  const sets = [], vals = {};
  for (const k of allowed) if (k in req.body) { sets.push(`${k} = @${k}`); vals[k] = req.body[k]; }
  if ('fields' in req.body) { sets.push('fields = @fields'); vals.fields = JSON.stringify(req.body.fields); }
  if (sets.length) {
    db.prepare(`UPDATE cards SET ${sets.join(', ')}, updated_at = datetime('now') WHERE id = @id`).run({ ...vals, id: card.id });
  }
  res.json(getCard(card.id));
}));

app.delete('/api/cards/:id', wrap((req, res) => {
  db.prepare('DELETE FROM cards WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
}));

// Mover card de fase — dispara automações da fase de destino
app.post('/api/cards/:id/move', wrap(async (req, res) => {
  const card = getCard(req.params.id);
  if (!card) return res.status(404).json({ error: 'card não encontrado' });
  const { phase_id } = req.body;
  const phase = db.prepare('SELECT * FROM phases WHERE id = ?').get(phase_id);
  if (!phase) return res.status(400).json({ error: 'fase inválida' });

  const status = phase.kind === 'won' ? 'ganho' : phase.kind === 'lost' ? 'perdido' : 'aberto';
  db.prepare("UPDATE cards SET phase_id = ?, status = ?, updated_at = datetime('now') WHERE id = ?").run(phase.id, status, card.id);
  logActivity(card.id, 'phase', `Movido para "${phase.name}".`);

  // Automações: agentes vinculados à fase de destino
  const autos = db.prepare('SELECT * FROM automations WHERE trigger_phase_id = ? AND enabled = 1').all(phase.id);
  const triggered = [];
  for (const a of autos) {
    try {
      const result = await runAgent(a.agent_key, getCard(card.id));
      applyAgentResult(card.id, a.agent_key, result);
      triggered.push(a.agent_key);
    } catch (e) { console.error('automação falhou', e); }
  }
  res.json({ card: getCard(card.id), triggered });
}));

// --- Execução de agentes (manual) ------------------------------------------
function applyAgentResult(cardId, key, result) {
  if (key === 'scorer') {
    db.prepare('UPDATE cards SET score = ?, priority = ? WHERE id = ?').run(result.score, result.priority, cardId);
    logActivity(cardId, 'agent', `Score ${result.score}/100 · prioridade ${result.priority}. ${result.reasons?.join('; ') || ''}`, 'Lead Scoring');
  } else if (key === 'qualifier') {
    logActivity(cardId, 'agent', `${result.qualified ? '✅ Qualificado' : '⚠️ Não qualificado'}. ${result.summary}\nPróximo passo: ${result.next_step}`, 'Qualificação');
  } else if (key === 'enricher') {
    logActivity(cardId, 'agent', result.text, 'Nutrição');
  } else if (key === 'proposal') {
    logActivity(cardId, 'agent', result.markdown, 'Proposta');
  }
  touchCard(cardId);
}

app.post('/api/cards/:id/agents/:key', wrap(async (req, res) => {
  const card = getCard(req.params.id);
  if (!card) return res.status(404).json({ error: 'card não encontrado' });
  const key = req.params.key;
  const result = await runAgent(key, card, { question: req.body?.question, history: req.body?.history });
  if (key === 'copilot') return res.json(result); // não registra automaticamente
  if (key === 'whatsapp') {
    logActivity(card.id, 'message', `WhatsApp${result.phone ? ` para ${result.phone}` : ''}:\n${result.text}`, 'WhatsApp');
    return res.json({ result, card: getCard(card.id) });
  }
  applyAgentResult(card.id, key, result);
  res.json({ result, card: getCard(card.id) });
}));

// Comentário / nota manual
app.post('/api/cards/:id/activities', wrap((req, res) => {
  const card = getCard(req.params.id);
  if (!card) return res.status(404).json({ error: 'card não encontrado' });
  const { content, kind = 'note' } = req.body;
  if (!content) return res.status(400).json({ error: 'content obrigatório' });
  logActivity(card.id, kind, content);
  res.status(201).json({ ok: true });
}));

// --- Agentes & automações (config) -----------------------------------------
app.get('/api/agents', wrap((_req, res) => res.json(db.prepare('SELECT * FROM agents ORDER BY id').all())));

app.get('/api/pipelines/:id/automations', wrap((req, res) =>
  res.json(db.prepare('SELECT * FROM automations WHERE pipeline_id = ? ORDER BY id').all(req.params.id))));

app.patch('/api/automations/:id', wrap((req, res) => {
  if ('enabled' in req.body)
    db.prepare('UPDATE automations SET enabled = ? WHERE id = ?').run(req.body.enabled ? 1 : 0, req.params.id);
  res.json(db.prepare('SELECT * FROM automations WHERE id = ?').get(req.params.id));
}));

// --- Métricas / dashboard ---------------------------------------------------
app.get('/api/pipelines/:id/metrics', wrap((req, res) => {
  const pid = req.params.id;
  const cards = db.prepare('SELECT * FROM cards WHERE pipeline_id = ?').all(pid);
  const open = cards.filter((c) => c.status === 'aberto');
  const won = cards.filter((c) => c.status === 'ganho');
  const lost = cards.filter((c) => c.status === 'perdido');
  const sum = (arr) => arr.reduce((t, c) => t + Number(c.value || 0), 0);
  const byPhase = db.prepare(`
    SELECT p.id, p.name, COUNT(c.id) AS count, COALESCE(SUM(c.value),0) AS value
    FROM phases p LEFT JOIN cards c ON c.phase_id = p.id
    WHERE p.pipeline_id = ? GROUP BY p.id ORDER BY p.position`).all(pid);
  res.json({
    total: cards.length,
    open: open.length, won: won.length, lost: lost.length,
    open_value: sum(open), won_value: sum(won),
    win_rate: won.length + lost.length ? won.length / (won.length + lost.length) : 0,
    avg_score: open.length ? Math.round(open.reduce((t, c) => t + (c.score || 0), 0) / open.length) : 0,
    by_phase: byPhase,
  });
}));

const PORT = process.env.PORT || 4321;
app.listen(PORT, () => {
  console.log(`\n  CRM AI Studio (local) rodando em  http://localhost:${PORT}`);
  console.log(`  LLM local (Ollama): ${aiConfig.OLLAMA_URL}  ·  modelo: ${aiConfig.OLLAMA_MODEL}`);
  console.log(`  Dados: ./data/crm.db (SQLite, na sua máquina)\n`);
});
