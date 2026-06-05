"""
Onda B - Veiculos. Importa public.vehicles da Cargas PROD para a Torre,
vinculando ao motorista por CPF (linked_driver_cpf -> Torre.drivers.id).
Upsert por placa (UNIQUE). Cargas e a fonte autoritativa de veiculos.

Uso: python import_vehicles.py
"""
import urllib.request, urllib.error, json, re

CARGAS_URL = "https://lbpzkdecwraipbjbaajs.supabase.co"
CARGAS_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxicHprZGVjd3JhaXBiamJhYWpzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzMzOTQzMjQsImV4cCI6MjA4ODk3MDMyNH0.h98yhEM1fZZbnU0_265NOe60UqYpfNGacI4nBHUuM58"
TORRE_URL = "https://ocgifdytaqlubuokjkwv.supabase.co"
TORRE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9jZ2lmZHl0YXFsdWJ1b2tqa3d2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODAwNjAzOTYsImV4cCI6MjA5NTYzNjM5Nn0.YjOp5-H-SpsMVAhuRiUrWM_2hu17Im0nR5o5CqfYeuk"

def digits(s): return re.sub(r"\D","",str(s or ""))
def nn(v):
    if v in (None,"","-"): return None
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

def post(rows, batch=400):
    total=0
    for i in range(0,len(rows),batch):
        chunk=rows[i:i+batch]
        req=urllib.request.Request(f"{TORRE_URL}/rest/v1/vehicles?on_conflict=plate",
            data=json.dumps(chunk,ensure_ascii=False).encode("utf-8"), method="POST",
            headers={"apikey":TORRE_KEY,"Authorization":f"Bearer {TORRE_KEY}",
                     "Content-Type":"application/json",
                     "Prefer":"resolution=merge-duplicates,return=minimal"})
        try:
            r=urllib.request.urlopen(req,timeout=180); total+=len(chunk)
            print(f"  upsert [{i}-{i+len(chunk)}] -> {r.status}")
        except urllib.error.HTTPError as e:
            print(f"  ERRO {e.code}: {e.read().decode()[:400]}"); raise
    return total

def main():
    veh = rest_all(CARGAS_URL, CARGAS_KEY, "vehicles",
        "plate,vehicle_type,plate_role,angellira_status,angellira_status_text,angellira_valid_until,angellira_display_name,angellira_last_seen_at,angellira_checked_at,linked_driver_cpf,source")
    print(f"Cargas vehicles: {len(veh)}")

    drv = rest_all(TORRE_URL, TORRE_KEY, "drivers", "id,cpf")
    cpf2id = {digits(d["cpf"]): d["id"] for d in drv if d.get("cpf") and len(digits(d["cpf"]))==11}
    print(f"Torre drivers c/ cpf: {len(cpf2id)}")

    out, seen, linked = [], set(), 0
    for v in veh:
        plate = nn(v.get("plate"))
        if not plate: continue
        plate = str(plate).upper().strip()
        if plate in seen: continue
        seen.add(plate)
        cpf = digits(v.get("linked_driver_cpf"))
        did = cpf2id.get(cpf) if len(cpf)==11 else None
        if did: linked += 1
        out.append({
            "plate": plate,
            "type": nn(v.get("vehicle_type")),
            "model": nn(v.get("angellira_display_name")),
            "plate_role": nn(v.get("plate_role")),
            "source": "CARGAS_IMPORT",
            "linked_driver_cpf": cpf if len(cpf)==11 else None,
            "driver_id": did,
            "angellira_status": nn(v.get("angellira_status")),
            "angellira_status_text": nn(v.get("angellira_status_text")),
            "angellira_valid_until": nn(v.get("angellira_valid_until")),
            "angellira_display_name": nn(v.get("angellira_display_name")),
            "angellira_last_seen_at": nn(v.get("angellira_last_seen_at")),
            "angellira_checked_at": nn(v.get("angellira_checked_at")),
        })
    print(f"Veiculos unicos: {len(out)} | vinculados a motorista: {linked}")
    n = post(out)
    print("RESUMO upsert vehicles:", n)

if __name__ == "__main__":
    main()
