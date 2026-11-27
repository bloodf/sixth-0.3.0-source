import sys,json
from playwright.sync_api import sync_playwright
# usage: drive.py script.py ; the script gets `pg`, `shot(name)`, `click(text)`
W,H=1280,720
def main(path,w=W,h=H,args=None):
    with sync_playwright() as p:
        b=p.chromium.launch(args=["--use-gl=angle","--use-angle=swiftshader","--enable-unsafe-swiftshader","--ignore-gpu-blocklist","--autoplay-policy=no-user-gesture-required"])
        ctx=b.new_context(viewport={"width":w,"height":h}); pg=ctx.new_page(); seen=set()
        def log(t):
            if t not in seen and len(seen)<25: seen.add(t); print(t)
        pg.on("console",lambda m: log("C:"+m.text[:300]) if m.type in("error","warning") and "GPU stall" not in m.text and "net::ERR" not in m.text else None); pg.on("pageerror",lambda e: log("ERR:"+str(e)[:500]+"\n"+(e.stack or "")[:400]))
        env={"pg":pg,"ctx":ctx,"b":b,"shot":lambda n: pg.screenshot(path=f"/tmp/s/{n}.png"),"click":lambda t,**k: pg.get_by_text(t,**k).first.click(),"wait":lambda s: pg.wait_for_timeout(int(s*1000)),"json":json}
        exec(open(path).read(),env); b.close()
if __name__=="__main__": main(sys.argv[1],int(sys.argv[2]) if len(sys.argv)>2 else W,int(sys.argv[3]) if len(sys.argv)>3 else H)
