(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.NGConsulta = factory();
})(typeof window === 'undefined' ? this : window, function () {
  const VERSION = '5.5.3';
  const conocidos = ['1782-5-LR26', '3506-83-LP26', '2384-22-LR26', '2384-20-LR26'];
  function codigo(value) {
    let s = String(value ?? '').trim();
    if (/^https?:\/\//i.test(s)) {
      try {
        const url = new URL(s);
        if (url.hostname === 'mercadopublico.cl' || url.hostname.endsWith('.mercadopublico.cl')) {
          s = url.searchParams.get('idlicitacion') || url.searchParams.get('codigo') || s;
        }
      } catch {}
    }
    return s.toUpperCase().replace(/[\u2010-\u2015\u2212\uFF0D]/g, '-').replace(/\s*-\s*/g, '-');
  }
  function valido(value) { return /^\d{1,12}-\d{1,12}-[A-Z][A-Z0-9]{2,6}$/.test(value); }
  function distancia(a, b) {
    let row = Array.from({ length: b.length + 1 }, (_, i) => i);
    for (let i = 1; i <= a.length; i++) {
      const next = [i];
      for (let j = 1; j <= b.length; j++) next[j] = Math.min(next[j - 1] + 1, row[j] + 1, row[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      row = next;
    }
    return row[b.length];
  }
  function sugerencias(value, adicionales = []) {
    const c = codigo(value);
    if (!valido(c)) return [];
    return [...new Set([...conocidos, ...adicionales].map(codigo))]
      .filter(x => valido(x) && x !== c && x.split('-')[2] === c.split('-')[2] && distancia(c, x) === 1).slice(0, 3);
  }
  function numero(value) {
    if (typeof value === 'number') return Number.isFinite(value) ? value : null;
    let s = String(value ?? '').trim().replace(/\bCLP\b/gi, '').replace(/[$%\s\u00a0]/g, '');
    if (!s) return null;
    if (/^-?\d{1,3}(?:\.\d{3})+(?:,\d+)?$/.test(s)) s = s.replace(/\./g, '').replace(',', '.');
    else if (/^-?\d+,\d+$/.test(s)) s = s.replace(',', '.');
    else if (!/^-?\d+(?:\.\d+)?$/.test(s)) return null;
    const n = Number(s);
    return Number.isFinite(n) ? n : null;
  }
  function estado(t) {
    return t.Estado || ({ 5: 'Publicada', 6: 'Cerrada', 7: 'Desierta', 8: 'Adjudicada', 18: 'Revocada', 19: 'Suspendida' })[t.CodigoEstado ?? t.EstadoCodigo] || 'No informado';
  }
  async function consultar(params, options = {}) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), options.timeout || 25000);
    try {
      const r = await fetch('/api/licitaciones?' + new URLSearchParams(params), { signal: ctrl.signal, cache: 'no-store' });
      let j;
      try { j = await r.json(); } catch (error) {
        if (error.name === 'AbortError') throw error;
        throw new Error('No se pudo leer la respuesta del servidor. Vuelve a intentar.');
      }
      if (!r.ok || !j.ok) {
        const error = new Error(j.error || 'Mercado Público no pudo responder la consulta.');
        error.code = j.errorCode || (r.status === 404 ? 'NOT_FOUND' : 'UPSTREAM_UNAVAILABLE');
        error.retryable = j.retryable !== false && r.status !== 400 && r.status !== 404;
        throw error;
      }
      if (!Array.isArray(j.data?.Listado)) throw new Error('La respuesta recibida está incompleta. Vuelve a intentar.');
      return j;
    } catch (error) {
      if (error.name === 'AbortError') {
        const timeout = new Error('Mercado Público está demorando en responder. Puedes reintentar la consulta.');
        timeout.code = 'TIMEOUT'; timeout.retryable = true; throw timeout;
      }
      if (error instanceof TypeError) {
        const network = new Error('No se pudo conectar. Comprueba tu conexión y vuelve a intentar.');
        network.code = 'NETWORK'; network.retryable = true; throw network;
      }
      throw error;
    } finally { clearTimeout(timer); }
  }
  return { VERSION, codigo, valido, sugerencias, numero, estado, consultar };
});
