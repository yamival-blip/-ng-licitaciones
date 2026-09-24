const $=id=>document.getElementById(id);
let detalle=null, analisisMP=null, analisisBases=null, codigoActual="";

const requisitos=[
  ["bases","Bases administrativas y técnicas","Revisar bases, anexos, formatos, firmas y causales de inadmisibilidad."],
  ["visita","Visita a terreno / reunión","Confirmar si existe, si es obligatoria, fecha, inscripción y comprobante."],
  ["garantia","Garantía de seriedad","Confirmar monto, vigencia, glosa, beneficiario y formato."],
  ["admin","Documentos administrativos NG","Declaraciones, poderes, vigencia, registros y anexos exigidos."],
  ["experiencia","Experiencia exigida","Contratos/certificados válidos, montos, fechas y similitud."],
  ["profesionales","Profesionales y equipo","Títulos, CV, certificados, años de experiencia y dedicación."],
  ["tecnica","Oferta técnica","Metodología, programa, seguridad, calidad, recursos y anexos técnicos."],
  ["economica","Oferta económica","Itemizado, cantidades, precios unitarios, GG, utilidad, impuestos y total."],
  ["plazo","Plazo ofertado","Unidad, máximo permitido, evaluación y coherencia con el programa."],
  ["foro","Foro y aclaraciones","Preguntas, respuestas y aclaraciones que modifiquen las bases."],
  ["firmas","Firmas y formatos","Todos los documentos firmados y en el formato exigido."],
  ["envio","Carga y envío final","Archivos legibles, nombres correctos, peso permitido y comprobante antes del cierre."]
];

const estadoOptions=[
  ["analizando","Analizando bases"],
  ["faltante","Falta antecedente"],
  ["noencontrado","No encontrado"],
  ["detectado","Detectado en bases / MP"],
  ["confirmado","Cumple / confirmado"],
  ["bloqueo","No cumple / bloqueo"],
  ["noaplica","No aplica"]
];

function esc(v){return String(v??"").replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[m]))}
function pick(o,paths){for(const p of paths){let v=o;for(const k of p.split(".")){if(v==null)break;v=v[k]}if(v!==undefined&&v!==null&&v!=="")return v}return null}
function firstTender(data){const l=data?.Listado||data?.listado||data?.ListadoLicitacion||[];return Array.isArray(l)&&l.length?l[0]:(data?.CodigoExterno||data?.Nombre?data:null)}
function ffecha(v){if(!v)return "No informado";const d=new Date(v);return Number.isNaN(d.getTime())?String(v):d.toLocaleString("es-CL")}
function fmonto(v){const n=Number(v);return Number.isFinite(n)&&n>0?n.toLocaleString("es-CL",{style:"currency",currency:"CLP",maximumFractionDigits:0}):"No informado"}
function num(v){return NGConsulta.numero(v)}
function key(){return "ng_postulacion_v4_"+codigoActual}
function saved(){try{const s=JSON.parse(localStorage.getItem(key())||"{}");return s&&typeof s==="object"&&!Array.isArray(s)?s:{}}catch{return {}}}
function now(){return new Date().toLocaleString("es-CL")}
function statusClass(v){if(v==="confirmado")return"ok";if(v==="detectado"||v==="analizando")return"info";if(v==="bloqueo")return"danger";if(v==="noaplica"||v==="noencontrado")return"neutral";return"warning"}
function statusLabel(v){return estadoOptions.find(x=>x[0]===v)?.[1]||"Falta antecedente"}

function modalidadPago(v){const m={1:"Pago a 30 días",2:"Pago a 30, 60 y 90 días",3:"Pago al día",4:"Pago anual",5:"Pago bimensual",6:"Pago contra entrega conforme",7:"Pagos mensuales",8:"Pago por estado de avance",9:"Pago trimestral",10:"Pago a 60 días"};return m[Number(v)]||v||"No informada"}
function unidadTiempo(v){const u={1:"horas",2:"días",3:"semanas",4:"meses",5:"años"};return u[Number(v)]||v||""}

function mpEvidence(id){
  const r=detalle?.raw||{};
  const fechaVisita=pick(r,["Fechas.FechaVisitaTerreno","FechaVisitaTerreno"]);
  const direccionVisita=pick(r,["DireccionVisita"]);
  const duracion=pick(r,["TiempoDuracionContrato"]);
  const tipoDuracion=pick(r,["TipoDuracionContrato"]);
  const unidadDuracion=pick(r,["UnidadTiempoDuracionContrato","UnidadTiempo"]);
  const inicioForo=pick(r,["Fechas.FechaInicio"]);
  const finForo=pick(r,["Fechas.FechaFinal"]);
  const pubRespuestas=pick(r,["Fechas.FechaPubRespuestas"]);
  if(id==="visita"&&(fechaVisita||direccionVisita))return "Mercado Público informa"+(fechaVisita?": "+ffecha(fechaVisita):"")+(direccionVisita?" · "+direccionVisita:"");
  if(id==="plazo"&&(duracion||tipoDuracion))return "Duración informada: "+(duracion||"")+(tipoDuracion?" "+tipoDuracion:" "+unidadTiempo(unidadDuracion));
  if(id==="foro"&&(inicioForo||finForo||pubRespuestas))return "Foro informado por Mercado Público"+(inicioForo?": inicia "+ffecha(inicioForo):"")+(finForo?" · cierra "+ffecha(finForo):"")+(pubRespuestas?" · respuestas "+ffecha(pubRespuestas):"");
  return "";
}
function baseResult(id){return analisisBases?.requisitos?.[id]||null}
function baseStats(){
  const docs=analisisBases?.documentosAnalizados||[];
  const leidos=docs.filter(d=>Number(d.caracteres)>0);
  return {docs,leidos,encontrados:Number(analisisBases?.documentosEncontrados||0),fichaLeida:!!analisisBases?.fichaPublica?.leida};
}
function autoEvidence(id){
  const br=baseResult(id);
  if(br?.found){
    const fuente=Array.isArray(br.sources)&&br.sources.length?" · Fuente: "+br.sources.slice(0,2).join("; "):"";
    return (id==="bases"?"":"Bases: ")+(br.summary||"Requisito detectado.")+fuente;
  }
  const mp=mpEvidence(id); if(mp)return mp;
  if(analisisBases===null)return "Leyendo fuentes oficiales de Mercado Público…";
  if(analisisBases?.ok&&baseStats().leidos.length>0&&br)return br.summary||"No encontrado en las fuentes oficiales revisadas.";
  if(analisisBases?.ok&&baseStats().leidos.length>0)return "No encontrado en las fuentes oficiales revisadas.";
  if(analisisBases?.ok)return "Falta antecedente: no hubo texto oficial legible para verificar este requisito.";
  return "Falta antecedente: la lectura automática no estuvo disponible.";
}
function autoState(id){
  const br=baseResult(id);
  if(br?.found||mpEvidence(id))return"detectado";
  if(analisisBases===null)return"analizando";
  if(analisisBases?.ok&&baseStats().leidos.length>0)return"noencontrado";
  return"faltante";
}
function effectiveState(id,st){const v=st&&st[id];return["confirmado","bloqueo","noaplica"].includes(v)?v:autoState(id)}
function automaticFacts(){
  const r=detalle?.raw||{},facts=[];
  if(analisisBases?.ok){const bs=baseStats();facts.push(["Fuentes oficiales",bs.leidos.length?bs.leidos.length+" fuente(s) con texto analizado · "+bs.encontrados+" archivo(s) adjunto(s) localizado(s)":"Sin texto oficial legible para análisis"])}
  else if(analisisBases===null)facts.push(["Fuentes oficiales","Lectura automática en curso…"]);
  const visita=mpEvidence("visita");if(visita)facts.push(["Visita / reunión",visita]);
  const plazo=mpEvidence("plazo");if(plazo)facts.push(["Duración / plazo",plazo]);
  const foro=mpEvidence("foro");if(foro)facts.push(["Foro",foro]);
  const modalidad=pick(r,["Modalidad"]);if(modalidad!==null&&modalidad!==undefined&&modalidad!=="")facts.push(["Modalidad de pago",modalidadPago(modalidad)]);
  const sub=pick(r,["SubContratacion"]);if(sub!==null&&sub!==undefined&&sub!=="")facts.push(["Subcontratación",Number(sub)===1?"Permitida":Number(sub)===0?"No permitida":String(sub)]);
  const reclamos=pick(r,["CantidadReclamos"]);if(reclamos!==null&&reclamos!==undefined&&reclamos!=="")facts.push(["Reclamos informados",String(reclamos)]);
  const contrato=pick(r,["Contrato"]);if(contrato!==null&&contrato!==undefined&&contrato!=="")facts.push(["Formalización",Number(contrato)===1?"Requiere contrato":Number(contrato)===2?"Orden de compra":String(contrato)]);
  return facts;
}

function setTab(name){document.querySelectorAll(".tab").forEach(x=>x.classList.toggle("active",x.dataset.tab===name));document.querySelectorAll(".panel").forEach(x=>x.classList.toggle("active",x.id===name));history.replaceState(null,"","#"+name)}
document.querySelectorAll(".tab").forEach(b=>b.addEventListener("click",()=>setTab(b.dataset.tab)));

const camposGuardados = ["textoBases","riesgos","metodologia","experiencia","profesionales","plan","ofertaMonto","plazo","unidad","iva","pesoPrecio","pesoPlazo","pesoOtros","notasCompetencia","cartaPresentacion","cartaCompromiso","consultaForo"];
function limpiarFormulario(){
  camposGuardados.forEach(id=>{const el=$(id);if(el)el.value=el.tagName==='SELECT'?el.options[0].value:''});
  $('guardado').textContent='';$('hallazgosTexto').hidden=true;$('hallazgosTexto').textContent='';
}
function codigosGuardados(){
  const ids=[];
  for(const key of ['ng_v5_negocios','ng_v5_historial']){
    try{const list=JSON.parse(localStorage.getItem(key)||'[]');if(Array.isArray(list))list.forEach(x=>{if(x?.codigo)ids.push(x.codigo)})}catch{}
  }
  return ids;
}
function mostrarErrorConsulta(e,c){
  const noExiste=e.code==='NOT_FOUND';
  $('estado').innerHTML='<b class="bad">'+(noExiste?'No se encontró este ID.':'No se pudo completar la consulta.')+'</b><p>'+esc(e.message)+'</p>';
  const sugeridos=noExiste?NGConsulta.sugerencias(c,codigosGuardados()):[];
  if(sugeridos.length){
    const aviso=document.createElement('p');aviso.textContent='¿Buscabas uno de estos códigos?';$('estado').append(aviso);
    const row=document.createElement('div');row.className='query-actions';
    sugeridos.forEach(code=>{const button=document.createElement('button');button.className='primary';button.textContent='Consultar '+code;button.onclick=()=>{$('codigo').value=code;cargar()};row.append(button)});
    $('estado').append(row);
  }
  if(e.retryable!==false){
    const retry=document.createElement('button');retry.className='secondary';retry.textContent='Reintentar consulta';retry.onclick=cargar;$('estado').append(retry);
  }
  $('codigo').setAttribute('aria-invalid',noExiste?'true':'false');
}
async function cargar(){
  const btn=$('btnCargar');if(btn.disabled)return;
  const c=NGConsulta.codigo($('codigo').value);$('codigo').value=c;
  if(!NGConsulta.valido(c)){
    $('codigo').setAttribute('aria-invalid','true');
    $('estado').textContent='Escribe el ID completo. Ejemplo: 1782-5-LR26.';
    $('codigo').focus();return;
  }
  if(detalle)guardar(true);
  btn.disabled=true;btn.textContent='Consultando…';$('codigo').disabled=true;
  $('codigo').setAttribute('aria-invalid','false');
  codigoActual=c;detalle=null;analisisMP=null;analisisBases=null;
  limpiarFormulario();
  $('estado').innerHTML='<span class="loader"></span> Consultando Mercado Público…';$('app').hidden=true;
  try{
    const j=await NGConsulta.consultar({codigo:c});
    const t=firstTender(j.data);
    if(!t||NGConsulta.codigo(t.CodigoExterno||t.Codigo)!==c)throw new Error('La respuesta no corresponde al ID solicitado. Vuelve a intentar.');
    detalle={codigo:pick(t,["CodigoExterno","Codigo"])||c,nombre:pick(t,["Nombre"])||"",descripcion:pick(t,["Descripcion"])||"",estado:NGConsulta.estado(t),comprador:pick(t,["Comprador.NombreOrganismo","Comprador.NombreUnidad","NombreOrganismo"])||"",fechaPublicacion:pick(t,["Fechas.FechaPublicacion","FechaPublicacion"]),fechaCierre:pick(t,["Fechas.FechaCierre","FechaCierre"]),fechaApertura:pick(t,["Fechas.FechaActoAperturaTecnica","Fechas.FechaApertura","FechaApertura"]),fechaAdjudicacion:pick(t,["Fechas.FechaAdjudicacion","Adjudicacion.Fecha"]),montoEstimado:pick(t,["MontoEstimado","Monto","Presupuesto","ValorEstimado"]),moneda:pick(t,["Moneda"])||"CLP",tipo:pick(t,["Tipo","TipoConvocatoria"])||"",modalidad:pick(t,["Modalidad"])||"",etapas:pick(t,["Etapas"])||"",fechaVisita:pick(t,["Fechas.FechaVisitaTerreno","FechaVisitaTerreno"]),direccionVisita:pick(t,["DireccionVisita"])||"",duracionContrato:pick(t,["TiempoDuracionContrato"]),tipoDuracionContrato:pick(t,["TipoDuracionContrato"])||"",subcontratacion:pick(t,["SubContratacion"]),cantidadReclamos:pick(t,["CantidadReclamos"]),items:Array.isArray(t?.Items?.Listado)?t.Items.Listado:[],raw:t};
    analisisMP=Array.isArray(j.analisis)?j.analisis[0]:j.analisis||null;
    const url=new URL(location.href);url.searchParams.set('codigo',c);history.replaceState(null,'',url.pathname+url.search+url.hash);
    renderTodo();restaurar();
    $("estado").innerHTML='<span class="loader"></span><b>Licitación cargada.</b> Leyendo bases y anexos automáticamente…';$("app").hidden=false;
    const hash=location.hash.replace("#","");if(["resumen","bases","postulacion","analisis","competencia","documentos","resultado"].includes(hash))setTab(hash);
    await cargarBasesAutomatica(c);
    const bs=baseStats();
    if(!analisisBases?.ok){
      $("estado").innerHTML='<span class="bad"><b>Ficha cargada, pero la lectura de bases falló.</b></span><br>'+esc(analisisBases?.error||"Falta antecedente.");
    }else if(!bs.leidos.length){
      $("estado").innerHTML='<span class="bad"><b>Ficha cargada, sin análisis de bases.</b></span><br>No se obtuvo texto oficial legible; la app no dará por analizados requisitos que no pudo verificar.';
    }else{
      const adjuntos=bs.leidos.filter(d=>d.origen!=='ficha_publica').length;
      $('estado').innerHTML='<b>Ficha cargada:</b> '+esc(c)+' · '+esc(detalle.nombre||'')+'<br>'+esc(adjuntos?adjuntos+' archivo(s) adjunto(s) con texto leído. Revisa la cobertura en Bases.':'Se leyó la ficha pública; los archivos de bases y anexos no se pudieron leer.');
    }
  }catch(e){
    mostrarErrorConsulta(e,c);
  }finally{btn.disabled=false;btn.textContent='Analizar licitación';$('codigo').disabled=false}
}

async function cargarBasesAutomatica(c){
  const ctrl=new AbortController(),timer=setTimeout(()=>ctrl.abort(),65000);
  try{
    const r=await fetch('/api/bases?codigo='+encodeURIComponent(c),{signal:ctrl.signal,cache:'no-store'});
    let j;try{j=await r.json()}catch(e){if(e.name==='AbortError')throw e;throw new Error('Respuesta inválida del lector de bases.')}
    if(!r.ok||!j.ok)throw new Error(j.error||('Error HTTP '+r.status));
    if(j.codigo!==c)throw new Error('El lector devolvió un ID distinto al solicitado.');
    analisisBases=j;aplicarCriteriosBases();
  }catch(e){analisisBases={ok:false,error:e.name==='AbortError'?'La lectura automática tardó demasiado.':e.message}}
  finally{clearTimeout(timer)}
  renderChecklist();renderRequisitos();renderDocumentosBases();calcularCriterios();
  $('alertaPrincipal').innerHTML='<div class="note">Consulta finalizada. Revisa en Bases qué documentos pudieron leerse.</div>';
}
function aplicarCriteriosBases(){const c=analisisBases?.criterios;if(!c)return;if(c.precio!==null&&c.precio!==undefined&&!$("pesoPrecio").value)$("pesoPrecio").value=c.precio;if(c.plazo!==null&&c.plazo!==undefined&&!$("pesoPlazo").value)$("pesoPlazo").value=c.plazo;if(c.otros!==null&&c.otros!==undefined&&!$("pesoOtros").value)$("pesoOtros").value=c.otros}

function renderTodo(){renderResumen();renderChecklist();renderRequisitos();crearCartas();renderCompetencia();renderResultado();calcularOferta();calcularCriterios()}

function renderResumen(){
  const t=detalle;$("nombreLicitacion").textContent=(t.codigo||codigoActual)+" · "+(t.nombre||"Sin nombre");$("estadoLicitacion").textContent=t.estado||"No informado";
  $("datosClave").innerHTML=[["Comprador",t.comprador||"No informado"],["Presupuesto",fmonto(t.montoEstimado)],["Cierre",ffecha(t.fechaCierre)],["Tipo",t.tipo||"No informado"]].map(([a,b])=>'<div class="kpi"><small>'+esc(a)+'</small><b>'+esc(b)+'</b></div>').join("");
  $("descripcion").innerHTML="<b>Descripción</b><br>"+esc(t.descripcion||"No informada por la API.");
  $("fechasClave").innerHTML=[["Publicación",t.fechaPublicacion],["Cierre",t.fechaCierre],["Apertura",t.fechaApertura],["Adjudicación",t.fechaAdjudicacion]].map(([a,b])=>'<div class="time-item"><span class="time-dot"></span><div><b>'+esc(a)+'</b><small>'+esc(ffecha(b))+'</small></div></div>').join("");
  $("presupuesto").value=Number(t.montoEstimado)>0?Number(t.montoEstimado):"";$("totalItems").textContent=t.items.length?(t.items.length+" ítem"+(t.items.length===1?"":"s")):"";
  $("itemsLicitacion").innerHTML=t.items.length?t.items.map(i=>'<div class="itemrow"><b>'+esc(i.Correlativo??"")+' · '+esc(i.NombreProducto||i.Descripcion||"Ítem")+'</b><br><span class="muted">'+esc(i.Descripcion||"")+(i.Cantidad!=null?' · Cantidad: '+esc(i.Cantidad):"")+(i.UnidadMedida?' '+esc(i.UnidadMedida):"")+'</span></div>').join(""):'<span class="muted">Mercado Público no entregó ítems en esta consulta.</span>';
  const faltan=[];if(!t.montoEstimado)faltan.push("presupuesto");if(!t.fechaCierre)faltan.push("fecha de cierre");if(!t.descripcion)faltan.push("descripción");
  $("alertaPrincipal").innerHTML=faltan.length?'<div class="alert warning"><b>Información incompleta en la API:</b> falta '+esc(faltan.join(", "))+'. La app intentará completarla desde los documentos.</div>':'<div class="alert ok"><b>Ficha pública cargada.</b> Se están leyendo automáticamente las bases y anexos disponibles.</div>';
}

function renderRequisitos(){
  const s=saved(),st=s.statuses||{},facts=automaticFacts();
  const auto=facts.length?'<div class="auto-facts"><div class="auto-facts-title">Datos detectados automáticamente</div>'+facts.map(([a,b])=>'<div class="auto-fact"><span>'+esc(a)+'</span><b>'+esc(b)+'</b></div>').join("")+'</div>':"";
  $("requisitos").innerHTML=auto+requisitos.map(([id,t,d])=>{const v=effectiveState(id,st),desc=autoEvidence(id)||d;return '<div class="requirement"><div><b>'+esc(t)+'</b><small>'+esc(desc)+'</small></div><span class="status '+statusClass(v)+'">'+esc(statusLabel(v))+'</span></div>'}).join("");
  renderDocumentosBases();actualizarSemaforo();
}
function renderDocumentosBases(){
  const root=$("documentosBases");if(!root)return;
  if(analisisBases===null){root.innerHTML='<span class="loader"></span> Leyendo documentos oficiales de Mercado Público…';return}
  if(!analisisBases?.ok){root.innerHTML='<b>Lectura automática no disponible.</b><br><span class="muted small">'+esc(analisisBases?.error||"Falta antecedente.")+'</span>';return}
  const docs=analisisBases.documentosAnalizados||[],warnings=analisisBases.advertencias||[],leidos=docs.filter(d=>Number(d.caracteres)>0);
  let html='<div class="doc-summary"><b>'+esc(leidos.length)+' fuente(s) oficial(es) con texto analizado</b><span>'+esc(analisisBases.documentosEncontrados||0)+' archivo(s) adjunto(s) localizado(s) en Mercado Público</span></div>';
  if(!leidos.length)html+='<div class="alert warning" style="margin-top:10px"><b>No se pudo verificar el contenido de las bases.</b><br>La app mantiene los requisitos como pendientes y no los presenta como analizados.</div>';
  if(docs.length)html+='<div class="doc-list">'+docs.map(d=>'<div class="doc-row"><div><b>'+esc(d.nombre)+'</b><small>'+esc((d.origen==="ficha_publica"?"Ficha pública oficial · ":"")+(d.error||((d.caracteres||0).toLocaleString("es-CL")+" caracteres leídos")))+'</small></div><span class="status '+(d.error?"neutral":"ok")+'">'+(d.error?"No legible":"Leído")+'</span></div>').join("")+'</div>';
  if(warnings.length)html+='<div class="muted small" style="margin-top:8px">'+warnings.map(esc).join(" · ")+'</div>';root.innerHTML=html;
}

function renderChecklist(){
  const s=saved(),st=s.statuses||{};
  $("checklist").innerHTML=requisitos.map(([id,t,d])=>{const v=effectiveState(id,st),desc=autoEvidence(id)||d,opts=estadoOptions.map(([val,label])=>'<option value="'+val+'" '+(v===val?"selected":"")+'>'+label+'</option>').join("");return '<div class="checkrow"><div class="checktext"><strong>'+esc(t)+'</strong><small>'+esc(desc)+'</small></div><select id="st_'+id+'" class="state-select '+statusClass(v)+'">'+opts+'</select></div>'}).join("");
  requisitos.forEach(([id])=>{const el=$("st_"+id);el.addEventListener("change",()=>{el.className="state-select "+statusClass(el.value);guardar(true);renderRequisitos();actualizarPct();actualizarSemaforo()})});actualizarPct();
}
function getStatuses(){const s=saved(),out={...(s.statuses||{})};requisitos.forEach(([id])=>{if($("st_"+id))out[id]=$("st_"+id).value;else if(!out[id])out[id]=autoState(id)});return out}
function actualizarPct(){const st=getStatuses(),done=requisitos.filter(([id])=>["confirmado","noaplica"].includes(st[id])).length,pct=Math.round(done*100/requisitos.length);$("pct").textContent=pct+"%";$("bar").style.width=pct+"%"}
function actualizarSemaforo(){
  const st=getStatuses(),bloqueos=requisitos.filter(([id])=>st[id]==="bloqueo").length,pendientes=requisitos.filter(([id])=>["faltante","noencontrado"].includes(st[id])).length,analizando=requisitos.filter(([id])=>st[id]==="analizando").length,detectados=requisitos.filter(([id])=>st[id]==="detectado").length,confirmados=requisitos.filter(([id])=>["confirmado","noaplica"].includes(st[id])).length;
  let label=pendientes+" por confirmar",cls="warning";if(analizando){label="Analizando bases";cls="info"}else if(bloqueos){label=bloqueos+" bloqueo"+(bloqueos>1?"s":"");cls="danger"}else if(pendientes===0&&detectados===0){label="Revisión completa";cls="ok"}else if(pendientes===0&&detectados>0){label="Requisitos detectados";cls="info"}
  $("semaforoGeneral").textContent=label;$("semaforoGeneral").className="status "+cls;
  $("semaforoDetalle").innerHTML='<div class="metric-line"><span>Cumple / confirmado / no aplica</span><b>'+confirmados+'</b></div><div class="metric-line"><span>Requisitos detectados automáticamente</span><b>'+detectados+'</b></div><div class="metric-line"><span>Falta antecedente / no encontrado</span><b>'+pendientes+'</b></div><div class="metric-line"><span>No cumple / bloqueos</span><b>'+bloqueos+'</b></div>';
  const bs=baseStats(),hayLectura=bs.leidos.length>0;$("estadoBases").textContent=analizando?"Analizando":bloqueos?"Con bloqueos":analisisBases?.ok?(hayLectura?(bs.leidos.length+" fuente(s) analizada(s)"):"Sin texto legible"):"Faltan antecedentes";$("estadoBases").className="status "+(analizando?"info":bloqueos?"danger":analisisBases?.ok&&hayLectura?"ok":"warning");
}

function analizarTextoBases(){
  const txt=$("textoBases").value.trim();if(!txt){$("hallazgosTexto").hidden=false;$("hallazgosTexto").innerHTML="<b>No hay texto para analizar.</b>";return}
  const reglas=[["Visita / reunión",/(visita|terreno|reunión|reunion).{0,90}/ig],["Garantía",/(garantía|garantia|seriedad).{0,120}/ig],["Plazo",/(plazo|días corridos|dias corridos|días hábiles|dias habiles).{0,120}/ig],["Experiencia",/(experiencia|contratos similares|obras similares).{0,120}/ig],["Profesionales",/(profesional|residente|jefe de obra|prevencionista|constructor).{0,120}/ig],["Evaluación",/(criterio|ponderación|ponderacion|puntaje|precio).{0,140}/ig],["IVA",/(iva incluido|más iva|mas iva|neto).{0,80}/ig]],hits=[];
  for(const[name,re]of reglas){const m=txt.match(re);if(m?.length)hits.push('<div class="finding"><b>'+esc(name)+'</b><span>'+esc(m.slice(0,2).join(" … "))+'</span></div>')}
  $("hallazgosTexto").hidden=false;$("hallazgosTexto").innerHTML=hits.length?'<b>Coincidencias encontradas</b><p class="muted small">Este texto sirve como respaldo manual cuando un documento no pudo leerse automáticamente.</p>'+hits.join(""):'<b>No se detectaron coincidencias claras.</b>';
}

function calcularOferta(){if(!$("presupuesto"))return;const p=num($("presupuesto").value),o=num($("ofertaMonto").value);if(p>0&&o>0){const baja=((p-o)/p)*100,dif=p-o;$("baja").value=baja.toFixed(2)+"%";$("estadoOferta").textContent="Oferta ingresada";$("estadoOferta").className="status ok";$("analisisOferta").innerHTML='<div class="metric-line"><span>Diferencia contra presupuesto</span><b>'+esc(fmonto(Math.abs(dif)))+(dif>=0?" bajo presupuesto":" sobre presupuesto")+'</b></div><div class="metric-line"><span>Porcentaje de baja</span><b>'+esc(baja.toFixed(2))+'%</b></div><p class="muted small">Esto es matemática de la oferta, no una predicción de adjudicación.</p>'}else{$("baja").value="";$("estadoOferta").textContent="Sin oferta";$("estadoOferta").className="status neutral";$("analisisOferta").innerHTML='<span class="muted">Ingresa la oferta NG para calcular la baja.</span>'}}
function calcularCriterios(){const vals=[num($("pesoPrecio")?.value),num($("pesoPlazo")?.value),num($("pesoOtros")?.value)],total=vals.reduce((a,b)=>a+b,0);if(!total){$("sumaCriterios").textContent=analisisBases===null?"Leyendo criterios en bases…":"Pesos por confirmar.";return}$("sumaCriterios").innerHTML='<b>Total ponderaciones: '+total.toFixed(total%1?1:0)+'%</b>'+(Math.abs(total-100)>.01?' · <span class="bad">No suma 100%. Revisa las bases.</span>':' · <span class="good">Suma 100%.</span>')}

function crearCartas(){
  const nombre=detalle?.nombre||"",comprador=detalle?.comprador||"Organismo comprador";
  if(!$("cartaPresentacion").value)$("cartaPresentacion").value="Señores\n"+comprador+"\n\nRef.: Licitación "+codigoActual+" – "+nombre+"\n\nNG Ingeniería y Servicios Ltda., RUT 77.060.047-2, presenta su oferta para el proceso indicado, declarando que los antecedentes administrativos, técnicos y económicos acompañados corresponden a su propuesta y se sujetan a las bases, anexos y aclaraciones vigentes.\n\nSaluda atentamente,\nNG Ingeniería y Servicios Ltda.";
  if(!$("cartaCompromiso").value)$("cartaCompromiso").value="Señores\n"+comprador+"\n\nRef.: Licitación "+codigoActual+"\n\nNG Ingeniería y Servicios Ltda. manifiesta su compromiso de ejecutar las obligaciones que resulten adjudicadas conforme a la oferta presentada, las bases, anexos, aclaraciones y el contrato u orden de compra que corresponda.\n\nEste borrador debe ajustarse al anexo oficial si las bases lo exigen.";
}
function renderCompetencia(){if(!analisisMP){$("competidores").innerHTML='<div class="empty">No hay datos estructurados de competidores en esta consulta.</div>';return}const prov=analisisMP.proveedoresAdjudicados||[],n=analisisMP.numeroOferentes;let html='<div class="grid2"><div class="kpi"><small>Número de oferentes informado</small><b>'+esc(n??"No informado")+'</b></div><div class="kpi"><small>Adjudicatarios detectados</small><b>'+esc(prov.length)+'</b></div></div>';html+=prov.length?'<div class="competitor-list">'+prov.map(p=>'<div class="competitor"><div><b>'+esc(p.nombre||"Proveedor")+'</b><small>'+esc(p.rut||"RUT no informado")+'</small></div><span class="status ok">Adjudicatario detectado</span></div>').join("")+'</div>':'<div class="empty">Aún no hay adjudicatarios detectados.</div>';$("competidores").innerHTML=html}
function renderResultado(){if(!analisisMP){$("analisisResultado").innerHTML='<div class="empty">No hay resultado estructurado disponible.</div>';$("faltantes").innerHTML='<b>Sin conclusión:</b> faltan datos oficiales de resultado.';return}let title,cls;if(analisisMP.resultadoNG==="ADJUDICADA_A_NG"){title="Adjudicada a NG";cls="ok"}else if(analisisMP.resultadoNG==="NO_ADJUDICADA_A_NG"){title="No adjudicada a NG";cls="danger"}else if(analisisMP.resultadoNG==="ADJUDICADA_SIN_DETALLE"){title="Adjudicada: falta detalle del resultado NG";cls="warning"}else{title="Sin adjudicación oficial detectada";cls="warning"}$("estadoResultado").textContent=title;$("estadoResultado").className="status "+cls;const prov=(analisisMP.proveedoresAdjudicados||[]).map(x=>x.nombre).filter(Boolean).join(", ")||"No informado";$("analisisResultado").innerHTML='<div class="grid3"><div class="kpi"><small>Oferentes</small><b>'+esc(analisisMP.numeroOferentes??"No informado")+'</b></div><div class="kpi"><small>Adjudicatario(s)</small><b>'+esc(prov)+'</b></div><div class="kpi"><small>Monto adjudicado NG</small><b>'+esc(fmonto(analisisMP.montoAdjudicadoNG))+'</b></div></div>';$("faltantes").innerHTML=analisisMP.resultadoNG==="ADJUDICADA_SIN_DETALLE"?'<b>No se puede concluir si NG ganó o perdió:</b> falta el detalle completo de adjudicación.':analisisMP.resultadoNG==="PENDIENTE"?'<b>Seguimiento abierto:</b> no existe adjudicación oficial detectada.':'<b>Resultado detectado desde la información pública disponible.</b>'}

function guardar(silent=false){if(!codigoActual||!detalle)return;const data=saved();data.statuses=getStatuses();const ids=["textoBases","riesgos","metodologia","experiencia","profesionales","plan","ofertaMonto","plazo","unidad","iva","pesoPrecio","pesoPlazo","pesoOtros","notasCompetencia","cartaPresentacion","cartaCompromiso","consultaForo"];ids.forEach(id=>{if($(id))data[id]=$(id).value});try{localStorage.setItem(key(),JSON.stringify(data));if(!silent)$('guardado').textContent='Guardado en este dispositivo: '+now()}catch{$('guardado').textContent='No se pudo guardar en este dispositivo. Usa Copiar resumen para conservar tus datos.'}}
function restaurar(){const s=saved(),ids=["textoBases","riesgos","metodologia","experiencia","profesionales","plan","ofertaMonto","plazo","unidad","iva","pesoPrecio","pesoPlazo","pesoOtros","notasCompetencia","cartaPresentacion","cartaCompromiso","consultaForo"];ids.forEach(id=>{if($(id)&&s[id]!==undefined)$(id).value=s[id]});if(s.statuses)requisitos.forEach(([id])=>{const el=$("st_"+id);if(el){el.value=effectiveState(id,s.statuses);el.className="state-select "+statusClass(el.value)}});actualizarPct();renderRequisitos();actualizarSemaforo();calcularOferta();calcularCriterios()}
async function copiarResumen(){const st=getStatuses(),pendientes=requisitos.filter(([id])=>!["confirmado","noaplica"].includes(st[id])).map(([id,t])=>"• "+t+" — "+statusLabel(st[id]||"faltante")).join("\n"),text="NG Ingeniería y Servicios Ltda.\nLicitación: "+codigoActual+" – "+(detalle?.nombre||"")+"\n\nEstado de revisión:\n"+(pendientes||"Sin pendientes registrados")+"\n\nPresupuesto: "+fmonto(detalle?.montoEstimado)+"\nOferta NG: "+($("ofertaMonto").value||"Pendiente")+"\nBaja: "+($("baja").value||"Pendiente")+"\nPlazo: "+($("plazo").value||"Pendiente")+" "+$("unidad").value+"\nIVA: "+$("iva").value+"\n\nRiesgos / observaciones:\n"+($("riesgos").value||"Sin registrar");try{await navigator.clipboard.writeText(text);$("guardado").textContent="Resumen copiado."}catch{$("guardado").textContent="No se pudo copiar automáticamente."}}

$("btnCargar").addEventListener("click",cargar);$("codigo").addEventListener("keydown",e=>{if(e.key==="Enter")cargar()});$("btnGuardar").addEventListener("click",()=>guardar(false));$("btnCopiar").addEventListener("click",copiarResumen);$("btnAnalizarTexto").addEventListener("click",analizarTextoBases);
["textoBases","riesgos","metodologia","experiencia","profesionales","plan","ofertaMonto","plazo","unidad","iva","pesoPrecio","pesoPlazo","pesoOtros","notasCompetencia","cartaPresentacion","cartaCompromiso","consultaForo"].forEach(id=>{$(id).addEventListener("input",()=>{if(id==="ofertaMonto")calcularOferta();if(["pesoPrecio","pesoPlazo","pesoOtros"].includes(id))calcularCriterios();guardar(true)})});
const qs=new URLSearchParams(location.search),pre=qs.get("codigo");if(pre){$("codigo").value=pre.toUpperCase();cargar()}
