"""MakeHuman data (npm package makehuman-data, AGPL-3.0) -> compact arrays in our own rest pose. See humans.py."""
import json,glob,os,numpy as np
ROOT=os.environ.get('MH','/tmp/mh/package')
D=ROOT+'/public/data/'
def parse_faces(F):
    out=[];uv=[];mat=[];i=0;n=len(F)
    while i<n:
        t=F[i];i+=1;q=4 if t&1 else 3
        v=F[i:i+q];i+=q;m=0
        if t&2: m=F[i];i+=1
        if t&4: i+=1
        u=None
        if t&8: u=F[i:i+q];i+=q
        if t&16: i+=1
        if t&32: i+=q
        if t&64: i+=1
        if t&128: i+=q
        out.append(v);uv.append(u if u is not None else v);mat.append(m)
    return out,uv,mat
class Base:
    def __init__(s):
        d=json.load(open(D+'models/human_full_size.json'))
        s.V=np.array(d['vertices'],np.float64).reshape(-1,3)
        s.UV=np.array(d['uvs'][0],np.float64).reshape(-1,2)
        s.F,s.FU,s.FM=parse_faces(d['faces'])
        s.mats=[m['DbgName'] for m in d['materials']]
        s.bones=[b['name'] for b in d['bones']]
        s.SI=np.array(d['skinIndices']).reshape(-1,4); s.SW=np.array(d['skinWeights'],np.float64).reshape(-1,4)
        s.joints=d['metadata']['joint_pos_idxs']
        t=json.load(open(ROOT+'/src/json/targets/target-list.json'))['targets']
        s.tn=sorted(t); s.ti={k.replace('data/targets/','').replace('.target',''):i for i,k in enumerate(s.tn)}
        s.T=np.memmap(D+'targets/targets.bin',np.int16,'r').reshape(len(s.tn),-1,3)
    def t(s,name): return s.T[s.ti[name]].astype(np.float64)*1e-3
    def joint(s,V,name): return V[s.joints[name]].mean(0)
def proxy(path):
    p=D+'proxies/'+path; n=os.path.basename(path)
    d=json.load(open(f'{p}/{n}.json'))
    F,FU,_=parse_faces(d['faces'])
    return dict(name=n,dir=p,ref=np.array(d['ref_vIdxs']),w=np.array(d['weights'],np.float64).reshape(-1,3) if np.array(d['weights']).size==3*len(d['ref_vIdxs']) else np.array(d['weights']),
      off=np.array(d['offsets'],np.float64).reshape(-1,3),F=F,FU=FU,UV=np.array(d['uvs'][0],np.float64).reshape(-1,2),mat=d['materials'][0],delete=np.array(d['metadata'].get('deleteVerts') or []),verts=np.array(d['vertices'],np.float64).reshape(-1,3))
