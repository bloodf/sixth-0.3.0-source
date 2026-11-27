import sys,time
from playwright.sync_api import sync_playwright
url,out=sys.argv[1],sys.argv[2]; wait=float(sys.argv[3]) if len(sys.argv)>3 else 3; w=int(sys.argv[4]) if len(sys.argv)>4 else 1280; h=int(sys.argv[5]) if len(sys.argv)>5 else 800; js=sys.argv[6] if len(sys.argv)>6 else None
seen=set()
def once(t):
    if t not in seen and len(seen)<12:
        seen.add(t); print(t[:300])
with sync_playwright() as p:
    b=p.chromium.launch(args=["--use-gl=angle","--use-angle=swiftshader","--enable-unsafe-swiftshader","--ignore-gpu-blocklist"])
    pg=b.new_page(viewport={"width":w,"height":h}); pg.set_default_timeout(180000); pg.on("console",lambda m: once("C: "+m.text) if m.type in("error","warning") and "GPU stall" not in m.text and "PCFSoft" not in m.text else None); pg.on("pageerror",lambda e: print("ERR:",str(e)[:600]))
    pg.goto(url); pg.wait_for_timeout(wait*1000)
    if js: print(str(pg.evaluate(js))[:1500])
    try: pg.screenshot(path=out,timeout=170000)
    except Exception as e: print("shot failed",str(e)[:120])
    b.close()
