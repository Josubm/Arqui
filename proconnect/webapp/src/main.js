import {api,decodeToken} from './api.js'

// Historial de rutas para migas de pan
let breadcrumbHistory=[]
let navigatingBack=false

const app=document.getElementById('app')
const logoutBtn=document.getElementById('logoutBtn')
logoutBtn.onclick=()=>{localStorage.removeItem('token');location.hash='#/login'}

function navState(){
  const logged=!!localStorage.getItem('token')
  document.getElementById('loginLink').classList.toggle('hidden',logged)
  document.getElementById('logoutBtn').classList.toggle('hidden',!logged)
}

window.addEventListener('hashchange',router)
window.addEventListener('load',()=>{navState();router()})
// Capturar clics en migas para retroceder sin duplicaciones
document.addEventListener('click',(e)=>{
  const a=e.target.closest && e.target.closest('a.crumb[data-crumb-index]')
  if(!a) return
  const idx=Number(a.getAttribute('data-crumb-index'))
  if(Number.isFinite(idx)){
    e.preventDefault()
    // Mantener historial hasta el índice clicado
    breadcrumbHistory=breadcrumbHistory.slice(0, idx+1)
    navigatingBack=true
    location.hash=a.getAttribute('href')||'#/'
  }
})

// Delegación de eventos para asegurar que los botones funcionen tras render dinámico
document.addEventListener('click', async (ev)=>{
  const t=ev.target
  // Login
  if(t.closest && t.closest('#lbtn')){
    const btn=t.closest('#lbtn'); btn.disabled=true; btn.textContent='Entrando...'
    try{
      const r=await api('/auth/login',{method:'POST',body:JSON.stringify({
        email:document.getElementById('lem')?.value,
        password:document.getElementById('lpass')?.value
      })})
      localStorage.setItem('token',r.token)
      const payload=decodeToken(); const role=payload?.role||r.role||document.getElementById('role')?.value
      location.hash = role==='professional' ? '#/dashboard-prof' : '#/dashboard-ctr'
    }catch(e){
      alert((e&&e.error)||'No se pudo iniciar sesión')
    }finally{btn.disabled=false; btn.textContent='Entrar'}
  }
  // Registro profesional
  if(t.closest && t.closest('#p_btn')){
    const btn=t.closest('#p_btn'); btn.disabled=true; btn.textContent='Creando...'
    try{
      const name=document.getElementById('p_name')?.value
      const email=document.getElementById('p_email')?.value
      const password=document.getElementById('p_pass')?.value
      const service_id=document.getElementById('p_service')?.value
      const bio=document.getElementById('p_bio')?.value
      if(!name||!email||!password||!service_id){alert('Completa los campos requeridos');return}
      await api('/auth/register',{method:'POST',body:JSON.stringify({name,email,password,role:'professional'})})
      await api('/pro/professionals',{method:'POST',body:JSON.stringify({name,service_id,bio,email})})
      alert('Cuenta profesional creada. Ahora inicia sesión.'); location.hash='#/login'
    }catch(e){alert((e&&e.error)||'No se pudo registrar profesional')}
    finally{btn.disabled=false; btn.textContent='Crear cuenta profesional'}
  }
  // Registro contratador
  if(t.closest && t.closest('#c_btn')){
    const btn=t.closest('#c_btn'); btn.disabled=true; btn.textContent='Creando...'
    try{
      const name=document.getElementById('c_name')?.value
      const email=document.getElementById('c_email')?.value
      const password=document.getElementById('c_pass')?.value
      if(!name||!email||!password){alert('Completa los campos');return}
      await api('/auth/register',{method:'POST',body:JSON.stringify({name,email,password,role:'contractor'})})
      alert('Cuenta creada. Ahora inicia sesión.'); location.hash='#/login'
    }catch(e){alert((e&&e.error)||'No se pudo registrar')}
    finally{btn.disabled=false; btn.textContent='Crear cuenta'}
  }
})

function labelFromHash(){
  const hash=(location.hash||'#/').replace(/^#/, '')
  const path=hash.split('?')[0]
  const parts=path.split('/').filter(Boolean)
  if(parts.length===0) return 'Inicio'
  const first=parts[0]
  if(first==='login') return 'Iniciar sesión'
  if(first==='register-prof') return 'Registro de Profesional'
  if(first==='register-ctr') return 'Registro de Contratador'
  if(first==='dashboard-prof') return 'Panel del Profesional'
  if(first==='dashboard-ctr') return 'Panel del Contratador'
  if(first==='servicios') return 'Servicios'
  if(first==='profesionales') return 'Profesionales'
  if(first==='profesional') return 'Detalle del Profesional'
  if(first==='solicitar-cita') return 'Solicitar Cita'
  if(first==='mis-citas') return 'Mis Citas'
  return path
}

function updateBreadcrumbHistory(){
  const currentHash=location.hash||'#/'
  const label=labelFromHash()
  // Evitar duplicados consecutivos
  const last=breadcrumbHistory[breadcrumbHistory.length-1]
  if(navigatingBack){
    // Al navegar hacia atrás, no agregamos una nueva entrada
    navigatingBack=false
    return
  }
  if(!last || last.href!==currentHash){
    breadcrumbHistory.push({label,href:currentHash})
  }
  // Limitar tamaño del historial
  if(breadcrumbHistory.length>10){
    breadcrumbHistory=breadcrumbHistory.slice(-10)
  }
}
function renderBreadcrumbs(){
  // Asegurar que al menos aparezca Inicio
  if(breadcrumbHistory.length===0){
    breadcrumbHistory=[{label:'Inicio',href:'#/'}]
  }
  const html=breadcrumbHistory.map((it,i)=>{
    if(i===breadcrumbHistory.length-1){ return `<span class=\"crumb current\">${it.label}</span>` }
    // Enlaces con índice para navegación precisa sin duplicar
    return `<a class=\"crumb\" data-crumb-index=\"${i}\" href=\"${it.href}\">${it.label}</a>`
  }).join('<span class=\"crumb-sep\">/</span>')
  // Botón atrás rápido
  const backBtn = breadcrumbHistory.length>1 ? `<button class="ghost" id="crumb_back" style="margin-left:8px">← Atrás</button>` : ''
  return `<nav class="breadcrumbs">${html}${backBtn}</nav>`
}
function page(html){
  updateBreadcrumbHistory()
  app.innerHTML=renderBreadcrumbs()+('<div class="container">'+html+'</div>')
  const back=document.getElementById('crumb_back')
  if(back){ back.onclick=()=>{ 
    if(breadcrumbHistory.length>1){ breadcrumbHistory.pop() }
    const prev=breadcrumbHistory[breadcrumbHistory.length-1]
    if(prev){ navigatingBack=true; location.hash=prev.href }
  }}
  navState()
}

async function home(){
  page(`<div class="hero">
    <h1>Conecta con Profesionales Confiables</h1>
    <p>Encuentra expertos y reserva servicios en minutos.</p>
    <button class="primary" onclick="location.hash='#/login'" style="margin-top:1rem">
      <i class="fas fa-sign-in-alt"></i> Iniciar sesión
    </button>
  </div>
  <div class="grid">
    <div class="card feature-card">
      <i class="fas fa-users"></i>
      <h3>Profesionales verificados</h3>
      <p class="small">Perfiles con información y experiencia.</p>
    </div>
    <div class="card feature-card">
      <i class="fas fa-calendar-check"></i>
      <h3>Reservas rápidas</h3>
      <p class="small">Agenda la fecha y hora que prefieras.</p>
    </div>
    <div class="card feature-card">
      <i class="fas fa-headset"></i>
      <h3>Soporte</h3>
      <p class="small">Te acompañamos en todo el proceso.</p>
    </div>
  </div>
  <div class="container" style="text-align:center; margin-top:2rem">
    <div class="small">¿Aún no tienes cuenta? Desde el login podrás registrarte como <b>Profesional</b> o como <b>Contratador</b>.</div>
  </div>`)
}

async function login(){
  page(`<div class="hero">
    <h1><i class="fas fa-sign-in-alt"></i> Iniciar Sesión</h1>
  </div>
  <div style="max-width: 420px; margin: 0 auto;">
    <div class="card">
      <label>Correo</label>
      <input id="lem" type="email" placeholder="tu@email.com">
      <label>Contraseña</label>
      <input id="lpass" type="password" placeholder="Tu contraseña">
      <div style="display:flex; gap:8px; margin-top:8px;">
        <select id="role" style="flex:1">
          <option value="contractor">Iniciar como contratador</option>
          <option value="professional">Iniciar como profesional</option>
        </select>
      </div>
      <div class="small" style="margin-top:8px;">¿No tienes cuenta? Regístrate abajo</div>
      <div style="display:flex; gap:8px; margin-top:8px;">
        <button class="ghost" id="goRegPro" style="flex:1"><i class="fas fa-user-tie"></i> Profesional</button>
        <button class="ghost" id="goRegCtr" style="flex:1"><i class="fas fa-user"></i> Contratador</button>
      </div>
      <button class="primary" id="lbtn" style="width: 100%; margin-top: 1rem;">Entrar</button>
    </div>
  </div>`)
  document.getElementById('goRegPro').onclick=()=>location.hash='#/register-prof'
  document.getElementById('goRegCtr').onclick=()=>location.hash='#/register-ctr'
}

async function registerProfessional(){
  // Obtener lista de profesiones (fallback fijo si falla)
  let services=[]
  try{services=await api('/pro/services')}catch{services=[]}
  if(!services || services.length===0){
    services=[
      {id:1,name:'ingeniero'},
      {id:2,name:'matemático'},
      {id:3,name:'profesor'},
      {id:4,name:'odontólogo'},
      {id:5,name:'psicólogo'},
      {id:6,name:'enfermero'},
      {id:7,name:'abogado'},
      {id:8,name:'Técnico electricista'}
    ]
  }
  page(`<div class="hero">
    <h1><i class="fas fa-user-tie"></i> Registro de Profesional</h1>
  </div>
  <div style="max-width: 600px; margin: 0 auto;">
    <div class="card">
      <label>Nombre completo</label>
      <input id="p_name" placeholder="Tu nombre y apellido">
      <label>Correo</label>
      <input id="p_email" type="email" placeholder="tu@email.com">
      <label>Contraseña</label>
      <input id="p_pass" type="password" placeholder="Mínimo 6 caracteres">
      <label>Profesión</label>
      <select id="p_service">${services.map(s=>`<option value="${s.id}">${s.name}</option>`).join('')}</select>
      <label>Experiencia (bio)</label>
      <input id="p_bio" placeholder="Cuéntanos tu experiencia">
      <button class="primary" id="p_btn" style="width:100%;margin-top:1rem">Crear cuenta profesional</button>
    </div>
  </div>`)
}

async function registerContractor(){
  page(`<div class="hero">
    <h1><i class="fas fa-user"></i> Registro de Contratador</h1>
  </div>
  <div style="max-width: 600px; margin: 0 auto;">
    <div class="card">
      <label>Nombre completo</label>
      <input id="c_name" placeholder="Tu nombre y apellido">
      <label>Correo</label>
      <input id="c_email" type="email" placeholder="tu@email.com">
      <label>Contraseña</label>
      <input id="c_pass" type="password" placeholder="Mínimo 6 caracteres">
      <button class="primary" id="c_btn" style="width:100%;margin-top:1rem">Crear cuenta</button>
    </div>
  </div>`)
}

async function servicios(){
  const items=await api('/pro/services')
  page(`<h1><i class="fas fa-tools"></i> Servicios</h1>
  <div class="grid">${items.map(s=>`<div class="card"><h3>${s.name}</h3><a href="#/profesionales?service=${s.id}" class="nav-link"><i class=\"fas fa-users\"></i> Ver profesionales</a></div>`).join('')}</div>`)
}

async function profesionales(){
  const q=new URLSearchParams(location.hash.split('?')[1]||'')
  const serviceId=q.get('service')
  const items=await api('/pro/professionals'+(serviceId?`?serviceId=${serviceId}`:''))
  page(`<h1><i class="fas fa-users"></i> Profesionales</h1>
  <div class="grid">${items.map(p=>`<div class="card">
    <h3>${p.name} ${p.verified?'<span class=\'small\' style=\'color:var(--success)\'>(Verificado)</span>':''}</h3>
    <p class="small">${p.bio||'Sin bio'}</p>
    <a class="nav-link" href="#/profesional/${p.id}"><i class="fas fa-id-card"></i> Ver detalle</a>
  </div>`).join('')}</div>`)
}

async function profesionalDetalle(id){
  const p=await api('/pro/professionals/'+id)
  const services=await api('/pro/services')
  const s=services.find(x=>x.id===p.service_id)
  page(`<h1><i class="fas fa-id-card"></i> ${p.name} ${p.verified?'<span class=\'small\' style=\'color:var(--success)\'>(Verificado)</span>':''}</h1>
  <div class="card">
    <div style="display:flex;gap:16px;align-items:center;">
      <img src="${p.photo_url||'https://via.placeholder.com/96x96?text=Foto'}" style="width:96px;height:96px;border-radius:12px;object-fit:cover;border:1px solid var(--border)"/>
      <div>
        <p><b>Profesión:</b> ${s?s.name:'N/D'}</p>
        <p><b>Experiencia:</b> ${p.bio||'N/D'}</p>
        <p class="small">Contactar: ${p.email||'No disponible'}</p>
      </div>
    </div>
    <div style="margin-top:16px;text-align:center;">
      <button class="primary" id="btn_negociar" style="width:100%">
        <i class="fas fa-handshake"></i> Negociar
      </button>
    </div>
  </div>`)
  
  // Manejar clic en botón negociar
  document.getElementById('btn_negociar').onclick = () => {
    location.hash = `#/solicitar-cita/${encodeURIComponent(p.email)}|${encodeURIComponent(p.name)}`
  }
}

async function dashboardProfessional(){
  const me=await api('/auth/me').catch(()=>null)
  const email=me?.email||''
  const services=(await api('/pro/services').catch(()=>[]))||[]
  let prof=null; if(email){prof=await api('/pro/professionals/by-email?email='+encodeURIComponent(email)).catch(()=>null)}
  page(`<div class="hero">
    <h1><i class="fas fa-briefcase"></i> Panel del Profesional</h1>
    <p>Gestiona tu perfil y tus citas</p>
  </div>
  <div class="grid">
    <div class="card">
      <h3><i class="fas fa-id-badge"></i> Mi Perfil</h3>
      <input type="hidden" id="pf_photo" value="${prof?.photo_url||''}">
      <div style="margin:8px 0; text-align:center;">
        <img id="pf_preview" src="${prof?.photo_url||'https://via.placeholder.com/160x160?text=Foto'}" alt="Foto" style="width:160px;height:160px;border-radius:12px;object-fit:cover;border:1px solid var(--border)"/>
      </div>
      <input type="file" id="pf_file" accept="image/*" style="width:100%">
      <label>Nombre</label>
      <input id="pf_name" value="${prof?.name||me?.name||''}">
      <label>Profesión</label>
      <select id="pf_service">${services.map(s=>`<option value="${s.id}" ${prof?.service_id===s.id?'selected':''}>${s.name}</option>`).join('')}</select>
      <label>Experiencia/Bio</label>
      <input id="pf_bio" value="${prof?.bio||''}">
      <button class="primary" id="pf_save" style="margin-top:8px;width:100%"><i class="fas fa-save"></i> Guardar</button>
      <div class="small" style="margin-top:6px">Email visible para contratadores: <b>${email}</b></div>
    </div>
    <div class="card">
      <h3><i class="fas fa-calendar"></i> Mis Citas</h3>
      <p class="small">Consulta y gestiona tus citas.</p>
      <div id="citas_lista" style="margin-top:16px;">
        <p class="small">Cargando citas...</p>
      </div>
    </div>
  </div>`)
  const save=async()=>{
    try{
      // Primero crear si no existe
      const payload={
        email,
        name:document.getElementById('pf_name').value,
        service_id:Number(document.getElementById('pf_service').value),
        bio:document.getElementById('pf_bio').value,
        photo_url:document.getElementById('pf_photo').value
      }
      try{ await api('/pro/professionals/by-email?email='+encodeURIComponent(email)) }catch{ await api('/pro/professionals',{method:'POST',body:JSON.stringify(payload)}) }
      await api('/pro/professionals/by-email',{method:'PUT',body:JSON.stringify(payload)})
      alert('Perfil actualizado')
    }catch(e){alert(e.error||'No se pudo actualizar')}
  }
  document.getElementById('pf_save').onclick=save
  const file=document.getElementById('pf_file')
  const photoInput=document.getElementById('pf_photo')
  const preview=document.getElementById('pf_preview')
  file?.addEventListener('change',()=>{
    const f=file.files?.[0]
    if(!f) return
    // Bloquear imágenes mayores a 5MB
    if(f.size>5*1024*1024){
      alert('La imagen es muy grande (>5MB). El resto del perfil se puede guardar sin imagen.')
      file.value=''
      return
    }
    const reader=new FileReader()
    reader.onload=()=>{
      const dataUrl=reader.result
      photoInput.value=dataUrl
      preview.src=dataUrl
    }
    reader.readAsDataURL(f)
  })

  // Cargar citas del profesional y renderizarlas
  try{
    const cont=document.getElementById('citas_lista')
    if(!cont) return
    const setInfo=(msg)=>{ cont.innerHTML = `<p class=\"small\">${msg}</p>` }
    setInfo('Cargando citas...')

    // Usar el email del perfil (o de la sesión) y endpoint público para evitar problemas de token
    const lookupEmail = (prof?.email || email || '').trim()

    // Manejo de clicks en aceptar/rechazar mediante delegación (funciona aunque fallen los onclick)
    cont.addEventListener('click', async (e)=>{
      const btn=e.target.closest('button')
      if(!btn) return
      const action = btn.getAttribute('data-action') || ''
      const citaId = btn.getAttribute('data-id') || btn.closest('.cita-item')?.getAttribute('data-cita-id')
      if(!citaId) return
      if(action==='reject' || /Rechazar/i.test(btn.textContent)){
        try{ await api(`/bookings/${citaId}/status`, {method:'PUT', body: JSON.stringify({status:'rejected'})}) }catch{}
        const card = btn.closest('.cita-item')
        if(card) card.remove()
        return
      }
      if(action==='accept' || /Aceptar/i.test(btn.textContent)){
        try{ await api(`/bookings/${citaId}/status`, {method:'PUT', body: JSON.stringify({status:'accepted'})}) }catch{}
        const card = btn.closest('.cita-item')
        const st=card?.querySelector('.cita-status'); if(st) st.textContent='accepted'
        return
      }
    })

    const fetchList = async ()=>{
      // Solo cargar citas del profesional autenticado desde el backend (seguro)
      try{
        const list = await api('/bookings/professional/me')
        // Filtrar IDs ocultos por seguridad (rechazados ya no deberían venir)
        const hidden = new Set(JSON.parse(localStorage.getItem('hiddenBookings')||'[]'))
        return (Array.isArray(list)?list:[]).filter(b=>!hidden.has(String(b.id)))
      }catch{ return [] }
    }

    const render = (list)=>{
      if(!list || list.length===0){
        cont.innerHTML = `<p class=\"small\">No tienes solicitudes para <b>${lookupEmail||'tu email'}</b>.</p>`
      }else{
        cont.innerHTML = list.map(c=>`
          <div class=\"card cita-item\" data-cita-id=\"${c.id}\" style=\"margin:0 0 12px 0\">
            <h3><i class=\"fas fa-user\"></i> ${c.user_name}</h3>
            <p><b>Teléfono:</b> ${c.user_phone||'N/D'}</p>
            <p><b>Fecha:</b> ${c.request_date}</p>
            <p><b>Dirección:</b> ${c.address}</p>
            <p><b>Trabajo:</b> ${c.description}</p>
            <p><b>Estado:</b> <span class=\"cita-status\">${c.status === 'accepted' ? 'Aceptado' : c.status === 'rejected' ? 'Rechazado' : 'Pendiente'}</span></p>
            <div style=\"display:flex;gap:8px;margin-top:8px;\">
              <button class=\"primary\" data-action=\"accept\" data-id=\"${c.id}\" onclick=\"window.aceptarCita(${c.id})\"><i class=\"fas fa-check\"></i> Aceptar</button>
              <button class=\"ghost\" data-action=\"reject\" data-id=\"${c.id}\" onclick=\"window.rechazarCita(${c.id})\"><i class=\"fas fa-times\"></i> Rechazar</button>
            </div>
          </div>
        `).join('')
      }
      cont.insertAdjacentHTML('beforeend', `<div style=\"margin-top:8px\"><button class=\"ghost\" id=\"reload_citas\"><i class=\"fas fa-rotate\"></i> Recargar</button></div>`)
      document.getElementById('reload_citas')?.addEventListener('click', async ()=>{ setInfo('Cargando...'); render(await fetchList()) })
    }

    // Exponer recarga para que las acciones puedan refrescar después de PUT
    window.reloadCitas = async ()=>{ setInfo('Actualizando...'); const l=await fetchList(); render(l) }

    render(await fetchList())
  }catch(e){
    const cont=document.getElementById('citas_lista')
    if(cont){
      cont.innerHTML = `<p class=\"small\">No se pudieron cargar las citas. <button class=\"ghost\" id=\"retry_citas\">Reintentar</button></p>`
      document.getElementById('retry_citas')?.addEventListener('click',()=>location.reload())
    }
    console.error('Error cargando citas del profesional', e)
  }
}

async function solicitarCita(professionalEmail, professionalName){
  page(`<div class="hero">
    <h1><i class="fas fa-calendar-plus"></i> Solicitar Cita</h1>
    <p>Solicita una cita con ${professionalName}</p>
  </div>
  <div style="max-width: 600px; margin: 0 auto;">
    <div class="card">
      <label>Número de teléfono</label>
      <input id="request_phone" type="tel" inputmode="tel" placeholder="Tu número de contacto" required>
      <label>Fecha de solicitud</label>
      <input type="date" id="request_date" required>
      <label>Dirección</label>
      <input id="request_address" placeholder="Dirección donde necesitas el servicio" required>
      <label>Descripción del trabajo</label>
      <textarea id="request_description" placeholder="Describe detalladamente lo que necesitas..." rows="4" style="width:100%;resize:vertical" required></textarea>
      <button class="primary" id="btn_solicitar" style="width:100%;margin-top:1rem">
        <i class="fas fa-paper-plane"></i> Enviar Solicitud
      </button>
      <a href="#/profesional/${professionalEmail}" class="nav-link" style="display:block;text-align:center;margin-top:1rem">
        <i class="fas fa-arrow-left"></i> Volver al perfil
      </a>
    </div>
  </div>`)
  
  // Establecer fecha mínima como hoy
  const today = new Date().toISOString().split('T')[0]
  document.getElementById('request_date').min = today
  document.getElementById('request_date').value = today
  
  // Manejar envío de solicitud
  document.getElementById('btn_solicitar').onclick = async () => {
    try {
      const payload = {
        professionalEmail,
        professionalName,
        requestDate: document.getElementById('request_date').value,
        address: document.getElementById('request_address').value,
        description: document.getElementById('request_description').value,
        userPhone: (document.getElementById('request_phone')?.value||'').trim()
      }
      
      if (!payload.userPhone) {
        alert('Por favor ingresa tu número de teléfono')
        return
      }
      if (!payload.description.trim()) {
        alert('Por favor describe tu trabajo')
        return
      }
      
      await api('/bookings', {method: 'POST', body: JSON.stringify(payload)})
      alert('¡Solicitud enviada exitosamente!')
      location.hash = '#/dashboard-ctr'
    } catch (e) {
      alert(e.error || 'Error al enviar la solicitud')
    }
  }
}

async function misCitas(){
  const me = await api('/auth/me').catch(() => null)
  if (!me) return
  
  const citas = await api('/bookings/me').catch(() => [])
  page(`<div class="hero">
    <h1><i class="fas fa-calendar-check"></i> Mis Citas</h1>
    <p>Consulta el estado de tus solicitudes</p>
  </div>
  <div class="grid">
    ${citas.length === 0 ? 
      '<div class="card"><p class="small">No tienes citas programadas</p></div>' :
      citas.map(cita => `
        <div class="card">
          <h3><i class="fas fa-user-tie"></i> ${cita.professional_name}</h3>
          <p><b>Fecha:</b> ${cita.request_date}</p>
          <p><b>Dirección:</b> ${cita.address}</p>
          <p><b>Trabajo:</b> ${cita.description}</p>
          <p><b>Estado:</b> <span class="badge ${cita.status === 'pending' ? 'warning' : cita.status === 'accepted' ? 'success' : 'error'}">${cita.status === 'pending' ? 'Pendiente' : cita.status === 'accepted' ? 'Aceptada' : 'Rechazada'}</span></p>
        </div>
      `).join('')
    }
  </div>`)
}

async function dashboardContractor(){
  page(`<div class="hero">
    <h1><i class="fas fa-user"></i> Panel del Contratador</h1>
    <p>Encuentra profesionales y gestiona tus reservas</p>
  </div>
  <div class="grid">
    <div class="card">
      <h3><i class="fas fa-search"></i> Buscar Profesionales</h3>
      <p class="small">Explora por profesión y revisa la información de cada profesional.</p>
      <a class="nav-link" href="#/servicios"><i class="fas fa-tools"></i> Ir a Servicios</a>
    </div>
    <div class="card">
      <h3><i class="fas fa-calendar-check"></i> Mis Citas</h3>
      <p class="small">Consulta tu agenda de reservas.</p>
      <a class="nav-link" href="#/mis-citas"><i class="fas fa-calendar"></i> Ver citas</a>
    </div>
  </div>`)
}

// (Funciones de negociación eliminadas para volver al estado anterior)

// Eliminar implementación anterior que recargaba la página
window.cambiarEstado = async (citaId, nuevoEstado) => {
  try {
    await api(`/bookings/${citaId}/status`, {method: 'PUT', body: JSON.stringify({status: nuevoEstado})})
    if(nuevoEstado==='rejected'){
      const el=document.querySelector(`.cita-item[data-cita-id="${citaId}"]`)
      el?.parentNode?.removeChild(el)
    }else{
      const el=document.querySelector(`.cita-item[data-cita-id="${citaId}"] .cita-status`)
      if(el) el.textContent='accepted'
    }
  } catch (e) {
    // silencioso
  }
}

// Funciones globales explícitas
window.rechazarCita = async (id) => {
  try{ await api(`/bookings/${id}/status`, {method:'PUT', body: JSON.stringify({status:'rejected'})}) }catch{}
  // Persistir ID como oculto para no volver a mostrarlo
  const key='hiddenBookings'
  const arr=JSON.parse(localStorage.getItem(key)||'[]')
  if(!arr.includes(String(id))) arr.push(String(id))
  localStorage.setItem(key, JSON.stringify(arr))
  const el=document.querySelector(`.cita-item[data-cita-id="${id}"]`)
  if(el){ el.parentNode?.removeChild(el) } else if(window.reloadCitas){ window.reloadCitas() }
}
window.aceptarCita = async (id) => {
  try{ await api(`/bookings/${id}/status`, {method:'PUT', body: JSON.stringify({status:'accepted'})}) }catch{}
  const st=document.querySelector(`.cita-item[data-cita-id="${id}"] .cita-status`)
  if(st){ st.textContent='accepted' } else if(window.reloadCitas){ window.reloadCitas() }
}

async function router(){
  const r=location.hash||'#/' 
  if(r.startsWith('#/login'))return login()
  if(r.startsWith('#/dashboard-prof'))return dashboardProfessional()
  if(r.startsWith('#/dashboard-ctr'))return dashboardContractor()
  if(r.startsWith('#/register-prof'))return registerProfessional()
  if(r.startsWith('#/register-ctr'))return registerContractor()
  if(r.startsWith('#/servicios'))return servicios()
  if(r.startsWith('#/profesionales'))return profesionales()
  if(r.startsWith('#/profesional/'))return profesionalDetalle(r.split('/').pop())
  if(r.startsWith('#/solicitar-cita/')){const parts=r.split('/')[2].split('|');return solicitarCita(parts[0],parts[1])}
  if(r.startsWith('#/mis-citas'))return misCitas()
  return home()
}
