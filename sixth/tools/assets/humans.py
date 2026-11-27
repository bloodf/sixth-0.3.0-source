"""Builds the human library of the game from the MakeHuman data set.
   npm pack makehuman-data && tar xzf it, then: MH=<package dir> python3 tools/assets/humans.py <out dir>
   Output: one raw .json + .bin per part, which pack.mjs simplifies and quantises."""
import sys,json,os
import numpy as np
sys.path.insert(0,os.path.dirname(__file__))
from mh import *
OUT=sys.argv[1]; os.makedirs(OUT,exist_ok=True)
b=Base()
# ---------- our skeleton (src/gfx/body.ts)
J=dict(hips=(0,.95,0),spine=(0,1.06,0),chest=(0,1.26,0),neck=(0,1.49,0),head=(0,1.56,.01),shL=(.185,1.43,0),elL=(.385,1.225,-.01),wrL=(.565,1.04,.02),haL=(.63,.975,.03),hpL=(.098,.93,0),knL=(.108,.5,.012),anL=(.112,.085,-.02),toL=(.122,.03,.13))
J={k:np.array(v) for k,v in J.items()}
BN=['hips','spine','chest','head','uaL','faL','uaR','faR','thL','shL','ftL','thR','shR','ftR']
def owner(n):
    n=n.replace('____head','').replace('____tail','')
    s='L' if n.endswith('.L') else 'R' if n.endswith('.R') else ''
    k=n.split('.')[0]
    if k.startswith(('finger','metacarpal','wrist','lowerarm')): return {'fa'+s:1}
    if k.startswith('upperarm'): return {'ua'+s:1}
    if k.startswith('shoulder'): return {'chest':1}
    if k.startswith('clavicle') or k.startswith('breast'): return {'chest':1}
    if k.startswith('upperleg'): return {'th'+s:1}
    if k.startswith('lowerleg'): return {'sh'+s:1}
    if k.startswith(('foot','toe')): return {'ft'+s:1}
    if k in('root','spine05') or k.startswith('pelvis'): return {'hips':1}
    if k in('spine04','spine03'): return {'spine':1}
    if k in('spine02','spine01'): return {'chest':1}
    if k=='neck01': return {'chest':.5,'head':.5}
    return {'head':1}
W=np.zeros((len(b.V),14))
for i,n in enumerate(b.bones):
    o=owner(n)
    for c in range(4):
        m=b.SI[:,c]==i
        if not m.any(): continue
        for k,f in o.items(): W[m,BN.index(k)]+=b.SW[m,c]*f
W/=np.maximum(1e-9,W.sum(1,keepdims=True)); W[W.sum(1)<.5,BN.index('chest')]=1
# soften the shoulder: blend the arm's hold over the chest boundary
nb=[set() for _ in range(len(b.V))]
for f in b.F:
    for i in range(len(f)): nb[f[i]].add(f[i-1]); nb[f[i-1]].add(f[i])
import itertools
lens=np.array([len(x) for x in nb]); flat=np.array(list(itertools.chain(*nb))); start=np.r_[0,np.cumsum(lens)]
def smooth_w(W,n,mask):
    for _ in range(n):
        S=np.add.reduceat(W[flat],np.minimum(start[:-1],len(flat)-1),axis=0)/np.maximum(1,lens)[:,None]
        S[lens==0]=W[lens==0]
        W=np.where(mask[:,None],S,W)
    return W
sm=(b.V[:,1]>2.5)&(b.V[:,1]<7)&(np.abs(b.V[:,0])<3)
W=smooth_w(W,7,sm)
W/=np.maximum(1e-9,W.sum(1,keepdims=True))
# helper vertices (tights, hair) have weights too; anything unweighted follows the nearest body vertex
def rotTo(a,c):
    a=a/np.linalg.norm(a);c=c/np.linalg.norm(c);v=np.cross(a,c);d=a@c
    if d>.99999: return np.eye(3)
    K=np.array([[0,-v[2],v[1]],[v[2],0,-v[0]],[-v[1],v[0],0]]); return np.eye(3)+K+K@K/(1+d)
def joints(V):
    j=lambda n:b.joint(V,n)
    mid=lambda n:(j(n+'.L____head')*[1,1,1])
    return dict(sh=mid('upperarm01'),el=mid('lowerarm01'),wr=mid('wrist'),ha=mid('finger3-1'),hp=mid('upperleg01'),kn=mid('lowerleg01'),an=mid('foot'),neck=j('neck01____head'),head=j('head____head'),top=V[b.joints['head____head']].mean(0),root=j('root____head'),sp=j('spine04____head'),ch=j('spine02____head'))
# the floor: lowest body vertex
body=np.zeros(len(b.V),bool)
for f,m in zip(b.F,b.FM):
    if b.mats[m]=='body': body[f]=True
def bones(V):
    """per bone: 3x3 and translation taking the MakeHuman rest pose to ours"""
    q=joints(V); fl=V[body][:,1].min()
    # global scale: shoulder height and hip height both have to land
    out={}
    S=(J['neck'][1]-J['hpL'][1])/(q['neck'][1]-q['hp'][1])
    hs=S  # torso scale
    def T(M,src,dst): return M,dst-M@src
    hip0=np.array([0,q['hp'][1],q['hp'][2]]); dst=np.array([0,J['hpL'][1],0])
    zc=np.array([0,0,0])
    torso=T(np.eye(3)*S,hip0,dst)
    # lean the torso so that the neck lands on our neck
    nk=torso[0]@q['neck']+torso[1]; sh=(J['neck']-nk)
    for k,w in(('hips',0),('spine',.35),('chest',.8)): out[k]=(torso[0],torso[1]+np.array([0,0,sh[2]*w]))
    hM=np.eye(3)*S; out['head']=T(hM,q['neck'],J['neck'])
    for s,sg in(('L',1),('R',-1)):
        fl_=np.diag([sg,1,1]).astype(float)
        def limb(a,c,A,C,name,roll=None,wide=1.0):
            d0=q[c]-q[a];d1=J[C]-J[A]
            R=rotTo(d0,d1);L=np.linalg.norm(d1)/np.linalg.norm(d0);u=d1/np.linalg.norm(d1)
            r=S*wide
            M=(np.eye(3)*r+np.outer(u,u)*(L-r))@R
            t=J[A]-M@q[a]
            out[name+s]=(fl_@M@fl_,fl_@t)
        limb('sh','el','shL','elL','ua');limb('el','wr','elL','wrL','fa')
        limb('hp','kn','hpL','knL','th');limb('kn','an','knL','anL','sh')
        M=np.eye(3)*S
        t=J['anL']-M@q['an']; # keep soles on the ground
        low=(M@np.array([0,fl,0])+t)[1]; t=t-np.array([0,low-0.0,0])*0.85
        out['ft'+s]=(M,np.array([sg*t[0] if s=='R' else t[0],t[1],t[2]]))
    return out
def repose(P,w,B):
    R=np.zeros_like(P)
    for i,n in enumerate(BN):
        m=w[:,i]>0
        if not m.any(): continue
        M,t=B[n]; R[m]+=w[m,i:i+1]*(P[m]@M.T+t)
    return R
# ---------- shapes
RACE=('african','asian','caucasian')
def shape(g,race=None,old=0,mw='averageweight',mm='averagemuscle',extra=()):
    V=b.V.copy()
    for r in RACE: V+=b.t(f'macrodetails/{r}-{g}-young')*((1 if r==race else 0) if race else 1/3)*(1-old)
    if old:
        for r in RACE: V+=b.t(f'macrodetails/{r}-{g}-old')*old/3
        V+=b.t(f'macrodetails/universal-{g}-old-{mm}-{mw}')*old
    k=f'macrodetails/universal-{g}-young-{mm}-{mw}'
    if k in b.ti: V+=b.t(k)*(1-old)
    p=f'macrodetails/proportions/{g}-young-averagemuscle-averageweight-idealproportions'
    if p in b.ti: V+=b.t(p)*.5
    for n,a in extra: V+=b.t(n)*a
    return V
HL=[]
def pair(name,hi,lo):
    a=[k for k in hi if k in b.ti];c=[k for k in lo if k in b.ti]
    if len(a)!=len(hi) or len(c)!=len(lo): print('missing',name,set(hi+lo)-set(b.ti)); return
    HL.append((name,[(k,.5) for k in a]+[(k,-.5) for k in c]))
LR=lambda s:[s.replace('#','l'),s.replace('#','r')]
pair('headSquare',['head/head-square','head/head-rectangular'],['head/head-oval','head/head-invertedtriangular'])
pair('headRound',['head/head-round'],['head/head-diamond'])
pair('headFat',['head/head-fat'],['head/head-skinny'])
pair('headTall',['head/head-scale-vert-more'],['head/head-scale-vert-less'])
pair('chinLong',['chin/chin-height-max'],['chin/chin-height-min'])
pair('chinWide',['chin/chin-width-max'],['chin/chin-width-min'])
pair('chinOut',['chin/chin-prominent-more'],['chin/chin-prominent-less'])
pair('noseWide',['nose/nose-scale-horiz-incr'],['nose/nose-scale-horiz-decr'])
pair('noseLong',['nose/nose-scale-vert-incr'],['nose/nose-scale-vert-decr'])
pair('noseOut',['nose/nose-scale-depth-incr'],['nose/nose-scale-depth-decr'])
pair('noseHump',['nose/nose-hump-morehump'],['nose/nose-hump-lesshump'])
pair('noseTip',['nose/nose-point-up'],['nose/nose-point-down'])
pair('mouthWide',['mouth/mouth-scale-horiz-incr'],['mouth/mouth-scale-horiz-decr'])
pair('lipsFull',['mouth/mouth-lowerlip-volume-inflate','mouth/mouth-upperlip-volume-inflate'],['mouth/mouth-lowerlip-volume-deflate','mouth/mouth-upperlip-volume-deflate'])
pair('eyesBig',LR('eyes/#-eye-size-big'),LR('eyes/#-eye-size-small'))
pair('eyesTilt',LR('eyes/#-eye-corner1-up'),LR('eyes/#-eye-corner1-down'))
pair('eyesApart',LR('eyes/#-eye-move-out'),LR('eyes/#-eye-move-in'))
pair('browHeavy',['eyebrows/eyebrows-trans-depth-more'],['eyebrows/eyebrows-trans-depth-less'])
pair('cheekBones',LR('cheek/#-cheek-bones-out'),LR('cheek/#-cheek-bones-in'))
pair('cheekFull',LR('cheek/#-cheek-volume-inflate'),LR('cheek/#-cheek-volume-deflate'))
pair('earsBig',LR('ears/#-ear-size-big'),LR('ears/#-ear-size-small'))
pair('earsOut',LR('ears/#-ear-wing-out'),LR('ears/#-ear-wing-in'))
E='expression/units/caucasian/'
EX=[('smile',[(E+'mouth-corner-puller',.9),(E+'eyebrows-left-extern-up',.15),(E+'eyebrows-right-extern-up',.15),(E+'eye-left-slit',.25),(E+'eye-right-slit',.25),('cheek/l-cheek-volume-inflate',.25),('cheek/r-cheek-volume-inflate',.25)]),
 ('angry',[(E+'eyebrows-left-down',1),(E+'eyebrows-right-down',1),(E+'mouth-compression',.5),(E+'nose-left-dilatation',.6),(E+'nose-right-dilatation',.6),(E+'eye-left-slit',.3),(E+'eye-right-slit',.3),(E+'mouth-depression',.35)]),
 ('sad',[(E+'eyebrows-left-inner-up',1),(E+'eyebrows-right-inner-up',1),(E+'mouth-depression',.8),(E+'eye-left-slit',.25),(E+'eye-right-slit',.25)]),
 ('open',[(E+'mouth-open',.75)]),
 ('blink',[(E+'eye-left-closure',1),(E+'eye-right-closure',1)]),
 ('disgust',[(E+'nose-left-elevation',.8),(E+'nose-right-elevation',.8),(E+'nose-compression',.5),(E+'mouth-upward-retraction',.6),(E+'eyebrows-left-down',.6),(E+'eyebrows-right-down',.6),(E+'eye-left-slit',.4),(E+'eye-right-slit',.4)]),
 ('shock',[(E+'eyebrows-left-up',1),(E+'eyebrows-right-up',1),(E+'eye-left-opened-up',.8),(E+'eye-right-opened-up',.8),(E+'mouth-open',.35)])]
for n,L in EX:
    for k,_ in L:
        if k not in b.ti: print('missing',k)
G=('male','female')
MAC=[('african',dict(race='african')),('asian',dict(race='asian')),('caucasian',dict(race='caucasian')),('old',dict(old=.75)),('heavy',dict(mw='maxweight')),('thin',dict(mw='minweight')),('muscle',dict(mm='maxmuscle'))]
shapes={}
for g in G:
    s0=shape(g); shapes[g]=[('base',s0)]+[(n,shape(g,**kw)) for n,kw in MAC]
    for n,L in HL: shapes[g].append((n,shape(g,extra=L)))
    for n,L in EX: shapes[g].append(('ex_'+n,shape(g,extra=L)))
SB={g:{n:bones(V) for n,V in L if not n.startswith('ex_') and n in ('base',)+tuple(x for x,_ in MAC)} for g,L in shapes.items()}
def posed(P_of,w,g):
    out=[]
    for n,V in shapes[g]:
        B=SB[g].get(n,SB[g]['base']); out.append((n,repose(P_of(V),w,B)))
    return out
# relaxed and gripping hands: curl the fingers before the arms are re-posed
def rodr(ax,th):
    ax=ax/np.linalg.norm(ax);K=np.array([[0,-ax[2],ax[1]],[ax[2],0,-ax[0]],[-ax[1],ax[0],0]]);return np.eye(3)+np.sin(th)*K+(1-np.cos(th))*K@K
def curl(V,k):
    out=V.copy()
    for s in('L','R'):
        j=lambda f,i,e='head':b.joint(V,f'finger{f}-{i}.{s}____{e}')
        kn=j(5,1)-j(2,1); d=j(3,3)-j(3,1); n=np.cross(kn,d); n/=np.linalg.norm(n)
        th=j(1,3)-j(3,1)
        if n@th<0: n=-n
        ax=np.cross(d,n)  # turning d about ax by a positive angle moves it to n
        T={}
        for f in(2,3,4,5):
            M=np.eye(3);t=np.zeros(3);sp=(f-3.3)*-.05
            for i,a in zip((1,2,3),(.34,.5,.36)):
                p=j(f,i);R=rodr(ax,a*k)
                if i==1: R=rodr(n,sp*(1 if s=='L' else -1)*-1)@R
                # in the parent frame
                t=M@(p-R@p)+t;M=M@R
                T[f'finger{f}-{i}.{s}']=(M,t)
        M=np.eye(3);t=np.zeros(3);ax2=np.cross(j(1,3)-j(1,1),-n*.3+(j(3,1)-j(1,1)))
        for i,a in zip((1,2,3),(.12,.22,.25)):
            p=j(1,i);R=rodr(ax2,a*min(k,1.4));t=M@(p-R@p)+t;M=M@R;T[f'finger1-{i}.{s}']=(M,t)
        D=np.zeros_like(V)
        for bi,nm in enumerate(b.bones):
            key=nm.replace('____head','').replace('____tail','')
            if key not in T: continue
            M,t=T[key]
            for c in range(4):
                m=(b.SI[:,c]==bi)&(b.SW[:,c]>0)
                if m.any(): D[m]+=b.SW[m,c:c+1]*((V[m]@M.T+t)-V[m])
        out+=D
    return out
for g in G:
    shapes[g]=[(n,curl(V,1.0)) for n,V in shapes[g]]+[('grip',curl(shapes[g][0][1],3.0))]
def write(name,pos,w,faces,uvf,uv,extra=None,gens=G):
    """split vertices by uv, triangulate, save"""
    key={};vm=[];vu=[];tris=[]
    for f,u in zip(faces,uvf):
        ids=[]
        for a,c in zip(f,u):
            k=(a,c)
            if k not in key: key[k]=len(vm); vm.append(a); vu.append(c)
            ids.append(key[k])
        tris.append((ids[0],ids[1],ids[2]))
        if len(ids)==4: tris.append((ids[0],ids[2],ids[3]))
    vm=np.array(vm); m=dict(name=name,verts=len(vm),tris=len(tris),shapes={},**(extra or {}))
    blob=[]
    def add(a): o=sum(len(x) for x in blob); blob.append(a.tobytes()); return o
    m['uv']=add(uv[np.array(vu)].astype(np.float32)); m['idx']=add(np.array(tris,np.uint32)); m['vm']=add(vm.astype(np.uint32))
    ww=w[vm]; top=np.argsort(-ww,1)[:,:4]; tw=np.take_along_axis(ww,top,1); tw/=tw.sum(1,keepdims=True)
    m['si']=add(top.astype(np.uint8)); m['sw']=add((tw*255).round().astype(np.uint8))
    for g in gens:
        for n,P in pos[g]: m['shapes'][g+'/'+n]=add(P[vm].astype(np.float32))
    open(f'{OUT}/{name}.bin','wb').write(b''.join(blob)); json.dump(m,open(f'{OUT}/{name}.json','w'))
    print(name,len(vm),len(tris))
# ---------- body
PARTS=json.load(open(os.path.join(os.path.dirname(__file__),'parts.json')))
dele={}
for o in PARTS['outfits']+PARTS['shoes']:
    p=proxy('clothes/'+o['src']); dele[o['id']]=p['delete'].astype(bool) if len(p['delete']) else np.zeros(len(b.V),bool)
bf=[(f,u) for f,u,m in zip(b.F,b.FU,b.FM) if b.mats[m]=='body']
# the torso is always covered: drop what every outfit hides
allhide=np.ones(len(b.V),bool)
for o in PARTS['outfits']: allhide&=dele[o['id']]
keep=[(f,u) for f,u in bf if not all(allhide[i] for i in f)]
hides={k:''.join('1' if x else '0' for x in v[:]) for k,v in dele.items()}
pos={g:posed(lambda V:V,W,g) for g in G}
write('body',pos,W,[f for f,_ in keep],[u for _,u in keep],b.UV)
open(f'{OUT}/hide.bits','wb').write(b''.join(v.astype(np.uint8).tobytes() for v in dele.values()))
json.dump({k:i*len(b.V) for i,k in enumerate(dele)},open(f'{OUT}/hide.json.txt','w'))
# ---------- worn things
def worn(kind,id,src,gens):
    p=proxy(src)
    wt=p['w'] if p['w'].ndim==2 else np.stack([p['w'],0*p['w'],0*p['w']],1)
    pw=(W[p['ref']]*np.abs(wt)[:,:,None]).sum(1); pw/=np.maximum(1e-9,pw.sum(1,keepdims=True))
    fit=lambda V:(V[p['ref']]*wt[:,:,None]).sum(1)+p['off']
    if kind in('hair','eyes','brow','beard','lash','glasses'): pw[:]=0; pw[:,BN.index('head')]=1
    pos={g:posed(fit,pw,g) for g in gens}
    write(id,pos,pw,p['F'],p['FU'],p['UV'],dict(kind=kind,gens=list(gens)),gens)
for kind in('outfits','shoes','hair','face'):
    for o in PARTS[kind]: worn(o.get('kind',{'outfits':'outfit','shoes':'shoes','hair':'hair'}.get(kind,kind)),o['id'],o.get('dir',{'outfits':'clothes/','shoes':'clothes/','hair':'hair/','face':''}[kind])+o['src'],tuple(o.get('g',G)))
json.dump(dict(macro=[n for n,_ in MAC]+['grip'],head=[n for n,_ in HL],ex=[n for n,_ in EX]),open(f'{OUT}/shapes.json','w'))
