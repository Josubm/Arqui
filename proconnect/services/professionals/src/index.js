import express from 'express'
import cors from 'cors'
import {config} from 'dotenv'
import {getDb} from './db/dbFactory.js'
config()
const app=express()
app.use(cors({origin:process.env.CORS_ORIGIN?.split(',')||'*'}))
// Aumentar límite para permitir foto en data URL (hasta 25MB)
app.use(express.json({limit:'25mb'}))
const pool=getDb(process.env.DATABASE_URL)

async function init(){
  const c=await pool.connect()
  try{
    await c.query(`CREATE TABLE IF NOT EXISTS services(id SERIAL PRIMARY KEY,name TEXT NOT NULL);
                   CREATE TABLE IF NOT EXISTS professionals(
                     id SERIAL PRIMARY KEY,
                     name TEXT NOT NULL,
                     service_id INT REFERENCES services(id),
                     bio TEXT,
                     email TEXT UNIQUE,
                     photo_url TEXT,
                     verified BOOLEAN NOT NULL DEFAULT false
                   );
                   CREATE TABLE IF NOT EXISTS slots(id SERIAL PRIMARY KEY,professional_id INT REFERENCES professionals(id),slot_ts TIMESTAMP NOT NULL,UNIQUE(professional_id,slot_ts));`)
    // Asegurar columnas en migraciones previas
    await c.query("ALTER TABLE professionals ADD COLUMN IF NOT EXISTS email TEXT UNIQUE;")
    await c.query("ALTER TABLE professionals ADD COLUMN IF NOT EXISTS photo_url TEXT;")
    await c.query("ALTER TABLE professionals ADD COLUMN IF NOT EXISTS verified BOOLEAN NOT NULL DEFAULT false;")
    // Asegurar catálogo de profesiones solicitado
    const required=[
      'ingeniero','matemático','profesor','odontólogo','psicólogo','enfermero','abogado','Técnico electricista'
    ]
    const existing=await c.query('SELECT name FROM services')
    const have=new Set(existing.rows.map(r=>r.name))
    for(const name of required){
      if(!have.has(name)){
        await c.query('INSERT INTO services(name) VALUES ($1)',[name])
      }
    }
    // No crear profesionales demo: solo mostrar los reales creados por usuarios
  }finally{c.release()}
}

app.get('/services',async(_,res)=>{
  const c=await pool.connect(); try{const r=await c.query('SELECT * FROM services ORDER BY id'); res.json(r.rows)} finally{c.release()}
})

app.get('/professionals',async(req,res)=>{
  const c=await pool.connect()
  try{
    const {serviceId}=req.query
    // Solo profesionales reales: aquellos con email (creados por usuarios)
    const r=serviceId
      ? await c.query('SELECT * FROM professionals WHERE service_id=$1 AND email IS NOT NULL ORDER BY id',[serviceId])
      : await c.query('SELECT * FROM professionals WHERE email IS NOT NULL ORDER BY id')
    res.json(r.rows)
  }finally{c.release()}
})

// Crear profesional (sencillo, sin autenticación para demo)
app.post('/professionals',async(req,res)=>{
  const {name, service_id, bio, email, photo_url, verified}=req.body||{}
  if(!name||!service_id){
    return res.status(400).json({error:'Faltan campos: name, service_id'})
  }
  const c=await pool.connect()
  try{
    const r=await c.query('INSERT INTO professionals(name,service_id,bio,email,photo_url,verified) VALUES($1,$2,$3,$4,$5,COALESCE($6,false)) ON CONFLICT(email) DO UPDATE SET name=EXCLUDED.name, service_id=EXCLUDED.service_id, bio=EXCLUDED.bio, photo_url=EXCLUDED.photo_url, verified=EXCLUDED.verified RETURNING *',[name,service_id,bio||null,email||null,photo_url||null,verified===true])
    res.status(201).json(r.rows[0])
  }finally{c.release()}
})

// Obtener profesional por email
app.get('/professionals/by-email',async(req,res)=>{
  const {email}=req.query
  if(!email){return res.status(400).json({error:'Email requerido'})}
  const c=await pool.connect()
  try{
    const r=await c.query('SELECT * FROM professionals WHERE email=$1',[email])
    if(!r.rowCount){return res.status(404).json({error:'No encontrado'})}
    res.json(r.rows[0])
  }finally{c.release()}
})

// Actualizar profesional por email
app.put('/professionals/by-email',async(req,res)=>{
  const {email,name,service_id,bio,photo_url,verified}=req.body||{}
  if(!email){return res.status(400).json({error:'Email requerido'})}
  const c=await pool.connect()
  try{
    // Construir placeholders de forma segura
    let sql='UPDATE professionals SET name=COALESCE($1,name), service_id=COALESCE($2,service_id), bio=COALESCE($3,bio), photo_url=COALESCE($4,photo_url)'
    const params=[name||null,service_id||null,bio||null,photo_url||null]
    if(typeof verified==='boolean'){ sql+=', verified=$5'; params.push(verified) }
    const emailIdx=params.length+1
    sql+=` WHERE email=$${emailIdx} RETURNING *`
    params.push(email)
    const r=await c.query(sql,params)
    if(!r.rowCount){return res.status(404).json({error:'No encontrado'})}
    res.json(r.rows[0])
  }finally{c.release()}
})

app.get('/professionals/:id',async(req,res)=>{
  const c=await pool.connect()
  try{
    const r=await c.query('SELECT * FROM professionals WHERE id=$1',[req.params.id])
    if(!r.rowCount){return res.status(404).json({error:'No encontrado'})}
    res.json(r.rows[0])
  }finally{c.release()}
})

app.listen(4002,async()=>{await init();console.log('professionals-service on 4002')})
