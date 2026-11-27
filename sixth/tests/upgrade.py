# Opens a career written by version 0.1.0 or 0.2.0 with the current build, on the same origin and profile.
# python3 tests/upgrade.py <dist of the old version> <dist now>
import sys,subprocess,time,tempfile
from playwright.sync_api import sync_playwright
A,B=sys.argv[1],sys.argv[2]; PORT="5299"
def serve(d):
    p=subprocess.Popen([sys.executable,"-m","http.server",PORT,"--bind","127.0.0.1","-d",d],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL); time.sleep(1); return p
U="http://127.0.0.1:"+PORT+"/"
RAW="""()=>new Promise(r=>{const q=indexedDB.open('sixth',1);q.onsuccess=()=>{const s=q.result.transaction('careers').objectStore('careers').getAll();s.onsuccess=()=>{q.result.close();r(s.result.map(x=>({v:x.v??1,readable:!!x.meta,name:x.meta&&x.meta.name})))}}})"""
with sync_playwright() as p, tempfile.TemporaryDirectory() as prof:
    def ctx(): return p.chromium.launch_persistent_context(prof,viewport={"width":1280,"height":720},args=["--use-gl=angle","--use-angle=swiftshader","--enable-unsafe-swiftshader"])
    s=serve(A); c=ctx(); pg=c.new_page(); pg.goto(U); pg.wait_for_selector(".menu"); pg.wait_for_timeout(1500)
    pg.get_by_text("New career").first.click(); pg.wait_for_timeout(400); pg.locator("input").first.fill("Ana"); pg.get_by_text("Next:").first.click(); pg.locator("input").first.fill("Quiet Foxes")
    for _ in range(4): pg.wait_for_timeout(300); pg.get_by_text("Next:").first.click()
    pg.wait_for_timeout(300); pg.get_by_text("Open the doors").first.click(); pg.wait_for_selector(".dock",timeout=30000); pg.wait_for_timeout(800)
    # build a gym the old way, then play on with the time-lapse
    pg.get_by_text("HQ",exact=True).first.click(); pg.wait_for_timeout(600)
    for _ in range(3): pg.locator(".cont .go").click(); pg.wait_for_timeout(7500)
    pg.wait_for_timeout(1500); day=pg.locator(".date").first.inner_text(); cash=pg.locator(".kv b").last.inner_text(); print("old:",day,cash,pg.evaluate(RAW)); pg.screenshot(path="/tmp/s/up_old.png"); c.close(); s.terminate(); s.wait()
    s=serve(B); c=ctx(); pg=c.new_page(); er=[]; pg.on("pageerror",lambda e: er.append(str(e))); pg.goto(U+"?fresh"); pg.wait_for_selector(".menu .srow",timeout=120000); pg.wait_for_timeout(1500); row=pg.locator(".menu .srow .mitem").first; print("title:",row.inner_text().replace("\n"," | ")); row.click(); pg.wait_for_selector(".dock",timeout=90000); pg.wait_for_timeout(4000)
    now=lambda: pg.locator(".cal .now").first.inner_text().replace("\n",", ")+" / "+pg.locator(".cal .today").first.inner_text().replace("\n"," ")
    print("now:",now(),pg.locator(".top .kv b").last.inner_text(),pg.evaluate(RAW)); pg.screenshot(path="/tmp/s/up_new.png")
    pg.locator(".top .ib").last.click(); pg.get_by_text("Replay audit passed").wait_for(timeout=120000); print("audit:",[x.inner_text() for x in pg.locator(".modal .chip").all()]); pg.keyboard.press("Escape"); pg.wait_for_timeout(400)
    pg.locator(".dock nav button",has_text="House").click(); pg.wait_for_timeout(1500); n=pg.locator(".hp").count(); print("people in the house:",n); assert n>=5; pg.keyboard.press("Escape"); pg.wait_for_timeout(400)
    if pg.locator(".sheet").count(): pg.locator(".dock nav button",has_text="House").click()
    pg.locator(".cont .go").click(); pg.wait_for_timeout(25000); pg.screenshot(path="/tmp/s/up_next.png"); print("next day:",now() if pg.locator(".cal .now").count() else "stopped by an incident")
    pg.reload(); pg.wait_for_selector(".menu .srow",timeout=120000); pg.wait_for_timeout(1500); print("again:",pg.locator(".menu .srow .mitem").first.inner_text().replace("\n"," | "), "flag chips",pg.locator(".foot .chip.r").count()); print("errors",er); c.close(); s.terminate()
