# Two managers in two browser profiles: discovery, verified open match in lockstep, signed ladder record, private league.
import sys
from playwright.sync_api import sync_playwright
from career import new as _new, play
def new(pg,name,color): _new(pg,name,name+' Club',color); play(pg,2)
def online(pg): pg.locator(".dock nav button",has_text="Online").click(); pg.wait_for_timeout(500)
ST="(()=>{const s=__app.session,d=s&&s.duel;return {peers:s?[...s.peers.values()].map(p=>[p.card&&p.card.name,p.ok,p.clean,p.why]):[],duel:d&&{st:d.stage,msg:d.msg,pr:+d.progress.toFixed(2)},scr:__app.screen,err:s&&s.ch.error}})()"
MODE=sys.argv[1] if len(sys.argv)>1 else "room"
with sync_playwright() as p:
    b=p.chromium.launch(args=["--use-gl=angle","--use-angle=swiftshader","--enable-unsafe-swiftshader","--disable-features=WebRtcHideLocalIpsWithMdns"]); pgs=[]
    for n,c in (("Ana",5),("Bo",10)):
        ctx=b.new_context(viewport={"width":1100,"height":680}); pg=ctx.new_page(); pg.add_init_script("localStorage.setItem('sixth.net',JSON.stringify({relays:['ws://127.0.0.1:7777'],turn:[],loopback:true}))"); pg.on("pageerror",lambda e,n=n: print(n,"ERR",str(e)[:300])); new(pg,n,c); pgs.append(pg)
    A,B=pgs
    for x in pgs: online(x)
    if MODE=="room":
        for x in pgs: x.get_by_text("Enter room").click()
    else:
        for x in pgs: x.get_by_text("Direct code").click(); x.wait_for_timeout(300)
        A.get_by_text("1. I host").click(); A.wait_for_function("document.querySelector('textarea')&&document.querySelector('textarea').value.startsWith('SX1-')",timeout=15000); code=A.locator("textarea").first.input_value()
        B.get_by_text("1. I answer").click(); B.locator("textarea").first.fill(code); B.get_by_text("Make an answer").click(); B.wait_for_function("document.querySelectorAll('textarea').length>1&&document.querySelectorAll('textarea')[1].value.startsWith('SX2-')",timeout=15000); ans=B.locator("textarea").nth(1).input_value()
        A.locator("textarea").nth(1).fill(ans); A.locator("button",has_text="Connect").last.click(); A.wait_for_timeout(2500)
        for x in pgs: x.get_by_text("Lobby",exact=True).click()
    for i in range(40):
        A.wait_for_timeout(1000)
        if A.evaluate("[...(__app.session?.peers.values()??[])].some(p=>p.ok)") and B.evaluate("[...(__app.session?.peers.values()??[])].some(p=>p.ok)"): break
    print("after",i,"s",A.evaluate(ST)); A.screenshot(path="/tmp/s/p1.png")
    if len(sys.argv)>2 and sys.argv[2]=="cheat":
        B.evaluate("""(async()=>{const h=await import('/src/core/hash.ts');const s=__app.session,o=s.ch.send.bind(s.ch);s.ch.send=(t,d,to)=>{if(t==='squad'){d=JSON.parse(JSON.stringify(d));d.team.players.forEach(p=>{p.st.mech=0.97;p.st.react=0.97});d.commit=h.sha256(s.duel.myNonce+h.canon(d.team))}o(t,d,to)}})()""")
        A.get_by_text("Challenge, CS2").first.click(); B.wait_for_selector("text=challenge you",timeout=8000); B.get_by_text("Accept").first.click(); A.wait_for_timeout(12000); print("cheat ->",A.evaluate(ST)); assert A.evaluate(ST)["duel"]["st"]=="failed"; A.screenshot(path="/tmp/s/p8.png"); b.close(); sys.exit()
    A.get_by_text("Challenge, CS2").first.click(); B.wait_for_selector("text=challenge you",timeout=8000); B.screenshot(path="/tmp/s/p2.png"); B.get_by_text("Accept").first.click()
    for i in range(60):
        A.wait_for_timeout(500)
        if i%6==0: print(A.evaluate(ST)["duel"],B.evaluate(ST)["duel"])
        if A.evaluate("__app.screen")=="match" and B.evaluate("__app.screen")=="match": break
    A.wait_for_timeout(6000); A.locator(".ob").nth(1).click(); A.wait_for_timeout(300); A.screenshot(path="/tmp/s/p3.png"); print("ticks",A.evaluate("__app.match.sim.tick"),B.evaluate("__app.match.sim.tick"))
    for x in pgs: x.evaluate("__app.match.speed=400")
    for i in range(240):
        A.wait_for_timeout(1000)
        if i%20==0: print(A.evaluate("__app.match&&[__app.match.sim.tick,__app.match.sim.score.join('-')]"),B.evaluate("__app.match&&[__app.match.sim.tick,__app.match.sim.score.join('-')]"))
        if A.evaluate(ST)["duel"]["st"]=="done" and B.evaluate(ST)["duel"]["st"]=="done": break
    A.wait_for_timeout(1500); print(A.evaluate(ST)["duel"],B.evaluate(ST)["duel"]); print("hash equal",A.evaluate("__app.match.sim.result().hash")==B.evaluate("__app.match.sim.result().hash"),"orders",A.evaluate("JSON.stringify(__app.session.duel.orders)")); A.screenshot(path="/tmp/s/p4.png")
    for x in pgs: x.get_by_text("Leave").last.click(); x.wait_for_timeout(800); 
    for x in pgs:
        if not x.locator(".sheet").count(): online(x)
        x.get_by_text("World ladder").click(); x.wait_for_timeout(500)
    A.screenshot(path="/tmp/s/p5.png"); print("ladder rows",A.locator("tbody tr").count(),B.locator("tbody tr").count())
    # private league
    for x in pgs: x.get_by_text("Private leagues").click(); x.wait_for_timeout(300)
    A.get_by_placeholder("League name").fill("Sunday Five"); A.get_by_text("Create for CS2").click(); A.wait_for_timeout(1200); code=A.evaluate("document.querySelector('.chip.sel').textContent"); print("league",code)
    B.get_by_placeholder("ABCD-1234").fill(code); B.get_by_text("Join league").click(); B.wait_for_timeout(4000); A.wait_for_timeout(2500); A.screenshot(path="/tmp/s/p6.png"); A.get_by_text("Start with 2 clubs").click(); A.wait_for_timeout(2500)
    for x in pgs: x.get_by_text("Lock in my squad").click(); x.wait_for_timeout(800)
    for i in range(20):
        A.wait_for_timeout(1500)
        if A.get_by_text("win the league").count() and B.get_by_text("win the league").count(): break
    A.screenshot(path="/tmp/s/p7.png"); print("champion shown",A.get_by_text("win the league").count(),B.get_by_text("win the league").count()); print("tables equal", A.locator("tbody").first.inner_text()==B.locator("tbody").first.inner_text()); b.close()
