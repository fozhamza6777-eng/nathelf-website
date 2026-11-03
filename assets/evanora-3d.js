// Evanora 3D hero: the box and bottle are rebuilt from the packshot photo and lit like the catalog film.
// Scrolling the pinned hero (ScrollTrigger "p3d", set up in product.js) moves the camera along the film's route.
import * as THREE from 'three';
import {EffectComposer} from 'three/addons/postprocessing/EffectComposer.js';
import {RenderPass} from 'three/addons/postprocessing/RenderPass.js';
import {UnrealBloomPass} from 'three/addons/postprocessing/UnrealBloomPass.js';
import {OutputPass} from 'three/addons/postprocessing/OutputPass.js';

const hero=document.querySelector('.p-hero--3d');
const canvas=hero && hero.querySelector('.p3d-canvas');
const reduceMotion=matchMedia('(prefers-reduced-motion: reduce)').matches;

// The scene was laid out in Blender (Z up, metres); B() converts to three.js (Y up).
const B=(x,y,z)=>new THREE.Vector3(x,z,-y);
const lin=(r,g,b)=>new THREE.Color().setRGB(r,g,b,THREE.LinearSRGBColorSpace);
const rad=THREE.MathUtils.degToRad;

// Faces are UV-mapped to pixel coordinates of the 987x1280 packshot (box front = 480 px = 6 cm).
const IW=987,IH=1280,K=.06/480;
const uvPx=(px,py)=>[px/IW,1-py/IH];

// Camera beats from the film: frame, orbit centre (x,y), orbit angle, distance, height, aim point.
const BOX_LOGO=[-.0274,-.0115],BOTTLE=[.033,-.014],CENTRE=[0,0];
const BEATS=[
  [1,CENTRE,0,.50,.058,[0,0,.052]],
  [15,CENTRE,2,.52,.060,[0,0,.052]],
  [70,BOX_LOGO,-10,.16,.075,[...BOX_LOGO,.082]],
  [110,BOX_LOGO,40,.17,.090,[...BOX_LOGO,.070]],
  [150,BOTTLE,20,.15,.050,[.039,-.031,.045]],
  [190,BOTTLE,-15,.14,.150,[.033,-.020,.072]],
  [245,CENTRE,-35,.58,.130,[0,0,.060]],
  [300,CENTRE,0,.50,.058,[0,0,.052]],
];

// Keys eased like Blender's auto-clamped Bézier: smooth through a key, flat at a turning point and at the ends.
function track(keys){
  const n=keys.length;
  const slope=keys.map(([,v],i)=>{
    if(i===0 || i===n-1) return 0;
    const [f0,v0]=keys[i-1],[f1,v1]=keys[i+1];
    if((v>=v0 && v>=v1) || (v<=v0 && v<=v1)) return 0;
    return (v1-v0)/(f1-f0);
  });
  return f=>{
    if(f<=keys[0][0]) return keys[0][1];
    if(f>=keys[n-1][0]) return keys[n-1][1];
    let i=0;
    while(f>keys[i+1][0]) i++;
    const [f0,v0]=keys[i],[f1,v1]=keys[i+1],h=f1-f0,t=(f-f0)/h,t2=t*t,t3=t2*t;
    return (2*t3-3*t2+1)*v0+(t3-2*t2+t)*h*slope[i]+(3*t2-2*t3)*v1+(t3-t2)*h*slope[i+1];
  };
}
const beat=pick=>track(BEATS.map(b=>[b[0],pick(b)]));
const cam={cx:beat(b=>b[1][0]),cy:beat(b=>b[1][1]),angle:beat(b=>b[2]),dist:beat(b=>b[3]),height:beat(b=>b[4]),
  ax:beat(b=>b[5][0]),ay:beat(b=>b[5][1]),az:beat(b=>b[5][2])};
// products float up in the wide shot and land back on their marks
const lift={box:track([[200,0],[240,.018],[265,.0198],[292,0]]),bottle:track([[200,0],[240,.022],[265,.0242],[292,0]]),
  boxSpin:track([[200,0],[240,12],[265,14.4],[292,0]]),bottleSpin:track([[200,0],[240,-12],[265,-14.4],[292,0]]),
  rings:track([[200,1],[245,1.3],[285,1]]),swarmTurn:track([[1,0],[200,16],[245,22],[292,30],[300,31]]),
  swarmRise:track([[1,0],[200,0],[245,.016],[292,.004],[300,.004]]),dropTurn:track([[1,0],[245,-20],[300,-24]]),
  dropRise:track([[1,0],[245,.02],[300,.006]])};

function seeded(seed){ // mulberry32
  return()=>{seed=seed+0x6D2B79F5|0;let t=Math.imul(seed^seed>>>15,1|seed);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296;};
}
// Random points around the products, kept off the products and out of the close-up camera path.
function scatter(rand,n,rmin,rmax,zmin,zmax,frontRmin,spacing){
  const pts=[];
  for(let tries=0;pts.length<n && tries<20000;tries++){
    const ang=rand()*Math.PI*2,r=rmin+rand()*(rmax-rmin);
    const x=r*Math.sin(ang),y=-r*Math.cos(ang);
    if(y<-.06 && r<frontRmin) continue;
    if(Math.hypot(x+.034,y-.010)<.065 || Math.hypot(x-.033,y+.014)<.045) continue;
    const p=B(x,y,zmin+rand()*(zmax-zmin));
    if(pts.some(q=>q.distanceTo(p)<spacing)) continue;
    pts.push(p);
  }
  return pts;
}

function boxGeometry(){
  const W=.060,D=.045,H=.1125;
  const v=(sx,sy,sz)=>[sx*W/2,sy*D/2,sz*H];
  const printed=[
    ['front',[v(-1,-1,0),v(1,-1,0),v(1,-1,1),v(-1,-1,1)]],
    ['left',[v(-1,1,0),v(-1,-1,0),v(-1,-1,1),v(-1,1,1)]],
    ['right',[v(1,-1,0),v(1,1,0),v(1,1,1),v(1,-1,1)]],
  ];
  const plain=[
    [v(1,1,0),v(-1,1,0),v(-1,1,1),v(1,1,1)],
    [v(-1,-1,1),v(1,-1,1),v(1,1,1),v(-1,1,1)],
    [v(-1,1,0),v(1,1,0),v(1,-1,0),v(-1,-1,0)],
  ];
  const pos=[],uv=[];
  const quad=(q,uvs)=>{for(const i of [0,1,2,0,2,3]){const p=B(...q[i]);pos.push(p.x,p.y,p.z);uv.push(...uvs[i]);}};
  for(const [side,q] of printed){
    quad(q,q.map(([x,y,z])=>{
      if(side==='front') return uvPx(137+(x+W/2)/W*480,1124-z/H*902);
      // the photo shows the left panel in perspective; the right panel reuses it mirrored
      const t=side==='right'?1-(y+D/2)/D:(y+D/2)/D;
      const top=222+t*43,bot=1124-t*36;
      return uvPx(137-t*112,bot-(z/H)*(bot-top));
    }));
  }
  const printedCount=pos.length/3;
  for(const q of plain) quad(q,q.map(()=>[0,0]));
  const g=new THREE.BufferGeometry();
  g.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));
  g.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));
  g.computeVertexNormals();
  g.addGroup(0,printedCount,0);
  g.addGroup(printedCount,pos.length/3-printedCount,1);
  return g;
}

function bottleGeometry(){
  const profile=[[.0168,0],[.0177,.0012],[.0177,.0598],[.0174,.0625],[.0168,.0655],[.0160,.0680],[.0150,.0695],[.0145,.0702]];
  const g=new THREE.LatheGeometry(profile.map(([r,h])=>new THREE.Vector2(r,h)),96);
  // planar projection from the front reproduces the photo exactly
  const p=g.attributes.position,uv=g.attributes.uv;
  for(let i=0;i<p.count;i++) uv.setXY(i,...uvPx(786.5+p.getX(i)/K,1118-p.getY(i)/K));
  return g;
}

// Dark studio for reflections: softboxes in the same places as the lights, plus the violet backdrop glow.
function studioEnvironment(renderer){
  const env=new THREE.Scene();
  env.background=lin(.004,.004,.010);
  const panel=(w,h,color,power,at)=>{
    const m=new THREE.Mesh(new THREE.PlaneGeometry(w,h),new THREE.MeshBasicMaterial({color:color.multiplyScalar(power),side:THREE.DoubleSide}));
    m.position.copy(at);
    m.lookAt(0,0,0);
    env.add(m);
  };
  panel(2.2,1.6,lin(1,.97,.93),5,new THREE.Vector3(-2.2,2.4,2.4));
  panel(2.6,1.2,lin(.92,.94,1),1.6,new THREE.Vector3(2.8,1.2,2.2));
  panel(1.0,2.8,lin(.72,.55,1),4,new THREE.Vector3(-2.6,1.6,-2.2));
  panel(1.0,2.8,lin(.50,.72,1),4,new THREE.Vector3(2.6,1.6,-2.2));
  panel(5,5,lin(1,.98,.94),2.2,new THREE.Vector3(0,4,.2));
  panel(4.5,2.2,lin(1,.95,.88),.8,new THREE.Vector3(0,1.7,-3)); // what the cap top mirrors in the overhead shot
  panel(7,2.2,lin(.42,.30,1),.9,new THREE.Vector3(0,.9,-4));
  const pmrem=new THREE.PMREMGenerator(renderer);
  const tex=pmrem.fromScene(env,.02).texture;
  pmrem.dispose();
  return tex;
}

// Comet-shaped light streak: bright head at the end of the path, fading to nothing at the tail.
function streakMaterial(color,power,fade){
  return new THREE.ShaderMaterial({
    transparent:true,depthWrite:false,blending:THREE.AdditiveBlending,
    uniforms:{uColor:{value:color.multiplyScalar(power)},uFade:fade},
    vertexShader:'varying float vU;void main(){vU=uv.x;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
    fragmentShader:'uniform vec3 uColor;uniform float uFade;varying float vU;void main(){float a=vU*vU*uFade;gl_FragColor=vec4(uColor*a,a);\n#include <tonemapping_fragment>\n#include <colorspace_fragment>\n}',
  });
}
class Arc extends THREE.Curve{
  constructor(r,arc,dir){super();this.r=r;this.arc=arc;this.dir=dir;}
  getPoint(t,target=new THREE.Vector3()){const a=this.dir*t*this.arc;return target.set(this.r*Math.cos(a),0,-this.r*Math.sin(a));}
}

async function init(){
  const renderer=new THREE.WebGLRenderer({canvas,antialias:false,powerPreference:'high-performance'});
  renderer.toneMapping=THREE.NeutralToneMapping;
  const scene=new THREE.Scene();
  scene.background=lin(.006,.006,.014);
  const envMap=studioEnvironment(renderer);
  const camera=new THREE.PerspectiveCamera(16.5,16/9,.01,20);

  const photo=await new THREE.TextureLoader().loadAsync('media/pack/evanora.jpg');
  photo.colorSpace=THREE.SRGBColorSpace;
  photo.anisotropy=renderer.capabilities.getMaxAnisotropy();

  // ---------- products
  const reflectable=new THREE.Group();
  scene.add(reflectable);
  const box=new THREE.Mesh(boxGeometry(),[
    new THREE.MeshPhysicalMaterial({map:photo,roughness:.38,clearcoat:.25,clearcoatRoughness:.08,envMap,envMapIntensity:.55}),
    new THREE.MeshStandardMaterial({color:lin(.93,.93,.92),roughness:.4,envMap,envMapIntensity:.55}),
  ]);
  box.position.copy(B(-.034,.010,0));
  reflectable.add(box);
  const bottle=new THREE.Group();
  bottle.position.copy(B(.033,-.014,0));
  bottle.add(new THREE.Mesh(bottleGeometry(),new THREE.MeshPhysicalMaterial({map:photo,roughness:.12,clearcoat:.6,clearcoatRoughness:.08,envMap,envMapIntensity:.7})));
  const base=new THREE.Mesh(new THREE.CircleGeometry(.0168,96),new THREE.MeshStandardMaterial({color:lin(.12,.05,.02),roughness:.2}));
  base.rotation.x=Math.PI/2;
  bottle.add(base);
  const cap=new THREE.Mesh(new THREE.CylinderGeometry(.0145,.0145,.0106,96),new THREE.MeshStandardMaterial({color:lin(.86,.62,.30),metalness:1,roughness:.22,envMap,envMapIntensity:1.1}));
  cap.position.y=.0698+.0053;
  bottle.add(cap);
  reflectable.add(bottle);

  // ---------- dark studio: glowing backdrop and a glossy floor (the reflection is the scene mirrored under a tinted floor)
  const glow={value:.3};
  const backdrop=new THREE.Mesh(new THREE.CylinderGeometry(1.1,1.1,1.62,96,1,true),new THREE.ShaderMaterial({
    side:THREE.BackSide,depthWrite:false,uniforms:{uGlow:glow},
    vertexShader:'varying vec3 vPos;void main(){vPos=(modelMatrix*vec4(position,1.)).xyz;gl_Position=projectionMatrix*viewMatrix*vec4(vPos,1.);}',
    fragmentShader:'uniform float uGlow;varying vec3 vPos;void main(){vec3 d=(vPos-vec3(0.,.28,-1.1))/vec3(.95,.75,.95);float g=pow(max(0.,1.-length(d)),3.);gl_FragColor=vec4(vec3(.004,.005,.010)+vec3(.42,.30,1.)*g*uGlow,1.);\n#include <tonemapping_fragment>\n#include <colorspace_fragment>\n}',
  }));
  backdrop.position.y=.8;
  reflectable.add(backdrop);
  const floor=new THREE.Mesh(new THREE.PlaneGeometry(4,4),new THREE.MeshStandardMaterial({color:lin(.010,.011,.020),roughness:.3,transparent:true,opacity:.86,envMap,envMapIntensity:.25}));
  floor.rotation.x=-Math.PI/2;
  floor.renderOrder=-.5; // after the mirrored scene, before the streaks and dust above it
  scene.add(floor);

  // ---------- lights (positions from the Blender scene)
  const light=(color,power,at)=>{const l=new THREE.DirectionalLight(color,power);l.position.copy(at);l.userData.power=power;scene.add(l);return l;};
  const lights=[
    light(lin(1,.97,.93),2.4,B(-.32,-.36,.34)),
    light(lin(.92,.94,1),.7,B(.38,-.30,.18)),
    light(lin(.72,.55,1),2.2,B(-.26,.24,.34)),
    light(lin(.50,.72,1),2.2,B(.28,.22,.34)),
    light(lin(1,.98,.95),.6,B(0,-.02,.50)),
  ];
  scene.add(new THREE.HemisphereLight(lin(.35,.30,.55),lin(.02,.02,.04),.25));

  // ---------- light rings orbiting the products: radius, arc, tube, colour, power, tilt x/y, height, turns per 10 s
  const fade={value:0};
  const LAVENDER=()=>lin(.78,.66,1),GOLD=()=>lin(1,.74,.36),ICE=()=>lin(.72,.86,1);
  const rings=[
    [.095,150,.0009,LAVENDER(),7,6,-4,.038,2.2],
    [.110,120,.0007,GOLD(),6,-9,7,.060,-1.7],
    [.125,170,.0008,ICE(),7,12,3,.088,1.9],
    [.140,110,.0006,LAVENDER(),5,-5,-11,.045,-2.6],
  ].map(([r,arc,tube,color,power,tx,ty,h,turns])=>{
    const rig=new THREE.Group();
    rig.position.y=h;
    rig.rotation.set(rad(tx),0,rad(-ty));
    const ring=new THREE.Mesh(new THREE.TubeGeometry(new Arc(r,rad(arc),Math.sign(turns)),160,tube,6,false),streakMaterial(color,power,fade));
    ring.userData.turns=turns;
    rig.add(ring);
    reflectable.add(rig);
    return rig;
  });

  // streaks sliding sideways far behind the products
  const rand=seeded(11);
  const backStreaks=[...Array(9)].map((_,i)=>{
    const length=.35+rand()*.35;
    const geo=new THREE.TubeGeometry(new THREE.LineCurve3(new THREE.Vector3(-length,0,0),new THREE.Vector3(0,0,0)),40,.0008+rand()*.0006,6,false);
    const m=new THREE.Mesh(geo,streakMaterial([LAVENDER,ICE,GOLD][i%3](),3+rand()*2,fade));
    m.position.copy(B(0,.28+rand()*.47,.01+rand()*.31));
    m.userData.period=(70+rand()*60)/30;
    m.userData.phase=rand();
    scene.add(m);
    return m;
  });

  // ---------- floating softgel capsules
  const swarm=new THREE.Group();
  reflectable.add(swarm);
  const capsuleGeo=new THREE.CapsuleGeometry(.0042,.0116,8,20);
  const capsuleMat=new THREE.MeshPhysicalMaterial({color:lin(.95,.52,.10),roughness:.08,clearcoat:1,clearcoatRoughness:.04,
    emissive:lin(.35,.12,.01),emissiveIntensity:.6,envMap,envMapIntensity:1.2});
  const crand=seeded(5);
  const capsules=scatter(seeded(3),22,.09,.32,.012,.22,.27,.035).map(p=>{
    const c=new THREE.Mesh(capsuleGeo,capsuleMat);
    c.position.copy(p);
    c.userData={base:p.y,spin:[0,1,2].map(()=>(crand()-.5)*2.4*Math.PI/10),start:[0,1,2].map(()=>crand()*Math.PI*2),bob:.004+crand()*.006,phase:crand()*Math.PI*2};
    swarm.add(c);
    return c;
  });

  // ---------- water droplets
  const dropPts=scatter(seeded(21),46,.075,.30,.008,.22,.24,.012);
  const drops=new THREE.InstancedMesh(new THREE.SphereGeometry(1,24,16),new THREE.MeshPhysicalMaterial({
    color:0xffffff,roughness:0,metalness:0,transmission:1,thickness:.004,ior:1.33,envMap,envMapIntensity:1.6}),dropPts.length);
  const drand=seeded(8),mtx=new THREE.Matrix4();
  dropPts.forEach((p,i)=>{const s=.0012+drand()*.0022;drops.setMatrixAt(i,mtx.makeScale(s,s,s).setPosition(p));});
  scene.add(drops);

  // ---------- gold dust that twinkles
  const dustPts=scatter(seeded(31),340,.06,.55,.004,.36,0,.004);
  const dustGeo=new THREE.BufferGeometry().setFromPoints(dustPts);
  const grand=seeded(13);
  dustGeo.setAttribute('aSeed',new THREE.Float32BufferAttribute(dustPts.map(()=>grand()),1));
  dustGeo.setAttribute('aSize',new THREE.Float32BufferAttribute(dustPts.map(()=>.0003+grand()*.0005),1));
  const dustUniforms={uTime:{value:0},uScale:{value:1000},uFade:fade,uColor:{value:lin(1,.74,.36).multiplyScalar(5)}};
  const dust=new THREE.Points(dustGeo,new THREE.ShaderMaterial({
    transparent:true,depthWrite:false,blending:THREE.AdditiveBlending,uniforms:dustUniforms,
    vertexShader:'attribute float aSeed;attribute float aSize;uniform float uTime;uniform float uScale;varying float vTwinkle;void main(){vec4 mv=modelViewMatrix*vec4(position,1.);gl_Position=projectionMatrix*mv;gl_PointSize=max(1.5,aSize*3.5*uScale/-mv.z);vTwinkle=.15+.85*pow(.5+.5*sin(uTime*(1.2+aSeed*2.)+aSeed*40.),4.);}',
    fragmentShader:'uniform vec3 uColor;uniform float uFade;varying float vTwinkle;void main(){float d=length(gl_PointCoord-.5);float a=smoothstep(.5,0.,d);a*=a*vTwinkle*uFade;gl_FragColor=vec4(uColor*a,a);\n#include <tonemapping_fragment>\n#include <colorspace_fragment>\n}',
  }));
  scene.add(dust);

  // the floor reflection: everything reflectable, mirrored under the floor and drawn before it
  const mirror=reflectable.clone();
  mirror.scale.y=-1;
  mirror.traverse(o=>{o.renderOrder=-1;});
  scene.add(mirror);
  const live=[],mirrored=[];
  reflectable.traverse(o=>live.push(o));
  mirror.traverse(o=>mirrored.push(o));

  // ---------- post: bloom on the streaks and highlights
  const target=new THREE.WebGLRenderTarget(1,1,{type:THREE.HalfFloatType,samples:4});
  const composer=new EffectComposer(renderer,target);
  composer.addPass(new RenderPass(scene,camera));
  const bloom=new UnrealBloomPass(new THREE.Vector2(1,1),.55,.35,.9);
  composer.addPass(bloom);
  composer.addPass(new OutputPass());

  let progress=0,start=null,running=true,raf=0;
  const wake=()=>{if(!raf) raf=requestAnimationFrame(frame);};

  // Keep the film's 70 mm horizontal framing; tall screens get a taller view (capped) with the products raised above the copy.
  const H_FOV=2*Math.atan(18/70);
  function resize(){
    const w=hero.clientWidth,h=hero.clientHeight,aspect=w/h;
    const dpr=Math.min(devicePixelRatio,matchMedia('(pointer:coarse)').matches?1.5:1.75);
    camera.fov=THREE.MathUtils.radToDeg(Math.min(2*Math.atan(Math.tan(H_FOV/2)/aspect),rad(40)));
    camera.aspect=aspect;
    if(aspect<.8) camera.setViewOffset(w,h,0,h*.12,w,h);
    else camera.clearViewOffset();
    camera.updateProjectionMatrix();
    renderer.setPixelRatio(dpr);
    renderer.setSize(w,h,false);
    composer.setPixelRatio(dpr);
    composer.setSize(w,h);
    dustUniforms.uScale.value=h*dpr/(2*Math.tan(rad(camera.fov)/2));
    wake(); // resizing clears the canvas
  }
  new ResizeObserver(resize).observe(hero);
  resize();

  // gentle parallax with the pointer
  const pointer={x:0,y:0,tx:0,ty:0};
  if(!reduceMotion && matchMedia('(hover:hover) and (pointer:fine)').matches){
    hero.addEventListener('pointermove',e=>{
      const r=hero.getBoundingClientRect();
      pointer.tx=(e.clientX-r.left)/r.width*2-1;
      pointer.ty=(e.clientY-r.top)/r.height*2-1;
    });
    hero.addEventListener('pointerleave',()=>{pointer.tx=pointer.ty=0;});
  }

  const story=()=>window.ScrollTrigger && ScrollTrigger.getById('p3d');
  const aim=new THREE.Vector3();

  function frame(now){
    raf=0;
    if(start===null) start=now;
    const time=reduceMotion?0:(now-start)/1000;
    const st=story();
    progress+=((st?st.progress:0)-progress)*(reduceMotion?1:.12);
    const f=1+progress*299;

    // lights come up when the scene first appears
    const reveal=reduceMotion?1:THREE.MathUtils.smoothstep(time,0,1.4);
    lights.forEach(l=>{l.intensity=l.userData.power*(.3+.7*reveal);});
    fade.value=reveal;
    glow.value=.3+.6*reveal;

    pointer.x+=(pointer.tx-pointer.x)*.05;
    pointer.y+=(pointer.ty-pointer.y)*.05;
    const a=rad(cam.angle(f)+pointer.x*3),d=cam.dist(f);
    camera.position.copy(B(cam.cx(f)+d*Math.sin(a),cam.cy(f)-d*Math.cos(a),cam.height(f)-pointer.y*.006));
    camera.lookAt(aim.copy(B(cam.ax(f),cam.ay(f),cam.az(f))));

    box.position.y=lift.box(f);
    box.rotation.y=rad(17+lift.boxSpin(f));
    bottle.position.y=lift.bottle(f);
    bottle.rotation.y=rad(lift.bottleSpin(f));
    rings.forEach(rig=>{
      rig.scale.setScalar(lift.rings(f));
      const ring=rig.children[0];
      ring.rotation.y=ring.userData.turns*Math.PI*2*time/10;
    });
    backStreaks.forEach(s=>{
      const u=(time/s.userData.period+s.userData.phase)%1;
      s.position.x=-1.3+u*2.6;
    });
    swarm.rotation.y=rad(lift.swarmTurn(f))+time*.02;
    swarm.position.y=lift.swarmRise(f);
    capsules.forEach(c=>{
      const u=c.userData;
      c.rotation.set(u.start[0]+u.spin[0]*time,u.start[1]+u.spin[1]*time,u.start[2]+u.spin[2]*time);
      c.position.y=u.base+u.bob*Math.sin(u.phase+time*.9);
    });
    drops.rotation.y=rad(lift.dropTurn(f))-time*.015;
    drops.position.y=lift.dropRise(f);
    dust.rotation.y=time*.012+progress*.25;
    dust.position.y=progress*.035;
    dustUniforms.uTime.value=time;

    for(let i=1;i<live.length;i++){
      mirrored[i].position.copy(live[i].position);
      mirrored[i].quaternion.copy(live[i].quaternion);
      mirrored[i].scale.copy(live[i].scale);
    }

    composer.render();
    if(!hero.classList.contains('is-ready')) hero.classList.add('is-ready');
    if(running && !reduceMotion) raf=requestAnimationFrame(frame);
  }
  new IntersectionObserver(([e])=>{running=e.isIntersecting && !document.hidden;if(running) wake();}).observe(hero);
  document.addEventListener('visibilitychange',()=>{running=!document.hidden;if(running) wake();});
  wake();
}

if(canvas) init().catch(err=>console.warn('Evanora 3D hero unavailable:',err));
