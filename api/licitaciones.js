const NG = require('../public/consulta');
const { consultar } = require('../lib/mercado-publico');
const NG_RUT = '77060047-2';
const limpiarRut = value => String(value || '').replace(/[.\s]/g, '').toUpperCase();

function analizarLicitacion(t) {
  const items = Array.isArray(t?.Items?.Listado) ? t.Items.Listado : [];
  const adjudicaciones = items.flatMap(item => {
    const a = item?.Adjudicacion;
    if (!a || (!a.RutProveedor && !a.NombreProveedor)) return [];
    const cantidad = NG.numero(a.CantidadAdjudicada);
    const unitario = NG.numero(a.MontoUnitario ?? a.Monto);
    const directo = NG.numero(a.MontoTotal ?? a.MontoAdjudicado);
    return [{
      correlativo: item.Correlativo ?? null, producto: item.NombreProducto || item.Descripcion || '',
      rutProveedor: a.RutProveedor || '', nombreProveedor: a.NombreProveedor || '',
      cantidadAdjudicada: cantidad, montoUnitario: unitario,
      montoCalculado: directo ?? (cantidad !== null && unitario !== null ? cantidad * unitario : null)
    }];
  });
  const adjudicacionesNG = adjudicaciones.filter(a => limpiarRut(a.rutProveedor) === NG_RUT);
  const proveedoresAdjudicados = [...new Map(adjudicaciones.map(a => [limpiarRut(a.rutProveedor) || a.nombreProveedor, { rut: a.rutProveedor, nombre: a.nombreProveedor }])).values()];
  const codigoEstado = Number(t.CodigoEstado ?? t.EstadoCodigo ?? t.CodigoEstadoLicitacion);
  const estado = NG.estado(t);
  const adjudicada = codigoEstado === 8 || /^adjudicada$/i.test(estado.trim()) || adjudicaciones.length > 0;
  let resultadoNG = 'PENDIENTE';
  if (adjudicacionesNG.length) resultadoNG = 'ADJUDICADA_A_NG';
  else if (adjudicada) {
    const completo = items.length > 0 && adjudicaciones.length === items.length && adjudicaciones.every(a => limpiarRut(a.rutProveedor));
    resultadoNG = completo ? 'NO_ADJUDICADA_A_NG' : 'ADJUDICADA_SIN_DETALLE';
  }
  return {
    codigo: t.CodigoExterno || t.Codigo || '', nombre: t.Nombre || '', estado,
    codigoEstado: Number.isFinite(codigoEstado) ? codigoEstado : null,
    comprador: t.Comprador?.NombreOrganismo || t.Comprador?.NombreUnidad || '',
    region: t.Comprador?.RegionUnidad || t.Comprador?.Region || '', comuna: t.Comprador?.ComunaUnidad || t.Comprador?.Comuna || '',
    fechaCierre: t.Fechas?.FechaCierre || t.FechaCierre || null,
    resultadoNG, ngAdjudicada: adjudicacionesNG.length > 0, adjudicaciones, adjudicacionesNG, proveedoresAdjudicados,
    montoAdjudicadoNG: adjudicacionesNG.length && adjudicacionesNG.every(a => a.montoCalculado !== null) ? adjudicacionesNG.reduce((s, a) => s + a.montoCalculado, 0) : null,
    numeroOferentes: t.Adjudicacion?.NumeroOferentes ?? t.NumeroOferentes ?? null,
    urlActa: t.Adjudicacion?.UrlActa || t.Adjudicacion?.URLActa || null,
    actualizadoEn: new Date().toISOString()
  };
}

module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store, max-age=0');
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method && req.method !== 'GET') return res.status(405).json({ ok: false, errorCode: 'METHOD', error: 'Método no permitido.' });
  const codigo = NG.codigo(req.query.codigo), fecha = String(req.query.fecha || '').trim();
  const invalido = message => res.status(400).json({ ok: false, version: NG.VERSION, errorCode: 'INVALID_QUERY', retryable: false, error: message });
  if ((!codigo && !fecha) || (codigo && fecha)) return invalido('Indica un ID de licitación o una fecha (DDMMAAAA).');
  if (codigo && !NG.valido(codigo)) return invalido('ID incompleto o inválido. Usa el formato 1782-5-LR26.');
  if (fecha) {
    const d = new Date(Date.UTC(Number(fecha.slice(4)), Number(fecha.slice(2, 4)) - 1, Number(fecha.slice(0, 2))));
    if (!/^\d{8}$/.test(fecha) || d.getUTCDate() !== Number(fecha.slice(0, 2)) || d.getUTCMonth() + 1 !== Number(fecha.slice(2, 4)) || d.getUTCFullYear() !== Number(fecha.slice(4))) return invalido('Fecha inválida. Usa DDMMAAAA.');
  }
  try {
    const data = await consultar({ codigo, fecha, ticket: process.env.MP_TICKET });
    return res.status(200).json({ ok: true, version: NG.VERSION, cantidad: data.Listado.length, analisis: data.Listado.map(analizarLicitacion), data });
  } catch (e) {
    console.warn('[licitaciones] consulta_fallida', { codigo: codigo || undefined, tipo: e.code || 'INTERNAL' });
    if (e.code === 'RATE_LIMIT') res.setHeader('Retry-After', '30');
    return res.status(e.status || 502).json({
      ok: false, version: NG.VERSION, codigo, errorCode: e.code || 'INTERNAL', retryable: e.retryable !== false,
      error: e.code ? e.message : 'No se pudo completar la consulta. Vuelve a intentar.'
    });
  }
};
module.exports.analizarLicitacion = analizarLicitacion;
module.exports.config = { maxDuration: 30 };
