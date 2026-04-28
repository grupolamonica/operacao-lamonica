import type { Driver } from '@/data/types'

const today = new Date()
const daysFromNow = (n: number) => { const d = new Date(today); d.setDate(d.getDate() + n); return d }
const monthsFromNow = (n: number) => { const d = new Date(today); d.setMonth(d.getMonth() + n); return d }

export const mockDrivers: Driver[] = [
  // === CANONICAL (10) ===
  {
    id: 'drv-001', code: 'MTR-7822', name: 'Carlos Henrique Souza', phone: '(11) 98123-4501', email: 'carlos.souza@torre.fic',
    photoUrl: undefined, status: 'on_route', operationalScore: 94,
    plate: 'KLP-9081', vehicleType: 'Van', base: 'CD São Paulo',
    documents: [
      { type: 'CNH',                   status: 'valido',         expiresAt: monthsFromNow(11) },
      { type: 'Exame Toxicológico',    status: 'valido',         expiresAt: monthsFromNow(8) },
      { type: 'Treinamento Defensivo', status: 'vence_em_breve', expiresAt: daysFromNow(20) },
    ],
    deliveriesToday: 12, avgDelayMinutes: -3,
    lat: -23.5505, lng: -46.6333, address: 'Av. Paulista, 1500 — São Paulo/SP',
  },
  {
    id: 'drv-002', code: 'MTR-7841', name: 'Mariana Oliveira Lima', phone: '(11) 98223-7720', email: 'mariana.lima@torre.fic',
    status: 'on_route', operationalScore: 88,
    plate: 'JZS-4477', vehicleType: 'Furgão', base: 'CD São Paulo',
    documents: [
      { type: 'CNH',                   status: 'valido',         expiresAt: monthsFromNow(14) },
      { type: 'Exame Toxicológico',    status: 'vence_em_breve', expiresAt: daysFromNow(12) },
      { type: 'Treinamento Defensivo', status: 'valido',         expiresAt: monthsFromNow(6) },
    ],
    deliveriesToday: 9, avgDelayMinutes: 8,
    lat: -23.5870, lng: -46.6577, address: 'Rua Augusta, 2200 — São Paulo/SP',
  },
  {
    id: 'drv-003', code: 'MTR-7903', name: 'Roberto Almeida Pereira', phone: '(11) 99344-2210', email: 'roberto.pereira@torre.fic',
    status: 'on_route', operationalScore: 76,
    plate: 'PHQ-1023', vehicleType: 'VUC', base: 'CD Guarulhos',
    documents: [
      { type: 'CNH',                   status: 'valido',         expiresAt: monthsFromNow(20) },
      { type: 'Exame Toxicológico',    status: 'valido',         expiresAt: monthsFromNow(4) },
      { type: 'Treinamento Defensivo', status: 'vencido',        expiresAt: daysFromNow(-30) },
    ],
    deliveriesToday: 14, avgDelayMinutes: 22,
    lat: -23.4543, lng: -46.5331, address: 'Rod. Hélio Smidt — Guarulhos/SP',
  },
  {
    id: 'drv-004', code: 'MTR-8011', name: 'Juliana Costa Ribeiro', phone: '(11) 98777-6612', email: 'juliana.ribeiro@torre.fic',
    status: 'available', operationalScore: 96,
    plate: 'RFD-8821', vehicleType: 'Van', base: 'CD São Paulo',
    documents: [
      { type: 'CNH',                   status: 'valido',         expiresAt: monthsFromNow(18) },
      { type: 'Exame Toxicológico',    status: 'valido',         expiresAt: monthsFromNow(10) },
      { type: 'Treinamento Defensivo', status: 'valido',         expiresAt: monthsFromNow(7) },
    ],
    deliveriesToday: 0, avgDelayMinutes: -2,
    lat: -23.5613, lng: -46.6562, address: 'CD São Paulo — Vila Olímpia',
  },
  {
    id: 'drv-005', code: 'MTR-8055', name: 'Anderson Martins Silva', phone: '(11) 99001-3344', email: 'anderson.silva@torre.fic',
    status: 'on_route', operationalScore: 82,
    plate: 'MJK-3392', vehicleType: 'Furgão', base: 'CD Campinas',
    documents: [
      { type: 'CNH',                   status: 'vence_em_breve', expiresAt: daysFromNow(25) },
      { type: 'Exame Toxicológico',    status: 'valido',         expiresAt: monthsFromNow(5) },
      { type: 'Treinamento Defensivo', status: 'valido',         expiresAt: monthsFromNow(9) },
    ],
    deliveriesToday: 8, avgDelayMinutes: 15,
    lat: -22.9099, lng: -47.0626, address: 'Av. Norte-Sul — Campinas/SP',
  },
  {
    id: 'drv-006', code: 'MTR-8120', name: 'Patricia Gomes Ferreira', phone: '(11) 98555-9907', email: 'patricia.ferreira@torre.fic',
    status: 'on_route', operationalScore: 91,
    plate: 'XCV-7714', vehicleType: 'Van', base: 'CD São Paulo',
    documents: [
      { type: 'CNH',                   status: 'valido',         expiresAt: monthsFromNow(16) },
      { type: 'Exame Toxicológico',    status: 'valido',         expiresAt: monthsFromNow(11) },
      { type: 'Treinamento Defensivo', status: 'valido',         expiresAt: monthsFromNow(8) },
    ],
    deliveriesToday: 11, avgDelayMinutes: 4,
    lat: -23.5320, lng: -46.6291, address: 'Marginal Tietê — São Paulo/SP',
  },
  {
    id: 'drv-007', code: 'MTR-8201', name: 'Lucas Fernandes Cardoso', phone: '(11) 98112-4560', email: 'lucas.cardoso@torre.fic',
    status: 'unavailable', operationalScore: 70,
    plate: 'NHB-6643', vehicleType: 'VUC', base: 'CD Guarulhos',
    documents: [
      { type: 'CNH',                   status: 'valido',         expiresAt: monthsFromNow(13) },
      { type: 'Exame Toxicológico',    status: 'vencido',        expiresAt: daysFromNow(-15) },
      { type: 'Treinamento Defensivo', status: 'valido',         expiresAt: monthsFromNow(5) },
    ],
    deliveriesToday: 0, avgDelayMinutes: 18,
    lat: -23.4322, lng: -46.4980, address: 'CD Guarulhos — Cumbica',
  },
  {
    id: 'drv-008', code: 'MTR-8255', name: 'Fernanda Rocha Mendes', phone: '(11) 99887-2245', email: 'fernanda.mendes@torre.fic',
    status: 'on_route', operationalScore: 89,
    plate: 'TGY-2218', vehicleType: 'Van', base: 'CD São Paulo',
    documents: [
      { type: 'CNH',                   status: 'valido',         expiresAt: monthsFromNow(19) },
      { type: 'Exame Toxicológico',    status: 'valido',         expiresAt: monthsFromNow(9) },
      { type: 'Treinamento Defensivo', status: 'valido',         expiresAt: monthsFromNow(7) },
    ],
    deliveriesToday: 10, avgDelayMinutes: -1,
    lat: -23.5762, lng: -46.6395, address: 'Av. 9 de Julho — São Paulo/SP',
  },
  {
    id: 'drv-009', code: 'MTR-8302', name: 'Diego Barbosa Nunes', phone: '(11) 98443-8821', email: 'diego.nunes@torre.fic',
    status: 'on_route', operationalScore: 84,
    plate: 'WPL-5532', vehicleType: 'Furgão', base: 'CD Campinas',
    documents: [
      { type: 'CNH',                   status: 'valido',         expiresAt: monthsFromNow(15) },
      { type: 'Exame Toxicológico',    status: 'valido',         expiresAt: monthsFromNow(6) },
      { type: 'Treinamento Defensivo', status: 'vence_em_breve', expiresAt: daysFromNow(18) },
    ],
    deliveriesToday: 7, avgDelayMinutes: 12,
    lat: -22.9550, lng: -47.0440, address: 'Rod. Anhanguera, km 95 — Campinas/SP',
  },
  {
    id: 'drv-010', code: 'MTR-8390', name: 'Beatriz Cunha Alves', phone: '(11) 98222-6677', email: 'beatriz.alves@torre.fic',
    status: 'available', operationalScore: 93,
    plate: 'QER-7090', vehicleType: 'Van', base: 'CD São Paulo',
    documents: [
      { type: 'CNH',                   status: 'valido',         expiresAt: monthsFromNow(17) },
      { type: 'Exame Toxicológico',    status: 'valido',         expiresAt: monthsFromNow(11) },
      { type: 'Treinamento Defensivo', status: 'valido',         expiresAt: monthsFromNow(10) },
    ],
    deliveriesToday: 0, avgDelayMinutes: 0,
    lat: -23.5505, lng: -46.6333, address: 'CD São Paulo — Vila Mariana',
  },
  // === GENERATED (12: drv-011 a drv-022) ===
  // Distribuição: 6 on_route, 4 available, 2 unavailable
  // Bases adicionais: CD Osasco, CD ABC
  {
    id: 'drv-011', code: 'MTR-8441', name: 'Rafael Torres Souza', phone: '(11) 97801-2233', email: 'rafael.torres@torre.fic',
    status: 'on_route', operationalScore: 87,
    plate: 'BZK-1120', vehicleType: 'Van', base: 'CD Osasco',
    documents: [
      { type: 'CNH',                   status: 'valido',         expiresAt: monthsFromNow(12) },
      { type: 'Exame Toxicológico',    status: 'valido',         expiresAt: monthsFromNow(7) },
      { type: 'Treinamento Defensivo', status: 'valido',         expiresAt: monthsFromNow(5) },
    ],
    deliveriesToday: 8, avgDelayMinutes: 6,
    lat: -23.5323, lng: -46.7916, address: 'Av. dos Autonomistas — Osasco/SP',
  },
  {
    id: 'drv-012', code: 'MTR-8502', name: 'Amanda Vieira Castro', phone: '(11) 97902-4455', email: 'amanda.vieira@torre.fic',
    status: 'available', operationalScore: 92,
    plate: 'DQM-3344', vehicleType: 'Furgão', base: 'CD ABC',
    documents: [
      { type: 'CNH',                   status: 'valido',         expiresAt: monthsFromNow(22) },
      { type: 'Exame Toxicológico',    status: 'valido',         expiresAt: monthsFromNow(9) },
      { type: 'Treinamento Defensivo', status: 'valido',         expiresAt: monthsFromNow(11) },
    ],
    deliveriesToday: 0, avgDelayMinutes: -1,
    lat: -23.6739, lng: -46.5299, address: 'CD ABC — Santo André/SP',
  },
  {
    id: 'drv-013', code: 'MTR-8560', name: 'Sandro Pires Rodrigues', phone: '(11) 98003-6677', email: 'sandro.pires@torre.fic',
    status: 'on_route', operationalScore: 79,
    plate: 'FVN-5566', vehicleType: 'VUC', base: 'CD Guarulhos',
    documents: [
      { type: 'CNH',                   status: 'vencido',        expiresAt: daysFromNow(-5) },
      { type: 'Exame Toxicológico',    status: 'valido',         expiresAt: monthsFromNow(8) },
      { type: 'Treinamento Defensivo', status: 'valido',         expiresAt: monthsFromNow(6) },
    ],
    deliveriesToday: 6, avgDelayMinutes: 19,
    lat: -23.4600, lng: -46.5100, address: 'Av. Monteiro Lobato — Guarulhos/SP',
  },
  {
    id: 'drv-014', code: 'MTR-8611', name: 'Leticia Nunes Barbosa', phone: '(11) 98104-8899', email: 'leticia.nunes@torre.fic',
    status: 'on_route', operationalScore: 85,
    plate: 'GRW-7788', vehicleType: 'Van', base: 'CD São Paulo',
    documents: [
      { type: 'CNH',                   status: 'valido',         expiresAt: monthsFromNow(10) },
      { type: 'Exame Toxicológico',    status: 'vence_em_breve', expiresAt: daysFromNow(22) },
      { type: 'Treinamento Defensivo', status: 'valido',         expiresAt: monthsFromNow(4) },
    ],
    deliveriesToday: 9, avgDelayMinutes: 5,
    lat: -23.5440, lng: -46.6490, address: 'Rua da Consolação — São Paulo/SP',
  },
  {
    id: 'drv-015', code: 'MTR-8670', name: 'Claudio Batista Lemos', phone: '(11) 98205-0011', email: 'claudio.batista@torre.fic',
    status: 'available', operationalScore: 90,
    plate: 'HJT-9900', vehicleType: 'Furgão', base: 'CD Osasco',
    documents: [
      { type: 'CNH',                   status: 'valido',         expiresAt: monthsFromNow(14) },
      { type: 'Exame Toxicológico',    status: 'valido',         expiresAt: monthsFromNow(10) },
      { type: 'Treinamento Defensivo', status: 'valido',         expiresAt: monthsFromNow(8) },
    ],
    deliveriesToday: 0, avgDelayMinutes: 0,
    lat: -23.5323, lng: -46.7916, address: 'CD Osasco — Jardim das Flores',
  },
  {
    id: 'drv-016', code: 'MTR-8720', name: 'Vanessa Carvalho Dias', phone: '(11) 98306-2233', email: 'vanessa.carvalho@torre.fic',
    status: 'on_route', operationalScore: 86,
    plate: 'KLS-1122', vehicleType: 'Van', base: 'CD ABC',
    documents: [
      { type: 'CNH',                   status: 'valido',         expiresAt: monthsFromNow(16) },
      { type: 'Exame Toxicológico',    status: 'valido',         expiresAt: monthsFromNow(12) },
      { type: 'Treinamento Defensivo', status: 'vence_em_breve', expiresAt: daysFromNow(28) },
    ],
    deliveriesToday: 7, avgDelayMinutes: 3,
    lat: -23.6800, lng: -46.5400, address: 'Av. Industrial — São Bernardo/SP',
  },
  {
    id: 'drv-017', code: 'MTR-8790', name: 'Renato Campos Ferraz', phone: '(11) 98407-4455', email: 'renato.campos@torre.fic',
    status: 'unavailable', operationalScore: 72,
    plate: 'LMO-3344', vehicleType: 'VUC', base: 'CD São Paulo',
    documents: [
      { type: 'CNH',                   status: 'valido',         expiresAt: monthsFromNow(9) },
      { type: 'Exame Toxicológico',    status: 'vencido',        expiresAt: daysFromNow(-8) },
      { type: 'Treinamento Defensivo', status: 'valido',         expiresAt: monthsFromNow(3) },
    ],
    deliveriesToday: 0, avgDelayMinutes: 25,
    lat: -23.5505, lng: -46.6333, address: 'CD São Paulo — Pari',
  },
  {
    id: 'drv-018', code: 'MTR-8841', name: 'Natalia Freitas Moura', phone: '(11) 98508-6677', email: 'natalia.freitas@torre.fic',
    status: 'on_route', operationalScore: 88,
    plate: 'NPR-5566', vehicleType: 'Furgão', base: 'CD Campinas',
    documents: [
      { type: 'CNH',                   status: 'valido',         expiresAt: monthsFromNow(21) },
      { type: 'Exame Toxicológico',    status: 'valido',         expiresAt: monthsFromNow(8) },
      { type: 'Treinamento Defensivo', status: 'valido',         expiresAt: monthsFromNow(6) },
    ],
    deliveriesToday: 8, avgDelayMinutes: 7,
    lat: -22.9200, lng: -47.0700, address: 'Av. Brasil — Campinas/SP',
  },
  {
    id: 'drv-019', code: 'MTR-8900', name: 'Gustavo Santana Prado', phone: '(11) 98609-8899', email: 'gustavo.santana@torre.fic',
    status: 'available', operationalScore: 95,
    plate: 'OQS-7788', vehicleType: 'Van', base: 'CD São Paulo',
    documents: [
      { type: 'CNH',                   status: 'valido',         expiresAt: monthsFromNow(20) },
      { type: 'Exame Toxicológico',    status: 'valido',         expiresAt: monthsFromNow(13) },
      { type: 'Treinamento Defensivo', status: 'valido',         expiresAt: monthsFromNow(9) },
    ],
    deliveriesToday: 0, avgDelayMinutes: -4,
    lat: -23.5613, lng: -46.6562, address: 'CD São Paulo — Ibirapuera',
  },
  {
    id: 'drv-020', code: 'MTR-8955', name: 'Eduardo Melo Ramos', phone: '(11) 98710-0011', email: 'eduardo.melo@torre.fic',
    status: 'on_route', operationalScore: 83,
    plate: 'PLT-9900', vehicleType: 'VUC', base: 'CD Osasco',
    documents: [
      { type: 'CNH',                   status: 'valido',         expiresAt: monthsFromNow(11) },
      { type: 'Exame Toxicológico',    status: 'vence_em_breve', expiresAt: daysFromNow(15) },
      { type: 'Treinamento Defensivo', status: 'valido',         expiresAt: monthsFromNow(7) },
    ],
    deliveriesToday: 6, avgDelayMinutes: 11,
    lat: -23.5400, lng: -46.8000, address: 'Rod. Castelo Branco — Osasco/SP',
  },
  {
    id: 'drv-021', code: 'MTR-9010', name: 'Cecilia Rocha Figueiredo', phone: '(11) 98811-2233', email: 'cecilia.rocha@torre.fic',
    status: 'on_route', operationalScore: 91,
    plate: 'QUV-1122', vehicleType: 'Van', base: 'CD ABC',
    documents: [
      { type: 'CNH',                   status: 'valido',         expiresAt: monthsFromNow(18) },
      { type: 'Exame Toxicológico',    status: 'valido',         expiresAt: monthsFromNow(10) },
      { type: 'Treinamento Defensivo', status: 'valido',         expiresAt: monthsFromNow(8) },
    ],
    deliveriesToday: 10, avgDelayMinutes: 2,
    lat: -23.6900, lng: -46.5600, address: 'Av. Dom Pedro II — São Bernardo/SP',
  },
  {
    id: 'drv-022', code: 'MTR-9071', name: 'Thiago Lima Nascimento', phone: '(11) 98912-4455', email: 'thiago.lima@torre.fic',
    status: 'available', operationalScore: 89,
    plate: 'RWX-3344', vehicleType: 'Furgão', base: 'CD Campinas',
    documents: [
      { type: 'CNH',                   status: 'valido',         expiresAt: monthsFromNow(15) },
      { type: 'Exame Toxicológico',    status: 'valido',         expiresAt: monthsFromNow(9) },
      { type: 'Treinamento Defensivo', status: 'valido',         expiresAt: monthsFromNow(12) },
    ],
    deliveriesToday: 0, avgDelayMinutes: -2,
    lat: -22.9099, lng: -47.0626, address: 'CD Campinas — Taquaral',
  },
]
