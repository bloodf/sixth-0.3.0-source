import sys
from playwright.sync_api import sync_playwright
T="""(()=>{const r=v.e.r,gl=r.getContext(),px=new Uint8Array(4);v.e.paused=true;const f=()=>{r.render(v.scene,v.camera);gl.readPixels(0,0,1,1,gl.RGBA,gl.UNSIGNED_BYTE,px)};f();f();const t=performance.now();for(let i=0;i<8;i++)f();return ((performance.now()-t)/8).toFixed(1)+' ms tris '+r.info.render.triangles+' calls '+r.info.render.calls})()"""
with sync_playwright() as p:
    b=p.chromium.launch(args=["--use-gl=angle","--use-angle=swiftshader","--enable-unsafe-swiftshader","--ignore-gpu-blocklist"])
    pg=b.new_page(viewport={"width":1280,"height":800}); pg.goto(sys.argv[1]); pg.wait_for_timeout(8000)
    for name,js in [("base","1"),("base2","1"),("halfres","v.e.r.setPixelRatio(.36)"),("fullagain","v.e.r.setPixelRatio(.72)"),("nohall","v.hall.group.visible=false"),("nochars","v.chars.forEach(c=>c.root.visible=false)"),("nofx","v.fx.g.visible=false"),("nomap","v.built.group.visible=false"),("nothing","v.scene.visible=false")]:
        pg.evaluate(js); print(name,pg.evaluate(T))
    b.close()
