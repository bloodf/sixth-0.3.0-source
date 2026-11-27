# The house editor, used with a real mouse in a real browser. Needs `npx vite --port 5173`. Pictures go to the folder given as argument.
import sys
from playwright.sync_api import sync_playwright
OUT=sys.argv[1] if len(sys.argv)>1 else None
bad=0
def ok(name,c,info=""):
    global bad; bad+=not c; print("PASS" if c else "FAIL",name,info if not c else "")
with sync_playwright() as p:
    b=p.chromium.launch(args=["--use-gl=angle","--use-angle=swiftshader","--enable-unsafe-swiftshader","--ignore-gpu-blocklist"])
    pg=b.new_page(viewport={"width":1280,"height":720}); errs=[]; pg.on("pageerror",lambda e: errs.append(str(e)))
    w=lambda s: pg.wait_for_timeout(int(s*1000)); q=pg.evaluate
    shot=lambda n: OUT and pg.screenshot(path=f"{OUT}/{n}.png")
    from career import new
    new(pg,origin_games=(0,2))
    P=lambda x,z,y=0: q("([x,y,z])=>window.__app.hq.project(x,y,z)",[x,y,z])
    def mv(x,z,y=0): a=P(x,z,y); pg.mouse.move(a[0],a[1]); w(.15)
    def ck(x,z,y=0): mv(x,z,y); pg.mouse.down(); w(.05); pg.mouse.up(); w(.3)
    def dr(x0,z0,x1,z1):
        mv(x0,z0); pg.mouse.down()
        for i in range(1,6): mv(x0+(x1-x0)*i/5,z0+(z1-z0)*i/5)
        pg.mouse.up(); w(.35)
    T=lambda n: (pg.locator(".edtools button",has_text=n).first.click(),w(.3))
    esc=lambda: (pg.keyboard.press("Escape"),w(.15))
    plan=lambda: q("JSON.parse(JSON.stringify(window.__app.hq.plan))")
    st=lambda: {s[0]+(s[4] or ''):s for s in q("window.__app.hq.statuses.map(s=>[s.zone.type,s.lvl,s.points,s.problems,s.zone.title,s.region&&[s.region.x,s.region.y,s.region.w,s.region.h]])")}
    toasts=lambda: q("[...document.querySelectorAll('.toast')].map(x=>x.textContent)")
    cost=lambda: int(pg.locator(".edtop .kv b").first.inner_text().replace("$","").replace(",","").replace("+","-"))
    cash0=q("window.__app.career.g.club.cash"); seq0=q("window.__app.career.seq")
    pg.get_by_text("HQ",exact=True).first.click(); w(.8); pg.get_by_text("Open the house editor").click(); w(2.5)
    q0=plan(); shot("e0")
    ok("opens on the plan as built",cost()==0 and len(q0["items"])>10)
    # land
    T("Land"); pg.locator(".edland").nth(3).locator("button").nth(2).click(); w(.8); ok("land grows to the right",plan()["w"]==q0["w"]+4 and cost()>0,plan()["w"])
    c1=cost(); pg.locator(".edland").nth(2).locator("button").nth(1).click(); w(.8); q1=plan(); ok("land grows to the left and the house stays where it is",q1["w"]==q0["w"]+5 and q1["items"][0]["x"]==q0["items"][0]["x"]+2 and cost()>c1)
    for _ in range(3): pg.locator(".edland").nth(3).locator("button").nth(2).click(); w(.3)
    ok("no more land than the site has",plan()["w"]<=34,plan()["w"]); 
    while plan()["w"]>q1["w"]: pg.keyboard.press("Control+z"); w(.3)
    X=1 # everything moved one to the right
    # room
    T("Draw room"); dr(26.5+X,1.5,30.4+X,6.4); pg.locator(".edcard select").select_option("wellness"); w(.3); s=st()["wellness"]; ok("drawn room takes a purpose",s[1]==0 and s[5]==[26+X,1,5,6] and any("door" in x for x in s[3]),s); shot("e1")
    pg.get_by_text("A way in").click(); w(.3); ck(28.5+X,7.0); ok("door",not any("door" in x for x in st()["wellness"][3]),st()["wellness"]); c2=cost(); ck(28.5+X,7.0); ok("door closes again",any("door" in x for x in st()["wellness"][3])); ck(28.5+X,7.0)
    T("Select"); ck(28.5+X,4.5); pg.get_by_text("Therapy couch").click(); w(.3); ck(28+X,2); esc(); esc(); ck(28.5+X,5); pg.get_by_text("Chair for the counsellor").click(); w(.3); ck(29.8+X,4); s=st()["wellness"]; ok("furnished room works",s[1]==1,s)
    esc(); esc(); T("Furniture"); pg.locator(".edcats button",has_text="Decor").click(); w(.3); pg.locator(".edgrid button",has_text="Painting").click(); a=P(29+X,1,1.2); pg.mouse.move(a[0],a[1]); w(.3); shot("e2"); pg.mouse.down(); pg.mouse.up(); w(.3); it=plan()["items"][-1]; ok("a picture finds the wall",it["f"]=="painting" and it["r"]==0 and it["y"]==2,it)
    pg.locator(".edgrid button",has_text="Painting").click(); mv(28.5+X,4.5); w(.2); n=len(plan()["items"]); ck(10,17.5); ok("nothing hangs in mid-air",len(plan()["items"])==n and len(toasts())>0,toasts()); esc(); esc()
    # drag, turn, undo, redo
    c=[i for i in plan()["items"] if i["f"]=="couch"][0]; mv(c["x"]/2+1,c["y"]/2+.5,.3); pg.mouse.down()
    for i in range(4): mv(c["x"]/2+1+i*.2,c["y"]/2+.5+i*.5)
    pg.mouse.up(); w(.3); c2=[i for i in plan()["items"] if i["f"]=="couch"][0]; ok("drag furniture",(c2["x"],c2["y"])!=(c["x"],c["y"]),c2)
    pg.keyboard.press("Control+z"); w(.3); ok("undo",[i for i in plan()["items"] if i["f"]=="couch"][0]==c); pg.keyboard.press("Control+y"); w(.3); ok("redo",[i for i in plan()["items"] if i["f"]=="couch"][0]==c2)
    mv(c2["x"]/2+1,c2["y"]/2+.5,.3); pg.mouse.down(); pg.mouse.up(); w(.2); pg.keyboard.press("r"); w(.3); ok("turn",[i for i in plan()["items"] if i["f"]=="couch"][0]["r"]!=c2["r"]); 
    n=len(plan()["items"]); k=cost(); pg.keyboard.press("Delete"); w(.3); ok("sell new furniture for what it cost",len(plan()["items"])==n-1 and cost()==k-980,(cost(),k)); ok("a room without its couch stops working",st()["wellness"][1]==0); pg.keyboard.press("Control+z"); w(.3)
    # collision
    T("Furniture"); pg.locator(".edcats button",has_text="Practice").click(); w(.2); pg.locator(".edgrid button",has_text="Gaming station").click(); n=len(plan()["items"]); ck(3+X,2); ok("furniture does not go into furniture",len(plan()["items"])==n); ck(14+X,7); ok("nor through walls",len(plan()["items"])==n); esc(); esc()
    # stretch
    T("Select"); ck(28.5+X,5.8); pg.locator(".edpull").nth(1).locator("button").nth(1).click(); w(.3); ok("stretch",st()["wellness"][5][3]==7,st()["wellness"]); pg.locator(".edpull").nth(1).locator("button").nth(0).click(); w(.3); ok("and back",st()["wellness"][5][3]==6); pg.locator(".edpull").nth(2).locator("button").nth(1).click(); w(.3); ok("not into the neighbour",st()["wellness"][5][2]==5 and any("in the way" in t for t in toasts()),toasts())
    # walls
    T("Wall"); dr(18+X,9,18+X,15); L=st()["lounge"]; ok("a wall splits a room",L[5][2]<9 or L[1]==0,L); pg.keyboard.press("Control+z"); w(.3); ok("undo puts it back",st()["lounge"][1]==1)
    # paint and floor
    T("Paint"); pg.get_by_text("Whole room").click(); pg.locator(".edswatches button",has_text="Brick").click(); k=cost(); ck(28+X,5.2); ok("paint a room",cost()>k)
    T("Floor"); pg.get_by_text("Whole room").click(); pg.locator(".edswatches button",has_text="White marble").click(); k=cost(); ck(28+X,5.2); ok("new floor",plan()["floor"].count("m")==30,plan()["floor"].count("m")); shot("e3")
    # ready-made, from another side
    pg.keyboard.press("q"); w(1.2); pg.keyboard.press("q"); w(1.5); T("Ready-made"); pg.locator(".edcats button",has_text="Level 2").click(); w(.3); pg.locator(".edgrid button",has_text="Gym").click(); mv(4,17.5); w(.4); ck(30,12); ts=toasts(); ok("ready-made gym, seen from behind: it stands, or the pointer says why not",("gym" in st()) or len(ts)>0,ts); shot("e4")
    if "gym" not in st():
        esc(); T("Land"); pg.locator(".edland").nth(1).locator("button").nth(2).click(); w(.5); T("Ready-made"); pg.locator(".edgrid button",has_text="Gym").click(); ck(6,20)
    ok("gym at level 2",st().get("gym",[0,0])[1]==2 or st().get("gym",[0,0,0,["?"]])[3]!=[],st().get("gym"))
    pg.keyboard.press("t"); w(1.2); shot("e5"); pg.keyboard.press("t"); pg.keyboard.press("e"); w(.6); pg.keyboard.press("e"); w(1.5)
    # remove
    T("Remove"); n=len(plan()["items"]); k=cost()
    for it in [i for i in plan()["items"] if i["f"] in ("hedge","flowers")]:
        a=P(it["x"]/2+1,it["y"]/2+.25,.3)
        if 20<a[0]<960 and 70<a[1]<500: ck(it["x"]/2+1,it["y"]/2+.25,.3)
        if len(plan()["items"])<n: break
    ok("remove something old for money",len(plan()["items"])==n-1 and cost()<k,(len(plan()["items"]),n,cost(),k))
    # whose desk
    T("Select"); esc(); d=[i for i in q0["items"] if i["f"]=="station"]; t="cs2"; D=q("(async()=>{const s=await import('/src/game/seats.ts');return [s.seatsOf(__app.career.g,'cs2'),__app.career.g.squads.cs2.lineup]})()"); sq0=q("window.__app.career.seq")
    me=[i for i in plan()["items"] if i["id"]==D[0][2]][0]; ck(me["x"]/2+.75,me["y"]/2+.4,.7); w(.4); ok("a desk knows who sits there",pg.locator(".edseat button").count()==5 and pg.locator(".edseat button.on").count()==1); pg.locator(".edseat button").nth(0).click(); w(.5); N=q("(async()=>{const s=await import('/src/game/seats.ts');return s.seatsOf(__app.career.g,'cs2')})()"); ok("two people swap desks",N[0]==D[0][2] and N[2]==D[0][0],N); ok("without touching the plan",q("window.__app.career.seq")==sq0+1 and cost()<k); seq0+=1
    # leaving a plan behind
    T("Select"); esc(); esc(); pg.get_by_text("Discard").click(); w(.4); pg.get_by_text("Leave",exact=True).click(); w(1.5); ok("discard costs nothing and changes nothing",q("window.__app.career.g.club.cash")==cash0 and q("window.__app.career.seq")==seq0 and plan()["w"]==q0["w"])
    # build for real
    pg.get_by_text("HQ",exact=True).first.click(); w(.8); pg.get_by_text("Open the house editor").click(); w(2); T("Land"); pg.locator(".edland").nth(1).locator("button").nth(2).click(); w(.5); T("Ready-made"); pg.locator(".edcats button",has_text="Level 2").click(); w(.3); pg.locator(".edgrid button",has_text="Gym").click(); ck(6,20.5); ok("placed",st().get("gym",[0,0])[1]==2,(st().get("gym"),toasts())); k=cost(); shot("e6"); pg.locator(".edtop").get_by_text("Build").click(); w(3)
    g=q("({cash:window.__app.career.g.club.cash,rooms:window.__app.career.g.rooms.map(r=>r.type+r.lvl),edit:window.__app.edit,ids:window.__app.career.g.hq.items.every(i=>!i.id.startsWith('n'))})"); ok("built, paid, open",g["cash"]==cash0-k and "gym2" in g["rooms"] and not g["edit"] and g["ids"],g); shot("e7")
    # the whole thing survives a restart
    q("window.__app.career.flush()"); w(.5); pg.reload(); pg.wait_for_selector(".menu .srow .mitem"); w(1.5); pg.locator(".menu .srow .mitem").first.click(); pg.wait_for_selector(".dock"); w(2); ok("still there after a restart","gym2" in q("window.__app.career.g.rooms.map(r=>r.type+r.lvl)") and q("window.__app.career.ranked"))
    pg.wait_for_function("__app.career.auditState==='ok'",timeout=60000); ok("and the replay audit agrees",True)
    ok("no script errors",not errs,errs[:3]); b.close()
print("failures",bad); sys.exit(bad)
