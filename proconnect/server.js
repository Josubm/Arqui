import express from 'express'
import cors from 'cors'
import {config} from 'dotenv'
import {createProxyMiddleware} from 'http-proxy-middleware'
config()

const app=express()
app.use(cors({origin:process.env.CORS_ORIGIN?.split(',')||'*'}))

// Middleware para logging
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.path}`)
  next()
})

// No parseamos JSON aquí para no interferir con el proxy de cuerpos hacia los servicios
app.use('/api/auth',createProxyMiddleware({target:process.env.AUTH_URL,changeOrigin:true,pathRewrite:{'^/api/auth':''}}))
app.use('/api/pro',createProxyMiddleware({target:process.env.PRO_URL,changeOrigin:true,pathRewrite:{'^/api/pro':''}}))
app.use('/api/bookings',createProxyMiddleware({target:process.env.BOOK_URL,changeOrigin:true,pathRewrite:{'^/api/bookings':'/bookings'}}))

app.get('/api/health',(_,res)=>res.json({ok:true}))
app.listen(8080,()=>console.log('Gateway on 8080'))
