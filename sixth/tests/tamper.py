# Browser tests for the save vault. Needs `npx vite --port 5173` running. Each case is a fresh browser profile.
from playwright.sync_api import sync_playwright
IDB="""window.idb=(store,mode,fn)=>new Promise((res,rej)=>{const q=indexedDB.open('sixth',1);q.onsuccess=()=>{const t=q.result.transaction(store,mode);const r=fn(t.objectStore(store));t.oncomplete=()=>{q.result.close();res(r&&r.result)};t.onerror=()=>rej(t.error)}});
window.rowOf=async()=>(await idb('careers','readonly',s=>s.getAll()))[0];"""
from career import new as _new, play
def new(pg): _new(pg); play(pg,3)
ST="({s:__app.screen,why:__app.sealed,fl:__app.flagged,rk:__app.career&&__app.career.ranked,day:__app.career&&__app.career.g.day,cash:__app.career&&__app.career.g.club.cash})"
def reopen(pg): pg.reload(); pg.wait_for_selector(".menu",timeout=90000); pg.wait_for_timeout(1200); pg.locator(".menu .srow .mitem").first.click(); pg.wait_for_timeout(3500); return pg.evaluate(ST)
def reopen_sealed(pg):
    # found on the title screen, before anyone clicks anything
    pg.reload(); pg.wait_for_selector(".menu",timeout=90000); pg.wait_for_timeout(2500); return {"fl":pg.evaluate("__app.flagged"),"chip":pg.locator(".menu .chip.r").count(),"off":pg.locator(".menu .srow .mitem").first.is_disabled()},{"fl":1,"chip":1,"off":True}
def t_clean(pg): return reopen(pg),{"s":"game","fl":0,"rk":True}
def t_snap(pg): pg.evaluate("(async()=>{const r=await rowOf();r.snap.ct[1000]^=1;await idb('careers','readwrite',s=>s.put(r,r.id))})()"); return reopen(pg),{"s":"sealed","fl":1}
def t_header(pg): pg.evaluate("(async()=>{const r=await rowOf();r.box.ct[10]^=1;await idb('careers','readwrite',s=>s.put(r,r.id))})()"); return reopen_sealed(pg)
def t_header_sig(pg): pg.evaluate("(async()=>{const r=await rowOf();r.sig=r.sig.slice(0,-6)+'AAAAAA';await idb('careers','readwrite',s=>s.put(r,r.id))})()"); return reopen_sealed(pg)
def t_header_plain(pg):
    # an old-style readable header with invented numbers
    pg.evaluate("(async()=>{const r=await rowOf();await idb('careers','readwrite',s=>s.put({id:r.id,rules:1,meta:{name:'Rich',tag:'R',c1:'#fff',c2:'#fff',c3:'#fff',crest:{},mgr:'x',titles:[],day:1,cash:9e9,rep:99,saved:1},seq:3,head:'0',stateHash:'0',snapSeq:3,ranked:true,snap:r.snap,sig:r.sig},r.id))})()"); return reopen_sealed(pg)
def t_swap_log(pg): pg.evaluate("(async()=>{const k=await idb('log','readonly',s=>s.getAllKeys()),v=await idb('log','readonly',s=>s.getAll());await idb('log','readwrite',s=>{s.put(v[2],k[1]);s.put(v[1],k[2])})})()"); return reopen(pg),{"s":"sealed","fl":1}
def t_nothing_readable(pg):
    # everything the page stores, as raw bytes: no club, no manager, no player, no money, no JSON
    r=pg.evaluate("""(async()=>{const g=__app.career.g;await __app.career.flush();const dec=new TextDecoder('latin1');const out=[];const walk=(v,seen=new Set())=>{if(v==null||typeof v==='boolean'||v instanceof CryptoKey)return '';if(typeof v==='string')return v+' ';if(typeof v==='number')return v+' ';if(v instanceof ArrayBuffer)return dec.decode(new Uint8Array(v))+' ';if(ArrayBuffer.isView(v))return dec.decode(new Uint8Array(v.buffer,v.byteOffset,v.byteLength))+' ';if(seen.has(v))return '';seen.add(v);return Object.entries(v).map(([k,x])=>(Array.isArray(v)?'':k+':')+walk(x,seen)).join('')};
    let all='';let n=0;for(const s of ['keys','careers','log','flags','anchors','peers','ladder','prefs']){try{for(const v of await idb(s,'readonly',x=>x.getAll())){all+=walk(v);n++}}catch(e){}}
    for(let i=0;i<localStorage.length;i++){const k=localStorage.key(i);if(k.startsWith('sixth.a.')||k==='sixth.f')all+=localStorage[k]}
    const words=[g.club.name,g.mgr.name,'advance','genesis','attr','"day"','squads',...Object.values(g.players).filter(p=>p.team&&p.team.endsWith(':me')).map(p=>p.nick).filter(x=>x.length>4)];return {n,big:all.length>20000,found:words.filter(w=>all.includes(w))}})()"""); return r,{"found":[],"big":True}
def t_forged_epoch(pg):
    # the real keys, a perfect chain, and a record that swaps the whole state
    r=pg.evaluate("""(async()=>{const v=await import('/src/save/vault.ts'),c=await import('/src/save/crypto.ts'),h=await import('/src/core/hash.ts'),{Replay}=await import('/src/save/replay.ts');await __app.career.flush();const log=await v.readLog(__app.career.id);const g=JSON.parse(JSON.stringify(__app.career.g));g.club.cash=9e8;const rs=[];for(const x of [{t:'#epoch',state:g},{t:'#upgrade',to:3,state:g},{t:'#genesis',opts:log[0].opts,rules:3,state:g}]){const r=new Replay();let e=null;for(const a of [...log,x])e=e||r.step(JSON.parse(JSON.stringify(a)));rs.push(e)}const d=__app.career.dispatch({t:'#upgrade',to:4});return {rs,d:d.ok}})()"""); return {"all":all(r["rs"]),"d":r["d"],"r":str(r["rs"])},{"all":True,"d":False}
def t_log(pg): pg.evaluate("(async()=>{const k=await idb('log','readonly',s=>s.getAllKeys());await idb('log','readwrite',s=>s.delete(k[1]))})()"); return reopen(pg),{"s":"sealed","fl":1}
def t_rollback(pg):
    pg.evaluate("(async()=>{const o={};for(const st of ['careers','log','anchors']){o[st]=[await idb(st,'readonly',s=>s.getAllKeys()),await idb(st,'readonly',s=>s.getAll())]};window.__bk=o})()"); play(pg,2)
    pg.evaluate("(async()=>{for(const st of ['careers','log','anchors']){await idb(st,'readwrite',s=>{s.clear();__bk[st][0].forEach((k,i)=>s.put(__bk[st][1][i],k))})}})()"); return reopen(pg),{"s":"sealed","fl":1}
def t_memory(pg): pg.evaluate("__app.career.g.club.cash=999999999"); pg.evaluate("__app.career.dispatch({t:'advance'})"); pg.wait_for_timeout(1500); a=pg.evaluate(ST); pg.reload(); pg.wait_for_selector(".menu"); pg.wait_for_timeout(1500); a["fl"]=pg.evaluate("__app.flagged"); return a,{"s":"sealed","fl":1}
def t_attr(pg): pg.evaluate("Object.values(__app.career.g.players).filter(p=>p.team&&p.team.endsWith(':me')).forEach(p=>p.attr.mech=99)"); pg.evaluate("__app.career.dispatch({t:'advance'})"); pg.wait_for_timeout(1500); return pg.evaluate(ST),{"s":"sealed"}
def t_anchor(pg): pg.evaluate("Object.keys(localStorage).filter(k=>k.startsWith('sixth.a.')).forEach(k=>{const a=JSON.parse(localStorage[k]);a.seq=1;localStorage[k]=JSON.stringify(a)})"); return reopen(pg),{"s":"sealed","fl":1}
def t_anchor_wiped(pg): pg.evaluate("Object.keys(localStorage).filter(k=>k.startsWith('sixth.a.')).forEach(k=>localStorage.removeItem(k))"); return reopen(pg),{"s":"game","fl":0,"rk":False}
def t_flag_sticky(pg):
    t_snap(pg); pg.evaluate("(async()=>{localStorage.clear();await idb('flags','readwrite',s=>s.clear())})()"); pg.reload(); pg.wait_for_selector(".menu"); pg.wait_for_timeout(1500); return pg.evaluate("({s:'x',fl:__app.flagged})"),{"fl":1}
PRE="const v=await import('/src/save/vault.ts'),c=await import('/src/save/crypto.ts'),h=await import('/src/core/hash.ts');await __app.career.flush();const id=__app.career.id;const tr=async(u,p)=>{try{const r=await v.importSave(u,p);return r.ranked?'ok ranked':'ok unranked'}catch(e){return e.constructor.name+': '+e.message}};const u=await v.exportSave(id,'correct horse');"
def js(pg,body): return pg.evaluate("(async()=>{"+PRE+body+"})()")
def fl(pg): pg.reload(); pg.wait_for_selector(".menu"); pg.wait_for_timeout(1500); return pg.evaluate("__app.flagged")
def t_backup_readable(pg):
    r=js(pg,"const t=new TextDecoder('latin1').decode(u);const nl=u.indexOf(10,16);let gz='';try{await c.gunzip(u.subarray(nl+1));gz='opens as gzip'}catch(e){}return {gz,bad:[__app.career.g.club.name,__app.career.g.mgr.name,'advance','#genesis'].filter(w=>t.includes(w))}"); return r,{"gz":"","bad":[]}
def t_backup_restore(pg): r=js(pg,"await v.remove(id);return tr(u,'correct horse')"); return {"r":r,"fl":fl(pg)},{"r":"ok ranked","fl":0}
def t_backup_wrong_password(pg): r=js(pg,"return tr(u,'wrong horse')"); return {"r":r,"fl":fl(pg)},{"r":"Error: Wrong password","fl":0}
def t_backup_edit(pg): r=js(pg,"u[u.length-40]^=1;return tr(u,'correct horse')"); return {"r":r[:12],"fl":fl(pg)},{"r":"TamperError:","fl":1}
def t_backup_header(pg): r=js(pg,"const i=new TextDecoder('latin1').decode(u).indexOf('\"it\":4');u[i+5]=0x39;return tr(u,'correct horse')"); return {"r":r[:12],"fl":fl(pg)},{"r":"TamperError:","fl":1}
def t_backup_stranger(pg):
    # a broken file that claims to be yours but was made by somebody else must not get you flagged
    r=js(pg,"""const t=new TextDecoder('latin1').decode(u);const nl=u.indexOf(10,16);const hd=JSON.parse(t.slice(t.indexOf('{'),nl));hd.own='A'.repeat(32);hd.sig=hd.sig.slice(0,-6)+'AAAAAA';const H=new TextEncoder().encode('SIXTH-BACKUP-2\\n'+JSON.stringify(hd)+'\\n');const x=new Uint8Array(H.length+u.length-nl-1);x.set(H);x.set(u.subarray(nl+1),H.length);return tr(x,'correct horse')"""); return {"r":r[:6],"fl":fl(pg)},{"r":"Error:","fl":0}
def t_backup_forged(pg):
    # a cheat with the real password and the real signing key: the signature is fine, the history is not
    r=js(pg,"""const pub=await c.myId();const log=await v.readLog(id);log.splice(1,0,{t:'loan',n:5000});let head='';for(const a of log)head=h.sha256(head+h.canon(a));const body=h.canon({id,rules:3,pub,seq:log.length-1,head,stateHash:'0'.repeat(64),ranked:true,log});const te=new TextEncoder();const salt=crypto.getRandomValues(new Uint8Array(16)),iv=crypto.getRandomValues(new Uint8Array(12)),it=400000;const base=await crypto.subtle.importKey('raw',te.encode('abcdef'),'PBKDF2',false,['deriveKey']);const key=await crypto.subtle.deriveKey({name:'PBKDF2',hash:'SHA-256',salt,iterations:it},base,{name:'AES-GCM',length:256},false,['encrypt']);const ct=new Uint8Array(await crypto.subtle.encrypt({name:'AES-GCM',iv},key,await c.gzip(body)));const hd={pub,salt:c.b64(salt),iv:c.b64(iv),it,ct:h.sha256(ct),own:await c.mac('backup|'+c.b64(salt))};const H=te.encode('SIXTH-BACKUP-2\\n'+JSON.stringify({...hd,sig:await c.sign(h.canon(hd))})+'\\n');const x=new Uint8Array(H.length+ct.length);x.set(H);x.set(ct,H.length);return tr(x,'abcdef')"""); return {"r":r[:12],"fl":fl(pg)},{"r":"TamperError:","fl":1}
def t_backup_old(pg):
    js(pg,"window.__bk=u"); play(pg,2); r=pg.evaluate("""(async()=>{const v=await import('/src/save/vault.ts');return await v.importSave(__bk,'correct horse')})()"""); return {"ranked":r["ranked"],"fl":pg.evaluate("__app.flagged")},{"ranked":False,"fl":0}
def t_memory_house(pg): pg.evaluate("__app.career.g.hq.items.push({id:'i9',f:'rack',x:0,y:0,r:0})"); pg.evaluate("__app.career.dispatch({t:'advance'})"); pg.wait_for_timeout(1500); return pg.evaluate(ST),{"s":"sealed"}
def t_audit(pg):
    pg.reload(); pg.wait_for_selector(".menu",timeout=90000); pg.wait_for_timeout(1200); pg.locator(".menu .srow .mitem").first.click(); pg.wait_for_function("__app.career&&__app.career.auditState!=='pending'&&__app.career.auditState!=='running'",timeout=90000); return pg.evaluate("({a:__app.career.auditState,rk:__app.career.ranked})"),{"a":"ok","rk":True}
def t_second_tab(pg):
    p2=pg.context.new_page(); p2.goto("http://127.0.0.1:5173/"); p2.wait_for_selector(".menu"); p2.wait_for_timeout(1500); p2.locator(".menu .srow .mitem").first.click(); p2.wait_for_timeout(2500); r=p2.evaluate(ST); return {"s":r["s"],"fl":r["fl"]},{"s":"title","fl":0}
import sys
only=sys.argv[1:]
with sync_playwright() as p:
    b=p.chromium.launch(args=["--use-gl=angle","--use-angle=swiftshader","--enable-unsafe-swiftshader"]); bad=0
    for n,f in [(k,v) for k,v in list(globals().items()) if k.startswith("t_") and (not only or k in only)]:
        c=b.new_context(viewport={"width":1000,"height":640}); pg=c.new_page(); pg.add_init_script(IDB)
        try: new(pg); got,exp=f(pg); ok=all(got.get(k)==v for k,v in exp.items()); print("PASS" if ok else "FAIL",n,got if not ok else (got.get("why") or got.get("r") or "")); bad+=not ok
        except Exception as e: print("ERROR",n,str(e)[:300]); bad+=1
        c.close()
    print("failures",bad); b.close()
