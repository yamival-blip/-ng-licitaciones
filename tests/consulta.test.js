const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { JSDOM } = require('jsdom');
const NG = require('../public/consulta');
const { consultar, interpretar } = require('../lib/mercado-publico');
const api = require('../api/licitaciones');
const codigo = '1782-5-LR26';
const otro = '3506-83-LP26';
const tender = c => ({ CodigoExterno:c, Nombre:'Obra '+c, CodigoEstado:6, MontoEstimado:2500000, Comprador:{NombreOrganismo:'Organismo de prueba'}, Fechas:{FechaActoAperturaTecnica:'2026-08-01T10:00:00'}, Items:{Listado:[]} });
const respuesta = (data,status=200) => ({ ok:status>=200&&status<300,status,text:async()=>JSON.stringify(data),json:async()=>data });
const bases = c => ({ok:true,codigo:c,documentosEncontrados:0,documentosAnalizados:[{nombre:'Ficha pública',origen:'ficha_publica',caracteres:900}],requisitos:{},criterios:{precio:80,plazo:10,otros:10}});
function view(home=false){
  const dom=new JSDOM(fs.readFileSync(__dirname+'/../public/'+(home?'index':'analisis')+'.html','utf8'),{url:'https://ng.test/'+(home?'':'analisis.html'),runScripts:'outside-only'});
  dom.window.AbortController=AbortController;
  dom.window.eval(fs.readFileSync(__dirname+'/../public/consulta.js','utf8'));
  dom.window.eval(fs.readFileSync(__dirname+'/../public/'+(home?'home-v5':'analisis-v54')+'.js','utf8'));
  return dom;
}
function serve(w){
  w.fetch=async url=>{
    const c=new URL(url,'https://ng.test').searchParams.get('codigo');
    if(url.startsWith('/api/bases'))return respuesta(bases(c));
    const t=tender(c);return respuesta({ok:true,data:{Listado:[t]},analisis:[api.analizarLicitacion(t)]});
  };
}
async function cargar(w,c){w.document.getElementById('codigo').value=c;await w.cargar();}
function res(){return {code:200,headers:{},setHeader(k,v){this.headers[k]=v},status(c){this.code=c;return this},json(data){this.data=data;return this},end(){}};}

test('normaliza códigos pegados y sugiere el dígito omitido sin alterar el ID',()=>{
  assert.equal(NG.codigo(' 1782 – 5 — lr26 '),codigo);
  assert.equal(NG.codigo('https://www.mercadopublico.cl/Procurement/Modules/RFB/DetailsAcquisition.aspx?idlicitacion=1782-5-LR26'),codigo);
  assert.equal(NG.codigo('782-5-LR26'),'782-5-LR26');
  assert.deepEqual(NG.sugerencias('782-5-LR26'),[codigo]);
  assert.deepEqual(NG.sugerencias('9000-12-LE26',['9000-13-LE26']),['9000-13-LE26']);
  assert.deepEqual(NG.sugerencias(codigo),[]);
  assert.equal(NG.valido('1782-5-'),false);
  assert.equal(NG.valido('1782--5-LR26'),false);
});

test('errores de Mercado Público con HTTP 200 no se transforman en no encontrada',()=>{
  assert.throws(()=>interpretar({Codigo:10500,Mensaje:'Error de sistema'},200,codigo),{code:'UPSTREAM_UNAVAILABLE',status:502});
  assert.throws(()=>interpretar({Mensaje:'Ticket inválido'},200,codigo),{code:'UPSTREAM_AUTH',retryable:false});
  assert.throws(()=>interpretar(null,429,codigo),{code:'RATE_LIMIT',status:503});
  assert.throws(()=>interpretar({Listado:[tender(otro)]},200,codigo),{code:'MISMATCH'});
  assert.throws(()=>interpretar({Listado:[null]},200,codigo),{code:'INVALID_RESPONSE'});
});

test('la búsqueda por fecha conserva licitaciones válidas aunque Mercado Público mezcle una fila defectuosa',()=>{
  const limpio=interpretar({Cantidad:2,Listado:[null,tender(codigo)]},200,null);
  assert.equal(limpio.Cantidad,1);
  assert.equal(limpio.Listado.length,1);
  assert.equal(limpio.Listado[0].CodigoExterno,codigo);
  assert.throws(()=>interpretar({Cantidad:1,Listado:[null]},200,null),{code:'INVALID_RESPONSE'});
});

test('reintenta una falla transitoria y conserva el resultado oficial',async()=>{
  let calls=0;
  const data=await consultar({codigo,ticket:'test-only'},{pause:0,fetchImpl:async()=>++calls===1?respuesta({Codigo:10500}):respuesta({Listado:[tender(codigo)]})});
  assert.equal(calls,2);assert.equal(data.Listado[0].CodigoExterno,codigo);
});

test('el plazo límite incluye la descarga del cuerpo y termina después de dos intentos',async()=>{
  let calls=0;
  const fetchImpl=async(url,{signal})=>{calls++;return {status:200,text:()=>new Promise((resolve,reject)=>signal.addEventListener('abort',()=>{const e=new Error('timeout');e.name='AbortError';reject(e)},{once:true}))}};
  await assert.rejects(consultar({codigo,ticket:'test-only'},{fetchImpl,timeout:10,pause:0}),{code:'TIMEOUT',status:504});
  assert.equal(calls,2);
});

test('un listado vacío confirma ausencia; la API valida el formato antes de consultar',async t=>{
  let calls=0;t.mock.method(global,'fetch',async()=>{calls++;return respuesta({Cantidad:0,Listado:[]})});
  const original=process.env.MP_TICKET;process.env.MP_TICKET='test-only';
  t.after(()=>{if(original===undefined)delete process.env.MP_TICKET;else process.env.MP_TICKET=original});
  let r=res();await api({method:'GET',query:{codigo:'782-5-LR26'}},r);
  assert.equal(r.code,404);assert.equal(r.data.errorCode,'NOT_FOUND');assert.match(r.headers['Cache-Control'],/no-store/);assert.equal(calls,1);
  for(const query of [{codigo:'bad'},{fecha:'31022026'},{codigo,fecha:'24092026'}]){
    r=res();await api({method:'GET',query},r);assert.equal(r.code,400);
  }
  assert.equal(calls,1);
});

test('no concluye que NG perdió cuando faltan detalles de adjudicación',()=>{
  assert.equal(api.analizarLicitacion({CodigoEstado:8}).resultadoNG,'ADJUDICADA_SIN_DETALLE');
  assert.equal(api.analizarLicitacion({Estado:'No adjudicada'}).resultadoNG,'PENDIENTE');
  const row=rut=>({Adjudicacion:{RutProveedor:rut,NombreProveedor:'Empresa',CantidadAdjudicada:1,MontoUnitario:1000}});
  const parcial={CodigoEstado:8,Items:{Listado:[row('11111111-1'),{}]}};
  assert.equal(api.analizarLicitacion(parcial).resultadoNG,'ADJUDICADA_SIN_DETALLE');
  assert.equal(api.analizarLicitacion({CodigoEstado:8,Items:{Listado:[row('11111111-1')]}}).resultadoNG,'NO_ADJUDICADA_A_NG');
  const ganada=api.analizarLicitacion({CodigoEstado:8,Items:{Listado:[row('77.060.047-2')]}});
  assert.equal(ganada.resultadoNG,'ADJUDICADA_A_NG');assert.equal(ganada.montoAdjudicadoNG,1000);
});

test('ofrece la corrección de la captura y solo consulta ese otro ID al pulsarla',async()=>{
  const dom=view(),w=dom.window,calls=[];
  w.fetch=async url=>{calls.push(url);return respuesta({ok:false,errorCode:'NOT_FOUND',retryable:false,error:'Revisa el ID completo.'},404)};
  await cargar(w,'782-5-LR26');
  assert.equal(calls.length,1);assert.match(calls[0],/codigo=782-5-LR26/);
  const button=w.document.querySelector('#estado button');assert.equal(button.textContent,'Consultar '+codigo);
  assert.equal(w.document.getElementById('app').hidden,true);
  serve(w);button.click();
  for(let n=0;n<20&&w.document.getElementById('btnCargar').disabled;n++)await new Promise(r=>setTimeout(r,5));
  assert.equal(w.document.getElementById('codigo').value,codigo);
  assert.match(w.document.getElementById('nombreLicitacion').textContent,new RegExp(codigo));
  assert.equal(w.document.getElementById('app').hidden,false);
  assert.match(w.location.search,/codigo=1782-5-LR26/);
  dom.window.close();
});

test('separa borradores por licitación, restaura guardados y calcula montos chilenos',async()=>{
  const dom=view(),w=dom.window;serve(w);
  await cargar(w,codigo);
  w.document.getElementById('ofertaMonto').value='2.000.000';
  w.document.getElementById('metodologia').value='Metodología exclusiva del primer proceso';
  w.calcularOferta();w.guardar(true);
  assert.equal(w.document.getElementById('baja').value,'20.00%');
  await cargar(w,otro);
  assert.equal(w.document.getElementById('ofertaMonto').value,'');
  assert.equal(w.document.getElementById('metodologia').value,'');
  assert.match(w.document.getElementById('cartaPresentacion').value,new RegExp(otro));
  assert.doesNotMatch(w.document.getElementById('cartaPresentacion').value,new RegExp(codigo));
  await cargar(w,codigo);
  assert.equal(w.document.getElementById('ofertaMonto').value,'2.000.000');
  assert.equal(w.document.getElementById('metodologia').value,'Metodología exclusiva del primer proceso');
  assert.equal(w.document.getElementById('baja').value,'20.00%');
  assert.match(w.document.getElementById('estado').textContent,/archivos de bases y anexos no se pudieron leer/);
  assert.doesNotMatch(w.document.getElementById('estado').textContent,/Análisis verificado/);
  dom.window.close();
});

test('bloquea doble envío y mantiene la ficha visible si falla la lectura de bases',async()=>{
  const dom=view(),w=dom.window;let release;let calls=0;
  w.fetch=async url=>{calls++;if(url.startsWith('/api/bases'))return respuesta({ok:false,error:'Fallo temporal del lector'},503);await new Promise(r=>{release=r});return respuesta({ok:true,data:{Listado:[tender(codigo)]},analisis:[api.analizarLicitacion(tender(codigo))]})};
  w.document.getElementById('codigo').value=codigo;
  const task=w.cargar();await w.cargar();assert.equal(calls,1);release();await task;
  assert.equal(w.document.getElementById('app').hidden,false);
  assert.match(w.document.getElementById('estado').textContent,/Ficha cargada, pero/);
  assert.equal(w.document.getElementById('btnCargar').disabled,false);
  dom.window.close();
});

test('muestra reintento ante fallas de red y avisa si el guardado no está disponible',async()=>{
  const dom=view(),w=dom.window;
  w.fetch=async()=>{throw new w.TypeError('Failed to fetch')};await cargar(w,codigo);
  assert.match(w.document.getElementById('estado').textContent,/Reintentar consulta/);
  assert.equal(w.document.querySelectorAll('.query-actions button').length,0);
  serve(w);await cargar(w,codigo);
  Object.defineProperty(w,'localStorage',{value:{getItem:()=>null,setItem:()=>{throw new Error('Quota exceeded')}}});
  assert.doesNotThrow(()=>w.guardar(false));
  assert.match(w.document.getElementById('guardado').textContent,/No se pudo guardar/);
  dom.window.close();
});

test('una búsqueda por fecha sin resultados no deja el indicador consultando',async()=>{
  const dom=view(true),w=dom.window;
  w.fetch=async()=>respuesta({ok:true,data:{Listado:[]},analisis:[]});
  await w.searchByDate();
  assert.match(w.document.getElementById('resultadoOportunidades').textContent,/no informó licitaciones/);
  assert.doesNotMatch(w.document.getElementById('resultadoOportunidades').textContent,/Consultando/);
  assert.ok(w.document.getElementById('ayudaCodigo').closest('.hero-card'));
  dom.window.close();
});

test('el lector conserva la ficha pública aunque la segunda consulta de la API falle',async t=>{
  const lector=require('../api/bases');
  const original=process.env.MP_TICKET;process.env.MP_TICKET='test-only';
  t.after(()=>{if(original===undefined)delete process.env.MP_TICKET;else process.env.MP_TICKET=original});
  const html='<html><body><h1>Licitación ID: '+codigo+'</h1><p>'+('Descripción de la obra pública y antecedentes oficiales. '.repeat(12))+'</p></body></html>';
  t.mock.method(global,'fetch',async url=>new Response(url.includes('DetailsAcquisition')?html:JSON.stringify({Codigo:10500,Mensaje:'Error de sistema'}),{status:200}));
  const r=res();await lector({method:'GET',query:{codigo}},r);
  assert.equal(r.code,200);assert.equal(r.data.fichaPublica.leida,true);
  assert.equal(r.data.fuentesConTexto,1);assert.equal(r.data.documentosEncontrados,0);
  assert.match(r.data.advertencias.join(' '),/consulta adicional/);
  assert.match(r.headers['Cache-Control'],/no-store/);
});
