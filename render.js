// ============================================================
// Renderização — vanilla. Lê estado, agrega, desenha o DOM.
// ============================================================
import {
  CLIENT, PIPELINES, ORIGINS, PRODUCTS, WINDOW_LABELS, PROFILE_FIELDS,
  applyFilter, applyDimFilters, previousRange, computeKpis, revenueByMonth, evolutionByMonth,
  forecast, heatmap, stagnation, distribution, campaigns, pipelineSummary,
  byConsultant, lossReasons, geography, funnelStages, discardBreakdown,
} from "./app.js?v=9";

const brl = (n) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
const pct = (n) => `${n.toFixed(1).replace(".", ",")}%`;
const el = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; };
const DAYS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
const PAGE_SIZE = 25;

let LEADS = [];
let ACTIVITY = [];
let SYNC_LABEL = "carregando…";
function monthStart() {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), 1).toISOString().slice(0, 10);
}
function todayISO() {
  return new Date().toISOString().slice(0, 10);
}
function daysAgoISO(n) {
  return new Date(Date.now() - n * 86400000).toISOString().slice(0, 10);
}
function lastMonthStart() {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth() - 1, 1).toISOString().slice(0, 10);
}
function lastMonthEnd() {
  const d = new Date();
  // dia 0 do mês atual = último dia do mês anterior
  return new Date(d.getFullYear(), d.getMonth(), 0).toISOString().slice(0, 10);
}

const state = {
  from: monthStart(), to: todayISO(), datePreset: "month", tab: "resultado",
  pipeline: [], origin: [], product: [],
  mw: "6m", ew: "6m", fo: "all", rf: "Pré-Qualificação",
  leStatus: "all", leSearch: "", lePage: 1,
  lePipeline: [], leOrigin: [],
};

export async function boot() {
  const res = await fetch("./leads.json");
  LEADS = await res.json();
  // activity.json é opcional — se não existir, o painel de atividade mostra aviso
  try {
    const ares = await fetch("./activity.json");
    if (ares.ok) ACTIVITY = await ares.json();
  } catch (e) { ACTIVITY = []; }
  render();
  fetchSyncTime();
}

// busca a data do último commit do leads.json via API pública do GitHub
async function fetchSyncTime() {
  const elSync = document.getElementById("sync-time");
  if (!elSync) return;
  try {
    const url = "https://api.github.com/repos/1NortDigital/painel-solpower/commits?path=leads.json&page=1&per_page=1";
    const r = await fetch(url, { headers: { Accept: "application/vnd.github+json" } });
    if (!r.ok) throw new Error("github");
    const data = await r.json();
    const iso = data?.[0]?.commit?.committer?.date || data?.[0]?.commit?.author?.date;
    if (!iso) throw new Error("no date");
    const d = new Date(iso);
    const fmt = d.toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
    SYNC_LABEL = fmt;
    elSync.textContent = fmt;
  } catch (e) {
    SYNC_LABEL = "—";
    elSync.textContent = "—";
  }
}

function set(patch) { Object.assign(state, patch); render(); }

// ---------- charts ----------
// Gráfico de barras (melhor que linha para valores "lumpy" como faturamento)
function barChart(months, values, opts = {}) {
  const W = 760, H = 280, PL = 56, PR = 18, PT = 22, PB = 46;
  const rawMax = Math.max(1, ...values);
  // escala com folga de 15% no topo para a barra não encostar
  const max = rawMax * 1.15;
  const plotW = W - PL - PR, plotH = H - PT - PB;
  const n = months.length;
  const gap = plotW / n * 0.32;
  const bw = plotW / n - gap;
  const x = (i) => PL + (plotW * i) / n + gap / 2;
  const y = (v) => PT + plotH - (plotH * v) / max;
  const fmtFull = (v) => "R$ " + v.toLocaleString("pt-BR");
  const fmtShort = (v) => v >= 1000 ? `R$ ${(v / 1000).toLocaleString("pt-BR", { maximumFractionDigits: 0 })}k` : `R$ ${v}`;
  const fmtM = (iso) => new Date(iso).toLocaleDateString("pt-BR", { month: "short", year: "2-digit" }).replace(".", "");
  const grid = [0, .25, .5, .75, 1];
  const avg = values.reduce((a, b) => a + b, 0) / (values.length || 1);

  let svg = `<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none">`;
  // grid + eixo Y
  grid.forEach((f) => {
    const yy = PT + plotH * f;
    svg += `<line x1="${PL}" y1="${yy}" x2="${W - PR}" y2="${yy}" class="grid-line"/>`;
    svg += `<text x="${PL - 10}" y="${yy + 4}" class="axis-label" text-anchor="end">${fmtShort(Math.round(max * (1 - f)))}</text>`;
  });
  // barras
  values.forEach((v, i) => {
    const bx = x(i);
    let bh = v > 0 ? Math.max((plotH * v) / max, 3) : 0; // altura mínima 3px se houver valor
    const by = PT + plotH - bh;
    const isMax = v === rawMax && v > 0;
    const label = `${fmtM(months[i])}: ${fmtFull(v)}`;
    svg += `<g class="bc-bar" data-tip="${encodeURIComponent(label)}" data-cx="${bx + bw / 2}">`;
    // barra com cantos superiores arredondados (via rect + rx pequeno)
    svg += `<rect x="${bx}" y="${by}" width="${bw}" height="${bh}" rx="3" fill="${isMax ? "#ffc93a" : "#ffb800"}" class="bc-rect"/>`;
    // área de hover cobrindo a coluna inteira (facilita passar o mouse)
    svg += `<rect x="${bx}" y="${PT}" width="${bw}" height="${plotH}" fill="transparent" class="bc-hit"/>`;
    svg += `</g>`;
    // rótulo do mês
    svg += `<text x="${bx + bw / 2}" y="${H - 14}" class="axis-label" text-anchor="middle">${fmtM(months[i])}</text>`;
  });
  // linha de média
  if (opts.avgLine && avg > 0) {
    const ay = y(avg);
    svg += `<line x1="${PL}" y1="${ay}" x2="${W - PR}" y2="${ay}" class="avg-line"/>`;
    svg += `<text x="${W - PR}" y="${ay - 6}" class="avg-label" text-anchor="end">média ${fmtShort(Math.round(avg))}</text>`;
  }
  svg += `</svg>`;
  return `<div class="linechart"><div class="linechart__plot linechart__plot--bars">${svg}<div class="lc-tip" hidden></div></div></div>`;
}

// ativa tooltip das barras
function wireBarTooltips() {
  document.querySelectorAll(".linechart__plot--bars").forEach((plot) => {
    const tip = plot.querySelector(".lc-tip");
    if (!tip) return;
    plot.querySelectorAll(".bc-bar").forEach((bar) => {
      const show = () => {
        tip.innerHTML = decodeURIComponent(bar.getAttribute("data-tip"));
        tip.hidden = false;
      };
      bar.addEventListener("mouseenter", show);
      bar.addEventListener("mousemove", (e) => {
        const rect = plot.getBoundingClientRect();
        let px = e.clientX - rect.left;
        const tw = tip.offsetWidth || 130;
        px = Math.min(Math.max(px + 12, 4), rect.width - tw - 4);
        tip.style.left = px + "px";
        tip.style.top = "10px";
      });
      bar.addEventListener("mouseleave", () => { tip.hidden = true; });
    });
  });
}

function lineChart(months, series, opts = {}) {
  const W = 760, H = 280, PL = 52, PR = 18, PT = 20, PB = 50;
  const max = Math.max(1, ...series.flatMap((s) => s.values));
  const plotW = W - PL - PR, plotH = H - PT - PB;
  const x = (i) => PL + (plotW * i) / Math.max(1, months.length - 1);
  const y = (v) => PT + plotH - (plotH * v) / max;
  const fmt = (v) => opts.currency ? (v >= 1000 ? `R$ ${Math.round(v / 1000)}k` : `R$ ${v}`) : `${v}`;
  const fmtM = (iso) => new Date(iso).toLocaleDateString("pt-BR", { month: "short", year: "2-digit" }).replace(".", "");
  const grid = [0, .25, .5, .75, 1];
  const avg = opts.avgLine ? series[0].values.reduce((a, b) => a + b, 0) / series[0].values.length : 0;
  const uid = "lc" + Math.random().toString(36).slice(2, 8);
  let svg = `<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none">`;
  grid.forEach((f) => {
    const yy = PT + plotH * f;
    svg += `<line x1="${PL}" y1="${yy}" x2="${W - PR}" y2="${yy}" class="grid-line"/>`;
    svg += `<text x="${PL - 8}" y="${yy + 4}" class="axis-label" text-anchor="end">${fmt(Math.round(max * (1 - f)))}</text>`;
  });
  months.forEach((m, i) => { svg += `<text x="${x(i)}" y="${H - 12}" class="axis-label" text-anchor="middle">${fmtM(m)}</text>`; });
  series.forEach((s) => {
    const path = s.values.map((v, i) => `${i ? "L" : "M"} ${x(i)} ${y(v)}`).join(" ");
    if (opts.area) svg += `<path d="${path} L ${x(s.values.length - 1)} ${PT + plotH} L ${x(0)} ${PT + plotH} Z" fill="${s.color}" fill-opacity="0.13"/>`;
    svg += `<path d="${path}" fill="none" stroke="${s.color}" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>`;
  });
  // hover: uma coluna invisível por mês que captura o mouse e mostra todos os valores
  months.forEach((m, i) => {
    const colX = x(i) - plotW / (months.length * 2);
    const colW = plotW / months.length;
    const rows = series.map((s) =>
      `<span style='color:${s.color}'>●</span> ${s.name}: <b>${fmt(s.values[i])}</b>`
    ).join("<br>");
    svg += `<rect class="lc-hit" data-tip="${encodeURIComponent(`<div class='lc-tip__h'>${fmtM(m)}</div>${rows}`)}" data-x="${x(i)}" x="${colX}" y="${PT}" width="${colW}" height="${plotH}" fill="transparent"/>`;
    // linha vertical guia (aparece no hover via css sibling)
  });
  // bolinhas por cima (com hover visual)
  series.forEach((s) => {
    s.values.forEach((v, i) => {
      svg += `<circle class="lc-dot" cx="${x(i)}" cy="${y(v)}" r="3.5" fill="#1b1e22" stroke="${s.color}" stroke-width="2"/>`;
    });
  });
  if (opts.avgLine) {
    svg += `<line x1="${PL}" y1="${y(avg)}" x2="${W - PR}" y2="${y(avg)}" class="avg-line"/>`;
    svg += `<text x="${W - PR}" y="${y(avg) - 5}" class="avg-label" text-anchor="end">média ${fmt(Math.round(avg))}</text>`;
  }
  svg += `</svg>`;
  const legend = series.map((s) => `<span class="linechart__legend-item"><i style="background:${s.color}"></i>${s.name}</span>`).join("");
  return `<div class="linechart" id="${uid}"><div class="linechart__legend">${legend}</div><div class="linechart__plot">${svg}<div class="lc-tip" hidden></div></div></div>`;
}

// ativa tooltips dos gráficos (chamado após render)
function wireChartTooltips() {
  document.querySelectorAll(".linechart__plot").forEach((plot) => {
    const tip = plot.querySelector(".lc-tip");
    if (!tip) return;
    plot.querySelectorAll(".lc-hit").forEach((hit) => {
      hit.addEventListener("mouseenter", () => {
        tip.innerHTML = decodeURIComponent(hit.getAttribute("data-tip"));
        tip.hidden = false;
      });
      hit.addEventListener("mousemove", (e) => {
        const rect = plot.getBoundingClientRect();
        let px = e.clientX - rect.left;
        const ty = e.clientY - rect.top;
        // mantém o tooltip dentro do plot
        const tw = tip.offsetWidth || 140;
        px = Math.min(Math.max(px + 14, 4), rect.width - tw - 4);
        tip.style.left = px + "px";
        tip.style.top = Math.max(ty - 10, 4) + "px";
      });
      hit.addEventListener("mouseleave", () => { tip.hidden = true; });
    });
  });
}

function donut(items, total, unit) {
  const R = 71, C = 2 * Math.PI * R, palette = ["#ffb800", "#f5a623", "#ff6b6b", "#5b9dff", "#2fd3c0"];
  let off = 0, segs = "";
  items.forEach((it, i) => {
    const frac = total ? it.leads / total : 0, col = it.color ?? palette[i % palette.length];
    const p = total ? ((it.leads / total) * 100).toFixed(1) : 0;
    segs += `<circle class="donut-seg" cx="84" cy="84" r="${R}" fill="none" stroke="${col}" stroke-width="26" stroke-dasharray="${frac * C} ${C - frac * C}" stroke-dashoffset="${-off * C}"><title>${it.motivo}: ${it.leads} (${p}%)</title></circle>`;
    off += frac;
  });
  const legend = items.map((it, i) => `<li><span class="loss-legend__dot" style="background:${it.color ?? palette[i % palette.length]}"></span><span>${it.motivo}</span><span class="loss-legend__val">${it.leads} <small>${total ? ((it.leads / total) * 100).toFixed(1) : 0}%</small></span></li>`).join("");
  return `<div class="loss-donut"><svg viewBox="0 0 168 168" style="width:168px;height:168px"><g transform="rotate(-90 84 84)"><circle cx="84" cy="84" r="${R}" fill="none" stroke="rgba(255,255,255,.06)" stroke-width="26"/>${segs}</g><text x="50%" y="48%" text-anchor="middle" class="donut__num">${total}</text><text x="50%" y="63%" text-anchor="middle" class="donut__lbl">${unit}</text></svg><ul class="loss-legend">${legend}</ul></div>`;
}

// ---------- filter controls ----------
function multiSelect(name, label, options) {
  const sel = state[name];
  const btn = sel.length ? `${sel.length} selecionado${sel.length > 1 ? "s" : ""}` : label;
  const wrap = el("div", "ms");
  wrap.innerHTML = `<button class="ms__btn"><span>${btn}</span><span>▾</span></button>`;
  const panel = el("div", "ms__panel");
  panel.style.display = "none";
  options.forEach((o) => {
    const lab = el("label", "ms__opt");
    const checked = sel.includes(o.value) ? "checked" : "";
    lab.innerHTML = `<input type="checkbox" ${checked}/> ${o.label}`;
    lab.querySelector("input").addEventListener("change", (e) => {
      const v = o.value;
      const next = e.target.checked ? [...state[name], v] : state[name].filter((x) => x !== v);
      set({ [name]: next, lePage: 1 });
    });
    panel.appendChild(lab);
  });
  wrap.appendChild(panel);
  wrap.querySelector(".ms__btn").addEventListener("click", () => {
    panel.style.display = panel.style.display === "none" ? "block" : "none";
  });
  document.addEventListener("click", (e) => { if (!wrap.contains(e.target)) panel.style.display = "none"; }, { once: true });
  return wrap;
}

function chips(options, value, param) {
  const wrap = el("div", "winchips");
  Object.entries(options).forEach(([k, lab]) => {
    const b = el("button", `winchip ${k === value ? "winchip--active" : ""}`, lab);
    b.addEventListener("click", () => set({ [param]: k, lePage: 1 }));
    wrap.appendChild(b);
  });
  return wrap;
}

function selectEl(options, value, param, allLabel) {
  const s = el("select", "select");
  const opts = allLabel ? [["all", allLabel], ...options.map((o) => [o, o])] : options.map((o) => [o, o]);
  opts.forEach(([v, l]) => { const o = el("option", null, l); o.value = v; if (v === value) o.selected = true; s.appendChild(o); });
  s.addEventListener("change", (e) => set({ [param]: e.target.value }));
  return s;
}

// Seletor de período: presets rápidos + campos De/Até customizados
function datePeriodControl() {
  const wrap = el("div", "period");
  const presets = [
    { k: "today", label: "Hoje", from: () => todayISO(), to: () => todayISO() },
    { k: "7d", label: "7 dias", from: () => daysAgoISO(6), to: () => todayISO() },
    { k: "lastmonth", label: "Mês passado", from: () => lastMonthStart(), to: () => lastMonthEnd() },
    { k: "month", label: "Este mês", from: () => monthStart(), to: () => todayISO() },
    { k: "all", label: "Tudo", from: () => "2000-01-01", to: () => todayISO() },
  ];

  const chips = el("div", "period__chips");
  presets.forEach((p) => {
    const b = el("button", `winchip ${state.datePreset === p.k ? "winchip--active" : ""}`, p.label);
    b.addEventListener("click", () => set({ datePreset: p.k, from: p.from(), to: p.to() }));
    chips.appendChild(b);
  });
  wrap.appendChild(chips);

  // campos De / Até
  const custom = el("div", "period__custom");
  const fromInput = el("input", "period__date");
  fromInput.type = "date"; fromInput.value = state.from;
  fromInput.addEventListener("change", (e) => set({ from: e.target.value, datePreset: "custom" }));
  const sep = el("span", "period__sep", "→");
  const toInput = el("input", "period__date");
  toInput.type = "date"; toInput.value = state.to;
  toInput.addEventListener("change", (e) => set({ to: e.target.value, datePreset: "custom" }));
  custom.appendChild(fromInput); custom.appendChild(sep); custom.appendChild(toInput);
  wrap.appendChild(custom);

  return wrap;
}

// barras horizontais reutilizável (ranking)
function hbars(rows, opts = {}) {
  const { valueKey = "n", labelKey = "label", format = (v) => v, color = "amber", max: maxOverride } = opts;
  const max = maxOverride ?? Math.max(1, ...rows.map((r) => r[valueKey]));
  if (!rows.length) return `<p class="empty-hint">Sem dados no período.</p>`;
  return `<div class="hbars">` + rows.map((r) =>
    `<div class="hbar" title="${r[labelKey]}: ${format(r[valueKey])}"><span class="hbar__label" title="${r[labelKey]}">${r[labelKey]}</span><div class="track"><div class="bar bar--${color}" style="width:${(r[valueKey] / max) * 100}%"></div></div><span class="hbar__val">${format(r[valueKey])}</span></div>`
  ).join("") + `</div>`;
}

// Painel do funil comercial — a estrela do topo
function funnelPanel(fn) {
  const maxN = fn.stages[0].n || 1;
  const colorFor = (i, isWon, n) => {
    if (isWon) return n > 0 ? "#35c98a" : "#ff6b6b";
    const shades = ["#ffb800", "#ffb800", "#e5a520", "#cc9020", "#a8781c", "#8a5c17"];
    return shades[i] || "#8a5c17";
  };
  const deltaTag = (d) => {
    if (d === 0) return `<span class="fn-delta fn-delta--flat">→ 0%</span>`;
    const up = d > 0;
    return `<span class="fn-delta fn-delta--${up ? "up" : "down"}">${up ? "▲" : "▼"} ${Math.abs(d)}%</span>`;
  };
  const cols = fn.stages.map((s, i) => {
    const isWon = s.key === "won";
    const barW = Math.max(12, Math.round((s.n / maxN) * 100));
    const color = colorFor(i, isWon, s.n);
    const passLine = i > 0 && s.passFromPrev != null ? `<div class="fn-pass">${s.passFromPrev}% da etapa</div>` : "";
    const arrow = i < fn.stages.length - 1 ? `<div class="fn-arrow">›</div>` : "";
    return `<div class="fn-col ${isWon ? "fn-col--won" : ""}">
      <div class="fn-bar" style="width:${barW}%;background:${color}"></div>
      <div class="fn-num" style="${isWon ? `color:${color}` : ""}">${s.n}</div>
      <div class="fn-label">${s.label}</div>
      ${deltaTag(s.deltaPct)}
      ${passLine}
      ${arrow}
    </div>`;
  }).join("");
  return `<section class="funnel">
    <div class="funnel__head"><div><p class="eyebrow">Funil comercial · ${periodLabel()}</p><h2>Do lead ao fechamento</h2></div></div>
    <div class="fn-grid">${cols}</div>
    <div class="fn-foot">
      <div class="fn-foot__item"><span class="fn-foot__label">Conversão total</span><strong style="color:var(--amber)">${fn.totalConv.toFixed(1).replace(".", ",")}%</strong><small>lead → fechamento</small></div>
      <div class="fn-foot__item"><span class="fn-foot__label">Maior gargalo</span><strong>${fn.bottleneck.label || "—"}</strong><small class="fn-foot__warn">${fn.bottleneck.pass <= 100 ? `só ${fn.bottleneck.pass}% passam` : "sem dados"}</small></div>
      <div class="fn-foot__item"><span class="fn-foot__label">Receita ganha</span><strong>${brl(fn.revenue)}</strong><small>no período</small></div>
    </div>
  </section>`;
}
function periodLabel() {
  const map = { today: "hoje", "7d": "últimos 7 dias", lastmonth: "mês passado", month: "neste mês", all: "todo período", custom: "período personalizado" };
  return map[state.datePreset] || "período";
}

const delta = (v, unit) => {
  const cls = v === 0 ? "delta--flat" : v > 0 ? "delta--up" : "delta--down";
  const arrow = v === 0 ? "→" : v > 0 ? "▲" : "▼";
  const val = unit === "pct" ? `${v > 0 ? "+" : ""}${v}%` : `${v > 0 ? "+" : ""}${v.toFixed(1).replace(".", ",")} p.p.`;
  return `<span class="delta ${cls}">${arrow} ${val}</span>`;
};

// ---------- render ----------
function render() {
  const root = document.getElementById("app");
  root.innerHTML = "";
  const f = state;
  const scope = applyFilter(LEADS, f);
  // leads filtrados por origem/produto/pipeline (mas SEM data) — para os
  // gráficos que têm janela temporal própria respeitarem esses filtros
  const dimLeads = applyDimFilters(LEADS, f);
  const pr = previousRange(f.from, f.to);
  const prev = applyFilter(LEADS, { ...f, from: pr.from, to: pr.to });
  const k = computeKpis(scope, prev);
  const rev = revenueByMonth(dimLeads, f.mw);
  const evo = evolutionByMonth(dimLeads, f.ew);
  const fc = forecast(dimLeads);
  const hm = heatmap(scope);
  const stag = stagnation(dimLeads, f.rf);
  const camps = campaigns(scope);
  const consult = byConsultant(scope);
  const losses = lossReasons(scope);
  const geo = geography(scope);

  const shell = el("main", "page-shell");

  // topbar
  shell.appendChild(el("div", "topbar", `
    <div class="brand">
      <span class="brand__mark">
        <img src="./logo-1nort.png" alt="1Nort" width="34" height="34" />
      </span>
      <span class="brand__divider"></span>
      <span class="brand__client"><span>Cliente</span><strong>${CLIENT.name}</strong></span>
    </div>
    <div class="topbar__sync">Última sincronização<strong id="sync-time">${SYNC_LABEL}</strong></div>`));

  // hero
  shell.appendChild(el("section", "hero", `
    <div>${CLIENT.eyebrow ? `<p class="eyebrow">${CLIENT.eyebrow}</p>` : ""}<h1>${CLIENT.name}</h1>${CLIENT.subtitle ? `<p class="hero__copy">${CLIENT.subtitle}</p>` : ""}</div>
    <div class="hero__meta">
      <div><span>Leads no período</span><strong>${k.leads}</strong></div>
      <div><span>Receita ganha</span><strong>${brl(k.wonValue)}</strong></div>
      <div><span>Fechamento</span><strong>${pct(k.closeRate)}</strong></div>
    </div>`));

  // filtros
  const filters = el("div", "filters");
  const addFilter = (labelText, control) => {
    const lab = el("label"); if (labelText) lab.appendChild(el("span", null, labelText)); lab.appendChild(control); filters.appendChild(lab);
  };
  addFilter("", datePeriodControl());
  addFilter("Pipeline", multiSelect("pipeline", "Todos", PIPELINES.map((p) => ({ value: p.id, label: p.label }))));
  addFilter("Origem", multiSelect("origin", "Todas", ORIGINS.map((o) => ({ value: o, label: o }))));
  addFilter("Produto", multiSelect("product", "Todos", PRODUCTS.map((p) => ({ value: p, label: p }))));
  shell.appendChild(filters);
  shell.appendChild(el("p", "compare-note", `Variações comparadas ao período anterior de mesmo tamanho (${pr.from} a ${pr.to}).`));

  // ===== FUNIL — a estrela do topo =====
  const fn = funnelStages(scope, prev);
  shell.insertAdjacentHTML("beforeend", funnelPanel(fn));

  // value strip (logo abaixo do funil)
  shell.appendChild(el("section", "value-strip", `
    <article class="value-card value-card--won"><span class="value-card__label">Receita ganha</span><strong>${brl(k.wonValue)}</strong><div class="value-card__foot"><span>${k.wonCount} fechados</span><span>Ticket ${brl(k.wonTicket)}</span></div></article>
    <article class="value-card value-card--open"><span class="value-card__label">Valor em aberto</span><strong>${brl(k.openValue)}</strong><div class="value-card__foot"><span>em andamento</span><span>Ticket ${brl(k.openTicket)}</span></div></article>
    <article class="value-card value-card--lost"><span class="value-card__label">Negócios perdidos</span><strong>${k.lostCount}</strong><div class="value-card__foot"><span>no recorte</span></div></article>`));

  // KPIs detalhados — descem para a aba Resultado
  const kpiGrid = el("section", "metrics-grid metrics-grid--six", `
    <article class="metric-card"><span class="metric-card__label">Leads</span><strong class="metric-card__value">${k.leads}</strong><span class="metric-card__helper">${delta(k.delta.leads, "pct")} ${k.openCount} abertos</span></article>
    <article class="metric-card metric-card--teal"><span class="metric-card__label">Leads qualificados</span><strong class="metric-card__value">${pct(k.qualRate)}</strong><span class="metric-card__helper">${k.qualified} qualificados</span></article>
    <article class="metric-card metric-card--teal"><span class="metric-card__label">Orçamentos enviados</span><strong class="metric-card__value">${pct(k.orcRate)}</strong><span class="metric-card__helper">${delta(k.delta.orc, "pp")} ${k.proposals} propostas</span></article>
    <article class="metric-card"><span class="metric-card__label">Taxa de visita</span><strong class="metric-card__value">${pct(k.visitRate)}</strong><span class="metric-card__helper">${delta(k.delta.visit, "pp")} ${k.visits} visitas</span></article>
    <article class="metric-card metric-card--blue"><span class="metric-card__label">Taxa de fechamento</span><strong class="metric-card__value">${pct(k.closeRate)}</strong><span class="metric-card__helper">${delta(k.delta.close, "pp")} ${k.wonCount} ganhos</span></article>
    <article class="metric-card metric-card--rose"><span class="metric-card__label">Ciclo médio (ganho)</span><strong class="metric-card__value">${k.avgCycle} dias</strong><span class="metric-card__helper">Entrada → ganho • ${k.wonCount} fechados</span></article>`);

  // ===== ABAS =====
  const TABS = [
    { k: "resultado", label: "Resultado", icon: "📊" },
    { k: "atividade", label: "Atividade", icon: "⚡" },
    { k: "aquisicao", label: "Aquisição", icon: "🎯" },
  ];
  const tabNav = el("nav", "tabs");
  TABS.forEach((t) => {
    const b = el("button", `tab ${state.tab === t.k ? "tab--active" : ""}`, `${t.label}`);
    b.addEventListener("click", () => set({ tab: t.k }));
    tabNav.appendChild(b);
  });
  shell.appendChild(tabNav);

  // containers das 3 abas — só o ativo é exibido
  const tabResultado = el("div", `tab-panel ${state.tab === "resultado" ? "" : "tab-panel--hidden"}`);
  const tabAtividade = el("div", `tab-panel ${state.tab === "atividade" ? "" : "tab-panel--hidden"}`);
  const tabAquisicao = el("div", `tab-panel ${state.tab === "aquisicao" ? "" : "tab-panel--hidden"}`);
  shell.appendChild(tabResultado);
  shell.appendChild(tabAtividade);
  shell.appendChild(tabAquisicao);

  // faturamento
  const fatPanel = el("section", "panel");
  const fatHead = el("div", "panel__header", `<div><p class="eyebrow">Faturamento</p><h2>Receita ganha por mês</h2></div>`);
  fatHead.appendChild(chips(WINDOW_LABELS, f.mw, "mw"));
  fatPanel.appendChild(fatHead);
  fatPanel.insertAdjacentHTML("beforeend", barChart(rev.months, rev.values, { avgLine: true }));
  tabResultado.appendChild(kpiGrid);
  tabResultado.appendChild(fatPanel);

  // evolução + forecast
  const twoCol = el("section", "two-col");
  const evoPanel = el("article", "panel");
  const evoHead = el("div", "panel__header", `<div><p class="eyebrow">Evolução</p><h2>Leads, propostas e fechamentos</h2></div>`);
  evoHead.appendChild(chips(WINDOW_LABELS, f.ew, "ew"));
  evoPanel.appendChild(evoHead);
  evoPanel.insertAdjacentHTML("beforeend", lineChart(evo.months, [
    { name: "Leads", color: "#f5a623", values: evo.leads },
    { name: "Qualificados", color: "#bb8fff", values: evo.qualified },
    { name: "Propostas", color: "#2fd3c0", values: evo.proposals },
    { name: "Fechamentos", color: "#5b9dff", values: evo.closes },
  ]));
  twoCol.appendChild(evoPanel);

  const fcPanel = el("article", "panel");
  const fcHead = el("div", "panel__header", `<div><p class="eyebrow">Previsibilidade</p><h2>Projeção 3 meses</h2></div>`);
  fcPanel.appendChild(fcHead);
  fcPanel.insertAdjacentHTML("beforeend", `
    <p class="forecast__basis">Base: últimos 3 meses · orç. ${pct(fc.orcRate)} · fech. ${pct(fc.closeRate)}</p>
    <div class="forecast__grid">
      <div><span>Leads / mês</span><strong>${fc.leadsMo}</strong></div>
      <div><span>Propostas / mês</span><strong>${fc.propMo}</strong></div>
      <div><span>Vendas / mês</span><strong>${fc.salesMo}</strong></div>
      <div><span>Receita / mês</span><strong>${brl(fc.revMo)}</strong></div>
    </div>
    <div class="forecast__total"><span>Projeção 3 meses (mesmo ritmo)</span><strong>${fc.proj3Sales} vendas • ${brl(fc.proj3Rev)}</strong></div>`);
  twoCol.appendChild(fcPanel);
  tabResultado.appendChild(twoCol);

  // campanhas
  const campPanel = el("section", "panel", `<div class="panel__header"><div><p class="eyebrow">Aquisição paga</p><h2>Desempenho por campanha (UTM)</h2></div><p class="panel__hint">Qual campanha traz lead que vira proposta e venda.</p></div>`);
  const ctable = el("div", "ctable");
  ctable.innerHTML = `<div class="ctable__head"><span>Campanha</span><span>Leads</span><span>Propostas</span><span>Ganhos</span><span>Orçamento</span><span>Fechamento</span></div>` +
    camps.map((c) => `<div class="ctable__row"><span class="ctable__name">${c.name}</span><span>${c.leads}</span><span>${c.proposals}</span><span>${c.won}</span><span class="ctable__rate">${pct(c.orcRate)}</span><span class="ctable__rate">${pct(c.closeRate)}</span></div>`).join("");
  campPanel.appendChild(ctable);
  tabAquisicao.appendChild(campPanel);

  // perfil
  const profPanel = el("section", "panel", `<div class="panel__header"><div><p class="eyebrow">Perfil do cliente</p><h2>Quem são os leads</h2></div><p class="panel__hint">Distribuição dos campos comerciais (entre leads preenchidos).</p></div>`);
  const pgrid = el("div", "profile-grid");
  ["product", "payment", "clientType", "telhado"].forEach((key, ki) => {
    const d = distribution(scope, key);
    const barCls = ["amber", "teal", "blue", "red"][ki];
    const maxN = d.rows[0]?.n ?? 1;
    const rows = d.rows.slice(0, 5).map((r) => `<div class="distro__row" title="${r.label}: ${r.n} (${d.filled ? ((r.n / d.filled) * 100).toFixed(0) : 0}%)"><span class="distro__label" title="${r.label}">${r.label}</span><div class="track"><div class="bar bar--${barCls}" style="width:${(r.n / maxN) * 100}%"></div></div><span class="distro__val">${r.n} <small>${d.filled ? ((r.n / d.filled) * 100).toFixed(0) : 0}%</small></span></div>`).join("");
    pgrid.insertAdjacentHTML("beforeend", `<article class="distro"><div class="distro__head"><strong>${PROFILE_FIELDS[key]}</strong><span>${d.pctFilled.toFixed(1)}% preenchido</span></div><div>${rows}</div></article>`);
  });
  profPanel.appendChild(pgrid);
  tabAquisicao.appendChild(profPanel);

  // pipelines
  // consultores — 3 rankings
  const consPanel = el("section", "panel", `<div class="panel__header"><div><p class="eyebrow">Time comercial</p><h2>Desempenho por consultor</h2></div><p class="panel__hint">Ranking do consultor responsável por cada lead.</p></div>`);
  const consGrid = el("div", "three-col");
  consGrid.innerHTML = `
    <div class="rank-block"><h3 class="rank-block__title">Vendas</h3>${hbars(consult.bySales.slice(0, 8), { valueKey: "sales", labelKey: "name", color: "amber" })}</div>
    <div class="rank-block"><h3 class="rank-block__title">Propostas apresentadas</h3>${hbars(consult.byProposals.slice(0, 8), { valueKey: "proposals", labelKey: "name", color: "teal" })}</div>
    <div class="rank-block"><h3 class="rank-block__title">Vendas em R$</h3>${hbars(consult.byRevenue.slice(0, 8), { valueKey: "revenue", labelKey: "name", color: "blue", format: (v) => brl(v) })}</div>`;
  consPanel.appendChild(consGrid);
  tabResultado.appendChild(consPanel);

  // motivos das perdas + geografia lado a lado
  const lossGeoRow = el("section", "two-col");
  const lossPanel = el("article", "panel", `<div class="panel__header"><div><p class="eyebrow">Perdas</p><h2>Motivo das perdas</h2></div></div>`);
  if (losses.total) {
    lossPanel.insertAdjacentHTML("beforeend", donut(losses.items.slice(0, 6), losses.total, "perdas"));
  } else {
    lossPanel.insertAdjacentHTML("beforeend", `<p class="empty-hint">Nenhuma perda registrada no período.</p>`);
  }
  lossGeoRow.appendChild(lossPanel);

  const geoPanel = el("article", "panel", `<div class="panel__header"><div><p class="eyebrow">Geografia</p><h2>Onde estão os clientes</h2></div><p class="panel__hint">${geo.distinct} localidades distintas.</p></div>`);
  geoPanel.insertAdjacentHTML("beforeend", hbars(geo.rows, { valueKey: "n", labelKey: "label", color: "amber" }));
  lossGeoRow.appendChild(geoPanel);
  tabResultado.appendChild(lossGeoRow);

  // painel de descarte: Lead Ruim + Fora da localização (barras)
  const disc = discardBreakdown(scope);
  const discPanel = el("section", "panel", `<div class="panel__header"><div><p class="eyebrow">Descarte</p><h2>Motivos de descarte</h2></div><p class="panel__hint">${disc.total} leads descartados no período.</p></div>`);
  discPanel.insertAdjacentHTML("beforeend", hbars(disc.rows, { valueKey: "n", labelKey: "label", color: "rose" }));
  tabResultado.appendChild(discPanel);

  // heatmap
  const hmPanel = el("section", "panel", `<div class="panel__header"><div><p class="eyebrow">Atendimento</p><h2>Quando os leads chegam</h2></div><p class="panel__hint">Dia × hora. Mais escuro = mais leads. Orienta a escala.</p></div>`);
  const maxN = Math.max(1, ...hm.grid.flat());
  const bg = (n) => n === 0 ? "rgba(255,255,255,0.03)" : `rgba(255,184,0,${0.15 + (n / maxN) * 0.75})`;
  let hmHtml = `<div class="heatmap"><div class="heatmap__hours"><span></span>${Array.from({ length: 24 }, (_, h) => `<span class="heatmap__hour">${h}</span>`).join("")}</div>`;
  DAYS.forEach((d, dy) => {
    hmHtml += `<div class="heatmap__row"><span class="heatmap__day">${d}</span>${hm.grid[dy].map((n, hr) => `<span class="heatmap__cell" title="${d} ${hr}h — ${n} leads" style="background:${bg(n)}"></span>`).join("")}</div>`;
  });
  const bestDay = hm.dayTotals.indexOf(Math.max(...hm.dayTotals));
  hmHtml += `<div class="heatmap__footer"><div class="heatmap__legend"><span>Menos</span>${[0.15, 0.35, 0.55, 0.75, 0.95].map((o) => `<i style="background:rgba(255,184,0,${o})"></i>`).join("")}<span>Mais</span></div><div class="heatmap__highlights"><div class="hl-chip"><span class="hl-chip__label">🔥 Pico</span><strong>${DAYS[hm.peak.day]} ${hm.peak.hour}h</strong><span class="hl-chip__sub">${hm.peak.n} leads</span></div><div class="hl-chip"><span class="hl-chip__label">Melhor dia</span><strong>${DAYS[bestDay]}</strong><span class="hl-chip__sub">${hm.dayTotals[bestDay]} leads</span></div></div></div></div>`;
  hmPanel.insertAdjacentHTML("beforeend", hmHtml);
  tabAtividade.appendChild(hmPanel);

  // quem agir
  const actCol = el("section", "two-col two-col--wide");
  const actPanel = el("article", "panel");
  const actHead = el("div", "panel__header", `<div><p class="eyebrow">Ação ativa</p><h2>Quem agir em ${f.rf}</h2></div>`);
  actHead.appendChild(selectEl(PIPELINES.map((p) => p.label), f.rf, "rf", "Todos os funis"));
  actPanel.appendChild(actHead);
  actPanel.insertAdjacentHTML("beforeend", `<p class="panel__hint">Leads abertos por tempo sem movimentação. ${stag.over15} há mais de 15 dias parados.</p><div class="rep-buckets"><div class="rep-bucket"><strong>${stag.buckets["0-7"]}</strong><span>0-7 dias</span></div><div class="rep-bucket"><strong>${stag.buckets["8-15"]}</strong><span>8-15 dias</span></div><div class="rep-bucket rep-bucket--alert"><strong>${stag.buckets["16-30"]}</strong><span>16-30 dias</span></div><div class="rep-bucket rep-bucket--alert"><strong>${stag.buckets["+30"]}</strong><span>+30 dias</span></div></div>`);
  actCol.appendChild(actPanel);
  const priPanel = el("article", "panel", `<div class="panel__header"><div><p class="eyebrow">Prioridade</p><h2>Mais tempo sem mexer</h2></div></div>`);
  priPanel.insertAdjacentHTML("beforeend", `<div class="rep-list">${stag.top.map(({ lead, d }) => `<div class="rep-row"><div><strong>${lead.name}</strong></div><strong class="rep-row__days">${d}d</strong></div>`).join("")}</div>`);
  actCol.appendChild(priPanel);
  tabAtividade.appendChild(actCol);

  // explorador
  const exp = LEADS.filter((l) => {
    const base = l.createdAt.slice(0, 10);
    if (base < f.from || base > f.to) return false;
    if (f.leStatus !== "all" && l.status !== f.leStatus) return false;
    if (f.lePipeline.length && !f.lePipeline.includes(l.pipelineId)) return false;
    if (f.leOrigin.length && !f.leOrigin.includes(l.origin ?? "Sem origem")) return false;
    if (f.leSearch && !l.name.toLowerCase().includes(f.leSearch.toLowerCase())) return false;
    return true;
  });
  const totalPages = Math.max(1, Math.ceil(exp.length / PAGE_SIZE));
  const page = Math.min(f.lePage, totalPages);
  const rows = exp.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const expPanel = el("section", "panel");
  expPanel.appendChild(el("div", "panel__header", `<div><p class="eyebrow">Explorador</p><h2>Leads — gerenciador de filtros</h2><p class="panel__hint">Monte listas e abra cada lead no Kommo. ${exp.length} leads no filtro.</p></div>`));
  const lefilters = el("div", "le-filters");
  const searchLab = el("label", "le-field le-field--wide"); searchLab.appendChild(el("span", null, "Buscar"));
  const searchInput = el("input", "search-input"); searchInput.placeholder = "Buscar por nome…"; searchInput.value = f.leSearch;
  searchInput.addEventListener("keydown", (e) => { if (e.key === "Enter") set({ leSearch: e.target.value, lePage: 1 }); });
  searchLab.appendChild(searchInput); lefilters.appendChild(searchLab);
  const statusLab = el("label", "le-field"); statusLab.appendChild(el("span", null, "Situação"));
  statusLab.appendChild(chips({ all: "Todos", open: "Abertos", won: "Ganhos", lost: "Perdidos" }, f.leStatus, "leStatus"));
  lefilters.appendChild(statusLab);
  const pipeLab = el("label", "le-field"); pipeLab.appendChild(el("span", null, "Pipeline"));
  pipeLab.appendChild(multiSelect("lePipeline", "Todos", PIPELINES.map((p) => ({ value: p.id, label: p.label }))));
  lefilters.appendChild(pipeLab);
  expPanel.appendChild(lefilters);

  const tableWrap = el("div", "le-table-wrap");
  tableWrap.innerHTML = `<table class="le-table"><thead><tr><th>Nome</th><th>Funil</th><th>Origem</th><th>Produto</th><th class="le-num">Valor</th><th>Criação</th><th></th></tr></thead><tbody>${rows.map((l) => {
    const pipe = PIPELINES.find((p) => p.id === l.pipelineId);
    const st = l.status === "won" ? "Ganho" : l.status === "lost" ? "Perdido" : "Aberto";
    return `<tr><td><strong class="le-name">${l.name}</strong><span class="le-status le-status--${l.status}">${st}</span></td><td class="le-muted">${pipe?.label ?? "—"}</td><td class="le-muted">${l.origin ?? "—"}</td><td class="le-muted">${l.product ?? "—"}</td><td class="le-num">${l.value ? brl(l.value) : "—"}</td><td class="le-muted">${new Date(l.createdAt).toLocaleDateString("pt-BR")}</td><td class="le-num"><a class="le-open" href="${CLIENT.crmLeadUrl(l.id)}" target="_blank" rel="noopener">Abrir ↗</a></td></tr>`;
  }).join("")}</tbody></table>`;
  expPanel.appendChild(tableWrap);
  const pager = el("div", "le-pager");
  const prevBtn = el("button", null, "← Anterior"); prevBtn.disabled = page <= 1; prevBtn.addEventListener("click", () => set({ lePage: page - 1 }));
  const nextBtn = el("button", null, "Próxima →"); nextBtn.disabled = page >= totalPages; nextBtn.addEventListener("click", () => set({ lePage: page + 1 }));
  pager.appendChild(prevBtn); pager.appendChild(el("span", "le-pager__info", `Página ${page} de ${totalPages}`)); pager.appendChild(nextBtn);
  expPanel.appendChild(pager);
  tabAquisicao.appendChild(expPanel);

  // ===== ABA ATIVIDADE: mensagens por consultor (Robô incluído) =====
  const actInPeriod = ACTIVITY.filter((a) => a.day >= f.from && a.day <= f.to);
  if (actInPeriod.length) {
    const byC = new Map();
    actInPeriod.forEach((a) => {
      if (!byC.has(a.consultor)) byC.set(a.consultor, { name: a.consultor, messages: 0, conversations: 0 });
      const r = byC.get(a.consultor);
      r.messages += a.messages || 0;
      r.conversations += a.conversations || 0;
    });
    const rows = [...byC.values()];
    const msgRank = [...rows].map((r) => ({ name: r.name, n: r.messages })).sort((a, b) => b.n - a.n);
    const convRank = [...rows].map((r) => ({ name: r.name, n: r.conversations })).sort((a, b) => b.n - a.n);
    const totalMsg = rows.reduce((s, r) => s + r.messages, 0);
    const roboMsg = byC.get("Robô")?.messages || 0;
    const roboPct = totalMsg ? Math.round((roboMsg / totalMsg) * 100) : 0;

    const actPanel = el("section", "panel", `<div class="panel__header"><div><p class="eyebrow">Time comercial</p><h2>Mensagens enviadas por consultor</h2></div><p class="panel__hint">${roboPct}% das mensagens saíram pelo Robô. ${roboPct >= 95 ? "A equipe quase não atende pela plataforma." : ""}</p></div>`);
    const actGrid = el("div", "two-col");
    actGrid.innerHTML = `
      <div class="rank-block"><h3 class="rank-block__title">Mensagens enviadas</h3>${hbars(msgRank.slice(0, 10), { valueKey: "n", labelKey: "name", color: "teal" })}</div>
      <div class="rank-block"><h3 class="rank-block__title">Conversas processadas</h3>${hbars(convRank.slice(0, 10), { valueKey: "n", labelKey: "name", color: "amber" })}</div>`;
    actPanel.appendChild(actGrid);
    tabAtividade.appendChild(actPanel);
  } else {
    tabAtividade.appendChild(el("section", "panel", `<div class="panel__header"><div><p class="eyebrow">Time comercial</p><h2>Mensagens por consultor</h2></div></div><p class="empty-hint">Sem dados de mensagens no período selecionado. ${ACTIVITY.length ? "Tente um período mais amplo." : "O fluxo de atividade ainda não foi executado."}</p>`));
  }

  shell.appendChild(el("div", "foot", `<b>1</b><i>Nort</i> • Marketing e Vendas`));

  root.appendChild(shell);
  wireChartTooltips();
  wireBarTooltips();
}
