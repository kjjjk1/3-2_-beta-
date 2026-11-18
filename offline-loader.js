(()=>{
 const base=new URL('.',document.currentScript.src),nativeFetch=window.fetch.bind(window);
 let resetting=false;
 window.DT_STATIC_DEMO=true;
 const warning=message=>{let el=document.getElementById('browserStorageWarning');if(!el){el=document.createElement('p');el.id='browserStorageWarning';el.setAttribute('role','alert');el.style.cssText='position:fixed;top:0;left:0;right:0;z-index:99999;background:#fff1db;color:#713800;padding:14px;margin:0;text-align:center';document.body.prepend(el);}el.textContent=message;};
 const ready=Promise.all([
  window.initSqlJs({locateFile:name=>new URL('vendor/'+name,base).href}),
  import(new URL('browser-store.mjs',base).href),
  import(new URL('offline-worker.mjs',base).href),
  nativeFetch(new URL('browser-data.json',base)).then(r=>{if(!r.ok)throw Error('Local data unavailable');return r.json();})
 ]).then(([SQL,store,{default:worker},data])=>{
  let storage;try{const k='dt-static-storage-probe';localStorage.setItem(k,'1');localStorage.removeItem(k);storage=localStorage;}catch{const memory=new Map();storage={getItem:k=>memory.get(k)||null,setItem:(k,v)=>memory.set(k,v)};warning('브라우저 저장이 제한돼 이번 방문에서만 기록을 유지합니다.');}
  const local=store.createBrowserStore(SQL,storage,{key:'dt-sniper-static-db-v1:'+base.pathname,...data,onStorageError:()=>warning('브라우저 저장 공간이 부족합니다. 현재 기록은 유지되지만 재접속 저장은 보장되지 않습니다.')});
  const env={DB:local.DB,BUCKET:local.BUCKET,FETCH:async()=>{throw Error('Route API disabled in browser demo');}};
  window.addEventListener('pagehide',()=>{if(!resetting)try{local.flush();}catch{}});
  document.addEventListener('visibilitychange',()=>{if(!resetting&&document.visibilityState==='hidden')try{local.flush();}catch{}});
  window.DTBrowserStore={flush:local.flush,discard:local.discard};
  return {worker,env};
 });
 ready.catch(()=>warning('체험 데이터를 준비하지 못했습니다. 페이지를 새로고침해주세요.'));
 document.getElementById('clearBrowserDemo')?.addEventListener('click',()=>{
  if(!confirm('이 브라우저에 저장된 체험 모임과 이동 기록을 지우고 처음부터 시작할까요?'))return;
  resetting=true;window.DTBrowserStore?.discard();
  try{for(const key of Object.keys(localStorage))if(key.startsWith('dt-sniper-static-')||key.startsWith('dtsniper-static-'))localStorage.removeItem(key);}catch{}
  location.assign(base.href+'?demo=1');
 });
 window.fetch=async(input,init)=>{
  const incoming=input instanceof Request?new Request(input,init):new Request(new URL(String(input),location.href),init);
  const url=new URL(incoming.url);
  const isLocal=url.origin===location.origin&&(url.pathname.startsWith('/api/')||url.pathname.startsWith(base.pathname+'api/'));
  if(!isLocal)return nativeFetch(input,init);
  try{
   const {worker,env}=await ready;
   const path=url.pathname.startsWith('/api/')?url.pathname:url.pathname.slice(base.pathname.length-1);
   let body=['GET','HEAD'].includes(incoming.method)?undefined:await incoming.text();
   if(path.endsWith('/analysis')&&body){const data=JSON.parse(body);if(data.useApi!==false)return Response.json({error:'브라우저 체험판은 자체 추정만 지원합니다. 경로 API는 사용하지 않습니다.'},{status:400});}
   const request=new Request(location.origin+path+url.search,{method:incoming.method,headers:incoming.headers,body});
   return await worker.fetch(request,env);
  }catch{return Response.json({error:'브라우저 체험 데이터를 처리하지 못했습니다. 새로고침하거나 다른 브라우저에서 확인해주세요.'},{status:503});}
 };
})();
