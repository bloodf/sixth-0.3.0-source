# Draws every map in a browser and checks the bodies on screen against the walls. Needs `npx vite --port 5173`.
from playwright.sync_api import sync_playwright
# what is drawn on screen, not what is simulated: bodies of living players against walls, every frame
JS="""(()=>{const g=v.sim.grid??v.map?.grid??v.sim.map.grid;window.__r={f:0,n:0,bad:0,worst:0,ex:[]};const depth=(x,y,r)=>g.depth(x,y,r);const up=v.update.bind(v);v.update=(dt,t)=>{up(dt,t);__r.f++;v.chars.forEach((c,i)=>{const a=v.sim.actors[i];if(!a||!a.alive||!c.root.visible)return;__r.n++;const d=depth(c.root.position.x,c.root.position.z,0.34);if(d>0.05){__r.bad++;if(d>__r.worst)__r.worst=d;if(__r.ex.length<4)__r.ex.push([a.nick,c.root.position.x.toFixed(2),c.root.position.z.toFixed(2),d.toFixed(2),a.anim])}})}})()"""
with sync_playwright() as p:
    b=p.chromium.launch(args=["--use-gl=angle","--use-angle=swiftshader","--enable-unsafe-swiftshader","--ignore-gpu-blocklist"])
    for t,m in [("cs2","kasbah"),("cs2","foundry"),("cs2","quarry"),("val","halcyon"),("val","terrace"),("val","arcade"),("dota","oldvale"),("dota","ashmere"),("ow","solstice"),("ow","meridian")]:
        pg=b.new_page(viewport={"width":640,"height":400}); pg.goto(f"http://127.0.0.1:5173/tools/match.html?t={t}&m={m}&q=low&skip=200&sp=4"); pg.wait_for_function("window.v&&window.v.sim",timeout=90000); pg.wait_for_timeout(2000); pg.evaluate(JS); pg.wait_for_timeout(25000); print(m,pg.evaluate("JSON.stringify(__r)")); pg.close()
    b.close()
