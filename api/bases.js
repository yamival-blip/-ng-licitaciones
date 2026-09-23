const MP_BASE = "https://api.mercadopublico.cl/servicios/v1/publico";
const MP_FICHA = "https://www.mercadopublico.cl/Procurement/Modules/RFB/DetailsAcquisition.aspx";
const VERSION = "5.5.0";
const MAX_DOCS = 7;
const MAX_FILE_BYTES = 9 * 1024 * 1024;
const MAX_TEXT_PER_DOC = 450000;

function normalizarCodigo(v = "") {
  return String(v)
    .trim()
    .toUpperCase()
    .replace(/[–—−]/g, "-")
    .replace(/-+/g, "-");
}

function validoCodigo(v) {
  return /^[A-Z0-9][A-Z0-9-]{4,49}$/.test(v) && !v.includes("..");
}

function limpiarTexto(v = "") {
  return String(v)
    .replace(/\u0000/g, " ")
    .replace(/\r/g, "\n")
    .replace(/[\t ]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function decodificarHtml(v = "") {
  const named = {
    nbsp: " ", amp: "&", lt: "<", gt: ">", quot: '"', apos: "'",
    aacute: "á", eacute: "é", iacute: "í", oacute: "ó", uacute: "ú",
    Aacute: "Á", Eacute: "É", Iacute: "Í", Oacute: "Ó", Uacute: "Ú",
    ntilde: "ñ", Ntilde: "Ñ", uuml: "ü", Uuml: "Ü", deg: "°"
  };
  return String(v)
    .replace(/&#(\d+);/g, (_, n) => {
      const code = Number(n);
      return Number.isFinite(code) ? String.fromCodePoint(code) : " ";
    })
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => {
      const code = parseInt(n, 16);
      return Number.isFinite(code) ? String.fromCodePoint(code) : " ";
    })
    .replace(/&([a-zA-Z]+);/g, (m, k) => Object.prototype.hasOwnProperty.call(named, k) ? named[k] : " ");
}

function textoPlanoHtml(v = "") {
  return limpiarTexto(
    decodificarHtml(
      String(v)
        .replace(/<script[\s\S]*?<\/script>/gi, " ")
        .replace(/<style[\s\S]*?<\/style>/gi, " ")
        .replace(/<(?:br\s*\/?|\/p|\/div|\/tr|\/li|\/h[1-6])\s*>/gi, "\n")
        .replace(/<td[^>]*>/gi, " ")
        .replace(/<[^>]+>/g, " ")
    )
  );
}

function textoRtf(v = "") {
  return limpiarTexto(
    String(v)
      .replace(/\\par[d]?/gi, "\n")
      .replace(/\\'[0-9a-f]{2}/gi, " ")
      .replace(/\\[a-z]+-?\d* ?/gi, " ")
      .replace(/[{}]/g, " ")
  );
}

function extensionDe(doc) {
  const raw = String(doc.nombre || "") + " " + String(doc.url || "");
  const m = raw.match(/\.([a-z0-9]{2,5})(?:[?#\s]|$)/i);
  return m ? m[1].toLowerCase() : "";
}

function nombreDoc(x, i) {
  return String(
    x?.Nombre ||
    x?.NombreArchivo ||
    x?.Archivo ||
    x?.Titulo ||
    x?.Título ||
    x?.Descripcion ||
    x?.Descripción ||
    x?.Name ||
    `Documento ${i + 1}`
  ).trim();
}

function urlDoc(x) {
  return String(
    x?.URL ||
    x?.Url ||
    x?.url ||
    x?.Enlace ||
    x?.Href ||
    x?.href ||
    x?.Link ||
    ""
  ).trim();
}

function extraerListaArchivos(data) {
  if (Array.isArray(data)) return data;
  if (!data || typeof data !== "object") return [];
  for (const key of ["Archivos", "Documentos", "Listado", "data", "Data"]) {
    if (Array.isArray(data[key])) return data[key];
  }
  if (urlDoc(data)) return [data];
  return [];
}

function urlsEmbebidas(obj, salida = [], ruta = "licitacion", vistos = new Set()) {
  if (!obj || typeof obj !== "object" || vistos.has(obj) || salida.length >= 30) return salida;
  vistos.add(obj);
  if (Array.isArray(obj)) {
    obj.forEach((v, i) => urlsEmbebidas(v, salida, `${ruta}[${i}]`, vistos));
    return salida;
  }
  const name = obj.Nombre || obj.NombreArchivo || obj.Titulo || obj.Descripcion || ruta;
  for (const [k, v] of Object.entries(obj)) {
    if (typeof v === "string" && /^https?:\/\//i.test(v)) {
      const esDocumento =
        /archivo|document|anexo|acta|base|resoluc|pdf|doc|xls|zip/i.test(k + " " + name + " " + v) ||
        /\.(pdf|docx?|xlsx?|xlsm|zip|rtf|txt|csv)(?:[?#]|$)/i.test(v);
      if (esDocumento) salida.push({ Nombre: String(name), URL: v, origen: ruta });
    } else if (v && typeof v === "object") {
      urlsEmbebidas(v, salida, `${ruta}.${k}`, vistos);
    }
  }
  return salida;
}

function sinTicket(url) {
  try {
    const u = new URL(url);
    u.searchParams.delete("ticket");
    return u.toString();
  } catch {
    return String(url || "").replace(/([?&])ticket=[^&]+/ig, "$1").replace(/[?&]$/, "");
  }
}

function urlConTicket(url, ticket) {
  try {
    const u = new URL(url);
    if (/api\.mercadopublico\.cl$/i.test(u.hostname) && !u.searchParams.has("ticket")) {
      u.searchParams.set("ticket", ticket);
    }
    return u.toString();
  } catch {
    return url;
  }
}

async function fetchConTimeout(url, options = {}, ms = 12000) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), ms);
  try {
    return await fetch(url, { ...options, signal: ctrl.signal });
  } finally {
    clearTimeout(timer);
  }
}

async function fetchJson(url, ms = 12000) {
  const r = await fetchConTimeout(url, {
    headers: { "User-Agent": "NG-Ingenieria-Licitaciones/5.5" }
  }, ms);
  const txt = await r.text();
  let data;
  try { data = JSON.parse(txt); } catch { data = null; }
  return { ok: r.ok, status: r.status, data, text: txt };
}

function escapeRegExp(v = "") {
  const specials = "\\^$.*+?()[]{}|";
  return String(v).split("").map(ch => specials.includes(ch) ? "\\" + ch : ch).join("");
}

async function leerFichaPublica(codigo) {
  const u = new URL(MP_FICHA);
  u.searchParams.set("idlicitacion", codigo);
  try {
    const r = await fetchConTimeout(u.toString(), {
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; NG-Licitaciones/5.5)",
        "Accept-Language": "es-CL,es;q=0.9"
      },
      redirect: "follow"
    }, 18000);
    if (!r.ok) {
      return { nombre: "Ficha pública Mercado Público", tipo: "html", url: u.toString(), origen: "ficha_publica", texto: "", error: "HTTP " + r.status };
    }
    const html = await r.text();
    let texto = textoPlanoHtml(html);
    if (texto.length > MAX_TEXT_PER_DOC) texto = texto.slice(0, MAX_TEXT_PER_DOC);
    const idOk = new RegExp("Licitaci[oó]n\\s+ID\\s*:\\s*" + escapeRegExp(codigo), "i").test(texto);
    if (!idOk || texto.length < 300) {
      return { nombre: "Ficha pública Mercado Público", tipo: "html", url: r.url || u.toString(), origen: "ficha_publica", texto: "", error: "La ficha pública no devolvió contenido verificable para este ID" };
    }
    return { nombre: "Ficha pública Mercado Público", tipo: "html", url: r.url || u.toString(), origen: "ficha_publica", texto, bytes: Buffer.byteLength(html, "utf8"), error: "" };
  } catch (e) {
    return { nombre: "Ficha pública Mercado Público", tipo: "html", url: u.toString(), origen: "ficha_publica", texto: "", error: e?.name === "AbortError" ? "Tiempo de lectura agotado" : "No se pudo leer la ficha pública" };
  }
}

function scoreDocumento(doc) {
  const s = (doc.nombre + " " + doc.tipo + " " + extensionDe(doc)).toLowerCase();
  let n = 0;
  if (/base|administrativ|t[eé]cnic|especificaci|t[eé]rmino|tdr/.test(s)) n += 80;
  if (/anexo|formato|declaraci|experiencia|profesional|presupuesto|itemizado|oferta/.test(s)) n += 55;
  if (/garant|visita|aclaraci|pregunta|respuesta|foro|modificaci/.test(s)) n += 45;
  if (/pdf|docx|doc|xlsx|xls|rtf|txt|csv|zip/.test(s)) n += 20;
  if (/acta.*adjudic|resoluci[oó]n.*adjudic/.test(s)) n -= 25;
  return n;
}

async function extraerTextoBuffer(buffer, ext, nombre) {
  const e = String(ext || "").toLowerCase();
  if (e === "pdf") {
    const pdf = require("pdf-parse");
    const out = await pdf(buffer);
    return limpiarTexto(out?.text || "");
  }
  if (e === "docx") {
    const mammoth = require("mammoth");
    const out = await mammoth.extractRawText({ buffer });
    return limpiarTexto(out?.value || "");
  }
  if (["xlsx", "xls", "xlsm"].includes(e)) {
    const XLSX = require("xlsx");
    const wb = XLSX.read(buffer, { type: "buffer", cellText: true, cellDates: false });
    const partes = [];
    for (const sheet of wb.SheetNames.slice(0, 12)) {
      partes.push(`HOJA: ${sheet}\n` + XLSX.utils.sheet_to_csv(wb.Sheets[sheet], { blankrows: false }));
    }
    return limpiarTexto(partes.join("\n\n"));
  }
  if (e === "zip") {
    const AdmZip = require("adm-zip");
    const zip = new AdmZip(buffer);
    const partes = [];
    for (const entry of zip.getEntries().filter(x => !x.isDirectory).slice(0, 12)) {
      const n = entry.entryName;
      const m = n.match(/\.([a-z0-9]{2,5})$/i);
      const subExt = m ? m[1].toLowerCase() : "";
      if (!["pdf", "docx", "xlsx", "xls", "rtf", "txt", "csv", "html", "htm", "xml"].includes(subExt)) continue;
      try {
        const t = await extraerTextoBuffer(entry.getData(), subExt, n);
        if (t) partes.push(`ARCHIVO EN ZIP: ${n}\n${t}`);
      } catch {}
      if (partes.join("\n").length > MAX_TEXT_PER_DOC) break;
    }
    return limpiarTexto(partes.join("\n\n"));
  }
  if (["html", "htm", "xml"].includes(e)) return textoPlanoHtml(buffer.toString("utf8"));
  if (e === "rtf") return textoRtf(buffer.toString("latin1"));
  if (["txt", "csv", "tsv"].includes(e)) return limpiarTexto(buffer.toString("utf8"));
  if (!e && /text|base|anexo/i.test(nombre || "")) return limpiarTexto(buffer.toString("utf8"));
  return "";
}

async function leerDocumento(doc, ticket) {
  const url = urlConTicket(doc.url, ticket);
  if (!/^https?:\/\//i.test(url)) return { ...doc, texto: "", error: "URL no válida" };
  try {
    const r = await fetchConTimeout(url, {
      headers: { "User-Agent": "NG-Ingenieria-Licitaciones/5.5" }
    }, 15000);
    if (!r.ok) return { ...doc, texto: "", error: `HTTP ${r.status}` };
    const len = Number(r.headers.get("content-length") || 0);
    if (len > MAX_FILE_BYTES) return { ...doc, texto: "", error: "Archivo demasiado grande para lectura automática" };
    const ab = await r.arrayBuffer();
    if (ab.byteLength > MAX_FILE_BYTES) return { ...doc, texto: "", error: "Archivo demasiado grande para lectura automática" };
    const buffer = Buffer.from(ab);
    const ext = extensionDe(doc);
    let texto = await extraerTextoBuffer(buffer, ext, doc.nombre);
    if (texto.length > MAX_TEXT_PER_DOC) texto = texto.slice(0, MAX_TEXT_PER_DOC);
    return { ...doc, texto, bytes: buffer.length, error: texto ? "" : "Formato sin texto extraíble" };
  } catch (e) {
    return {
      ...doc,
      texto: "",
      error: e?.name === "AbortError" ? "Tiempo de lectura agotado" : "No se pudo leer el archivo"
    };
  }
}

function recorte(texto, indice, ancho = 420) {
  const inicio = Math.max(0, indice - 125);
  const fin = Math.min(texto.length, indice + ancho);
  return limpiarTexto(texto.slice(inicio, fin)).replace(/\n/g, " ");
}

const DEFINICIONES = {
  visita: [
    /visita(?:\s+t[eé]cnica)?\s+(?:a|al|de|en)\s+terreno/i,
    /visita\s+obligatoria/i,
    /reuni[oó]n\s+(?:informativa|obligatoria|en\s+terreno)/i
  ],
  garantia: [
    /garant[ií]a\s+de\s+seriedad/i,
    /boleta\s+de\s+garant[ií]a/i,
    /vale\s+vista/i,
    /p[oó]liza.{0,40}garant/i
  ],
  admin: [
    /antecedentes?\s+administrativos?/i,
    /declaraci[oó]n\s+jurada/i,
    /vigencia\s+(?:de\s+la\s+)?sociedad/i,
    /personer[ií]a|poder(?:es)?\s+del\s+representante/i,
    /registro\s+de\s+proveedores/i
  ],
  experiencia: [
    /experiencia\s+(?:del\s+)?oferente/i,
    /obras?\s+similares/i,
    /contratos?\s+similares/i,
    /certificados?\s+de\s+experiencia/i,
    /experiencia\s+acreditable/i
  ],
  profesionales: [
    /profesional(?:es)?\s+(?:de\s+la\s+obra|obligatorio|required|exigido|residente)/i,
    /administrador\s+de\s+(?:obra|contrato)/i,
    /jefe\s+de\s+obra/i,
    /prevencionista/i,
    /constructor\s+civil|ingeniero\s+constructor|arquitecto/i,
    /curr[ií]culum|\bcv\b.{0,30}(?:profesional|experiencia)/i
  ],
  tecnica: [
    /oferta\s+t[eé]cnica/i,
    /metodolog[ií]a\s+(?:de\s+)?(?:trabajo|ejecuci[oó]n)/i,
    /programa\s+de\s+trabajo/i,
    /carta\s+gantt/i,
    /plan\s+de\s+(?:trabajo|calidad|seguridad)/i
  ],
  economica: [
    /oferta\s+econ[oó]mica/i,
    /presupuesto\s+(?:detallado|ofertado|oficial)/i,
    /itemizado/i,
    /precios?\s+unitarios?/i,
    /gastos?\s+generales/i,
    /utilidad|iva\s+(?:incluido|incluida)|neto\s*\+\s*iva/i
  ],
  plazo: [
    /plazo\s+(?:de\s+)?ejecuci[oó]n/i,
    /plazo\s+ofertado/i,
    /d[ií]as\s+(?:corridos|h[aá]biles)/i,
    /duraci[oó]n\s+(?:del\s+)?contrato/i
  ],
  foro: [
    /preguntas?\s+y\s+respuestas?/i,
    /foro\s+(?:de\s+)?preguntas/i,
    /aclaraciones?\s+(?:a\s+las\s+)?bases/i,
    /modificaci[oó]n\s+de\s+bases/i
  ],
  firmas: [
    /firma(?:do|da|s)?\s+(?:por|del|de\s+la)/i,
    /firma\s+electr[oó]nica/i,
    /suscrit[oa]\s+por/i,
    /representante\s+legal.{0,80}firma/i
  ],
  envio: [
    /oferta\s+electr[oó]nica/i,
    /subir.{0,80}(?:archivo|document|anexo)/i,
    /cargar.{0,80}(?:archivo|document|anexo)/i,
    /portal\s+mercado\s+p[uú]blico/i,
    /fecha\s+y\s+hora\s+de\s+cierre/i
  ]
};

function evidenciaCategoria(id, leidos) {
  if (id === "bases") {
    const conTexto = leidos.filter(d => d.texto);
    if (conTexto.length) {
      return {
        found: true,
        summary: `Se analizaron automáticamente ${conTexto.length} fuente(s) oficial(es): ${conTexto.slice(0, 4).map(d => d.nombre).join("; ")}${conTexto.length > 4 ? "…" : ""}`,
        sources: conTexto.map(d => d.nombre)
      };
    }
    return {
      found: false,
      summary: leidos.length
        ? "Se localizaron fuentes oficiales, pero no fue posible extraer texto automáticamente."
        : "No fue posible obtener texto oficial verificable para esta licitación.",
      sources: []
    };
  }
  const regs = DEFINICIONES[id] || [];
  const hits = [];
  for (const d of leidos) {
    if (!d.texto) continue;
    for (const re of regs) {
      const m = re.exec(d.texto);
      if (m) {
        hits.push({ source: d.nombre, text: recorte(d.texto, m.index) });
        break;
      }
    }
    if (hits.length >= 2) break;
  }
  if (!hits.length) {
    return {
      found: false,
      summary: "No encontrado en los documentos revisados.",
      sources: []
    };
  }
  return {
    found: true,
    summary: hits.map(h => h.text).join(" … ").slice(0, 900),
    sources: [...new Set(hits.map(h => h.source))]
  };
}

function porcentajeUnico(texto, expresiones) {
  const vals = [];
  for (const re of expresiones) {
    let m;
    const rg = new RegExp(re.source, re.flags.includes("g") ? re.flags : re.flags + "g");
    while ((m = rg.exec(texto)) && vals.length < 8) {
      const n = Number(String(m[1]).replace(",", "."));
      if (Number.isFinite(n) && n >= 0 && n <= 100) vals.push(n);
    }
  }
  const uniq = [...new Set(vals.map(v => Math.round(v * 100) / 100))];
  return uniq.length === 1 ? uniq[0] : null;
}

function extraerCriterios(leidos) {
  const texto = leidos.map(d => d.texto || "").join("\n").slice(0, 1200000);
  const precio = porcentajeUnico(texto, [
    /(?:criterio|factor|ponderaci[oó]n)?[^\n]{0,50}(?:precio|oferta\s+econ[oó]mica)[^\n%]{0,70}?(\d{1,3}(?:[.,]\d+)?)\s*%/ig,
    /(?:precio|oferta\s+econ[oó]mica)[^\n%]{0,70}?(\d{1,3}(?:[.,]\d+)?)\s*%/ig
  ]);
  const plazo = porcentajeUnico(texto, [
    /(?:criterio|factor|ponderaci[oó]n)?[^\n]{0,50}(?:plazo|tiempo\s+de\s+ejecuci[oó]n)[^\n%]{0,70}?(\d{1,3}(?:[.,]\d+)?)\s*%/ig,
    /(?:plazo|tiempo\s+de\s+ejecuci[oó]n)[^\n%]{0,70}?(\d{1,3}(?:[.,]\d+)?)\s*%/ig
  ]);
  let otros = null;
  if (precio !== null && plazo !== null && precio + plazo <= 100) {
    otros = Math.round((100 - precio - plazo) * 100) / 100;
  }
  const hallazgos = [];
  const re = /(criterios?\s+de\s+evaluaci[oó]n|ponderaci[oó]n|factor\s+precio)/ig;
  for (const d of leidos) {
    if (!d.texto) continue;
    const m = re.exec(d.texto);
    if (m) hallazgos.push({ source: d.nombre, text: recorte(d.texto, m.index, 550) });
    if (hallazgos.length >= 2) break;
  }
  return { precio, plazo, otros, hallazgos };
}

module.exports = async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Cache-Control", "s-maxage=300, stale-while-revalidate=600");

  const ticket = process.env.MP_TICKET;
  if (!ticket) return res.status(500).json({ ok: false, error: "Falta configurar MP_TICKET en Vercel." });

  const codigo = normalizarCodigo(req.query.codigo || "");
  if (!validoCodigo(codigo)) {
    return res.status(400).json({ ok: false, error: "Código de licitación inválido." });
  }

  try {
    const licUrl = new URL(MP_BASE + "/licitaciones.json");
    licUrl.searchParams.set("codigo", codigo);
    licUrl.searchParams.set("ticket", ticket);
    const lic = await fetchJson(licUrl.toString());

    if (!lic.ok || !lic.data) {
      return res.status(lic.status || 502).json({ ok: false, error: "No fue posible obtener la licitación desde Mercado Público." });
    }

    const tender = Array.isArray(lic.data?.Listado) ? lic.data.Listado[0] : lic.data;
    if (!tender) return res.status(404).json({ ok: false, error: "Licitación no encontrada." });

    const fichaPromise = leerFichaPublica(codigo);

    let apiArchivos = [];
    const archUrl = new URL(MP_BASE + "/licitaciones/" + encodeURIComponent(codigo) + "/Archivos.json");
    archUrl.searchParams.set("ticket", ticket);
    try {
      const ar = await fetchJson(archUrl.toString(), 10000);
      if (ar.ok && ar.data) apiArchivos = extraerListaArchivos(ar.data);
    } catch {}

    const embebidos = urlsEmbebidas(tender);
    const crudos = [...apiArchivos, ...embebidos];
    const mapa = new Map();

    crudos.forEach((x, i) => {
      const url = urlDoc(x);
      if (!url) return;
      const safe = sinTicket(url);
      const nombre = nombreDoc(x, i);
      const key = safe || nombre;
      if (!mapa.has(key)) {
        mapa.set(key, {
          nombre,
          url: safe,
          tipo: String(x?.Tipo || x?.TipoArchivo || extensionDe({ nombre, url: safe }) || "")
        });
      }
    });

    const documentos = [...mapa.values()]
      .map(d => ({ ...d, score: scoreDocumento(d) }))
      .sort((a, b) => b.score - a.score);

    const seleccionados = documentos
      .filter(d => d.score > 0 || /\.(pdf|docx?|xlsx?|xls|rtf|txt|csv|zip)(?:[?#]|$)/i.test(d.url))
      .slice(0, MAX_DOCS);

    const [fichaPublica, leidosAdjuntos] = await Promise.all([
      fichaPromise,
      Promise.all(seleccionados.map(d => leerDocumento(d, ticket)))
    ]);
    const leidos = fichaPublica?.texto ? [fichaPublica, ...leidosAdjuntos] : leidosAdjuntos;

    const reqIds = ["bases", "visita", "garantia", "admin", "experiencia", "profesionales", "tecnica", "economica", "plazo", "foro", "firmas", "envio"];
    const requisitos = {};
    reqIds.forEach(id => { requisitos[id] = evidenciaCategoria(id, leidos); });

    const criterios = extraerCriterios(leidos);
    const advertencias = [];
    if (!fichaPublica?.texto) advertencias.push("No fue posible leer la ficha pública completa de Mercado Público.");
    if (!documentos.length) {
      advertencias.push(fichaPublica?.texto
        ? "No se detectaron archivos adjuntos descargables; el análisis se realizó con la ficha pública oficial."
        : "No se detectaron archivos adjuntos descargables.");
    }
    if (documentos.length && !leidosAdjuntos.some(d => d.texto)) advertencias.push("Se encontraron archivos adjuntos, pero ninguno entregó texto utilizable automáticamente.");
    const fallidos = leidos.filter(d => d.error);
    if (fallidos.length) advertencias.push(`${fallidos.length} fuente(s) no pudieron leerse completamente.`);

    return res.status(200).json({
      ok: true,
      version: VERSION,
      codigo,
      fichaPublica: {
        leida: !!fichaPublica?.texto,
        url: fichaPublica?.url || (MP_FICHA + "?idlicitacion=" + encodeURIComponent(codigo)),
        error: fichaPublica?.error || null
      },
      documentosEncontrados: documentos.length,
      documentosSeleccionados: seleccionados.length,
      fuentesConTexto: leidos.filter(d => d.texto).length,
      documentosAnalizados: leidos.map(d => ({
        nombre: d.nombre,
        tipo: d.tipo || extensionDe(d) || "archivo",
        origen: d.origen || "archivo_adjunto",
        caracteres: d.texto?.length || 0,
        error: d.error || null
      })),
      requisitos,
      criterios,
      advertencias,
      fuente: "Ficha pública de Mercado Público + API pública + archivos asociados disponibles"
    });
  } catch (e) {
    return res.status(500).json({
      ok: false,
      error: e?.name === "AbortError" ? "La lectura automática excedió el tiempo disponible." : "No se pudo completar la lectura automática de bases."
    });
  }
};

module.exports.config = { maxDuration: 60 };
