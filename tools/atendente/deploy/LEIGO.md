# Passo a passo: colocar o atendente no ar (para quem não é de tecnologia)

Regras de ouro:
- Você só vai **copiar e colar** comandos. Cole, aperte ENTER e leia a resposta.
- Quando o computador pedir uma senha ou chave e **nada aparecer na tela, é normal**. Cole ou digite mesmo assim e aperte ENTER.
- Se aparecer **PAROU:** em algum passo, nada foi estragado. Leia a frase, resolva e rode o mesmo comando de novo. Os scripts podem ser rodados quantas vezes quiser.
- Nunca mande senhas ou chaves por e-mail, grupo ou chat público.

## Antes de começar: avise o Claude

**Antes de colar qualquer comando, me diga "vou instalar".** Eu paro o lado que hoje envia as mensagens e entrego o `leads.json` atualizado. Sem isso, dois sistemas escreveriam ao mesmo tempo nos mesmos leads (e o mesmo lead poderia receber duas mensagens). Só comece depois que eu responder que parei.

## Em caso de emergência: desligar tudo

Cole na VPS:

```
docker compose -f /opt/atendente-src/tools/atendente/docker-compose.yml stop
```

Isso para o atendente na hora: nada sai e nada é respondido. Os dados ficam guardados. Para religar:

```
docker compose -f /opt/atendente-src/tools/atendente/docker-compose.yml start
```

(Dentro da tela, o botão **Parar tudo** também trava os envios.)

---

## Passo 1. Entrar na VPS

1. Abra o terminal (Windows: "PowerShell"; Mac: "Terminal").
2. Digite `ssh root@187.102.244.188` e aperte ENTER.
3. Se perguntar "Are you sure you want to continue connecting", digite `yes`.
4. Digite a senha da VPS (não aparece na tela) e aperte ENTER.
5. **O que esperar:** uma tela de boas-vindas do Ubuntu e uma linha terminando em `#`.
6. **Se der erro:** confira a senha. Se disser "Connection timed out", confira a internet e se a VPS está ligada no painel do provedor.

## Passo 2. F0, deixar a VPS mais segura

1. Baixe o código (só na primeira vez):
   ```
   apt-get install -y git && git clone https://github.com/mzinhoww-svg/teste.git /opt/atendente-src
   ```
   Se disser que a pasta já existe, tudo bem, siga em frente.
2. Rode o script de segurança:
   ```
   bash /opt/atendente-src/tools/atendente/deploy/endurecer-vps.sh
   ```
3. **O que esperar:** ele instala proteções, mostra a lista de portas abertas do firewall (só a porta do SSH, normalmente 22, mais 80 e 443) e termina com "VPS endurecida".
4. Quando perguntar sobre a **chave SSH**, aperte **ENTER** para pular. É opcional, e pular não muda nada no seu acesso.
5. **Se der erro:** leia a linha "PAROU" e me mande a tela.

Também nesta etapa (com a ajuda de quem cuida do sistema): trocar a senha de root, trocar a senha e a **chave do WA-AKG** (a antiga foi exposta) e definir o teto de US$ 5 por mês na própria chave do OpenRouter.

## Passo 3. Preparar o arquivo de leads (opcional)

O arquivo de leads (`leads.json`) é o que eu entrego depois que você disser "vou instalar". Ele precisa estar na VPS com o nome `/root/leads.json`. Peça ajuda para copiá-lo. Se não tiver o arquivo agora, pode seguir: o instalador avisa que o atendente ficou **sem leads** e, para importar depois, basta copiar o arquivo e rodar o instalador de novo (na pergunta sobre manter o que já existe, aperte ENTER).

## Passo 4. Instalar o atendente

1. Cole:
   ```
   bash /opt/atendente-src/tools/atendente/deploy/instalar-atendente.sh
   ```
2. Ele vai perguntar, uma de cada vez (o que você digitar não aparece):
   - a **chave do WA-AKG** (a nova);
   - o **nome da sessão** do WhatsApp no WA-AKG;
   - a **chave do OpenRouter**;
   - **nome e senha** de cada pessoa que vai entrar na tela (mínimo 8 caracteres, sem espaço nem os sinais `, : # $ ' " \`);
   - os **números da equipe** que recebem os avisos (com 55 e DDD, só números, separados por vírgula).
3. **O que esperar:** 8 etapas numeradas, cada uma terminando com "ok". Na primeira vez a etapa 4 demora alguns minutos. No fim aparece **INSTALADO** e o aviso de que o atendente está em **ESPERA** (veja o Passo 6). Se aparecer **ERRO: nenhum lead foi importado**, não ligue nada: me mande a tela.
4. **Se der erro:** "PAROU" diz o motivo. Casos comuns:
   - "não achei a rede wa-akg_default": ligue o WA-AKG com `cd /root/WA-AKG && docker compose up -d` e rode de novo.
   - "o Caddy NÃO aprovou": o script já devolveu a configuração antiga; o site segue como estava. Me mande a mensagem.
   - "o WA-AKG não aceitou a consulta": a chave ou o nome da sessão estão errados. Rode de novo e digite com cuidado (escolha "n" na pergunta de manter o que já existe).

## Passo 5. Teste de saúde

Cole:

```
curl http://127.0.0.1:8088/saude
```

**O que esperar:** `{"ok": true}`.
**Se der erro:** veja os últimos registros com
`docker compose -f /opt/atendente-src/tools/atendente/docker-compose.yml logs --tail 50` e me mande a tela.

## Passo 6. Abrir a tela

1. No navegador, abra `https://wa.reiners.agency/central/`.
2. Entre com o nome e a senha que você cadastrou no Passo 4.
3. **O que esperar:** o painel com as colunas e, no alto, os botões **Ligar atendente** e **Parar tudo**.

### Importante: o atendente nasce em ESPERA

O atendente está instalado e em **ESPERA**. Ele só começa a responder e enviar quando você clicar em **Ligar atendente** no painel (`central.reiners.agency` ou `wa.reiners.agency/central/`), **depois que o Claude confirmar que parou o lado dele**. **Não clique antes.** Em espera ele não envia nem responde nada sozinho; só avisa a equipe.

## Passo 7. Criar o endereço `central` na Vercel (DNS)

1. Entre em vercel.com e abra **Domains**, depois o domínio `reiners.agency`.
2. Abra **DNS Records** e clique em **Add**.
3. Preencha:
   - **Name:** `central`
   - **Type:** `A`
   - **Value:** `187.102.244.188`
   - **TTL:** deixe o padrão
4. Salve e espere de 1 a 10 minutos.
5. **O que esperar:** `https://central.reiners.agency` abre a mesma tela (o cadeado de segurança aparece sozinho, pode levar mais um minuto).
6. **Se der erro:** se o navegador reclamar do certificado, espere 5 minutos e recarregue. Se persistir, confira se o valor do registro é exatamente `187.102.244.188`. Enquanto isso, o endereço do Passo 6 funciona.

## Atualizar para uma versão nova

```
bash /opt/atendente-src/tools/atendente/deploy/atualizar.sh
```

**O que esperar:** termina com "PRONTO: atendente atualizado e respondendo". Se a versão nova falhar, o script volta sozinho para a anterior e avisa. Atualizar não liga o atendente: quem liga é você, no botão **Ligar atendente**.
