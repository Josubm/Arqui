const express=require('express')
const app=express()
app.use(express.static('./'))
app.listen(5173,()=>console.log('webapp on 5173'))
