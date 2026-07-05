import { db } from './db.js';

// Popula um pipeline pré-validado (módulo "Funil de Vendas") caso o banco esteja vazio.
export function seedIfEmpty() {
  const count = db.prepare('SELECT COUNT(*) AS n FROM pipelines').get().n;
  if (count > 0) return false;
  seed();
  return true;
}

export function seed() {
  const insertPipeline = db.prepare('INSERT INTO pipelines (name, description) VALUES (?, ?)');
  const insertPhase = db.prepare('INSERT INTO phases (pipeline_id, name, position, kind) VALUES (?, ?, ?, ?)');
  const insertCard = db.prepare(`INSERT INTO cards
    (pipeline_id, phase_id, title, company, contact_name, email, phone, source, value, priority, position)
    VALUES (@pipeline_id, @phase_id, @title, @company, @contact_name, @email, @phone, @source, @value, @priority, @position)`);
  const insertAgent = db.prepare('INSERT OR IGNORE INTO agents (key, name, description, auto_phase_id) VALUES (?, ?, ?, ?)');
  const insertAuto = db.prepare('INSERT INTO automations (pipeline_id, name, trigger_phase_id, agent_key) VALUES (?, ?, ?, ?)');

  const tx = db.transaction(() => {
    const pipelineId = insertPipeline.run('Funil de Vendas', 'Módulo pré-validado: Marketing → Vendas → Pós-venda').lastInsertRowid;

    const phaseNames = [
      ['Novos Leads', 'open'],
      ['Qualificação', 'open'],
      ['Proposta', 'open'],
      ['Negociação', 'open'],
      ['Ganho', 'won'],
      ['Perdido', 'lost'],
    ];
    const phaseIds = phaseNames.map(([name, kind], i) => insertPhase.run(pipelineId, name, i, kind).lastInsertRowid);

    // Agentes de IA embutidos
    insertAgent.run('scorer', 'Lead Scoring', 'Pontua o lead (0-100) e define prioridade.', phaseIds[0]);
    insertAgent.run('qualifier', 'Qualificação (SDR)', 'Qualifica o lead com raciocínio BANT/GPCT.', phaseIds[1]);
    insertAgent.run('enricher', 'Nutrição / Enriquecimento', 'Gera insights e plano de follow-up.', null);
    insertAgent.run('proposal', 'Gerador de Propostas', 'Redige uma proposta comercial.', phaseIds[2]);
    insertAgent.run('copilot', 'Copilot de Vendas', 'Assistente de chat por deal.', null);
    insertAgent.run('whatsapp', 'WhatsApp (wa.me)', 'Redige a mensagem e abre o chat via link wa.me.', null);

    // Automação: ao entrar em "Novos Leads" roda o Lead Scoring; em "Qualificação" roda o Qualifier.
    insertAuto.run(pipelineId, 'Score automático de novos leads', phaseIds[0], 'scorer');
    insertAuto.run(pipelineId, 'Qualificar ao entrar na fase', phaseIds[1], 'qualifier');

    const sample = [
      { phase: 0, title: 'Sistema de gestão para 50 lojas', company: 'Rede Varejo BR', contact_name: 'Marina Alves', email: 'marina@redevarejo.com.br', phone: '+55 11 98888-1010', source: 'Indicação', value: 180000, priority: 'alta' },
      { phase: 0, title: 'Automação de atendimento', company: 'Clínica Vida', contact_name: 'Dr. Paulo Souza', email: 'paulo@clinicavida.com', phone: '+55 21 97777-2020', source: 'Anúncio', value: 24000, priority: 'media' },
      { phase: 1, title: 'Plataforma de RH', company: 'Indústria Norte', contact_name: 'Carla Menezes', email: 'carla@indnorte.com', phone: '', source: 'Evento', value: 96000, priority: 'media' },
      { phase: 2, title: 'CRM para time comercial', company: 'AgroTech', contact_name: 'Rafael Lima', email: 'rafael@agrotech.com', phone: '+55 62 96666-3030', source: 'Site', value: 60000, priority: 'alta' },
      { phase: 3, title: 'Portal do cliente', company: 'Seguros União', contact_name: 'Beatriz Rocha', email: 'bia@seguros.com', phone: '+55 51 95555-4040', source: 'Outbound', value: 145000, priority: 'alta' },
    ];
    sample.forEach((s, i) => insertCard.run({
      pipeline_id: pipelineId,
      phase_id: phaseIds[s.phase],
      title: s.title, company: s.company, contact_name: s.contact_name,
      email: s.email, phone: s.phone, source: s.source, value: s.value,
      priority: s.priority, position: i,
    }));
  });
  tx();
}

// Permite rodar `npm run seed` diretamente.
if (import.meta.url === `file://${process.argv[1]}`) {
  seed();
  console.log('Seed concluído.');
}
