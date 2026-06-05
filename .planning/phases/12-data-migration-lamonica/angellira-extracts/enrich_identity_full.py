"""
Onda A - Identidade plena dos motoristas na Torre.

Fontes:
  1. nome_motoristas.json  (xlsx MOTORISTAS) -> chave shopee driver_id
  2. motoristas_historico  (Cargas TEST, leitura anon) -> chave CPF (Angellira)

Estrategia (fill-only, nunca sobrescreve valor existente):
  - recupera CPF dos drivers sem CPF: via xlsx[shopee] e, se faltar, via nome->MH
  - enriquece cnh/cnh_validade/cnh_categoria/rg/nascimento/phone/cidade/estado/
    driver_kind/angellira_valid_until a partir de MH[cpf] (autoritativo) e xlsx
  - upsert merge por id (inclui code/name NOT NULL)

Uso: python enrich_identity_full.py
"""
import urllib.request, urllib.error, json, os, re, unicodedata

HERE = os.path.dirname(os.path.abspath(__file__))
JSON_IN = os.path.join(HERE, "nome_motoristas.json")
TEST_URL = "https://oklksqvrexiypectfsod.supabase.co"
TEST_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9rbGtzcXZyZXhpeXBlY3Rmc29kIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzgxODA5MjgsImV4cCI6MjA5Mzc1NjkyOH0.gUgOjdrYQH5wDoDtXY8tPqAiHXZtIj3M1aSSYchm2P0"
TORRE_URL = "https://ocgifdytaqlubuokjkwv.supabase.co"
TORRE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9jZ2lmZHl0YXFsdWJ1b2tqa3d2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODAwNjAzOTYsImV4cCI6MjA5NTYzNjM5Nn0.YjOp5-H-SpsMVAhuRiUrWM_2hu17Im0nR5o5CqfYeuk"

def digits(s): return re.sub(r"\D", "", str(s or ""))
def norm_id(v):
    s = digits(v); return s.lstrip("0") or s or None
def normname(s):
    if not s: return None
    s = unicodedata.normalize("NFKD", str(s)).encode("ascii","ignore").decode()
    return re.sub(r"\s+"," ", s.upper().strip()) or None
def nn(v):
    if v in (None,"","-"): return None
    return v
def cleanphone(v):
    v = nn(v)
    return v.lstrip("'").strip() if v else None

def rest_all(url, key, table, select):
    rows, start, page = [], 0, 1000
    while True:
        req = urllib.request.Request(f"{url}/rest/v1/{table}?select={select}",
            headers={"apikey": key, "Authorization": f"Bearer {key}", "Range": f"{start}-{start+page-1}"})
        b = json.loads(urllib.request.urlopen(req, timeout=90).read())
        rows += b
        if len(b) < page: break
        start += page
    return rows

def post(rows, batch=400):
    total = 0
    for i in range(0, len(rows), batch):
        chunk = rows[i:i+batch]
        req = urllib.request.Request(f"{TORRE_URL}/rest/v1/drivers?on_conflict=id",
            data=json.dumps(chunk, ensure_ascii=False).encode("utf-8"), method="POST",
            headers={"apikey": TORRE_KEY, "Authorization": f"Bearer {TORRE_KEY}",
                     "Content-Type": "application/json",
                     "Prefer": "resolution=merge-duplicates,return=minimal"})
        try:
            r = urllib.request.urlopen(req, timeout=180); total += len(chunk)
            print(f"  upsert [{i}-{i+len(chunk)}] -> {r.status}")
        except urllib.error.HTTPError as e:
            print(f"  ERRO {e.code}: {e.read().decode()[:400]}"); raise
    return total

def main():
    xlsx = json.load(open(JSON_IN, encoding="utf-8"))
    xby_shopee = {r["driver_id"]: r for r in xlsx if r.get("driver_id")}
    print(f"xlsx MOTORISTAS: {len(xlsx)} (por shopee: {len(xby_shopee)})")

    mh = rest_all(TEST_URL, TEST_KEY, "motoristas_historico",
                  "cpf,nome,cnh,cnh_validade,cnh_categoria,rg,nascimento,telefone,cidade,estado,driver_kind,angellira_limit_date")
    mh_by_cpf = {digits(m["cpf"]): m for m in mh if len(digits(m.get("cpf")))==11}
    mh_by_name = {}
    for m in mh:
        nm = normname(m.get("nome"))
        if nm and nm not in mh_by_name: mh_by_name[nm] = m
    print(f"MH: {len(mh)} (cpf {len(mh_by_cpf)}, nome {len(mh_by_name)})")

    drv = rest_all(TORRE_URL, TORRE_KEY, "drivers",
        "id,code,name,cpf,cnh,cnh_validade,cnh_categoria,rg,nascimento,phone,cidade,estado,driver_kind,angellira_valid_until,shopee_driver_id")
    print(f"Torre drivers: {len(drv)}")

    FIELDS = ["cpf","cnh","cnh_validade","cnh_categoria","rg","nascimento","phone",
              "cidade","estado","driver_kind","angellira_valid_until"]
    stats = {f:0 for f in FIELDS}
    cpf_recuperado_xlsx = cpf_recuperado_nome = 0
    out = []
    # CPF -> id ja em uso (evita violar uq_drivers_cpf e merge errado de homonimos)
    used_cpf = {digits(d["cpf"]): d["id"] for d in drv if d.get("cpf") and len(digits(d["cpf"]))==11}
    cpf_colisao = []

    for d in drv:
        shopee = norm_id(d.get("shopee_driver_id"))
        x = xby_shopee.get(shopee) if shopee else None
        final = {}

        # 1) CPF
        cpf = digits(d.get("cpf")) if d.get("cpf") else None
        if not cpf and x and x.get("cpf"):
            cpf = digits(x["cpf"]); cpf_recuperado_xlsx += 1
        if not cpf:
            m = mh_by_name.get(normname(d.get("name")))
            if m and len(digits(m.get("cpf")))==11:
                cpf = digits(m["cpf"]); cpf_recuperado_nome += 1
        if cpf and len(cpf)==11 and not d.get("cpf"):
            owner = used_cpf.get(cpf)
            if owner and owner != d["id"]:
                cpf_colisao.append({"id": d["id"], "name": d.get("name"),
                                    "shopee": shopee, "cpf": cpf, "ja_em": owner})
            else:
                final["cpf"] = cpf
                used_cpf[cpf] = d["id"]

        m = mh_by_cpf.get(cpf) if cpf else None

        def fill(col, *cands):
            if d.get(col): return                      # ja tem -> nao toca
            for c in cands:
                c = nn(c)
                if c: final[col] = c; return

        fill("cnh", (m or {}).get("cnh"), (x or {}).get("cnh"))
        fill("cnh_validade", (m or {}).get("cnh_validade"), (x or {}).get("cnh_exp"))
        fill("cnh_categoria", (m or {}).get("cnh_categoria"), (x or {}).get("cnh_cat"))
        fill("rg", (m or {}).get("rg"))
        fill("nascimento", (m or {}).get("nascimento"), (x or {}).get("dob"))
        fill("phone", (m or {}).get("telefone"), cleanphone((x or {}).get("phone")))
        fill("cidade", (m or {}).get("cidade"))
        fill("estado", (m or {}).get("estado"))
        fill("driver_kind", (m or {}).get("driver_kind"))
        fill("angellira_valid_until", (m or {}).get("angellira_limit_date"))

        if final:
            for k in final:
                if k in stats: stats[k]+=1
            # PostgREST exige chaves uniformes em todo o batch: inclui TODOS os
            # campos (novo valor OU valor existente -> no-op, nunca clobber).
            row = {"id": d["id"], "code": d["code"], "name": d["name"]}
            for f in FIELDS:
                row[f] = final[f] if f in final else (nn(d.get(f)))
            out.append(row)

    print(f"\nDrivers a atualizar: {len(out)}")
    print(f"CPF recuperado -> xlsx:{cpf_recuperado_xlsx} nome/MH:{cpf_recuperado_nome}")
    print(f"CPF NAO atribuido (colisao/duplicado): {len(cpf_colisao)}")
    if cpf_colisao:
        json.dump(cpf_colisao, open(os.path.join(HERE,"cpf_colisoes.json"),"w",encoding="utf-8"),
                  ensure_ascii=False, indent=1)
        print("  -> detalhe em cpf_colisoes.json (possiveis duplicados/homonimos p/ dedup)")
    print("Campos preenchidos:", json.dumps(stats, ensure_ascii=False))
    if out:
        n = post(out)
        print("RESUMO upsert:", n)

if __name__ == "__main__":
    main()
