export async function api(path,opts={}){
  const token=localStorage.getItem('token')
  const headers={'Content-Type':'application/json',...(opts.headers||{})}
  if(token)headers['Authorization']='Bearer '+token
  const controller = new AbortController()
  const timeoutId = setTimeout(()=>controller.abort('timeout'), 6000)
  try{
    const r=await fetch(window.API_URL+path,{...opts,headers,signal:controller.signal})
    if(!r.ok){throw await r.json().catch(()=>({error:'error'}))}
    return r.json()
  }finally{
    clearTimeout(timeoutId)
  }
}

export function decodeToken(){
  const t=localStorage.getItem('token')
  if(!t) return null
  try{
    const p=t.split('.')[1]
    return JSON.parse(atob(p))
  }catch{return null}
}