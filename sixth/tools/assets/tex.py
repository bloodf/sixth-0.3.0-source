"""Textures for the human library: skins (sharpened, with pore detail), hair, cloth normals and occlusion. MH=<package> python3 tex.py <out>"""
import sys,os,glob,json,numpy as np
from PIL import Image,ImageFilter
R=os.environ.get('MH','/tmp/mh/package')+'/public/data/'; OUT=sys.argv[1]; os.makedirs(OUT,exist_ok=True)
P=json.load(open(os.path.join(os.path.dirname(__file__),'parts.json')))
def sv(im,n,q=82): im.save(f'{OUT}/{n}.webp',quality=q,method=6); print(n,im.size,os.path.getsize(f'{OUT}/{n}.webp')//1024,'KB')
rng=np.random.default_rng(3)
def noise(n,s):
    a=rng.normal(size=(n,n)); im=Image.fromarray((a*40+128).clip(0,255).astype(np.uint8)); return np.array(im.filter(ImageFilter.GaussianBlur(s))).astype(float)-128
SK={'skin_cm':'young_caucasian_male/textures/young_lightskinned_male_diffuse.png','skin_cf':'young_caucasian_female/textures/young_lightskinned_female_diffuse.png','skin_am':'young_african_male/textures/young_darkskinned_male_diffuse.png','skin_af':'young_african_female/textures/young_darkskinned_female_diffuse.png','skin_sm':'young_asian_male/textures/*diffuse3.png','skin_sf':'young_asian_female/textures/*diffuse3.png','skin_om':'old_caucasian_male/textures/*diffuse.png','skin_of':'old_caucasian_female/textures/*diffuse.png'}
for n,f in SK.items():
    L=sorted(glob.glob(R+'skins/'+f)); 
    if not L: print('no',n,glob.glob(R+'skins/'+f.split('/')[0]+'/textures/*')); continue
    im=Image.open(L[0]).convert('RGB').resize((1024,1024),Image.LANCZOS)
    im=im.filter(ImageFilter.UnsharpMask(2.2,90,2))
    a=np.array(im).astype(float); b_=np.array(im.filter(ImageFilter.GaussianBlur(46))).astype(float); m=np.zeros((1024,1024)); m[190:900,150:660]=1; m=np.array(Image.fromarray((m*255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(24))).astype(float)[:,:,None]/255; a=a*(1-m)+b_*m; a[740:1024,985:1024]=a[740,980]
    a+=(noise(1024,.7)*.16+noise(1024,1.6)*.3)[:,:,None]*np.array([1,.8,.7]); sv(Image.fromarray(a.clip(0,255).astype(np.uint8)),n,80)
for o in P['hair']+[x for x in P['face'] if x['kind'] in('beard','brow','lash')]:
    src=o['src']; d=R+'proxies/'+('hair/' if o in P['hair'] else '')+src+'/textures/'; L=[f for f in sorted(glob.glob(d+'*.png')) if 'thumb' not in f and 'norm' not in f and 'spec' not in f and 'bump' not in f]
    im=Image.open(L[0]); pass; im=im.convert('RGBA'); a=np.array(im).astype(float); al=a[:,:,3:4]; lum=a[:,:,:3]@[.3,.59,.11]
    m=(lum*(al[:,:,0]>60)).sum()/max(1,(al[:,:,0]>60).sum()); 
    # a neutral strand map: colour comes from the palette
    k=np.clip(lum/max(m,8)*150,0,255); 
    # bleed colour into the transparent border so that edges do not darken
    rgb=Image.fromarray(k.astype(np.uint8)); mask=Image.fromarray(((al[:,:,0]>60)*255).astype(np.uint8)); bl=rgb.filter(ImageFilter.GaussianBlur(6)); k2=np.where(al[:,:,0]>60,k,150)
    sz=512 if o in P['hair'] else 256
    out=np.dstack([k2,k2,k2,al[:,:,0]]).astype(np.uint8); sv(Image.fromarray(out,'RGBA').resize((sz,sz),Image.LANCZOS),o['id'],80)
for o in P['outfits']+P['shoes']:
    d=R+'proxies/clothes/'+o['src']+'/textures/'; g=lambda k:(sorted(f for f in glob.glob(d+'*.png') if k in f and 'thumb' not in f) or [None])[0]
    df,nm,ao=g('diff'),g('norm'),g('_ao')
    D=np.array(Image.open(df).convert('RGB')).astype(float); lum=D@[.3,.59,.11]
    bl=np.array(Image.fromarray(lum.clip(0,255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(28))).astype(float)
    det=np.clip(lum/np.maximum(bl,14),.35,1.6)
    A=np.array(Image.open(ao).convert('L').resize((512,512))).astype(float)/255 if ao else np.ones((512,512))
    if nm: N=np.array(Image.open(nm).convert('RGB').resize((512,512))).astype(float)
    else:
        h=lum/255*3; gy,gx=np.gradient(h); N=np.dstack([128-gx*120,128+gy*120,np.full_like(h,255)]).clip(0,255)
    if N.shape[0]!=512: N=np.array(Image.fromarray(N.astype(np.uint8)).resize((512,512)))
    det=np.array(Image.fromarray((det*128).clip(0,255).astype(np.uint8)).resize((512,512)))
    # R,G: normal x,y   B: occlusion   and weave detail in its own small picture
    sv(Image.fromarray(np.dstack([N[:,:,0],N[:,:,1],A*255]).clip(0,255).astype(np.uint8)),'n_'+o['id'],86)
    if o['id'] in('tee_m','tee_f','long_m','short_f'):  # the maker's print on the chest is not ours: keep only the trousers' detail
        yy=D[:,:,2]>D[:,:,0]*1.7
        blur=np.array(Image.fromarray((yy*255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(9)))>60
        fill=(128+rng.normal(size=(D.shape[0],D.shape[1]))*7).clip(0,255); fill=np.array(Image.fromarray(fill.astype(np.uint8)).resize((512,512)))
        bl2=np.array(Image.fromarray((blur*255).astype(np.uint8)).resize((512,512)))>128
        orange=np.array(Image.fromarray(((D[:,:,0]>D[:,:,2]*1.15)*255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(5)).resize((512,512)))>30
        det=np.where(bl2|orange,fill,det).astype(np.uint8)
    sv(Image.fromarray(det),'d_'+o['id'],72)

A=Image.new('RGBA',(1024,1024),(150,150,150,0))
for i,n in enumerate(['brow1','brow2','brow3','brow4','beard','mous','lash']):
    A.paste(Image.open(f'{OUT}/{n}.webp').convert('RGBA').resize((256,256)),((i%4)*256,(i//4)*256)); os.remove(f'{OUT}/{n}.webp')
E=sorted(glob.glob(R+'proxies/eyes/Low-Poly/textures/*.png'))
for i,n in enumerate(['brown','blue','green','grey']):
    f=[x for x in E if os.path.basename(x).startswith(n)][0]; t=Image.open(f).convert('RGBA').resize((256,256),Image.LANCZOS); t.putalpha(255); A.paste(t,(i*256,512))
for i,n in enumerate(['brownlight','deepblue','ice','bluegreen']):
    f=[x for x in E if os.path.basename(x).startswith(n)][0]; t=Image.open(f).convert('RGBA').resize((256,256),Image.LANCZOS); t.putalpha(255); A.paste(t,(i*256,768))
sv(A,'face',86)
