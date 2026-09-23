const MP = "https://api.mercadopublico.cl/servicios/v1/publico/licitaciones.json";
const NG_RUT = "77060047-2";
const VERSION = "5.5.0";

function limpiarRut(rut = "") {
  return String(rut).replace(/\./g, "").replace(/\s/g, "").toUpperCase();
}

function normalizarCodigo(v = "") {
  return String(v).trim().toUpperCase().replace(/[–—−]/g, "-").replace(/-+/g, "-");
}

function analizarLicitacion(licitacion) {
  if (!licitacion) return null;

  const items = Array.isArray(licitacion?.Items?.Listado) ? licitacion.Items.Listado : [];
  const adjudicaciones = [];

  for (const item of items) {
    const adj = item?.Adjudicacion;
    if (!adj || (!adj.RutProveedor && !adj.NombreProveedor)) continue;

    const cantidad = Number(adj.CantidadAdjudicada || 0);
    const unitario = Number(adj.MontoUnitario || adj.Monto || 0);
    const montoDirecto = Number(adj.MontoTotal || adj.MontoAdjudicado || 0);
    const montoCalculado = montoDirecto > 0 ? montoDirecto : cantidad * unitario;

    adjudicaciones.push({
      correlativo: item.Correlativo || null,
      producto: item.NombreProducto || item.Descripcion || "",
      rutProveedor: adj.RutProveedor || "",
      nombreProveedor: adj.NombreProveedor || "",
      cantidadAdjudicada: cantidad,
      montoUnitario: unitario,
      montoCalculado
    });
  }

  const adjudicacionesNG = adjudicaciones.filter(
    a => limpiarRut(a.rutProveedor) === limpiarRut(NG_RUT)
  );

  const proveedoresAdjudicados = [
    ...new Map(
      adjudicaciones.map(a => [
        limpiarRut(a.rutProveedor) || a.nombreProveedor,
        { rut: a.rutProveedor, nombre: a.nombreProveedor }
      ])
    ).values()
  ];

  const estadoTexto = String(licitacion.Estado || "").toLowerCase();
  const codigoEstado = Number(
    licitacion.CodigoEstado ?? licitacion.EstadoCodigo ?? licitacion.CodigoEstadoLicitacion
  );
  const estaAdjudicada =
    codigoEstado === 8 ||
    estadoTexto.includes("adjudic") ||
    adjudicaciones.length > 0;

  let resultadoNG = "PENDIENTE";
  if (estaAdjudicada) {
    resultadoNG = adjudicacionesNG.length > 0
      ? "ADJUDICADA_A_NG"
      : "NO_ADJUDICADA_A_NG";
  }

  return {
    codigo: licitacion.CodigoExterno || licitacion.Codigo || "",
    nombre: licitacion.Nombre || "",
    estado: licitacion.Estado || "",
    codigoEstado: Number.isFinite(codigoEstado) ? codigoEstado : null,
    comprador: licitacion?.Comprador?.NombreOrganismo || licitacion?.Comprador?.NombreUnidad || "",
    fechaCierre: licitacion?.Fechas?.FechaCierre || null,
    resultadoNG,
    ngAdjudicada: adjudicacionesNG.length > 0,
    adjudicaciones,
    adjudicacionesNG,
    proveedoresAdjudicados,
    montoAdjudicadoNG: adjudicacionesNG.reduce((total, a) => total + a.montoCalculado, 0),
    numeroOferentes:
      licitacion?.Adjudicacion?.NumeroOferentes ??
      licitacion?.NumeroOferentes ??
      null,
    urlActa:
      licitacion?.Adjudicacion?.UrlActa ||
      licitacion?.Adjudicacion?.URLActa ||
      null
  };
}

module.exports = async function handler(req, res) {
  res.setHeader("Cache-Control", "s-maxage=30, stale-while-revalidate=120");
  res.setHeader("Access-Control-Allow-Origin", "*");

  const ticket = process.env.MP_TICKET;
  if (!ticket) {
    return res.status(500).json({
      ok: false,
      version: VERSION,
      error: "Falta configurar MP_TICKET en las variables de entorno de Vercel."
    });
  }

  const codigo = normalizarCodigo(req.query.codigo || "");
  const fecha = String(req.query.fecha || "").trim();

  if (!codigo && !fecha) {
    return res.status(400).json({
      ok: false,
      version: VERSION,
      error: "Indica codigo o fecha (DDMMAAAA)."
    });
  }

  if (codigo && !/^[A-Z0-9][A-Z0-9-]{4,49}$/.test(codigo)) {
    return res.status(400).json({
      ok: false,
      version: VERSION,
      error: "Código de licitación inválido."
    });
  }

  const qs = new URLSearchParams({ ticket });
  if (codigo) qs.set("codigo", codigo);
  if (fecha) qs.set("fecha", fecha);

  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 18000);
    let r;
    try {
      r = await fetch(`${MP}?${qs.toString()}`, {
        signal: ctrl.signal,
        headers: { "User-Agent": "NG-Ingenieria-Licitaciones/5.5" }
      });
    } finally {
      clearTimeout(timer);
    }

    const txt = await r.text();
    let data;
    try {
      data = JSON.parse(txt);
    } catch {
      return res.status(502).json({
        ok: false,
        version: VERSION,
        error: "Mercado Público devolvió una respuesta no válida."
      });
    }

    if (!r.ok) {
      return res.status(r.status).json({
        ok: false,
        version: VERSION,
        error: "Error API Mercado Público",
        data
      });
    }

    const listado = Array.isArray(data?.Listado) ? data.Listado : [];
    if (codigo && !listado.length) {
      return res.status(404).json({
        ok: false,
        version: VERSION,
        error: "No se encontró la licitación solicitada.",
        data
      });
    }

    const analisis = listado.map(analizarLicitacion).filter(Boolean);

    return res.status(200).json({
      ok: true,
      version: VERSION,
      cantidad: Number(data?.Cantidad ?? listado.length),
      analisis,
      data
    });
  } catch (e) {
    return res.status(500).json({
      ok: false,
      version: VERSION,
      error: e?.name === "AbortError"
        ? "La consulta a Mercado Público excedió el tiempo disponible."
        : (e?.message || "No se pudo consultar Mercado Público.")
    });
  }
};
