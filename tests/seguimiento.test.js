const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { JSDOM } = require('jsdom');
const { crear, KEYS } = require('../public/seguimiento');
const api = require('../api/licitaciones');
const code = '1782-5-LR26', otro = '3506-83-LP26';
const tender = c => ({ CodigoExterno:c, Nombre:'Obra '+c, CodigoEstado:8,
  Adjudicacion:{NumeroOferentes:3}, Items:{Listado:[{Adjudicacion:{RutProveedor:'77.060.047-2',NombreProveedor:'NG Ingeniería',CantidadAdjudicada:1,MontoUnitario:1000}}]} });
const response = (data,status=200) => ({ok:status<400,status,json:async()=>data});
function view(home=false, initial={}) {
  const dom = new JSDOM(fs.readFileSync(__dirname+'/../public/'+(home?'index':'analisis')+'.html','utf8'), {
    url:'https://ng.test/'+(home?'':'analisis.html'),runScripts:'outside-only'
  });
  const w=dom.window; w.AbortController=AbortController;
  for (const [key,value] of Object.entries(initial)) w.localStorage.setItem(key,value);
  for (const file of ['consulta','seguimiento',home?'home-v5':'analisis-v54']) w.eval(fs.readFileSync(__dirname+'/../public/'+file+'.js','utf8'));
  return dom;
}
function copyStorage(w) { return Object.fromEntries(Array.from({length:w.localStorage.length},(_,i)=>{const k=w.localStorage.key(i);return [k,w.localStorage.getItem(k)];})); }

test('analizar, volver al inicio y recargar conserva negocio, competencia y borrador aunque fallen las bases',async()=>{
  const dom=view(),w=dom.window;
  w.fetch=async url=>url.startsWith('/api/bases')?response({ok:false,error:'HTTP 503'},503):response({ok:true,data:{Listado:[tender(code)]},analisis:[api.analizarLicitacion(tender(code))]});
  w.document.getElementById('codigo').value=code;await w.cargar();
  w.document.getElementById('metodologia').value='Plan específico de NG';w.guardar(false);
  assert.match(w.document.getElementById('guardado').textContent,/Guardada en Mis negocios/);
  const home=view(true,copyStorage(w)),h=home.window;
  assert.equal(h.document.getElementById('kpiGuardados').textContent,'1');
  assert.equal(h.document.getElementById('compAdjudicatarios').textContent,'1');
  assert.equal(h.document.getElementById('compOferentes').textContent,'1');
  assert.equal(h.document.getElementById('kpiGanadas').textContent,'1');
  assert.match(h.document.getElementById('listaNegocios').textContent,/1782-5-LR26/);
  const reload=view(true,copyStorage(h));
  assert.equal(reload.window.document.getElementById('negociosCount').textContent,'1');
  assert.equal(reload.window.NGSeguimiento.borrador(code).metodologia,'Plan específico de NG');
  [dom,home,reload].forEach(x=>x.window.close());
});

test('recupera borradores v4 y antiguos sin borrar contenidos, duplicar ni revivir procesos quitados',()=>{
  const initial={['ng_postulacion_v4_'+code]:JSON.stringify({metodologia:'v4',ofertaMonto:'1.000.000'}),['ng_postulacion_'+otro]:JSON.stringify({metodologia:'antigua'}),['ng_postulacion_v4_bad']:'{}'};
  const dom=view(true,initial),w=dom.window;
  assert.equal(w.document.getElementById('negociosCount').textContent,'2');
  w.NGSeguimiento.migrar();assert.equal(w.NGSeguimiento.negocios().length,2);
  for(const [key,value] of Object.entries(initial))assert.equal(w.localStorage.getItem(key),value);
  assert.equal(w.NGSeguimiento.borrador(otro).metodologia,'antigua');
  w.removeBusiness(code);w.NGSeguimiento.migrar();
  assert.equal(w.NGSeguimiento.negocios().length,1);
  assert.equal(w.NGSeguimiento.borrador(code).metodologia,'v4');
  w.NGSeguimiento.guardar({codigo:code,nombre:'Consultada otra vez'});
  assert.equal(w.NGSeguimiento.negocios().length,2);
  dom.window.close();
});

test('una búsqueda masiva de resúmenes no borra adjudicatarios, número de oferentes ni ofertas',async()=>{
  const dom=view(true),w=dom.window;
  w.NGSeguimiento.guardar(api.analizarLicitacion(tender(code)),true);
  w.NGSeguimiento.guardarBorrador(code,{ofertaMonto:'1.000.000'});
  const summaries=[{CodigoExterno:code,Nombre:'Obra',CodigoEstado:8},...Array.from({length:550},(_,i)=>({CodigoExterno:'9000-'+(i+1)+'-LE26',Nombre:'Proceso '+i,CodigoEstado:5}))];
  w.fetch=async()=>response({ok:true,data:{Listado:summaries},analisis:summaries.map(api.analizarLicitacion)});
  await w.searchByDate();
  assert.equal(w.NGSeguimiento.historial().length,1);
  const h=w.NGSeguimiento.historial()[0];
  assert.equal(h.ngAdjudicada,true);assert.equal(h.numeroOferentes,3);assert.equal(h.proveedoresAdjudicados.length,1);
  assert.equal(w.NGSeguimiento.borrador(code).ofertaMonto,'1.000.000');
  assert.equal(w.document.getElementById('compAdjudicatarios').textContent,'1');
  dom.window.close();
});

test('distingue falta de cobertura de cero oferentes informado y actualiza al volver atrás',()=>{
  const dom=view(true),w=dom.window;
  assert.equal(w.document.getElementById('compAdjudicatarios').textContent,'—');
  assert.equal(w.document.getElementById('compOferentes').textContent,'—');
  w.NGSeguimiento.guardar({codigo:code,nombre:'Obra',numeroOferentes:0},true);
  w.dispatchEvent(new w.PageTransitionEvent('pageshow',{persisted:true}));
  assert.equal(w.document.getElementById('negociosCount').textContent,'1');
  assert.equal(w.document.getElementById('compAdjudicatarios').textContent,'0');
  assert.equal(w.document.getElementById('compOferentes').textContent,'1');
  assert.match(w.document.getElementById('compCobertura').textContent,/1 fichas consultadas/);
  dom.window.close();
});

test('datos corruptos o almacenamiento bloqueado muestran aviso y no se sobrescriben',()=>{
  for(const invalid of ['{malformado', '{}', '[null]']){
    const dom=view(true,{[KEYS.saved]:invalid}),w=dom.window;
    assert.equal(w.document.getElementById('estadoGuardado').hidden,false);
    assert.doesNotThrow(()=>w.addBusiness({codigo:code}));
    assert.equal(w.localStorage.getItem(KEYS.saved),invalid);
    dom.window.close();
  }
  const dom=view(true),w=dom.window;
  Object.defineProperty(w,'localStorage',{value:{getItem:()=>null,setItem:()=>{throw new Error('Quota exceeded')}}});
  assert.doesNotThrow(()=>w.addBusiness({codigo:code}));
  assert.match(w.document.getElementById('estadoGuardado').textContent,/No se pudo guardar/);
  assert.equal(w.document.getElementById('kpiGuardados').textContent,'0');
  dom.window.close();
});

test('bloquea consultas duplicadas por fecha y restablece controles y contadores al fallar',async()=>{
  const dom=view(true),w=dom.window;let release,calls=0;
  w.fetch=async()=>{calls++;await new Promise(r=>release=r);return response({ok:true,data:{Listado:[]},analisis:[]});};
  const task=w.searchByDate();await w.searchByDate();assert.equal(calls,1);
  assert.equal(w.document.getElementById('btnBuscar').disabled,true);release();await task;
  w.fetch=async()=>response({ok:false,error:'Servicio temporalmente no disponible'},503);
  await w.searchByDate();
  assert.equal(w.document.getElementById('btnBuscar').disabled,false);
  assert.equal(w.document.getElementById('kpiOportunidades').textContent,'0');
  assert.match(w.document.getElementById('resultadoOportunidades').textContent,/Servicio temporalmente/);
  dom.window.close();
});

test('actualiza guardadas en serie, registra cambios y conserva el proceso que falla',async()=>{
  const dom=view(true),w=dom.window;
  w.NGSeguimiento.guardar({codigo:code,nombre:'Obra anterior',estado:'Cerrada'});
  w.NGSeguimiento.guardar({codigo:otro,nombre:'Otro proceso',estado:'Cerrada'});
  let active=0,max=0;
  w.fetch=async url=>{
    active++;max=Math.max(max,active);await new Promise(r=>setTimeout(r,2));active--;
    if(url.includes(otro))return response({ok:false,error:'Error transitorio'},503);
    return response({ok:true,data:{Listado:[tender(code)]},analisis:[api.analizarLicitacion(tender(code))]});
  };
  await w.refreshAll();
  assert.equal(max,1);assert.equal(w.NGSeguimiento.negocios().length,2);
  assert.equal(w.NGSeguimiento.negocios().find(x=>x.codigo===otro).nombre,'Otro proceso');
  assert.equal(w.NGSeguimiento.alertas().length,1);
  assert.match(w.document.getElementById('estadoSeguimiento').textContent,/1 de 2 actualizadas/);
  assert.match(w.document.getElementById('estadoSeguimiento').textContent,/3506-83-LP26/);
  assert.equal(w.document.getElementById('btnActualizarNegocios').disabled,false);
  dom.window.close();
});
