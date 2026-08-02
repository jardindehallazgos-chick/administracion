// ══════════════════════════════════════════════════════════════════════════════
// ARCANA · ADMINISTRACIÓN — lógica de la app (independiente, conectada al mismo
// proyecto de Firebase que Arcana Vintage, en un documento distinto)
// ══════════════════════════════════════════════════════════════════════════════

var FB_API_KEY = "AIzaSyCj5K7yECCbVFtX2wo_7xgO-pYizIGoiXo";
var FB_PROJECT = "arcana-vintage";
var ADMIN_BASE = "https://firestore.googleapis.com/v1/projects/"+FB_PROJECT+"/databases/(default)/documents/arcana/admin";
var DATOS_BASE = "https://firestore.googleapis.com/v1/projects/"+FB_PROJECT+"/databases/(default)/documents/arcana/datos";
var LOCK_PASS = "JDH1";

// ── Helpers compartidos con Arcana ──────────────────────────────────────────
function ge(id){ return document.getElementById(id); }
function uid(){ return Date.now().toString(36)+Math.random().toString(36).slice(2,5); }
function hoy(){ return new Date().toISOString().slice(0,10); }
function fmt(n){ return new Intl.NumberFormat("es-MX",{style:"currency",currency:"MXN",maximumFractionDigits:0}).format(n||0); }
function esc(s){ return (s===undefined||s===null?"":String(s)).replace(/[&<>"']/g,function(c){ return {"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]; }); }
function OM(tit,html){ ge("mtit").textContent=tit; ge("mbody").innerHTML=html; ge("mbg").classList.add("on"); }
function CM(){ ge("mbg").classList.remove("on"); ge("mbody").innerHTML=""; }
var MESES_ES=["Enero","Febrero","Marzo","Abril","Mayo","Junio","Julio","Agosto","Septiembre","Octubre","Noviembre","Diciembre"];
function nombreMes(ym){ var p=ym.split("-"); return MESES_ES[parseInt(p[1])-1]+" "+p[0]; }
function ultimoDiaDelMes(ym){
  var p=ym.split("-"); var d=new Date(parseInt(p[0]), parseInt(p[1]), 0);
  return ym+"-"+String(d.getDate()).padStart(2,"0");
}
function diasEntre(fechaStr){
  var hoyD=new Date(hoy()+"T00:00:00"), f=new Date(fechaStr+"T00:00:00");
  return Math.round((f-hoyD)/86400000);
}

function toFB(val){
  if(val === null || val === undefined) return {nullValue: null};
  if(typeof val === "boolean") return {booleanValue: val};
  if(typeof val === "number") return {doubleValue: val};
  if(typeof val === "string") return {stringValue: val};
  if(Array.isArray(val)) return {arrayValue:{values: val.map(function(v){ return toFB(v); })}};
  if(typeof val === "object"){
    var fields = {};
    for(var k in val) if(val.hasOwnProperty(k)) fields[k] = toFB(val[k]);
    return {mapValue:{fields: fields}};
  }
  return {stringValue: String(val)};
}
function fromFB(fbVal){
  if(!fbVal) return null;
  if("nullValue" in fbVal) return null;
  if("booleanValue" in fbVal) return fbVal.booleanValue;
  if("doubleValue" in fbVal) return fbVal.doubleValue;
  if("integerValue" in fbVal) return parseInt(fbVal.integerValue);
  if("stringValue" in fbVal) return fbVal.stringValue;
  if("arrayValue" in fbVal){ var arr=fbVal.arrayValue.values||[]; return arr.map(function(v){ return fromFB(v); }); }
  if("mapValue" in fbVal){ var obj={}, fields=fbVal.mapValue.fields||{}; for(var k in fields) obj[k]=fromFB(fields[k]); return obj; }
  return null;
}

// ── Estado ───────────────────────────────────────────────────────────────────
var ADB = {
  fijosMensuales: [],
  fijosAnuales: [],
  creditos: [],
  variables: [],
  pagosMensuales: [],
  pagosAnuales: [],
  proveedores: {},
  mesesProcesados: [],
  fiscal: [],
  mercancia: [],
  sueldos: [],
  pagosSueldos: [],
  config: {lockPass: "JDH1", logo: ""}
};
var DATOS = { provs: [], archivo: [], ventas: [], apartados: [], saldos: [] };
var curTab = "dash";
var saveTimeout = null;

function getLockPass(){ return (ADB.config&&ADB.config.lockPass)||LOCK_PASS; }
function setLockPass(v){ ADB.config=ADB.config||{}; ADB.config.lockPass=v; saveAdmin(); }

// ── Login (pantalla de bloqueo) ─────────────────────────────────────────────
function tryLogin(){
  var inp=ge("lockpass");
  if(inp.value===getLockPass()){
    ge("lock").style.display="none";
    ge("app").style.display="block";
  } else {
    ge("lockerr").style.display="block";
    inp.value=""; inp.focus();
  }
}
(function(){
  var inp=document.getElementById("lockpass");
  if(inp) inp.addEventListener("keydown", function(e){ if(e.key==="Enter") tryLogin(); });
})();
function cerrarSesion(){ location.reload(); }

function cambiarPassApp(){
  var eyeless='style="position:relative"';
  var h='<div class="fld"><label class="lbl">Contraseña actual</label><input class="inp" type="password" id="cpapp-actual"/></div>';
  h+='<div class="fld"><label class="lbl">Nueva contraseña (mínimo 4 caracteres)</label><input class="inp" type="password" id="cpapp-nueva"/></div>';
  h+='<div class="fld"><label class="lbl">Confirmar nueva contraseña</label><input class="inp" type="password" id="cpapp-conf"/></div>';
  h+='<div id="cpapp-error" style="color:#f87171;font-size:12px;min-height:16px;margin-bottom:6px"></div>';
  h+='<div class="sm mut" style="margin-bottom:8px">Esta es la contraseña que se pide cada vez que se abre Arcana Administración.</div>';
  h+='<div style="display:flex;justify-content:flex-end;gap:8px"><button class="btn" onclick="CM()">Cancelar</button><button class="btna" onclick="guardarPassApp()">Guardar</button></div>';
  OM("Cambiar contraseña", h);
}
function guardarPassApp(){
  var actual=(ge("cpapp-actual")||{}).value||"";
  var nueva=(ge("cpapp-nueva")||{}).value||"";
  var conf=(ge("cpapp-conf")||{}).value||"";
  var err=ge("cpapp-error");
  if(actual!==getLockPass()){ if(err) err.textContent="La contraseña actual es incorrecta."; return; }
  if(nueva.length<4){ if(err) err.textContent="La nueva contraseña debe tener al menos 4 caracteres."; return; }
  if(nueva!==conf){ if(err) err.textContent="Las contraseñas no coinciden."; return; }
  setLockPass(nueva); CM(); alert("Contraseña actualizada correctamente.");
}

// ── LOGOTIPO (misma logica que Arcana Vintage: PNG, 512x512 recomendado, 200KB max, compresion automatica) ──
function applyConfig(){
  var logo=(ADB.config&&ADB.config.logo)||"";
  var fav=ge("favicon-link");
  var himg=ge("logo-img");
  if(logo){
    if(fav) fav.href=logo;
    if(himg){ himg.src=logo; himg.style.display="inline-block"; }
  } else {
    if(himg) himg.style.display="none";
  }
}
function aLogo(){
  var actual=(ADB.config&&ADB.config.logo)||"";
  var h='<div class="sm mut" style="margin-bottom:12px;line-height:1.6">Requisitos: solo formato PNG &middot; medida recomendada 512x512px cuadrada &middot; peso maximo 200 KB. El sistema comprime automaticamente la imagen al subirla.</div>';
  if(actual) h+='<div style="text-align:center;margin-bottom:12px"><img src="'+actual+'" style="width:80px;height:80px;border-radius:10px;object-fit:cover;border:1px solid #2a2620"/></div>';
  h+='<div class="fld"><input class="inp" type="file" id="logo-file" accept="image/png"/></div>';
  h+='<div id="logo-err" style="color:#f87171;font-size:12px;min-height:16px;margin-bottom:6px"></div>';
  h+='<div style="display:flex;justify-content:space-between;padding-top:7px">';
  h+='<button class="btnr" onclick="quitarLogo()">Quitar logotipo</button>';
  h+='<div style="display:flex;gap:8px"><button class="btn" onclick="CM()">Cancelar</button><button class="btna" onclick="guardarLogo()">Subir</button></div></div>';
  OM("Logotipo", h);
}
function quitarLogo(){
  if(!confirm("Quitar el logotipo actual?")) return;
  ADB.config=ADB.config||{}; ADB.config.logo=""; saveAdmin(); applyConfig(); CM();
}
function guardarLogo(){
  var f=ge("logo-file"); var err=ge("logo-err");
  if(!f||!f.files||!f.files[0]){ if(err) err.textContent="Selecciona un archivo PNG."; return; }
  var file=f.files[0];
  if(file.type!=="image/png"){ if(err) err.textContent="Solo se aceptan archivos PNG."; return; }
  if(file.size>200*1024){ if(err) err.textContent="El archivo pesa mas de 200 KB. Usa una imagen mas ligera."; return; }
  var reader=new FileReader();
  reader.onload=function(e){
    var img=new Image();
    img.onload=function(){
      var size=256;
      var canvas=document.createElement("canvas");
      canvas.width=size; canvas.height=size;
      var ctx=canvas.getContext("2d");
      var side=Math.min(img.width,img.height);
      var sx=(img.width-side)/2, sy=(img.height-side)/2;
      ctx.drawImage(img,sx,sy,side,side,0,0,size,size);
      var dataUrl=canvas.toDataURL("image/png");
      ADB.config=ADB.config||{}; ADB.config.logo=dataUrl; saveAdmin(); applyConfig(); CM();
      alert("Logotipo actualizado.");
    };
    img.onerror=function(){ if(err) err.textContent="No se pudo leer la imagen."; };
    img.src=e.target.result;
  };
  reader.onerror=function(){ if(err) err.textContent="No se pudo leer el archivo."; };
  reader.readAsDataURL(file);
}

function boot(){
  loadAdmin();
  setInterval(loadDatos, 30000); // proveedores/archivo de Arcana, cada 30s
  loadDatos();
}

// CAUSA RAIZ DEL BUG DE JULIO 2026: loadAdmin() y loadDatos() corren en paralelo.
// Si loadDatos() llegaba primero, procesarArchivo() sumaba la deuda sobre un ADB
// que aun no terminaba de cargar; enseguida loadAdmin() reemplazaba ADB completo y
// borraba esos saldos, pero el guardado diferido ya escribia el mes como procesado.
// Resultado: mes marcado, proveedores vacios, sin reintento posible.
// Esta bandera garantiza que no se procese nada hasta tener los datos reales cargados.
var adminCargado = false;

// ── Sync: documento propio (arcana/admin) ───────────────────────────────────
function fbStatus(txt,color){ var el=ge("sync-ind"); if(el){ el.textContent=txt; el.style.color=color; } }

function loadAdmin(){
  try{
    var c=JSON.parse(localStorage.getItem("admdb")||"{}");
    if(c&&c.fijosMensuales) ADB=c;
  }catch(e){}
  if(!ADB.config) ADB.config={lockPass:LOCK_PASS,logo:""};
  fbStatus("Conectando...","#6b6358");
  fetch(ADMIN_BASE+"?key="+FB_API_KEY)
    .then(function(r){ return r.json(); })
    .then(function(doc){
      if(doc.error){
        if(doc.error.code===404||doc.error.status==="NOT_FOUND"){ fbStatus("Primera vez - creando...","#c9a96e"); saveAdmin(true); }
        else fbStatus("Sin conexion - modo local","#f59e0b");
        renderAll();
        return;
      }
      if(doc.fields){
        var d=fromFB({mapValue:{fields:doc.fields}});
        if(d&&d.fijosMensuales!==undefined){
          // Mismo protocolo que restaurarAdmin(): partir de la forma por defecto y
          // copiar encima TODO lo que venga de Firestore, campo por campo, para que un
          // modulo nuevo agregado en otro dispositivo tambien se lea aqui sin cambios.
          var merged={}; for(var k in ADB_DEFAULT_SHAPE) merged[k]=ADB_DEFAULT_SHAPE[k];
          for(var k in d) merged[k]=d[k];
          ADB=merged;
          try{ localStorage.setItem("admdb", JSON.stringify(ADB)); }catch(e){}
        }
        fbStatus("Conectado","#4ade80");
      } else { fbStatus("Primera vez - creando...","#c9a96e"); saveAdmin(true); }
      adminCargado=true;
      reconciliarMesesProcesados(); // repara meses marcados sin deuda aplicada
      procesarArchivo();            // ahora si, con ADB real ya cargado
      renderAll();
    })
    .catch(function(){ fbStatus("Sin conexion - modo local","#f59e0b"); renderAll(); });
}

function saveAdmin(silent){
  try{ localStorage.setItem("admdb", JSON.stringify(ADB)); }catch(e){}
  if(saveTimeout) clearTimeout(saveTimeout);
  saveTimeout=setTimeout(function(){
    if(!silent) fbStatus("Guardando...","#c9a96e");
    // PROTOCOLO: se recorre ADB dinamicamente (no una lista fija de campos), asi que
    // cualquier modulo o propiedad nueva que se agregue a ADB en el futuro se sincroniza
    // a Firestore automaticamente sin tener que tocar esta funcion.
    var fields={};
    for(var k in ADB) if(ADB.hasOwnProperty(k)) fields[k]=toFB(ADB[k]);
    fields.updated=toFB(new Date().toISOString());
    var body=JSON.stringify({fields:fields});
    fetch(ADMIN_BASE+"?key="+FB_API_KEY,{method:"PATCH",headers:{"Content-Type":"application/json"},body:body})
      .then(function(r){ return r.json(); })
      .then(function(d){ if(d.error) fbStatus("Sin conexion (local)","#f59e0b"); else fbStatus("Sincronizado","#4ade80"); })
      .catch(function(){ fbStatus("Sin conexion (local)","#f59e0b"); });
  }, 900);
}

// ── Sync: documento de Arcana (solo lectura, para proveedores y archivo) ────
function loadDatos(){
  fetch(DATOS_BASE+"?key="+FB_API_KEY)
    .then(function(r){ return r.json(); })
    .then(function(doc){
      if(doc.error||!doc.fields) return;
      var d=fromFB({mapValue:{fields:doc.fields}});
      if(d&&d.provs){
        DATOS={provs:d.provs||[], archivo:d.archivo||[], ventas:d.ventas||[], apartados:d.apartados||[], saldos:d.saldos||[]};
        procesarArchivo();
        renderAll();
      }
    })
    .catch(function(){});
}

// Aplica a los saldos de proveedores los meses de Arcana ya cerrados que
// todavia no se han incorporado a la cuenta corriente.
function procesarArchivo(){
  // GUARDA 0: no procesar hasta que los datos de Administración esten realmente
  // cargados. Sin esto, los saldos calculados se pierden al llegar la respuesta
  // de loadAdmin() y el mes queda marcado sin deuda (bug de julio 2026).
  if(!adminCargado) return;
  // GUARDA 1: no procesar si la lista de proveedores aun no esta cargada. Sin esto,
  // getProvTipo() devolveria "" para todos y ningun proveedor se reconoceria como
  // consignacion, saltandose sus deudas.
  if(!DATOS.provs || !DATOS.provs.length) return;
  var cambiado=false;
  for(var i=0;i<DATOS.archivo.length;i++){
    var a=DATOS.archivo[i];
    if(!a.mes || ADB.mesesProcesados.indexOf(a.mes)!==-1) continue;
    var porProv=a.porProveedor||{};
    // GUARDA 2: si el mes trae deuda por proveedor pero NINGUNO de esos ids existe
    // todavia en la lista de proveedores, la informacion esta incompleta: no se marca
    // como procesado y se reintenta en la siguiente sincronizacion.
    var idsEnMes=Object.keys(porProv);
    if(idsEnMes.length){
      var algunoConocido=false;
      for(var k=0;k<idsEnMes.length;k++){ if(getProvTipo(idsEnMes[k])){ algunoConocido=true; break; } }
      if(!algunoConocido) continue;
    }
    var aplicados=0;
    for(var pid in porProv){
      if(!porProv.hasOwnProperty(pid)) continue;
      if(getProvTipo(pid)!=="consignacion") continue;
      if(!ADB.proveedores[pid]) ADB.proveedores[pid]={saldo:0,pagos:[]};
      var monto=porProv[pid]||0;
      ADB.proveedores[pid].saldo=(ADB.proveedores[pid].saldo||0)+monto;
      // Marca visible en la bitacora: deja constancia de que este mes genero deuda,
      // y sirve de comprobante de que la deuda SI se aplico (ver reconciliar).
      ADB.proveedores[pid].pagos=ADB.proveedores[pid].pagos||[];
      ADB.proveedores[pid].pagos.push({id:uid(), fecha:ultimoDiaDelMes(a.mes), monto:monto, metodo:"deuda generada · "+nombreMes(a.mes), esCierre:true, mes:a.mes, fondosExternos:true});
      aplicados++;
    }
    // GUARDA 3: solo marcar el mes como procesado si de verdad se aplico deuda a
    // alguien, o si el mes legitimamente no tenia deuda de consignacion que aplicar.
    var teniaConsignacion=false;
    for(var k=0;k<idsEnMes.length;k++){ if(getProvTipo(idsEnMes[k])==="consignacion"){ teniaConsignacion=true; break; } }
    if(teniaConsignacion && !aplicados) continue; // algo fallo: reintentar despues
    ADB.mesesProcesados.push(a.mes);
    cambiado=true;
  }
  if(cambiado) saveAdmin();
}

// Repara meses que quedaron marcados como procesados sin que su deuda se aplicara
// (estado huerfano). Solo actua cuando es inequivocamente seguro: no existe ningun
// registro de cierre para ese mes Y no hay saldos ni movimientos de proveedores que
// pudieran duplicarse. Al desmarcarlo, procesarArchivo() lo vuelve a tomar bien.
function reconciliarMesesProcesados(){
  if(!ADB.mesesProcesados || !ADB.mesesProcesados.length) return;
  var hayMovimientos=false;
  for(var pid in ADB.proveedores){
    if(!ADB.proveedores.hasOwnProperty(pid)) continue;
    var p=ADB.proveedores[pid];
    if((p.saldo||0)!==0 || (p.pagos&&p.pagos.length)) { hayMovimientos=true; break; }
  }
  if(hayMovimientos) return; // hay datos: no tocar nada, se corrige a mano si hace falta
  var recuperados=ADB.mesesProcesados.slice();
  ADB.mesesProcesados=[];
  saveAdmin();
  console.log("Arcana Admin: se desmarcaron meses sin deuda aplicada para reprocesarlos:", recuperados);
}

function getProvName(id){ for(var i=0;i<DATOS.provs.length;i++) if(DATOS.provs[i].id===id) return DATOS.provs[i].nombre; return "Proveedor"; }
function getProvTipo(id){ for(var i=0;i<DATOS.provs.length;i++) if(DATOS.provs[i].id===id) return DATOS.provs[i].tipo; return ""; }

// Registra automaticamente como pagados los gastos domiciliados cuya fecha de cobro ya paso
function procesarDomiciliados(){
  var ym=mesActual(), cambiado=false;
  var hoyD=hoy();
  for(var i=0;i<ADB.fijosMensuales.length;i++){
    var f=ADB.fijosMensuales[i]; if(!f.domiciliado) continue;
    var venc=ym+"-"+String(f.dia||1).padStart(2,"0");
    if(venc>hoyD) continue; // aun no llega la fecha de cobro
    var yaPagado=ADB.pagosMensuales.some(function(p){return p.fijoId===f.id&&p.mes===ym;});
    if(yaPagado) continue;
    ADB.pagosMensuales.push({id:uid(), fijoId:f.id, mes:ym, fecha:venc, monto:f.monto||0, bono:0, fondosExternos:false, automatico:true});
    cambiado=true;
  }
  var anioActual=parseInt(ym.slice(0,4));
  for(var i=0;i<ADB.fijosAnuales.length;i++){
    var f=ADB.fijosAnuales[i]; if(!f.domiciliado) continue;
    var md=(f.fechaContratacion||"01-01").slice(4);
    var venc=anioActual+"-"+md;
    if(venc>hoyD) continue;
    var yaPagado=ADB.pagosAnuales.some(function(p){return p.fijoId===f.id&&p.anio===anioActual;});
    if(yaPagado) continue;
    ADB.pagosAnuales.push({id:uid(), fijoId:f.id, anio:anioActual, fecha:venc, monto:f.monto||0, fondosExternos:false, automatico:true});
    cambiado=true;
  }
  // Sueldos domiciliados: no aplica por defecto (los sueldos no tienen domiciliacion), se omite.
  if(cambiado) saveAdmin();
}

// ── Navegación ───────────────────────────────────────────────────────────────
function setTab(name){
  curTab=name;
  var tabs=document.querySelectorAll(".tab"); for(var i=0;i<tabs.length;i++) tabs[i].classList.remove("on");
  var t=ge("tab-"+name); if(t) t.classList.add("on");
  var nbs=document.querySelectorAll(".nb,.mnb"); for(var i=0;i<nbs.length;i++) nbs[i].classList.remove("on");
  var btns=document.querySelectorAll('[data-tab="'+name+'"]'); for(var i=0;i<btns.length;i++) btns[i].classList.add("on");
  renderAll();
}
function renderAll(){
  procesarDomiciliados();
  limpiarHuerfanos();
  applyConfig();
  if(curTab==="dash") RDash();
  else if(curTab==="fijos") RFijos();
  else if(curTab==="variables") RVariables();
  else if(curTab==="mercancia") RMercancia();
  else if(curTab==="sueldos") RSueldos();
  else if(curTab==="provs") RProvs();
  else if(curTab==="fiscal") RFiscal();
  else if(curTab==="hist") RHist();
}

// Elimina registros de pago que quedaron huerfanos porque su gasto fijo/trabajador
// ya fue borrado. Sin esto, esos pagos seguirian sumando a los totales sin
// aparecer en ningun lado de la interfaz.
function limpiarHuerfanos(){
  var idsMensuales={}; for(var i=0;i<ADB.fijosMensuales.length;i++) idsMensuales[ADB.fijosMensuales[i].id]=true;
  var idsAnuales={}; for(var i=0;i<ADB.fijosAnuales.length;i++) idsAnuales[ADB.fijosAnuales[i].id]=true;
  var idsSueldos={}; for(var i=0;i<ADB.sueldos.length;i++) idsSueldos[ADB.sueldos[i].id]=true;
  var antesM=ADB.pagosMensuales.length, antesA=ADB.pagosAnuales.length, antesS=ADB.pagosSueldos.length;
  ADB.pagosMensuales=ADB.pagosMensuales.filter(function(p){return idsMensuales[p.fijoId];});
  ADB.pagosAnuales=ADB.pagosAnuales.filter(function(p){return idsAnuales[p.fijoId];});
  ADB.pagosSueldos=ADB.pagosSueldos.filter(function(p){return idsSueldos[p.sueldoId];});
  if(ADB.pagosMensuales.length!==antesM||ADB.pagosAnuales.length!==antesA||ADB.pagosSueldos.length!==antesS) saveAdmin();
}

// ── Cálculos compartidos ─────────────────────────────────────────────────────
function mesActual(){ return hoy().slice(0,7); }

// Ingresos del mes, replicando exactamente la logica de cerrarMes en Arcana Vintage:
// - Mes ya cerrado: se usa el "ingreso" ya calculado y archivado (no el "total" bruto,
//   que incluye cosas que no son ingreso real como el valor de piezas apartadas sin liquidar).
// - Mes activo (aun no cerrado): se recalcula en vivo con la misma regla que usaria el cierre:
//   ventas normales (sin apartados, sin canceladas) + abonos de apartados por su propia fecha
//   (excepto apartados cancelados) + saldos a favor que ya expiraron sin usarse este mes.
function ingresosMes(ym){
  var arch=DATOS.archivo.find(function(a){return a.mes===ym;});
  if(arch) return arch.ingreso!==undefined ? arch.ingreso : (arch.total||0);
  var ingr=0;
  for(var i=0;i<DATOS.ventas.length;i++){
    var v=DATOS.ventas[i];
    if((v.fecha||"").slice(0,7)!==ym) continue;
    if(v.cancelacion) continue;
    if(v.esApartado) continue; // su ingreso viene de los abonos, no del total de la pieza
    ingr+=v.total||0;
  }
  for(var i=0;i<DATOS.apartados.length;i++){
    var apa=DATOS.apartados[i];
    if(apa.estado==="cancelado"||!apa.abonos) continue;
    for(var j=0;j<apa.abonos.length;j++){
      var ab=apa.abonos[j];
      if((ab.fecha||"").slice(0,7)===ym) ingr+=ab.monto||0;
    }
  }
  for(var i=0;i<DATOS.saldos.length;i++){
    var sa=DATOS.saldos[i];
    if(sa.usado) continue;
    if(!sa.fechaVencimiento) continue;
    if((sa.fechaVencimiento||"").slice(0,7)!==ym) continue;
    if(sa.fechaVencimiento>=hoy()) continue; // aun no expira
    ingr+=sa.monto||0;
  }
  return ingr;
}
function gastosFijosMesPagado(ym){
  var tot=0;
  for(var i=0;i<ADB.pagosMensuales.length;i++){ var p=ADB.pagosMensuales[i]; if(p.mes===ym&&!p.fondosExternos) tot+=(p.monto||0)+(p.bono||0); }
  for(var i=0;i<ADB.pagosAnuales.length;i++){ var p=ADB.pagosAnuales[i]; if((p.fecha||"").slice(0,7)===ym&&!p.fondosExternos) tot+=p.monto||0; }
  for(var i=0;i<ADB.creditos.length;i++){ var c=ADB.creditos[i]; for(var j=0;j<(c.pagos||[]).length;j++){ if((c.pagos[j].fecha||"").slice(0,7)===ym&&!c.pagos[j].fondosExternos) tot+=c.pagos[j].monto||0; } }
  return tot;
}
function gastosVariablesMes(ym){
  var tot=0; for(var i=0;i<ADB.variables.length;i++){ var v=ADB.variables[i]; if((v.fecha||"").slice(0,7)===ym&&!v.fondosExternos) tot+=v.monto||0; }
  return tot;
}
function pagosProveedoresMes(ym){
  var tot=0;
  for(var pid in ADB.proveedores){
    if(!ADB.proveedores.hasOwnProperty(pid)) continue;
    var pagos=ADB.proveedores[pid].pagos||[];
    for(var i=0;i<pagos.length;i++){ var pg=pagos[i];
      if(pg.esCierre||pg.esAjuste||pg.fondosExternos) continue; // no son dinero pagado este mes
      if((pg.fecha||"").slice(0,7)===ym) tot+=pg.monto||0; }
  }
  return tot;
}
function gastosSueldosMes(ym){
  var tot=0;
  for(var i=0;i<ADB.pagosSueldos.length;i++){
    var p=ADB.pagosSueldos[i];
    if(p.fondosExternos) continue;
    var ymKey=p.periodo?p.periodo.slice(0,7):(p.fecha||"").slice(0,7);
    if(ymKey===ym) tot+=(p.monto||0)+(p.bono||0);
  }
  return tot;
}
function gastosMercanciaTotal(){
  var tot=0; for(var i=0;i<ADB.mercancia.length;i++) tot+=ADB.mercancia[i].monto||0;
  return tot;
}
function gastosMercanciaMes(ym){
  var tot=0; for(var i=0;i<ADB.mercancia.length;i++){ var m=ADB.mercancia[i]; if((m.fecha||"").slice(0,7)===ym) tot+=m.monto||0; }
  return tot;
}
function saldoTotalProveedores(){
  var tot=0; for(var pid in ADB.proveedores) if(ADB.proveedores.hasOwnProperty(pid)) tot+=ADB.proveedores[pid].saldo||0;
  return tot;
}
function impuestoMes(ym){
  for(var i=0;i<ADB.fiscal.length;i++) if(ADB.fiscal[i].periodo===ym) return ADB.fiscal[i];
  return null;
}

// Replica la formula fiscal de Arcana para calcular IVA+ISR teoricos por venta
function fiscalCalc(p,mpago){
  mpago=mpago||"tarjeta";
  if(mpago==="efectivo") return {iva:0,isr:0};
  if(mpago==="transferencia"){ var base=p/1.16,iva=p-base,isr=p*0.015; return {iva:iva,isr:isr}; }
  var base=p/1.16,iva=p-base,isr=p*0.015;
  return {iva:iva,isr:isr};
}
// Impuesto teorico (IVA+ISR) de un periodo, replicando la misma logica que ingresosMes:
// para el mes activo, se calcula sobre ventas normales + abonos de apartados (no sobre
// el total de la pieza apartada). Los saldos a favor retenidos NO llevan IVA/ISR,
// igual que en el cierre real de Arcana Vintage.
function impuestoTeoricoMes(ym){
  var arch=DATOS.archivo.find(function(a){return a.mes===ym;});
  if(arch) return (arch.iva||0)+(arch.isr||0);
  var iva=0,isr=0;
  for(var i=0;i<DATOS.ventas.length;i++){
    var v=DATOS.ventas[i];
    if((v.fecha||"").slice(0,7)!==ym) continue;
    if(v.cancelacion) continue;
    if(v.esApartado) continue;
    var f=fiscalCalc(v.total||0, v.mpago||"efectivo");
    iva+=f.iva; isr+=f.isr;
  }
  for(var i=0;i<DATOS.apartados.length;i++){
    var apa=DATOS.apartados[i];
    if(apa.estado==="cancelado"||!apa.abonos) continue;
    for(var j=0;j<apa.abonos.length;j++){
      var ab=apa.abonos[j];
      if((ab.fecha||"").slice(0,7)!==ym) continue;
      var f=fiscalCalc(ab.monto||0, ab.mpago||"efectivo");
      iva+=f.iva; isr+=f.isr;
    }
  }
  return iva+isr;
}

// ── DASHBOARD ────────────────────────────────────────────────────────────────
function RDash(){
  var ym=mesActual();
  var ingr=ingresosMes(ym), gf=gastosFijosMesPagado(ym), gv=gastosVariablesMes(ym), pp=pagosProveedoresMes(ym), gs=gastosSueldosMes(ym), gm=gastosMercanciaMes(ym);
  var fis=impuestoMes(ym), impuesto=fis?(fis.impuestoDeterminado||0):0, ahorro=fis?(fis.ahorro||0):0;
  var utilidad=ingr-gf-gv-pp-gs-gm-impuesto;
  var kpis=[
    ["Ingresos del mes", fmt(ingr), "#4ade80"],
    ["Gastos fijos pagados", fmt(gf), "#f87171"],
    ["Gastos variables", fmt(gv), "#f59e0b"],
    ["Nómina del mes", fmt(gs), "#f97316"],
    ["Mercancía del mes", fmt(gm), "#eab308"],
    ["Pagos a proveedores", fmt(pp), "#818cf8"],
    ["Utilidad neta", fmt(utilidad), utilidad>=0?"#4ade80":"#f87171"],
    ["Saldo total a proveedores", fmt(saldoTotalProveedores()), "#c9a96e"],
    ["Mercancía invertida (histórico)", fmt(gastosMercanciaTotal()), "#c9a96e"]
  ];
  if(fis) kpis.push(["Ahorro fiscal calculado", fmt(ahorro), ahorro>=0?"#4ade80":"#f87171"]);
  var kh=""; for(var i=0;i<kpis.length;i++) kh+='<div class="kpi"><div class="kl">'+kpis[i][0]+'</div><div class="kv" style="color:'+kpis[i][2]+'">'+kpis[i][1]+'</div></div>';
  ge("dash-kpis").innerHTML=kh;

  // Alertas de vencimiento
  var alertas=[];
  for(var i=0;i<ADB.fijosMensuales.length;i++){
    var f=ADB.fijosMensuales[i]; if(f.domiciliado) continue;
    var pagado=ADB.pagosMensuales.some(function(p){ return p.fijoId===f.id&&p.mes===ym; });
    if(pagado) continue;
    var venc=ym+"-"+String(f.dia||1).padStart(2,"0");
    var d=diasEntre(venc);
    var cls=d<0?"dueRed":(d<=5?"dueYellow":"dueGreen");
    var txt=d<0?("Vencido hace "+Math.abs(d)+" dia(s)"):(d===0?"Vence hoy":("Vence en "+d+" dia(s)"));
    alertas.push('<div class="fr"><span>'+esc(f.nombre)+' <span class="sm mut">(mensual)</span></span><span class="'+cls+'">'+txt+'</span></div>');
  }
  for(var i=0;i<ADB.fijosAnuales.length;i++){
    var f=ADB.fijosAnuales[i]; if(f.domiciliado) continue;
    var anioActual=parseInt(ym.slice(0,4));
    var pagado=ADB.pagosAnuales.some(function(p){ return p.fijoId===f.id&&p.anio===anioActual; });
    if(pagado) continue;
    var md=(f.fechaContratacion||"01-01").slice(4); // MM-DD
    var venc=anioActual+"-"+md;
    var d=diasEntre(venc);
    if(d<-60) continue; // muy vencido y probablemente ya no aplica esta ronda
    var cls=d<0?"dueRed":(d<=30?"dueYellow":"dueGreen");
    var txt=d<0?("Vencido hace "+Math.abs(d)+" dia(s)"):(d===0?"Vence hoy":("Vence en "+d+" dia(s)"));
    alertas.push('<div class="fr"><span>'+esc(f.nombre)+' <span class="sm mut">(anual)</span></span><span class="'+cls+'">'+txt+'</span></div>');
  }
  for(var i=0;i<ADB.sueldos.length;i++){
    var s=ADB.sueldos[i]; if(s.tipoPago==="unico") continue;
    var periodosPend=periodosPendientesSueldo(s, ym);
    for(var k=0;k<periodosPend.length;k++){
      var venc=periodosPend[k].fecha;
      var d=diasEntre(venc);
      var cls=d<0?"dueRed":(d<=3?"dueYellow":"dueGreen");
      var txt=d<0?("Vencido hace "+Math.abs(d)+" dia(s)"):(d===0?"Vence hoy":("Vence en "+d+" dia(s)"));
      alertas.push('<div class="fr"><span>'+esc(s.nombre)+' <span class="sm mut">(sueldo)</span></span><span class="'+cls+'">'+txt+'</span></div>');
    }
  }
  for(var i=0;i<ADB.fiscal.length;i++){
    var f=ADB.fiscal[i]; if(f.pagado||!f.fechaLimite) continue;
    var d=diasEntre(f.fechaLimite);
    var cls=d<0?"dueRed":(d<=5?"dueYellow":"dueGreen");
    var txt=d<0?("Vencido hace "+Math.abs(d)+" dia(s)"):(d===0?"Vence hoy":("Vence en "+d+" dia(s)"));
    alertas.push('<div class="fr"><span>Impuesto '+esc(f.periodo)+' <span class="sm mut">(fiscal)</span></span><span class="'+cls+'">'+txt+'</span></div>');
  }
  ge("dash-alertas").innerHTML=alertas.length?alertas.join(""):'<div class="sm mut">Sin vencimientos próximos.</div>';

  // Gasto por categoria (variables del mes)
  var cats={};
  for(var i=0;i<ADB.variables.length;i++){ var v=ADB.variables[i]; if((v.fecha||"").slice(0,7)!==ym) continue; cats[v.categoria]=(cats[v.categoria]||0)+(v.monto||0); }
  var claves=Object.keys(cats);
  if(!claves.length){ ge("dash-cat").innerHTML='<div class="sm mut">Sin gastos variables este mes.</div>'; }
  else {
    var max=0; for(var i=0;i<claves.length;i++) if(cats[claves[i]]>max) max=cats[claves[i]];
    var h="";
    for(var i=0;i<claves.length;i++){
      var pct=Math.round((cats[claves[i]]/max)*100);
      h+='<div style="margin-bottom:9px"><div style="display:flex;justify-content:space-between;font-size:12px;margin-bottom:3px"><span>'+esc(claves[i])+'</span><span class="gold">'+fmt(cats[claves[i]])+'</span></div><div class="progwrap"><div class="progbar" style="width:'+pct+'%"></div></div></div>';
    }
    ge("dash-cat").innerHTML=h;
  }
}


// ── FIJOS: navegación de sub-pestañas ───────────────────────────────────────
var subFijos="mensual";
function setSubFijos(s){
  subFijos=s;
  var btns=document.querySelectorAll('[data-sf]'); for(var i=0;i<btns.length;i++) btns[i].classList.toggle("on", btns[i].getAttribute("data-sf")===s);
  ge("sub-mensual").style.display=s==="mensual"?"block":"none";
  ge("sub-anual").style.display=s==="anual"?"block":"none";
  ge("sub-credito").style.display=s==="credito"?"block":"none";
}
function RFijos(){ renderMensuales(); renderAnuales(); renderCreditos(); }

// ── FIJOS MENSUALES ──────────────────────────────────────────────────────────
function aFijoMensual(id){
  var f=id?ADB.fijosMensuales.find(function(x){return x.id===id;}):null;
  var h='<div class="fld"><label class="lbl">Nombre</label><input class="inp" id="fm-nombre" value="'+esc(f?f.nombre:"")+'"/></div>';
  h+='<div class="g2"><div class="fld"><label class="lbl">Monto mensual</label><input class="inp" type="number" id="fm-monto" value="'+(f?f.monto:"")+'"/></div>';
  h+='<div class="fld"><label class="lbl">Día de vencimiento (1-31)</label><input class="inp" type="number" min="1" max="31" id="fm-dia" value="'+(f?f.dia:"5")+'"/></div></div>';
  h+='<div class="fld"><label style="display:flex;align-items:center;gap:8px;cursor:pointer;font-size:13px"><input type="checkbox" id="fm-domic" '+(f&&f.domiciliado?"checked":"")+' style="accent-color:#c9a96e;width:15px;height:15px"/> Domiciliado (cargo automático, sin recordatorio)</label></div>';
  h+='<div style="display:flex;justify-content:space-between;padding-top:7px">';
  h+=(f?'<button class="btnr" onclick="delFijoMensual(\''+f.id+'\')">Eliminar</button>':'<span></span>');
  h+='<button class="btna" onclick="saveFijoMensual(\''+(id||"")+'\')">Guardar</button></div>';
  OM(f?"Editar gasto fijo mensual":"Nuevo gasto fijo mensual", h);
}
function saveFijoMensual(id){
  var nombre=ge("fm-nombre").value.trim(); if(!nombre){ alert("El nombre es obligatorio"); return; }
  var d={nombre:nombre, monto:parseFloat(ge("fm-monto").value)||0, dia:parseInt(ge("fm-dia").value)||1, domiciliado:ge("fm-domic").checked};
  if(id){ var i=ADB.fijosMensuales.findIndex(function(x){return x.id===id;}); ADB.fijosMensuales[i]=Object.assign({},ADB.fijosMensuales[i],d); }
  else { d.id=uid(); ADB.fijosMensuales.push(d); }
  saveAdmin(); CM(); renderMensuales();
}
function delFijoMensual(id){
  if(!confirm("Eliminar este gasto fijo mensual? Se borrará también su historial de pagos de este y otros meses.")) return;
  ADB.fijosMensuales=ADB.fijosMensuales.filter(function(x){return x.id!==id;});
  saveAdmin(); CM(); renderMensuales();
}
function renderMensuales(){
  var el=ge("list-mensual"); if(!el) return;
  if(!ADB.fijosMensuales.length){ el.innerHTML='<div class="sm mut">Sin gastos fijos mensuales registrados.</div>'; return; }
  var ym=mesActual();
  var h="";
  for(var i=0;i<ADB.fijosMensuales.length;i++){
    var f=ADB.fijosMensuales[i];
    var pago=ADB.pagosMensuales.filter(function(p){return p.fijoId===f.id&&p.mes===ym;}).sort(function(a,b){return (b.fecha||"").localeCompare(a.fecha||"");})[0];
    h+='<div class="card">';
    h+='<div style="display:flex;justify-content:space-between;align-items:start">';
    h+='<div><div style="font-weight:700">'+esc(f.nombre)+'</div><div class="sm mut">Día '+f.dia+' &middot; '+fmt(f.monto)+(f.domiciliado?' &middot; <span style="color:#818cf8">Domiciliado</span>':'')+'</div></div>';
    h+='<div style="display:flex;gap:5px"><button class="btn btns" onclick="aFijoMensual(\''+f.id+'\')">Editar</button></div>';
    h+='</div>';
    if(pago){
      h+='<div class="sm" style="margin-top:8px;color:#4ade80">'+(pago.automatico?"Cobro automático registrado el ":"Pagado el ")+pago.fecha+' &middot; '+fmt(pago.monto)+(pago.fondosExternos?' <span style="color:#818cf8">(fondos externos)</span>':'')+'</div>';
      h+='<div style="margin-top:7px;display:flex;gap:6px"><button class="btn btns" onclick="aPagoMensual(\''+f.id+'\',true)">Editar pago</button><button class="btn btns" style="color:#f87171" onclick="rechazarPagoMensual(\''+f.id+'\')">Rechazar / cancelar</button></div>';
    } else if(f.domiciliado){
      h+='<div class="sm mut" style="margin-top:8px">Se registrará automáticamente el día '+f.dia+'.</div>';
    } else {
      h+='<div style="margin-top:9px"><button class="btng btns" onclick="aPagoMensual(\''+f.id+'\')">Marcar pagado</button></div>';
    }
    h+='</div>';
  }
  el.innerHTML=h;
}
function aPagoMensual(fijoId, editar){
  var f=ADB.fijosMensuales.find(function(x){return x.id===fijoId;}); if(!f) return;
  var ym=mesActual();
  var pago=editar?ADB.pagosMensuales.find(function(p){return p.fijoId===fijoId&&p.mes===ym;}):null;
  var h='<div class="g2"><div class="fld"><label class="lbl">Fecha de pago</label><input class="inp" type="date" id="pm-fecha" value="'+(pago?pago.fecha:hoy())+'"/></div>';
  h+='<div class="fld"><label class="lbl">Monto</label><input class="inp" type="number" id="pm-monto" value="'+(pago?pago.monto:f.monto)+'"/></div></div>';
  h+='<div class="fld"><label class="lbl">Mes que cubre</label><input class="inp" type="month" id="pm-mes" value="'+ym+'"/></div>';
  h+='<div class="fld"><label style="display:flex;align-items:center;gap:8px;cursor:pointer;font-size:13px"><input type="checkbox" id="pm-externo" '+(pago&&pago.fondosExternos?"checked":"")+' style="accent-color:#c9a96e;width:15px;height:15px"/> Pagado con fondos externos (no descontar de la utilidad de este mes)</label></div>';
  h+='<div style="display:flex;justify-content:flex-end;padding-top:7px"><button class="btna" onclick="guardarPagoMensual(\''+fijoId+'\')">Guardar</button></div>';
  OM(pago?"Editar pago · "+f.nombre:"Registrar pago · "+f.nombre, h);
}
function guardarPagoMensual(fijoId){
  var mes=ge("pm-mes").value;
  ADB.pagosMensuales=ADB.pagosMensuales.filter(function(p){return !(p.fijoId===fijoId&&p.mes===mes);});
  ADB.pagosMensuales.push({id:uid(), fijoId:fijoId, mes:mes, fecha:ge("pm-fecha").value, monto:parseFloat(ge("pm-monto").value)||0, fondosExternos:ge("pm-externo").checked});
  saveAdmin(); CM(); renderMensuales(); RDash();
}
function rechazarPagoMensual(fijoId){
  var ym=mesActual();
  if(!confirm("Marcar este pago como rechazado/cancelado? Volverá a aparecer como pendiente.")) return;
  ADB.pagosMensuales=ADB.pagosMensuales.filter(function(p){return !(p.fijoId===fijoId&&p.mes===ym);});
  saveAdmin(); renderMensuales(); RDash();
}

// ── FIJOS ANUALES ────────────────────────────────────────────────────────────
function aFijoAnual(id){
  var f=id?ADB.fijosAnuales.find(function(x){return x.id===id;}):null;
  var h='<div class="fld"><label class="lbl">Nombre</label><input class="inp" id="fa-nombre" value="'+esc(f?f.nombre:"")+'"/></div>';
  h+='<div class="g2"><div class="fld"><label class="lbl">Monto anual</label><input class="inp" type="number" id="fa-monto" value="'+(f?f.monto:"")+'"/></div>';
  h+='<div class="fld"><label class="lbl">Fecha de contratación</label><input class="inp" type="date" id="fa-fecha" value="'+(f?f.fechaContratacion:hoy())+'"/></div></div>';
  h+='<div class="fld"><label style="display:flex;align-items:center;gap:8px;cursor:pointer;font-size:13px"><input type="checkbox" id="fa-domic" '+(f&&f.domiciliado?"checked":"")+' style="accent-color:#c9a96e;width:15px;height:15px"/> Domiciliado (cargo automático, sin recordatorio)</label></div>';
  h+='<div style="display:flex;justify-content:space-between;padding-top:7px">';
  h+=(f?'<button class="btnr" onclick="delFijoAnual(\''+f.id+'\')">Eliminar</button>':'<span></span>');
  h+='<button class="btna" onclick="saveFijoAnual(\''+(id||"")+'\')">Guardar</button></div>';
  OM(f?"Editar suscripción anual":"Nueva suscripción anual", h);
}
function saveFijoAnual(id){
  var nombre=ge("fa-nombre").value.trim(); if(!nombre){ alert("El nombre es obligatorio"); return; }
  var d={nombre:nombre, monto:parseFloat(ge("fa-monto").value)||0, fechaContratacion:ge("fa-fecha").value||hoy(), domiciliado:ge("fa-domic").checked};
  if(id){ var i=ADB.fijosAnuales.findIndex(function(x){return x.id===id;}); ADB.fijosAnuales[i]=Object.assign({},ADB.fijosAnuales[i],d); }
  else { d.id=uid(); ADB.fijosAnuales.push(d); }
  saveAdmin(); CM(); renderAnuales();
}
function delFijoAnual(id){
  if(!confirm("Eliminar esta suscripción anual? Se borrará también su historial de pagos de este y otros años.")) return;
  ADB.fijosAnuales=ADB.fijosAnuales.filter(function(x){return x.id!==id;});
  saveAdmin(); CM(); renderAnuales();
}
function renderAnuales(){
  var el=ge("list-anual"); if(!el) return;
  if(!ADB.fijosAnuales.length){ el.innerHTML='<div class="sm mut">Sin suscripciones anuales registradas.</div>'; return; }
  var anioActual=parseInt(mesActual().slice(0,4));
  var h="";
  for(var i=0;i<ADB.fijosAnuales.length;i++){
    var f=ADB.fijosAnuales[i];
    var pago=ADB.pagosAnuales.filter(function(p){return p.fijoId===f.id&&p.anio===anioActual;})[0];
    var md=(f.fechaContratacion||"").slice(4);
    h+='<div class="card">';
    h+='<div style="display:flex;justify-content:space-between;align-items:start">';
    h+='<div><div style="font-weight:700">'+esc(f.nombre)+'</div><div class="sm mut">Aniversario '+md+' &middot; '+fmt(f.monto)+(f.domiciliado?' &middot; <span style="color:#818cf8">Domiciliado</span>':'')+' &middot; Contratado '+f.fechaContratacion+'</div></div>';
    h+='<div style="display:flex;gap:5px"><button class="btn btns" onclick="aFijoAnual(\''+f.id+'\')">Editar</button></div>';
    h+='</div>';
    if(pago){
      h+='<div class="sm" style="margin-top:8px;color:#4ade80">'+(pago.automatico?"Cobro automático registrado el ":"Pagado el ")+pago.fecha+' ('+pago.anio+') &middot; '+fmt(pago.monto)+(pago.fondosExternos?' <span style="color:#818cf8">(fondos externos)</span>':'')+'</div>';
      h+='<div style="margin-top:7px;display:flex;gap:6px"><button class="btn btns" onclick="aPagoAnual(\''+f.id+'\',true)">Editar pago</button><button class="btn btns" style="color:#f87171" onclick="rechazarPagoAnual(\''+f.id+'\')">Rechazar / cancelar</button></div>';
    }
    else if(f.domiciliado){ h+='<div class="sm mut" style="margin-top:8px">Se registrará automáticamente el '+md+'.</div>'; }
    else { h+='<div style="margin-top:9px"><button class="btng btns" onclick="aPagoAnual(\''+f.id+'\')">Marcar pagado</button></div>'; }
    h+='</div>';
  }
  el.innerHTML=h;
}
function aPagoAnual(fijoId, editar){
  var f=ADB.fijosAnuales.find(function(x){return x.id===fijoId;}); if(!f) return;
  var anioActual=parseInt(mesActual().slice(0,4));
  var pago=editar?ADB.pagosAnuales.find(function(p){return p.fijoId===fijoId&&p.anio===anioActual;}):null;
  var h='<div class="g2"><div class="fld"><label class="lbl">Fecha de pago</label><input class="inp" type="date" id="pa-fecha" value="'+(pago?pago.fecha:hoy())+'"/></div>';
  h+='<div class="fld"><label class="lbl">Monto</label><input class="inp" type="number" id="pa-monto" value="'+(pago?pago.monto:f.monto)+'"/></div></div>';
  h+='<div class="fld"><label class="lbl">Año que cubre</label><input class="inp" type="number" id="pa-anio" value="'+anioActual+'"/></div>';
  h+='<div class="fld"><label style="display:flex;align-items:center;gap:8px;cursor:pointer;font-size:13px"><input type="checkbox" id="pa-externo" '+(pago&&pago.fondosExternos?"checked":"")+' style="accent-color:#c9a96e;width:15px;height:15px"/> Pagado con fondos externos (no descontar de la utilidad de este mes)</label></div>';
  h+='<div style="display:flex;justify-content:flex-end;padding-top:7px"><button class="btna" onclick="guardarPagoAnual(\''+fijoId+'\')">Guardar</button></div>';
  OM(pago?"Editar pago · "+f.nombre:"Registrar pago · "+f.nombre, h);
}
function guardarPagoAnual(fijoId){
  var anio=parseInt(ge("pa-anio").value);
  ADB.pagosAnuales=ADB.pagosAnuales.filter(function(p){return !(p.fijoId===fijoId&&p.anio===anio);});
  ADB.pagosAnuales.push({id:uid(), fijoId:fijoId, anio:anio, fecha:ge("pa-fecha").value, monto:parseFloat(ge("pa-monto").value)||0, fondosExternos:ge("pa-externo").checked});
  saveAdmin(); CM(); renderAnuales(); RDash();
}
function rechazarPagoAnual(fijoId){
  var anioActual=parseInt(mesActual().slice(0,4));
  if(!confirm("Marcar este pago como rechazado/cancelado? Volverá a aparecer como pendiente.")) return;
  ADB.pagosAnuales=ADB.pagosAnuales.filter(function(p){return !(p.fijoId===fijoId&&p.anio===anioActual);});
  saveAdmin(); renderAnuales(); RDash();
}

// ── CRÉDITOS ─────────────────────────────────────────────────────────────────
function aCredito(){
  var h='<div class="fld"><label class="lbl">Nombre del crédito</label><input class="inp" id="cr-nombre"/></div>';
  h+='<div class="g2"><div class="fld"><label class="lbl">Saldo actual (lo que debes hoy)</label><input class="inp" type="number" id="cr-saldo"/></div>';
  h+='<div class="fld"><label class="lbl">Fecha de alta</label><input class="inp" type="date" id="cr-fecha" value="'+hoy()+'"/></div></div>';
  h+='<div class="sm mut" style="margin-bottom:10px">El saldo restante se calculará automáticamente restando cada pago que registres a partir de este saldo inicial.</div>';
  h+='<div style="display:flex;justify-content:flex-end;padding-top:7px"><button class="btna" onclick="saveCredito()">Guardar</button></div>';
  OM("Nuevo crédito", h);
}
function saveCredito(){
  var nombre=ge("cr-nombre").value.trim(); if(!nombre){ alert("El nombre es obligatorio"); return; }
  ADB.creditos.push({id:uid(), nombre:nombre, saldoInicial:parseFloat(ge("cr-saldo").value)||0, fecha:ge("cr-fecha").value||hoy(), pagos:[]});
  saveAdmin(); CM(); renderCreditos();
}
function delCredito(id){
  if(!confirm("Eliminar este crédito y su historial de pagos?")) return;
  ADB.creditos=ADB.creditos.filter(function(x){return x.id!==id;});
  saveAdmin(); CM(); renderCreditos();
}
function saldoRestanteCredito(c){
  var pagado=0; for(var i=0;i<(c.pagos||[]).length;i++) pagado+=c.pagos[i].monto||0;
  return Math.max(0, (c.saldoInicial||0)-pagado);
}
function renderCreditos(){
  var el=ge("list-credito"); if(!el) return;
  if(!ADB.creditos.length){ el.innerHTML='<div class="sm mut">Sin créditos registrados.</div>'; return; }
  var h="";
  for(var i=0;i<ADB.creditos.length;i++){
    var c=ADB.creditos[i], restante=saldoRestanteCredito(c);
    var pct=c.saldoInicial>0?Math.round(((c.saldoInicial-restante)/c.saldoInicial)*100):100;
    h+='<div class="card">';
    h+='<div style="display:flex;justify-content:space-between;align-items:start">';
    h+='<div><div style="font-weight:700">'+esc(c.nombre)+'</div><div class="sm mut">Alta '+c.fecha+' &middot; Saldo inicial '+fmt(c.saldoInicial)+'</div></div>';
    h+='<button class="btn btns" style="color:#f87171" onclick="delCredito(\''+c.id+'\')">Eliminar</button>';
    h+='</div>';
    h+='<div style="margin-top:10px;display:flex;justify-content:space-between;align-items:center"><span class="sm mut">Saldo restante</span><span style="font-weight:700;color:'+(restante>0?"#f87171":"#4ade80")+'">'+fmt(restante)+'</span></div>';
    h+='<div class="progwrap"><div class="progbar" style="width:'+pct+'%"></div></div>';
    h+='<div style="margin-top:10px"><button class="btng btns" onclick="aPagoCredito(\''+c.id+'\')">Registrar pago</button></div>';
    if(c.pagos&&c.pagos.length){
      h+='<div style="margin-top:9px;border-top:1px solid #1e1c18;padding-top:7px">';
      var pagosOrd=c.pagos.slice().sort(function(a,b){return (b.fecha||"").localeCompare(a.fecha||"");});
      for(var j=0;j<Math.min(pagosOrd.length,5);j++) h+='<div class="fr sm mut"><span>'+pagosOrd[j].fecha+'</span><span>'+fmt(pagosOrd[j].monto)+'</span></div>';
      h+='</div>';
    }
    h+='</div>';
  }
  el.innerHTML=h;
}
function aPagoCredito(credId){
  var c=ADB.creditos.find(function(x){return x.id===credId;}); if(!c) return;
  var h='<div class="g2"><div class="fld"><label class="lbl">Fecha</label><input class="inp" type="date" id="pc-fecha" value="'+hoy()+'"/></div>';
  h+='<div class="fld"><label class="lbl">Monto</label><input class="inp" type="number" id="pc-monto"/></div></div>';
  h+='<div class="fld"><label style="display:flex;align-items:center;gap:8px;cursor:pointer;font-size:13px"><input type="checkbox" id="pc-externo" style="accent-color:#c9a96e;width:15px;height:15px"/> Pagado con fondos externos (no descontar de la utilidad de este mes)</label></div>';
  h+='<div style="display:flex;justify-content:flex-end;padding-top:7px"><button class="btna" onclick="guardarPagoCredito(\''+credId+'\')">Guardar</button></div>';
  OM("Registrar pago · "+c.nombre, h);
}
function guardarPagoCredito(credId){
  var c=ADB.creditos.find(function(x){return x.id===credId;}); if(!c) return;
  var monto=parseFloat(ge("pc-monto").value)||0;
  c.pagos=c.pagos||[]; c.pagos.push({id:uid(), fecha:ge("pc-fecha").value, monto:monto, fondosExternos:ge("pc-externo").checked});
  saveAdmin(); CM(); renderCreditos(); RDash();
}

// ── VARIABLES ────────────────────────────────────────────────────────────────
var CATS_VAR=["Papelería","Compra de equipo","Otros"];
function aVariable(){
  var opts=""; for(var i=0;i<CATS_VAR.length;i++) opts+='<option value="'+CATS_VAR[i]+'">'+CATS_VAR[i]+'</option>';
  opts+='<option value="__nueva__">+ Nueva categoría...</option>';
  var h='<div class="fld"><label class="lbl">Categoría</label><select class="inp" id="vr-cat" onchange="if(this.value===\'__nueva__\')ge(\'vr-cat-nueva\').style.display=\'block\';else ge(\'vr-cat-nueva\').style.display=\'none\'">'+opts+'</select></div>';
  h+='<div class="fld" id="vr-cat-nueva" style="display:none"><label class="lbl">Nombre de la nueva categoría</label><input class="inp" id="vr-cat-txt"/></div>';
  h+='<div class="g2"><div class="fld"><label class="lbl">Monto</label><input class="inp" type="number" id="vr-monto"/></div>';
  h+='<div class="fld"><label class="lbl">Fecha</label><input class="inp" type="date" id="vr-fecha" value="'+hoy()+'"/></div></div>';
  h+='<div class="fld"><label class="lbl">Nota (opcional)</label><input class="inp" id="vr-nota"/></div>';
  h+='<div class="fld"><label style="display:flex;align-items:center;gap:8px;cursor:pointer;font-size:13px"><input type="checkbox" id="vr-externo" style="accent-color:#c9a96e;width:15px;height:15px"/> Pagado con fondos externos (no descontar de la utilidad de este mes)</label></div>';
  h+='<div style="display:flex;justify-content:flex-end;padding-top:7px"><button class="btna" onclick="saveVariable()">Guardar</button></div>';
  OM("Nuevo gasto variable", h);
}
function saveVariable(){
  var cat=ge("vr-cat").value; if(cat==="__nueva__") cat=ge("vr-cat-txt").value.trim()||"Otros";
  if(CATS_VAR.indexOf(cat)===-1) CATS_VAR.push(cat);
  ADB.variables.push({id:uid(), categoria:cat, monto:parseFloat(ge("vr-monto").value)||0, fecha:ge("vr-fecha").value||hoy(), nota:ge("vr-nota").value||"", fondosExternos:ge("vr-externo").checked});
  saveAdmin(); CM(); RVariables(); RDash();
}
function delVariable(id){
  if(!confirm("Eliminar este gasto?")) return;
  ADB.variables=ADB.variables.filter(function(x){return x.id!==id;});
  saveAdmin(); RVariables(); RDash();
}
function RVariables(){
  var ym=mesActual();
  ge("var-mes-tit").textContent=nombreMes(ym);
  var deEsteMes=ADB.variables.filter(function(v){return (v.fecha||"").slice(0,7)===ym;}).sort(function(a,b){return (b.fecha||"").localeCompare(a.fecha||"");});
  var tot=0; for(var i=0;i<deEsteMes.length;i++) tot+=deEsteMes[i].monto||0;
  ge("var-total").textContent=fmt(tot);
  var el=ge("list-variables");
  if(!deEsteMes.length){ el.innerHTML='<div class="sm mut">Sin gastos variables registrados este mes.</div>'; return; }
  var h='<div class="tw"><table class="tbl"><thead><tr><th>Fecha</th><th>Categoría</th><th>Nota</th><th>Monto</th><th></th></tr></thead><tbody>';
  for(var i=0;i<deEsteMes.length;i++){ var v=deEsteMes[i];
    h+='<tr><td class="mut">'+v.fecha+'</td><td>'+esc(v.categoria)+'</td><td class="mut sm">'+esc(v.nota||"")+'</td><td class="gold">'+fmt(v.monto)+'</td><td><button class="btn btns" style="color:#f87171" onclick="delVariable(\''+v.id+'\')">X</button></td></tr>';
  }
  h+='</tbody></table></div>';
  el.innerHTML=h;
}

// ── PROVEEDORES ──────────────────────────────────────────────────────────────
function RProvs(){
  var el=ge("list-provs"); if(!el) return;
  var ids={}; for(var i=0;i<DATOS.provs.length;i++) if(DATOS.provs[i].tipo==="consignacion") ids[DATOS.provs[i].id]=true;
  for(var pid in ADB.proveedores) if(getProvTipo(pid)==="consignacion") ids[pid]=true;
  var lista=Object.keys(ids);
  if(!lista.length){ el.innerHTML='<div class="sm mut">Aún no hay proveedores de consignación en Arcana. Los de compra directa no generan cuenta por pagar aquí.</div>'; return; }
  lista.sort(function(a,b){ return (ADB.proveedores[b]?ADB.proveedores[b].saldo||0:0)-(ADB.proveedores[a]?ADB.proveedores[a].saldo||0:0); });
  var h="";
  for(var i=0;i<lista.length;i++){
    var pid=lista[i], nombre=getProvName(pid), tipo=getProvTipo(pid);
    var pd=ADB.proveedores[pid]||{saldo:0,pagos:[]};
    h+='<div class="card">';
    h+='<div style="display:flex;justify-content:space-between;align-items:start">';
    h+='<div><div style="font-weight:700">'+esc(nombre)+'</div><div class="sm mut" style="color:'+(tipo==="consignacion"?"#f59e0b":"#4ade80")+'">'+(tipo==="consignacion"?"Consignación":"Compra directa")+'</div></div>';
    h+='<div style="text-align:right"><div class="sm mut">Saldo pendiente</div><div style="font-weight:700;font-size:16px;color:'+(pd.saldo>0?"#f87171":"#4ade80")+'">'+fmt(pd.saldo)+'</div></div>';
    h+='</div>';
    if(pd.saldoInicial) h+='<div class="sm mut" style="margin-top:6px">Incluye '+fmt(pd.saldoInicial)+' de deuda anterior al sistema'+(pd.notaInicial?(' — '+esc(pd.notaInicial)):'')+'</div>';
    h+='<div style="margin-top:9px;display:flex;gap:6px;flex-wrap:wrap">';
    h+='<button class="btng btns" onclick="aPagoProv(\''+pid+'\')">Registrar pago</button>';
    h+='<button class="btn btns" onclick="aAjusteProv(\''+pid+'\')">Ajustar saldo</button>';
    h+='</div>';
    if(pd.pagos&&pd.pagos.length){
      h+='<div style="margin-top:9px;border-top:1px solid #1e1c18;padding-top:7px">';
      var pagosOrd=pd.pagos.slice().sort(function(a,b){return (b.fecha||"").localeCompare(a.fecha||"");});
      for(var j=0;j<Math.min(pagosOrd.length,8);j++){
        var pg=pagosOrd[j];
        var esSuma=pg.esCierre||pg.esAjuste;
        var color=pg.esCierre?"#c9a96e":(pg.esAjuste?"#f59e0b":"#a09480");
        h+='<div class="fr sm"><span class="mut">'+pg.fecha+' &middot; '+esc(pg.metodo||"")+'</span><span style="color:'+color+'">'+(esSuma?"+":"−")+fmt(Math.abs(pg.monto))+'</span></div>';
      }
      h+='</div>';
    }
    h+='</div>';
  }
  el.innerHTML=h;
}
function aPagoProv(pid){
  var pd=ADB.proveedores[pid]||{saldo:0,pagos:[]};
  var h='<div class="g2"><div class="fld"><label class="lbl">Monto a pagar</label><input class="inp" type="number" id="pp-monto" value="'+pd.saldo+'"/></div>';
  h+='<div class="fld"><label class="lbl">Fecha</label><input class="inp" type="date" id="pp-fecha" value="'+hoy()+'"/></div></div>';
  h+='<div class="fld"><label class="lbl">Método de pago</label><select class="inp" id="pp-metodo"><option value="efectivo">Efectivo</option><option value="transferencia">Transferencia</option><option value="tarjeta">Tarjeta</option></select></div>';
  h+='<div style="display:flex;gap:6px;margin-bottom:10px">';
  h+='<button class="btn btns" onclick="ge(\'pp-monto\').value='+(pd.saldo||0)+'">Pagar todo ('+fmt(pd.saldo)+')</button>';
  h+='<button class="btn btns" onclick="ge(\'pp-monto\').value=Math.round(('+(pd.saldo||0)+')/2)">Mitad</button>';
  h+='</div>';
  h+='<div class="sm mut" style="margin-bottom:8px">Si el monto es menor al saldo, queda registrado como pago parcial y el resto sigue pendiente.</div>';
  h+='<div class="fld"><label style="display:flex;align-items:center;gap:8px;cursor:pointer;font-size:13px"><input type="checkbox" id="pp-externo" style="accent-color:#c9a96e;width:15px;height:15px"/> Pagado con fondos externos (no descontar de la utilidad de este mes)</label></div>';
  h+='<div style="display:flex;justify-content:flex-end;padding-top:7px"><button class="btna" onclick="guardarPagoProv(\''+pid+'\')">Guardar</button></div>';
  OM("Registrar pago · "+getProvName(pid), h);
}
function guardarPagoProv(pid){
  var monto=parseFloat(ge("pp-monto").value)||0;
  if(monto<=0){ alert("El monto debe ser mayor a cero."); return; }
  if(!ADB.proveedores[pid]) ADB.proveedores[pid]={saldo:0,pagos:[]};
  var saldoActual=ADB.proveedores[pid].saldo||0;
  if(monto>saldoActual && !confirm("El monto es mayor al saldo pendiente ("+fmt(saldoActual)+"). El saldo quedará en cero. Continuar?")) return;
  ADB.proveedores[pid].saldo=Math.max(0,saldoActual-monto);
  ADB.proveedores[pid].pagos=ADB.proveedores[pid].pagos||[];
  ADB.proveedores[pid].pagos.push({id:uid(), fecha:ge("pp-fecha").value, monto:monto, metodo:ge("pp-metodo").value, fondosExternos:ge("pp-externo").checked});
  saveAdmin(); CM(); RProvs(); RDash();
}

// Ajuste manual de saldo: para dar de alta deuda anterior al sistema o corregir errores.
// No cuenta como gasto del mes — solo modifica el saldo pendiente del proveedor.
function aAjusteProv(pid){
  var pd=ADB.proveedores[pid]||{saldo:0,pagos:[]};
  var h='<div class="sm mut" style="margin-bottom:12px">Usa esto para registrar deuda de meses anteriores a que empezaras a usar el sistema, o para corregir un saldo. No se cuenta como gasto del mes.</div>';
  h+='<div class="fr" style="margin-bottom:12px"><span class="mut">Saldo actual</span><span class="gold" style="font-weight:700">'+fmt(pd.saldo)+'</span></div>';
  h+='<div class="fld"><label class="lbl">Tipo de ajuste</label><select class="inp" id="aj-tipo"><option value="sumar">Agregar deuda anterior (+)</option><option value="fijar">Fijar saldo exacto (=)</option><option value="restar">Reducir saldo (−)</option></select></div>';
  h+='<div class="fld"><label class="lbl">Monto</label><input class="inp" type="number" id="aj-monto"/></div>';
  h+='<div class="fld"><label class="lbl">Nota (opcional)</label><input class="inp" id="aj-nota" placeholder="Ej. deuda acumulada enero–junio"/></div>';
  h+='<div style="display:flex;justify-content:flex-end;padding-top:7px"><button class="btna" onclick="guardarAjusteProv(\''+pid+'\')">Guardar ajuste</button></div>';
  OM("Ajustar saldo · "+getProvName(pid), h);
}
function guardarAjusteProv(pid){
  var monto=parseFloat(ge("aj-monto").value)||0;
  if(monto<0){ alert("Usa el tipo de ajuste para restar; el monto debe ser positivo."); return; }
  var tipo=ge("aj-tipo").value, nota=ge("aj-nota").value||"";
  if(!ADB.proveedores[pid]) ADB.proveedores[pid]={saldo:0,pagos:[]};
  var pd=ADB.proveedores[pid];
  var antes=pd.saldo||0, despues=antes;
  if(tipo==="sumar") despues=antes+monto;
  else if(tipo==="fijar") despues=monto;
  else if(tipo==="restar") despues=Math.max(0,antes-monto);
  pd.saldo=despues;
  var delta=despues-antes;
  if(tipo==="sumar"){ pd.saldoInicial=(pd.saldoInicial||0)+monto; if(nota) pd.notaInicial=nota; }
  pd.pagos=pd.pagos||[];
  pd.pagos.push({id:uid(), fecha:hoy(), monto:delta, metodo:"ajuste manual"+(nota?(" — "+nota):""), esAjuste:true, fondosExternos:true});
  saveAdmin(); CM(); RProvs(); RDash();
}

// ── FISCAL ───────────────────────────────────────────────────────────────────
function aFiscal(id){
  var f=id?ADB.fiscal.find(function(x){return x.id===id;}):null;
  var periodoIni=f?f.periodo:mesActual();
  var h='<div class="fld"><label class="lbl">Periodo</label><input class="inp" type="month" id="fs-periodo" value="'+periodoIni+'" onchange="actualizarPreviewFiscal()"/></div>';
  h+='<div class="fld"><label class="lbl">Impuesto determinado (lo que indica tu contador)</label><input class="inp" type="number" id="fs-impuesto" value="'+(f?f.impuestoDeterminado:"")+'" oninput="actualizarPreviewFiscal()"/></div>';
  h+='<div class="card" style="margin:10px 0">';
  h+='<div class="fr sm"><span class="mut">Impuesto teórico según ventas del inventario (IVA+ISR)</span><span id="fs-teorico-val" class="gold">$0</span></div>';
  h+='<div class="fr" style="margin-top:4px"><span class="mut">Ahorro fiscal (calculado)</span><span id="fs-ahorro-val" style="font-weight:700;color:#4ade80">$0</span></div>';
  h+='</div>';
  h+='<div class="fld"><label class="lbl">Fecha límite de pago</label><input class="inp" type="date" id="fs-limite" value="'+(f?f.fechaLimite:"")+'"/></div>';
  h+='<div class="fld"><label style="display:flex;align-items:center;gap:8px;cursor:pointer;font-size:13px"><input type="checkbox" id="fs-pagado" '+(f&&f.pagado?"checked":"")+' style="accent-color:#c9a96e;width:15px;height:15px"/> Ya está pagado</label></div>';
  h+='<div style="display:flex;justify-content:space-between;padding-top:7px">';
  h+=(f?'<button class="btnr" onclick="delFiscal(\''+f.id+'\')">Eliminar</button>':'<span></span>');
  h+='<button class="btna" onclick="saveFiscal(\''+(id||"")+'\')">Guardar</button></div>';
  OM(f?"Editar periodo fiscal":"Nuevo periodo fiscal", h);
  setTimeout(actualizarPreviewFiscal, 50);
}
function actualizarPreviewFiscal(){
  var periodo=(ge("fs-periodo")||{}).value||mesActual();
  var teorico=impuestoTeoricoMes(periodo);
  var determinado=parseFloat((ge("fs-impuesto")||{}).value)||0;
  var ahorro=teorico-determinado;
  if(ge("fs-teorico-val")) ge("fs-teorico-val").textContent=fmt(teorico);
  if(ge("fs-ahorro-val")){ ge("fs-ahorro-val").textContent=fmt(ahorro); ge("fs-ahorro-val").style.color=ahorro>=0?"#4ade80":"#f87171"; }
}
function saveFiscal(id){
  var periodo=ge("fs-periodo").value;
  var determinado=parseFloat(ge("fs-impuesto").value)||0;
  var teorico=impuestoTeoricoMes(periodo);
  var d={periodo:periodo, impuestoDeterminado:determinado, impuestoTeorico:teorico, ahorro:teorico-determinado, fechaLimite:ge("fs-limite").value||"", pagado:ge("fs-pagado").checked};
  if(d.pagado) d.fechaPago=hoy();
  if(id){ var i=ADB.fiscal.findIndex(function(x){return x.id===id;}); d.fechaPago=ADB.fiscal[i].fechaPago; if(d.pagado&&!d.fechaPago) d.fechaPago=hoy(); ADB.fiscal[i]=Object.assign({},ADB.fiscal[i],d); }
  else { d.id=uid(); ADB.fiscal.push(d); }
  saveAdmin(); CM(); RFiscal(); RDash();
}
function delFiscal(id){
  if(!confirm("Eliminar este periodo fiscal?")) return;
  ADB.fiscal=ADB.fiscal.filter(function(x){return x.id!==id;});
  saveAdmin(); CM(); RFiscal();
}
function RFiscal(){
  var el=ge("list-fiscal"); if(!el) return;
  if(!ADB.fiscal.length){ el.innerHTML='<div class="sm mut">Sin periodos fiscales registrados.</div>'; return; }
  var lista=ADB.fiscal.slice().sort(function(a,b){return (b.periodo||"").localeCompare(a.periodo||"");});
  var h="";
  for(var i=0;i<lista.length;i++){
    var f=lista[i];
    var estado=f.pagado?'<span class="pill pg">Pagado</span>':(f.fechaLimite&&diasEntre(f.fechaLimite)<0?'<span class="pill pr">Vencido</span>':'<span class="pill py">Pendiente</span>');
    h+='<div class="card">';
    h+='<div style="display:flex;justify-content:space-between;align-items:start">';
    h+='<div><div style="font-weight:700">'+nombreMes(f.periodo)+'</div><div class="sm mut">Límite: '+(f.fechaLimite||"sin definir")+'</div></div>';
    h+='<div style="text-align:right">'+estado+'<div style="display:flex;gap:5px;margin-top:6px"><button class="btn btns" onclick="aFiscal(\''+f.id+'\')">Editar</button></div></div>';
    h+='</div>';
    h+='<div class="g3" style="margin-top:10px"><div><div class="kl">Impuesto determinado</div><div style="font-weight:700;color:#f87171">'+fmt(f.impuestoDeterminado)+'</div></div><div><div class="kl">Teórico (inventario)</div><div style="font-weight:700;color:#818cf8">'+fmt(f.impuestoTeorico||0)+'</div></div><div><div class="kl">Ahorro fiscal</div><div style="font-weight:700;color:'+((f.ahorro||0)>=0?"#4ade80":"#f87171")+'">'+fmt(f.ahorro)+'</div></div></div>';
    h+='</div>';
  }
  el.innerHTML=h;
}

// ── HISTÓRICO ────────────────────────────────────────────────────────────────
// Detecta el primer mes (mas antiguo) en el que existe algun dato real,
// para que el Historico no muestre meses vacios de antes de usar el sistema.
function primerMesConDatos(){
  var candidatos=[];
  for(var i=0;i<DATOS.archivo.length;i++) if(DATOS.archivo[i].mes) candidatos.push(DATOS.archivo[i].mes);
  for(var i=0;i<DATOS.ventas.length;i++) if(DATOS.ventas[i].fecha) candidatos.push(DATOS.ventas[i].fecha.slice(0,7));
  for(var i=0;i<ADB.pagosMensuales.length;i++) if(ADB.pagosMensuales[i].mes) candidatos.push(ADB.pagosMensuales[i].mes);
  for(var i=0;i<ADB.pagosAnuales.length;i++) if(ADB.pagosAnuales[i].fecha) candidatos.push(ADB.pagosAnuales[i].fecha.slice(0,7));
  for(var i=0;i<ADB.variables.length;i++) if(ADB.variables[i].fecha) candidatos.push(ADB.variables[i].fecha.slice(0,7));
  for(var i=0;i<ADB.mercancia.length;i++) if(ADB.mercancia[i].fecha) candidatos.push(ADB.mercancia[i].fecha.slice(0,7));
  for(var i=0;i<ADB.pagosSueldos.length;i++) if(ADB.pagosSueldos[i].fecha) candidatos.push(ADB.pagosSueldos[i].fecha.slice(0,7));
  for(var pid in ADB.proveedores){ var pagos=ADB.proveedores[pid].pagos||[]; for(var i=0;i<pagos.length;i++) if(pagos[i].fecha) candidatos.push(pagos[i].fecha.slice(0,7)); }
  if(!candidatos.length) return mesActual();
  candidatos.sort();
  return candidatos[0];
}

function RHist(){
  var repInput=ge("rep-periodo"); if(repInput&&!repInput.value) repInput.value=mesActual();
  // Ingresos, gastos totales y utilidad neta, desde el primer mes con datos reales (sin meses vacios previos)
  var meses={};
  var hoyYm=mesActual();
  var inicioYm=primerMesConDatos();
  var inicioLimite=new Date(hoyYm+"-01T00:00:00"); inicioLimite.setMonth(inicioLimite.getMonth()-11);
  var inicioLimiteYm=inicioLimite.toISOString().slice(0,7);
  if(inicioYm<inicioLimiteYm) inicioYm=inicioLimiteYm; // tope de 12 meses hacia atras como maximo
  var d=new Date(inicioYm+"-01T00:00:00");
  while(d.toISOString().slice(0,7)<=hoyYm){
    var ym=d.toISOString().slice(0,7);
    var ingr=ingresosMes(ym);
    var gasto=gastosFijosMesPagado(ym)+gastosVariablesMes(ym)+pagosProveedoresMes(ym)+gastosSueldosMes(ym)+gastosMercanciaMes(ym);
    meses[ym]={ingr:ingr, gasto:gasto, utilidad:ingr-gasto};
    d.setMonth(d.getMonth()+1);
  }
  var claves=Object.keys(meses).sort();
  var max=1; for(var i=0;i<claves.length;i++){ max=Math.max(max,meses[claves[i]].ingr,meses[claves[i]].gasto); }
  var h='<div style="display:flex;align-items:flex-end;gap:10px;height:190px;padding:10px 0;overflow-x:auto">';
  for(var i=0;i<claves.length;i++){
    var ym=claves[i], m=meses[ym];
    var p1=Math.max(3,Math.round((m.ingr/max)*140)), p2=Math.max(3,Math.round((m.gasto/max)*140));
    var etq=MESES_ES[parseInt(ym.slice(5,7))-1].slice(0,3)+" "+ym.slice(2,4);
    h+='<div style="display:flex;flex-direction:column;align-items:center;gap:4px;min-width:56px;flex:1">';
    h+='<div style="display:flex;align-items:flex-end;gap:3px;height:140px">';
    h+='<div title="Ingresos" style="width:16px;height:'+p1+'px;background:#4ade80;border-radius:3px 3px 0 0"></div>';
    h+='<div title="Gastos totales" style="width:16px;height:'+p2+'px;background:#f87171;border-radius:3px 3px 0 0"></div>';
    h+='</div>';
    h+='<div style="font-size:10px;color:#6b6358;white-space:nowrap">'+etq+'</div>';
    h+='</div>';
  }
  h+='</div><div class="sm mut" style="text-align:center;margin-top:6px"><span style="color:#4ade80">&#9632;</span> Ingresos &nbsp; <span style="color:#f87171">&#9632;</span> Gastos totales (fijos + variables + n&oacute;mina + mercanc&iacute;a + proveedores)</div>';
  ge("hist-chart").innerHTML=h;

  // Utilidad neta mensual
  var maxU=1; for(var i=0;i<claves.length;i++) maxU=Math.max(maxU, Math.abs(meses[claves[i]].utilidad));
  var hu='<div style="display:flex;align-items:center;gap:10px;height:170px;padding:10px 0;overflow-x:auto">';
  for(var i=0;i<claves.length;i++){
    var ym=claves[i], u=meses[ym].utilidad;
    var ph=Math.max(3,Math.round((Math.abs(u)/maxU)*75));
    var etq=MESES_ES[parseInt(ym.slice(5,7))-1].slice(0,3)+" "+ym.slice(2,4);
    hu+='<div style="display:flex;flex-direction:column;align-items:center;gap:4px;min-width:56px;flex:1">';
    hu+='<div style="height:80px;display:flex;flex-direction:column;justify-content:flex-end">'+(u>=0?'<div style="width:20px;height:'+ph+'px;background:#4ade80;border-radius:3px 3px 0 0;margin:0 auto"></div>':'<div style="height:80px"></div>')+'</div>';
    hu+='<div style="height:80px;display:flex;flex-direction:column">'+(u<0?'<div style="width:20px;height:'+ph+'px;background:#f87171;border-radius:0 0 3px 3px;margin:0 auto"></div>':'')+'</div>';
    hu+='<div style="font-size:10px;color:#6b6358;white-space:nowrap">'+etq+'</div>';
    hu+='<div class="sm" style="color:'+(u>=0?"#4ade80":"#f87171")+'">'+fmt(u)+'</div>';
    hu+='</div>';
  }
  hu+='</div>';
  ge("hist-utilidad").innerHTML=hu;

  // Evolucion de deuda con proveedores: generado vs pagado por mes
  var gen={}, pag={};
  for(var i=0;i<DATOS.archivo.length;i++){
    var a=DATOS.archivo[i], pp=a.porProveedor||{}, tot=0;
    for(var k in pp) tot+=pp[k]||0;
    gen[a.mes]=(gen[a.mes]||0)+tot;
  }
  for(var pid in ADB.proveedores){
    var pagos=ADB.proveedores[pid].pagos||[];
    for(var i=0;i<pagos.length;i++){ if(pagos[i].esAjuste||pagos[i].esCierre) continue; var ym2=(pagos[i].fecha||"").slice(0,7); pag[ym2]=(pag[ym2]||0)+(pagos[i].monto||0); }
  }
  var todosYm={}; for(var k in gen) todosYm[k]=true; for(var k in pag) todosYm[k]=true;
  var clavesP=Object.keys(todosYm).sort();
  if(!clavesP.length){ ge("hist-provs").innerHTML='<div class="sm mut">Aún no hay historial de deuda con proveedores.</div>'; }
  else {
    if(clavesP.length>12) clavesP=clavesP.slice(clavesP.length-12);
    var maxP=1; for(var i=0;i<clavesP.length;i++) maxP=Math.max(maxP, gen[clavesP[i]]||0, pag[clavesP[i]]||0);
    var h2='<div style="display:flex;align-items:flex-end;gap:10px;height:190px;padding:10px 0;overflow-x:auto">';
    for(var i=0;i<clavesP.length;i++){
      var ym=clavesP[i];
      var p1=Math.max(3,Math.round(((gen[ym]||0)/maxP)*140)), p2=Math.max(3,Math.round(((pag[ym]||0)/maxP)*140));
      var etq=MESES_ES[parseInt(ym.slice(5,7))-1].slice(0,3)+" "+ym.slice(2,4);
      h2+='<div style="display:flex;flex-direction:column;align-items:center;gap:4px;min-width:56px;flex:1">';
      h2+='<div style="display:flex;align-items:flex-end;gap:3px;height:140px">';
      h2+='<div title="Generado" style="width:16px;height:'+p1+'px;background:#f59e0b;border-radius:3px 3px 0 0"></div>';
      h2+='<div title="Pagado" style="width:16px;height:'+p2+'px;background:#818cf8;border-radius:3px 3px 0 0"></div>';
      h2+='</div>';
      h2+='<div style="font-size:10px;color:#6b6358;white-space:nowrap">'+etq+'</div></div>';
    }
    h2+='</div><div class="sm mut" style="text-align:center;margin-top:6px"><span style="color:#f59e0b">&#9632;</span> Deuda generada &nbsp; <span style="color:#818cf8">&#9632;</span> Pagado</div>';
    ge("hist-provs").innerHTML=h2;
  }
}

// Reune todas las transacciones reales (pagos, gastos, mercancia, nomina, proveedores)
// de un periodo en una sola lista ordenada por fecha, para consulta clara.
function transaccionesDelPeriodo(ym){
  var t=[];
  for(var i=0;i<ADB.pagosMensuales.length;i++){ var p=ADB.pagosMensuales[i]; if(p.mes!==ym) continue;
    var f=ADB.fijosMensuales.find(function(x){return x.id===p.fijoId;});
    t.push({fecha:p.fecha, tipo:"Gasto fijo mensual", concepto:f?f.nombre:"(eliminado)", monto:(p.monto||0)+(p.bono||0), externo:!!p.fondosExternos});
  }
  for(var i=0;i<ADB.pagosAnuales.length;i++){ var p=ADB.pagosAnuales[i]; if((p.fecha||"").slice(0,7)!==ym) continue;
    var f=ADB.fijosAnuales.find(function(x){return x.id===p.fijoId;});
    t.push({fecha:p.fecha, tipo:"Gasto fijo anual", concepto:f?f.nombre:"(eliminado)", monto:p.monto||0, externo:!!p.fondosExternos});
  }
  for(var i=0;i<ADB.creditos.length;i++){ var c=ADB.creditos[i]; for(var j=0;j<(c.pagos||[]).length;j++){ var pg=c.pagos[j]; if((pg.fecha||"").slice(0,7)!==ym) continue;
    t.push({fecha:pg.fecha, tipo:"Pago de crédito", concepto:c.nombre, monto:pg.monto||0, externo:!!pg.fondosExternos}); } }
  for(var i=0;i<ADB.variables.length;i++){ var v=ADB.variables[i]; if((v.fecha||"").slice(0,7)!==ym) continue;
    t.push({fecha:v.fecha, tipo:"Gasto variable", concepto:v.categoria+(v.nota?(" — "+v.nota):""), monto:v.monto||0, externo:!!v.fondosExternos}); }
  for(var i=0;i<ADB.mercancia.length;i++){ var m=ADB.mercancia[i]; if((m.fecha||"").slice(0,7)!==ym) continue;
    t.push({fecha:m.fecha, tipo:"Mercancía", concepto:m.origen+(m.nota?(" — "+m.nota):""), monto:m.monto||0, externo:!!m.fondosExternos}); }
  for(var i=0;i<ADB.pagosSueldos.length;i++){ var p=ADB.pagosSueldos[i];
    var ymKey=p.periodo?p.periodo.slice(0,7):(p.fecha||"").slice(0,7); if(ymKey!==ym) continue;
    var s=ADB.sueldos.find(function(x){return x.id===p.sueldoId;});
    var etiqueta=p.esBonoUnico?"Bono único":"Nómina";
    t.push({fecha:p.fecha, tipo:etiqueta, concepto:s?s.nombre:"(eliminado)", monto:(p.monto||0)+(p.bono||0), externo:!!p.fondosExternos}); }
  for(var pid in ADB.proveedores){ var pagos=ADB.proveedores[pid].pagos||[]; for(var i=0;i<pagos.length;i++){ var pg=pagos[i]; if((pg.fecha||"").slice(0,7)!==ym) continue;
    t.push({fecha:pg.fecha, tipo:pg.esCierre?"Deuda generada (cierre de mes)":(pg.esAjuste?"Ajuste de saldo (proveedor)":"Pago a proveedor"), concepto:getProvName(pid)+(pg.metodo?(" — "+pg.metodo):""), monto:pg.monto||0, externo:!!pg.fondosExternos}); } }
  t.sort(function(a,b){ return (a.fecha||"").localeCompare(b.fecha||""); });
  return t;
}

function exportarCSV(){
  var ym=(ge("rep-periodo")||{}).value||mesActual();
  var trans=transaccionesDelPeriodo(ym);
  var ingr=ingresosMes(ym);
  var rows=[];
  rows.push(["ARCANA ADMINISTRACION","Periodo:",nombreMes(ym),"Generado:",hoy()].join(","));
  rows.push("");
  rows.push(["RESUMEN DEL PERIODO"].join(","));
  rows.push(["Ingresos",ingr].join(","));
  rows.push(["Gastos fijos pagados",gastosFijosMesPagado(ym)].join(","));
  rows.push(["Gastos variables",gastosVariablesMes(ym)].join(","));
  rows.push(["Nómina",gastosSueldosMes(ym)].join(","));
  rows.push(["Mercancía",gastosMercanciaMes(ym)].join(","));
  rows.push(["Pagos a proveedores",pagosProveedoresMes(ym)].join(","));
  var fis=impuestoMes(ym);
  rows.push(["Impuesto del periodo",fis?fis.impuestoDeterminado:0].join(","));
  var utilidad=ingr-gastosFijosMesPagado(ym)-gastosVariablesMes(ym)-gastosSueldosMes(ym)-gastosMercanciaMes(ym)-pagosProveedoresMes(ym)-(fis?fis.impuestoDeterminado:0);
  rows.push(["Utilidad neta",utilidad].join(","));
  rows.push("");
  rows.push(["LISTADO DE GASTOS Y PAGOS DEL PERIODO"].join(","));
  rows.push(["Fecha","Tipo","Concepto","Monto","Fondos externos"].join(","));
  for(var i=0;i<trans.length;i++){ var t=trans[i];
    rows.push([t.fecha, t.tipo, '"'+String(t.concepto).replace(/"/g,'""')+'"', t.monto, t.externo?"Si":"No"].join(",")); }
  if(!trans.length) rows.push(["(Sin gastos ni pagos registrados en este periodo)"].join(","));
  var blob=new Blob(["\ufeff"+rows.join("\r\n")],{type:"text/csv;charset=utf-8"});
  var url=URL.createObjectURL(blob);
  var a=document.createElement("a"); a.href=url; a.download="arcana-admin-"+ym+".csv"; a.click();
  URL.revokeObjectURL(url);
}

// Reporte imprimible: documento aparte, con el mismo estilo claro que usa Arcana Vintage
// para sus reportes, en vez de imprimir la interfaz oscura de trabajo.
function reporteImprimible(){
  var ym=(ge("rep-periodo")||{}).value||mesActual();
  var trans=transaccionesDelPeriodo(ym);
  var ingr=ingresosMes(ym), gf=gastosFijosMesPagado(ym), gv=gastosVariablesMes(ym), gs=gastosSueldosMes(ym), gm=gastosMercanciaMes(ym), pp=pagosProveedoresMes(ym);
  var fis=impuestoMes(ym), impuesto=fis?(fis.impuestoDeterminado||0):0, ahorro=fis?(fis.ahorro||0):0;
  var utilidad=ingr-gf-gv-gs-gm-pp-impuesto;
  var css='body{font-family:Arial,sans-serif;font-size:12px;color:#111;margin:20px}';
  css+='h1{font-size:19px;margin-bottom:2px}';
  css+='h2{font-size:14px;margin:20px 0 6px;padding:6px 10px;background:#f5f0e8;border-left:4px solid #c9a96e;color:#5a3e10}';
  css+='table{width:100%;border-collapse:collapse;margin-bottom:6px;font-size:11px}';
  css+='th{background:#f5f0e8;padding:5px 8px;text-align:left;border:1px solid #ddd;font-size:10px}';
  css+='td{padding:4px 8px;border:1px solid #eee}tr:nth-child(even){background:#fafaf8}';
  css+='.kgrid{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin:10px 0 4px}';
  css+='.kpi{border:1px solid #e5ddd0;border-radius:6px;padding:8px}';
  css+='.kl{font-size:9px;color:#888;text-transform:uppercase}.kv{font-size:14px;font-weight:700}';
  css+='.neg{color:#b91c1c}.pos{color:#166534}';
  css+='@page{margin:12mm 10mm}@media print{body{margin:0}}';
  var doc='<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Arcana Administracion - '+nombreMes(ym)+'<\/title><style>'+css+'<\/style><\/head><body>';
  var logo=(ADB.config&&ADB.config.logo)||"";
  if(logo) doc+='<img src="'+logo+'" style="width:44px;height:44px;border-radius:8px;object-fit:cover;float:right">';
  doc+='<h1>Arcana &middot; Administración<\/h1>';
  doc+='<p style="color:#666;font-size:11px">Periodo: '+nombreMes(ym)+' | Generado: '+hoy()+'<\/p>';
  doc+='<div class="kgrid">';
  doc+='<div class="kpi"><div class="kl">Ingresos<\/div><div class="kv pos">'+fmt(ingr)+'<\/div><\/div>';
  doc+='<div class="kpi"><div class="kl">Gastos fijos<\/div><div class="kv">'+fmt(gf)+'<\/div><\/div>';
  doc+='<div class="kpi"><div class="kl">Variables<\/div><div class="kv">'+fmt(gv)+'<\/div><\/div>';
  doc+='<div class="kpi"><div class="kl">Nómina<\/div><div class="kv">'+fmt(gs)+'<\/div><\/div>';
  doc+='<div class="kpi"><div class="kl">Mercancía<\/div><div class="kv">'+fmt(gm)+'<\/div><\/div>';
  doc+='<div class="kpi"><div class="kl">Pagos a proveedores<\/div><div class="kv">'+fmt(pp)+'<\/div><\/div>';
  doc+='<div class="kpi"><div class="kl">Impuesto<\/div><div class="kv">'+fmt(impuesto)+'<\/div><\/div>';
  doc+='<div class="kpi"><div class="kl">Utilidad neta<\/div><div class="kv '+(utilidad>=0?"pos":"neg")+'">'+fmt(utilidad)+'<\/div><\/div>';
  doc+='<\/div>';
  if(fis) doc+='<p style="font-size:11px;color:#166534">Ahorro fiscal calculado del periodo: '+fmt(ahorro)+'<\/p>';
  doc+='<h2>Listado de gastos y pagos del periodo<\/h2>';
  if(trans.length){
    doc+='<table><tr><th>Fecha<\/th><th>Tipo<\/th><th>Concepto<\/th><th>Monto<\/th><th>Origen del pago<\/th><\/tr>';
    for(var i=0;i<trans.length;i++){ var t=trans[i];
      doc+='<tr><td>'+t.fecha+'<\/td><td>'+esc(t.tipo)+'<\/td><td>'+esc(t.concepto)+'<\/td><td>'+fmt(t.monto)+'<\/td><td>'+(t.externo?"Fondos externos":"Operación normal")+'<\/td><\/tr>'; }
    doc+='<\/table>';
  } else {
    doc+='<p style="color:#999">Sin gastos ni pagos registrados en este periodo.<\/p>';
  }
  doc+='<\/body><\/html>';
  var w=window.open("","_blank");
  if(!w){ alert("El navegador bloqueó la ventana emergente. Permite ventanas emergentes para ver el reporte."); return; }
  w.document.write(doc); w.document.close();
  setTimeout(function(){ w.print(); }, 300);
}

// ── RESPALDO Y RECUPERACION ──────────────────────────────────────────────────
// PROTOCOLO PARA FUTUROS PARCHES: respaldarAdmin() serializa el objeto ADB completo
// tal cual vive en memoria, así que cualquier campo o modulo nuevo que se agregue a ADB
// en el futuro (una nueva pestaña, una nueva propiedad de configuracion, etc.) queda
// incluido en el respaldo automaticamente, sin tocar esta funcion.
// restaurarAdmin() usa la misma logica en reversa: parte de la forma por defecto de ADB
// y encima copia TODO lo que traiga el archivo (Object.assign), campo por campo, así que
// un respaldo mas nuevo con estructura nueva se restaura completo aunque este codigo no
// se haya actualizado todavia. Al agregar un modulo nuevo a ADB en el futuro, solo hay
// que sumar su valor por defecto a ADB_DEFAULT — no hay que tocar respaldar ni restaurar.
var ADB_DEFAULT_SHAPE={
  fijosMensuales:[], fijosAnuales:[], creditos:[], variables:[], pagosMensuales:[], pagosAnuales:[],
  proveedores:{}, mesesProcesados:[], fiscal:[], mercancia:[], sueldos:[], pagosSueldos:[],
  config:{lockPass:LOCK_PASS, logo:""}
};
function respaldarAdmin(){
  var data=JSON.stringify(ADB, null, 2);
  var blob=new Blob([data],{type:"application/json"});
  var url=URL.createObjectURL(blob);
  var ts=new Date().toISOString().replace(/[:T]/g,"-").slice(0,19);
  var a=document.createElement("a"); a.href=url; a.download="arcana-admin-respaldo-"+ts+".json"; a.click();
  URL.revokeObjectURL(url);
}
function restaurarAdmin(file){
  if(!file) return;
  if(!confirm("Restaurar este respaldo? Esto reemplazará TODA la información actual de Administración (gastos, sueldos, proveedores, fiscal, mercancía, logotipo, contraseña) con la del archivo. Esta acción no se puede deshacer.")) { ge("restaurar-file").value=""; return; }
  var reader=new FileReader();
  reader.onload=function(e){
    try{
      var data=JSON.parse(e.target.result);
      if(!data||typeof data!=="object"){ alert("El archivo no parece un respaldo válido."); return; }
      var merged={}; for(var k in ADB_DEFAULT_SHAPE) merged[k]=ADB_DEFAULT_SHAPE[k];
      for(var k in data) merged[k]=data[k]; // cualquier campo del archivo, incluidos los nuevos, se copia tal cual
      ADB=merged;
      saveAdmin(); renderAll();
      alert("Respaldo restaurado correctamente.");
    }catch(err){ alert("No se pudo leer el archivo. Verifica que sea un respaldo generado por esta misma app."); }
    ge("restaurar-file").value="";
  };
  reader.readAsText(file);
}

// ── MERCANCÍA ────────────────────────────────────────────────────────────────
function aMercancia(id){
  var m=id?ADB.mercancia.find(function(x){return x.id===id;}):null;
  var h='<div class="g2"><div class="fld"><label class="lbl">Monto</label><input class="inp" type="number" id="mc-monto" value="'+(m?m.monto:"")+'"/></div>';
  h+='<div class="fld"><label class="lbl">Fecha</label><input class="inp" type="date" id="mc-fecha" value="'+(m?m.fecha:hoy())+'"/></div></div>';
  h+='<div class="fld"><label class="lbl">Origen de la mercancía</label><input class="inp" id="mc-origen" value="'+esc(m?m.origen:"")+'" placeholder="Ej. proveedor, bazar, importación..."/></div>';
  h+='<div class="fld"><label class="lbl">Nota (opcional)</label><input class="inp" id="mc-nota" value="'+esc(m?m.nota:"")+'"/></div>';
  h+='<div class="fld"><label style="display:flex;align-items:center;gap:8px;cursor:pointer;font-size:13px"><input type="checkbox" id="mc-externo" '+(m&&m.fondosExternos?"checked":"")+' style="accent-color:#c9a96e;width:15px;height:15px"/> Pagado con fondos externos (no descontar de la utilidad de este mes)</label></div>';
  h+='<div style="display:flex;justify-content:space-between;padding-top:7px">';
  h+=(m?'<button class="btnr" onclick="delMercancia(\''+m.id+'\')">Eliminar</button>':'<span></span>');
  h+='<button class="btna" onclick="saveMercancia(\''+(id||"")+'\')">Guardar</button></div>';
  OM(m?"Editar adquisición":"Nueva adquisición de mercancía", h);
}
function saveMercancia(id){
  var d={monto:parseFloat(ge("mc-monto").value)||0, fecha:ge("mc-fecha").value||hoy(), origen:ge("mc-origen").value.trim(), nota:ge("mc-nota").value||"", fondosExternos:ge("mc-externo").checked};
  if(id){ var i=ADB.mercancia.findIndex(function(x){return x.id===id;}); ADB.mercancia[i]=Object.assign({},ADB.mercancia[i],d); }
  else { d.id=uid(); ADB.mercancia.push(d); }
  saveAdmin(); CM(); RMercancia(); RDash();
}
function delMercancia(id){
  if(!confirm("Eliminar este registro de mercancía?")) return;
  ADB.mercancia=ADB.mercancia.filter(function(x){return x.id!==id;});
  saveAdmin(); CM(); RMercancia(); RDash();
}
function RMercancia(){
  ge("merc-total").textContent=fmt(gastosMercanciaTotal());
  var el=ge("list-mercancia"); if(!el) return;
  if(!ADB.mercancia.length){ el.innerHTML='<div class="sm mut">Sin adquisiciones registradas.</div>'; return; }
  var lista=ADB.mercancia.slice().sort(function(a,b){return (b.fecha||"").localeCompare(a.fecha||"");});
  var h='<div class="tw"><table class="tbl"><thead><tr><th>Fecha</th><th>Origen</th><th>Nota</th><th>Monto</th><th></th></tr></thead><tbody>';
  for(var i=0;i<lista.length;i++){ var m=lista[i];
    h+='<tr><td class="mut">'+m.fecha+'</td><td>'+esc(m.origen)+'</td><td class="mut sm">'+esc(m.nota||"")+(m.fondosExternos?' <span style="color:#818cf8">(externo)</span>':'')+'</td><td class="gold">'+fmt(m.monto)+'</td><td><button class="btn btns" onclick="aMercancia(\''+m.id+'\')">Editar</button></td></tr>';
  }
  h+='</tbody></table></div>';
  el.innerHTML=h;
}

// ── SUELDOS ──────────────────────────────────────────────────────────────────
function ultimoDiaMes(ym){
  var p=ym.split("-"); var d=new Date(parseInt(p[0]), parseInt(p[1]), 0); return d.getDate();
}
// Devuelve los periodos de pago de un trabajador dentro del mes ym que aun no estan pagados
function periodosPendientesSueldo(s, ym){
  var out=[];
  var hoyD=hoy();
  if(s.tipoPago==="mensual"){
    var venc=ym+"-01";
    if(venc>hoyD) return out;
    var pagado=ADB.pagosSueldos.some(function(p){return p.sueldoId===s.id&&p.periodo===ym;});
    if(!pagado) out.push({periodo:ym, fecha:venc});
  } else if(s.tipoPago==="quincenal"){
    var venc1=ym+"-15";
    var pagado1=ADB.pagosSueldos.some(function(p){return p.sueldoId===s.id&&p.periodo===ym+"-Q1";});
    if(venc1<=hoyD&&!pagado1) out.push({periodo:ym+"-Q1", fecha:venc1});
    var ultDia=ultimoDiaMes(ym);
    var venc2=ym+"-"+String(ultDia).padStart(2,"0");
    var pagado2=ADB.pagosSueldos.some(function(p){return p.sueldoId===s.id&&p.periodo===ym+"-Q2";});
    if(venc2<=hoyD&&!pagado2) out.push({periodo:ym+"-Q2", fecha:venc2});
  }
  return out;
}
function aSueldo(id){
  var s=id?ADB.sueldos.find(function(x){return x.id===id;}):null;
  var h='<div class="fld"><label class="lbl">Nombre del trabajador</label><input class="inp" id="sl-nombre" value="'+esc(s?s.nombre:"")+'"/></div>';
  h+='<div class="g2"><div class="fld"><label class="lbl">Contacto</label><input class="inp" id="sl-contacto" value="'+esc(s?s.contacto:"")+'"/></div>';
  h+='<div class="fld"><label class="lbl">Información de pago</label><input class="inp" id="sl-infopago" value="'+esc(s?s.infoPago:"")+'" placeholder="Cuenta, banco..."/></div></div>';
  h+='<div class="fld"><label class="lbl">Tipo de pago</label><select class="inp" id="sl-tipo" onchange="ge(\'sl-monto-wrap\').style.display=this.value===\'unico\'?\'none\':\'block\'">';
  h+='<option value="mensual" '+(s&&s.tipoPago==="mensual"?"selected":"")+'>Mensual (recordatorio día 1)</option>';
  h+='<option value="quincenal" '+(s&&s.tipoPago==="quincenal"?"selected":"")+'>Quincenal (día 15 y último día del mes)</option>';
  h+='<option value="unico" '+(s&&s.tipoPago==="unico"?"selected":"")+'>Pago único</option>';
  h+='</select></div>';
  h+='<div id="sl-monto-wrap" style="display:'+(s&&s.tipoPago==="unico"?"none":"block")+'"><div class="fld"><label class="lbl">Monto por periodo</label><input class="inp" type="number" id="sl-monto" value="'+(s?s.monto:"")+'"/></div></div>';
  h+='<div class="fld"><label class="lbl">Campos personalizados</label><div id="sl-custom-list"></div><button class="btn btns" type="button" onclick="addCampoCustom()">+ Agregar campo</button></div>';
  h+='<div style="display:flex;justify-content:space-between;padding-top:11px">';
  h+=(s?'<button class="btnr" onclick="delSueldo(\''+s.id+'\')">Eliminar</button>':'<span></span>');
  h+='<button class="btna" onclick="saveSueldo(\''+(id||"")+'\')">Guardar</button></div>';
  OM(s?"Editar trabajador":"Nuevo trabajador", h);
  window._camposCustom = (s&&s.camposPersonalizados)?s.camposPersonalizados.slice():[];
  renderCamposCustom();
}
function renderCamposCustom(){
  var el=ge("sl-custom-list"); if(!el) return;
  var h="";
  for(var i=0;i<window._camposCustom.length;i++){
    h+='<div class="g2" style="margin-bottom:6px"><input class="inp" placeholder="Campo (ej. INE, puesto...)" value="'+esc(window._camposCustom[i].label)+'" onchange="window._camposCustom['+i+'].label=this.value"/><div style="display:flex;gap:5px"><input class="inp" placeholder="Valor" value="'+esc(window._camposCustom[i].valor)+'" onchange="window._camposCustom['+i+'].valor=this.value"/><button class="btn btns" type="button" onclick="delCampoCustom('+i+')">X</button></div></div>';
  }
  el.innerHTML=h;
}
function addCampoCustom(){ window._camposCustom.push({label:"",valor:""}); renderCamposCustom(); }
function delCampoCustom(i){ window._camposCustom.splice(i,1); renderCamposCustom(); }
function saveSueldo(id){
  var nombre=ge("sl-nombre").value.trim(); if(!nombre){ alert("El nombre es obligatorio"); return; }
  var tipo=ge("sl-tipo").value;
  var d={nombre:nombre, contacto:ge("sl-contacto").value||"", infoPago:ge("sl-infopago").value||"", tipoPago:tipo, monto:tipo==="unico"?0:(parseFloat(ge("sl-monto").value)||0), camposPersonalizados:window._camposCustom||[]};
  if(id){ var i=ADB.sueldos.findIndex(function(x){return x.id===id;}); ADB.sueldos[i]=Object.assign({},ADB.sueldos[i],d); }
  else {
    d.id=uid(); d.fechaAlta=hoy();
    if(tipo==="unico"){
      var montoUnico=parseFloat(ge("sl-monto").value)||0;
      if(montoUnico>0) ADB.variables.push({id:uid(), categoria:"Sueldos (pago único)", monto:montoUnico, fecha:hoy(), nota:nombre, fondosExternos:false});
      d.monto=0;
    }
    ADB.sueldos.push(d);
  }
  saveAdmin(); CM(); RSueldos(); RDash();
}
function delSueldo(id){
  if(!confirm("Eliminar a este trabajador? Se borrará también su historial de pagos y bonos registrados.")) return;
  ADB.sueldos=ADB.sueldos.filter(function(x){return x.id!==id;});
  saveAdmin(); CM(); RSueldos();
}
function RSueldos(){
  var el=ge("list-sueldos"); if(!el) return;
  if(!ADB.sueldos.length){ el.innerHTML='<div class="sm mut">Sin trabajadores registrados.</div>'; return; }
  var ym=mesActual();
  var tipoLabel={mensual:"Mensual",quincenal:"Quincenal",unico:"Pago único"};
  var h="";
  for(var i=0;i<ADB.sueldos.length;i++){
    var s=ADB.sueldos[i];
    h+='<div class="card">';
    h+='<div style="display:flex;justify-content:space-between;align-items:start">';
    h+='<div><div style="font-weight:700">'+esc(s.nombre)+'</div><div class="sm mut">'+esc(s.contacto||"")+' &middot; '+tipoLabel[s.tipoPago]+(s.tipoPago!=="unico"?(" &middot; "+fmt(s.monto)):"")+'</div>'+(s.infoPago?'<div class="sm mut">'+esc(s.infoPago)+'</div>':'')+'</div>';
    h+='<button class="btn btns" onclick="aSueldo(\''+s.id+'\')">Editar</button>';
    h+='</div>';
    if(s.camposPersonalizados&&s.camposPersonalizados.length){
      h+='<div class="sm mut" style="margin-top:6px">';
      for(var j=0;j<s.camposPersonalizados.length;j++) if(s.camposPersonalizados[j].label) h+=esc(s.camposPersonalizados[j].label)+': '+esc(s.camposPersonalizados[j].valor)+' &nbsp; ';
      h+='</div>';
    }
    if(s.tipoPago!=="unico"){
      var pend=periodosPendientesSueldo(s, ym);
      var pagosDelMes=ADB.pagosSueldos.filter(function(p){return p.sueldoId===s.id&&!p.esBonoUnico&&(p.periodo||"").slice(0,7)===ym;});
      var bonosDelMes=ADB.pagosSueldos.filter(function(p){return p.sueldoId===s.id&&p.esBonoUnico&&(p.fecha||"").slice(0,7)===ym;});
      if(pagosDelMes.length){
        h+='<div style="margin-top:8px">';
        for(var j=0;j<pagosDelMes.length;j++) h+='<div class="sm" style="color:#4ade80">Pagado '+pagosDelMes[j].periodo+' el '+pagosDelMes[j].fecha+' &middot; '+fmt(pagosDelMes[j].monto)+(pagosDelMes[j].bono?(' + bono '+fmt(pagosDelMes[j].bono)):'')+'</div>';
        h+='</div>';
      }
      if(bonosDelMes.length){
        h+='<div style="margin-top:4px">';
        for(var j=0;j<bonosDelMes.length;j++) h+='<div class="sm" style="color:#f59e0b">Bono único el '+bonosDelMes[j].fecha+' &middot; '+fmt(bonosDelMes[j].monto)+'</div>';
        h+='</div>';
      }
      if(pend.length){
        h+='<div style="margin-top:9px;display:flex;gap:6px;flex-wrap:wrap">';
        for(var j=0;j<pend.length;j++) h+='<button class="btng btns" onclick="aPagoSueldo(\''+s.id+'\',\''+pend[j].periodo+'\')">Marcar pagado ('+pend[j].periodo+')</button>';
        h+='</div>';
      }
      h+='<div style="margin-top:6px"><button class="btn btns" onclick="aBonoUnico(\''+s.id+'\')">+ Bono único</button></div>';
    }
    h+='</div>';
  }
  el.innerHTML=h;
}
function aPagoSueldo(sueldoId, periodo){
  var s=ADB.sueldos.find(function(x){return x.id===sueldoId;}); if(!s) return;
  var h='<div class="g2"><div class="fld"><label class="lbl">Fecha de pago</label><input class="inp" type="date" id="ps-fecha" value="'+hoy()+'"/></div>';
  h+='<div class="fld"><label class="lbl">Monto</label><input class="inp" type="number" id="ps-monto" value="'+s.monto+'"/></div></div>';
  h+='<div class="fld"><label class="lbl">Bono (opcional)</label><input class="inp" type="number" id="ps-bono" value="0"/></div>';
  h+='<div class="fld"><label style="display:flex;align-items:center;gap:8px;cursor:pointer;font-size:13px"><input type="checkbox" id="ps-externo" style="accent-color:#c9a96e;width:15px;height:15px"/> Pagado con fondos externos (no descontar de la utilidad de este mes)</label></div>';
  h+='<div style="display:flex;justify-content:flex-end;padding-top:7px"><button class="btna" onclick="guardarPagoSueldo(\''+sueldoId+'\',\''+periodo+'\')">Guardar</button></div>';
  OM("Registrar pago · "+s.nombre, h);
}
function guardarPagoSueldo(sueldoId, periodo){
  ADB.pagosSueldos=ADB.pagosSueldos.filter(function(p){return !(p.sueldoId===sueldoId&&p.periodo===periodo);});
  ADB.pagosSueldos.push({id:uid(), sueldoId:sueldoId, periodo:periodo, fecha:ge("ps-fecha").value, monto:parseFloat(ge("ps-monto").value)||0, bono:parseFloat(ge("ps-bono").value)||0, fondosExternos:ge("ps-externo").checked});
  saveAdmin(); CM(); RSueldos(); RDash();
}
function aBonoUnico(sueldoId){
  var s=ADB.sueldos.find(function(x){return x.id===sueldoId;}); if(!s) return;
  var h='<div class="g2"><div class="fld"><label class="lbl">Fecha</label><input class="inp" type="date" id="bu-fecha" value="'+hoy()+'"/></div>';
  h+='<div class="fld"><label class="lbl">Monto del bono</label><input class="inp" type="number" id="bu-monto"/></div></div>';
  h+='<div class="sm mut" style="margin-bottom:8px">Este bono es único: no se repite mes con mes ni forma parte del pago periódico.</div>';
  h+='<div class="fld"><label style="display:flex;align-items:center;gap:8px;cursor:pointer;font-size:13px"><input type="checkbox" id="bu-externo" style="accent-color:#c9a96e;width:15px;height:15px"/> Pagado con fondos externos (no descontar de la utilidad de este mes)</label></div>';
  h+='<div style="display:flex;justify-content:flex-end;padding-top:7px"><button class="btna" onclick="guardarBonoUnico(\''+sueldoId+'\')">Guardar</button></div>';
  OM("Bono único · "+s.nombre, h);
}
function guardarBonoUnico(sueldoId){
  var monto=parseFloat(ge("bu-monto").value)||0;
  ADB.pagosSueldos.push({id:uid(), sueldoId:sueldoId, periodo:null, esBonoUnico:true, fecha:ge("bu-fecha").value, monto:monto, bono:0, fondosExternos:ge("bu-externo").checked});
  saveAdmin(); CM(); RSueldos(); RDash();
}

// Arranca la sincronizacion en segundo plano de inmediato (no espera al login),
// para que la contrasena guardada en Firestore este disponible al verificarla.
boot();
