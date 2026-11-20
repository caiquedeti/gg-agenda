/* =====================================================================
   G&G Agenda — Front-end (consome a Minimal API em /api)
   ===================================================================== */
(() => {
  "use strict";

  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
  const root = document.documentElement;

  const DOCK_MIN = 1500;   // a partir daqui o painel direito fica "encaixado" no layout
  const MOBILE_MAX = 860;

  const state = {
    listas: { advogados: [], clientes: [], processos: [], modalidades: [] },
    itens: [],            // resultado filtrado (Visão Geral)
    todos: [],            // agenda completa (painel direito / calendário)
    totalAgendados: 0,
    totalEncontrados: 0,
    modo: lsGet("gg-modo") || "cards",
    calMes: null,
  };

  const titulos = { agenda: "Visão Geral", novo: "Novo Compromisso", admin: "Administração" };
  const MESES = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
  const MES_ABR = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
  const DIAS = ["domingo", "segunda-feira", "terça-feira", "quarta-feira", "quinta-feira", "sexta-feira", "sábado"];

  // ---------------------------------------------------------------- util
  function lsGet(k) { try { return localStorage.getItem(k); } catch { return null; } }
  function lsSet(k, v) { try { localStorage.setItem(k, v); } catch { /* ignore */ } }

  function esc(v) {
    return String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  }
  function icons() { if (window.lucide) window.lucide.createIcons(); }

  const pad = (n) => String(n).padStart(2, "0");
  const isoDe = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const hojeISO = () => isoDe(new Date());
  const parseISO = (iso) => { const [y, m, d] = iso.split("-").map(Number); return new Date(y, m - 1, d); };
  const dataCurta = (iso) => { const [y, m, d] = iso.split("-"); return `${d}/${m}/${y}`; };

  function dataLonga(iso) {
    const d = parseISO(iso);
    const t = `${DIAS[d.getDay()]}, ${d.getDate()} de ${MESES[d.getMonth()]} de ${d.getFullYear()}`;
    return t[0].toUpperCase() + t.slice(1);
  }

  function rotuloDia(iso) {
    const diff = Math.round((parseISO(iso) - parseISO(hojeISO())) / 86400000);
    if (diff === 0) return "Hoje";
    if (diff === 1) return "Amanhã";
    if (diff === -1) return "Ontem";
    return diff > 1 ? `Em ${diff} dias` : `Há ${Math.abs(diff)} dias`;
  }

  function iniciais(nome) {
    return String(nome).replace(/^(Dra?\.?)\s+/i, "").split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]).join("").toUpperCase();
  }

  const ordenar = (lista) => [...lista].sort((a, b) => (a.data + a.horaInicio).localeCompare(b.data + b.horaInicio));

  async function api(url, opts = {}) {
    const resp = await fetch(url, { headers: { "Content-Type": "application/json" }, ...opts });
    let corpo = null;
    try { corpo = await resp.json(); } catch { /* sem corpo */ }
    if (!resp.ok) throw new Error(corpo?.mensagem || corpo?.title || `Falha na comunicação com o servidor (HTTP ${resp.status}).`);
    return corpo;
  }

  // ---------------------------------------------------------------- toasts
  function toast(tipo, titulo, mensagem) {
    const el = document.createElement("div");
    el.className = `toast ${tipo}`;
    el.setAttribute("role", tipo === "error" ? "alert" : "status");
    el.innerHTML = `
      <div class="t-icon"><i data-lucide="${tipo === "success" ? "check" : "circle-alert"}"></i></div>
      <div><strong>${esc(titulo)}</strong><p>${esc(mensagem)}</p></div>
      <button class="t-close" aria-label="Fechar"><i data-lucide="x"></i></button>`;
    $("#toasts").appendChild(el);
    icons();
    const fechar = () => { el.classList.add("out"); setTimeout(() => el.remove(), 250); };
    el.querySelector(".t-close").addEventListener("click", fechar);
    setTimeout(fechar, tipo === "error" ? 6500 : 4000);
  }
  const limparMsg = (m) => String(m || "").replace(/^(Erro|Sucesso):\s*/i, "").replace(/^✅\s*/, "");

  // ---------------------------------------------------------------- layout: menu e painel retráteis
  const isDock = () => window.innerWidth >= DOCK_MIN;

  function toggleNav(force, salvar = true) {
    const recolher = force ?? !root.classList.contains("nav-collapsed");
    root.classList.toggle("nav-collapsed", recolher);
    if (salvar) lsSet("gg-nav", recolher ? "collapsed" : "expanded");
    const b = $("#btn-collapse");
    b.title = recolher ? "Expandir menu ( [ )" : "Recolher menu ( [ )";
    b.setAttribute("aria-label", recolher ? "Expandir menu" : "Recolher menu");
  }

  const isMobile = () => window.innerWidth <= MOBILE_MAX;

  function setPanel(aberto) {
    if (isMobile()) aberto = false;   // no celular/tablet o painel não é exibido
    root.classList.toggle("panel-open", aberto);
    if (isDock()) lsSet("gg-panel", aberto ? "open" : "closed");
    $("#btn-panel").classList.toggle("on", aberto);
    $("#btn-panel").setAttribute("aria-expanded", String(aberto));
  }
  const togglePanel = () => setPanel(!root.classList.contains("panel-open"));

  let eraDock = isDock();
  function aoRedimensionar() {
    if (isMobile() && root.classList.contains("panel-open")) setPanel(false);
    const dock = isDock();
    if (dock !== eraDock) {
      // ao virar gaveta, começa fechada; ao voltar a encaixar, respeita a preferência salva
      setPanel(dock ? lsGet("gg-panel") !== "closed" : false);
      eraDock = dock;
    }
  }

  // ---------------------------------------------------------------- navegação
  function rota() {
    const view = (location.hash || "#agenda").slice(1);
    const atual = titulos[view] ? view : "agenda";
    $$(".view").forEach((v) => (v.hidden = v.id !== `view-${atual}`));
    $$(".nav-item[data-view], .bottom-nav [data-view]").forEach((a) => a.classList.toggle("active", a.dataset.view === atual));
    $("#page-title").textContent = titulos[atual];
    $("#btn-top-novo").hidden = atual === "novo";
    document.title = `${titulos[atual]} · G&G Agenda`;
    if (atual === "novo" && window.innerWidth > MOBILE_MAX) setTimeout(() => $("#f-titulo").focus(), 60);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  // ---------------------------------------------------------------- listas / selects
  async function carregarListas() {
    state.listas = await api("/api/listas");
    preencherSelects();
    renderAdmin();
    atualizarContadoresCadastro();
  }

  function atualizarContadoresCadastro() {
    $("#stat-adv").textContent = state.listas.advogados.length;
    $("#stat-proc").textContent = state.listas.processos.length;
  }

  function opcoes(select, itens, placeholder) {
    const atual = select.value;
    select.innerHTML = `<option value="">${esc(placeholder)}</option>` +
      itens.map((i) => `<option value="${esc(i)}">${esc(i)}</option>`).join("");
    if (itens.includes(atual)) select.value = atual;
  }

  function preencherSelects() {
    const { advogados, clientes, processos, modalidades } = state.listas;
    opcoes($("#filtro-advogado"), advogados, "Todos os advogados");
    opcoes($("#f-advogado"), advogados, "Selecione o advogado");
    opcoes($("#f-cliente"), clientes, "Selecione o cliente");
    opcoes($("#f-processo"), processos, "Selecione o processo");

    const box = $("#f-modalidade");
    const marcada = box.querySelector("input:checked")?.value;
    box.innerHTML = modalidades.map((m, i) => `
      <div class="pill">
        <input type="radio" name="modalidade" id="mod-${i}" value="${esc(m)}" ${m === marcada ? "checked" : ""} />
        <label for="mod-${i}"><i data-lucide="${m === "Remota" ? "video" : "map-pin"}"></i>${esc(m)}</label>
      </div>`).join("");
    icons();
    atualizarPreview();
  }

  // ---------------------------------------------------------------- agenda (Visão Geral)
  async function carregarAgenda() {
    const params = new URLSearchParams();
    const data = $("#filtro-data").value;
    const adv = $("#filtro-advogado").value;
    if (data) params.set("data", data);
    if (adv) params.set("advogado", adv);

    const r = await api(`/api/compromissos${params.toString() ? "?" + params : ""}`);
    state.itens = r.itens;
    state.totalAgendados = r.totalAgendados;
    state.totalEncontrados = r.totalEncontrados;
    renderAgenda();
    renderCalendario();
  }

  async function carregarTodos() {
    const r = await api("/api/compromissos");
    state.todos = r.itens;
    renderPainel();
  }

  function badge(mod) {
    const remota = mod === "Remota";
    return `<span class="badge ${remota ? "badge-remota" : "badge-presencial"}"><i data-lucide="${remota ? "video" : "map-pin"}"></i>${esc(mod)}</span>`;
  }

  function cardHTML(c, delay = 0, mostrarData = false) {
    return `
      <article class="appt ${c.modalidade === "Remota" ? "remota" : ""}" style="animation-delay:${delay}ms">
        <div class="appt-top">
          <span class="appt-time"><i data-lucide="clock-3"></i>${esc(c.horaInicio)} <span>– ${esc(c.horaFim)}</span></span>
          ${badge(c.modalidade)}
        </div>
        <h4 class="appt-title">${esc(c.titulo)}</h4>
        <div class="appt-meta">
          <div><i data-lucide="user-round"></i><span>${esc(c.cliente)}</span></div>
          <div><i data-lucide="folder-open"></i><span class="mono">${esc(c.numeroProcesso)}</span></div>
          ${mostrarData ? `<div><i data-lucide="calendar"></i><span>${esc(c.dataFormatada)}</span></div>` : ""}
        </div>
        <div class="appt-foot"><span class="avatar">${esc(iniciais(c.advogado))}</span><span class="who">${esc(c.advogado)}</span></div>
      </article>`;
  }

  function vazioHTML() {
    const fData = $("#filtro-data").value, fAdv = $("#filtro-advogado").value;
    if (state.totalAgendados === 0) {
      return `<div class="empty"><div class="empty-art"><img src="assets/logo-gg.png" alt="" /></div>
        <h3>Não há compromissos na agenda!</h3>
        <p>Comece agendando a primeira audiência, reunião ou atendimento da equipe.</p>
        <a href="#novo" class="btn btn-gold"><i data-lucide="calendar-plus"></i>Novo compromisso</a></div>`;
    }
    const motivo = fData && fAdv ? "Nenhum compromisso encontrado para esta data e advogado."
      : fData ? "Nenhum compromisso encontrado para esta data."
      : "Nenhum compromisso encontrado para este advogado.";
    return `<div class="empty"><div class="empty-art"><img src="assets/logo-gg.png" alt="" /></div>
      <h3>${motivo}</h3><p>Ajuste ou limpe os filtros para ver os demais compromissos.</p>
      <button class="btn btn-ghost" data-limpar><i data-lucide="x"></i>Limpar filtros</button></div>`;
  }

  function renderAgenda() {
    const fData = $("#filtro-data").value, fAdv = $("#filtro-advogado").value;
    $("#stat-total").textContent = state.totalAgendados;
    $("#stat-filtrado").textContent = state.totalEncontrados;
    $("#stat-filtrado-foot").textContent = fData || fAdv ? "com filtros aplicados" : "sem filtros ativos";

    const chips = [];
    if (fData) chips.push(`<span class="chip"><i data-lucide="calendar"></i>${dataCurta(fData)}</span>`);
    if (fAdv) chips.push(`<span class="chip"><i data-lucide="user-round"></i>${esc(fAdv)}</span>`);
    $("#result-line").innerHTML = chips.length
      ? `Total de compromissos encontrados: <strong>${state.totalEncontrados}</strong> de ${state.totalAgendados} ${chips.join("")}`
      : `Total de compromissos agendados: <strong>${state.totalAgendados}</strong>`;

    const lista = $("#lista");
    if (state.itens.length === 0) { lista.innerHTML = vazioHTML(); icons(); return; }

    const itens = ordenar(state.itens); // ordenação apenas visual

    if (state.modo === "tabela") {
      lista.innerHTML = `<div class="table-wrap"><table>
        <thead><tr><th>Data</th><th>Horário</th><th>Título</th><th>Advogado</th><th>Cliente</th><th>Processo</th><th>Modalidade</th></tr></thead>
        <tbody>${itens.map((c) => `<tr>
          <td class="strong">${esc(c.dataFormatada)}</td>
          <td>${esc(c.horaInicio)} – ${esc(c.horaFim)}</td>
          <td class="strong">${esc(c.titulo)}</td>
          <td>${esc(c.advogado)}</td>
          <td>${esc(c.cliente)}</td>
          <td class="mono">${esc(c.numeroProcesso)}</td>
          <td>${badge(c.modalidade)}</td></tr>`).join("")}</tbody></table></div>`;
    } else {
      const grupos = itens.reduce((acc, c) => ((acc[c.data] ||= []).push(c), acc), {});
      let i = 0;
      lista.innerHTML = Object.entries(grupos).map(([data, cs]) => {
        const d = parseISO(data);
        return `<section class="day-group">
          <div class="day-head">
            <div class="day-date"><b>${d.getDate()}</b><small>${MES_ABR[d.getMonth()]}</small></div>
            <div><h3>${esc(dataLonga(data))}</h3><span class="tag">${rotuloDia(data)} · ${cs.length} compromisso(s)</span></div>
            <span class="line"></span>
          </div>
          <div class="cards">${cs.map((c) => cardHTML(c, Math.min(i++ * 45, 450))).join("")}</div>
        </section>`;
      }).join("");
    }
    icons();
  }

  async function exportar() {
    const btns = [$("#btn-exportar"), $("#nav-exportar")];
    btns.forEach((b) => (b.disabled = true));
    try {
      const resp = await fetch("/api/exportar");
      if (!resp.ok) {
        let msg = "Não foi possível exportar a agenda.";
        try { msg = (await resp.json()).mensagem || msg; } catch { /* ignore */ }
        throw new Error(msg);
      }
      const url = URL.createObjectURL(await resp.blob());
      const a = Object.assign(document.createElement("a"), { href: url, download: "agenda.csv" });
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 2000);
      toast("success", "Planilha exportada", "Agenda exportada com sucesso para planilha (agenda.csv).");
    } catch (e) {
      toast("error", "Exportação não realizada", limparMsg(e.message));
    } finally {
      btns.forEach((b) => (b.disabled = false));
    }
  }

  // ---------------------------------------------------------------- painel direito
  function miniHTML(c, comData) {
    return `<button class="mini" data-ir="${esc(c.data)}" title="Ver compromissos de ${esc(c.dataFormatada)}">
      <span class="mini-time"><b>${esc(c.horaInicio)}</b><small>${comData ? esc(dataCurta(c.data).slice(0, 5)) : esc(c.horaFim)}</small></span>
      <span class="mini-body"><strong>${esc(c.titulo)}</strong><span>${esc(c.advogado)} · ${esc(c.modalidade)}</span></span>
    </button>`;
  }

  function renderPainel() {
    const hoje = hojeISO();
    const agora = `${hoje}${pad(new Date().getHours())}:${pad(new Date().getMinutes())}`;
    const todos = ordenar(state.todos);
    const deHoje = todos.filter((c) => c.data === hoje);
    const proximos = todos.filter((c) => c.data + c.horaFim > agora && c.data !== hoje).slice(0, 5);

    $("#rp-hoje-count").textContent = deHoje.length;
    $("#rp-hoje").innerHTML = deHoje.length ? deHoje.map((c) => miniHTML(c, false)).join("") : `<div class="rp-empty">Nenhum compromisso para hoje.</div>`;
    $("#rp-proximos").innerHTML = proximos.length ? proximos.map((c) => miniHTML(c, true)).join("") : `<div class="rp-empty">Nenhum compromisso futuro agendado.</div>`;

    const badgeHoje = $("#badge-hoje");
    badgeHoje.hidden = deHoje.length === 0;
    badgeHoje.textContent = deHoje.length;

    $("#hero-summary").textContent = state.todos.length === 0
      ? "Nenhum compromisso agendado ainda. Que tal começar pelo primeiro?"
      : `${state.todos.length} compromisso(s) na agenda${deHoje.length ? ` · ${deHoje.length} para hoje` : ""}${proximos[0] ? ` · próximo: ${proximos[0].titulo} (${proximos[0].dataFormatada.slice(0, 5)} às ${proximos[0].horaInicio})` : ""}.`;

    renderCalendario();
  }

  function renderCalendario() {
    if (!state.calMes) { const t = new Date(); state.calMes = new Date(t.getFullYear(), t.getMonth(), 1); }
    const ano = state.calMes.getFullYear(), mes = state.calMes.getMonth();
    $("#rp-mes").textContent = `${MESES[mes][0].toUpperCase()}${MESES[mes].slice(1)} de ${ano}`;

    const contagem = state.todos.reduce((acc, c) => ((acc[c.data] = (acc[c.data] || 0) + 1), acc), {});
    const hoje = hojeISO(), sel = $("#filtro-data").value;
    const inicio = new Date(ano, mes, 1 - new Date(ano, mes, 1).getDay());

    let html = "";
    for (let i = 0; i < 42; i++) {
      const d = new Date(inicio.getFullYear(), inicio.getMonth(), inicio.getDate() + i);
      const iso = isoDe(d), n = contagem[iso] || 0;
      const cls = ["cal-day", d.getMonth() !== mes && "out", iso < hoje && "past", iso === hoje && "today", iso === sel && "sel"].filter(Boolean).join(" ");
      html += `<button class="${cls}" data-dia="${iso}" title="${dataCurta(iso)}${n ? ` · ${n} compromisso(s)` : ""}">${d.getDate()}${n ? `<span class="dots">${"<i></i>".repeat(Math.min(n, 3))}</span>` : ""}</button>`;
    }
    $("#cal-grid").innerHTML = html;
  }

  function filtrarPorDia(iso) {
    $("#filtro-data").value = $("#filtro-data").value === iso ? "" : iso; // clicar de novo remove o filtro
    if (location.hash !== "#agenda" && location.hash !== "") location.hash = "#agenda";
    if (!isDock()) setPanel(false);
    carregarAgenda().catch((e) => toast("error", "Erro", e.message));
  }

  // ---------------------------------------------------------------- novo compromisso
  function lerForm() {
    return {
      advogado: $("#f-advogado").value,
      titulo: $("#f-titulo").value,
      cliente: $("#f-cliente").value,
      numeroProcesso: $("#f-processo").value,
      modalidade: $("#f-modalidade input:checked")?.value || "",
      data: $("#f-data").value,
      horaInicio: $("#f-inicio").value,
      horaFim: $("#f-fim").value,
    };
  }

  function atualizarPreview() {
    const f = lerForm();
    $("#preview-card").innerHTML = cardHTML({
      titulo: f.titulo.trim() || "Título do compromisso",
      advogado: f.advogado || "Advogado",
      cliente: f.cliente || "Cliente",
      numeroProcesso: f.numeroProcesso || "Nº do processo",
      modalidade: f.modalidade || "Presencial",
      dataFormatada: f.data ? dataCurta(f.data) : "dd/mm/aaaa",
      horaInicio: f.horaInicio || "--:--",
      horaFim: f.horaFim || "--:--",
    }, 0, true);
    icons();
  }

  function limparErros() {
    $("#form-erro").hidden = true;
    $$("#form-novo .invalid").forEach((el) => el.classList.remove("invalid"));
  }

  // Destaca o(s) campo(s) relacionados à mensagem devolvida pelo back-end
  function destacarCampo(msg) {
    const mapa = [
      [/Já existe um compromisso/, ["#f-advogado", "#f-inicio", "#f-fim"]],
      [/Advogado/, ["#f-advogado"]],
      [/Título/, ["#f-titulo"]],
      [/Cliente/, ["#f-cliente"]],
      [/Processo/, ["#f-processo"]],
      [/Modalidade/, ["#f-modalidade"]],
      [/[Dd]ata/, ["#f-data"]],
      [/início/, ["#f-inicio"]],
      [/fim/, ["#f-fim"]],
    ];
    for (const [re, sels] of mapa) {
      if (re.test(msg)) {
        sels.forEach((s) => $(s)?.classList.add("invalid"));
        const alvo = $(sels[0]);
        alvo?.scrollIntoView({ behavior: "smooth", block: "center" });
        break;
      }
    }
  }

  async function salvarCompromisso(ev) {
    ev.preventDefault();
    limparErros();
    const btn = $("#btn-salvar");
    btn.disabled = true;
    try {
      const dados = lerForm();
      const r = await api("/api/compromissos", { method: "POST", body: JSON.stringify(dados) });
      toast("success", "Compromisso agendado", limparMsg(r.mensagem));
      $("#form-novo").reset();
      $("#f-advogado").value = dados.advogado;   // mantém o advogado para agilizar novos lançamentos
      $("#f-data").min = hojeISO();
      atualizarPreview();
      const d = parseISO(dados.data.includes("-") ? dados.data : hojeISO());
      state.calMes = new Date(d.getFullYear(), d.getMonth(), 1);
      await Promise.all([carregarAgenda(), carregarTodos()]);
    } catch (e) {
      const box = $("#form-erro");
      box.querySelector("span").textContent = e.message;
      box.hidden = false;
      destacarCampo(e.message);
      toast("error", "Não foi possível agendar", limparMsg(e.message));
    } finally {
      btn.disabled = false;
    }
  }

  // ---------------------------------------------------------------- administração
  const rotulos = { advogados: "Advogado", clientes: "Cliente", processos: "Processo" };

  function renderAdmin(novoTipo, novoValor) {
    $$(".admin-card").forEach((card) => {
      const tipo = card.dataset.tipo;
      const itens = state.listas[tipo] || [];
      card.querySelector("[data-count]").textContent = `${itens.length} cadastrado(s)`;
      const ul = card.querySelector(".admin-list");
      ul.innerHTML = itens.map((n, idx) => {
        const novo = tipo === novoTipo && n === novoValor && idx === itens.length - 1;
        const avatar = tipo === "processos" ? `<i data-lucide="file-text"></i>` : esc(iniciais(n));
        return `<li class="${novo ? "new" : ""}"><span class="avatar">${avatar}</span>${esc(n)}</li>`;
      }).join("");
      if (novoTipo === tipo) ul.scrollTop = ul.scrollHeight;
    });
    icons();
  }

  async function cadastrar(card, ev) {
    ev.preventDefault();
    const tipo = card.dataset.tipo;
    const input = card.querySelector("input");
    const btn = card.querySelector("button");
    input.classList.remove("invalid");
    btn.disabled = true;
    try {
      const r = await api(`/api/${tipo}`, { method: "POST", body: JSON.stringify({ nome: input.value }) });
      const valor = input.value.trim();
      input.value = "";
      state.listas = await api("/api/listas");
      preencherSelects();
      renderAdmin(tipo, valor);
      atualizarContadoresCadastro();
      toast("success", `${rotulos[tipo]} cadastrado`, limparMsg(r.mensagem));
    } catch (e) {
      input.classList.add("invalid");
      input.focus();
      toast("error", "Cadastro não realizado", limparMsg(e.message));
    } finally {
      btn.disabled = false;
    }
  }

  // ---------------------------------------------------------------- init
  function saudacao() {
    const h = new Date().getHours();
    return h < 12 ? "Bom dia" : h < 18 ? "Boa tarde" : "Boa noite";
  }

  function definirModo(modo) {
    state.modo = modo;
    lsSet("gg-modo", modo);
    $$(".seg").forEach((b) => b.classList.toggle("active", b.dataset.mode === modo));
    renderAgenda();
  }

  async function atualizarTudo(avisar) {
    try {
      await carregarListas();
      await Promise.all([carregarAgenda(), carregarTodos()]);
      if (avisar) toast("success", "Atualizado", "Dados sincronizados com o servidor.");
    } catch (e) {
      toast("error", "Servidor indisponível", e.message);
    }
  }

  function init() {
    const t = new Date();
    $("#today-label").innerHTML = `<span class="d-long">${dataLonga(hojeISO())}</span><span class="d-short">${DIAS[t.getDay()].slice(0, 3)}, ${t.getDate()} ${MES_ABR[t.getMonth()]}</span>`;
    $("#hero-greeting").innerHTML = `${saudacao()}, <em>equipe Gomides &amp; Gomes</em>`;
    $("#f-data").min = hojeISO();

    // estado inicial dos controles do layout (classes já aplicadas no <head>)
    toggleNav(root.classList.contains("nav-collapsed"), false);
    setPanel(root.classList.contains("panel-open"));

    window.addEventListener("hashchange", rota);
    window.addEventListener("resize", aoRedimensionar);
    rota();

    // menu e painel retráteis
    $("#btn-collapse").addEventListener("click", () => toggleNav());
    $("#btn-panel").addEventListener("click", togglePanel);
    $("#nav-painel").addEventListener("click", togglePanel);
    $("#rp-handle").addEventListener("click", () => setPanel(true));
    $("#rp-close").addEventListener("click", () => setPanel(false));
    $("#backdrop").addEventListener("click", () => setPanel(false));
    document.addEventListener("keydown", (e) => {
      if (e.target.matches("input, select, textarea")) return;
      if (e.key === "[") toggleNav();
      if (e.key === "]") togglePanel();
      if (e.key === "Escape" && !isDock()) setPanel(false);
    });

    // calendário
    $("#cal-prev").addEventListener("click", () => { state.calMes.setMonth(state.calMes.getMonth() - 1); renderCalendario(); });
    $("#cal-next").addEventListener("click", () => { state.calMes.setMonth(state.calMes.getMonth() + 1); renderCalendario(); });
    $("#cal-hoje").addEventListener("click", () => { const t = new Date(); state.calMes = new Date(t.getFullYear(), t.getMonth(), 1); renderCalendario(); });
    $("#cal-grid").addEventListener("click", (e) => { const b = e.target.closest("[data-dia]"); if (b) filtrarPorDia(b.dataset.dia); });
    $("#rpanel").addEventListener("click", (e) => {
      const b = e.target.closest("[data-ir]");
      if (b) { $("#filtro-data").value = ""; filtrarPorDia(b.dataset.ir); }
    });

    // filtros e agenda
    $("#filtro-data").addEventListener("change", () => {
      const v = $("#filtro-data").value;
      if (v) { const d = parseISO(v); state.calMes = new Date(d.getFullYear(), d.getMonth(), 1); }
      carregarAgenda().catch((e) => toast("error", "Filtro inválido", limparMsg(e.message)));
    });
    $("#filtro-advogado").addEventListener("change", () => carregarAgenda().catch((e) => toast("error", "Erro", e.message)));
    const limpar = () => { $("#filtro-data").value = ""; $("#filtro-advogado").value = ""; carregarAgenda(); };
    $("#btn-limpar").addEventListener("click", limpar);
    $("#lista").addEventListener("click", (e) => { if (e.target.closest("[data-limpar]")) limpar(); });
    $$(".seg").forEach((b) => b.addEventListener("click", () => definirModo(b.dataset.mode)));
    $$(".seg").forEach((b) => b.classList.toggle("active", b.dataset.mode === state.modo));
    $("#btn-exportar").addEventListener("click", exportar);
    $("#nav-exportar").addEventListener("click", exportar);
    $("#btn-refresh").addEventListener("click", () => atualizarTudo(true));

    // formulário
    const form = $("#form-novo");
    form.addEventListener("submit", salvarCompromisso);
    form.addEventListener("input", (e) => { e.target.classList?.remove("invalid"); atualizarPreview(); });
    form.addEventListener("change", (e) => {
      if (e.target.name === "modalidade") $("#f-modalidade").classList.remove("invalid");
      atualizarPreview();
    });
    form.addEventListener("reset", () => setTimeout(() => { limparErros(); atualizarPreview(); }, 0));

    // administração
    $$(".admin-card").forEach((card) => card.querySelector("form").addEventListener("submit", (e) => cadastrar(card, e)));

    icons();
    atualizarTudo(false);
  }

  document.addEventListener("DOMContentLoaded", init);
})();
