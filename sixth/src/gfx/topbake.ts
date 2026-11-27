/** One fully lit photograph of a map from straight above, for machines too slow to light it every frame. */
import * as THREE from 'three';
import { ACES } from './bake.ts';
import { TOP } from './surface.ts';
export function bakeTop(
  r: THREE.WebGLRenderer,
  scene: THREE.Scene,
  W: number,
  H: number,
  exposure: number,
  px: number,
): THREE.WebGLRenderTarget {
  const w = Math.min(px, Math.round(W * 52)),
    h = Math.round((w * H) / W);
  const hdr = new THREE.WebGLRenderTarget(w, h, {
    type: THREE.HalfFloatType,
    depthTexture: new THREE.DepthTexture(w, h, THREE.UnsignedIntType),
  });
  const out = new THREE.WebGLRenderTarget(w, h, {
    depthBuffer: false,
    generateMipmaps: true,
    minFilter: THREE.LinearMipmapNearestFilter,
    magFilter: THREE.LinearFilter,
  });
  const cam = new THREE.OrthographicCamera(-W / 2, W / 2, H / 2, -H / 2, 1, 60);
  cam.position.set(W / 2, 40, H / 2);
  cam.up.set(0, 0, -1);
  cam.lookAt(W / 2, 0, H / 2);
  cam.updateMatrixWorld();
  const tm = r.toneMapping;
  r.toneMapping = THREE.NoToneMapping;
  const au = r.shadowMap.autoUpdate;
  r.shadowMap.autoUpdate = true;
  r.setRenderTarget(hdr);
  r.clear();
  r.render(scene, cam);
  const m = new THREE.ShaderMaterial({
    vertexShader: 'varying vec2 vUv; void main(){ vUv=uv; gl_Position=vec4(position.xy,0.0,1.0); }',
    fragmentShader:
      ACES +
      `varying vec2 vUv; uniform sampler2D uC,uD; uniform vec2 uPx; uniform float uEx,uM;
float ht(vec2 u){ return (1.0-texture2D(uD,u).r)*59.0; }
void main(){ vec3 c=texture2D(uC,vUv).rgb; float h=ht(vUv); float o=0.0; for(int i=0;i<16;i++){ float t=(float(i)+0.5)/16.0; float a=float(i)*2.39996; float rr=sqrt(t)*1.35; vec2 d=vec2(cos(a),sin(a))*rr*uPx*uM; float dh=ht(vUv+d)-h; o+=clamp(dh/(rr+0.25)-0.12,0.0,1.0)*smoothstep(6.0,1.0,dh); } float ao=clamp(1.0-o/16.0*1.25,0.0,1.0); c*=mix(vec3(0.2,0.17,0.2),vec3(1.0),ao); c=aces(c,uEx); c=pow(c,vec3(1.0/2.2)); float l=dot(c,vec3(0.3,0.59,0.11)); c=mix(vec3(l),c,1.12); gl_FragColor=vec4(c,1.0); }`,
    uniforms: {
      uC: { value: hdr.texture },
      uD: { value: hdr.depthTexture },
      uPx: { value: new THREE.Vector2(1 / w, 1 / h) },
      uEx: { value: exposure },
      uM: { value: w / W },
    },
    depthTest: false,
    depthWrite: false,
    toneMapped: false,
  });
  const q = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), m);
  q.frustumCulled = false;
  const s = new THREE.Scene();
  s.add(q);
  r.setRenderTarget(out);
  r.render(s, new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1));
  r.setRenderTarget(null);
  r.toneMapping = tm;
  r.shadowMap.autoUpdate = au;
  hdr.depthTexture?.dispose();
  hdr.dispose();
  m.dispose();
  TOP.tex.value = out.texture;
  TOP.size.value.set(W, H);
  return out;
}
