"""
Importa as 2 abas restantes do painel GAS (1vywBfU) p/ a Torre:
  - LogObservacoes -> trips.morosidade_horas (PATCH) + observações -> trip_events
  - HistoricoDiario -> trip_daily_km (upsert por trip_code+dia)
Chave trip = uuid.uuid5(NAMESPACE_DNS, 'carrega|'+codViagem) (igual aos outros syncs).

Uso: python import_log_e_kmdiario.py
"""
import urllib.request, urllib.error, json, csv, io, uuid, re

SHEET='1vywBfUJPIA2uEHYaz-WD5xEmNP24n8maMZ1XmN_2VUs'
TORRE_URL='https://ocgifdytaqlubuokjkwv.supabase.co'
TORRE_KEY='eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9jZ2lmZHl0YXFsdWJ1b2tqa3d2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODAwNjAzOTYsImV4cCI6MjA5NTYzNjM5Nn0.YjOp5-H-SpsMVAhuRiUrWM_2hu17Im0nR5o5CqfYeuk'
NS=uuid.NAMESPACE_DNS

def gviz(tab):
    url=f'https://docs.google.com/spreadsheets/d/{SHEET}/gviz/tq?tqx=out:csv&sheet={tab}'
    return list(csv.reader(io.StringIO(urllib.request.urlopen(url,timeout=300).read().decode('utf-8','replace'))))
def tid(cod): return str(uuid.uuid5(NS,'carrega|'+str(cod).strip()))
def nn(v):
    v=(v or '').strip(); return v or None
def col(header,*names):
    H=[h.strip().upper() for h in header]
    for n in names:
        if n.upper() in H: return H.index(n.upper())
    return -1
def fnum(v):
    v=(v or '').strip()
    if not v: return None
    try: x=float(v.replace(',','.')); return x if x==x else None
    except: return None
def kmnum(v):
    if not v: return None
    n=re.sub(r'[^\d,.-]','',str(v)).replace('.','').replace(',','.')
    try: x=float(n); return x if x==x else None
    except: return None
def diaISO(v):
    m=re.match(r'(\d{2})/(\d{2})/(\d{4})',(v or '').strip())
    return f'{m.group(3)}-{m.group(2)}-{m.group(1)}' if m else None

def rest_ids(table):
    ids=set(); start=0; page=1000
    while True:
        req=urllib.request.Request(f'{TORRE_URL}/rest/v1/{table}?select=id',
            headers={'apikey':TORRE_KEY,'Authorization':f'Bearer {TORRE_KEY}','Range':f'{start}-{start+page-1}'})
        b=json.loads(urllib.request.urlopen(req,timeout=120).read())
        for r in b: ids.add(r['id'])
        if len(b)<page: break
        start+=page
    return ids

def patch(table, where, body):
    req=urllib.request.Request(f'{TORRE_URL}/rest/v1/{table}?{where}',
        data=json.dumps(body).encode(),method='PATCH',
        headers={'apikey':TORRE_KEY,'Authorization':f'Bearer {TORRE_KEY}','Content-Type':'application/json','Prefer':'return=minimal'})
    urllib.request.urlopen(req,timeout=60)

def post(table, rows, conflict, batch=400):
    total=0
    for i in range(0,len(rows),batch):
        chunk=rows[i:i+batch]
        req=urllib.request.Request(f'{TORRE_URL}/rest/v1/{table}?on_conflict={conflict}',
            data=json.dumps(chunk,ensure_ascii=False,default=str).encode('utf-8'),method='POST',
            headers={'apikey':TORRE_KEY,'Authorization':f'Bearer {TORRE_KEY}','Content-Type':'application/json',
                     'Prefer':'resolution=merge-duplicates,return=minimal'})
        try: urllib.request.urlopen(req,timeout=180); total+=len(chunk); print(f'  {table} [{i}-{i+len(chunk)}] ok')
        except urllib.error.HTTPError as e: print(f'  ERRO {table} {e.code}: {e.read().decode()[:300]}'); raise
    return total

def main():
    tids=rest_ids('trips'); print(f'trips no banco: {len(tids)}')

    # ---- LogObservacoes ----
    log=gviz('LogObservacoes'); h=log[0]
    Ic=col(h,'Cód Viagem','Cód. Viagem'); Io=col(h,'Observacao','Observação'); Im=col(h,'Morosidade (Horas)','Morosidade')
    mor_n=0; obs=[]
    for r in log[1:]:
        if Ic<0 or Ic>=len(r): continue
        cod=nn(r[Ic])
        if not cod: continue
        tripid=tid(cod)
        if tripid not in tids: continue  # FK / só viagens que existem
        m=fnum(r[Im]) if Im>=0 and Im<len(r) else None
        if m is not None and m>0:
            try: patch('trips', f'id=eq.{tripid}', {'morosidade_horas': m}); mor_n+=1
            except Exception as e: print(f'  [skip moros {cod}] {e}')
        o=nn(r[Io]) if Io>=0 and Io<len(r) else None
        if o:
            obs.append({'id':str(uuid.uuid5(NS,'gasobs|'+cod)),'trip_id':tripid,'event_type':'manual_note',
                        'notes':o[:1000],'metadata':{'source':'planilha_gas','codViagem':cod}})
    obs=list({o['id']:o for o in obs}.values())  # dedup por id (cods repetidos no Log)
    print(f'Morosidade aplicada: {mor_n} | observações p/ trip_events: {len(obs)}')
    if obs: post('trip_events',obs,'id')

    # ---- HistoricoDiario ----
    hd=gviz('HistoricoDiario'); h2=hd[0]
    Jc=col(h2,'CodViagem','Cód. Viagem'); Jm=col(h2,'Motorista'); Jd=col(h2,'Dia')
    Ji=col(h2,'KmRestanteInicial'); Jf=col(h2,'KmRestanteFinal'); Jr=col(h2,'KmRodadoNoDia')
    seen=set(); km=[]
    for r in hd[1:]:
        if Jc<0 or Jc>=len(r): continue
        cod=nn(r[Jc]); dia=diaISO(r[Jd]) if Jd>=0 else None
        if not cod or not dia: continue
        key=(cod,dia)
        if key in seen: continue
        seen.add(key)
        km.append({'trip_code':cod[:20],'motorista':nn(r[Jm]) if Jm>=0 else None,'dia':dia,
                   'km_inicial':kmnum(r[Ji]) if Ji>=0 else None,'km_final':kmnum(r[Jf]) if Jf>=0 else None,
                   'km_rodado':kmnum(r[Jr]) if Jr>=0 else None})
    print(f'HistoricoDiario: {len(hd)-1} linhas -> {len(km)} (dedup code+dia)')
    if km: post('trip_daily_km',km,'trip_code,dia')
    print('FIM.')

if __name__=='__main__':
    main()
