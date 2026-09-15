const MP =

  "https://api.mercadopublico.cl/servicios/v1/publico/licitaciones.json";

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

        "User-Agent": "NG-Ingenieria-Licitaciones/1.0"

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

    return res.status(200).json({

      ok: true,

      data

    });

  } catch (e) {

    return res.status(500).json({

      ok: false,

      error: e.message

    });

  }

};
