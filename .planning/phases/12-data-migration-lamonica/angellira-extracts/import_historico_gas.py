"""
Importa o HISTÓRICO da planilha do painel GAS (1vywBfU) para a Torre:
  - HistoricoConcluidas  -> trips (status=completed, sla_status, km, chegada)
  - HistoricoTickets     -> alerts resolvidos (só problemas, dedup por cod+tipo = episódio)
Chave dos trips = uuid.uuid5(NAMESPACE_DNS, 'carrega|'+codViagem) — IGUAL ao adapter
Angellira, então casa/atualiza as viagens ao vivo e insere as históricas.

Uso: python import_historico_gas.py
"""
import urllib.request, urllib.error, json, csv, io, uuid, re

SHEET = '1vywBfUJPIA2uEHYaz-WD5xEmNP24n8maMZ1XmN_2VUs'
TORRE_URL = 'https://ocgifdytaqlubuokjkwv.supabase.co'
TORRE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9jZ2lmZHl0YXFsdWJ1b2tqa3d2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODAwNjAzOTYsImV4cCI6MjA5NTYzNjM5Nn0.YjOp5-H-SpsMVAhuRiUrWM_2hu17Im0nR5o5CqfYeuk'
NS = uuid.NAMESPACE_DNS
CLIENTS = {'shopee':'c022c1f4-ef0b-4b5b-9044-55ac3f61da1d','casas':'2f85fe11-46c6-520c-99cd-35a361dad7d2',
           'nestle':'c09d5929-80e2-5a26-a2d3-ad87d92815d9','griffi':'a8c3290b-8ba6-5643-9e38-f2d01b10056a'}
TYPEMAP = {'ATRASO':'atraso','PARADA':'parada','PRAZO_PROXIMO':'prazo_proximo','SEM_GPS':'sem_sinal','PROXIMO_ENTREGA':'proximo_entrega'}
SEV = {'atraso':'critico','sem_sinal':'medio','parada':'medio','prazo_proximo':'medio','proximo_entrega':'baixo'}

def gviz(tab):
    url=f'https://docs.google.com/spreadsheets/d/{SHEET}/gviz/tq?tqx=out:csv&sheet={tab}'
    data=urllib.request.urlopen(url,timeout=300).read().decode('utf-8','replace')
    return list(csv.reader(io.StringIO(data)))

def tid(cod): return str(uuid.uuid5(NS,'carrega|'+str(cod).strip()))
def nn(v):
    v=(v or '').strip(); return v or None
def kmnum(v):
    if not v: return None
    n=re.sub(r'[^\d,.-]','',str(v)).replace('.','').replace(',','.')
    try: x=float(n); return x if x==x else None
    except: return None
def iso(v):
    v=(v or '').strip()
    if not v: return None
    m=re.match(r'(\d{2})/(\d{2})/(\d{4})[ T]?(\d{2})?:?(\d{2})?:?(\d{2})?',v)
    if m:
        import datetime
        try: return datetime.datetime(int(m.group(3)),int(m.group(2)),int(m.group(1)),int(m.group(4) or 0),int(m.group(5) or 0),int(m.group(6) or 0)).isoformat()
        except: return None
    return None
def clientid(*txt):
    s=' '.join(t or '' for t in txt).upper()
    if 'NESTLE' in s or 'NESTLÉ' in s: return CLIENTS['nestle']
    if 'CASAS BAHIA' in s or 'VIA VAREJO' in s: return CLIENTS['casas']
    if 'SHOPEE' in s: return CLIENTS['shopee']
    return CLIENTS['griffi']

def rest_get_ids(table):
    ids=set(); start=0; page=1000
    while True:
        req=urllib.request.Request(f'{TORRE_URL}/rest/v1/{table}?select=id',
            headers={'apikey':TORRE_KEY,'Authorization':f'Bearer {TORRE_KEY}','Range':f'{start}-{start+page-1}'})
        b=json.loads(urllib.request.urlopen(req,timeout=120).read())
        for r in b: ids.add(r['id'])
        if len(b)<page: break
        start+=page
    return ids

def post(table, rows, conflict, batch=400):
    total=0
    for i in range(0,len(rows),batch):
        chunk=rows[i:i+batch]
        req=urllib.request.Request(f'{TORRE_URL}/rest/v1/{table}?on_conflict={conflict}',
            data=json.dumps(chunk,ensure_ascii=False,default=str).encode('utf-8'),method='POST',
            headers={'apikey':TORRE_KEY,'Authorization':f'Bearer {TORRE_KEY}','Content-Type':'application/json',
                     'Prefer':'resolution=merge-duplicates,return=minimal'})
        try:
            urllib.request.urlopen(req,timeout=180); total+=len(chunk); print(f'  {table} [{i}-{i+len(chunk)}] ok')
        except urllib.error.HTTPError as e:
            print(f'  ERRO {table} {e.code}: {e.read().decode()[:300]}'); raise
    return total

def col(header,*names):
    H=[h.strip().upper() for h in header]
    for n in names:
        if n.upper() in H: return H.index(n.upper())
    return -1

def importar_concluidas():
    rows=gviz('HistoricoConcluidas'); h=rows[0]
    I={k:col(h,*v) for k,v in {
        'cod':['Cód. Viagem'],'mot':['Motorista'],'placa':['Placa'],'orig':['Origem'],'dest':['Destino'],
        'stv':['Status Viagem'],'prazo':['Prazo Final'],'dataC':['Data Conclusão'],'horaC':['Hora Conclusão'],
        'kmtot':['KM Total'],'kmfalt':['KM que Falta'],'vinc':['Vínculo'],'tipo':['Tipo de Carga']}.items()}
    out=[]
    for r in rows[1:]:
        if I['cod']<0 or I['cod']>=len(r): continue
        cod=nn(r[I['cod']])
        if not cod: continue
        kmtot=kmnum(r[I['kmtot']]) if I['kmtot']>=0 else None
        kmfalt=kmnum(r[I['kmfalt']]) if I['kmfalt']>=0 else None
        done=(kmtot-kmfalt) if (kmtot is not None and kmfalt is not None) else kmtot
        cheg=iso(((r[I['dataC']] if I['dataC']>=0 else '')+' '+(r[I['horaC']] if I['horaC']>=0 else '')).strip())
        prazo=iso(r[I['prazo']]) if I['prazo']>=0 else None
        stv=(r[I['stv']] if I['stv']>=0 else '').upper()
        sla='no_prazo' if 'NO PRAZO' in stv else ('atrasado' if 'ATRASO' in stv else None)
        ws=cheg or prazo
        we=prazo or cheg
        if not ws or not we: continue
        out.append({'id':tid(cod),'code':cod[:20],'client_id':clientid(r[I['orig']] if I['orig']>=0 else '', r[I['dest']] if I['dest']>=0 else '', r[I['tipo']] if I['tipo']>=0 else ''),
            'origin':(nn(r[I['orig']]) or None) if I['orig']>=0 else None,'destination':(nn(r[I['dest']]) or None) if I['dest']>=0 else None,
            'window_start':ws,'window_end':we,'eta':prazo,'status':'completed','sla_status':sla,'progress_pct':100,
            'distance_total':str(kmtot) if kmtot is not None else None,'distance_done':str(done) if done is not None else None,
            'arrived_at':cheg,'departed_at':None,'sheet_motorista':nn(r[I['mot']]) if I['mot']>=0 else None})
    # dedup por id
    seen={}; [seen.update({o['id']:o}) for o in out]
    final=list(seen.values())
    print(f'Concluidas: {len(rows)-1} linhas -> {len(final)} trips')
    post('trips',final,'id')
    return final

def importar_tickets(trip_ids):
    rows=gviz('HistoricoTickets'); h=rows[0]
    I={k:col(h,*v) for k,v in {'cod':['Cód. Viagem'],'abert':['Timestamp Abertura'],'tipo':['Tipo'],
        'status':['Status'],'op':['Operador'],'obs':['Observação'],'trat':['Timestamp Tratamento'],
        'mot':['Motorista'],'placa':['Placa']}.items()}
    seen=set(); out=[]
    for r in rows[1:]:
        if I['cod']<0 or I['cod']>=len(r): continue
        cod=nn(r[I['cod']]); tipo=(r[I['tipo']] if I['tipo']>=0 and I['tipo']<len(r) else '').strip().upper()
        if not cod or tipo not in TYPEMAP: continue
        key=(cod,tipo)
        if key in seen: continue
        seen.add(key)
        ttype=TYPEMAP[tipo]
        ab=iso(r[I['abert']]) if I['abert']>=0 else None
        tr=iso(r[I['trat']]) if I['trat']>=0 else None
        tripid=tid(cod) if tid(cod) in trip_ids else None
        out.append({'id':str(uuid.uuid5(NS,f'gasticket|{cod}|{tipo}')),'type':ttype,'severity':SEV.get(ttype,'medio'),
            'status':'resolvido','priority':'media','title':f'{tipo} viagem {cod}','description':nn(r[I['obs']]) if I['obs']>=0 else None,
            'source':'Telemetria','occurred_at':ab or '2026-01-01T00:00:00','resolved_at':tr or ab,'trip_id':tripid})
    print(f'Tickets: {len(rows)-1} linhas -> {len(out)} episódios (dedup cod+tipo, só problemas)')
    post('alerts',out,'id')
    return out

def main():
    importar_concluidas()
    print('Buscando ids de trips p/ FK dos alertas...')
    tids=rest_get_ids('trips'); print(f'  trips no banco: {len(tids)}')
    importar_tickets(tids)
    print('FIM.')

if __name__=='__main__':
    main()
