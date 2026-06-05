"""
Onda C (financeiro) - preenche trips.valor/bonus na Torre cruzando por sheet_lh
com a tabela `cargas` da Cargas PROD (unica fonte real de valor/frete; a
planilha de programacao NAO tem valor). Fill-only (so onde valor e nulo).

Uso: python import_financeiro.py
"""
import urllib.request, urllib.error, json, re

CARGAS_URL = "https://lbpzkdecwraipbjbaajs.supabase.co"
CARGAS_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxicHprZGVjd3JhaXBiamJhYWpzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzMzOTQzMjQsImV4cCI6MjA4ODk3MDMyNH0.h98yhEM1fZZbnU0_265NOe60UqYpfNGacI4nBHUuM58"
TORRE_URL = "https://ocgifdytaqlubuokjkwv.supabase.co"
TORRE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9jZ2lmZHl0YXFsdWJ1b2tqa3d2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODAwNjAzOTYsImV4cCI6MjA5NTYzNjM5Nn0.YjOp5-H-SpsMVAhuRiUrWM_2hu17Im0nR5o5CqfYeuk"

def nn(v):
    if v in (None, "", "-"): return None
    return v

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

def post(rows, batch=300):
    total = 0
    for i in range(0, len(rows), batch):
        chunk = rows[i:i+batch]
        req = urllib.request.Request(f"{TORRE_URL}/rest/v1/trips?on_conflict=id",
            data=json.dumps(chunk, ensure_ascii=False, default=str).encode("utf-8"), method="POST",
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
    cargas = rest_all(CARGAS_URL, CARGAS_KEY, "cargas", "sheet_lh,valor,bonus")
    lh2val = {}
    for c in cargas:
        lh = nn(c.get("sheet_lh"))
        if lh and c.get("valor") is not None:
            lh2val[str(lh).strip()] = (c.get("valor"), c.get("bonus"))
    print(f"Cargas com LH+valor: {len(lh2val)}")

    trips = rest_all(TORRE_URL, TORRE_KEY, "trips",
                     "id,code,window_start,window_end,status,priority,progress_pct,sheet_lh,valor")
    print(f"Torre trips: {len(trips)}")

    out, ja_tinha = [], 0
    for t in trips:
        lh = nn(t.get("sheet_lh"))
        if not lh: continue
        hit = lh2val.get(str(lh).strip())
        if not hit: continue
        if t.get("valor") is not None:
            ja_tinha += 1; continue
        valor, bonus = hit
        out.append({
            "id": t["id"], "code": t["code"],
            "window_start": t["window_start"], "window_end": t["window_end"],
            "status": t["status"], "priority": t.get("priority") or "media",
            "progress_pct": t.get("progress_pct") or 0,
            "valor": valor, "bonus": bonus,
        })
    print(f"Trips a preencher (match por LH, valor nulo): {len(out)} | ja tinham valor: {ja_tinha}")
    if out:
        n = post(out)
        print("RESUMO financeiro:", n)

if __name__ == "__main__":
    main()
