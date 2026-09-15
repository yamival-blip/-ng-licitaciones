const MP =

  "https://api.mercadopublico.cl/servicios/v1/publico/licitaciones.json";

const NG_RUT = "77060047-2";

function limpiarRut(rut = "") {

  return String(rut)

    .replace(/\./g, "")

    .replace(/\s/g, "")

    .toUpperCase();

}

function analizarLicitacion(licitacion) {

  if (!licitacion) return null;

  const items = licitacion?.Items?.Listado || [];

  const adjudicaciones = [];

  for (const item of items) {

    const adj = item?.Adjudicacion;

    if (!adj) continue;

    if (!adj.RutProveedor && !adj.NombreProveedor) continue;

    const cantidad = Number(adj.CantidadAdjudicada || 0);

    const unitario = Number(adj.MontoUnitario || 0);

    adjudicaciones.push({

      correlativo: item.Correlativo || null,

      producto: item.NombreProducto || item.Descripcion || "",

      rutProveedor: adj.RutProveedor || "",

      nombreProveedor: adj.NombreProveedor || "",

      cantidadAdjudicada: cantidad,

      montoUnitario: unitario,

      montoCalculado: cantidad * unitario

    });

  }

  const adjudicacionesNG = adjudicaciones.filter(

    (a) => limpiarRut(a.rutProveedor) === limpiarRut(NG_RUT)

  );

  const proveedoresAdjudicados = [

    ...new Map(

      adjudicaciones.map((a) => [

        limpiarRut(a.rutProveedor) || a.nombreProveedor,

        {

          rut: a.rutProveedor,

          nombre: a.nombreProveedor

        }

      ])

    ).values()

  ];

  const estado = String(

    licitacion.Estado ||

      licitacion.CodigoEstado ||

      ""

  ).toLowerCase();

  const estaAdjudicada =

    estado.includes("adjudic") || adjudicaciones.length > 0;

  let resultadoNG = "PENDIENTE";

  if (estaAdjudicada) {

    resultadoNG =

      adjudicacionesNG.length > 0

        ? "ADJUDICADA_A_NG"

        : "NO_ADJUDICADA_A_NG";

  }

  return {

    codigo: licitacion.CodigoExterno || licitacion.Codigo || "",

    nombre: licitacion.Nombre || "",

    estado: licitacion.Estado || "",

    comprador: licitacion?.Comprador?.NombreOrganismo || "",

    fechaCierre:

      licitacion?.Fechas?.FechaCierre || null,

    resultadoNG,

    ngAdjudicada: adjudicacionesNG.length > 0,

    adjudicaciones,

    adjudicacionesNG,

    proveedoresAdjudicados,

    montoAdjudicadoNG: adjudicacionesNG.reduce(

      (total, a) => total + a.montoCalculado,

      0

    ),

    numeroOferentes:

      licitacion?.Adjudicacion?.NumeroOferentes || null,

    urlActa:

      licitacion?.Adjudicacion?.UrlActa || null

  };

}

module.exports = async function handler(req, res) {

  res.setHeader(

    "Cache-Control",

    "s-maxage=60, stale-while-revalidate=300"

  );

  res.setHeader("Access-Control-Allow-Origin", "*");

  const ticket = process.env.MP_TICKET;

  if (!ticket) {

    return res.status(500).json({

      ok: false,

      error:

        "Falta configurar MP_TICKET en las variables de entorno de Vercel."

    });

  }

  const codigo = String(req.query.codigo || "").trim();

  const fecha = String(req.query.fecha || "").trim();

  if (!codigo && !fecha) {

    return res.status(400).json({

      ok: false,

      error: "Indica codigo o fecha (DDMMAAAA)."

    });

  }

  const qs = new URLSearchParams({ ticket });

  if (codigo) qs.set("codigo", codigo);

  if (fecha) qs.set("fecha", fecha);

  try {

    const r = await fetch(`${MP}?${qs.toString()}`, {

      headers: {

        "User-Agent": "NG-Ingenieria-Licitaciones/2.0"

      }

    });

    const txt = await r.text();

    let data;

    try {

      data = JSON.parse(txt);

    } catch {

      data = { raw: txt };

    }

    if (!r.ok) {

      return res.status(r.status).json({

        ok: false,

        error: "Error API Mercado Público",

        data

      });

    }

    const listado = Array.isArray(data?.Listado)

      ? data.Listado

      : [];

    const analisis = listado.map(analizarLicitacion);

    return res.status(200).json({

      ok: true,

      cantidad: data?.Cantidad || listado.length,

      analisis,

      data

    });

  } catch (e) {

    return res.status(500).json({

      ok: false,

      error: e.message

    });

  }

};
