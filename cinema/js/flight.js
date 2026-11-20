/* Flight path, lighting and orbital hardware. All distances in the ship rig are metres. */
(function () {
  "use strict";
  const T = window.THREE;
  const lerp = (a, b, f) => a + (b - a) * f;
  const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
  function smooth(a, b, x) {
    const f = clamp((x - a) / (b - a), 0, 1);
    return f * f * (3 - 2 * f);
  }

  // Positions are expressed in the gate frame. The cameras follow the port
  // flank, the straight passage through the gate, and the stern into sunlight.
  // A rail gives the time the camera draws level and its fraction of ship speed.
  const titleShot={end:12.5,eye:[[-12.6,9.2,-13.8],[-14.3,8.0,-11.0]],aim:[[0,.20,0],[0,.17,-.5]],fov:[33,34],x:[.40,.08],y:[.11,.06]};
  const shots = [
    {end:12.5}, {end:22.5},
    { end:33.75, eye:[[-8.0,3.6,14.0],[-1.2,3.65,17.35]], aim:[[0,.18,2.0],[0,.65,-2.0]], fov:[38,40], x:[.03,0], y:[.02,-.07] },
    { end:45, eye:[[-1.2,3.65,17.35],[-2.1,2.0,17.7]], aim:[[0,.65,-2.0],[0,.8,-3.4]], fov:[40,43], x:[0,.04], y:[-.07,-.12] },
    { end:52.5, rail:[48.8,.948], eye:[[-9.2,24.0,11.4],[-9.3,24.0,11.4]], aim:[[0,.20,-.7],[0,.20,-.7]], fov:[40,40], x:[.07,.07], y:[.06,.06] },
    { end:67.5, rail:[60,.979], eye:[[.3,.7,23.2],[1.30,-.90,23.8]], aim:[[0,.42,-.65],[0,.42,-.65]], fov:[37,37], x:[.22,.28], y:[-.08,-.17] },
    { end:79, rail:[73.25,.956], eye:[[-18.68,22.53,9.56],[-18.68,22.53,9.56]], aim:[[-.54,2.77,-4.72],[-.54,2.77,-4.72]], fov:[36,36], x:[-.18,-.18], y:[.25,.19] },
    { end:90, rail:[79,1], aim:[[0,.38,-.65],[0,.38,-.65]], fov:[39,39], x:[-.22,-.22], y:[.06,.06] }
  ];

  // Keep forward motion alive on both sides of the edit. The aligned gate
  // cameras dissolve directly. Large reversals pass through the shutter.
  const edits = [
    {index:0, before:.62, after:.68, matched:true, veil:.22},
    {index:1, before:.64, after:.76, dip:true},
    {index:2, before:.66, after:.76},
    {index:3, before:.54, after:.70, dip:true},
    {index:4, before:.68, after:.80, veil:.66},
    {index:5, before:.62, after:.82, dip:true},
    {index:6, before:.72, after:.84, veil:.76}
  ].map(edit=>{
    const cut=shots[edit.index].end;
    return {...edit,cut,start:cut-edit.before,end:cut+edit.after};
  });
  function shotAt(time) {
    const index=shots.findIndex(shot=>time<shot.end);
    return index<0?shots.length-1:index;
  }

  // Each change of viewpoint has its own inertial star/limb reference.
  // The matched rear views through the gate share one reference.
  const skyTakes=[0,1,2,2,3,4,5,6];
  const skyReferences=[17.5,28,48.8,60,73.25,84];
  const horizons = [
    [[0,0],[-.08,.045]], [[-.23,-.11],[-.14,-.035]],
    [[-.31,-.23],[-.22,-.16]], [[-.22,-.16],[-.19,-.10]],
    [[.81,-.28],[.72,-.25]], [[-.10,-.04],[.04,.005]],
    [[.04,-.045],[.07,-.055]], [[.05,-.09],[-.07,-.14]]
  ];

  // The hull reflects the night sky, a dim blue planet below, and a small sun.
  // These values remain linear and may exceed 1 before reflection prefiltering.
  function reflectionField(renderer) {
    const w = 256, h = 128;
    const data = new Uint16Array(w * h * 4);
    const half = T.DataUtils.toHalfFloat;
    const direction = new T.Vector3();
    const sun = new T.Vector3(1.0,.43,.38).normalize();
    const highSky = new T.Vector3(-.38,.63,-.65).normalize();
    for (let j=0, i=0; j<h; j++) {
      const lat = ((j+.5)/h-.5)*Math.PI;
      for (let k=0; k<w; k++) {
        const lon = ((k+.5)/w-.5)*2*Math.PI;
        direction.set(Math.cos(lon)*Math.cos(lat),Math.sin(lat),Math.sin(lon)*Math.cos(lat));
        const y = direction.y;
        const ground = smooth(.13,-.45,y);
        const horizon = Math.exp(-Math.abs(y+.07+.13*direction.x)*15);
        const sky = Math.pow(Math.max(0,direction.dot(highSky)),5);
        const solar = Math.pow(Math.max(0,direction.dot(sun)),200)*8.0;
        data[i++] = half(.025+.065*ground+.40*horizon+.32*sky+solar);
        data[i++] = half(.036+.135*ground+.56*horizon+.54*sky+.65*solar);
        data[i++] = half(.072+.27*ground+.92*horizon+.86*sky+.35*solar);
        data[i++] = half(1);
      }
    }
    const tex = new T.DataTexture(data,w,h,T.RGBAFormat,T.HalfFloatType);
    tex.mapping = T.EquirectangularReflectionMapping;
    tex.colorSpace = T.LinearSRGBColorSpace;
    tex.needsUpdate = true;
    const pmrem = new T.PMREMGenerator(renderer);
    const result = pmrem.fromEquirectangular(tex);
    pmrem.dispose();
    tex.dispose();
    return result;
  }

  function rockyMoon(scene,lunarBearing) {
    // One low-resolution spherical atlas contains regolith albedo and the slopes
    // of actual overlapping impact bowls. Sampling directions instead of UVs
    // when generating it keeps the crater shapes circular across the seam.
    const width=256, height=128, heights=new Float32Array(width*height);
    const pixels=new Uint8Array(width*height*4), craters=[];
    let seed=0x14b7cc39;
    function random() {
      seed=(Math.imul(seed,1664525)+1013904223)>>>0;
      return seed/4294967296;
    }
    const grid=Float32Array.from({length:32*32*32},random);
    function noise(x,y,z) {
      const ix=Math.floor(x), iy=Math.floor(y), iz=Math.floor(z);
      function coast(t) { return t*t*(3-2*t); }
      const a=coast(x-ix), b=coast(y-iy), c=coast(z-iz);
      function sample(i,j,k) { return grid[((k&31)*32+(j&31))*32+(i&31)]; }
      function plane(k) {
        return lerp(lerp(sample(ix,iy,k),sample(ix+1,iy,k),a),
          lerp(sample(ix,iy+1,k),sample(ix+1,iy+1,k),a),b);
      }
      return lerp(plane(iz),plane(iz+1),c);
    }
    for(let i=0;i<115;i++) {
      const y=2*random()-1, lon=2*Math.PI*random(), r=Math.sqrt(1-y*y);
      const radius=i<7?.155+.105*random():i<33?.072+.073*random():.028+.050*random();
      craters.push({x:r*Math.cos(lon),y,z:r*Math.sin(lon), radius,
        near:Math.cos(radius*1.43),scale:1/(1-Math.cos(radius)),age:.53+.47*random()});
    }
    for(let j=0;j<height;j++) {
      const lat=Math.PI*((j+.5)/height-.5), y=Math.sin(lat), cosLat=Math.cos(lat);
      for(let i=0;i<width;i++) {
        const lon=2*Math.PI*(i+.5)/width, x=-Math.cos(lon)*cosLat, z=Math.sin(lon)*cosLat;
        const basin=noise(x*2.6+8,y*2.6+12,z*2.6+5), rock=noise(x*9+2,y*9+4,z*9+18);
        const grain=noise(x*28+6,y*28+19,z*28+4);
        let relief=.007*(rock-.5)+.002*(grain-.5);
        let albedo=.54-.18*smooth(.47,.71,basin)+.14*(rock-.5)+.065*(grain-.5);
        for(const crater of craters) {
          const dot=x*crater.x+y*crater.y+z*crater.z;
          if(dot<crater.near) continue;
          const q=Math.sqrt(Math.max(0,(1-dot)*crater.scale));
          const floor=Math.max(0,1-q*q);
          const rim=Math.exp(-Math.pow((q-.96)/.135,2));
          const ejecta=Math.exp(-5.1*Math.max(0,q-1))*smooth(.86,1.04,q);
          relief+=crater.radius*crater.age*(-.12*floor*floor+.048*rim);
          albedo+=crater.age*(.091*rim+.032*ejecta-.045*floor);
          if(crater.radius>.155) relief+=.024*crater.radius*Math.exp(-38*q*q);
        }
        const index=j*width+i;
        heights[index]=relief;
        pixels[4*index+2]=Math.round(255*clamp(albedo,.18,.83));
        pixels[4*index+3]=255;
      }
    }
    for(let j=0;j<height;j++) {
      const cosLat=Math.max(.08,Math.cos(Math.PI*((j+.5)/height-.5)));
      for(let i=0;i<width;i++) {
        const ix=j*width+i, left=j*width+(i+width-1)%width, right=j*width+(i+1)%width;
        const down=Math.max(0,j-1)*width+i, up=Math.min(height-1,j+1)*width+i;
        const slopeX=(heights[left]-heights[right])*width/(4*Math.PI*cosLat);
        const slopeY=(heights[down]-heights[up])*height/(2*Math.PI);
        pixels[4*ix]=Math.round(255*(.5+.5*clamp(slopeX,-1,1)));
        pixels[4*ix+1]=Math.round(255*(.5+.5*clamp(slopeY,-1,1)));
      }
    }
    const atlas=new T.DataTexture(pixels,width,height,T.RGBAFormat);
    atlas.wrapS=T.RepeatWrapping;
    atlas.minFilter=T.LinearMipmapLinearFilter;
    atlas.magFilter=T.LinearFilter;
    atlas.generateMipmaps=true;
    atlas.needsUpdate=true;
    // Offset the moon from the dawn sun so its narrow illuminated rim reads
    // clearly on both the wide frame and the portrait crop.
    const distance=428;
    const u={surfaceAtlas:{value:atlas},sunAtMoon:{value:new T.Vector3()},
      planetCenter:{value:new T.Vector2()},planetRadius:{value:10},frameAspect:{value:1}};
    const material=new T.ShaderMaterial({
      uniforms:u,depthTest:true,depthWrite:true,toneMapped:false,
      blending:T.CustomBlending,blendSrc:T.SrcAlphaFactor,blendDst:T.OneMinusSrcAlphaFactor,
      vertexShader:`
        varying vec2 cell;
        varying vec3 worldNormal, worldTangent, toEye;
        varying vec4 skyClip;
        void main(){
          cell=uv;
          vec4 world=modelMatrix*vec4(position,1.0);
          toEye=cameraPosition-world.xyz;
          worldNormal=mat3(modelMatrix)*normal;
          vec3 east=vec3(normal.z,0.0,-normal.x);
          worldTangent=mat3(modelMatrix)*(dot(east,east)>.000001?normalize(east):vec3(1.0,0.0,0.0));
          skyClip=projectionMatrix*viewMatrix*world;
          gl_Position=skyClip;
        }`,
      fragmentShader:`
        uniform sampler2D surfaceAtlas;
        uniform vec3 sunAtMoon;
        uniform vec2 planetCenter;
        uniform float planetRadius,frameAspect;
        varying vec2 cell;
        varying vec3 worldNormal,worldTangent,toEye;
        varying vec4 skyClip;
        void main(){
          vec2 film=skyClip.xy/skyClip.w*vec2(frameAspect,1.0);
          float clearance=length(film-planetCenter)-planetRadius;
          if(clearance<=0.0) discard;
          vec3 terrain=texture2D(surfaceAtlas,cell).rgb;
          vec3 face=normalize(worldNormal), east=normalize(worldTangent);
          vec2 slopes=2.0*terrain.rg-1.0;
          vec3 n=normalize(face+slopes.x*east+slopes.y*cross(face,east));
          float incidence=max(0.0,dot(n,sunAtMoon));
          float view=max(.015,dot(n,normalize(toEye)));
          // Dusty, porous rock scatters at oblique illumination. The solar
          // direction is shared with the visible photosphere and the ship.
          float scattering=mix(incidence,incidence/(incidence+view+.065),.40);
          scattering*=smoothstep(-.074,.054,dot(face,sunAtMoon));
          vec3 rocks=vec3(.0058,.0085,.014)*(.48+.52*view)
                    +terrain.b*scattering*vec3(.85,.85,.875);
          gl_FragColor=vec4(rocks,smoothstep(0.0,.055,clearance));
        }`
    });
    const mesh=new T.Mesh(new T.SphereGeometry(distance*Math.tan(.0154),40,28),material);
    mesh.name="Distant cratered moon";
    mesh.rotation.set(-.27,.69,-.14);
    // Stars are already present, and all local hardware is drawn closer than this shell.
    mesh.renderOrder=-9998;
    scene.add(mesh);
    const lunarPole=mesh.quaternion.clone(), skyToScene=new T.Matrix3(), lunarFrame=new T.Matrix4();
    return function updateMoon(camera,sky,sunDirection) {
      skyToScene.setFromMatrix4(camera.matrixWorld).multiply(sky.viewFromSky);
      mesh.position.copy(lunarBearing).applyMatrix3(skyToScene).multiplyScalar(distance).add(camera.position);
      mesh.quaternion.setFromRotationMatrix(lunarFrame.setFromMatrix3(skyToScene)).multiply(lunarPole);
      u.sunAtMoon.value.copy(sunDirection);
      u.planetCenter.value.copy(sky.planetCenter);
      u.planetRadius.value=sky.planetRadius;
      u.frameAspect.value=camera.aspect;
    };
  }

  // Integrate the main engines in the inertial frame of the transfer gate.
  // Slewing the hull redirects future thrust; the velocity it already has
  // survives the manoeuvre. The two axial engines have the same throttle.
  function flightCourse() {
    const step=.125, endTime=90, samples=[];
    function throttle(t) {
      const gateBurn=smooth(22.4,25.2,t)*(1-smooth(38.8,44.8,t));
      const correction=smooth(50,56,t)*(1-smooth(65,72,t));
      return .17+.76*gateBurn+.15*correction+.24*smooth(72,82,t);
    }
    function yaw(t) {
      return .046-.036*smooth(7,35,t)-.140*smooth(49,86,t)-.040*smooth(69,85,t);
    }
    function pitch(t) {
      return .018-.015*smooth(18,35,t)+.062*smooth(49,81,t)+.196*smooth(69,85,t);
    }
    function axis(t,out) {
      const heading=yaw(t), elevation=pitch(t);
      return out.set(-Math.sin(heading)*Math.cos(elevation),Math.sin(elevation),-Math.cos(heading)*Math.cos(elevation));
    }
    const origin=new T.Vector3(), impulse=new T.Vector3();
    const momentum=axis(0,new T.Vector3()).multiplyScalar(3.15);
    for(let i=0;i<=endTime/step;i++) {
      if(i) {
        const mid=(i-.5)*step;
        axis(mid,impulse).multiplyScalar(.60*(throttle(mid)-.17)*step);
        origin.addScaledVector(momentum,step).addScaledVector(impulse,.5*step);
        momentum.add(impulse);
      }
      samples.push({position:origin.clone(),velocity:momentum.clone()});
    }
    const gateOrigin=samples[40.5/step].position.clone();
    for(const sample of samples) sample.position.sub(gateOrigin);
    const increment=new T.Vector3(), pace=new T.Vector3();
    function velocity(t,out) {
      const coordinate=clamp(t/step,0,samples.length-1);
      const i=Math.min(Math.floor(coordinate),samples.length-2);
      return out.lerpVectors(samples[i].velocity,samples[i+1].velocity,coordinate-i);
    }
    function position(t,out) {
      if(t<=0) return out.copy(samples[0].position).addScaledVector(samples[0].velocity,t);
      const last=samples[samples.length-1];
      if(t>=endTime) return out.copy(last.position).addScaledVector(last.velocity,t-endTime);
      const i=Math.floor(t/step), elapsed=t-i*step, a=samples[i];
      increment.subVectors(samples[i+1].velocity,a.velocity);
      return out.copy(a.position).addScaledVector(a.velocity,elapsed).addScaledVector(increment,.5*elapsed*elapsed/step);
    }
    return {position,velocity,speed:t=>velocity(t,pace).length(),yaw,pitch,throttle};
  }

  function orbitalIons(scene,course,frameSize) {
    // Each ion occupies one inertial coordinate. It leaves the image through
    // perspective as the camera overtakes it, and stays put during a pause.
    const locations=[], grains=[], center=new T.Vector3(), forward=new T.Vector3();
    const right=new T.Vector3(), up=new T.Vector3(), vertical=new T.Vector3(0,1,0);
    let seed=0x82b40371;
    function sample() {
      seed=(Math.imul(1664525,seed)+1013904223)>>>0;
      return seed/4294967296;
    }
    for(let t=-16;t<101;t+=(.45+.60*sample())/course.speed(t)) {
      course.position(t,center);
      course.velocity(t,forward).normalize();
      right.crossVectors(forward,vertical).normalize();
      up.crossVectors(right,forward);
      const radius=Math.sqrt(8+1190*sample()), phase=2*Math.PI*sample();
      center.addScaledVector(right,radius*Math.cos(phase)).addScaledVector(up,radius*Math.sin(phase));
      locations.push(center.x,center.y,center.z);
      const grain=sample();
      grains.push(.009+.018*grain,.23+.61*grain*grain,sample());
    }
    const geometry=new T.InstancedBufferGeometry();
    geometry.setIndex([0,1,2,0,2,3]);
    geometry.setAttribute("position",new T.Float32BufferAttribute([0,-1,0,1,-1,0,1,1,0,0,1,0],3));
    geometry.setAttribute("ionLocation",new T.InstancedBufferAttribute(new Float32Array(locations),3));
    geometry.setAttribute("grain",new T.InstancedBufferAttribute(new Float32Array(grains),3));
    geometry.instanceCount=grains.length/3;
    const shutter=new T.Vector3();
    const material=new T.ShaderMaterial({
      uniforms:{frameSize:{value:frameSize},shutter:{value:shutter}},transparent:true,
      depthTest:true,depthWrite:false,toneMapped:false,blending:T.AdditiveBlending,
      vertexShader:`
        attribute vec3 ionLocation,grain;
        uniform vec2 frameSize;
        uniform vec3 shutter;
        varying vec2 spot;
        varying float tail,width,energy,hue;
        void main(){
          vec4 here=viewMatrix*vec4(ionLocation,1.0);
          float range=length(here.xyz);
          if(here.z>-.40 || range>45.0 || range<2.5){
            gl_Position=vec4(2.0,2.0,2.0,1.0);
            spot=vec2(0.0);tail=0.0;width=1.0;energy=0.0;hue=0.0;return;
          }
          vec4 head=projectionMatrix*here;
          float nearFlow=1.0-smoothstep(12.0,33.0,range);
          vec4 past=projectionMatrix*(here+vec4(mat3(viewMatrix)*shutter*nearFlow,0.0));
          vec2 delta=.5*frameSize*(past.xy/max(.28,past.w)-head.xy/head.w);
          float span=length(delta), pixelScale=clamp(frameSize.y/720.0,.62,2.0);
          vec2 along=span>.001?delta/span:vec2(1.0,0.0);
          tail=min(span,13.0*pixelScale)*(.66+.42*grain.z);
          width=clamp(.5*projectionMatrix[1][1]*frameSize.y*grain.x/head.w,.48*pixelScale,1.32*pixelScale);
          energy=grain.y*smoothstep(2.5,5.4,range)*(1.0-smoothstep(21.0,45.0,range));
          hue=grain.z;
          spot=vec2(mix(-2.5*width,tail+2.5*width,position.x),position.y*2.5*width);
          vec2 offset=along*spot.x+vec2(-along.y,along.x)*spot.y;
          head.xy+=2.0*offset*head.w/frameSize;
          gl_Position=head;
        }`,
      fragmentShader:`
        varying vec2 spot;
        varying float tail,width,energy,hue;
        void main(){
          float along=clamp(spot.x/max(tail,.001),0.0,1.0);
          float d=length(vec2(max(max(-spot.x,spot.x-tail),0.0),spot.y));
          float r=d/(width*(1.0-.36*along));
          float glow=exp(-1.08*r*r-2.15*along);
          vec3 plasma=mix(vec3(.068,.56,.72),vec3(.29,.41,.78),hue);
          plasma+=vec3(.14,.19,.17)*exp(-3.2*r*r-4.0*along);
          gl_FragColor=vec4(plasma*glow*energy,1.0);
        }`
    });
    const ions=new T.Mesh(geometry,material);
    ions.name="Orbital ion traces";
    ions.frustumCulled=false;
    scene.add(ions);
    return function updateIons(time) {course.velocity(time,shutter).multiplyScalar(.036);};
  }

  function orbitalGate() {
    const gate=new T.Group(), radius=14.5, sectors=48, turn=Math.PI*2;
    const plate=0, steel=1, primer=2, casing=3, rail=4, solar=5;
    const tile=128, columns=4, rows=8;
    const inset=2.5/tile, chartSpan=1-2*inset;

    // Each part has four baked finishes. Colour uses sRGB; the other atlas stores
    // tangent-space slopes in RG, roughness in B and exposed metal in A.
    function surfaceAtlases() {
      const width=tile*columns, height=tile*rows;
      const pigment=new Uint8Array(width*height*4), finish=new Uint8Array(width*height*4);
      const relief=new Float32Array(tile*tile);
      let seed=0x746f8531;
      function random() {
        seed=(Math.imul(seed,1664525)+1013904223)>>>0;
        return seed/4294967296;
      }
      const noiseGrid=Float32Array.from({length:64*64},random);
      function noise(x,y) {
        const a=Math.floor(x), b=Math.floor(y);
        let u=x-a, v=y-b;
        u=u*u*(3-2*u); v=v*v*(3-2*v);
        const p=(b&63)*64, q=((b+1)&63)*64;
        return lerp(lerp(noiseGrid[p+(a&63)],noiseGrid[p+((a+1)&63)],u),
          lerp(noiseGrid[q+(a&63)],noiseGrid[q+((a+1)&63)],u),v);
      }
      const palette=[
        [177,173,154,.52,.22], [84,93,96,.57,.67], [163,79,51,.55,.37],
        [102,108,106,.53,.48], [133,141,141,.40,.77], [38,54,72,.32,.31]
      ];
      for (let skin=0;skin<palette.length;skin++) for (let variant=0;variant<columns;variant++) {
        const offset=(skin*width+variant)*tile, ox=random()*62, oy=random()*62;
        const [red,green,blue,baseRough,baseMetal]=palette[skin];
        const hatchX=.29+.41*random(), hatchY=.42+.14*random();
        const hatchW=(skin===casing?.32:.20)+.05*random();
        const hatchH=skin===casing?.33:.26;
        const joint=.10+.24*random(), age=.78+.42*random();
        const shade=[1.02,.85,1.09,.95][variant];
        for (let y=0;y<tile;y++) for (let x=0;x<tile;x++) {
          const u=clamp((x-2)/(tile-5),0,1), v=clamp((y-2)/(tile-5),0,1);
          const macro=noise(ox+u*3.1,oy+v*3.7);
          const fleck=noise(ox+u*29,oy+v*34), grain=random()-.5;
          const brushing=noise(oy+u*4,ox+v*39);
          const edge=Math.min(u,1-u,v,1-v);
          let r,g,b,rough,metal,elevation;
          if (skin===solar) {
            // Cropped wafer corners, silver busbars and individual coverglass
            // tints. The thin fingers resolve into a dull sheen at a distance.
            const col=Math.floor(u*3.999), row=Math.floor(v*8.999);
            const cx=u*3.999-col, cy=v*8.999-row;
            const dx=Math.min(cx,1-cx), dy=Math.min(cy,1-cy);
            const cell=smooth(.007,.032,Math.min(dx,dy*.60,(dx+dy*.60-.064)*.71));
            const bus=(1-smooth(.012,.040,Math.min(Math.abs(cx-.31),Math.abs(cx-.70))))*cell;
            const finger=(1-smooth(.035,.15,Math.abs((cy*6)%1-.5)))*cell;
            const glass=noise(ox+col*7,oy+row*4), smudge=smooth(.48,.83,macro);
            r=lerp(91,15+25*glass+10*smudge,cell)+39*bus+5*finger;
            g=lerp(87,33+23*glass+9*smudge,cell)+41*bus+6*finger;
            b=lerp(76,49+40*glass+3*smudge,cell)+38*bus+6*finger;
            rough=.50-.32*cell+.11*smudge+.09*(1-glass)+.08*bus;
            metal=.71-.42*cell+.32*bus;
            elevation=.52*cell+.11*bus+.10*(macro-.5);
          } else {
            const hatch=skin===plate || skin===casing;
            const rim=Math.max(Math.abs(u-hatchX)-hatchW,Math.abs(v-hatchY)-hatchH);
            const inside=hatch ? 1-smooth(-.007,.012,rim) : 0;
            const seam=hatch ? 1-smooth(.003,.018,Math.abs(rim)) : 0;
            const collar=(skin===rail || skin===steel)
              ? 1-smooth(.012,.035,Math.abs(u-joint)) : 0;
            const lap=skin===primer ? 1-smooth(.012,.027,Math.abs(v-.79)) : 0;
            const rubbed=(1-smooth(.014,.147,edge))*smooth(.30,.70,fleck+.18*(macro-.5));
            const flakes=smooth(.52,.77,fleck+.35*(macro-.5)-1.3*edge)*age;
            const exposed=clamp(.80*flakes+.33*rubbed,0,1);
            const pocket=hatch ? (1-smooth(.0,.11,Math.abs(rim)))*(.32+.68*macro) : 0;
            const dirt=clamp(age*(.51*smooth(.46,.91,macro)+.22*pocket+.11*(1-brushing)),0,.78);
            let coat=shade*(1-.40*dirt+.17*(macro-.5)+.12*(brushing-.5)+.045*grain);
            coat*=1-.15*inside-.44*seam-.25*collar-.19*lap;
            let slot=0;
            if (skin===casing && inside>.5) {
              // The heat exchanger is recessed on one side of the service hatch.
              const louvers=smooth(.10,.19,u-hatchX+hatchW)*(1-smooth(.28,.32,u-hatchX+hatchW))
                *smooth(.03,.08,v-hatchY+hatchH)*(1-smooth(.53,.59,v-hatchY+hatchH));
              slot=louvers*(1-smooth(.16,.44,Math.abs((v*12)%1-.5)));
              coat*=1-.48*slot;
            }
            const bare=skin===primer ? 153 : skin===steel ? 130 : 155;
            r=lerp(red*coat,bare+8*brushing,exposed);
            g=lerp(green*coat,skin===primer?105:bare+1,exposed);
            b=lerp(blue*coat,skin===primer?79:bare-3,exposed);
            rough=clamp(baseRough+.28*dirt+.10*seam+.12*slot+.09*(fleck-.5)-.28*exposed,.21,.86);
            metal=lerp(baseMetal,.90,exposed)*(1-.26*dirt);
            elevation=.24*(macro-.5)+.24*(brushing-.5)+.16*grain
              +.68*inside-1.42*seam+.95*collar+.64*lap-.44*exposed-1.1*slot;
          }
          const i=4*(offset+y*width+x);
          pigment[i]=r; pigment[i+1]=g; pigment[i+2]=b; pigment[i+3]=255;
          finish[i+2]=255*rough; finish[i+3]=255*metal;
          relief[y*tile+x]=elevation;
        }

        // Stamp impressions into the same height and finish channels as the
        // paint. Tool scars cluster around access routes; glass gets small pits.
        function mark(cx,cy,rx,ry,angle,kind) {
          const cs=Math.cos(angle), sn=Math.sin(angle);
          const ex=Math.abs(rx*cs)+Math.abs(ry*sn), ey=Math.abs(rx*sn)+Math.abs(ry*cs);
          for (let y=Math.max(0,Math.floor(cy-ey));y<=Math.min(tile-1,Math.ceil(cy+ey));y++) {
            for (let x=Math.max(0,Math.floor(cx-ex));x<=Math.min(tile-1,Math.ceil(cx+ex));x++) {
              const a=((x-cx)*cs+(y-cy)*sn)/rx, b=((y-cy)*cs-(x-cx)*sn)/ry;
              const distance=a*a+b*b;
              if (distance>=1) continue;
              const i=4*(offset+y*width+x), p=y*tile+x;
              let amount, value, heightChange, rough;
              if (kind==="bolt") {
                const head=1-smooth(.48,.65,distance), slot=1-smooth(.09,.24,Math.abs(b));
                amount=.83*(1-smooth(.79,1,distance));
                value=48+92*head-61*head*slot;
                heightChange=-1.2+2.4*head-1.6*head*slot; rough=.36;
              } else if (kind==="pit") {
                const lip=1-smooth(.07,.35,Math.abs(distance-.64));
                amount=.58*(1-distance); value=48+92*lip;
                heightChange=-1.6*(1-distance)+1.05*lip; rough=.68;
              } else {
                amount=.73*(1-distance)*(.65+.35*random()); value=skin===solar?100:161;
                heightChange=-.88*(1-distance); rough=skin===solar?.65:.32;
              }
              pigment[i]=lerp(pigment[i],value,amount);
              pigment[i+1]=lerp(pigment[i+1],value*.99,amount);
              pigment[i+2]=lerp(pigment[i+2],value*.94,amount);
              finish[i+2]=lerp(finish[i+2],255*rough,amount);
              const exposedMetal=skin===solar?20:kind==="pit"?105:216;
              finish[i+3]=lerp(finish[i+3],exposedMetal,amount);
              relief[p]+=heightChange;
            }
          }
        }
        if (skin===plate || skin===casing) for (const side of [-1,1]) for (const end of [-1,1]) {
          mark(2+(hatchX+side*(hatchW-.045))*(tile-5),2+(hatchY+end*(hatchH-.059))*(tile-5),
            skin===casing?2.6:2.1,skin===casing?2.6:2.1,random()*3,"bolt");
        }
        for (let i=0;i<(skin===solar?3:13);i++) {
          const length=3+random()*15, cx=(.1+.8*random())*tile;
          const cy=skin===solar ? random()*tile : ((i%3===0?.19:.73)+.21*(random()-.5))*tile;
          mark(cx,cy,length,.52+random()*.77,(skin===solar?.8:.18)*(random()-.5),"scuff");
        }
        for (let i=0;i<(skin===solar?2:8);i++) {
          const size=(skin===solar?.45:1.0)+2.9*random();
          mark(random()*tile,random()*tile,size,size*(.60+.37*random()),random()*3,"pit");
        }
        for (let y=0;y<tile;y++) for (let x=0;x<tile;x++) {
          const i=4*(offset+y*width+x);
          const dx=.57*(relief[y*tile+Math.max(x-1,0)]-relief[y*tile+Math.min(x+1,tile-1)]);
          const dy=.57*(relief[Math.max(y-1,0)*tile+x]-relief[Math.min(y+1,tile-1)*tile+x]);
          const norm=1/Math.sqrt(1+dx*dx+dy*dy);
          finish[i]=Math.round(127.5*(1+dx*norm)); finish[i+1]=Math.round(127.5*(1+dy*norm));
        }
      }
      function texture(data,space) {
        const map=new T.DataTexture(data,width,height,T.RGBAFormat);
        map.colorSpace=space;
        map.generateMipmaps=true;
        map.minFilter=T.LinearMipmapLinearFilter; map.magFilter=T.LinearFilter;
        map.anisotropy=4; map.needsUpdate=true;
        return map;
      }
      return [texture(pigment,T.SRGBColorSpace),texture(finish,T.NoColorSpace)];
    }

    const [paint,finish]=surfaceAtlases();
    const surface=new T.MeshStandardMaterial({map:paint,normalMap:finish,roughness:1,metalness:1});
    const amber=new T.MeshBasicMaterial({color:new T.Color(3.4,.65,.19)});
    const blue=new T.MeshBasicMaterial({color:new T.Color(.30,1.65,2.3)});
    const lanes=[
      {material:amber,count:24,offset:.12,r:radius-.91,z:.28,w:.72,h:.14,d:.11,reach:2.32},
      {material:blue,count:8,offset:.5,r:radius-.88,z:-.12,w:.90,h:.15,d:.21,reach:2.85},
      {material:blue,count:3,offset:0,r:radius+1.60,z:1.17,w:1.80,h:.15,d:.12,reach:4.60}
    ];
    const levels=new Uint8Array(64*4), powerMap=new T.DataTexture(levels,64,1,T.RGBAFormat);
    powerMap.needsUpdate=true;
    let first=0;
    for (const lane of lanes) {lane.first=first;first+=lane.count;}
    const lanePositions=lanes.map(l=>new T.Vector4(l.count,l.offset,l.r,l.z));
    const laneSizes=lanes.map(l=>new T.Vector3(l.w*.5,l.reach,l.first));
    const lampColors=lanes.map(l=>l.material.color);

    surface.onBeforeCompile=shader=>{
      Object.assign(shader.uniforms,{gatePowers:{value:powerMap},gateWorld:{value:gate.matrixWorld},
        lanePositions:{value:lanePositions},laneSizes:{value:laneSizes},lampColors:{value:lampColors}});
      shader.vertexShader=shader.vertexShader.replace("#include <common>",`#include <common>
        varying vec3 gatePosition;
        #ifdef USE_INSTANCING
          attribute vec2 gateChart;
          attribute float gateFace;
        #endif`).replace("#include <uv_vertex>",`#include <uv_vertex>
        #ifdef USE_INSTANCING
          vec2 atlasGrid=vec2(${columns.toFixed(1)},${rows.toFixed(1)});
          vec2 chart=vec2(mod(gateChart.x+gateFace,atlasGrid.x),gateChart.y);
          vMapUv=(chart+${inset}+${chartSpan}*uv)/atlasGrid;
          vNormalMapUv=vMapUv;
          gatePosition=(instanceMatrix*vec4(position,1.0)).xyz;
        #else
          gatePosition=position;
        #endif`);
      shader.fragmentShader=shader.fragmentShader.replace("#include <common>",`#include <common>
        varying vec3 gatePosition;
        uniform mat4 gateWorld;
        uniform sampler2D gatePowers;
        uniform vec4 lanePositions[3];
        uniform vec3 laneSizes[3],lampColors[3];`)
        .replace("#include <roughnessmap_fragment>",`vec4 coating=texture2D(normalMap,vNormalMapUv);
          float roughnessFactor=coating.b;`)
        .replace("#include <metalnessmap_fragment>","float metalnessFactor=coating.a;")
        .replace("#include <normal_fragment_maps>",`vec2 slope=coating.rg*2.0-1.0;
          normal=normalize(tbn*vec3(slope,sqrt(max(.02,1.0-dot(slope,slope)))));`)
        .replace("#include <lights_fragment_end>",`#include <lights_fragment_end>
          // Each luminaire is a finite strip. Its real chase level illuminates
          // the adjacent metal; roughness and the view vector determine the glint.
          float azimuth=atan(gatePosition.y,gatePosition.x)/6.2831853;
          mat3 gateToEye=mat3(viewMatrix)*mat3(gateWorld);
          for(int j=0;j<3;j++){
            vec4 lane=lanePositions[j]; vec3 size=laneSizes[j];
            float sector=azimuth*lane.x-lane.y, nearest=floor(sector+.5);
            float theta=(nearest+lane.y)*6.2831853/lane.x;
            vec2 radial=vec2(cos(theta),sin(theta)), tangent=vec2(-radial.y,radial.x);
            vec3 delta=vec3(radial*lane.z,lane.w)-gatePosition;
            delta.xy+=tangent*clamp(-dot(delta.xy,tangent),-size.x,size.x);
            float dist2=dot(delta,delta), falloff=max(0.0,1.0-dist2/(size.y*size.y));
            if(falloff>0.0){
              float index=size.z+mod(nearest,lane.x);
              float power=5.0*texture2D(gatePowers,vec2((index+.5)/64.0,.5)).r;
              float fade=1.0-smoothstep(.36,.5,abs(sector-nearest));
              vec3 flux=lampColors[j]*(power*fade*falloff*falloff/(.24+dist2));
              IncidentLight fixture;
              fixture.visible=true; fixture.direction=normalize(gateToEye*delta+vec3(0.,0.,.00001));
              fixture.color=1.15*flux;
              RE_Direct(fixture,geometryPosition,geometryNormal,geometryViewDir,geometryClearcoatNormal,material,reflectedLight);
              // First diffuse return from the reflector around the recessed strip.
              reflectedLight.indirectDiffuse+=.19*flux*BRDF_Lambert(material.diffuseColor);
            }
          }`);
    };

    // A shallow bevel on the box edges provides a real grazing surface, even
    // where the plate is seen end-on. Preserve the face coordinates for the atlas.
    const box=new T.BoxGeometry(1,1,1,3,3,3);
    const pos=box.attributes.position, normals=box.attributes.normal, uvs=box.attributes.uv;
    const face=new Float32Array(pos.count), p=new T.Vector3(), q=new T.Vector3(), n=new T.Vector3();
    const stretch=v=>Math.sign(v)*(Math.abs(v)>.4?.5:.445);
    const uvEdge=v=>v<.1?0:v>.9?1:v<.5?.055:.945;
    for (let i=0;i<pos.count;i++) {
      n.fromBufferAttribute(normals,i);
      face[i]=n.z>.5?0:n.z<-.5?2:Math.abs(n.y)>.5?1:3;
      p.set(stretch(pos.getX(i)),stretch(pos.getY(i)),stretch(pos.getZ(i)));
      q.copy(p).clampScalar(-.445,.445);
      n.copy(p).sub(q).normalize();
      p.copy(q).addScaledVector(n,.055); pos.setXYZ(i,p.x,p.y,p.z); normals.setXYZ(i,n.x,n.y,n.z);
      uvs.setXY(i,uvEdge(uvs.getX(i)),uvEdge(uvs.getY(i)));
    }
    box.setAttribute("gateFace",new T.BufferAttribute(face,1));
    const transform=new T.Object3D(), tint=new T.Color();
    function mount(skin,count,generator) {
      const coated=typeof skin==="number", geometry=coated?box.clone():box;
      const mesh=new T.InstancedMesh(geometry,coated?surface:skin,count);
      const charts=coated?new Float32Array(count*2):null;
      for (let i=0;i<count;i++) {
        const [angle,r,z,w,h,d,bank]=generator(i);
        transform.position.set(Math.cos(angle)*r,Math.sin(angle)*r,z);
        transform.rotation.set(0,0,angle+Math.PI*.5+(bank || 0));
        transform.scale.set(w,h,d); transform.updateMatrix(); mesh.setMatrixAt(i,transform.matrix);
        if (coated) {
          const part=i*13+Math.round((angle+1)*57)+Math.floor(r*23);
          charts[2*i]=(part+Math.floor(part/9))&3; charts[2*i+1]=skin;
          const level=.85+.23*((part*37%59)/58);
          mesh.setColorAt(i,tint.setRGB(level,level*.98+.018,level*.95+.042));
        }
      }
      if (coated) geometry.setAttribute("gateChart",new T.InstancedBufferAttribute(charts,2));
      gate.add(mesh);
      return mesh;
    }
    function rolledRail(r,thickness,z) {
      const indexed=new T.TorusGeometry(r,thickness,10,sectors*4);
      const geometry=indexed.toNonIndexed(); indexed.dispose();
      const uv=geometry.attributes.uv;
      for (let i=0;i<uv.count;i+=3) {
        const bay=Math.floor((uv.getX(i)+uv.getX(i+1)+uv.getX(i+2))*sectors/3);
        const chart=(bay+Math.floor(bay/3)+(z>0?1:0))&3;
        for (let k=i;k<i+3;k++) uv.setXY(k,
          (chart+inset+chartSpan*(uv.getX(k)*sectors-bay))/columns,
          (rail+inset+chartSpan*uv.getY(k))/rows);
      }
      geometry.translate(0,0,z);
      gate.add(new T.Mesh(geometry,surface));
    }
    rolledRail(radius,.20,-.65); rolledRail(radius,.20,.65);
    rolledRail(radius-.95,.12,0);
    const bay=i=>i*turn/sectors;
    mount(plate,sectors,i=>[bay(i),radius+.14,(i%5-2)*.014,1.46+(i%3)*.025,
      .46+(i%7===0?.09:0),1.48+(i%4)*.035]);
    mount(steel,sectors,i=>[bay(i+.49),radius-.38,0,.20,1.09,1.08,.24+(i%3)*.025]);
    mount(primer,12,i=>[(i+.18)*turn/12,radius+.51,.04,.65,.42,1.61]);
    // Keeper plates across selected seams and saddle brackets behind the lamps.
    mount(steel,16,i=>[bay(i*3+.36),radius+.11,.81,.48,.23,.085]);
    for (const lane of lanes) {
      const at=i=>(i+lane.offset)*turn/lane.count;
      mount(steel,lane.count,i=>[at(i),lane.r+.036,lane.z-.135,lane.w+.24,lane.h+.17,.17]);
      lane.strip=mount(lane.material,lane.count,i=>[at(i),lane.r,lane.z,lane.w,lane.h,lane.d]);
      lane.strip.setColorAt(0,tint.setRGB(1,1,1));
      lane.strip.instanceColor.setUsage(T.DynamicDrawUsage);
    }
    // The service spine, bolted hatches and twin solar wings share three mounts.
    const station=i=>i*turn/3;
    mount(casing,3,i=>[station(i),radius+.93,0,2.65,1.53,2.30]);
    mount(plate,3,i=>[station(i),radius+1.84,0,2.01,.23,1.85]);
    mount(steel,3,i=>[station(i)-.025,radius+.92,1.14,1.50,.91,.13]);
    mount(casing,3,i=>[station(i)-.025,radius+.92,1.225,1.35,.77,.085]);
    mount(primer,3,i=>[station(i)+.063,radius+.94,1.16,.17,.82,.14]);
    const arrayAngle=i=>station(Math.floor(i/2))+(i%2?1:-1)*.066;
    mount(plate,6,i=>[arrayAngle(i),radius+2.22,.03,.13,2.32,.16]);
    mount(primer,6,i=>[arrayAngle(i),radius+4.90,.01,2.30,4.24,.12]);
    mount(solar,6,i=>[arrayAngle(i),radius+4.90,.01,2.19,4.12,.14]);
    mount(plate,3,i=>[station(i)+.024,radius+2.9,-.25,.055,2.6,.065]);

    function updateLights(time) {
      const approach=smooth(29,39.5,time)*(1-smooth(41,44,time));
      function chase(lane,period,crests,base,peak) {
        for (let i=0;i<lane.count;i++) {
          const phase=turn*(i*crests/lane.count-(time-22.5)/period);
          const pulse=(.5+.5*Math.cos(phase))**8, output=base+peak*pulse;
          lane.strip.setColorAt(i,tint.setRGB(output,output,output));
          levels[4*(lane.first+i)]=Math.round(51*output);
        }
        lane.strip.instanceColor.needsUpdate=true;
      }
      chase(lanes[0],2.55,2,.18,2.30+1.25*approach);
      chase(lanes[1],3.8,-1,.39,1.86);
      chase(lanes[2],3.2,1,.30,1.12);
      powerMap.needsUpdate=true;
    }
    return {group:gate,updateLights};
  }

  function create(canvas, hdrCanvas, onMode) {
    const renderer = new T.WebGLRenderer({ canvas, antialias:true, alpha:false, powerPreference:"high-performance" });
    renderer.setClearColor(0x080d15,1);
    renderer.shadowMap.enabled=true;
    renderer.shadowMap.type=T.PCFSoftShadowMap;
    const scene=new T.Scene();
    const camera=new T.PerspectiveCamera(34,1,.28,620);
    const referenceCamera=camera.clone();
    const solarBearing=new T.Vector3(.163,.209,-.964).normalize();
    const observedSun=new T.Vector3(), dawnAlignment=new T.Quaternion();
    const finalSun=new T.Vector3(), departureRay=new T.Vector3();
    const celestialRight=new T.Vector3(), celestialUp=new T.Vector3(), vertical=new T.Vector3(0,1,0);
    const lunarBearing=new T.Vector3(.65,-.516,-.556).normalize();
    const lunarDolly=new T.Vector3(.70,.13,.70).normalize(), lunarRetreat=new T.Vector3();
    const course=flightCourse(), trackingPoint=new T.Vector3();
    const rails=shots.map(shot=>{
      if(!shot.rail) return null;
      const [time,pace]=shot.rail;
      return {time,pace,origin:course.position(time,new T.Vector3()),velocity:course.velocity(time,new T.Vector3())};
    });
    const background=window.PenumbraCosmos.create(T,scene);
    const updateMoon=rockyMoon(scene,lunarBearing);
    const craft=window.PenumbraCraft.create(T);
    scene.add(craft.group);
    craft.group.traverse(o=>{
      if (o.isMesh && !o.material.transparent && o.material.isMeshStandardMaterial) {
        o.castShadow=true;
        o.receiveShadow=true;
      }
    });
    let environment=null;
    function rebuildReflections() {
      if (renderer.capabilities.isWebGL2 || renderer.extensions.has("OES_texture_half_float")) {
        environment?.dispose();
        environment=reflectionField(renderer);
        scene.environment=environment.texture;
      }
    }
    rebuildReflections();
    const ambient=new T.HemisphereLight(0x94b4e6,0x434e63,.80);
    const key=new T.DirectionalLight(0xffddb4,0);
    key.name="Direct sunlight";
    key.castShadow=true;
    key.shadow.mapSize.set(1024,1024);
    Object.assign(key.shadow.camera,{left:-9,right:9,top:9,bottom:-9,near:1,far:38});
    key.shadow.camera.updateProjectionMatrix();
    key.shadow.bias=-.00022;
    key.shadow.normalBias=.011;
    const limb=new T.DirectionalLight(0x8db9ea,.85);
    limb.name="Blue light from the atmospheric limb";
    scene.add(ambient,key,key.target,limb,limb.target);
    const engineSpill=[-1,1].map(side=>{
      const light=new T.PointLight(0x73d9ff,1,4.5,2);
      light.name="Light from the ion nozzle";
      light.position.set(side*2.25,.13,6.18);
      craft.group.add(light);
      return light;
    });
    const gateHardware=orbitalGate();
    const gate=gateHardware.group;
    gate.name="Orbital transit gate";
    gate.rotation.set(.05,.12,.212);
    // The lit housing on the port arm also illuminates the passing ship.
    const transitLamp=new T.SpotLight(0xffb477,0,52,.55,.78,2);
    transitLamp.castShadow=true;
    transitLamp.shadow.mapSize.set(512,512);
    transitLamp.shadow.camera.near=.5;
    transitLamp.shadow.camera.far=52;
    transitLamp.shadow.bias=-.0004;
    transitLamp.shadow.normalBias=.014;
    transitLamp.shadow.autoUpdate=false;
    const beacon=new T.Mesh(new T.SphereGeometry(.31,12,8),
      new T.MeshBasicMaterial({color:new T.Color(4.5,2.1,.8)}));
    const beaconColor=beacon.material.color.clone();
    transitLamp.position.set(-7.35,12.8,.90);
    beacon.position.copy(transitLamp.position);
    transitLamp.target.position.set(.25,0,.6);
    gate.add(beacon,transitLamp,transitLamp.target);
    scene.add(gate);
    const display=window.PenumbraDisplay.create(T,renderer,hdrCanvas,onMode);
    const eye=new T.Vector3(), aim=new T.Vector3(), px=new T.Vector2();
    const dollyAttitude=new T.Euler(), dollyRotation=new T.Quaternion();
    const updateIons=orbitalIons(scene,course,px);
    const nozzleCenter=new T.Vector3(), listener=new T.Vector3(), exhaustAxis=new T.Vector3();
    const engineView={time:-1,thrust:0,distance:0,pan:0,aft:0,radialSpeed:0};
    const outgoingEngine = {};
    const screenUp = new T.Vector3();
    let openingSkyCaptured = false;
    let previousAudioShot=-1;
    const amber=new T.Color(0xffa865), sunWhite=new T.Color(0xffdfad);
    const skyBlue=new T.Color(0xa3bdde), sunlitClouds=new T.Color(0xd0d7d7);
    const horizonRay=new T.Vector3(), tangentRay=new T.Vector3(), skyNormal=new T.Vector3();
    const sunDirection=new T.Vector3(), planetDirection=new T.Vector3(), upperLimb=new T.Vector3();
    const planetCosRadius=.32;  // An orbital altitude with a ~71-degree apparent planet radius.
    const planetSinRadius=Math.sqrt(1-planetCosRadius*planetCosRadius);
    const lighting={sunDirection,planetDirection,planetCosRadius,sunVisibility:0,daylight:0,sunColor:key.color,weather:background.atlas};
    function sightline(x,y,out) {
      return out.set(x,y,.5).unproject(camera).sub(camera.position).normalize();
    }
    let width=1,height=1,aspect=1,quality=1;
    function resize(w,h,q=quality) {
      openingSkyCaptured = false;
      width=Math.max(1,Math.round(w));
      height=Math.max(1,Math.round(h));
      aspect=width/height;
      quality=q;
      const budget=Math.sqrt(1950000/(width*height));
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1,1.6,budget)*quality);
      renderer.setSize(width,height,false);
      renderer.getDrawingBufferSize(px);
      display.resize(px.x,px.y);
      // Establish the inertial references once per framing, including after a
      // resize or direct seek. The sunrise observation also fixes the flight heading.
      // Keep the photographed sunrise on the same world bearing at every aspect.
      // The aft observation camera can reframe while the ship and sun stay put.
      dawnAlignment.identity();
      const sky=referenceSky(5,shots[5].end);
      observedSun.set(sky.sunNDC.x,sky.sunNDC.y,.5).unproject(referenceCamera).sub(referenceCamera.position).normalize();
      dawnAlignment.setFromUnitVectors(observedSun,solarBearing);
      referenceSky(0,0,true,"intro");
      for (const time of skyReferences) referenceSky(shotAt(time),time,true);
    }
    function referenceSky(index,time,calibrate=false,state="playing") {
      const framing=placeCamera(referenceCamera,index,time,state,0,0);
      framing.calibrateSky=calibrate;
      return background.update({time,progress:time/90,aspect,camera:referenceCamera,framing});
    }
    function at(a,b,f,out) {
      out.set(lerp(a[0],b[0],f),lerp(a[1],b[1],f),lerp(a[2],b[2],f));
    }

    // The chase camera accelerates with the ship on approach. The side and
    // overhead cameras coast along independent straight rails and are overtaken.
    const trackingOffsets=[[0,-.44],null,[-.10,.10],[.10,-.26]];
    function sampleCamera(index,time,position,target) {
      const shot=index===0?titleShot:shots[index];
      const start=index===0?0:shots[index-1].end;
      const beat=(time-start)/(shot.end-start);
      const f=.43*beat+.57*smooth(0,1,beat);
      if(shot.eye) at(shot.eye[0],shot.eye[1],f,position);
      at(shot.aim[0],shot.aim[1],f,target);
      const [from,to]=horizons[index];
      const offsets=trackingOffsets[index];
      return {lag:offsets?lerp(offsets[0],offsets[1],f):0,
        fov:lerp(shot.fov[0],shot.fov[1],f),x:lerp(shot.x[0],shot.x[1],f),
        y:lerp(shot.y[0],shot.y[1],f),horizonY:lerp(from[0],to[0],f),roll:lerp(from[1],to[1],f)};
    }
    function hullAttitude(time,rotation) {
      const bank=.034+.045*smooth(18,34,time)-.555*smooth(49,80,time);
      return rotation.set(course.pitch(time),course.yaw(time),bank,"YXZ");
    }

    // A single travelling lens follows the outer face of the port fin, passes
    // the red position lamp, then opens to the entire ship and its orbit.
    function nightsideDolly(view,time) {
      const lamp=smooth(2.50,6.50,time), reveal=smooth(6,16.50,time);
      const sweep=smooth(5.40,23.0,time);
      eye.set(-4.40-.055*time-6.60*smooth(2.0,9.10,time)-6.15*smooth(6.40,19.90,time),
        1.46+.40*smooth(2.30,6.20,time)+5.26*smooth(5.0,19.0,time),
        3.64+.25*smooth(1.8,5.5,time)-15.75*sweep);
      aim.set(lerp(lerp(-2.75,-3.35,lamp),-.22,reveal),
        lerp(lerp(1.325,.49,lamp),.25,reveal),
        lerp(lerp(3.79,3.08,lamp),-.72,reveal));
      const fit=Math.max(1,lerp(.92,1.46,smooth(4.5,15.5,time))/aspect);
      eye.sub(aim).multiplyScalar(fit).add(aim);
      const rotation=dollyRotation.setFromEuler(hullAttitude(time,dollyAttitude));
      course.position(time,trackingPoint);
      view.position.copy(eye).applyQuaternion(rotation).add(trackingPoint);
      aim.applyQuaternion(rotation).add(trackingPoint);
      view.up.copy(vertical).applyQuaternion(rotation);
      view.lookAt(aim);
      view.fov=33.3+3.9*smooth(2.2,8.1,time)-2.2*smooth(13.5,22.5,time);
      view.aspect=aspect;
      view.updateProjectionMatrix();
      const composition=lerp(-.035,.065,reveal)*Math.min(1,aspect);
      view.projectionMatrix.elements[8]=-composition;
      view.projectionMatrix.elements[9]=-(.035+.055*lamp*(1-reveal));
      view.projectionMatrixInverse.copy(view.projectionMatrix).invert();
      view.updateMatrixWorld(true);
      const skyPan=Math.atan2(aim.x-view.position.x,view.position.z-aim.z);
      return {horizonY:lerp(-.19,-.14,reveal),roll:lerp(-.12,-.035,reveal),skyTake:1,skyPan};
    }

    function placeCamera(view,index,time,state,driftX,driftY) {
      if(index===1 || (index===0 && state!=="intro")) return nightsideDolly(view,time);
      const lens=sampleCamera(index,time,eye,aim);
      eye.x += driftX*.28;
      eye.y += driftY*.20;
      // On a portrait screen, keep the full silhouette above the opening title.
      const portrait=1-smooth(.85,1.45,aspect);
      const startPose=state==="intro"?1:1-smooth(0,5,time);
      const distanceScale=1+portrait*(.38+.25*startPose);
      const safeWidth=index===0?.80:.69;
      const rangeScale=index===6 ? Math.max(1,1.65/aspect)*(1-.245*portrait)
        : distanceScale*Math.max(1,safeWidth/aspect);
      let offsetX=lens.x*(1-(index>=5?.53:.88)*portrait);
      if (index===7) {
        // The departing ship pulls away from a constant-velocity camera. The
        // optical axis is established once against the dawn at the cut.
        celestialRight.crossVectors(solarBearing,vertical).normalize();
        celestialUp.crossVectors(celestialRight,solarBearing).normalize();
        const halfFov=Math.tan(lens.fov*Math.PI/360);
        departureRay.copy(solarBearing)
          .addScaledVector(celestialRight,-(.62-offsetX)*aspect*halfFov)
          .addScaledVector(celestialUp,-(.35-lens.y)*halfFov).normalize();
        eye.copy(aim).addScaledVector(departureRay,-22.5);
      }
      view.position.copy(eye).sub(aim).multiplyScalar(rangeScale).add(aim);
      const rail=rails[index];
      if(rail) {
        const elapsed=time-rail.time;
        const pace=lerp(rail.pace,1,.59*portrait);
        trackingPoint.copy(rail.origin).addScaledVector(rail.velocity,elapsed*pace);
        if(index===6) {
          // Truck along the limb with the crescent in the upper sky and the
          // vessel over the clouds. Keep clear space between their silhouettes.
          const travel=.21*elapsed;
          const panTravel=.20*elapsed*rangeScale*Math.min(1,aspect/(16/9));
          // Pull back toward the lunar sightline for a narrower frame. This
          // preserves the gap between the near bow and the distant disk.
          lunarRetreat.subVectors(eye,aim);
          lunarRetreat.addScaledVector(lunarBearing,lunarRetreat.length()).multiplyScalar(-.40*(rangeScale-1));
          view.position.add(lunarRetreat).addScaledVector(lunarDolly,travel);
          aim.add(lunarRetreat).addScaledVector(lunarDolly,travel-panTravel);
          offsetX-=.17*portrait;
          lens.y-=.10*portrait;
        }
        // This trailing observer keeps its velocity as the vessel opens the
        // distance along the sunrise bearing. Its vanishing point is the sun.
        if(index===7) trackingPoint.addScaledVector(solarBearing,-4.8*elapsed);
      } else {
        course.position(time+lens.lag*(1-.61*portrait),trackingPoint);
      }
      view.position.add(trackingPoint);
      aim.add(trackingPoint);
      view.up.copy(vertical);
      if(index===5) {
        view.position.sub(aim).applyQuaternion(dawnAlignment).add(aim);
        view.up.applyQuaternion(dawnAlignment);
      }
      view.lookAt(aim);
      view.fov=lens.fov;
      view.aspect=aspect;
      view.updateProjectionMatrix();
      view.projectionMatrix.elements[8]=-offsetX;
      view.projectionMatrix.elements[9]=-(lens.y+.22*portrait*startPose);
      view.projectionMatrixInverse.copy(view.projectionMatrix).invert();
      view.updateMatrixWorld(true);
      const skyPan=Math.atan2(aim.x-view.position.x,view.position.z-aim.z);
      return {horizonY:lens.horizonY,roll:lens.roll,skyTake:skyTakes[index],skyPan};
    }

    function prepareShot(index,time,state,driftX,driftY) {
      const progress=clamp(time/90,0,1);
      const thrust=course.throttle(time);
      craft.update(time,thrust);
      course.position(time,craft.group.position);
      // Slowly roll the dorsal panels into dawn. Both engine axes still point
      // along the same thrust vector and the ship keeps its forward momentum.
      hullAttitude(time,craft.group.rotation);
      updateIons(time);
      finalSun.copy(solarBearing);
      finalSun.y+=.052*smooth(67.5,90,time);
      finalSun.normalize();
      const framing=placeCamera(camera,index,time,state,driftX,driftY);
      if (index>=6) framing.sunWorld=finalSun;
      const sky=background.update({time,progress,aspect,camera,framing});
      const flareTravel=smooth(55.35,59.35,time);
      const flareLight=index===5 && sky.sunInFront
        ? sky.sunVisibility*smooth(55.35,56.98,time)*(1-smooth(57.05,59.35,time)):0;
      display.setSolarFlare(sky.sunNDC,camera,flareLight,flareTravel);
      if (sky.sunWorld) sunDirection.copy(sky.sunWorld);
      else sightline(sky.sunNDC.x,sky.sunNDC.y,sunDirection);
      sightline(sky.horizonNDC.x,sky.horizonNDC.y,horizonRay);
      sightline(sky.horizonNDC.x+.02*sky.horizonTangent.x/aspect,
        sky.horizonNDC.y+.02*sky.horizonTangent.y,tangentRay);
      skyNormal.crossVectors(tangentRay,horizonRay).normalize();
      planetDirection.copy(horizonRay).multiplyScalar(planetCosRadius).addScaledVector(skyNormal,-planetSinRadius).normalize();

      // Projection, eclipse fraction and reflection directions all come from
      // the same sky used for this frame, including a shifted or portrait lens.
      key.target.position.copy(craft.group.position);
      key.position.copy(craft.group.position).addScaledVector(sunDirection,19);
      const risen=smooth(-.005,.18,sky.solarAltitude);
      key.color.copy(amber).lerp(sunWhite,risen);
      key.intensity=sky.sunVisibility*(2.7+5.55*risen);
      ambient.position.copy(planetDirection);
      ambient.color.copy(skyBlue).lerp(sunlitClouds,sky.day);
      ambient.intensity=.75-.19*risen;
      // Resolve a broad blue grazing fill from the highest part of the planet's
      // lit hemisphere. It has no sharp shadow or white studio reflection.
      upperLimb.set(-.36,.86,-.35).normalize();
      upperLimb.addScaledVector(planetDirection,-upperLimb.dot(planetDirection)).normalize();
      limb.target.position.copy(craft.group.position);
      limb.position.copy(planetDirection).multiplyScalar(planetCosRadius)
        .addScaledVector(upperLimb,planetSinRadius).multiplyScalar(15).add(craft.group.position);
      limb.intensity=1.01-.58*risen;
      updateMoon(camera,sky,sunDirection);
      lighting.sunVisibility=sky.sunVisibility;
      lighting.solarAltitude=sky.solarAltitude;
      lighting.daylight=sky.day;
      craft.setOrbitalLight?.(lighting);
      engineSpill.forEach(light=>{light.intensity=.24+4.25*thrust*thrust;});
      renderer.toneMappingExposure=1.28-.30*risen;

      gateHardware.updateLights(time);
      const beaconPower=.37+.98*(.5+.5*Math.cos(2*Math.PI*(time-40.5)/2.8))**3;
      beacon.material.color.copy(beaconColor).multiplyScalar(beaconPower);
      transitLamp.shadow.needsUpdate=Math.abs(time-40.5)<5.3;
      transitLamp.intensity=335*Math.exp(-.5*((time-40.5)/1.45)**2)*beaconPower;
    }

    function sampleNozzles(view) {
      // Both nozzles share an acoustic centre. The receiving camera determines
      // range, stereo pan and whether the microphone faces the exhaust.
      nozzleCenter.set(0,.13,6.0).applyQuaternion(craft.group.quaternion).add(craft.group.position);
      listener.subVectors(camera.position,nozzleCenter);
      view.distance=listener.length();
      view.aft=exhaustAxis.set(0,0,1).applyQuaternion(craft.group.quaternion).dot(listener)/Math.max(.001,view.distance);
      view.pan=clamp(nozzleCenter.project(camera).x*.83,-1,1);
    }
    function engineAtLens(index,time,from=null,arrival=1) {
      const previousDistance=engineView.distance, dt=time-engineView.time;
      sampleNozzles(engineView);
      if (from) {
        for (const field of ["distance","pan","aft"]) engineView[field]=lerp(from[field],engineView[field],arrival);
      }
      // A change of camera position across an edit is not radial acceleration.
      engineView.radialSpeed=!from && index===previousAudioShot && dt>0 && dt<.25
        ? (engineView.distance-previousDistance)/dt : 0;
      engineView.time=time;
      engineView.thrust=course.throttle(time);
      previousAudioShot=from?-1:index;
      return engineView;
    }

    function draw(time,state,driftX=0,driftY=0,opening=1) {
      if (state==="intro" && opening<1) {
        prepareShot(0,0,state,0,0);
        // Hold the sky and horizon at the exact live lens. Only the vessel
        // rises through this exposure. The clean plate is reused until resize.
        if (!openingSkyCaptured) {
          craft.group.visible=false;
          try { display.captureOutgoing(scene,camera); }
          finally { craft.group.visible=true; }
          openingSkyCaptured=true;
        }
        const frameHeight=2*camera.position.distanceTo(craft.group.position)*Math.tan(camera.fov*Math.PI/360);
        screenUp.setFromMatrixColumn(camera.matrixWorld,1);
        craft.group.position.addScaledVector(screenUp,-.043*frameHeight*(1-opening));
        display.render(scene,camera,opening);
        return;
      }
      const edit=edits.find(e=>time>e.start && time<e.end);
      if (!edit || edit.dip || edit.matched) {
        const index=shotAt(time);
        prepareShot(index,time,state,driftX,driftY);
        if (edit) {
          const open=time<edit.cut?1-smooth(edit.start,edit.cut,time):smooth(edit.cut,edit.end,time);
          // The two nightside shots share one moving lens. Only its exposure
          // breathes at this cut, so the geometry and engine Doppler stay continuous.
          renderer.toneMappingExposure*=edit.matched?lerp(1-edit.veil,1,open):open;
        }
        display.render(scene,camera);
        return engineAtLens(index===1?0:index,time);
      }
      const arrival=smooth(edit.start,edit.end,time);
      prepareShot(edit.index,time,state,driftX,driftY);
      const outgoingExposure=renderer.toneMappingExposure;
      sampleNozzles(outgoingEngine);
      display.captureOutgoing(scene,camera);
      prepareShot(edit.index+1,time,state,driftX,driftY);
      renderer.toneMappingExposure=lerp(outgoingExposure,renderer.toneMappingExposure,arrival);
      renderer.toneMappingExposure*=1-(edit.veil||0)*4*arrival*(1-arrival);
      display.render(scene,camera,arrival);
      return engineAtLens(edit.index+1,time,outgoingEngine,arrival);
    }
    return { resize,draw,restore:rebuildReflections };
  }

  window.PenumbraFlight={create};
}());
