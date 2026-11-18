// SQL runs entirely in browser memory. Only an exported snapshot is persisted locally.
export function createBrowserStore(SQL, storage, {key, migrations, network, onStorageError=()=>{}}) {
 const encoded=storage.getItem(key);
 const bytes=encoded?Uint8Array.from(atob(encoded),c=>c.charCodeAt(0)):undefined;
 const sqlite=bytes?new SQL.Database(bytes):new SQL.Database();
 let timer=null,closed=false;
 sqlite.run('PRAGMA foreign_keys=ON');
 sqlite.run('CREATE TABLE IF NOT EXISTS browser_migrations(name TEXT PRIMARY KEY)');
 const query=(sql,args=[])=>{const s=sqlite.prepare(sql);try{s.bind(args);const rows=[];while(s.step())rows.push(s.getAsObject());return rows;}finally{s.free();}};
 for(const {name,sql} of migrations){
  if(query('SELECT name FROM browser_migrations WHERE name=?',[name]).length)continue;
  sqlite.run('BEGIN');try{sqlite.run(sql);sqlite.run('INSERT INTO browser_migrations VALUES(?)',[name]);sqlite.run('COMMIT');}catch(e){sqlite.run('ROLLBACK');throw e;}
 }
 sqlite.run('CREATE TABLE IF NOT EXISTS browser_photos(key TEXT PRIMARY KEY,body BLOB NOT NULL)');
 if(!query('SELECT id FROM transit_network WHERE id=1').length)sqlite.run('INSERT INTO transit_network VALUES(1,?,?)',[JSON.stringify(network),new Date().toISOString()]);
 function flush(){
  if(closed)return;
  if(timer!==null){clearTimeout(timer);timer=null;}
  try{const bytes=sqlite.export();let binary='';for(let i=0;i<bytes.length;i+=8192)binary+=String.fromCharCode(...bytes.subarray(i,i+8192));storage.setItem(key,btoa(binary));}
  catch(e){onStorageError(e);throw e;}
  finally{sqlite.run('PRAGMA foreign_keys=ON');}
 }
 const schedule=()=>{if(timer===null)timer=setTimeout(()=>{timer=null;try{flush();}catch{}},80);};
 const statement=Symbol('browser statement');
 const run=(sql,args)=>{sqlite.run(sql,args);return {meta:{changes:sqlite.getRowsModified()}};};
 const DB={
  prepare(sql){const make=args=>({[statement]:{sql,args},bind(...next){return make(next);},async first(){return query(sql,args)[0]||null;},async all(){return {results:query(sql,args)};},async run(){const out=run(sql,args);schedule();return out;}});return make([]);},
  async batch(items){sqlite.run('BEGIN');try{const out=items.map(item=>{const s=item[statement];return run(s.sql,s.args);});sqlite.run('COMMIT');schedule();return out;}catch(e){sqlite.run('ROLLBACK');throw e;}},
  close(){if(closed)return;try{flush();}finally{closed=true;sqlite.close();}}
 };
 const BUCKET={async put(key,bytes){await DB.prepare('INSERT INTO browser_photos(key,body) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET body=excluded.body').bind(key,new Uint8Array(bytes)).run();},async get(key){const row=await DB.prepare('SELECT body FROM browser_photos WHERE key=?').bind(key).first();return row?{body:row.body}:null;},async delete(key){await DB.prepare('DELETE FROM browser_photos WHERE key=?').bind(key).run();}};
 const discard=()=>{if(closed)return;if(timer!==null)clearTimeout(timer);timer=null;closed=true;sqlite.close();};
 return {DB,BUCKET,flush,discard};
}
