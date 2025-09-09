import express from 'express'
import cors from 'cors'
import {Pool} from 'pg'
import {config} from 'dotenv'
import jwt from 'jsonwebtoken'
import crypto from 'crypto'
import {getDb} from './db/dbFactory.js'
config()

const app=express()
app.use(cors({origin:process.env.CORS_ORIGIN?.split(',')||'*'}))
app.use(express.json())

const pool=getDb(process.env.DATABASE_URL)

async function init(){
  const client=await pool.connect()
  try{
    await client.query(`CREATE TABLE IF NOT EXISTS users(
      id SERIAL PRIMARY KEY,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      name TEXT NOT NULL DEFAULT 'Usuario',
      role TEXT NOT NULL DEFAULT 'contractor'
    );`)
    // Asegurar columna role en esquemas previos
    await client.query("ALTER TABLE users ADD COLUMN IF NOT EXISTS role TEXT NOT NULL DEFAULT 'contractor';")
    // Normalizar filas antiguas sin role
    await client.query("UPDATE users SET role='contractor' WHERE role IS NULL;")
    const demoPass=hash('demo1234')
    await client.query(`INSERT INTO users(email,password_hash,name,role)
      VALUES($1,$2,$3,$4) ON CONFLICT (email) DO NOTHING`,['demo@proconnect.local',demoPass,'Demo','contractor'])
  }finally{client.release()}
}
function hash(p){return crypto.createHash('sha256').update(p).digest('hex')}

app.post('/register',async(req,res)=>{
  const {email,password,name,role}=req.body||{}
  if(!email||!password||!name){return res.status(400).json({error:'Faltan campos'})}
  const client=await pool.connect()
  try{
    const ph=hash(password)
    const r=await client.query('INSERT INTO users(email,password_hash,name,role) VALUES($1,$2,$3,$4) RETURNING id,email,name,role',[email,ph,name,role||'contractor'])
    res.status(201).json(r.rows[0])
  }catch(e){res.status(400).json({error:'Email ya existente'})}
  finally{client.release()}
})

app.post('/login',async(req,res)=>{
  const {email,password}=req.body||{}
  if(!email||!password){return res.status(400).json({error:'Faltan campos'})}
  const client=await pool.connect()
  try{
    const r=await client.query('SELECT * FROM users WHERE email=$1',[email])
    if(!r.rowCount){return res.status(401).json({error:'Credenciales inválidas'})}
    const u=r.rows[0]
    if(hash(password)!==u.password_hash){return res.status(401).json({error:'Credenciales inválidas'})}
    const token=jwt.sign({sub:u.id,email:u.email,name:u.name,role:u.role},process.env.JWT_SECRET||'secret',{expiresIn:'2h'})
    res.json({token,role:u.role})
  }finally{client.release()}
})

function auth(req,res,next){
  const h=req.headers['authorization']||''
  const t=h.startsWith('Bearer ')?h.slice(7):null
  if(!t){return res.status(401).json({error:'Sin token'})}
  try{req.user=jwt.verify(t,process.env.JWT_SECRET||'secret');next()}catch{res.status(401).json({error:'Token inválido'})}
}

app.get('/me',auth,async(req,res)=>{
  const client=await pool.connect()
  try{
    const r=await client.query('SELECT id,email,name,role FROM users WHERE id=$1',[req.user.sub])
    res.json(r.rows[0])
  }finally{client.release()}
})

app.listen(4001,async()=>{await init();console.log('auth-service on 4001')})
