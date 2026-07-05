// Camada de IA — 100% local.
// Usa o Ollama (http://localhost:11434) rodando na sua máquina. Se o Ollama não
// estiver disponível, cai automaticamente para heurísticas locais, de modo que o
// CRM continua funcionando offline, sem nenhuma chamada externa.

const OLLAMA_URL = process.env.OLLAMA_URL || 'http://localhost:11434';
const OLLAMA_MODEL = process.env.OLLAMA_MODEL || 'llama3.2';

export async function ollamaAvailable() {
  try {
    const res = await fetch(`${OLLAMA_URL}/api/tags`, { signal: AbortSignal.timeout(1500) });
    return res.ok;
  } catch {
    return false;
  }
}

async function ollamaChat(system, user, { json = false } = {}) {
  const res = await fetch(`${OLLAMA_URL}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: OLLAMA_MODEL,
      stream: false,
      format: json ? 'json' : undefined,
      options: { temperature: 0.3 },
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
    }),
    signal: AbortSignal.timeout(120000),
  });
  if (!res.ok) throw new Error(`Ollama HTTP ${res.status}`);
  const data = await res.json();
  return data.message?.content ?? '';
}

function safeJson(text, fallback) {
  try {
    const match = text.match(/\{[\s\S]*\}/);
    return match ? JSON.parse(match[0]) : fallback;
  } catch {
    return fallback;
  }
}

function cardSummary(card) {
  const f = typeof card.fields === 'string' ? card.fields : JSON.stringify(card.fields || {});
  return [
    `Título: ${card.title}`,
    `Empresa: ${card.company || '—'}`,
    `Contato: ${card.contact_name || '—'} <${card.email || '—'}> ${card.phone || ''}`,
    `Origem: ${card.source || '—'}`,
    `Valor estimado: R$ ${Number(card.value || 0).toLocaleString('pt-BR')}`,
    `Notas: ${card.notes || '—'}`,
    `Campos extras: ${f}`,
  ].join('\n');
}

// --- Heurísticas locais (fallback sem LLM) ----------------------------------
function heuristicScore(card) {
  let score = 40;
  const reasons = [];
  const val = Number(card.value || 0);
  if (val >= 100000) { score += 25; reasons.push('Ticket alto (≥ R$100k)'); }
  else if (val >= 20000) { score += 12; reasons.push('Ticket relevante'); }
  if (card.email && /@/.test(card.email)) { score += 8; reasons.push('E-mail informado'); }
  if (card.phone) { score += 6; reasons.push('Telefone informado'); }
  if (card.company) { score += 6; reasons.push('Empresa identificada'); }
  const hot = /(urgente|comprar|orçamento|proposta|contratar|demo|reunião)/i;
  if (hot.test(`${card.notes} ${card.title}`)) { score += 10; reasons.push('Sinais de intenção de compra'); }
  const src = (card.source || '').toLowerCase();
  if (/(indicação|referral|evento)/.test(src)) { score += 8; reasons.push('Origem de alta conversão'); }
  score = Math.max(0, Math.min(100, score));
  const priority = score >= 70 ? 'alta' : score >= 45 ? 'media' : 'baixa';
  return { score, priority, reasons };
}

// --- Agentes ----------------------------------------------------------------

export async function runScorer(card) {
  if (await ollamaAvailable()) {
    try {
      const out = await ollamaChat(
        'Você é um agente de Lead Scoring de um CRM. Avalie o lead e responda SOMENTE JSON no formato {"score": <0-100>, "priority": "baixa|media|alta", "reasons": ["..."]}.',
        `Avalie a prioridade e a probabilidade de conversão deste lead:\n\n${cardSummary(card)}`,
        { json: true }
      );
      const j = safeJson(out, null);
      if (j && typeof j.score === 'number') {
        return {
          score: Math.max(0, Math.min(100, Math.round(j.score))),
          priority: ['baixa', 'media', 'alta'].includes(j.priority) ? j.priority : 'media',
          reasons: Array.isArray(j.reasons) ? j.reasons.slice(0, 6) : [],
          engine: 'ollama',
        };
      }
    } catch { /* cai no heurístico */ }
  }
  return { ...heuristicScore(card), engine: 'heuristic' };
}

export async function runQualifier(card) {
  if (await ollamaAvailable()) {
    try {
      const out = await ollamaChat(
        'Você é um agente de Qualificação (SDR) de um CRM. Use um raciocínio tipo BANT/GPCT. Responda SOMENTE JSON {"qualified": true|false, "summary": "...", "next_step": "...", "questions": ["..."]}.',
        `Qualifique este lead:\n\n${cardSummary(card)}`,
        { json: true }
      );
      const j = safeJson(out, null);
      if (j) return { engine: 'ollama', qualified: !!j.qualified, summary: j.summary || '', next_step: j.next_step || '', questions: j.questions || [] };
    } catch { /* fallback */ }
  }
  const h = heuristicScore(card);
  return {
    engine: 'heuristic',
    qualified: h.score >= 50,
    summary: `Lead com score heurístico ${h.score}/100. ${h.reasons.join('; ') || 'Poucos sinais disponíveis.'}`,
    next_step: h.score >= 50 ? 'Agendar call de descoberta.' : 'Enviar conteúdo de nutrição e reavaliar em 7 dias.',
    questions: ['Qual o orçamento disponível?', 'Quem decide a compra?', 'Qual a urgência / prazo?'],
  };
}

export async function runEnricher(card) {
  if (await ollamaAvailable()) {
    try {
      const out = await ollamaChat(
        'Você é um agente de Nutrição/Enriquecimento de um CRM. Gere insights e um plano de acompanhamento curto e acionável em português. Máximo 8 linhas.',
        `Enriqueça e sugira os próximos passos para este lead:\n\n${cardSummary(card)}`
      );
      if (out.trim()) return { engine: 'ollama', text: out.trim() };
    } catch { /* fallback */ }
  }
  const h = heuristicScore(card);
  return {
    engine: 'heuristic',
    text: [
      `Prioridade sugerida: ${h.priority.toUpperCase()} (score ${h.score}).`,
      `Sinais: ${h.reasons.join('; ') || 'poucos dados; enriquecer cadastro.'}`,
      'Próximos passos:',
      '1. Confirmar dados de contato e cargo do decisor.',
      '2. Enviar case relevante ao segmento da empresa.',
      '3. Propor uma call de 20 min esta semana.',
    ].join('\n'),
  };
}

export async function runProposal(card) {
  const value = Number(card.value || 0);
  if (await ollamaAvailable()) {
    try {
      const out = await ollamaChat(
        'Você é um agente que redige propostas comerciais em português, em Markdown, tom profissional e objetivo.',
        `Escreva uma proposta comercial para:\n\n${cardSummary(card)}\n\nInclua: introdução, escopo/solução, investimento (use o valor estimado), próximos passos e validade de 15 dias.`
      );
      if (out.trim()) return { engine: 'ollama', markdown: out.trim() };
    } catch { /* fallback */ }
  }
  return {
    engine: 'heuristic',
    markdown: [
      `# Proposta Comercial — ${card.company || card.title}`,
      '',
      `**Para:** ${card.contact_name || 'Responsável'}  `,
      `**Data:** ${new Date().toLocaleDateString('pt-BR')}`,
      '',
      '## 1. Contexto',
      `Entendemos a necessidade de ${card.title.toLowerCase()}. Esta proposta resume nossa solução.`,
      '',
      '## 2. Solução',
      '- Implantação assistida',
      '- Onboarding e treinamento da equipe',
      '- Suporte dedicado',
      '',
      '## 3. Investimento',
      `**R$ ${value.toLocaleString('pt-BR')}** (condições a combinar).`,
      '',
      '## 4. Próximos passos',
      'Aprovação desta proposta e agendamento do kickoff.',
      '',
      '_Validade: 15 dias._',
    ].join('\n'),
  };
}

// Monta um link wa.me (click-to-chat). Lógica sempre via wa.me: telefone só com
// dígitos (DDI+DDD+número, sem "+", espaços ou símbolos) e texto URL-encoded.
// É 100% local — abre o WhatsApp do usuário, sem API nem nuvem.
export function waLink(phone, text) {
  const digits = String(phone || '').replace(/\D/g, '');
  if (!digits) return '';
  return `https://wa.me/${digits}${text ? `?text=${encodeURIComponent(text)}` : ''}`;
}

export async function runWhatsapp(card) {
  let text = '';
  let engine = 'heuristic';
  if (await ollamaAvailable()) {
    try {
      const out = await ollamaChat(
        'Você redige mensagens curtas de WhatsApp para prospecção/follow-up B2B em português. Tom cordial e objetivo, no máximo 3 frases, terminando com uma pergunta ou CTA claro. Não use emojis em excesso.',
        `Escreva a mensagem de WhatsApp para ${card.contact_name || 'o contato'}${card.company ? ` (${card.company})` : ''} sobre o negócio "${card.title}".\n\n${cardSummary(card)}`
      );
      if (out.trim()) { text = out.trim(); engine = 'ollama'; }
    } catch { /* fallback */ }
  }
  if (!text) {
    text = `Olá ${card.contact_name || ''}! Aqui é da equipe comercial. Sobre "${card.title}"${card.company ? ` para a ${card.company}` : ''}, conseguimos conversar rapidamente esta semana? Fico à disposição.`
      .replace(/\s+/g, ' ').trim();
  }
  return { engine, text, phone: card.phone, url: waLink(card.phone, text) };
}

export async function runCopilot(card, question, history = []) {
  if (await ollamaAvailable()) {
    try {
      const ctx = `Contexto do card (deal) no CRM:\n${cardSummary(card)}`;
      const hist = history.map((h) => `${h.role === 'user' ? 'Vendedor' : 'Copilot'}: ${h.content}`).join('\n');
      const out = await ollamaChat(
        'Você é o Copilot de Vendas, assistente dentro de um CRM. Responda em português, de forma prática e curta. Ajude a avançar o deal (e-mails, objeções, próximos passos).',
        `${ctx}\n\n${hist ? hist + '\n' : ''}Vendedor: ${question}`
      );
      if (out.trim()) return { engine: 'ollama', text: out.trim() };
    } catch { /* fallback */ }
  }
  return {
    engine: 'heuristic',
    text: `(*Ollama offline — resposta local*) Para "${card.title}", sugiro: 1) confirmar a dor principal do cliente; 2) reforçar o valor sobre o preço (R$ ${Number(card.value || 0).toLocaleString('pt-BR')}); 3) propor um próximo passo com data. Instale/rode o Ollama para respostas geradas por IA.`,
  };
}

export const aiConfig = { OLLAMA_URL, OLLAMA_MODEL };
