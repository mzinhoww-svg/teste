"""`python -m atendente`: monta tudo a partir das variáveis de ambiente e sobe o serviço."""
import logging
import os
import signal
import sys
import threading

LOG = logging.getLogger("atendente")

OBRIGATORIAS = {
    "WEBHOOK_SEGREDO": "o segredo que assina os avisos do WhatsApp (webhook)",
    "SEGREDO_SESSAO": "o segredo que assina o login da tela",
    "USUARIOS": "os logins da tela, no formato nome:senha,nome:senha",
}


def url_api(url: str) -> str:
    """O cliente do WA-AKG chama /sessions, /scheduler/... sem prefixo: o /api tem de vir no endereço base."""
    url = (url or "").strip().rstrip("/")
    if url and not url.endswith("/api"):
        url += "/api"
    return url


def montar_wa(amb: dict, transporte=None):
    from scripts import wa_akg
    extra = {"transporte": transporte} if transporte else {}
    return wa_akg.WaAkgCliente(url_api(amb["wa_url"]), amb["wa_chave"], amb["wa_sessao"], **extra)


def semear_config(repo) -> None:
    """Primeira subida: instalado e esperando a liberação (nada responde nem envia até ligar na tela). Só semeia o que falta."""
    for chave, valor in (("status", "aguardando"), ("auto_resposta", False), ("por_lote", 3), ("limite_dia", 12)):
        if repo.config_get(chave) is None:
            repo.config_set(chave, valor)


def ler_usuarios(bruto: str) -> dict:
    usuarios = {}
    for parte in (bruto or "").split(","):
        if not parte.strip():
            continue
        nome, sep, senha = parte.strip().partition(":")
        if not sep or not nome.strip() or not senha:
            raise ValueError("USUARIOS fora do formato nome:senha,nome:senha")
        usuarios[nome.strip()] = senha
    if not usuarios:
        raise ValueError("USUARIOS sem nenhum login (formato nome:senha,nome:senha)")
    return usuarios


def ler_ambiente(env) -> dict:
    """Valida e normaliza o ambiente. Levanta SystemExit com mensagem em português se faltar algo essencial."""
    faltam = [f"  - {k}: {desc}" for k, desc in OBRIGATORIAS.items() if not (env.get(k) or "").strip()]
    if faltam:
        raise SystemExit("O atendente não pode iniciar: faltam variáveis no arquivo .env:\n" + "\n".join(faltam))
    try:
        usuarios = ler_usuarios(env["USUARIOS"])
    except ValueError as e:
        raise SystemExit(f"O atendente não pode iniciar: {e}.")
    try:
        porta = int((env.get("PORTA") or "8088").strip())
    except ValueError:
        raise SystemExit("O atendente não pode iniciar: PORTA precisa ser um número.")
    return {
        "db_caminho": (env.get("DB_CAMINHO") or "/data/atendente.db").strip(),
        "conhecimento_caminho": (env.get("CONHECIMENTO_CAMINHO") or "").strip(),
        "wa_url": (env.get("WA_AKG_URL") or "").strip(),
        "wa_sessao": (env.get("WA_AKG_SESSION") or "").strip(),
        "wa_chave": (env.get("WA_AKG_KEY") or "").strip(),
        "openrouter_chave": (env.get("OPENROUTER_API_KEY") or "").strip(),
        "webhook_segredo": env["WEBHOOK_SEGREDO"].strip(),
        "segredo_sessao": env["SEGREDO_SESSAO"].strip(),
        "usuarios": usuarios,
        "avisar_numeros": [n.strip() for n in (env.get("AVISAR_NUMEROS") or "").split(",") if n.strip()],
        "fotos_url": (env.get("FOTOS_URL") or "").strip(),
        "porta": porta,
        "host": (env.get("HOST") or "127.0.0.1").strip(),
    }


def main(env=None) -> None:
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(name)s %(levelname)s %(message)s")
    amb = ler_ambiente(os.environ if env is None else env)

    # imports tardios: o módulo sobe mesmo enquanto outras partes ainda são escritas, e a checagem acima vem antes
    from scripts import wa_akg
    from . import servidor
    from .avisos import Avisador
    from .db import Repo
    from .ia import MODELO_PADRAO, OpenRouter
    from .nucleo import Atendente
    from .trabalhos import Trabalhos

    pasta = os.path.dirname(amb["db_caminho"])
    if pasta:
        os.makedirs(pasta, exist_ok=True)
    repo = Repo(amb["db_caminho"])
    semear_config(repo)

    conhecimento = ""
    if amb["conhecimento_caminho"]:
        try:
            with open(amb["conhecimento_caminho"], encoding="utf-8") as fh:
                conhecimento = fh.read()
        except OSError:
            LOG.warning("Não consegui ler CONHECIMENTO_CAMINHO; a IA só responde sem base de conhecimento.")
    else:
        LOG.warning("CONHECIMENTO_CAMINHO não definido; a IA responde sem base de conhecimento.")

    if not (amb["wa_url"] and amb["wa_sessao"] and amb["wa_chave"]):
        LOG.warning("WA_AKG_URL, WA_AKG_SESSION ou WA_AKG_KEY faltando: o envio pelo WhatsApp não vai funcionar.")
    wa = montar_wa(amb)

    transporte = None
    if not amb["openrouter_chave"]:
        LOG.warning("OPENROUTER_API_KEY não definida: a IA fica indisponível e todo caso vira aviso à equipe.")

        def transporte(*_a, **_k):
            raise RuntimeError("sem chave do OpenRouter")
    modelo = repo.config_get("modelo", MODELO_PADRAO)
    teto = repo.config_get("teto_usd_mes", servidor.PADRAO_CONFIG["teto_usd_mes"])
    ia = OpenRouter(amb["openrouter_chave"], repo, conhecimento, modelo=modelo, teto_usd=teto, transporte=transporte)

    def aplicar_config(config: dict) -> None:
        ia.modelo = config["modelo"]
        ia.teto_usd = float(config["teto_usd_mes"])

    avisador = Avisador(wa, amb["avisar_numeros"], repo)
    atendente = Atendente(repo, wa, ia, avisador, fotos_url=amb["fotos_url"])
    base = pasta or "."
    trabalhos = Trabalhos(repo, wa, atendente, avisador, {
        "BACKUP_DIR": os.path.join(base, "backups"), "SAIDA_DIR": os.path.join(base, "saida"),
        "FOTOS_URL": amb["fotos_url"]})

    cfg = {"webhook_segredo": amb["webhook_segredo"], "segredo_sessao": amb["segredo_sessao"],
           "usuarios": amb["usuarios"], "ao_mudar_config": aplicar_config, "fotos_url": amb["fotos_url"]}
    srv = servidor.criar_servidor(repo, atendente, wa, cfg, amb["host"], amb["porta"])
    trabalhos.iniciar()

    parar = threading.Event()
    for sinal in (signal.SIGINT, signal.SIGTERM):
        signal.signal(sinal, lambda *_: parar.set())
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    LOG.info("Atendente no ar em %s:%s", amb["host"], amb["porta"])
    try:
        parar.wait()
    finally:
        LOG.info("Encerrando...")
        srv.shutdown()
        trabalhos.parar()


if __name__ == "__main__":
    try:
        main()
    except SystemExit as e:
        if isinstance(e.code, str):
            print(e.code, file=sys.stderr)
            sys.exit(1)
        raise
