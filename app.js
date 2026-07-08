// ============================================================
// 1NORT — config do cliente + agregação (vanilla JS, sem build)
// Portado de lib/config.ts e lib/aggregate.ts
// ============================================================

export const CLIENT = {
  name: "Solpower",
  eyebrow: "",
  subtitle: "",
  crmLeadUrl: (id) => `https://app.gohighlevel.com/v2/location/phc5byWUlc0UXubNUIAp/opportunities/list`,
};

export const PIPELINES = [
  { id: 11845367, label: "Pré-Qualificação", isPrimary: true },
  { id: 11845336, label: "Funil de vendas" },
  { id: 11845371, label: "Descarte" },
  { id: 11845375, label: "Funil de Resgate" },
  { id: 11845363, label: "1Nort AI Functions" },
];

// Stages reais do Kommo (Energy Solar RJ). 142 = ganho, 143 = perdido
// em TODOS os pipelines. Estes conjuntos alimentam as taxas por stage.
export const WON_STAGE = "cfc9c90c-be2f-44c6-b7a5-56121efc028d";
export const LOST_STAGE = "0618a4a4-7cba-458d-a90d-9781916a42d8";
// stages que representam "proposta feita" (Funil de vendas)
export const PROPOSAL_STAGES = ["5f7bd140-ded3-4c42-b5c8-ac873d049f8f", "b56ddf31-3cb0-43d8-aeb3-05e1b54d574a", "284fc2ac-8b2e-4ea5-a61e-5b0abc05e18e", "ec10a5de-7e57-4b02-aedc-f358c468f5b5", "dcddc394-edb2-4cfc-9114-5253790703f1", "cca2e8f5-7d12-4e86-86d4-d93714d66b2b", "79c2206d-ef70-4d19-94c3-f3f82242cf20", "cfc9c90c-be2f-44c6-b7a5-56121efc028d"];
// stages que representam "visita marcada/feita"
export const VISIT_STAGES = ["dcddc394-edb2-4cfc-9114-5253790703f1", "cca2e8f5-7d12-4e86-86d4-d93714d66b2b", "79c2206d-ef70-4d19-94c3-f3f82242cf20", "cfc9c90c-be2f-44c6-b7a5-56121efc028d"];
// stages "Qualificado ou além" no Funil de vendas (a partir de Qualificado)
export const QUALIFIED_STAGES = ["f5f3722a-069a-48a2-8fd6-c6aa6e7549a3", "5f7bd140-ded3-4c42-b5c8-ac873d049f8f", "b56ddf31-3cb0-43d8-aeb3-05e1b54d574a", "284fc2ac-8b2e-4ea5-a61e-5b0abc05e18e", "ec10a5de-7e57-4b02-aedc-f358c468f5b5", "dcddc394-edb2-4cfc-9114-5253790703f1", "cca2e8f5-7d12-4e86-86d4-d93714d66b2b", "79c2206d-ef70-4d19-94c3-f3f82242cf20", "cfc9c90c-be2f-44c6-b7a5-56121efc028d"];
export const ORIGINS = ["[Meta] Whatsapp", "Indicação", "[Meta] Cadastro", "Loja", "Sem origem"];
export const PRODUCTS = ["Residencial", "Comercial", "Vendedor", "Sem produto"];
export const WINDOW_LABELS = {
  "3m": "3 meses", "6m": "6 meses", "12m": "12 meses",
  year: "Este ano", lastyear: "Ano passado", max: "Máximo",
};
export const PROFILE_FIELDS = {
  product: "Produto", payment: "Método de pagamento",
  clientType: "Tipo de cliente", telhado: "Telhado",
};

const pipeById = (id) => PIPELINES.find((p) => p.id === id);
const dstr = (iso) => iso.slice(0, 10);
const inRange = (iso, a, b) => dstr(iso) >= a && dstr(iso) <= b;
const days = (a, b) => Math.floor((+new Date(b) - +new Date(a)) / 86400000);
// Proposta: pelo custom field de agendamento OU pelo stage no Funil de vendas
const isProposal = (l) =>
  !!l.proposalAt || l.status === "won" || PROPOSAL_STAGES.includes(l.stageId);
// Visita: pelo custom field OU pelo stage
const isVisit = (l) => !!l.visitAt || VISIT_STAGES.includes(l.stageId);
// Qualificado: passou pelo stage Qualificado ou além
const isQualified = (l) => l.status === "won" || QUALIFIED_STAGES.includes(l.stageId);

export function applyFilter(leads, f) {
  return leads.filter((l) => {
    if (!inRange(l.createdAt, f.from, f.to)) return false;
    if (f.pipeline.length && !f.pipeline.includes(l.pipelineId)) return false;
    if (f.origin.length && !f.origin.includes(l.origin ?? "Sem origem")) return false;
    if (f.product.length && !f.product.includes(l.product ?? "Sem produto")) return false;
    return true;
  });
}

// aplica só os filtros de dimensão (origem, produto, pipeline), SEM a data —
// usado pelos gráficos que têm janela temporal própria (faturamento, evolução,
// forecast, stagnation), pra que respeitem origem/produto sem perder os meses.
export function applyDimFilters(leads, f) {
  return leads.filter((l) => {
    if (f.pipeline.length && !f.pipeline.includes(l.pipelineId)) return false;
    if (f.origin.length && !f.origin.includes(l.origin ?? "Sem origem")) return false;
    if (f.product.length && !f.product.includes(l.product ?? "Sem produto")) return false;
    return true;
  });
}

export function previousRange(from, to) {
  const span = Math.max(1, days(from, to) + 1);
  const prevTo = new Date(+new Date(from) - 86400000);
  const prevFrom = new Date(+prevTo - (span - 1) * 86400000);
  return { from: dstr(prevFrom.toISOString()), to: dstr(prevTo.toISOString()) };
}

export function computeKpis(scope, prev) {
  const leads = scope.length;
  const proposals = scope.filter(isProposal).length;
  const won = scope.filter((l) => l.status === "won");
  const lost = scope.filter((l) => l.status === "lost");
  const visits = scope.filter(isVisit).length;
  const qualified = scope.filter(isQualified).length;
  const rate = (a, b) => (b ? (a / b) * 100 : 0);
  const cycles = won.map((l) => days(l.createdAt, l.updatedAt));
  const avgCycle = cycles.length ? Math.round(cycles.reduce((a, b) => a + b, 0) / cycles.length) : 0;
  const wonValue = won.reduce((s, l) => s + (l.value ?? 0), 0);
  const openWithValue = scope.filter((l) => l.status === "open" && l.value);
  const openValue = openWithValue.reduce((s, l) => s + (l.value ?? 0), 0);

  const pLeads = prev.length, pProp = prev.filter(isProposal).length,
    pWon = prev.filter((l) => l.status === "won").length,
    pVis = prev.filter(isVisit).length;
  const pct = (a, b) => (b ? Math.round(((a - b) / b) * 100) : 0);
  const pp = (a, b) => +(a - b).toFixed(1);

  return {
    leads, openCount: scope.filter((l) => l.status === "open").length,
    proposals, visits, qualified, wonCount: won.length, lostCount: lost.length,
    orcRate: rate(proposals, leads), visitRate: rate(visits, leads),
    qualRate: rate(qualified, leads),
    closeRate: rate(won.length, leads), avgCycle, wonValue,
    wonTicket: won.length ? Math.round(wonValue / won.length) : 0,
    openValue, openTicket: openWithValue.length ? Math.round(openValue / openWithValue.length) : 0,
    delta: {
      leads: pct(leads, pLeads),
      orc: pp(rate(proposals, leads), rate(pProp, pLeads)),
      visit: pp(rate(visits, leads), rate(pVis, pLeads)),
      close: pp(rate(won.length, leads), rate(pWon, pLeads)),
    },
  };
}

export function monthKeys(win, ref = new Date()) {
  let n = win === "3m" ? 3 : win === "12m" || win === "year" || win === "lastyear" ? 12 : 6;
  const base = new Date(ref.getFullYear(), ref.getMonth(), 1);
  if (win === "lastyear") base.setFullYear(base.getFullYear() - 1);
  const out = [];
  for (let i = n - 1; i >= 0; i--)
    out.push(new Date(base.getFullYear(), base.getMonth() - i, 1).toISOString().slice(0, 10));
  return out;
}

export function revenueByMonth(all, win) {
  const keys = monthKeys(win);
  const map = new Map(keys.map((k) => [k.slice(0, 7), 0]));
  all.filter((l) => l.status === "won").forEach((l) => {
    const k = l.updatedAt.slice(0, 7);
    if (map.has(k)) map.set(k, map.get(k) + (l.value ?? 0));
  });
  const values = keys.map((k) => map.get(k.slice(0, 7)) ?? 0);
  const total = values.reduce((a, b) => a + b, 0);
  return { months: keys, values, total, avg: Math.round(total / keys.length) };
}

export function evolutionByMonth(all, win) {
  const keys = monthKeys(win);
  const idx = (k) => keys.findIndex((m) => m.slice(0, 7) === k.slice(0, 7));
  const leads = keys.map(() => 0), quals = keys.map(() => 0), props = keys.map(() => 0), closes = keys.map(() => 0);
  all.forEach((l) => {
    let i = idx(l.createdAt); if (i >= 0) leads[i]++;
    if (isQualified(l)) { i = idx(l.createdAt); if (i >= 0) quals[i]++; }
    if (isProposal(l)) { i = idx(l.proposalAt ?? l.createdAt); if (i >= 0) props[i]++; }
    if (l.status === "won") { i = idx(l.updatedAt); if (i >= 0) closes[i]++; }
  });
  return { months: keys, leads, qualified: quals, proposals: props, closes };
}

export function forecast(all) {
  const now = new Date();
  const from = new Date(now.getFullYear(), now.getMonth() - 3, 1).toISOString().slice(0, 10);
  const base = all.filter((l) => dstr(l.createdAt) >= from);
  const won = base.filter((l) => l.status === "won");
  const proposals = base.filter(isProposal).length;
  const revenue = won.reduce((s, l) => s + (l.value ?? 0), 0);
  return {
    orcRate: +((base.length ? proposals / base.length : 0) * 100).toFixed(1),
    closeRate: +((proposals ? won.length / proposals : 0) * 100).toFixed(1),
    leadsMo: Math.round(base.length / 3), propMo: Math.round(proposals / 3),
    salesMo: Math.round(won.length / 3), revMo: Math.round(revenue / 3),
    proj3Sales: Math.round(won.length / 3) * 3, proj3Rev: Math.round(revenue / 3) * 3,
  };
}

export function heatmap(scope) {
  const grid = Array.from({ length: 7 }, () => new Array(24).fill(0));
  scope.forEach((l) => { const d = new Date(l.createdAt); grid[d.getDay()][d.getHours()]++; });
  let peak = { day: 0, hour: 0, n: 0 };
  const dayTotals = new Array(7).fill(0);
  grid.forEach((row, dy) => row.forEach((n, hr) => {
    dayTotals[dy] += n; if (n > peak.n) peak = { day: dy, hour: hr, n };
  }));
  return { grid, peak, dayTotals };
}

export function stagnation(all, pipelineLabel, now = new Date()) {
  const pipe = PIPELINES.find((p) => p.label === pipelineLabel);
  const pool = all.filter((l) => l.status === "open" && (!pipe || l.pipelineId === pipe.id));
  const b = { "0-7": 0, "8-15": 0, "16-30": 0, "+30": 0 };
  const ranked = pool.map((l) => ({ lead: l, d: days(l.updatedAt, now.toISOString()) }))
    .sort((x, y) => y.d - x.d);
  ranked.forEach(({ d }) => {
    if (d <= 7) b["0-7"]++; else if (d <= 15) b["8-15"]++;
    else if (d <= 30) b["16-30"]++; else b["+30"]++;
  });
  return { buckets: b, over15: b["16-30"] + b["+30"], top: ranked.slice(0, 10) };
}

export function distribution(scope, key) {
  const counts = new Map(); let filled = 0;
  scope.forEach((l) => {
    const v = l.fields?.[key] ?? null;
    if (v) { filled++; counts.set(v, (counts.get(v) ?? 0) + 1); }
  });
  const rows = [...counts.entries()].map(([label, n]) => ({ label, n })).sort((a, b) => b.n - a.n);
  return { rows, filled, pctFilled: scope.length ? (filled / scope.length) * 100 : 0 };
}

export function campaigns(scope) {
  const map = new Map();
  scope.forEach((l) => {
    const k = l.utmCampaign || "(sem campanha)";
    if (!map.has(k)) map.set(k, []);
    map.get(k).push(l);
  });
  return [...map.entries()].map(([name, ls]) => {
    const proposals = ls.filter(isProposal).length, won = ls.filter((l) => l.status === "won").length;
    return { name, leads: ls.length, proposals, won,
      orcRate: ls.length ? (proposals / ls.length) * 100 : 0,
      closeRate: ls.length ? (won / ls.length) * 100 : 0 };
  }).sort((a, b) => b.leads - a.leads);
}

export function pipelineSummary(scope) {
  return PIPELINES.map((p) => {
    const ls = scope.filter((l) => l.pipelineId === p.id);
    const proposals = ls.filter((l) => l.status === "won" || l.proposalAt).length;
    const won = ls.filter((l) => l.status === "won").length;
    return { p, leads: ls.length, proposals, won,
      orc: ls.length ? (proposals / ls.length) * 100 : 0,
      close: ls.length ? (won / ls.length) * 100 : 0,
      closeProp: proposals ? (won / proposals) * 100 : 0 };
  });
}

// Ranking por consultor: vendas, propostas apresentadas, R$
export function byConsultant(scope) {
  const map = new Map();
  scope.forEach((l) => {
    const c = l.consultor || "Sem consultor";
    if (!map.has(c)) map.set(c, { name: c, sales: 0, proposals: 0, revenue: 0 });
    const row = map.get(c);
    if (l.status === "won") { row.sales++; row.revenue += l.value ?? 0; }
    if (isProposal(l)) row.proposals++;
  });
  const rows = [...map.values()].filter((r) => r.name !== "Sem consultor" || r.sales || r.proposals);
  return {
    bySales: [...rows].sort((a, b) => b.sales - a.sales),
    byProposals: [...rows].sort((a, b) => b.proposals - a.proposals),
    byRevenue: [...rows].sort((a, b) => b.revenue - a.revenue),
  };
}

// Motivo das perdas
export function lossReasons(scope) {
  const lost = scope.filter((l) => l.status === "lost");
  const map = new Map();
  lost.forEach((l) => {
    const r = l.lossReason || "Sem motivo";
    map.set(r, (map.get(r) ?? 0) + 1);
  });
  const items = [...map.entries()]
    .map(([motivo, leads]) => ({ motivo, leads }))
    .sort((a, b) => b.leads - a.leads);
  return { items, total: lost.length };
}

// Geografia: onde estão os clientes (campo Local)
export function geography(scope, limit = 12) {
  const map = new Map();
  let filled = 0;
  scope.forEach((l) => {
    const loc = (l.fields?.local || "").trim();
    if (loc) { filled++; map.set(loc, (map.get(loc) ?? 0) + 1); }
  });
  const rows = [...map.entries()]
    .map(([label, n]) => ({ label, n }))
    .sort((a, b) => b.n - a.n)
    .slice(0, limit);
  return { rows, filled, distinct: map.size };
}

// Atividade por consultor: mensagens, conversas, tentativas e ligações.
// Depende de campos de atividade nos leads (activity.*). Enquanto o fluxo
// não trouxer esses dados, retorna hasData:false e o painel mostra aviso.
export function activityByConsultant(scope) {
  const hasAny = scope.some((l) => l.activity && (
    l.activity.messages || l.activity.conversations ||
    l.activity.callAttempts || l.activity.callsMade
  ));
  if (!hasAny) return { hasData: false };

  const map = new Map();
  const bump = (name, key, v) => {
    if (!map.has(name)) map.set(name, { name, messages: 0, conversations: 0, callAttempts: 0, callsMade: 0 });
    map.get(name)[key] += v || 0;
  };
  scope.forEach((l) => {
    const c = l.consultor || "Sem consultor";
    const a = l.activity || {};
    bump(c, "messages", a.messages);
    bump(c, "conversations", a.conversations);
    bump(c, "callAttempts", a.callAttempts);
    bump(c, "callsMade", a.callsMade);
  });
  const rows = [...map.values()];
  const rank = (key) => [...rows].map((r) => ({ name: r.name, n: r[key] })).sort((a, b) => b.n - a.n);
  return {
    hasData: true,
    messages: rank("messages"),
    conversations: rank("conversations"),
    callAttempts: rank("callAttempts"),
    callsMade: rank("callsMade"),
  };
}

// Funil comercial: 6 etapas com contagem, passagem entre etapas e gargalo.
// Cada etapa conta leads que ATINGIRAM aquele ponto ou além (cumulativo).
export function funnelStages(scope, prev) {
  const count = (leads, pred) => leads.filter(pred).length;
  // definições de "atingiu a etapa X ou além"
  const reachedQualified = (l) => l.status === "won" || QUALIFIED_STAGES.includes(l.stageId);
  const reachedScheduled = (l) => l.status === "won" || !!l.proposalAt || ["5f7bd140-ded3-4c42-b5c8-ac873d049f8f", "b56ddf31-3cb0-43d8-aeb3-05e1b54d574a", "284fc2ac-8b2e-4ea5-a61e-5b0abc05e18e", "ec10a5de-7e57-4b02-aedc-f358c468f5b5", "dcddc394-edb2-4cfc-9114-5253790703f1", "cca2e8f5-7d12-4e86-86d4-d93714d66b2b", "79c2206d-ef70-4d19-94c3-f3f82242cf20", "cfc9c90c-be2f-44c6-b7a5-56121efc028d"].includes(l.stageId);
  const reachedPresented = (l) => l.status === "won" || ["284fc2ac-8b2e-4ea5-a61e-5b0abc05e18e", "ec10a5de-7e57-4b02-aedc-f358c468f5b5", "dcddc394-edb2-4cfc-9114-5253790703f1", "cca2e8f5-7d12-4e86-86d4-d93714d66b2b", "79c2206d-ef70-4d19-94c3-f3f82242cf20", "cfc9c90c-be2f-44c6-b7a5-56121efc028d"].includes(l.stageId);
  const reachedVisit = (l) => l.status === "won" || !!l.visitAt || VISIT_STAGES.includes(l.stageId);
  const reachedWon = (l) => l.status === "won";

  const defs = [
    { key: "leads", label: "Leads", pred: () => true },
    { key: "qualified", label: "Qualificados", pred: reachedQualified },
    { key: "scheduled", label: "Agendamentos", pred: reachedScheduled },
    { key: "presented", label: "Apresentações", pred: reachedPresented },
    { key: "visits", label: "Visitas", pred: reachedVisit },
    { key: "won", label: "Fechamentos", pred: reachedWon },
  ];

  const top = scope.length || 1;
  const stages = defs.map((d, i) => {
    const n = count(scope, d.pred);
    const prevN = count(prev, d.pred);
    const deltaPct = prevN ? Math.round(((n - prevN) / prevN) * 100) : (n ? 100 : 0);
    return { ...d, n, deltaPct, fromTop: Math.round((n / top) * 100) };
  });

  // passagem entre etapas consecutivas + detecção de gargalo
  let worst = { label: "", pass: 101 };
  for (let i = 1; i < stages.length; i++) {
    const prevStage = stages[i - 1];
    const pass = prevStage.n ? Math.round((stages[i].n / prevStage.n) * 100) : 0;
    stages[i].passFromPrev = pass;
    // gargalo: menor passagem, ignorando etapas com 0 na origem
    if (prevStage.n > 0 && pass < worst.pass) {
      worst = { label: `${prevStage.label} → ${stages[i].label}`, pass };
    }
  }

  const wonStage = stages[stages.length - 1];
  const totalConv = top ? +((wonStage.n / top) * 100).toFixed(1) : 0;
  const revenue = scope.filter((l) => l.status === "won").reduce((s, l) => s + (l.value ?? 0), 0);

  return { stages, totalConv, bottleneck: worst, revenue };
}

// Motivos de descarte: conta leads que estão nas etapas de descarte,
// no período/origem/produto filtrados (mesma lógica das outras etapas).
export function discardBreakdown(scope) {
  const STAGES = [
    { id: "aa409202-e8a9-4079-8a5f-6bea5426698f", label: "Lead Ruim" },
    { id: "5ee4c055-08ca-422a-888a-bee77255a11b", label: "Fora da localização" },
  ];
  const rows = STAGES.map((s) => ({
    label: s.label,
    n: scope.filter((l) => l.stageId === s.id).length,
  })).sort((a, b) => b.n - a.n);
  const total = rows.reduce((s, r) => s + r.n, 0);
  return { rows, total };
}

export { pipeById };
