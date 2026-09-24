const MP = 'https://api.mercadopublico.cl/servicios/v1/publico/licitaciones.json';
const NG = require('../public/consulta');

class ConsultaError extends Error {
  constructor(code, message, status = 502, retryable = true) {
    super(message); this.code = code; this.status = status; this.retryable = retryable;
  }
}

function interpretar(data, status, codigo) {
  const mensaje = String(data?.Mensaje || data?.Descripcion || data?.error || '').toLowerCase();
  if (status === 429 || /muchas consultas|l[ií]mite.*consulta|excedido.*consulta|too many|concurrencia/.test(mensaje)) {
    throw new ConsultaError('RATE_LIMIT', 'Mercado Público limitó temporalmente las consultas. Espera un momento y vuelve a intentar.', 503);
  }
  if ([401, 403].includes(status) || /ticket.*(?:inv[aá]lid|no v[aá]lid|incorrect)|(?:inv[aá]lid|incorrect).*ticket/.test(mensaje)) {
    throw new ConsultaError('UPSTREAM_AUTH', 'Mercado Público no autorizó la conexión. Debe revisarse la configuración de acceso.', 503, false);
  }
  if (status < 200 || status >= 300 || !Array.isArray(data?.Listado)) {
    throw new ConsultaError('UPSTREAM_UNAVAILABLE', 'Mercado Público no pudo responder la consulta. No se ha confirmado si la licitación existe. Vuelve a intentar.');
  }
  if (codigo && data.Listado.length === 0) {
    throw new ConsultaError('NOT_FOUND', 'No se encontró la licitación ' + codigo + '. Revisa que el ID esté completo.', 404, false);
  }
  if (data.Listado.some(t => !t || typeof t !== 'object' || !NG.valido(NG.codigo(t.CodigoExterno || t.Codigo)))) {
    throw new ConsultaError('INVALID_RESPONSE', 'Mercado Público devolvió información incompleta. Vuelve a intentar.');
  }
  if (codigo && (data.Listado.length !== 1 || NG.codigo(data.Listado[0].CodigoExterno || data.Listado[0].Codigo) !== codigo)) {
    throw new ConsultaError('MISMATCH', 'La respuesta no corresponde al ID solicitado. Vuelve a intentar.');
  }
  return data;
}

async function consultar({ codigo, fecha, ticket }, { fetchImpl = fetch, timeout = 9000, pause = 500 } = {}) {
  if (!ticket) throw new ConsultaError('CONFIGURATION', 'La conexión con Mercado Público no está configurada.', 503, false);
  const url = MP + '?' + new URLSearchParams({ ticket, ...(codigo ? { codigo } : { fecha }) });
  for (let intento = 0; intento < 2; intento++) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeout);
    try {
      const r = await fetchImpl(url, { signal: ctrl.signal, headers: { 'User-Agent': 'NG-Licitaciones/' + NG.VERSION }, cache: 'no-store' });
      // Keep the deadline active while reading the body, not only the headers.
      const text = await r.text();
      let data;
      try { data = JSON.parse(text); } catch { data = null; }
      return interpretar(data, r.status, codigo);
    } catch (error) {
      const e = error instanceof ConsultaError ? error : new ConsultaError(
        error.name === 'AbortError' ? 'TIMEOUT' : 'NETWORK',
        error.name === 'AbortError' ? 'Mercado Público demoró demasiado. Vuelve a intentar.' : 'No fue posible conectar con Mercado Público. Vuelve a intentar.',
        error.name === 'AbortError' ? 504 : 502
      );
      if (!e.retryable || intento === 1 || e.code === 'RATE_LIMIT') throw e;
    } finally { clearTimeout(timer); }
    await new Promise(resolve => setTimeout(resolve, pause));
  }
}
module.exports = { consultar, interpretar, ConsultaError };
