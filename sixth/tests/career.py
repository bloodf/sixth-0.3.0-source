# Shared by the browser tests: a career through the real creator, and days through the real button.
URL="http://127.0.0.1:5173/"
def new(pg,mgr="Ana",club="Quiet Foxes",color=None,url=URL,origin_games=()):
    pg.goto(url); pg.wait_for_selector(".menu",timeout=120000); pg.wait_for_timeout(800)
    pg.locator(".mitem",has_text="New career").click(); pg.wait_for_selector(".cz")
    def nxt(): pg.locator(".czf .b.pri:not([disabled])").click(timeout=60000); pg.wait_for_timeout(300)
    pg.locator("input.bigin").fill(mgr); nxt()
    pg.locator("input.bigin").fill(club)
    if color is not None: pg.locator(".sw").first.locator("button").nth(color).click()
    nxt(); nxt(); nxt()
    for i in origin_games:
        if i: pg.locator('.games > button').nth(i).click(); pg.wait_for_timeout(150)
    nxt(); pg.wait_for_timeout(600); nxt()
    pg.wait_for_selector(".dock",timeout=90000); pg.wait_for_timeout(800)
SETTLE="""async()=>{const I=await import('/src/game/incidents.ts');const g=__app.career.g;if(!g.life.inc)return 0;const c=I.INC[g.life.inc.id].choices(g,g.life.inc).filter(c=>(c.cost??0)<=g.club.cash)[0];__dev.decide(c.id);__dev.incidentDone();return 1}"""
def play(pg,n):
    pg.evaluate("__app.fast=true")
    for _ in range(n):
        day=pg.evaluate("__app.career.g.day")
        for _ in range(12):
            if pg.evaluate(SETTLE): pg.wait_for_timeout(300); continue
            if pg.evaluate("__app.career.g.day")!=day: break
            pg.locator(".cont .go").click(); pg.wait_for_timeout(500)
    pg.evaluate(SETTLE); pg.evaluate("__app.career.flush()"); pg.wait_for_timeout(300)
