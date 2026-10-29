(function(){
  const DB_NAME='kivu-offline-v1';
  const DB_VERSION=1;
  const STORE='sales';
  const SNAPSHOT_KEY='kivu_offline_snapshot_v1';

  function openDb(){
    return new Promise((resolve,reject)=>{
      const req=indexedDB.open(DB_NAME,DB_VERSION);
      req.onupgradeneeded=()=>{
        const db=req.result;
        if(!db.objectStoreNames.contains(STORE)){
          const s=db.createObjectStore(STORE,{keyPath:'client_ref'});
          s.createIndex('status','status',{unique:false});
          s.createIndex('shop_id','shop_id',{unique:false});
          s.createIndex('created_at','created_at',{unique:false});
        }
      };
      req.onsuccess=()=>resolve(req.result);
      req.onerror=()=>reject(req.error);
    });
  }

  async function withStore(mode,fn){
    const db=await openDb();
    return new Promise((resolve,reject)=>{
      const tx=db.transaction(STORE,mode),store=tx.objectStore(STORE);
      let result;
      try{result=fn(store);}catch(e){db.close();reject(e);return;}
      tx.oncomplete=()=>{db.close();resolve(result);};
      tx.onerror=()=>{const err=tx.error;db.close();reject(err);};
      tx.onabort=()=>{const err=tx.error;db.close();reject(err);};
    });
  }

  const requestResult=req=>new Promise((resolve,reject)=>{req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error);});

  async function enqueueSale(sale){
    const row={...sale,status:'pending',attempts:0,last_error:null,created_at:sale.created_at||new Date().toISOString()};
    await withStore('readwrite',store=>store.put(row));
    return row;
  }

  async function listSales(shopId){
    const db=await openDb();
    try{
      const tx=db.transaction(STORE,'readonly');
      const all=await requestResult(tx.objectStore(STORE).getAll());
      return (all||[]).filter(x=>!shopId||x.shop_id===shopId).sort((a,b)=>new Date(a.created_at)-new Date(b.created_at));
    }finally{db.close();}
  }

  async function updateSale(ref,patch){
    const db=await openDb();
    try{
      const tx=db.transaction(STORE,'readwrite'),store=tx.objectStore(STORE);
      const row=await requestResult(store.get(ref));
      if(!row)return null;
      const updated={...row,...patch};
      await requestResult(store.put(updated));
      return updated;
    }finally{db.close();}
  }

  async function removeSale(ref){
    await withStore('readwrite',store=>store.delete(ref));
  }

  async function countPending(shopId){
    const rows=await listSales(shopId);
    return rows.filter(x=>x.status==='pending'||x.status==='syncing'||x.status==='needs_attention').length;
  }

  function makeRef(){
    return (crypto.randomUUID?crypto.randomUUID():`${Date.now()}-${Math.random().toString(16).slice(2)}`);
  }

  function saveSnapshot(userId,snapshot){
    try{localStorage.setItem(SNAPSHOT_KEY,JSON.stringify({...snapshot,user_id:userId,saved_at:new Date().toISOString()}));}catch(_e){}
  }
  function loadSnapshot(userId){
    try{
      if(!userId)return null;
      const s=JSON.parse(localStorage.getItem(SNAPSHOT_KEY)||'null');
      if(!s||!s.profile||!s.shop)return null;
      if(s.user_id!==userId)return null;
      return s;
    }catch(_e){return null;}
  }
  function clearSnapshot(){
    try{localStorage.removeItem(SNAPSHOT_KEY);}catch(_e){}
  }

  window.KivuOffline={enqueueSale,listSales,updateSale,removeSale,countPending,countSales:countPending,makeRef,newClientRef:makeRef,saveSnapshot,loadSnapshot,clearSnapshot};
})();
