const $ = id => document.getElementById(id);
const PERFIL = {
  zonas: ["Antofagasta", "Calama", "Tocopilla", "Mejillones"],
  palabras: ["construccion", "construcción", "obra", "obras civiles", "radier", "hormigon", "hormigón", "paviment", "vereda", "cierre perimetral", "estructura metal", "metalica", "metálica", "electric", "eléctric", "luminaria", "climatizacion", "climatización", "pintura", "techumbre", "cubierta", "reparacion", "reparación", "mejoramiento", "mantencion", "mantención", "sanitari", "agua potable", "alcantarill", "mobiliario", "juegos infantiles", "sombreadero", "cancha", "plaza"]
};
let oportunidades = [];
let seleccion = null;

function avisoGuardado(error) {
  $('estadoGuardado').hidden = false;
  $('estadoGuardado').textContent = 'No se pudo guardar o recuperar el seguimiento en este dispositivo. ' + (error.message || 'Comprueba el espacio disponible.');
}
function leerSeguimiento(method) { try { return NGSeguimiento[method](); } catch (e) { avisoGuardado(e); return []; } }
function estadoConexion(text, type) { $('conexionMP').textContent = text; $('conexionMP').className = 'status ' + type; }
function esc(v) { return String(v == null ? "" : v).replace(/[&<>"']/g, m => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[m])); }
function norm(v) { return String(v == null ? "" : v).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase(); }
function formatDate(v) { if (!v) return "No informada"; const d = new Date(v); return Number.isNaN(d.getTime()) ? String(v) : d.toLocaleString("es-CL", { dateStyle: "short", timeStyle: "short" }); }
function formatMoney(v) { const n = Number(v); return Number.isFinite(n) && n > 0 ? n.toLocaleString("es-CL", { style: "currency", currency: "CLP", maximumFractionDigits: 0 }) : "No informado"; }
function cleanRut(v) { return String(v || "").replace(/\./g, "").replace(/\s/g, "").toUpperCase(); }
function todayInput() { const d = new Date(); const p = n => String(n).padStart(2, "0"); return d.getFullYear() + "-" + p(d.getMonth() + 1) + "-" + p(d.getDate()); }
function apiDate(v) { const parts = String(v).split("-"); return parts.length === 3 ? parts[2] + parts[1] + parts[0] : ""; }
function daysUntil(v) { if (!v) return null; const d = new Date(v); if (Number.isNaN(d.getTime())) return null; return (d - Date.now()) / 86400000; }
function saved() { return leerSeguimiento('negocios'); }
function alerts() { return leerSeguimiento('alertas'); }
function history() { return leerSeguimiento('historial'); }

function scoreNG(o) {
  const text = norm([o.nombre, o.descripcion, o.comprador, o.region, o.comuna].join(" "));
  let score = 0; const hits = [];
  PERFIL.palabras.forEach(p => { if (text.includes(norm(p))) { score += 7; hits.push(p); } });
  PERFIL.zonas.forEach(z => { if (text.includes(norm(z))) { score += 18; hits.push(z); } });
  const d = daysUntil(o.fechaCierre); if (d !== null && d > 1) score += 3;
  return { score: Math.min(100, score), hits: Array.from(new Set(hits)).slice(0, 5) };
}
function isSaved(codigo) { return saved().some(x => x.codigo === codigo); }
function addBusiness(o) {
  try { NGSeguimiento.guardar(o); } catch (e) { avisoGuardado(e); }
  refreshDashboard(); renderOpportunities();
}
function removeBusiness(codigo) { try { NGSeguimiento.quitar(codigo); } catch (e) { avisoGuardado(e); } refreshDashboard(); renderOpportunities(); }
function openAnalysis(codigo, tab) { document.activeElement?.blur(); location.href = "/analisis.html?codigo=" + encodeURIComponent(codigo) + "#" + (tab || "resumen"); }
function normalizeResponse(j) {
  const list = j && j.data && Array.isArray(j.data.Listado) ? j.data.Listado : [];
  const analyses = j && Array.isArray(j.analisis) ? j.analisis : [];
  return list.filter(t => t && NGConsulta.valido(NGConsulta.codigo(t.CodigoExterno || t.Codigo))).map(t => {
    const code = NGConsulta.codigo(t.CodigoExterno || t.Codigo);
    const a = analyses.find(a => a && NGConsulta.codigo(a.codigo) === code) || {};
    return Object.assign({
      codigo: code, nombre: t.Nombre || "", descripcion: t.Descripcion || "", estado: NGConsulta.estado(t),
      comprador: (t.Comprador && (t.Comprador.NombreOrganismo || t.Comprador.NombreUnidad)) || "",
      region: (t.Comprador && (t.Comprador.RegionUnidad || t.Comprador.Region)) || "",
      comuna: (t.Comprador && (t.Comprador.ComunaUnidad || t.Comprador.Comuna)) || "",
      fechaCierre: (t.Fechas && t.Fechas.FechaCierre) || t.FechaCierre || null,
      montoEstimado: t.MontoEstimado || t.Monto || t.Presupuesto || t.ValorEstimado || null
    }, a);
  });
}
async function fetchMP(params) { return NGConsulta.consultar(params); }
async function searchByDate() {
  if ($('btnBuscar').disabled) return;
  const fecha = $("fechaBusqueda").value; if (!fecha) return;
  document.activeElement?.blur(); $('btnBuscar').disabled = true; $('btnBuscar').textContent = 'Buscando…';
  estadoConexion('Consultando Mercado Público', 'warning');
  $("estadoBusqueda").textContent = "Consultando…"; $("estadoBusqueda").className = "status warning";
  $("resultadoOportunidades").innerHTML = '<div class="empty"><span class="loader"></span> Consultando Mercado Público…</div>';
  try {
    const j = await fetchMP({ fecha: apiDate(fecha) });
    oportunidades = normalizeResponse(j).map(o => Object.assign({}, o, { _ng: scoreNG(o) }));
    const tracked = new Set(saved().map(x => x.codigo));
    try { oportunidades.filter(o => tracked.has(o.codigo)).forEach(o => NGSeguimiento.guardar(o)); } catch (e) { avisoGuardado(e); }
    estadoConexion('Conexión comprobada', 'ok');
    $("estadoBusqueda").textContent = oportunidades.length + " encontradas"; $("estadoBusqueda").className = "status ok";
    refreshDashboard(); renderOpportunities(); renderCompetition();
    if(!oportunidades.length)$('resultadoOportunidades').innerHTML='<div class="empty">Mercado Público no informó licitaciones para esta fecha.</div>';
  } catch (e) {
    oportunidades = []; $("estadoBusqueda").textContent = "Error"; $("estadoBusqueda").className = "status danger";
    estadoConexion('Consulta no disponible', 'warning'); refreshDashboard();
    $("resultadoOportunidades").innerHTML = '<div class="alert warning"><b>No se pudo completar la búsqueda.</b><br>' + esc(e.name === "AbortError" ? "La consulta tardó demasiado." : e.message) + '</div>';
  } finally { $('btnBuscar').disabled = false; $('btnBuscar').textContent = 'Buscar oportunidades'; }
}
function filteredOpportunities() {
  const q = norm($("filtroTexto").value), zone = norm($("filtroZona").value), only = $("filtroCalce").value === "ng";
  return oportunidades.filter(o => {
    const text = norm([o.codigo, o.nombre, o.descripcion, o.comprador, o.region, o.comuna].join(" "));
    if (q && !text.includes(q)) return false; if (zone && !text.includes(zone)) return false; if (only && ((o._ng && o._ng.score) || 0) < 14) return false; return true;
  }).sort((a, b) => (((b._ng && b._ng.score) || 0) - ((a._ng && a._ng.score) || 0)));
}
function renderOpportunities() {
  const root = $("resultadoOportunidades"); if (!oportunidades.length) return;
  const list = filteredOpportunities(); if (!list.length) { root.innerHTML = '<div class="empty">No hay procesos que coincidan con estos filtros.</div>'; return; }
  root.innerHTML = list.slice(0, 120).map(o => {
    const ng = o._ng || scoreNG(o), d = daysUntil(o.fechaCierre), urgent = d !== null && d >= 0 && d <= 2;
    return '<article class="opportunity-card ' + (ng.score >= 14 ? 'recommended' : '') + '">' +
      '<div class="opportunity-main"><div class="row"><span class="mini">' + esc(o.codigo || "Sin ID") + '</span>' +
      (ng.score >= 14 ? '<span class="status ok">Sugerida NG</span>' : '') + (urgent ? '<span class="status danger">Cierre próximo</span>' : '') + '</div>' +
      '<h3>' + esc(o.nombre || "Sin nombre") + '</h3><div class="op-meta"><span>' + esc(o.comprador || "Comprador no informado") + '</span><span>' + esc([o.comuna, o.region].filter(Boolean).join(" · ") || "Ubicación no informada") + '</span><span>' + esc(formatMoney(o.montoEstimado)) + '</span><span>Cierre: ' + esc(formatDate(o.fechaCierre)) + '</span></div>' +
      (ng.hits.length ? '<div class="match-line">Calce detectado: ' + esc(ng.hits.join(" · ")) + '</div>' : '') + '</div>' +
      '<div class="opportunity-actions"><button class="primary" data-action="analizar" data-code="' + esc(o.codigo) + '">Analizar</button><button class="secondary" data-action="buyer" data-code="' + esc(o.codigo) + '">Ver comprador</button><button class="ghost" data-action="save" data-code="' + esc(o.codigo) + '">' + (isSaved(o.codigo) ? 'Guardada ✓' : 'Guardar') + '</button></div></article>';
  }).join("");
}
function selectBuyer(code) {
  const o = oportunidades.find(x => x.codigo === code) || history().find(x => x.codigo === code); if (!o) return; seleccion = o;
  $("buyerPanel").innerHTML = '<div class="grid2"><div class="kpi"><small>Organismo</small><b>' + esc(o.comprador || "No informado") + '</b></div><div class="kpi"><small>Ubicación</small><b>' + esc([o.comuna, o.region].filter(Boolean).join(" · ") || "No informada") + '</b></div><div class="kpi"><small>Proceso seleccionado</small><b>' + esc(o.codigo) + '</b></div><div class="kpi"><small>Estado</small><b>' + esc(o.estado || "No informado") + '</b></div></div><div class="note small" style="margin-top:10px"><b>Importante:</b> el histórico de pagos, pago no oportuno y reclamos no viene en esta consulta de licitaciones. La app no lo inventa; ese módulo requiere conectar las fuentes públicas correspondientes.</div>';
  $("iaRespuesta").innerHTML = 'Proceso seleccionado: <b>' + esc(o.codigo) + '</b> · ' + esc(o.nombre || ""); location.hash = "comprador";
}
function askIA() {
  const q = norm($("iaPregunta").value); if (!seleccion) { $("iaRespuesta").innerHTML = "Selecciona una oportunidad con “Ver comprador” antes de preguntar."; return; }
  const o = seleccion; let answer = "";
  if (/cierre|cuando cierra|fecha/.test(q)) answer = 'El cierre informado es <b>' + esc(formatDate(o.fechaCierre)) + '</b>.';
  else if (/comprador|organismo|quien compra/.test(q)) answer = 'El comprador informado es <b>' + esc(o.comprador || "No informado") + '</b>.';
  else if (/monto|presupuesto/.test(q)) answer = 'El monto/presupuesto informado en la ficha pública es <b>' + esc(formatMoney(o.montoEstimado)) + '</b>.';
  else if (/gano|ganador|adjudic/.test(q)) answer = o.ngAdjudicada ? 'La adjudicación pública detectada incluye a <b>NG Ingeniería</b>.' : (String(o.resultadoNG || "") === "NO_ADJUDICADA_A_NG" ? 'La adjudicación detectada <b>no corresponde a NG</b>.' : 'No hay una adjudicación oficial a NG detectada en los datos cargados. Abre la ficha para revisar el resultado completo.');
  else if (/criterio|evaluacion|precio|plazo|experiencia/.test(q)) answer = 'Los criterios de evaluación completos normalmente están en las <b>bases y anexos</b>. Esta pantalla no los inventa. Abre “Analizar” → “Bases” para incorporarlos y verificarlos.';
  else if (/visita|garantia|profesional|documento|anexo/.test(q)) answer = 'Ese requisito debe validarse en las <b>bases oficiales</b>. Abre la ficha del proceso; allí queda como “Por confirmar” hasta que exista respaldo.';
  else answer = 'Con lo cargado sé que <b>' + esc(o.codigo) + '</b> corresponde a “' + esc(o.nombre || "Sin nombre") + '”, está en estado <b>' + esc(o.estado || "No informado") + '</b> y lo compra <b>' + esc(o.comprador || "No informado") + '</b>. Para una respuesta sobre requisitos específicos necesito lo que indiquen las bases.';
  $("iaRespuesta").innerHTML = answer;
}
async function refreshBusiness(code, btn) {
  if (btn) { btn.disabled = true; btn.textContent = "Revisando…"; }
  try {
    const j = await fetchMP({ codigo: code }), o = normalizeResponse(j)[0];
    if (!o || o.codigo !== code) throw new Error('La respuesta no corresponde al ID solicitado.');
    // A removal in another tab must not be undone by a pending update.
    if (isSaved(code)) NGSeguimiento.guardar(o, true); else NGSeguimiento.recordar(o, true);
    estadoConexion('Conexión comprobada', 'ok'); refreshDashboard();
    if (btn) $('estadoSeguimiento').textContent = code + ' actualizado.';
    return true;
  } catch (e) {
    $('estadoSeguimiento').textContent = code + ': ' + e.message;
    if (btn) { btn.disabled = false; btn.textContent = 'Reintentar'; }
    return false;
  }
}
async function refreshAll() {
  const btn = $('btnActualizarNegocios'); if (btn.disabled) return;
  const codes = saved().map(x => x.codigo); if (!codes.length) return;
  btn.disabled = true; const failed = [];
  try {
    for (let i = 0; i < codes.length; i++) {
      $('estadoSeguimiento').textContent = 'Actualizando ' + (i + 1) + ' de ' + codes.length + ': ' + codes[i];
      if (!await refreshBusiness(codes[i])) failed.push(codes[i]);
    }
    $('estadoSeguimiento').textContent = (codes.length - failed.length) + ' de ' + codes.length + ' actualizadas.' + (failed.length ? ' No se pudieron actualizar: ' + failed.join(', ') + '. Puedes reintentar; sus datos se conservan.' : '');
  } finally { btn.disabled = false; }
}
function renderBusinesses() {
  const arr = saved(); $("negociosCount").textContent = arr.length; const root = $("listaNegocios");
  if (!arr.length) { root.innerHTML = '<div class="empty">Todavía no has guardado procesos.</div>'; return; }
  root.innerHTML = arr.map(o => '<div class="business-row"><div><div class="row"><span class="mini">' + esc(o.codigo) + '</span><span class="status neutral">' + esc(o.estado || "Ficha por actualizar") + '</span></div><b>' + esc(o.nombre || (o.recuperadoDeBorrador ? "Borrador recuperado" : "Proceso guardado")) + '</b><small>' + esc(o.comprador || "") + ' · Cierre: ' + esc(formatDate(o.fechaCierre)) + '</small></div><div class="row"><button class="primary" data-business="open" data-code="' + esc(o.codigo) + '">Abrir</button><button class="secondary" data-business="refresh" data-code="' + esc(o.codigo) + '">Actualizar</button><button class="ghost" data-business="remove" data-code="' + esc(o.codigo) + '">Quitar</button></div></div>').join("");
}
function renderAlerts() {
  const arr = alerts(); $("kpiAlertas").textContent = arr.length; const root = $("listaAlertas");
  root.innerHTML = arr.length ? arr.map(a => '<div class="alert-row"><div><b>' + esc(a.codigo) + '</b><small>' + esc(new Date(a.fecha).toLocaleString("es-CL")) + '</small><span>' + esc(a.texto) + '</span></div><button class="ghost" data-alert-open="' + esc(a.codigo) + '">Abrir</button></div>').join("") : '<div class="empty">Sin cambios registrados.</div>';
}
function renderCompetition() {
  const h = history(), adjud = new Map(); let withN = 0;
  h.forEach(x => { if (NGConsulta.numero(x.numeroOferentes) !== null) withN++; (x.proveedoresAdjudicados || []).forEach(p => { if (!p) return; const key = cleanRut(p.rut) || p.nombre; if (key) adjud.set(key, p); }); });
  const consultadas = h.filter(x => x.detalleConsultado || (x.proveedoresAdjudicados || []).length || NGConsulta.numero(x.numeroOferentes) !== null);
  $("compAdjudicatarios").textContent = consultadas.length ? adjud.size : '—'; $("compOferentes").textContent = withN || '—'; $("compHistorial").textContent = consultadas.length;
  $('compCobertura').textContent = consultadas.length ? 'Datos de ' + consultadas.length + ' fichas consultadas. ' + withN + ' informan número de oferentes.' : 'Aún no hay fichas consultadas con detalle. Analiza un ID o actualiza tus negocios guardados.';
  const names = Array.from(adjud.values()).slice(0, 12);
  $("competenciaPanel").innerHTML = names.length ? '<b>Adjudicatarios detectados en procesos consultados:</b><div class="competitor-list">' + names.map(p => '<div class="competitor"><div><b>' + esc(p.nombre || "Proveedor") + '</b><small>' + esc(p.rut || "RUT no informado") + '</small></div></div>').join("") + '</div>' : 'Las fichas consultadas aún no informan adjudicatarios. Abre la pestaña Competencia de cada licitación para revisar sus antecedentes.';
}
function refreshDashboard() {
  const s = saved(), h = history(); $("kpiGuardados").textContent = s.length; $("kpiOportunidades").textContent = oportunidades.length; $("kpiGanadas").textContent = h.some(x => x.detalleConsultado || x.ngAdjudicada) ? h.filter(x => x.ngAdjudicada).length : '—';
  renderBusinesses(); renderAlerts(); renderCompetition();
}

$("perfilChips").innerHTML = PERFIL.zonas.concat(["Obras civiles", "Electricidad", "Estructuras metálicas", "Climatización", "Pintura", "Mobiliario"]).map(x => '<span class="profile-chip">' + esc(x) + '</span>').join("");
$("fechaBusqueda").value = todayInput();
$("btnAbrir").addEventListener("click", () => { const c=NGConsulta.codigo($('codigo').value);if(!NGConsulta.valido(c)){$('ayudaCodigo').textContent='Escribe el ID completo. Ejemplo: 1782-5-LR26.';$('codigo').focus();return}openAnalysis(c); });
$("codigo").addEventListener("keydown", e => { if (e.key === "Enter") $("btnAbrir").click(); });
$("btnBuscar").addEventListener("click", searchByDate);
["filtroTexto", "filtroZona", "filtroCalce"].forEach(id => $(id).addEventListener(id === "filtroTexto" ? "input" : "change", renderOpportunities));
$("btnIA").addEventListener("click", askIA); $("iaPregunta").addEventListener("keydown", e => { if (e.key === "Enter") askIA(); });
$("resultadoOportunidades").addEventListener("click", e => { const b = e.target.closest("button[data-action]"); if (!b) return; const code = b.dataset.code, o = oportunidades.find(x => x.codigo === code); if (!o) return; if (b.dataset.action === "analizar") openAnalysis(code); if (b.dataset.action === "buyer") selectBuyer(code); if (b.dataset.action === "save") { if (isSaved(code)) removeBusiness(code); else addBusiness(o); } });
$("listaNegocios").addEventListener("click", e => { const b = e.target.closest("button[data-business]"); if (!b) return; const code = b.dataset.code; if (b.dataset.business === "open") openAnalysis(code); if (b.dataset.business === "refresh") refreshBusiness(code, b); if (b.dataset.business === "remove") removeBusiness(code); });
$("listaAlertas").addEventListener("click", e => { const b = e.target.closest("button[data-alert-open]"); if (b) openAnalysis(b.dataset.alertOpen, "resultado"); });
$("btnLimpiarAlertas").addEventListener("click", () => { try { NGSeguimiento.limpiarAlertas(); } catch (e) { avisoGuardado(e); } renderAlerts(); });
$('btnActualizarNegocios').addEventListener('click', refreshAll);
function recuperarSeguimiento() { try { NGSeguimiento.migrar(); } catch (e) { avisoGuardado(e); } refreshDashboard(); }
window.addEventListener('pageshow', recuperarSeguimiento);
window.addEventListener('storage', () => { refreshDashboard(); renderOpportunities(); });
if ("serviceWorker" in navigator) navigator.serviceWorker.register("/sw.js").catch(() => {});
recuperarSeguimiento();
