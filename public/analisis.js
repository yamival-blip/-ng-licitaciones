const $=id=>document.getElementById(id);
let detalle=null, analisisMP=null, codigoActual="";

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
  ["faltabases","Falta leer bases"],
  ["detectado","Detectado en MP"],
  ["confirmado","Cumple / confirmado"],
  ["bloqueo","No cumple / bloqueo"],
  ["noaplica","No aplica"]
];

function esc(v){return String(v??"").replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[m]))}
function pick(o,paths){for(const p of paths){let v=o;for(const k of p.split(".")){if(v==null)break;v=v[k]}if(v!==undefined&&v!==null&&v!=="")return v}return null}
function firstTender(data){const l=data?.Listado||data?.listado||data?.ListadoLicitacion||[];return Array.isArray(l)&&l.length?l[0]:(data?.CodigoExterno||data?.Nombre?data:null)}
function ffecha(v){if(!v)return "No informado";const d=new Date(v);return Number.isNaN(d.getTime())?String(v):d.toLocaleString("es-CL")}
function fmonto(v){const n=Number(v);return Number.isFinite(n)&&n>0?n.toLocaleString("es-CL",{style:"currency",currency:"CLP",maximumFractionDigits:0}):"No informado"}
function num(v){const n=Number(String(v??"").replace(/[^0-9.-]/g,""));return Number.isFinite(n)?n:0}
function key(){return "ng_postulacion_v4_"+codigoActual}
function saved(){try{return JSON.parse(localStorage.getItem(key())||"{}")}catch{return {}}}
function now(){return new Date().toLocaleString("es-CL")}
function statusClass(v){return v==="confirmado"?"ok":v==="detectado"?"info":v==="bloqueo"?"danger":v==="noaplica"?"neutral":"warning"}
function statusLabel(v){return estadoOptions.find(x=>x[0]===v)?.[1]||"Falta leer bases"}

function modalidadPago(v){
  const m={1:"Pago a 30 días",2:"Pago a 30, 60 y 90 días",3:"Pago al día",4:"Pago anual",5:"Pago bimensual",6:"Pago contra entrega conforme",7:"Pagos mensuales",8:"Pago por estado de avance",9:"Pago trimestral",10:"Pago a 60 días"};
  return m[Number(v)]||v||"No informada";
}
function unidadTiempo(v){
  const u={1:"horas",2:"días",3:"semanas",4:"meses",5:"años"};
  return u[Number(v)]||v||"";
}
function autoEvidence(id){
  const r=detalle?.raw||{};
  const fechaVisita=pick(r,["Fechas.FechaVisitaTerreno","FechaVisitaTerreno"]);
  const direccionVisita=pick(r,["DireccionVisita"]);
  const duracion=pick(r,["TiempoDuracionContrato"]);
  const tipoDuracion=pick(r,["TipoDuracionContrato"]);
  const unidadDuracion=pick(r,["UnidadTiempoDuracionContrato","UnidadTiempo"]);
  const inicioForo=pick(r,["Fechas.FechaInicio"]);
  const finForo=pick(r,["Fechas.FechaFinal"]);
  const pubRespuestas=pick(r,["Fechas.FechaPubRespuestas"]);
  if(id==="visita"&&(fechaVisita||direccionVisita)){
    return "Mercado Público informa"+(fechaVisita?": "+ffecha(fechaVisita):"")+(direccionVisita?" · "+direccionVisita:"");
  }
  if(id==="plazo"&&(duracion||tipoDuracion)){
    return "Duración informada: "+(duracion||"")+(tipoDuracion?" "+tipoDuracion:" "+unidadTiempo(unidadDuracion));
  }
  if(id==="foro"&&(inicioForo||finForo||pubRespuestas)){
    return "Foro informado por Mercado Público"+(inicioForo?": inicia "+ffecha(inicioForo):"")+(finForo?" · cierra "+ffecha(finForo):"")+(pubRespuestas?" · respuestas "+ffecha(pubRespuestas):"");
  }
  return "";
}
function autoState(id){
  return autoEvidence(id)?"detectado":"faltabases";
}
function effectiveState(id,st){
  return (st&&st[id])||autoState(id);
}
function automaticFacts(){
  const r=detalle?.raw||{};
  const facts=[];
  const visita=autoEvidence("visita"); if(visita)facts.push(["Visita / reunión",visita]);
  const plazo=autoEvidence("plazo"); if(plazo)facts.push(["Duración / plazo",plazo]);
  const foro=autoEvidence("foro"); if(foro)facts.push(["Foro",foro]);
  const modalidad=pick(r,["Modalidad"]); if(modalidad!==null&&modalidad!==undefined&&modalidad!=="")facts.push(["Modalidad de pago",modalidadPago(modalidad)]);
  const sub=pick(r,["SubContratacion"]); if(sub!==null&&sub!==undefined&&sub!=="")facts.push(["Subcontratación",Number(sub)===1?"Permitida":Number(sub)===0?"No permitida":String(sub)]);
  const reclamos=pick(r,["CantidadReclamos"]); if(reclamos!==null&&reclamos!==undefined&&reclamos!=="")facts.push(["Reclamos informados",String(reclamos)]);
  const contrato=pick(r,["Contrato"]); if(contrato!==null&&contrato!==undefined&&contrato!=="")facts.push(["Formalización",Number(contrato)===1?"Requiere contrato":Number(contrato)===2?"Orden de compra":String(contrato)]);
  return facts;
}

function setTab(name){
  document.querySelectorAll(".tab").forEach(x=>x.classList.toggle("active",x.dataset.tab===name));
  document.querySelectorAll(".panel").forEach(x=>x.classList.toggle("active",x.id===name));
  history.replaceState(null,"","#"+name);
}
document.querySelectorAll(".tab").forEach(b=>b.addEventListener("click",()=>setTab(b.dataset.tab)));

async function cargar(){
  const c=$("codigo").value.trim().toUpperCase();
  if(!c)return;
  codigoActual=c;
  $("estado").innerHTML='<span class="loader"></span> Consultando Mercado Público…';
  $("app").hidden=true;
  try{
    const ctrl=new AbortController();
    const timer=setTimeout(()=>ctrl.abort(),18000);
    const r=await fetch("/api/licitaciones?codigo="+encodeURIComponent(c),{signal:ctrl.signal,cache:"no-store"});
    clearTimeout(timer);
    let j;
    try{j=await r.json()}catch{throw new Error("El servidor no devolvió una respuesta válida.")}
    if(!r.ok||!j.ok)throw new Error(j.error||("Error HTTP "+r.status));
    const t=firstTender(j.data);
    if(!t)throw new Error("No se encontró información para este ID. Revisa que esté escrito exactamente como en Mercado Público.");

    detalle={
      codigo:pick(t,["CodigoExterno","Codigo"])||c,
      nombre:pick(t,["Nombre"])||"",
      descripcion:pick(t,["Descripcion"])||"",
      estado:pick(t,["Estado","EstadoCodigo"])||"",
      comprador:pick(t,["Comprador.NombreOrganismo","Comprador.NombreUnidad","NombreOrganismo"])||"",
      fechaPublicacion:pick(t,["Fechas.FechaPublicacion","FechaPublicacion"]),
      fechaCierre:pick(t,["Fechas.FechaCierre","FechaCierre"]),
      fechaApertura:pick(t,["Fechas.FechaApertura","FechaApertura"]),
      fechaAdjudicacion:pick(t,["Fechas.FechaAdjudicacion","Adjudicacion.Fecha"]),
      montoEstimado:pick(t,["MontoEstimado","Monto","Presupuesto","ValorEstimado"]),
      moneda:pick(t,["Moneda"])||"CLP",
      tipo:pick(t,["Tipo","TipoConvocatoria"])||"",
      modalidad:pick(t,["Modalidad"])||"",
      etapas:pick(t,["Etapas"])||"",
      fechaVisita:pick(t,["Fechas.FechaVisitaTerreno","FechaVisitaTerreno"]),
      direccionVisita:pick(t,["DireccionVisita"])||"",
      duracionContrato:pick(t,["TiempoDuracionContrato"]),
      tipoDuracionContrato:pick(t,["TipoDuracionContrato"])||"",
      subcontratacion:pick(t,["SubContratacion"]),
      cantidadReclamos:pick(t,["CantidadReclamos"]),
      items:Array.isArray(t?.Items?.Listado)?t.Items.Listado:[],
      raw:t
    };
    analisisMP=Array.isArray(j.analisis)?j.analisis[0]:j.analisis||null;
    renderTodo();
    restaurar();
    $("estado").innerHTML='<span class="good-dot"></span><b>Licitación cargada:</b> '+esc(c)+' · '+esc(detalle.nombre||"");
    $("app").hidden=false;
    const hash=location.hash.replace("#","");
    if(["resumen","bases","postulacion","analisis","competencia","documentos","resultado"].includes(hash))setTab(hash);
  }catch(e){
    const msg=e.name==="AbortError"?"La consulta tardó demasiado. Intenta nuevamente.":e.message;
    $("estado").innerHTML='<span class="bad"><b>No se pudo cargar la licitación.</b></span><br>'+esc(msg);
  }
}

function renderTodo(){
  renderResumen();
  renderChecklist();
  renderRequisitos();
  crearCartas();
  renderCompetencia();
  renderResultado();
  calcularOferta();
  calcularCriterios();
}

function renderResumen(){
  const t=detalle;
  $("nombreLicitacion").textContent=(t.codigo||codigoActual)+" · "+(t.nombre||"Sin nombre");
  $("estadoLicitacion").textContent=t.estado||"No informado";
  $("datosClave").innerHTML=[
    ["Comprador",t.comprador||"No informado"],
    ["Presupuesto",fmonto(t.montoEstimado)],
    ["Cierre",ffecha(t.fechaCierre)],
    ["Tipo",t.tipo||"No informado"]
  ].map(([a,b])=>'<div class="kpi"><small>'+esc(a)+'</small><b>'+esc(b)+'</b></div>').join("");
  $("descripcion").innerHTML="<b>Descripción</b><br>"+esc(t.descripcion||"No informada por la API.");

  const fechas=[
    ["Publicación",t.fechaPublicacion],
    ["Cierre",t.fechaCierre],
    ["Apertura",t.fechaApertura],
    ["Adjudicación",t.fechaAdjudicacion]
  ];
  $("fechasClave").innerHTML=fechas.map(([a,b])=>'<div class="time-item"><span class="time-dot"></span><div><b>'+esc(a)+'</b><small>'+esc(ffecha(b))+'</small></div></div>').join("");

  $("presupuesto").value=Number(t.montoEstimado)>0?Number(t.montoEstimado):"";
  $("totalItems").textContent=t.items.length?(t.items.length+" ítem"+(t.items.length===1?"":"s")):"";
  $("itemsLicitacion").innerHTML=t.items.length?t.items.map(i=>{
    const cant=i.Cantidad!=null?' · Cantidad: '+esc(i.Cantidad):"";
    const uni=i.UnidadMedida?' '+esc(i.UnidadMedida):"";
    return '<div class="itemrow"><b>'+esc(i.Correlativo??"")+' · '+esc(i.NombreProducto||i.Descripcion||"Ítem")+'</b><br><span class="muted">'+esc(i.Descripcion||"")+cant+uni+'</span></div>';
  }).join(""):'<span class="muted">Mercado Público no entregó ítems en esta consulta.</span>';

  const faltan=[];
  if(!t.montoEstimado)faltan.push("presupuesto");
  if(!t.fechaCierre)faltan.push("fecha de cierre");
  if(!t.descripcion)faltan.push("descripción");
  $("alertaPrincipal").innerHTML=faltan.length
    ? '<div class="alert warning"><b>Información incompleta en la API:</b> falta '+esc(faltan.join(", "))+'. Debe confirmarse en las bases o ficha oficial.</div>'
    : '<div class="alert ok"><b>Ficha pública cargada.</b> Ahora falta validar los requisitos de las bases antes de preparar la oferta.</div>';
}

function renderRequisitos(){
  const s=saved(), st=s.statuses||{};
  const facts=automaticFacts();
  const auto=facts.length?'<div class="auto-facts"><div class="auto-facts-title">Datos detectados automáticamente en Mercado Público</div>'+facts.map(([a,b])=>'<div class="auto-fact"><span>'+esc(a)+'</span><b>'+esc(b)+'</b></div>').join("")+'</div>':"";
  $("requisitos").innerHTML=auto+requisitos.map(([id,t,d])=>{
    const v=effectiveState(id,st);
    const evidencia=autoEvidence(id);
    const desc=evidencia||d;
    return '<div class="requirement"><div><b>'+esc(t)+'</b><small>'+esc(desc)+'</small></div><span class="status '+statusClass(v)+'">'+esc(statusLabel(v))+'</span></div>';
  }).join("");
  actualizarSemaforo();
}

function renderChecklist(){
  const s=saved(), st=s.statuses||{};
  $("checklist").innerHTML=requisitos.map(([id,t,d])=>{
    const v=effectiveState(id,st);
    const desc=autoEvidence(id)||d;
    const opts=estadoOptions.map(([val,label])=>'<option value="'+val+'" '+(v===val?"selected":"")+'>'+label+'</option>').join("");
    return '<div class="checkrow"><div class="checktext"><strong>'+esc(t)+'</strong><small>'+esc(desc)+'</small></div><select id="st_'+id+'" class="state-select '+statusClass(v)+'">'+opts+'</select></div>';
  }).join("");
  requisitos.forEach(([id])=>{
    const el=$("st_"+id);
    el.addEventListener("change",()=>{
      el.className="state-select "+statusClass(el.value);
      guardar(true);
      renderRequisitos();
      actualizarPct();
      actualizarSemaforo();
    });
  });
  actualizarPct();
}

function getStatuses(){
  const s=saved();
  const out={...(s.statuses||{})};
  requisitos.forEach(([id])=>{
    if($("st_"+id))out[id]=$("st_"+id).value;
    else if(!out[id])out[id]=autoState(id);
  });
  return out;
}

function actualizarPct(){
  const st=getStatuses();
  const done=requisitos.filter(([id])=>["confirmado","noaplica"].includes(st[id])).length;
  const pct=Math.round(done*100/requisitos.length);
  $("pct").textContent=pct+"%";
  $("bar").style.width=pct+"%";
}

function actualizarSemaforo(){
  const st=getStatuses();
  const bloqueos=requisitos.filter(([id])=>st[id]==="bloqueo").length;
  const faltan=requisitos.filter(([id])=>st[id]==="faltabases").length;
  const detectados=requisitos.filter(([id])=>st[id]==="detectado").length;
  const confirmados=requisitos.filter(([id])=>["confirmado","noaplica"].includes(st[id])).length;
  let label="Falta leer bases",cls="warning";
  if(bloqueos){label=bloqueos+" bloqueo"+(bloqueos>1?"s":"");cls="danger"}
  else if(faltan===0&&detectados===0){label="Revisión completa";cls="ok"}
  else if(detectados>0){label="Datos MP detectados";cls="info"}
  $("semaforoGeneral").textContent=label;
  $("semaforoGeneral").className="status "+cls;
  $("semaforoDetalle").innerHTML=
    '<div class="metric-line"><span>Cumple / confirmado / no aplica</span><b>'+confirmados+'</b></div>'+
    '<div class="metric-line"><span>Detectado automáticamente en MP</span><b>'+detectados+'</b></div>'+
    '<div class="metric-line"><span>Falta leer bases o anexos</span><b>'+faltan+'</b></div>'+
    '<div class="metric-line"><span>No cumple / bloqueos</span><b>'+bloqueos+'</b></div>';
  $("estadoBases").textContent=bloqueos?"Con bloqueos":faltan?"Falta leer bases":detectados?"Datos MP detectados":"Revisadas";
  $("estadoBases").className="status "+(bloqueos?"danger":faltan?"warning":detectados?"info":"ok");
}

function analizarTextoBases(){
  const txt=$("textoBases").value.trim();
  if(!txt){$("hallazgosTexto").hidden=false;$("hallazgosTexto").innerHTML="<b>No hay texto para analizar.</b>";return}
  const reglas=[
    ["Visita / reunión",/(visita|terreno|reunión|reunion).{0,90}/ig],
    ["Garantía",/(garantía|garantia|seriedad).{0,120}/ig],
    ["Plazo",/(plazo|días corridos|dias corridos|días hábiles|dias habiles).{0,120}/ig],
    ["Experiencia",/(experiencia|contratos similares|obras similares).{0,120}/ig],
    ["Profesionales",/(profesional|residente|jefe de obra|prevencionista|constructor).{0,120}/ig],
    ["Evaluación",/(criterio|ponderación|ponderacion|puntaje|precio).{0,140}/ig],
    ["IVA",/(iva incluido|más iva|mas iva|neto).{0,80}/ig]
  ];
  const hits=[];
  for(const [name,re] of reglas){
    const m=txt.match(re);
    if(m?.length)hits.push('<div class="finding"><b>'+esc(name)+'</b><span>'+esc(m.slice(0,2).join(" … "))+'</span></div>');
  }
  $("hallazgosTexto").hidden=false;
  $("hallazgosTexto").innerHTML=hits.length
    ? '<b>Coincidencias encontradas</b><p class="muted small">La app detectó contenido de bases. Marca Cumple o No cumple solo después de verificar que NG tenga el respaldo exigido.</p>'+hits.join("")
    : '<b>No se detectaron coincidencias claras.</b><p class="muted small">Revisa las bases y anexos oficiales.</p>';
  if(hits.length){renderRequisitos();renderChecklist();}
}

function calcularOferta(){
  if(!$("presupuesto"))return;
  const p=num($("presupuesto").value), o=num($("ofertaMonto").value);
  if(p>0&&o>0){
    const baja=((p-o)/p)*100;
    $("baja").value=baja.toFixed(2)+"%";
    $("estadoOferta").textContent="Oferta ingresada";
    $("estadoOferta").className="status ok";
    const dif=p-o;
    $("analisisOferta").innerHTML='<div class="metric-line"><span>Diferencia contra presupuesto</span><b>'+esc(fmonto(Math.abs(dif)))+(dif>=0?" bajo presupuesto":" sobre presupuesto")+'</b></div>'+
      '<div class="metric-line"><span>Porcentaje de baja</span><b>'+esc(baja.toFixed(2))+'%</b></div>'+
      '<p class="muted small">Esto es matemática de la oferta, no una predicción de adjudicación. La posición depende de las bases y de las ofertas válidas de los demás participantes.</p>';
  }else{
    $("baja").value="";
    $("estadoOferta").textContent="Sin oferta";
    $("estadoOferta").className="status neutral";
    $("analisisOferta").innerHTML='<span class="muted">Ingresa la oferta NG para calcular la baja respecto del presupuesto informado.</span>';
  }
}

function calcularCriterios(){
  const vals=[num($("pesoPrecio")?.value),num($("pesoPlazo")?.value),num($("pesoOtros")?.value)];
  const total=vals.reduce((a,b)=>a+b,0);
  if(!total){$("sumaCriterios").textContent="Pesos por confirmar en bases.";return}
  $("sumaCriterios").innerHTML='<b>Total ponderaciones: '+total.toFixed(total%1?1:0)+'%</b>'+(Math.abs(total-100)>.01?' · <span class="bad">No suma 100%. Revisa las bases.</span>':' · <span class="good">Suma 100%.</span>');
}

function crearCartas(){
  const nombre=detalle?.nombre||"";
  const comprador=detalle?.comprador||"Organismo comprador";
  if(!$("cartaPresentacion").value)$("cartaPresentacion").value=
`Señores
${comprador}

Ref.: Licitación ${codigoActual} – ${nombre}

NG Ingeniería y Servicios Ltda., RUT 77.060.047-2, presenta su oferta para el proceso indicado, declarando que los antecedentes administrativos, técnicos y económicos acompañados corresponden a su propuesta y se sujetan a las bases, anexos y aclaraciones vigentes.

Saluda atentamente,
NG Ingeniería y Servicios Ltda.`;
  if(!$("cartaCompromiso").value)$("cartaCompromiso").value=
`Señores
${comprador}

Ref.: Licitación ${codigoActual}

NG Ingeniería y Servicios Ltda. manifiesta su compromiso de ejecutar las obligaciones que resulten adjudicadas conforme a la oferta presentada, las bases, anexos, aclaraciones y el contrato u orden de compra que corresponda.

Este borrador debe ajustarse al anexo oficial si las bases lo exigen.`;
}

function renderCompetencia(){
  if(!analisisMP){
    $("competidores").innerHTML='<div class="empty">No hay datos estructurados de competidores en esta consulta.</div>';
    return;
  }
  const prov=analisisMP.proveedoresAdjudicados||[];
  const n=analisisMP.numeroOferentes;
  let html='<div class="grid2">';
  html+='<div class="kpi"><small>Número de oferentes informado</small><b>'+esc(n??"No informado")+'</b></div>';
  html+='<div class="kpi"><small>Adjudicatarios detectados</small><b>'+esc(prov.length)+'</b></div></div>';
  if(prov.length){
    html+='<div class="competitor-list">'+prov.map(p=>'<div class="competitor"><div><b>'+esc(p.nombre||"Proveedor")+'</b><small>'+esc(p.rut||"RUT no informado")+'</small></div><span class="status ok">Adjudicatario detectado</span></div>').join("")+'</div>';
  }else{
    html+='<div class="empty">Aún no hay adjudicatarios detectados. Para comparar antes del resultado se necesitan ofertas válidas, criterios y puntajes oficiales.</div>';
  }
  $("competidores").innerHTML=html;
}

function renderResultado(){
  if(!analisisMP){
    $("analisisResultado").innerHTML='<div class="empty">No hay resultado estructurado disponible.</div>';
    $("faltantes").innerHTML='<b>Sin conclusión:</b> faltan datos oficiales de resultado.';
    return;
  }
  let title,cls;
  if(analisisMP.resultadoNG==="ADJUDICADA_A_NG"){title="Adjudicada a NG";cls="ok"}
  else if(analisisMP.resultadoNG==="NO_ADJUDICADA_A_NG"){title="No adjudicada a NG";cls="danger"}
  else{title="Sin adjudicación oficial detectada";cls="warning"}
  $("estadoResultado").textContent=title;
  $("estadoResultado").className="status "+cls;
  const prov=(analisisMP.proveedoresAdjudicados||[]).map(x=>x.nombre).filter(Boolean).join(", ")||"No informado";
  $("analisisResultado").innerHTML=
    '<div class="grid3">'+
      '<div class="kpi"><small>Oferentes</small><b>'+esc(analisisMP.numeroOferentes??"No informado")+'</b></div>'+
      '<div class="kpi"><small>Adjudicatario(s)</small><b>'+esc(prov)+'</b></div>'+
      '<div class="kpi"><small>Monto adjudicado NG</small><b>'+esc(fmonto(analisisMP.montoAdjudicadoNG))+'</b></div>'+
    '</div>';
  $("faltantes").innerHTML=analisisMP.resultadoNG==="PENDIENTE"
    ? '<b>Seguimiento abierto:</b> no existe adjudicación oficial detectada. La app no declarará un ganador antes de contar con antecedentes suficientes.'
    : '<b>Resultado detectado desde la información pública disponible.</b> Para revisar puntajes, inadmisibilidades o fundamentos, contrasta con el acta y resolución oficial.';
}

function guardar(silent=false){
  if(!codigoActual)return;
  const data=saved();
  data.statuses=getStatuses();
  const ids=["textoBases","riesgos","metodologia","experiencia","profesionales","plan","ofertaMonto","plazo","unidad","iva","pesoPrecio","pesoPlazo","pesoOtros","notasCompetencia","cartaPresentacion","cartaCompromiso","consultaForo"];
  ids.forEach(id=>{if($(id))data[id]=$(id).value});
  localStorage.setItem(key(),JSON.stringify(data));
  if(!silent)$("guardado").textContent="Guardado en este dispositivo: "+now();
}

function restaurar(){
  const s=saved();
  const ids=["textoBases","riesgos","metodologia","experiencia","profesionales","plan","ofertaMonto","plazo","unidad","iva","pesoPrecio","pesoPlazo","pesoOtros","notasCompetencia","cartaPresentacion","cartaCompromiso","consultaForo"];
  ids.forEach(id=>{if($(id)&&s[id]!==undefined)$(id).value=s[id]});
  if(s.statuses){
    requisitos.forEach(([id])=>{
      const el=$("st_"+id);
      if(el){el.value=s.statuses[id]||"pendiente";el.className="state-select "+statusClass(el.value)}
    });
  }
  actualizarPct();
  renderRequisitos();
  actualizarSemaforo();
  calcularOferta();
  calcularCriterios();
}

async function copiarResumen(){
  const st=getStatuses();
  const pendientes=requisitos.filter(([id])=>!["confirmado","noaplica"].includes(st[id])).map(([id,t])=>"• "+t+" — "+statusLabel(st[id]||"pendiente")).join("\n");
  const text=`NG Ingeniería y Servicios Ltda.
Licitación: ${codigoActual} – ${detalle?.nombre||""}

Estado de revisión:
${pendientes||"Sin pendientes registrados"}

Presupuesto: ${fmonto(detalle?.montoEstimado)}
Oferta NG: ${$("ofertaMonto").value||"Pendiente"}
Baja: ${$("baja").value||"Pendiente"}
Plazo: ${$("plazo").value||"Pendiente"} ${$("unidad").value}
IVA: ${$("iva").value}

Riesgos / observaciones:
${$("riesgos").value||"Sin registrar"}`;
  try{await navigator.clipboard.writeText(text);$("guardado").textContent="Resumen copiado."}
  catch{$("guardado").textContent="No se pudo copiar automáticamente."}
}

$("btnCargar").addEventListener("click",cargar);
$("codigo").addEventListener("keydown",e=>{if(e.key==="Enter")cargar()});
$("btnGuardar").addEventListener("click",()=>guardar(false));
$("btnCopiar").addEventListener("click",copiarResumen);
$("btnAnalizarTexto").addEventListener("click",analizarTextoBases);

["textoBases","riesgos","metodologia","experiencia","profesionales","plan","ofertaMonto","plazo","unidad","iva","pesoPrecio","pesoPlazo","pesoOtros","notasCompetencia","cartaPresentacion","cartaCompromiso","consultaForo"].forEach(id=>{
  $(id).addEventListener("input",()=>{
    if(id==="ofertaMonto")calcularOferta();
    if(["pesoPrecio","pesoPlazo","pesoOtros"].includes(id))calcularCriterios();
    guardar(true);
  });
});

const qs=new URLSearchParams(location.search);
const pre=qs.get("codigo");
if(pre){$("codigo").value=pre.toUpperCase();cargar()}
