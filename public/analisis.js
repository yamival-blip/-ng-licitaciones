const $=id=>document.getElementById(id);
let detalle=null,analisis=null,codigoActual="";
const checks=[
 ["bases","Bases administrativas y técnicas revisadas","Requisitos, anexos, formatos, firmas y causales de inadmisibilidad."],
 ["visita","Visita a terreno / reunión obligatoria","Confirmar si existe, fecha, inscripción y comprobante de asistencia."],
 ["garantia","Garantía de seriedad","Confirmar monto, vigencia, glosa, beneficiario y formato."],
 ["admin","Documentos administrativos NG","Declaraciones, poderes, vigencia, registros y anexos exigidos."],
 ["experiencia","Experiencia exigida","Contratos/certificados válidos, montos, fechas y similitud."],
 ["profesionales","Profesionales y equipo","Títulos, CV, certificados, años de experiencia y dedicación."],
 ["tecnica","Oferta técnica","Metodología, programa, seguridad, calidad, recursos y anexos técnicos."],
 ["economica","Oferta económica","Itemizado, cantidades, precios unitarios, GG, utilidad, impuestos y total."],
 ["plazo","Plazo ofertado","Unidad, máximo permitido, evaluación y coherencia con el programa."],
 ["foro","Foro revisado","Preguntas, respuestas y aclaraciones que modifiquen las bases."],
 ["firmas","Firmas y formatos","Todos los documentos firmados y en el formato exigido."],
 ["envio","Carga y envío final","Archivos legibles, nombres correctos, peso permitido y comprobante antes del cierre."]
];

function esc(v){return String(v??"").replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[m]))}
function pick(o,paths){for(const p of paths){let v=o;for(const k of p.split(".")){if(v==null)break;v=v[k]}if(v!==undefined&&v!==null&&v!=="")return v}return null}
function firstTender(data){const l=data?.Listado||data?.listado||data?.ListadoLicitacion||[];return Array.isArray(l)&&l.length?l[0]:(data?.CodigoExterno||data?.Nombre?data:null)}
function ffecha(v){if(!v)return "No informado";const d=new Date(v);return Number.isNaN(d.getTime())?String(v):d.toLocaleString("es-CL")}
function fmonto(v){const n=Number(v);return Number.isFinite(n)&&n>0?n.toLocaleString("es-CL",{style:"currency",currency:"CLP",maximumFractionDigits:0}):"No informado"}
function key(){return "ng_postulacion_v3_"+codigoActual}
function saved(){try{return JSON.parse(localStorage.getItem(key())||"{}")}catch{return {}}}
function setTab(name){document.querySelectorAll('.tab').forEach(x=>x.classList.toggle('active',x.dataset.tab===name));document.querySelectorAll('.panel').forEach(x=>x.classList.toggle('active',x.id===name));history.replaceState(null,'','#'+name)}
document.querySelectorAll('.tab').forEach(b=>b.addEventListener('click',()=>setTab(b.dataset.tab)));

async function cargar(){
 const c=$("codigo").value.trim().toUpperCase();if(!c)return;codigoActual=c;$("estado").innerHTML='<span class="muted">Consultando Mercado Público…</span>';$("app").hidden=true;
 try{
  const ctrl=new AbortController();const timer=setTimeout(()=>ctrl.abort(),16000);
  const r=await fetch('/api/licitaciones?codigo='+encodeURIComponent(c),{signal:ctrl.signal,cache:'no-store'});clearTimeout(timer);
  let j;try{j=await r.json()}catch{throw new Error('El servidor no devolvió una respuesta válida.')}
  if(!r.ok||!j.ok)throw new Error(j.error||('Error HTTP '+r.status));
  const t=firstTender(j.data);if(!t)throw new Error('No se encontró información para este ID. Revisa que esté escrito exactamente como en Mercado Público.');
  detalle={
   codigo:pick(t,['CodigoExterno','Codigo'])||c,nombre:pick(t,['Nombre'])||'',descripcion:pick(t,['Descripcion'])||'',estado:pick(t,['Estado','EstadoCodigo'])||'',
   comprador:pick(t,['Comprador.NombreOrganismo','Comprador.NombreUnidad','NombreOrganismo'])||'',fechaPublicacion:pick(t,['Fechas.FechaPublicacion','FechaPublicacion']),
   fechaCierre:pick(t,['Fechas.FechaCierre','FechaCierre']),fechaApertura:pick(t,['Fechas.FechaApertura','FechaApertura']),montoEstimado:pick(t,['MontoEstimado','Monto','Presupuesto','ValorEstimado']),tipo:pick(t,['Tipo','TipoConvocatoria'])||'',
   items:Array.isArray(t?.Items?.Listado)?t.Items.Listado:[]
  };
  analisis=Array.isArray(j.analisis)?j.analisis[0]:j.analisis||null;
  render();restaurar();$("estado").innerHTML='<span class="good"><b>Licitación cargada:</b></span> '+esc(c)+' · '+esc(detalle.nombre||'');$("app").hidden=false;
  const hash=location.hash.replace('#','');if(['detalle','bases','oferta','docs','resultado'].includes(hash))setTab(hash);
 }catch(e){const msg=e.name==='AbortError'?'La consulta tardó demasiado. Intenta nuevamente.':e.message;$("estado").innerHTML='<span class="bad"><b>No se pudo cargar la licitación.</b></span><br>'+esc(msg)}
}

function render(){
 const t=detalle;
 const datos=[["ID",t.codigo||codigoActual],["Nombre",t.nombre||'Sin nombre'],["Estado",t.estado||'No informado'],["Comprador",t.comprador||'No informado'],["Publicación",ffecha(t.fechaPublicacion)],["Cierre",ffecha(t.fechaCierre)],["Apertura",ffecha(t.fechaApertura)],["Presupuesto",fmonto(t.montoEstimado)],["Tipo",t.tipo||'No informado']];
 $("datos").innerHTML=datos.map(([a,b])=>'<div class="kpi"><small>'+esc(a)+'</small><b>'+esc(b)+'</b></div>').join('');
 $("descripcion").innerHTML='<b>Descripción:</b><br>'+esc(t.descripcion||'No informada por la API.');
 $("presupuesto").value=Number(t.montoEstimado)>0?Number(t.montoEstimado):'';
 $("itemsLicitacion").innerHTML=t.items.length?t.items.map(i=>'<div class="itemrow"><b>'+esc(i.Correlativo??'')+' · '+esc(i.NombreProducto||i.Descripcion||'Ítem')+'</b><br><span class="muted">'+esc(i.Descripcion||'')+(i.Cantidad!=null?' · Cantidad: '+esc(i.Cantidad):'')+(i.UnidadMedida?' '+esc(i.UnidadMedida):'')+'</span></div>').join(''):'<span class="muted">Mercado Público no entregó ítems en esta consulta.</span>';
 renderChecklist();crearCartas();renderResultado();calcularBaja();
}

function renderChecklist(){const s=saved(),ck=s.ck||{};$("checklist").innerHTML=checks.map(([id,t,d])=>'<label class="check"><input type="checkbox" id="ck_'+id+'" '+(ck[id]?'checked':'')+'><span><strong>'+esc(t)+'</strong><br><small class="muted">'+esc(d)+'</small></span></label>').join('');checks.forEach(([id])=>$("ck_"+id).addEventListener('change',()=>{actualizarPct();guardar(true)}));actualizarPct()}
function actualizarPct(){const done=checks.filter(([id])=>$("ck_"+id)?.checked).length;const pct=Math.round(done*100/checks.length);$("pct").textContent=pct+'%';$("bar").style.width=pct+'%'}
function crearCartas(){const nombre=detalle?.nombre||'';const comprador=detalle?.comprador||'Organismo comprador';if(!$("cartaPresentacion").value)$("cartaPresentacion").value=`Señores\n${comprador}\n\nRef.: Licitación ${codigoActual} – ${nombre}\n\nNG Ingeniería y Servicios Ltda., RUT 77.060.047-2, presenta su oferta para el proceso indicado, declarando que los antecedentes administrativos, técnicos y económicos acompañados corresponden a su propuesta y se sujetan a las bases, anexos y aclaraciones vigentes.\n\nSaluda atentamente,\nNG Ingeniería y Servicios Ltda.`;if(!$("cartaCompromiso").value)$("cartaCompromiso").value=`Señores\n${comprador}\n\nRef.: Licitación ${codigoActual}\n\nNG Ingeniería y Servicios Ltda. manifiesta su compromiso de ejecutar las obligaciones que resulten adjudicadas conforme a la oferta presentada, las bases, anexos, aclaraciones y el contrato u orden de compra que corresponda.\n\nEste borrador debe ajustarse al anexo oficial si las bases lo exigen.`}

function renderResultado(){
 if(!analisis){$("analisisResultado").innerHTML='<span class="warn">No hay resultado estructurado disponible.</span>';return}
 let titulo='';if(analisis.resultadoNG==='ADJUDICADA_A_NG')titulo='<span class="good"><b>Resultado oficial detectado: adjudicada a NG.</b></span>';else if(analisis.resultadoNG==='NO_ADJUDICADA_A_NG')titulo='<span class="bad"><b>Resultado oficial detectado: no adjudicada a NG.</b></span>';else titulo='<span class="warn"><b>Proceso sin adjudicación oficial detectada.</b></span>';
 const adjud=(analisis.proveedoresAdjudicados||[]).map(x=>x.nombre).filter(Boolean).join(', ')||'No informado';
 $("analisisResultado").innerHTML=titulo+'<div class="grid3" style="margin-top:10px"><div class="kpi"><small>N° oferentes</small><b>'+esc(analisis.numeroOferentes??'No informado')+'</b></div><div class="kpi"><small>Adjudicatarios detectados</small><b>'+esc(adjud)+'</b></div><div class="kpi"><small>Monto adjudicado NG</small><b>'+esc(fmonto(analisis.montoAdjudicadoNG))+'</b></div></div>';
 $("faltantes").innerHTML='<b>Antes de la adjudicación:</b> para estimar una posición real se necesitan las ofertas de competidores y los criterios/puntajes de las bases. Si esos antecedentes no están disponibles, la app no debe concluir quién gana.';
}
function calcularBaja(){const p=Number($("presupuesto").value),o=Number(String($("ofertaMonto").value).replace(/[^0-9.-]/g,''));$("baja").value=p>0&&o>0?(((p-o)/p)*100).toFixed(2)+'%':''}
function guardar(silent=false){if(!codigoActual)return;const ck={};checks.forEach(([id])=>ck[id]=!!$("ck_"+id)?.checked);const ids=['textoBases','riesgos','metodologia','experiencia','profesionales','plan','ofertaMonto','plazo','unidad','iva','cartaPresentacion','cartaCompromiso','consultaForo'];const data={ck};ids.forEach(id=>data[id]=$(id).value);localStorage.setItem(key(),JSON.stringify(data));if(!silent)$("guardado").textContent='Guardado en este dispositivo: '+new Date().toLocaleString('es-CL')}
function restaurar(){const s=saved();for(const [k,v] of Object.entries(s)){if(k!=='ck'&&$(k))$(k).value=v}if(s.ck)checks.forEach(([id])=>{if($("ck_"+id))$("ck_"+id).checked=!!s.ck[id]});actualizarPct();calcularBaja()}
async function copiarResumen(){const faltan=checks.filter(([id])=>!$("ck_"+id)?.checked).map(([,t])=>'• '+t).join('\n');const text=`NG Ingeniería y Servicios Ltda.\nLicitación: ${codigoActual} – ${detalle?.nombre||''}\n\nPendientes:\n${faltan||'Sin pendientes'}\n\nOferta NG: ${$("ofertaMonto").value||'Pendiente'}\nPlazo: ${$("plazo").value||'Pendiente'} ${$("unidad").value}\nIVA: ${$("iva").value}\n\nRiesgos / observaciones:\n${$("riesgos").value||'Sin registrar'}`;try{await navigator.clipboard.writeText(text);$("guardado").textContent='Resumen copiado.'}catch{$("guardado").textContent='No se pudo copiar automáticamente.'}}

$("btnCargar").addEventListener('click',cargar);$("codigo").addEventListener('keydown',e=>{if(e.key==='Enter')cargar()});$("ofertaMonto").addEventListener('input',()=>{calcularBaja();guardar(true)});$("btnGuardar").addEventListener('click',()=>guardar(false));$("btnCopiar").addEventListener('click',copiarResumen);
['textoBases','riesgos','metodologia','experiencia','profesionales','plan','plazo','unidad','iva','cartaPresentacion','cartaCompromiso','consultaForo'].forEach(id=>$(id).addEventListener('change',()=>guardar(true)));
const qs=new URLSearchParams(location.search);const pre=qs.get('codigo');if(pre){$("codigo").value=pre.toUpperCase();cargar()}