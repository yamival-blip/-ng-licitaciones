(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./consulta'));
  else root.NGSeguimiento = factory(root.NGConsulta).crear(() => root.localStorage);
})(typeof window === 'undefined' ? this : window, function (NG) {
  const KEYS = { saved: 'ng_v5_negocios', history: 'ng_v5_historial', alerts: 'ng_v5_alertas', removed: 'ng_v5_quitados' };
  const prefixes = ['ng_postulacion_v4_', 'ng_postulacion_'];

  function crear(getStorage) {
    const storage = () => typeof getStorage === 'function' ? getStorage() : getStorage;
    function leer(key, fallback) {
      const raw = storage().getItem(key);
      if (raw === null) return fallback;
      try { return JSON.parse(raw); }
      catch { throw new Error('Hay datos guardados que no se pudieron leer. Se conservan para su recuperación.'); }
    }
    function lista(key) {
      const data = leer(key, []);
      if (!Array.isArray(data) || data.some(x => !x || typeof x !== 'object' || Array.isArray(x))) {
        throw new Error('El seguimiento guardado tiene un formato inválido. Se conservan los datos originales.');
      }
      return data;
    }
    function escribir(key, value) { storage().setItem(key, JSON.stringify(value)); }
    function codigoValido(value) {
      const code = NG.codigo(value);
      if (!NG.valido(code)) throw new Error('El seguimiento necesita un ID completo.');
      return code;
    }
    function combinar(prev, o, completo) {
      const next = { ...prev, codigo: codigoValido(o.codigo) };
      for (const field of ['nombre', 'descripcion', 'comprador', 'estado', 'region', 'comuna', 'fechaCierre', 'montoEstimado']) {
        if (o[field] !== undefined && o[field] !== null && o[field] !== '' && o[field] !== 'No informado') next[field] = o[field];
      }
      next.actualizadoEn = new Date().toISOString();
      if (completo) {
        next.detalleConsultado = true;
        next.detalleActualizadoEn = next.actualizadoEn;
        next.numeroOferentes = NG.numero(o.numeroOferentes);
        next.proveedoresAdjudicados = Array.isArray(o.proveedoresAdjudicados) ? o.proveedoresAdjudicados : [];
        next.ngAdjudicada = o.ngAdjudicada === true;
        next.resultadoNG = o.resultadoNG || 'PENDIENTE';
        next.montoAdjudicadoNG = o.montoAdjudicadoNG ?? null;
      }
      return next;
    }
    function recordar(o, completo = false) {
      const code = codigoValido(o.codigo), all = lista(KEYS.history);
      const prev = all.find(x => NG.codigo(x.codigo) === code);
      const next = combinar(prev, o, completo);
      if (prev?.estado && next.estado && prev.estado !== 'No informado' && prev.estado !== next.estado) {
        const notices = lista(KEYS.alerts);
        notices.unshift({ fecha: next.actualizadoEn, codigo: code, texto: 'Estado cambió de “' + prev.estado + '” a “' + next.estado + '”.' });
        escribir(KEYS.alerts, notices.slice(0, 100));
      }
      // Detailed consultations must not be evicted by a large date search.
      escribir(KEYS.history, [next, ...all.filter(x => NG.codigo(x.codigo) !== code)]);
      return next;
    }
    function guardar(o, completo = false) {
      const code = codigoValido(o.codigo), all = lista(KEYS.saved);
      const prev = all.find(x => NG.codigo(x.codigo) === code);
      const next = combinar(prev, o, completo);
      next.guardadoEn = prev?.guardadoEn || new Date().toISOString();
      escribir(KEYS.saved, [next, ...all.filter(x => NG.codigo(x.codigo) !== code)]);
      const quitados = lista(KEYS.removed);
      if (quitados.some(x => x.codigo === code)) escribir(KEYS.removed, quitados.filter(x => x.codigo !== code));
      recordar(o, completo);
      return next;
    }
    function quitar(value) {
      const code = codigoValido(value), all = lista(KEYS.saved), quitados = lista(KEYS.removed);
      // Keep drafts and consultation history; remember an intentional removal.
      escribir(KEYS.removed, [...quitados.filter(x => x.codigo !== code), { codigo: code }]);
      escribir(KEYS.saved, all.filter(x => NG.codigo(x.codigo) !== code));
    }
    function borrador(value) {
      const code = codigoValido(value);
      const old = leer(prefixes[1] + code, {}), current = leer(prefixes[0] + code, {});
      if (!old || !current || typeof old !== 'object' || typeof current !== 'object' || Array.isArray(old) || Array.isArray(current)) {
        throw new Error('No se pudo leer el borrador anterior. Se conserva sin cambios.');
      }
      return { ...old, ...current };
    }
    function guardarBorrador(value, data) { escribir(prefixes[0] + codigoValido(value), data); }
    function migrar() {
      const all = lista(KEYS.saved), quitados = lista(KEYS.removed), s = storage();
      const known = new Set(all.map(x => NG.codigo(x.codigo)));
      const removed = new Set(quitados.map(x => NG.codigo(x.codigo)));
      const codes = new Set();
      for (let i = 0; i < s.length; i++) {
        const key = s.key(i), prefix = prefixes.find(p => key?.startsWith(p));
        if (!prefix) continue;
        const code = NG.codigo(key.slice(prefix.length));
        if (NG.valido(code) && !known.has(code) && !removed.has(code)) codes.add(code);
      }
      let recuperados = 0;
      for (const code of codes) {
        const draft = borrador(code);
        if (!Object.keys(draft).length) continue;
        all.push({ codigo: code, nombre: '', recuperadoDeBorrador: true, guardadoEn: new Date().toISOString() });
        recuperados++;
      }
      if (recuperados) escribir(KEYS.saved, all);
      return all;
    }
    return { KEYS, negocios: () => lista(KEYS.saved), historial: () => lista(KEYS.history), alertas: () => lista(KEYS.alerts),
      limpiarAlertas: () => escribir(KEYS.alerts, []), recordar, guardar, quitar, borrador, guardarBorrador, migrar };
  }
  return { crear, KEYS };
});
