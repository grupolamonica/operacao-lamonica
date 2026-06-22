# API de Integração — Motorista por CPF

Consulta **todos os dados de um motorista por CPF** num único endpoint, já tratado e cruzado entre as três bases da operação (**Torre + Ranking + Cargas/Angellira**). Feito para outros sistemas consumirem (server-to-server).

---

## Como usar (resumo)

| | |
|---|---|
| **Método** | `GET` |
| **URL** | `https://torre.grupolamonica.com/api/integrations/drivers/{cpf}` |
| **Autenticação** | Header `x-api-key: <sua-chave>` |
| **CPF** | Com ou sem máscara (`12345678900` ou `123.456.789-00`) |

### Exemplo (curl)

```bash
curl -H "x-api-key: SUA_CHAVE" \
  https://torre.grupolamonica.com/api/integrations/drivers/02861474599
```

### Exemplo (Bruno / Postman / Insomnia)

- Método: **GET**
- URL: `https://torre.grupolamonica.com/api/integrations/drivers/02861474599`
- Aba **Headers** → `x-api-key` = `SUA_CHAVE`

---

## Autenticação

Toda chamada exige o header **`x-api-key`** com a chave combinada. Sem a chave ou com chave errada → **401**.

A chave fica no cofre de secrets (GitHub Secret `INTEGRATION_API_KEY` → `.env` da VPS). Para obter ou rotacionar a chave, fale com o time da Torre.

---

## Respostas

| Código | Significado |
|--------|-------------|
| `200`  | Motorista encontrado — retorna o envelope completo |
| `400`  | CPF inválido (precisa ter 11 dígitos) |
| `401`  | Chave de API ausente ou inválida |
| `404`  | Nenhum vestígio do CPF em nenhuma base |

### Envelope (200)

```jsonc
{
  "cpf": "02861474599",
  "cadastroTorre": true,            // true = tem cadastro na Torre; false = só achado no Cargas/Ranking
  "fonte": "torre",                 // "torre" | "cargas"
  "geradoEm": "2026-06-22T13:00:00Z",

  "identidade": {                   // dados cadastrais do motorista
    "id": "uuid", "code": "MTR-...", "name": "NOME", "cpf": "...", "rg": "...",
    "cnh": "...", "cnhCategoria": "E", "cnhValidade": "2027-05-30",
    "nascimento": "1986-12-04", "driverKind": "AGR",
    "cidade": "SALVADOR", "estado": "BA", "phone": "...", "email": null,
    "shopeeDriverId": "3259829"
  },

  "conformidade": {                 // situação operacional / Angellira / docs (flags)
    "status": "available", "operationalScore": 100,
    "angelliraStatus": "Conforme", "angelliraValidUntil": "2026-07-31",
    "anttValid": true, "documentsValid": true, "insuranceValid": false,
    "trackingEnabled": false, "operationalBlocked": false
  },

  "ranking": {                      // posição do motorista no ranking
    "encontrado": true, "posicao": 137, "pontuacao": 29,
    "vinculo": "AGREGADO DEDICADO", "status": "ATIVO"
  },

  "viagens": {                      // histórico de viagens (Torre)
    "total": 239, "completas": 230, "canceladas": 1, "emAndamento": 0,
    "noPrazo": 180, "atrasadas": 20, "pctNoPrazo": 90.0, "qtdLh": 200,
    "primeira": "...", "ultima": "...", "totalValor": 123456.78,
    "recentes": [
      {
        "code": "LT0Q3T021NDC2", "origin": "SOC-BA2", "destination": "SOC-PE2",
        "status": "completed", "slaStatus": "no_prazo",
        "windowStart": "...", "eta": "...", "valor": 5349, "sheetLh": "LT0Q3T021NDC2",
        "cavalo": "IPU0A11", "carreta": "PLY6C75",
        "placasFonte": "cadastro"   // "viagem" = placa da própria viagem | "cadastro" = rig atual do motorista
      }
    ]
  },

  "veiculos": [                     // veículos do motorista (cadastro)
    { "plate": "IPU0A11", "type": "CARRETA", "model": "VOLVO FH 440",
      "plateRole": "HORSE", "angelliraStatus": "FOUND", "angelliraValidUntil": "2026-09-06" }
  ],

  "documentos": [                   // documentos do cadastro da Torre
    { "tipo": "CNH", "numero": "...", "categoria": "E", "status": "vigente",
      "statusOrigem": null, "validade": "2027-05-30" },
    { "tipo": "Angellira", "status": "vigente", "statusOrigem": "Conforme", "validade": "2026-08-25" }
  ],

  "consultaAngellira": {            // documentos da ÚLTIMA consulta CONFORME da Angellira
    "consultaId": 2282570, "status": "Conforme", "conforme": true,
    "semConsultaConforme": false,
    "consultadoEm": "2026-02-26T15:28:25Z", "validoAte": "2026-08-25T15:32:12Z",
    "documentos": [
      { "tipo": "CNH", "numero": "...", "categoria": "E", "validade": "2027-05-30Z",
        "seguranca": "...", "estado": "BA" },
      { "tipo": "RG", "numero": "...", "orgao": "SSP", "estado": "BA" }
      // + { "tipo": "Veículo", "papel": "cavalo|carreta", placa, antt, chassi, renavam, ... } quando a consulta incluir veículo
    ],
    "anexos": []                    // arquivos anexados (ver Limitações)
  },

  "localizacao": {                  // última posição GPS conhecida
    "address": null, "lat": -12.879, "lng": -38.310,
    "ultimaPosicao": { "at": "...", "cidade": null, "uf": null, "veiculo": "LSL9C66" }
  },

  "ocorrencias": {                  // alertas/ocorrências das viagens do motorista
    "total": 44, "truncado": true, // "truncado": true = há mais que os itens retornados (limite 30)
    "itens": [
      { "type": "sem_sinal", "severity": "medio", "status": "aberto",
        "title": "...", "occurredAt": "...", "resolvedAt": null }
    ]
  },

  "cargas": {                       // dados do sistema de Cargas
    "total": 0,
    "candidaturas": [ /* candidaturas a cargas abertas, quando houver */ ],
    "cadastroCargas": {             // cadastro do motorista no Cargas (motoristas_historico)
      "nome": "...", "cnh": "...", "cnhValidade": "...", "telefone": "...",
      "cidade": "...", "estado": "...", "angelliraValidade": "...", "aspxEncontrado": true
    }
  }
}
```

Quando `cadastroTorre` for `false` (motorista achado só no Cargas/Ranking), os blocos da Torre (`viagens`, `veiculos`, `documentos`, `localizacao`, `conformidade`) vêm vazios/`null`, e a identidade é montada a partir do cadastro Cargas.

---

## Observações

- **Cache:** a resposta é cacheada por **60 segundos** por CPF.
- **`placasFonte`** nas viagens recentes: `viagem` = placa registrada naquela viagem; `cadastro` = placa do rig atual do motorista (quando a viagem não trouxe placa).
- **`consultaAngellira`** sempre reflete a **última consulta Conforme**. Se a última consulta do motorista for "Não Conforme", vem `semConsultaConforme: true` e `documentos: []`.

### Limitações conhecidas (hoje)

- **`anexos` (arquivos da consulta Angellira)** — os arquivos em si (PDF/foto da CNH, biometria, certificado) **ainda não são retornados**: eles vivem na plataforma Angellira e dependem de uma integração futura. O bloco traz os **dados** da consulta, não os arquivos.
- **Fallback de histórico Angellira** — guardamos apenas a última consulta por motorista; não há busca em histórico de consultas anteriores.

---

## Suporte

Dúvidas, chave de acesso ou novos campos: time da Torre de Controle.
