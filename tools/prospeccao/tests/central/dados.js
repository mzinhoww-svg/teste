// Dados fictícios para os testes da central. Datas sempre relativas a "agora" (quando o módulo é chamado).
const DIA = 86400000;
const atras = (dias) => new Date(Date.now() - dias * DIA).toISOString();
const dia = (dias) => atras(dias).slice(0, 10);

function toques(l, canal) {
  const saud = l.saudacao;
  return [1, 2, 3].map((n) => {
    const mensagem = "Oi, " + saud + ",\n\nToque " + n + " da cadência para " + l.nome + ".\nPosso te mandar uma ideia rápida?";
    const t = { n, mensagem, waLink: "https://wa.me/" + l.telefone + "?text=" + encodeURIComponent(mensagem) };
    if (canal === "E-mail") { t.assunto = "Ideia para " + l.nome + " (" + n + ")"; t.corpo = mensagem; }
    return t;
  });
}

function base(num, sobre) {
  const id = num === 0 ? "TESTE" : "R" + String(num).padStart(4, "0");
  const x = String(num).padStart(3, "0");
  const l = {
    nome: num === 0 ? "Reiners Media (teste)" : "Clínica Modelo " + num,
    saudacao: num === 0 ? "equipe Reiners" : "pessoal da Clínica Modelo " + num,
    icp: "A", segmento: num % 2 ? "Odontologia" : "Estética", categoria: "Clínica", faixa: "Premium",
    score: 90 - num, bairro: "Jardim das Américas", canal: "WhatsApp",
    telefone: "5565900000" + x, email: "contato" + num + "@modelo.example", site: "https://modelo" + num + ".example",
    instagram: "@modelo" + num, fraseUnica: "Vi o trabalho de vocês com a clínica " + num + ".", flags: [],
    etapa: 0, situacao: "ativo", enviado1: null, enviado2: null, enviado3: null,
    foto: "f1", ordem: num === 0 ? 0 : num,
    perfil: { especialidade: "Clínica geral", porte: "Médio", cidade: "Cuiabá", nota: 4.8, avaliacoes: 120, fonteDados: "Google Maps", fonteFrase: "Instagram" },
    empresa: { cnpj: "00.000.000/00" + String(num).padStart(2, "0") + "-00", razaoSocial: "Modelo " + num + " Ltda", porte: "ME", abertura: "2015-03-01", cnae: "8630-5/04" },
    socios: [{ nome: "Sócia Modelo " + num, qualificacao: "Sócio-Administrador" }],
    decisores: [{ nome: "Ana Souza", cargo: "Diretora", fonte: "https://modelo" + num + ".example/equipe", confianca: "alta" }],
    contatos: [{ id: "k1", papel: "decisor", nome: "ANA SOUZA", cargo: "Diretora", telefone: "5565911110" + x, whatsapp: "sim", email: "ana" + num + "@modelo.example", fonte: "site", confianca: "alta" }],
    sinais: [{ texto: "Instagram ativo", fonte: "https://instagram.com/exemplo" }, { texto: "Sem podcast", fonte: "" }], alertas: [], pendencias: [],
    enriquecimento: { status: "completo", atualizadoEm: dia(3), contatoSugerido: "k1" },
    historico: [],
  };
  l.toques = toques(l, l.canal);
  Object.assign(l, sobre || {});
  if (sobre && sobre.canal === "E-mail") l.toques = toques(l, "E-mail");
  return { id, data: l };
}

function leads(n) {
  const docs = [base(0)];
  const fixos = [
    () => base(1),
    () => base(2, { etapa: 1, enviado1: atras(1) }),
    () => base(3),
    () => base(4, { canal: "E-mail", etapa: 1, enviado1: atras(10) }),
    () => base(5, { situacao: "respondeu", etapa: 1, enviado1: atras(2) }),
    () => base(6, { situacao: "sair", etapa: 1, enviado1: atras(5) }),
    () => base(7, { etapa: 2, enviado1: atras(14), enviado2: atras(7), alertas: [{ texto: "Telefone sem confirmação", fonte: "Google Maps" }] }),
  ];
  for (let i = 1; i <= n; i++) docs.push(i <= 7 ? fixos[i - 1]() : base(i));
  return docs;
}

function clientes(n) {
  const todos = [
    { id: "C0001", data: { nome: "Cliente Um", saudacao: "pessoal da Cliente Um", telefone: "5565922220001", email: "um@cliente.example", produto: "Hora de Estúdio", origem: "Prospecção", leadId: "R0001", segmento: "Odontologia", etapa: 1, situacao: "ativo", criadoEm: atras(2), dataKickoff: null, dataGravacao: null } },
    { id: "C0002", data: { nome: "Cliente Dois", saudacao: "pessoal da Cliente Dois", telefone: "5565922220002", email: "dois@cliente.example", produto: "Podcast In Loco", origem: "Prospecção", leadId: "R0003", segmento: "Estética", etapa: 2, situacao: "ativo", criadoEm: atras(6), pvEnviado1: atras(5), pvConcluido1: atras(5), dataKickoff: new Date(Date.now() + 2 * DIA).toISOString().slice(0, 16), dataGravacao: null } },
    { id: "C0003", data: { nome: "Cliente Três", saudacao: "pessoal da Cliente Três", telefone: "5565922220003", email: "tres@cliente.example", produto: "Outro", origem: "Indicação", segmento: "Saúde", etapa: 1, situacao: "pausado", criadoEm: atras(9), dataKickoff: null, dataGravacao: null } },
  ];
  return todos.slice(0, n == null ? todos.length : n);
}

function posvenda() { return {"versao": "pv1", "etapas": [{"n": 1, "nome": "Boas-vindas", "quando": "imediato", "texto": "Oi, {saudacao}, aqui é a Letícia, da Reiners Media. Que bom ter vocês com a gente no {produto}.\nO próximo passo é o kickoff: uma conversa de 30 a 40 minutos para alinhar objetivo, público, pauta e convidados.\nQue dia e horário ficam bons para vocês esta semana?"}, {"n": 2, "nome": "Kickoff", "quando": "data", "campoData": "dataKickoff", "vespera": false, "texto": "Oi, {saudacao}, confirmando nosso kickoff {quando}.\nPara aproveitar bem o tempo, se puder, já pensa em três coisas: o objetivo principal do programa, quem vocês querem ouvir ou convidar e os temas que não podem faltar.\nQualquer mudança de horário, me avisa por aqui."}, {"n": 3, "nome": "Pauta e agenda", "quando": "imediato", "texto": "Oi, {saudacao}, obrigada pelo kickoff. Vou te mandar por aqui o resumo do que combinamos e a pauta do primeiro episódio para você aprovar.\nPara fechar a agenda de gravação, me diz quais datas funcionam para vocês e para os convidados."}, {"n": 4, "nome": "Gravação", "quando": "data", "campoData": "dataGravacao", "vespera": true, "texto": "Oi, {saudacao}, passando para lembrar da gravação {quando}, {local}.\n{preparo}\nSe algum convidado mudar, me avisa por aqui que eu ajusto a pauta."}, {"n": 5, "nome": "Aprovação", "quando": "imediato", "texto": "Oi, {saudacao}, o material está editado. Vou te mandar o link por aqui para você assistir com calma.\nSe quiser algum ajuste, me manda os pontos com o minuto de cada um, que a gente ajusta."}, {"n": 6, "nome": "Entrega", "quando": "imediato", "texto": "Oi, {saudacao}, entrega feita: {entregaveis} já estão com vocês.\nQueria muito saber o que você achou da experiência. Se topar, uma frase sua sobre o trabalho pode entrar no nosso site, com o seu nome."}, {"n": 7, "nome": "Recorrência", "quando": 15, "texto": "Oi, {saudacao}, como foi a repercussão por aí?\n{recorrencia}"}], "produtos": {"Hora de Estúdio": {"entregaveis": "os arquivos da gravação", "local": "aqui no estúdio"}, "Podcast In Loco": {"entregaveis": "o episódio editado, os cortes, o reel e as fotos do bastidor", "local": "na sede de vocês"}, "BTS Recorrente": {"entregaveis": "os episódios do mês e os cortes", "local": "aqui no estúdio"}, "Episódio piloto": {"entregaveis": "o episódio piloto editado", "local": "aqui no estúdio"}, "Outro": {"entregaveis": "o material combinado", "local": "no local combinado"}}, "preparo": {"estudio": "Vale chegar uns 20 minutos antes para ajustar som e câmera com calma. Roupa lisa, sem listra fina, fica melhor no vídeo.", "sede": "A nossa equipe chega antes para montar a estrutura. Só precisamos de uma sala com tomada e o mínimo de barulho. Roupa lisa, sem listra fina, fica melhor no vídeo."}, "recorrencia": {"padrao": "Quem grava uma vez costuma sentir o efeito quando a presença vira constante. Posso te mostrar como fica um formato mensal, com a gente cuidando de pauta, gravação e distribuição?", "BTS Recorrente": "Queria ouvir de vocês o que funcionou neste mês e já pensar juntos a pauta do próximo. Tem 20 minutos esta semana?"}}; }
function meta() { return { metaDiaria: 20, esperaDias: { "1": 0, "2": 4, "3": 6 } }; }
function fotos() {
  return {
    fotos: {
      f1: { arquivo: "fotos/f1.jpg", cenario: "Estúdio", descricao: "Estúdio com duas cadeiras e microfones.", linha: "Montamos um estúdio de podcast no estilo que vocês já têm." },
      f2: { arquivo: "fotos/f2.jpg", cenario: "Consultório", descricao: "Consultório com microfone de mesa.", linha: "Gravamos dentro do consultório, sem tirar ninguém da rotina." },
      f3: { arquivo: "fotos/f3.jpg", cenario: "Loja", descricao: "Loja com cenário de vitrine.", linha: "Levamos o estúdio até a loja de vocês." },
    },
  };
}

module.exports = { leads, clientes, posvenda, meta, fotos };
