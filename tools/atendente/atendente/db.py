"""SQLite e a classe Repo. Horários em UTC ISO no banco; "dia" e "mês" em Cuiabá."""
import hashlib
import json
import os
import re
import secrets
import sqlite3
import threading
from datetime import datetime, timedelta, timezone

from scripts import wa_akg

JANELA_REPETIDA = timedelta(seconds=120)

ESQUEMA = """
CREATE TABLE IF NOT EXISTS leads (id TEXT PRIMARY KEY, doc TEXT NOT NULL, situacao TEXT, canal TEXT);
CREATE TABLE IF NOT EXISTS mensagens (
    id INTEGER PRIMARY KEY AUTOINCREMENT, lead_id TEXT NOT NULL, jid TEXT, de_mim INTEGER NOT NULL,
    texto TEXT, tipo TEXT, wa_id TEXT UNIQUE, em TEXT);
CREATE INDEX IF NOT EXISTS ix_msg_lead ON mensagens(lead_id, em);
CREATE TABLE IF NOT EXISTS atendimento (
    id INTEGER PRIMARY KEY AUTOINCREMENT, leadId TEXT, empresa TEXT, em TEXT, mensagemLead TEXT,
    intencao TEXT, acao TEXT, respostaEnviada TEXT, motivoAviso TEXT, humanoRespondeu INTEGER, resultado TEXT);
CREATE INDEX IF NOT EXISTS ix_at_lead ON atendimento(leadId, em);
CREATE TABLE IF NOT EXISTS config (chave TEXT PRIMARY KEY, valor TEXT);
CREATE TABLE IF NOT EXISTS gastos (
    id INTEGER PRIMARY KEY AUTOINCREMENT, modelo TEXT, tokens_in INTEGER, tokens_out INTEGER, usd REAL, em TEXT);
CREATE TABLE IF NOT EXISTS base (id TEXT PRIMARY KEY, doc TEXT NOT NULL, status TEXT);
CREATE TABLE IF NOT EXISTS clientes (id TEXT PRIMARY KEY, doc TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS campanhas (id TEXT PRIMARY KEY, doc TEXT NOT NULL, status TEXT);
CREATE TABLE IF NOT EXISTS prospectos (
    id TEXT PRIMARY KEY, doc TEXT NOT NULL, campanha_id TEXT, estado TEXT, chave_pessoa TEXT);
CREATE INDEX IF NOT EXISTS ix_prosp_campanha ON prospectos(campanha_id, estado);
CREATE INDEX IF NOT EXISTS ix_prosp_chave ON prospectos(chave_pessoa);
CREATE TABLE IF NOT EXISTS cnpj (cnpj TEXT PRIMARY KEY, doc TEXT NOT NULL, cnae TEXT, municipio TEXT, porte TEXT);
CREATE INDEX IF NOT EXISTS ix_cnpj_filtro ON cnpj(cnae, municipio);
CREATE TABLE IF NOT EXISTS contatos_compartilhados (
    chave_hash TEXT PRIMARY KEY, empresas INTEGER NOT NULL, cnaes TEXT, primeira TEXT, ultima TEXT);
CREATE TABLE IF NOT EXISTS lista_sair (hash TEXT PRIMARY KEY, em TEXT);
"""

CHAVE_SAL = "prospeccao_sal"   # sal guardado no banco quando PROSPECCAO_SAL não vem do ambiente

CAMPOS_ATENDIMENTO = ("leadId", "empresa", "em", "mensagemLead", "intencao", "acao",
                      "respostaEnviada", "motivoAviso", "humanoRespondeu", "resultado")


def _dumps(v) -> str:
    return json.dumps(v, ensure_ascii=False)


def _iso(d: datetime) -> str:
    return d.astimezone(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def _agora_utc(d: datetime) -> datetime:
    return d if d.tzinfo else d.replace(tzinfo=timezone.utc)


def _numero_do_jid(jid) -> str:
    return "".join(c for c in str(jid or "").split("@")[0].split(":")[0] if c.isdigit())


def _contato_normalizado(valor) -> str:
    """E-mail: minúsculo e sem espaço. Telefone: 55 + DDD + os 8 últimos dígitos, para o número com e sem o nono
    dígito (conta antiga do WhatsApp) dar o mesmo hash. "" quando não dá para usar."""
    t = str(valor or "").strip().lower()
    if not t:
        return ""
    if "@" in t:
        return t
    d = re.sub(r"\D", "", t).lstrip("0")
    if len(d) in (10, 11):
        d = "55" + d
    if d.startswith("55") and len(d) in (12, 13):
        return d[:4] + d[-8:]
    return d


class Repo:
    def __init__(self, caminho: str, sal: str | None = None):
        self._lock = threading.RLock()
        self._con = sqlite3.connect(caminho, check_same_thread=False)
        self._con.row_factory = sqlite3.Row
        with self._lock:
            self._con.executescript(ESQUEMA)
            self._con.commit()
        self._sal_fixo = sal

    def _sal(self) -> str:
        """Sal do hash da lista de saída: o do construtor, o de PROSPECCAO_SAL ou um aleatório guardado no banco
        na primeira vez (fica no backup). Trocar o sal depois invalida a lista: definir uma vez só."""
        if self._sal_fixo is not None:
            return self._sal_fixo
        amb = os.environ.get("PROSPECCAO_SAL")
        if amb:
            return amb
        with self._lock:
            s = self.config_get(CHAVE_SAL)
            if not s:
                s = secrets.token_hex(16)
                self.config_set(CHAVE_SAL, s)
            return s

    # ---- config
    def config_get(self, chave: str, padrao=None):
        with self._lock:
            r = self._con.execute("SELECT valor FROM config WHERE chave=?", (chave,)).fetchone()
        if r is None:
            return padrao
        try:
            return json.loads(r["valor"])
        except (TypeError, ValueError):
            return padrao

    def config_set(self, chave: str, valor) -> None:
        with self._lock:
            self._con.execute("INSERT INTO config(chave, valor) VALUES(?, ?) "
                              "ON CONFLICT(chave) DO UPDATE SET valor=excluded.valor", (chave, _dumps(valor)))
            self._con.commit()

    # ---- leads
    def lead_get(self, id: str) -> dict | None:
        with self._lock:
            r = self._con.execute("SELECT doc FROM leads WHERE id=?", (str(id),)).fetchone()
        return json.loads(r["doc"]) if r else None

    def lead_put(self, lead: dict) -> None:
        if not lead.get("id"):
            raise ValueError('lead sem "id"')
        with self._lock:
            self._con.execute(
                "INSERT INTO leads(id, doc, situacao, canal) VALUES(?, ?, ?, ?) "
                "ON CONFLICT(id) DO UPDATE SET doc=excluded.doc, situacao=excluded.situacao, canal=excluded.canal",
                (str(lead["id"]), _dumps(lead), lead.get("situacao"), lead.get("canal")))
            self._con.commit()

    def leads_todos(self) -> list[dict]:
        with self._lock:
            rs = self._con.execute("SELECT doc FROM leads ORDER BY id").fetchall()
        return [json.loads(r["doc"]) for r in rs]

    def lead_por_numero(self, numero: str) -> dict | None:
        alvo = wa_akg.numero_whatsapp(numero) or "".join(c for c in str(numero or "") if c.isdigit())
        if not alvo:
            return None
        for l in self.leads_todos():
            if wa_akg.numero_whatsapp(wa_akg.telefone_destino(l)) == alvo:
                return l
            if _numero_do_jid(l.get("jidWa")) == alvo:
                return l
        return None

    def aplicar(self, lead_id: str, data: dict) -> dict:
        with self._lock:
            lead = self.lead_get(lead_id)
            if lead is None:
                raise KeyError(lead_id)
            for k, v in (data or {}).items():
                if isinstance(v, dict) and v.get("__delete__") is True:
                    lead.pop(k, None)
                elif k == "historico" and isinstance(v, list):
                    # só acrescenta: quem trabalhou com uma cópia antiga não apaga o que entrou no meio
                    atual = lead.get("historico") or []
                    lead[k] = atual + [x for x in v if x not in atual]
                else:
                    lead[k] = v
            self.lead_put(lead)
            return lead

    # ---- documentos simples (base e clientes): mesma regra de merge do aplicar dos leads
    @staticmethod
    def _mesclar(doc: dict, data: dict) -> dict:
        for k, v in (data or {}).items():
            if isinstance(v, dict) and v.get("__delete__") is True:
                doc.pop(k, None)
            elif k == "historico" and isinstance(v, list):
                atual = doc.get("historico") or []
                doc[k] = atual + [x for x in v if x not in atual]
            else:
                doc[k] = v
        return doc

    def _doc_get(self, tabela: str, id: str) -> dict | None:
        with self._lock:
            r = self._con.execute(f"SELECT doc FROM {tabela} WHERE id=?", (str(id),)).fetchone()
        return json.loads(r["doc"]) if r else None

    def _doc_todos(self, tabela: str) -> list[dict]:
        with self._lock:
            rs = self._con.execute(f"SELECT doc FROM {tabela} ORDER BY id").fetchall()
        return [json.loads(r["doc"]) for r in rs]

    # ---- base (faixas B e C da Explee, um documento enxuto por empresa)
    def base_get(self, id: str) -> dict | None:
        return self._doc_get("base", id)

    def base_put(self, doc: dict) -> None:
        if not doc.get("id"):
            raise ValueError('documento da base sem "id"')
        with self._lock:
            self._con.execute(
                "INSERT INTO base(id, doc, status) VALUES(?, ?, ?) "
                "ON CONFLICT(id) DO UPDATE SET doc=excluded.doc, status=excluded.status",
                (str(doc["id"]), _dumps(doc), doc.get("status")))
            self._con.commit()

    def base_todos(self) -> list[dict]:
        return self._doc_todos("base")

    def base_aplicar(self, id: str, data: dict) -> dict:
        with self._lock:
            doc = self.base_get(id)
            if doc is None:
                raise KeyError(id)
            self.base_put(self._mesclar(doc, data))
            return doc

    # ---- clientes (pós-venda)
    def cliente_get(self, id: str) -> dict | None:
        return self._doc_get("clientes", id)

    def cliente_put(self, doc: dict) -> None:
        if not doc.get("id"):
            raise ValueError('cliente sem "id"')
        with self._lock:
            self._con.execute("INSERT INTO clientes(id, doc) VALUES(?, ?) ON CONFLICT(id) DO UPDATE SET doc=excluded.doc",
                              (str(doc["id"]), _dumps(doc)))
            self._con.commit()

    def clientes_todos(self) -> list[dict]:
        return self._doc_todos("clientes")

    def cliente_aplicar(self, id: str, data: dict) -> dict:
        with self._lock:
            doc = self.cliente_get(id)
            if doc is None:
                raise KeyError(id)
            self.cliente_put(self._mesclar(doc, data))
            return doc

    # ---- prospecção: campanhas e prospectos
    def campanha_get(self, id: str) -> dict | None:
        return self._doc_get("campanhas", id)

    def campanha_put(self, doc: dict) -> None:
        if not doc.get("id"):
            raise ValueError('campanha sem "id"')
        with self._lock:
            self._con.execute(
                "INSERT INTO campanhas(id, doc, status) VALUES(?, ?, ?) "
                "ON CONFLICT(id) DO UPDATE SET doc=excluded.doc, status=excluded.status",
                (str(doc["id"]), _dumps(doc), doc.get("status")))
            self._con.commit()

    def campanhas(self) -> list[dict]:
        return self._doc_todos("campanhas")

    def prospecto_get(self, id: str) -> dict | None:
        return self._doc_get("prospectos", id)

    def prospecto_put(self, doc: dict) -> None:
        if not doc.get("id"):
            raise ValueError('prospecto sem "id"')
        with self._lock:
            self._con.execute(
                "INSERT INTO prospectos(id, doc, campanha_id, estado, chave_pessoa) VALUES(?, ?, ?, ?, ?) "
                "ON CONFLICT(id) DO UPDATE SET doc=excluded.doc, campanha_id=excluded.campanha_id, "
                "estado=excluded.estado, chave_pessoa=excluded.chave_pessoa",
                (str(doc["id"]), _dumps(doc), doc.get("campanhaId"), doc.get("estado"), doc.get("chavePessoa")))
            self._con.commit()

    def prospectos(self, campanha_id: str | None = None, estado: str | None = None) -> list[dict]:
        """Prospectos de uma campanha (ou de todas, com None), opcionalmente só de um estado."""
        sql, args, onde = "SELECT doc FROM prospectos", [], []
        if campanha_id is not None:
            onde.append("campanha_id=?")
            args.append(str(campanha_id))
        if estado is not None:
            onde.append("estado=?")
            args.append(estado)
        if onde:
            sql += " WHERE " + " AND ".join(onde)
        with self._lock:
            rs = self._con.execute(sql + " ORDER BY id", args).fetchall()
        return [json.loads(r["doc"]) for r in rs]

    def prospectos_por_chave(self, chave_pessoa: str) -> list[dict]:
        with self._lock:
            rs = self._con.execute("SELECT doc FROM prospectos WHERE chave_pessoa=? ORDER BY id",
                                   (str(chave_pessoa),)).fetchall()
        return [json.loads(r["doc"]) for r in rs]

    # ---- prospecção: CNPJ aberto de MT (um documento por estabelecimento)
    def cnpj_put(self, doc: dict) -> None:
        if not doc.get("cnpj"):
            raise ValueError('estabelecimento sem "cnpj"')
        with self._lock:
            self._con.execute(
                "INSERT INTO cnpj(cnpj, doc, cnae, municipio, porte) VALUES(?, ?, ?, ?, ?) "
                "ON CONFLICT(cnpj) DO UPDATE SET doc=excluded.doc, cnae=excluded.cnae, "
                "municipio=excluded.municipio, porte=excluded.porte",
                (str(doc["cnpj"]), _dumps(doc), doc.get("cnae"), doc.get("municipio"), doc.get("porte")))
            self._con.commit()

    def cnpj_get(self, cnpj: str) -> dict | None:
        with self._lock:
            r = self._con.execute("SELECT doc FROM cnpj WHERE cnpj=?", (str(cnpj),)).fetchone()
        return json.loads(r["doc"]) if r else None

    def cnpjs(self, filtro: dict | None = None, limite: int | None = None, **kw) -> list[dict]:
        """Filtro (dict ou palavras-chave): cnae/cnaes, municipio/municipios, porte; valor único ou lista."""
        f = dict(filtro or {}, **kw)
        sql, args, onde = "SELECT doc FROM cnpj", [], []
        for coluna, nomes in (("cnae", ("cnae", "cnaes")), ("municipio", ("municipio", "municipios")),
                              ("porte", ("porte", "portes"))):
            valores = []
            for n in nomes:
                v = f.get(n)
                if v is None:
                    continue
                valores += [str(x) for x in v] if isinstance(v, (list, tuple, set)) else [str(v)]
            if valores:
                onde.append(f"{coluna} IN ({','.join('?' * len(valores))})")
                args += valores
        if onde:
            sql += " WHERE " + " AND ".join(onde)
        sql += " ORDER BY cnpj"
        if limite is not None:
            sql += " LIMIT ?"
            args.append(int(limite))
        with self._lock:
            rs = self._con.execute(sql, args).fetchall()
        return [json.loads(r["doc"]) for r in rs]

    # ---- prospecção: contagem de contatos repetidos no cadastro (filtro de contabilidade; só hash)
    def compartilhado_set(self, chave_hash: str, empresas: int, cnaes: list, primeira: str, ultima: str) -> None:
        with self._lock:
            self._con.execute(
                "INSERT INTO contatos_compartilhados(chave_hash, empresas, cnaes, primeira, ultima) VALUES(?,?,?,?,?) "
                "ON CONFLICT(chave_hash) DO UPDATE SET empresas=excluded.empresas, cnaes=excluded.cnaes, "
                "primeira=excluded.primeira, ultima=excluded.ultima",
                (str(chave_hash), int(empresas), _dumps(list(cnaes or [])), primeira, ultima))
            self._con.commit()

    def compartilhado_get(self, chave_hash: str) -> dict | None:
        with self._lock:
            r = self._con.execute("SELECT * FROM contatos_compartilhados WHERE chave_hash=?",
                                  (str(chave_hash),)).fetchone()
        if r is None:
            return None
        d = dict(r)
        d["cnaes"] = json.loads(d["cnaes"]) if d.get("cnaes") else []
        return d

    # ---- prospecção: quem pediu para sair (lista permanente, só hash com sal)
    def hash_contato(self, valor) -> str:
        """SHA-256 com o sal do ambiente do telefone ou e-mail normalizado. "" quando o valor é vazio."""
        n = _contato_normalizado(valor)
        return hashlib.sha256((self._sal() + "|" + n).encode("utf-8")).hexdigest() if n else ""

    def sair_add(self, telefone_ou_email, agora: datetime | None = None) -> None:
        h = self.hash_contato(telefone_ou_email)
        if not h:
            return
        em = _iso(agora or datetime.now(timezone.utc))
        with self._lock:
            self._con.execute("INSERT OR IGNORE INTO lista_sair(hash, em) VALUES(?, ?)", (h, em))
            self._con.commit()

    def sair_tem(self, telefone_ou_email) -> bool:
        h = self.hash_contato(telefone_ou_email)
        if not h:
            return False
        with self._lock:
            return self._con.execute("SELECT 1 FROM lista_sair WHERE hash=?", (h,)).fetchone() is not None

    # ---- mensagens
    def msg_add(self, lead_id: str, jid: str, de_mim: bool, texto: str, tipo: str, wa_id: str | None, em: str) -> bool:
        with self._lock:
            if wa_id and self._con.execute("SELECT 1 FROM mensagens WHERE wa_id=?", (wa_id,)).fetchone():
                return False
            t0 = wa_akg._data(em)
            if t0 is not None:
                rs = self._con.execute("SELECT em FROM mensagens WHERE lead_id=? AND de_mim=? AND texto=?",
                                       (lead_id, 1 if de_mim else 0, texto)).fetchall()
                for r in rs:
                    t1 = wa_akg._data(r["em"])
                    if t1 is not None and abs(t1 - t0) <= JANELA_REPETIDA:
                        return False
            self._con.execute(
                "INSERT INTO mensagens(lead_id, jid, de_mim, texto, tipo, wa_id, em) VALUES(?,?,?,?,?,?,?)",
                (lead_id, jid, 1 if de_mim else 0, texto, tipo, wa_id or None, em))
            self._con.commit()
        return True

    def msgs_do_lead(self, lead_id: str, limite: int = 50) -> list[dict]:
        with self._lock:
            rs = self._con.execute(
                "SELECT * FROM (SELECT * FROM mensagens WHERE lead_id=? ORDER BY em DESC, id DESC LIMIT ?) "
                "ORDER BY em ASC, id ASC", (lead_id, limite)).fetchall()
        out = []
        for r in rs:
            d = dict(r)
            d["de_mim"] = bool(d["de_mim"])
            out.append(d)
        return out

    # ---- atendimento
    def atendimento_add(self, **campos) -> int:
        desconhecidos = set(campos) - set(CAMPOS_ATENDIMENTO)
        if desconhecidos:
            raise TypeError(f"campos desconhecidos: {sorted(desconhecidos)}")
        if "humanoRespondeu" in campos and campos["humanoRespondeu"] is not None:
            campos["humanoRespondeu"] = 1 if campos["humanoRespondeu"] else 0
        cols = list(campos)
        with self._lock:
            cur = self._con.execute(
                f"INSERT INTO atendimento({','.join(cols)}) VALUES({','.join('?' * len(cols))})",
                [campos[c] for c in cols])
            self._con.commit()
            return cur.lastrowid

    def atendimento_lista(self, limite: int = 100, lead_id: str | None = None) -> list[dict]:
        sql, args = "SELECT * FROM atendimento", []
        if lead_id is not None:
            sql += " WHERE leadId=?"
            args.append(lead_id)
        sql += " ORDER BY em DESC, id DESC LIMIT ?"
        args.append(limite)
        with self._lock:
            rs = self._con.execute(sql, args).fetchall()
        out = []
        for r in rs:
            d = dict(r)
            if d.get("humanoRespondeu") is not None:
                d["humanoRespondeu"] = bool(d["humanoRespondeu"])
            out.append(d)
        return out

    # ---- gastos e limites
    def gasto_add(self, modelo: str, tokens_in: int, tokens_out: int, usd: float, em: str) -> None:
        with self._lock:
            self._con.execute("INSERT INTO gastos(modelo, tokens_in, tokens_out, usd, em) VALUES(?,?,?,?,?)",
                              (modelo, int(tokens_in), int(tokens_out), float(usd), em))
            self._con.commit()

    def gasto_mes(self, agora: datetime) -> float:
        ref = _agora_utc(agora).astimezone(wa_akg.FUSO)
        with self._lock:
            rs = self._con.execute("SELECT usd, em FROM gastos").fetchall()
        total = 0.0
        for r in rs:
            t = wa_akg._data(r["em"])
            if t is None:
                continue
            t = t.astimezone(wa_akg.FUSO)
            if (t.year, t.month) == (ref.year, ref.month):
                total += r["usd"] or 0.0
        return total

    def auto_respostas_hoje(self, agora: datetime) -> int:
        ref = _agora_utc(agora).astimezone(wa_akg.FUSO).date()
        with self._lock:
            rs = self._con.execute("SELECT em FROM atendimento WHERE acao='sozinha'").fetchall()
        n = 0
        for r in rs:
            t = wa_akg._data(r["em"])
            if t is not None and t.astimezone(wa_akg.FUSO).date() == ref:
                n += 1
        return n

    def ultima_auto_resposta(self, lead_id: str) -> datetime | None:
        with self._lock:
            rs = self._con.execute("SELECT em FROM atendimento WHERE leadId=? AND acao='sozinha'",
                                   (lead_id,)).fetchall()
        datas = [d for d in (wa_akg._data(r["em"]) for r in rs) if d is not None]
        return max(datas) if datas else None

    # ---- backup
    def backup(self, destino: str) -> None:
        dest = sqlite3.connect(destino)
        try:
            with self._lock:
                self._con.backup(dest)
        finally:
            dest.close()
