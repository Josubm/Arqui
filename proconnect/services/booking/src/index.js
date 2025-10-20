import express from 'express'
import cors from 'cors'
import {config} from 'dotenv'
import {getDb} from './db/dbFactory.js'
import fetch from 'node-fetch'
import {bus} from './patterns/observer/EventBus.js'
import {getNotifier} from './patterns/strategy/NotificationStrategy.js'
config()

const app=express()
app.use(cors({origin:process.env.CORS_ORIGIN?.split(',')||'*'}))
app.use(express.json({limit: '25mb'}))
const pool=getDb(process.env.DATABASE_URL)
const AUTH_URL=process.env.AUTH_URL||'http://auth-service:4001'
const PRO_URL=process.env.PRO_URL||'http://professionals-service:4002'

async function init(){
  const c=await pool.connect()
  try{
    console.log('Verificando tabla bookings...')

    // Crear tabla si no existe (sin borrar datos)
    await c.query(`CREATE TABLE IF NOT EXISTS bookings(
      id SERIAL PRIMARY KEY,
      user_id INT NOT NULL,
      user_name TEXT NOT NULL,
      user_phone TEXT,
      professional_email TEXT NOT NULL,
      professional_name TEXT NOT NULL,
      request_date DATE NOT NULL,
      address TEXT NOT NULL,
      description TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );`)

    // Asegurar columnas clave por si el esquema existía antiguo
    await c.query("ALTER TABLE bookings ADD COLUMN IF NOT EXISTS user_name TEXT")
    await c.query("ALTER TABLE bookings ADD COLUMN IF NOT EXISTS user_phone TEXT")
    await c.query("ALTER TABLE bookings ADD COLUMN IF NOT EXISTS professional_email TEXT")
    await c.query("ALTER TABLE bookings ADD COLUMN IF NOT EXISTS professional_name TEXT")
    await c.query("ALTER TABLE bookings ADD COLUMN IF NOT EXISTS request_date DATE")
    await c.query("ALTER TABLE bookings ADD COLUMN IF NOT EXISTS address TEXT")
    await c.query("ALTER TABLE bookings ADD COLUMN IF NOT EXISTS description TEXT")
    await c.query("ALTER TABLE bookings ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'pending'")
    await c.query("ALTER TABLE bookings ADD COLUMN IF NOT EXISTS created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP")

    const result = await c.query("SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'bookings' ORDER BY ordinal_position")
    console.log('Estructura de la tabla:', result.rows)
  }finally{c.release()}
}

async function getUser(req){
  const token=(req.headers['authorization']||'').replace('Bearer ','')
  if(!token)return null
  try{
    const r=await fetch(AUTH_URL+'/me',{headers:{Authorization:'Bearer '+token}})
    if(!r.ok)return null
    return await r.json()
  }catch{ return null }
}

// Crear nueva solicitud de cita
app.post('/bookings',async(req,res)=>{
  const me=await getUser(req)
  console.log('POST /bookings recibido, usuario:', me)
  if(!me)return res.status(401).json({error:'No autorizado'})
  
  // ✅ NUEVO: VALIDACIÓN DE ROLES - Solo contratadores pueden crear citas
  if(me.role==='professional'){
    return res.status(403).json({error:'Los profesionales no pueden crear solicitudes de cita'})
  }
  
  const {professionalEmail, professionalName, requestDate, address, description, userPhone}=req.body||{}
  console.log('POST /bookings body=',req.body,' user=',me&&{id:me.id,email:me.email,name:me.name})
  if(!professionalEmail||!requestDate||!address||!description){
    console.log('Faltan datos:', {professionalEmail, professionalName, requestDate, address, description, userPhone})
    return res.status(400).json({error:'Faltan datos requeridos'})
  }
  // Normalizar valores potencialmente codificados
  const professionalEmailDecoded = (()=>{ try{return decodeURIComponent(professionalEmail)}catch{return professionalEmail} })()
  const professionalNameDecoded = (()=>{ try{return decodeURIComponent(professionalName||'')}catch{return professionalName} })()
  const professionalEmailNormalized = (professionalEmailDecoded||'').trim().toLowerCase()

  // Verificar que el profesional exista
  try{
    const pr = await fetch(`${PRO_URL}/professionals/by-email?email=${encodeURIComponent(professionalEmailNormalized)}`)
    if(!pr.ok){
      console.log('Profesional no encontrado para email:', professionalEmailNormalized)
      return res.status(400).json({error:'Profesional destino no válido'})
    }
  }catch(err){
    console.log('Error verificando profesional', err?.message)
    return res.status(400).json({error:'No se pudo verificar el profesional'})
  }
  
  const c=await pool.connect()
  try{
    console.log('Intentando insertar en la base de datos...')
    const r=await c.query(
      'INSERT INTO bookings(user_id,user_name,user_phone,professional_email,professional_name,request_date,address,description) VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *',
      [me.id,me.name,userPhone||null,professionalEmailNormalized,professionalNameDecoded,requestDate,address,description]
    )
    console.log('Inserción exitosa:', r.rows[0])
    
    const payload={type:'BOOKING_CREATED',data:{booking:r.rows[0],user:me}}
    bus.emit('booking.created',payload)
    getNotifier('console').send(payload)
    res.status(201).json(r.rows[0])
  }catch(e){
    console.error('Error creating booking:', e)
    console.error('Detalles del error:', e.message, e.code, e.detail)
    res.status(500).json({error:'Error al crear la cita'})
  }finally{c.release()}
})

// Obtener citas del usuario contratador
app.get('/bookings/me',async(req,res)=>{
  const me=await getUser(req)
  if(!me)return res.status(401).json({error:'No autorizado'})
  const c=await pool.connect()
  try{
    const r=await c.query("SELECT * FROM bookings WHERE user_id=$1 AND status <> 'rejected' ORDER BY created_at DESC",[me.id])
    res.json(r.rows)
  }finally{c.release()}
})

// Obtener citas para el profesional autenticado
app.get('/bookings/professional/me', async (req, res) => {
  const me = await getUser(req)
  if (!me) return res.status(401).json({error:'No autorizado'})
  const emailPlain = (me.email||'').toLowerCase()
  console.log('GET /bookings/professional/me for', emailPlain)
  const c = await pool.connect()
  try{
    const r = await c.query("SELECT * FROM bookings WHERE LOWER(professional_email)=LOWER($1) AND status <> 'rejected' ORDER BY created_at DESC",[emailPlain])
    console.log('Rows returned:', r.rowCount)
    res.json(r.rows)
  } finally { c.release() }
})

// Obtener citas para un profesional (por email) — mantiene auth y filtro
app.get('/bookings/professional/:email',async(req,res)=>{
  const me=await getUser(req)
  if(!me)return res.status(401).json({error:'No autorizado'})
  const {email}=req.params
  const emailPlain = (()=>{ try{return decodeURIComponent(email)}catch{return email} })().toLowerCase()
  const c=await pool.connect()
  try{
    const r=await c.query("SELECT * FROM bookings WHERE LOWER(professional_email)=LOWER($1) AND status <> 'rejected' ORDER BY created_at DESC",[emailPlain])
    res.json(r.rows)
  }finally{c.release()}
})

// Actualizar estado de una cita
app.put('/bookings/:id/status',async(req,res)=>{
  const me=await getUser(req)
  if(!me)return res.status(401).json({error:'No autorizado'})
  
  const {id}=req.params
  const {status}=req.body||{}
  if(!status)return res.status(400).json({error:'Estado requerido'})
  
  const c=await pool.connect()
  try{
    if(status==='rejected'){
      const del=await c.query('DELETE FROM bookings WHERE id=$1',[id])
      if(!del.rowCount)return res.status(404).json({error:'Cita no encontrada'})
      return res.json({ok:true,deleted:true})
    }
    const r=await c.query('UPDATE bookings SET status=$1 WHERE id=$2 RETURNING *',[status,id])
    if(!r.rowCount)return res.status(404).json({error:'Cita no encontrada'})
    res.json(r.rows[0])
  }finally{c.release()}
})

// Últimas reservas (depuración/fallback)
app.get('/bookings/latest', async (req,res)=>{
  const c = await pool.connect()
  try{
    const r = await c.query('SELECT * FROM bookings ORDER BY created_at DESC LIMIT 50')
    res.json(r.rows)
  }finally{ c.release() }
})

app.listen(4003,async()=>{await init();console.log('booking-service on 4003')})
