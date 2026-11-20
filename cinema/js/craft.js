/* PENUMBRA / SV-07. Local coordinates are metres; the nose points down -Z. */
(function () {
  "use strict";

  const paintBounds = { left: -5, front: -7.4, width: 10, length: 14.8 };

  function wearAtlas(T,seams,fixings) {
    // A single atlas covers the entire airframe in metres. Both sides are
    // painted separately, so the maintenance history survives close reverse shots.
    const width=1024, height=1024;
    const sx=width/paintBounds.width, sz=height/paintBounds.length;
    let seed=0x78ae21b3;
    const random=()=>((seed=(Math.imul(seed,1664525)+1013904223)>>>0)/4294967296);
    function mask() {
      const c=document.createElement("canvas"); c.width=width; c.height=height;
      const pen=c.getContext("2d",{willReadFrequently:true});
      pen.fillRect(0,0,width,height);
      pen.setTransform(sx,0,0,sz,-paintBounds.left*sx,-paintBounds.front*sz);
      pen.lineCap="round";
      return pen;
    }
    const deposits=mask(), scuffs=mask();
    function stain(ctx,x,z,rx,rz,angle,opacity) {
      ctx.save();ctx.translate(x,z);ctx.rotate(angle);ctx.scale(rx,rz);
      const g=ctx.createRadialGradient(0,0,.01,0,0,1);
      g.addColorStop(0,"rgba(255,255,255,"+opacity+")");
      g.addColorStop(.52,"rgba(255,255,255,"+(opacity*.60)+")");
      g.addColorStop(1,"rgba(255,255,255,0)");
      ctx.fillStyle=g;ctx.fillRect(-1,-1,2,2);ctx.restore();
    }
    function stroke(ctx,x,z,dx,dz,weight,opacity,bend) {
      ctx.beginPath();ctx.moveTo(x,z);
      ctx.quadraticCurveTo(x+dx*.54+bend,z+dz*.45,x+dx,z+dz);
      ctx.strokeStyle="rgba(255,255,255,"+opacity+")";
      ctx.lineWidth=weight;ctx.stroke();
    }
    function runout(x,z,w,length,lean,power) {
      // A broad baked stain, narrow channels under it and a ragged feathered end.
      stain(deposits,x+lean*.22,z+length*.33,w,length*.84,-lean,power*.76);
      for(let i=0;i<23;i++) {
        const offset=(random()-.5)*w*1.45, reach=length*(.26+.87*random());
        stain(deposits,x+offset+lean*reach*.5,z+reach*.50,
          w*(.035+.10*random()),reach*.72,-lean+(random()-.5)*.08,power*(.13+.23*random()));
      }
    }
    for(const side of [-1,1]) {
      runout(side*2.27,2.30,.56,2.32,-.045*side,side<0?.93:.72);
      runout(side*2.05,.35,.40,1.02,.115*side,.68);
      runout(side*1.28,-1.52,.34,1.86,.085*side,side<0?.92:.63);
      runout(side*1.02,.66,.37,2.90,-.10*side,.86);
      runout(side*3.06,1.27,.34,1.52,.17*side,.68);
      runout(side*.44,1.57,.31,2.48,-.055*side,.79);
      stain(deposits,side*2.26,4.67,.71,1.01,.12*side,.92);
      stain(deposits,side*.51,-4.52,.27,1.13,-.19*side,.34);
    }
    runout(-.81,-2.83,.25,1.56,.09,.83);
    runout(1.89,-1.29,.23,.95,.10,.76);
    runout(-2.92,.50,.32,1.14,-.25,.72);
    for(const edge of seams) {
      for(let i=1;i<edge.length;i++) {
        const [x,z]=edge[i-1],dx=edge[i][0]-x,dz=edge[i][1]-z;
        stroke(deposits,x,z+.012,dx,dz,.048+random()*.061,.13+.22*random(),.009);
        if(random()>.54) {
          const t=random();runout(x+dx*t,z+dz*t,.042+.046*random(),.12+.38*random(),dx*.045,.39);
        }
      }
    }
    for(const [x,z] of fixings) {
      stain(deposits,x,z+.023,.115,.17,(random()-.5)*.28,.52);
      runout(x+(random()-.5)*.06,z+.03,.044,.14+.24*random(),.025,.35);
    }
    // Tool slips and shoe-polished shoulders are concentrated where a mechanic
    // reaches the canopy, induction covers and exchanger. Most paint stays intact.
    for(const [x,z,rx,rz,a,strength] of [
      [-1.05,-1.58,.24,.98,.12,.85],[-.74,-3.25,.22,.54,-.39,.73],
      [1.06,.48,.24,.82,.08,.57],[-1.47,.85,.36,.84,-.30,.90],
      [-2.24,1.21,.42,.67,.24,.76],[2.28,-.78,.35,.71,-.13,.57],
      [3.27,2.22,.45,.55,-.56,.57],[-3.72,2.45,.32,.42,.58,.67],
      [.36,2.36,.35,.82,-.09,.61],[2.18,4.06,.32,.58,-.15,.71],
      [.42,-4.43,.20,.73,-.24,.55],[-.29,-5.43,.17,.48,.30,.65]]) {
      stain(scuffs,x,z,rx,rz,a,strength*.42);
      for(let i=0;i<44;i++) {
        const offX=(random()+random()-1)*rx, offZ=(random()+random()-1)*rz;
        const len=(.035+.29*random()**2)*(1+.42*strength), angle=a+(random()-.5)*.52;
        const dx=Math.cos(angle)*offX-Math.sin(angle)*offZ;
        const dz=Math.sin(angle)*offX+Math.cos(angle)*offZ;
        stroke(scuffs,x+dx,z+dz,len*Math.sin(angle),len*Math.cos(angle),
          .007+.019*random()**2,strength*(.26+.64*random()),(random()-.5)*.024);
      }
    }
    const dirt=deposits.getImageData(0,0,width,height).data, wear=scuffs.getImageData(0,0,width,height).data;
    const bytes=new Uint8Array(width*height*4);
    // Separate pore and brushed/scratch fields use independent scales. The atlas
    // never repeats across the hull; mip levels filter the finest marks at distance.
    function field(nx,ny) {
      const values=Float32Array.from({length:(nx+1)*(ny+1)},random),stride=nx+1;
      return (u,v)=>{
        const fx=u*nx,fy=v*ny,x=fx|0,y=fy|0,i=y*stride+x;
        let a=fx-x,b=fy-y;a=a*a*(3-2*a);b=b*b*(3-2*b);
        return (values[i]*(1-a)+values[i+1]*a)*(1-b)+(values[i+stride]*(1-a)+values[i+stride+1]*a)*b;
      };
    }
    const patina=field(29,44),pitting=field(148,185),fibres=field(315,59),flecks=field(498,585);
    for(let j=0,k=0;j<height;j++) for(let i=0;i<width;i++,k+=4) {
      const u=(i+.5)/width,v=(j+.5)/height, p=patina(u,v), q=pitting(u,v),f=flecks(u,v);
      bytes[k]=dirt[k];bytes[k+1]=wear[k];
      bytes[k+2]=Math.round(255*(.55*p+.31*q+.14*f));
      bytes[k+3]=Math.round(255*(.54*fibres(u,v)+.28*f+.18*q));
    }
    const tex=new T.DataTexture(bytes,width,height,T.RGBAFormat);
    tex.flipY=true;tex.generateMipmaps=true;tex.magFilter=T.LinearFilter;tex.minFilter=T.LinearMipmapLinearFilter;
    tex.anisotropy=4;tex.needsUpdate=true;
    return tex;
  }

  function wearDistances(T,points) {
    // Use the topology of each material batch. Coplanar triangulation diagonals
    // are ignored; tile rims and real corners can expose the coating beneath.
    const count=points.length/9,vertices=[],ids=new Map(),edges=new Map();
    const faceNormals=new Float32Array(count*3), areas=new Float32Array(count);
    const edgeKeys=new Array(count*3),out=new Float32Array(points.length);
    const a=new T.Vector3(),b=new T.Vector3(),n=new T.Vector3();
    for(let i=0;i<points.length;i+=3) {
      const key=Math.round(points[i]*10000)+"/"+Math.round(points[i+1]*10000)+"/"+Math.round(points[i+2]*10000);
      if(!ids.has(key)) ids.set(key,ids.size);
      vertices.push(ids.get(key));
    }
    const stride=ids.size+1;
    for(let face=0;face<count;face++) {
      const i=face*9;
      a.set(points[i+3]-points[i],points[i+4]-points[i+1],points[i+5]-points[i+2]);
      b.set(points[i+6]-points[i],points[i+7]-points[i+1],points[i+8]-points[i+2]);
      n.crossVectors(a,b);areas[face]=n.length();n.normalize().toArray(faceNormals,face*3);
      for(let j=0;j<3;j++) {
        const first=vertices[face*3+(j+1)%3],second=vertices[face*3+(j+2)%3];
        const key=Math.min(first,second)*stride+Math.max(first,second);
        edgeKeys[3*face+j]=key;
        const neighbors=edges.get(key);
        if(neighbors) neighbors.push(face); else edges.set(key,[face]);
      }
    }
    for(let face=0;face<count;face++) {
      n.fromArray(faceNormals,face*3);
      for(let j=0;j<3;j++) {
        const adjacent=edges.get(edgeKeys[3*face+j]);
        const sharp=adjacent.length===1 || adjacent.some(other=>other!==face &&
          n.dot(a.fromArray(faceNormals,other*3))<.88);
        a.fromArray(points,9*face+3*((j+1)%3));b.fromArray(points,9*face+3*((j+2)%3));
        const altitude=areas[face]/Math.max(.00001,a.distanceTo(b));
        for(let k=0;k<3;k++) out[face*9+k*3+j]=sharp?(k===j?altitude:0):12;
      }
    }
    return new T.BufferAttribute(out,3);
  }

  function paintTexture(T) {
    const canvas = document.createElement("canvas");
    const density = 128;
    canvas.width = paintBounds.width * density;
    canvas.height = Math.round(paintBounds.length * density);
    const c = canvas.getContext("2d");
    c.setTransform(density, 0, 0, density, -paintBounds.left * density, -paintBounds.front * density);
    c.lineJoin = "round";
    const seams=[], fixings=[];
    const ivory = "#d8d6ca";
    const red = "#cc432b";
    const ink = "#323b41";

    function path(points, fill, stroke, width) {
      c.beginPath();
      points.forEach(([x,z], i) => i ? c.lineTo(x,z) : c.moveTo(x,z));
      if (fill) {
        c.closePath();
        c.fillStyle = fill;
        c.fill();
      }
      if (stroke) {
        c.strokeStyle = stroke;
        c.lineWidth = width;
        c.stroke();
      }
    }

    function label(text, x, z, size, color, angle, weight) {
      c.save();
      c.translate(x,z);
      c.rotate(angle || 0);
      c.fillStyle = color;
      c.textAlign = "center";
      c.textBaseline = "middle";
      c.font = (weight || 700) + " " + (size * density) + "px Helvetica, Arial, sans-serif";
      c.scale(1 / density, 1 / density);
      c.fillText(text,0,0);
      c.restore();
    }

    function line(points) {
      seams.push(points);
      path(points.map(([x,z]) => [x + .012,z + .014]), null, "rgba(255,255,244,.8)", .015);
      path(points, null, "#6e7473", .017);
    }

    c.fillStyle = ivory;
    c.fillRect(-5, -7.4, 10, 14.8);
    // Different alloy lots on adjacent access plates, under one continuous livery.
    path([[-5,-.45],[-1.18,-3.15],[-.74,-2.79],[-2.23,1.47],[-5,2.45]],"#c8cac2");
    path([[1.11,.75],[2.87,.75],[3.21,1.44],[2.97,2.35],[1.32,1.88]],"#dddbcf");
    path([[-.47,-6.01],[.46,-6.01],[.90,-4.01],[.60,-3.62],[-.88,-4.11]],"#c9cdc5");
    path([[-1.78,3.76],[-2.98,3.43],[-3.36,4.62],[-1.82,4.85]],"#bcbdba");
    // Strong asymmetrical vermilion sightline all the way forward to the nose.
    path([[.025,-7.02],[.109,-7.02],[.47,-4.86],[.75,-3.59],[1.00,-2.69],
          [1.14,-.74],[1.16,.63],[.96,.63],[.91,-.64],[.75,-2.57],
          [.58,-3.52],[.27,-4.87]],red);
    path([[.13,-6.94],[.16,-6.91],[.53,-4.88],[.81,-3.57],[.84,-3.49],[.78,-3.55],[.47,-4.86]],ink);
    for (const s of [-1,1]) {
      const side = points => points.map(([x,z]) => [s*x,z]);
      // Wing recognition bands track the cranked leading edge.
      path(side([[1.05,-2.23],[1.32,-2.19],[2.70,-.23],[4.72,2.82],[4.62,3.40],
                 [4.32,3.17],[2.44,.06]]),red);
      path(side([[2.78,.17],[4.50,2.70],[4.49,2.91],[4.43,2.83],[2.71,.28]]),ink);
      // Crown markings are broken by the actual gaps in the engine cowlings.
      path(side([[1.94,-2.25],[2.20,-2.25],[2.52,-.25],[2.55,.46],[2.24,.46],[2.21,-.28]]),red);
      path(side([[2.14,3.46],[2.62,3.49],[2.65,4.13],[2.19,4.05]]),red);
      [
        [[.1,-6.03],[.38,-5.87],[.59,-5.52]], [[.07,-4.85],[.36,-4.67],[.82,-4.55]],
        [[.34,-4.53],[.45,-4.36],[.55,-4.33]], [[.71,-3.45],[.9,-3.35],[1.1,-2.86]],
        [[1.08,-1.74],[1.26,-1.45],[1.39,-.55]], [[1.18,-.08],[1.34,.0],[1.47,.32]],
        [[1.50,-1.64],[1.83,-1.23],[1.84,-.82],[2.28,-.35]], [[1.30,-.67],[2.13,.33],[3.10,1.49],[3.41,1.66]],
        [[1.59,.56],[2.20,1.13],[3.62,2.76],[4.23,3.12]], [[2.06,2.08],[2.95,2.44],[3.18,2.88],[3.81,3.23]],
        [[3.30,1.99],[3.44,1.99],[3.96,2.59],[3.96,2.78]], [[2.42,3.25],[2.66,3.01],[3.04,3.15]],
        [[1.68,-1.58],[2.03,-1.48],[2.42,-1.29]], [[1.71,-.69],[2.08,-.65],[2.47,-.46]],
        [[1.79,.15],[2.35,.13],[2.63,.38]], [[1.72,1.18],[2.05,1.12],[2.48,1.22],[2.70,1.44]],
        [[1.77,1.80],[2.08,1.72],[2.61,1.84]], [[1.71,3.69],[2.05,3.60],[2.72,3.77]],
        [[.14,1.01],[.28,1.16],[.64,1.20]], [[.11,3.95],[.31,4.09],[.74,4.11]]
      ].forEach(p => line(side(p)));
      // Fasteners and access marks sit in pairs, like real service fittings.
      for (const [x,z,rot] of [[.34,-5.58,-.24],[.68,-4.19,-.44],[1.12,-2.03,-.07],
              [1.17,-.53,-.03],[2.11,-1.14,.08],[2.51,.61,.02],[2.48,1.57,0],
              [3.18,1.49,-.50],[3.69,2.58,-.55],[2.15,3.82,.02],[.43,4.21,0]]) {
        c.save();
        fixings.push([s*x,z]);
        c.translate(s*x,z);
        c.rotate(s*rot);
        c.fillStyle = "#626963";
        for (const dx of [-.052,.052]) {
          c.beginPath(); c.arc(dx,0,.016,0,Math.PI*2); c.fill();
        }
        c.fillStyle = "#a49e8c";
        c.fillRect(-.055,.077,.11,.019);
        c.restore();
      }
      for (const [x,z] of [[1.09,-2.34],[2.06,-.30],[2.44,1.97],[3.58,2.92]]) {
        c.fillStyle = ink;
        c.fillRect(s*x-.13,z,.26,.038);
        c.fillRect(s*x-.13,z+.068,.16,.016);
        c.fillRect(s*x-.13,z+.104,.20,.012);
      }
    }
    label("SV-07", -2.99,1.77,.32,ink,Math.PI-.69,800);
    label("07",3.13,1.93,.66,"#3e4646",.71-Math.PI,800);
    label("SV-07",-.05,-4.92,.16,ink,-Math.PI/2,800);
    label("AP / FLIGHT",-.66,1.62,.12,ink,-Math.PI/2,700);
    // Fine ceramic surface variation remains quiet at normal viewing distance.
    let seed = 21079;
    const random = () => ((seed = (1664525 * seed + 1013904223) >>> 0) / 4294967296);
    c.fillStyle = "rgba(62,63,56,.105)";
    for (let i=0; i<4800; i++) c.fillRect(-5+random()*10,-7.4+random()*14.8,.006+random()*.014,.01+random()*.04);
    const result = new T.CanvasTexture(canvas);
    result.colorSpace = T.SRGBColorSpace;
    result.anisotropy = 4;
    return {paint:result,wear:wearAtlas(T,seams,fixings)};
  }

  // Evaluate the local sky at the reflection direction. The spacecraft is at the
  // origin and the planet centre is one unit away: cos(radius)^2 is the constant
  // term in the ray/sphere quadratic. The near root gives the actual surface
  // normal for the day/night terminator even when the sun is hidden at the craft.
  const orbitalEnvironment = `
    uniform vec3 orbitSun;
    uniform vec3 orbitPlanet;
    uniform vec3 orbitSunColor;
    uniform float orbitDay;
    uniform float orbitSunVisible;
    uniform float orbitSolarAltitude;
    uniform float orbitCapCos;
    uniform sampler2D orbitWeather;

    vec3 reflectedOrbit(vec3 ray, float roughness) {
      float cosine = dot(ray, orbitPlanet);
      float edge = cosine - orbitCapCos;
      float r2 = roughness * roughness;
      float blur = 0.002 + 0.73 * r2;
      vec3 space = vec3(0.0016, 0.0029, 0.0060);
      if (edge < -0.32 - blur) return space;

      float sd = max(cosine, orbitCapCos);
      vec3 tangent = ray - cosine * orbitPlanet;
      float radius = sqrt(max(0.01, 1.0 - orbitCapCos * orbitCapCos));
      vec3 surfaceRay = cosine >= orbitCapCos ? ray :
        normalize(orbitPlanet * orbitCapCos + tangent * (radius / max(length(tangent), 0.001)));
      float nearHit = orbitCapCos * orbitCapCos / (sd + sqrt(max(0.0, sd*sd - orbitCapCos*orbitCapCos)));
      vec3 groundNormal = normalize(surfaceRay * nearHit - orbitPlanet);
      float sunElevation = dot(groundNormal, orbitSun);
      float dayFace = smoothstep(-0.14-blur*.45, 0.19+blur*.45, sunElevation);
      float daytime = dayFace * mix(0.20, 1.0, orbitDay);
      float cosineSun = clamp(dot(ray,orbitSun)*.5+.5, 0.0, 1.0);
      float sunward = pow(cosineSun, 8.0);
      float sunset = sunward * (0.18 + 0.82 * max(orbitSunVisible, orbitDay));

      // The same repeating weather tile used for the visible atmosphere is sampled
      // on spherical ground coordinates. Rough metals see its filtered mean.
      vec2 geo = vec2(atan(groundNormal.z,groundNormal.x)*0.159155 + .5,
                      asin(clamp(groundNormal.y,-.9999,.9999))*.318310 + .5);
      vec4 broad = texture2D(orbitWeather, geo*vec2(3.0,3.7)+vec2(.28,.61), roughness*5.0);
      vec4 fine = texture2D(orbitWeather, geo*vec2(11.0,19.2)+broad.rg*.25, roughness*6.0);
      float clouds = smoothstep(.40, .66, .52*broad.g + .37*fine.g + .11*fine.b);
      clouds = mix(clouds,.52,smoothstep(.25,.82,roughness));
      vec3 night = mix(vec3(.007,.021,.054), vec3(.033,.080,.175), clouds);
      vec3 sea = mix(vec3(.035,.142,.259), vec3(.135,.245,.220), smoothstep(.47,.62,broad.r));
      vec3 sunlit = mix(sea, vec3(.93,1.04,1.12), clouds);
      sunlit *= (.40+.78*max(sunElevation,0.0)) * mix(vec3(1.0),orbitSunColor,.34);
      vec3 surface = mix(night, sunlit, daytime);
      vec3 haze = mix(vec3(.045,.145,.32),vec3(.30,.62,.99),daytime);
      surface = mix(surface,haze,.56*exp(-5.8*max(edge,0.0)));
      vec3 color = mix(space,surface,smoothstep(-blur,blur,edge));

      // Convolving thin atmosphere bands with the specular footprint conserves
      // their energy: polished glass gets a narrow rim, rough alloy a broad wash.
      float thinWidth = sqrt(.000324+blur*blur);
      float wideWidth = sqrt(.0064+blur*blur);
      float thin = (.018/thinWidth)*exp(-.5*(edge/thinWidth)*(edge/thinWidth));
      float wide = (.080/wideWidth)*exp(-.5*(edge/wideWidth)*(edge/wideWidth));
      vec3 air = mix(vec3(.16,.67,1.47), orbitSunColor*1.46+vec3(.12,.035,.008), sunset);
      color += air * ((.39+.64*orbitDay+.52*sunset)*thin + (.095+.18*orbitDay)*wide);
      float skirt=.12+.34*roughness;
      color+=vec3(.084,.224,.405)*roughness*(1.0-.54*orbitDay)*exp(-.5*edge*edge/(skirt*skirt));
      return color;
    }

    // Cosine-weighted solid angle of a spherical cap, divided by PI. Used for
    // diffuse planet shine without stamping a sharp skyline onto the ceramics.
    float projectedCap(float mu, float capCos) {
      float sinRadius2 = 1.0-capCos*capCos;
      if (mu*mu >= sinRadius2) return max(mu,0.0)*sinRadius2;
      float sinTheta = sqrt(max(.00001,1.0-mu*mu));
      float cotRadius = capCos / sqrt(sinRadius2);
      float y = clamp(-cotRadius*mu/sinTheta,-1.0,1.0);
      float arc = sinTheta*sqrt(max(0.0,1.0-y*y));
      return max(0.0, ((mu*acos(y)-cotRadius*arc)*sinRadius2+atan(arc/cotRadius))*.318310);
    }

    vec3 getIBLIrradiance(const in vec3 normal) {
      vec3 n = inverseTransformDirection(normal, viewMatrix);
      float cap = projectedCap(dot(n,orbitPlanet),orbitCapCos);
      float phase = clamp(.5-.5*dot(orbitSun,orbitPlanet),.0,1.0);
      vec3 solarTangent = orbitSun-orbitPlanet*dot(orbitPlanet,orbitSun);
      vec3 brightSide = normalize(orbitPlanet + .26*solarTangent);
      float litCap = projectedCap(dot(n,brightSide),orbitCapCos+.07*(1.0-phase));
      vec3 bounce = vec3(.011,.032,.081)*cap;
      vec3 averageCloud = vec3(.37,.49,.62)*mix(vec3(1.0),orbitSunColor,.29);
      bounce += averageCloud*litCap*orbitDay*(.25+.75*phase);
      return PI*(vec3(.0020,.0036,.0075) + bounce);
    }

    vec3 getIBLRadiance(const in vec3 viewDir, const in vec3 normal, const in float roughness) {
      vec3 ray = reflect(-viewDir, normal);
      ray = normalize(mix(ray,normal,roughness*roughness));
      return reflectedOrbit(inverseTransformDirection(ray,viewMatrix),roughness);
    }
  `;

  const wearSurface = `
    varying vec3 wearPoint;
    varying vec3 wearEdge;
    uniform sampler2D flightWear;
    uniform mat3 craftAxes;
    uniform vec4 localLamps;
    uniform float finExposure;

    struct Finish {
      float grime; float scratch; float flake; float rough; float tooth; float heat; float age; float louvers; float protrusion;
    };
    Finish readFinish() {
      vec3 p=wearPoint;
      vec2 uv=vec2((p.x+5.0)*.10,1.0-(p.z+7.4)/14.8);
      vec4 print=texture2D(flightWear,uv);
      // Sidewalls, canted fins and machined nozzle flutes have a second
      // surface direction. It is still measured in the ship's own coordinates.
      vec2 sideUV=vec2(.09+(p.y+1.0)*.182+(p.x+5.0)*.036,.10+(p.z+7.4)*.049);
      vec4 side=texture2D(flightWear,sideUV);
      float grain=.67*print.a+.33*side.a;
      float mottling=.74*print.b+.26*side.b;
      float sideX=abs(p.x),edge=min(wearEdge.x,min(wearEdge.y,wearEdge.z));
      float nacelle=1.0-smoothstep(.39,.79,abs(sideX-2.25));
      float heat=nacelle*smoothstep(3.28,5.65,p.z);
      float fleck=clamp(2.15*(.59*grain+.41*mottling)-.55,0.0,1.0);
      float chipWidth=(.003+.062*smoothstep(.28,.63,fleck))*(.60+.86*print.g+.37*heat);
      float flake=(1.0-smoothstep(chipWidth*.18,chipWidth+.006,edge))
             *smoothstep(.21,.59,fleck+.48*print.g);
      Finish f;
      f.grime=clamp(print.r*(.54+.86*mottling)+.12*heat,0.0,1.0);
      f.scratch=print.g; f.flake=flake;
      f.rough=mottling; f.tooth=grain; f.heat=heat;
      f.louvers=(1.0-smoothstep(.34,.47,sideX))*smoothstep(1.35,1.61,p.z)
               *(1.0-smoothstep(3.16,3.42,p.z))*smoothstep(.83,.98,p.y);
      f.age=clamp(.85*print.r+.72*max(0.0,mottling-.41)+.30*heat,0.0,1.0);
      // Worn enamel is smooth where it has been rubbed, rough where it has
      // spalled. Tens of microns of stipple ride on millimetres of raised chips.
      f.protrusion=.0061*(mottling-.5)+.00125*(grain-.5)-.0014*print.g
                   -.00085*flake+.0027*f.grime*mottling;
      f.protrusion*=mix(.44,1.0,smoothstep(.012,.075,edge));
      return f;
    }

    vec3 finishNormal(vec3 n,vec3 cameraPoint,float height,float slopeLimit) {
      #if defined(GL_OES_standard_derivatives) || __VERSION__ >= 300
      vec3 dx=dFdx(cameraPoint),dy=dFdy(cameraPoint);
      vec3 cx=cross(dy,n),cy=cross(n,dx);
      float determinant=dot(dx,cx);
      vec3 slope=(cx*dFdx(height)+cy*dFdy(height))*sign(determinant)/max(abs(determinant),.00000001);
      slope*=min(1.0,slopeLimit/max(length(slope),.0001));
      return normalize(n-slope);
      #else
      return n;
      #endif
    }

    // Integrate the brushed direction of the real surface against the visible
    // solar source. This is a second microfacet population, sharing energy with
    // the native GGX term and receiving exactly the same geometric shadow.
    vec3 rubbedSolarLobe(vec3 flux,vec3 l,vec3 v,vec3 n,vec2 alpha,vec3 f0,float f90) {
      float nl=max(dot(n,l),0.0),nv=max(dot(n,v),.003);
      if(nl<=0.0) return vec3(0.0);
      vec3 h=l+v;h*=inversesqrt(max(dot(h,h),.000001));
      vec3 axis=mat3(viewMatrix)*craftAxes*vec3(0.0,0.0,1.0);
      vec3 tangent=axis-n*dot(n,axis);
      if(dot(tangent,tangent)<.01) {
        axis=mat3(viewMatrix)*craftAxes*vec3(1.0,0.0,0.0);
        tangent=axis-n*dot(n,axis);
      }
      tangent*=inversesqrt(max(dot(tangent,tangent),.00001));
      vec3 bitangent=cross(n,tangent);
      // The apparent photosphere also has a finite angular radius.
      alpha=sqrt(alpha*alpha+vec2(.000064));
      vec2 hs=vec2(dot(tangent,h),dot(bitangent,h))/alpha;
      float nh=clamp(dot(n,h),0.0,1.0);
      float denom=dot(hs,hs)+nh*nh;
      float distribution=1.0/max(.00001,3.14159265*alpha.x*alpha.y*denom*denom);
      vec2 vs=alpha*vec2(dot(tangent,v),dot(bitangent,v));
      vec2 ls=alpha*vec2(dot(tangent,l),dot(bitangent,l));
      float masking=.5/max(.00001,nl*sqrt(nv*nv+dot(vs,vs))+nv*sqrt(nl*nl+dot(ls,ls)));
      float vh=clamp(dot(v,h),0.0,1.0);
      vec3 fresnel=f0+(vec3(f90)-f0)*pow(1.0-vh,5.0);
      return flux*(nl*distribution*masking)*fresnel;
    }

    vec3 solarEmitterColor() {
      float sunbreak=orbitSolarAltitude>-.99?
        orbitSunVisible*(1.0-smoothstep(.035,.16,orbitSolarAltitude)):
        1.0-smoothstep(.13,.42,orbitSunColor.b);
      return mix(vec3(13.6,13.1,12.35),vec3(13.2,10.65,7.86),sunbreak);
    }

    float finPassWeight(vec3 p,vec3 n,vec3 l,vec3 v,vec3 h) {
      if(finExposure<=0.0 || p.x> -1.68 || p.x< -3.1 || p.z<2.78 || p.z>4.72) return 0.0;
      // The polished shoulder runs down the inner face of the port fin into
      // its mounting saddle. The opposite fin and the stencilled insert are separate.
      float sheet=-2.25-.40*(p.y-.43)-.033*(p.z-2.0);
      vec2 q=vec2((p.y-1.38)/.54,(p.z-3.84-.34*(p.y-1.38))/.64);
      float fin=(1.0-smoothstep(.72,1.28,length(q)))*(1.0-smoothstep(.089,.19,abs(p.x-sheet)));
      vec3 saddle=(p-vec3(-2.46,.56,3.72))/vec3(.55,.29,.82);
      float foot=.43*(1.0-smoothstep(.46,1.25,length(saddle)));
      float area=max(fin,foot);
      if(area<=0.0) return 0.0;
      float width=mix(.154,.078,fin);
      float offAxis=max(0.0,1.0-dot(n,h));
      float footprint=exp(-offAxis/(width*width));
      float visible=smoothstep(.012,.108,dot(n,l))*smoothstep(.008,.081,dot(n,v));
      return finExposure*area*footprint*visible;
    }

    vec3 finiteSolarDisc(vec3 spec,vec3 flux,vec3 unshadowed,vec3 f0,float f90,float vh) {
      // At perfect alignment a passive optical surface can at most reflect the
      // radiance of the sun. Both the flux and its limit already contain PCF.
      vec3 fresnel=f0+(vec3(f90)-f0)*pow(1.0-clamp(vh,0.0,1.0),5.0);
      float strength=max(max(unshadowed.r,unshadowed.g),unshadowed.b);
      float pcf=max(max(flux.r,flux.g),flux.b)/max(.000001,strength);
      vec3 disc=solarEmitterColor()*clamp(pcf*orbitSunVisible,0.0,1.0)*fresnel;
      return disc*(vec3(1.0)-exp(-max(spec,vec3(0.0))/max(disc,vec3(.00001))));
    }

    vec3 emitterReflection(vec3 normal,vec3 view,float rough,float metal,vec3 base) {
      vec3 p=wearPoint,origin,radiance;
      float extent,source;
      float wing=abs(p.x);
      if(wing>3.32 && p.z>1.98) {
        origin=vec3(sign(p.x)*4.53,.054,3.08);
        radiance=p.x<0.0?vec3(1.0,.062,.018)*localLamps.x:vec3(.17,.83,1.0)*localLamps.y;
        extent=1.39;source=.014;
      } else if(wing>1.52 && wing<3.12 && p.z>4.33) {
        origin=vec3(sign(p.x)*2.25,.024,5.97);
        radiance=vec3(.12,.61,1.46)*(.42+1.88*localLamps.w);
        extent=1.71;source=.105;
      } else if(wing>1.32 && wing<2.63 && p.z>-2.92 && p.z<-1.53) {
        origin=vec3(sign(p.x)*1.90,.267,-2.375);
        radiance=vec3(.30,.92,1.18);extent=1.10;source=.027;
      } else if(wing<1.14 && p.z>.11 && p.z<2.55) {
        origin=vec3(0.0,1.107,1.245);
        radiance=vec3(1.12,.52,.17)*localLamps.z;extent=1.19;source=.018;
      } else return vec3(0.0);
      vec3 delta=origin-p;
      float d2=dot(delta,delta), d=sqrt(max(d2,.000001));
      vec3 light=mat3(viewMatrix)*craftAxes*(delta/d);
      vec3 h=light+view;h*=inversesqrt(max(dot(h,h),.0002));
      float nl=max(0.0,dot(normal,light));
      float radius=clamp(rough*rough+.13/(.21+d),.11,.81);
      float spec=pow(clamp(dot(normal,h),0.0,1.0),clamp(2.0/(radius*radius),3.0,140.0));
      float f0=.044+.51*metal;
      float f=f0+(1.0-f0)*pow(1.0-clamp(dot(view,h),0.0,1.0),5.0);
      float weight=(1.0-smoothstep(.25*extent,extent,d))*source/(.050+d2);
      return radiance*weight*nl*(base*(.43-.27*metal)+vec3(f*(.55+spec/(.052+radius*radius))));
    }
  `;

  function finishType(name) {
    if(name==="skin" || name==="glass") return name;
    if(name==="ivory" || name==="red") return "enamel";
    if(["pale","edge","alloy","finEdge","copper","iron","dark","black"].includes(name)) return "metal";
    return "interior";
  }

  function orbitalMaterials(T,wear,group) {
    const u = {
      orbitSun:{value:new T.Vector3(.75,.15,-.55).normalize()},
      orbitPlanet:{value:new T.Vector3(0,-1,0)},
      orbitSunColor:{value:new T.Color(1.0,.78,.56)},
      orbitDay:{value:0}, orbitSunVisible:{value:0}, orbitSolarAltitude:{value:-2}, orbitCapCos:{value:.32},
      orbitWeather:{value:null},flightWear:{value:wear},craftAxes:{value:new T.Matrix3()},
      localLamps:{value:new T.Vector4()},finExposure:{value:0}
    };
    // IBL is analytic, including the WebGL 1 / low-capability path where no
    // PMREM texture can be allocated. All other THREE material terms stay native.
    const indirect = T.ShaderChunk.lights_fragment_maps
      .replace("defined( USE_ENVMAP ) && defined( STANDARD ) && defined( ENVMAP_TYPE_CUBE_UV )","defined( STANDARD )")
      .replace("defined( USE_ENVMAP ) && defined( RE_IndirectSpecular )","defined( RE_IndirectSpecular )");
    const allLights=T.ShaderChunk.lights_fragment_begin;
    const directional=allLights.indexOf("getDirectionalLightInfo(");
    const shading="RE_Direct( directLight, geometryPosition, geometryNormal, geometryViewDir, geometryClearcoatNormal, material, reflectedLight );";
    // Inject into the existing directional-light loop after THREE samples the
    // physical occluders. Point lights and reflected blue sky use their own BRDF.
    const solarDirect=allLights.slice(0,directional)+allLights.slice(directional).replace(shading,`
      {
        vec3 oldSpec=reflectedLight.directSpecular;
        #ifdef USE_CLEARCOAT
          vec3 oldCoat=clearcoatSpecularDirect;
        #endif
        ${shading}
        vec3 localSun=mat3(viewMatrix)*orbitSun;
        if(orbitSunVisible>.0001 && dot(localSun,directLight.direction)>.99995) {
          vec3 l=directLight.direction, v=geometryViewDir, flux=directLight.color;
          vec3 nativeSpec=reflectedLight.directSpecular-oldSpec;
          vec3 h=l+v;h*=inversesqrt(max(dot(h,h),.00001));
          float vh=dot(v,h);
          float rr=material.roughness*material.roughness;
          #ifdef SOLAR_GLASS
            vec2 alpha=vec2(.041+.43*rr,.108+.58*rr);
            float share=.69;
          #elif defined(SOLAR_METAL)
            vec2 alpha=vec2(clamp(.020+.49*rr,.034,.27),clamp(.115+1.59*rr,.15,.62));
            float share=clamp(.48+.14*finish.scratch-.21*finish.grime,.22,.63);
          #else
            vec2 alpha=vec2(.045+.61*rr,.115+1.21*rr);
            float share=.19+.22*finish.flake+.13*finish.scratch;
          #endif
          vec3 brushed=rubbedSolarLobe(flux,l,v,solarFinishNormal,alpha,material.specularColor,material.specularF90);
          vec3 spec=mix(nativeSpec,brushed,share);
          vec3 filtered=finiteSolarDisc(spec,flux,directionalLight.color,material.specularColor,material.specularF90,vh);
          #ifndef SOLAR_GLASS
            vec3 polishNormal=normalize(mix(nonPerturbedNormal,solarFinishNormal,.29));
            float glint=finPassWeight(wearPoint,polishNormal,l,v,h);
            if(glint>0.0) {
              // A reflective, burnished area can show the spectrum of the photosphere
              // itself at grazing incidence. Use the direct light's measured PCF
              // attenuation here too, including in the recessed saddle.
              float shutter=max(max(flux.r,flux.g),flux.b)/
                max(.000001,max(max(directionalLight.color.r,directionalLight.color.g),directionalLight.color.b));
              vec3 silver=solarEmitterColor()*vec3(.887,.949,.993)*shutter*orbitSunVisible;
              // A thin layer of dust still transmits most of this shallow-angle reflection.
              float clean=clamp(1.05-.16*finish.grime+.06*finish.scratch,.84,1.0);
              filtered=mix(filtered,max(filtered,silver),glint*clean);
              // The compact reflected image of the sun can expose all three colour
              // layers. Keep that neutral core inside the bright, unoccluded reflection
              // so the ordinary bloom spreads it together with its warm shoulder.
              float dose=min(filtered.r,min(filtered.g,filtered.b));
              float core=smoothstep(4.9,8.1,dose)*smoothstep(.24,.65,glint);
              filtered=mix(filtered,vec3(max(filtered.r,max(filtered.g,filtered.b))),.88*core);
            }
          #endif
          reflectedLight.directSpecular=oldSpec+filtered;
          #ifndef SOLAR_GLASS
            float plain=max(0.0,dot(geometryNormal,l)), rounded=max(0.0,dot(solarFinishNormal,l));
            reflectedLight.directDiffuse+=.76*solarEdge*(rounded-plain)*flux*BRDF_Lambert(material.diffuseColor);
          #endif
          #ifdef USE_CLEARCOAT
            vec3 broadCoat=rubbedSolarLobe(flux,l,v,solarFinishNormal,vec2(.057,.105),
                     vec3(material.clearcoatF0),material.clearcoatF90);
            vec3 coat=mix(clearcoatSpecularDirect-oldCoat,broadCoat,.31);
            clearcoatSpecularDirect=oldCoat+finiteSolarDisc(coat,flux,directionalLight.color,vec3(material.clearcoatF0),material.clearcoatF90,vh);
          #endif
        }
      }`);
    function install(mat,kind) {
      const exterior=kind!=="interior", glass=kind==="glass", coated=kind==="skin" || kind==="enamel";
      mat.onBeforeCompile = shader => {
        Object.assign(shader.uniforms,u);
        shader.fragmentShader=shader.fragmentShader
          .replace("#include <envmap_physical_pars_fragment>",orbitalEnvironment+(exterior?wearSurface:""))
          .replace("#include <lights_fragment_maps>",indirect);
        if(exterior) {
          shader.fragmentShader=(glass?"#define SOLAR_GLASS\n":kind==="metal"?"#define SOLAR_METAL\n":"")+shader.fragmentShader.replace("#include <lights_fragment_begin>",solarDirect);
          shader.vertexShader="varying vec3 wearPoint;\nvarying vec3 wearEdge;\n"+
            (glass?"":"attribute vec3 wearDistance;\n")+shader.vertexShader.replace("#include <begin_vertex>",
            "#include <begin_vertex>\nwearPoint=position;\nwearEdge="+(glass?"vec3(12.0)":"wearDistance")+";");
          let finishColor="";
          if(coated) finishColor=`
            diffuseColor.rgb*=.77+.47*finish.rough;
            diffuseColor.rgb*=mix(vec3(1.0),vec3(.33,.288,.236),.95*finish.grime);
            diffuseColor.rgb*=mix(vec3(1.0),vec3(1.0,.85,.66),finish.age*.72);
            vec3 primer=mix(vec3(.094,.104,.098),vec3(.39,.415,.38),smoothstep(.34,.71,finish.tooth));
            diffuseColor.rgb=mix(diffuseColor.rgb,primer,clamp(.87*finish.flake+.33*finish.scratch,0.0,.94));
          `;
          if(kind==="metal") finishColor=`
            float oxide=finish.heat*(.46+.54*finish.rough);
            vec3 heatTint=mix(vec3(.86,.60,.37),vec3(.54,.50,.68),smoothstep(4.70,5.67,wearPoint.z));
            diffuseColor.rgb*=mix(vec3(.95,.99,1.0),heatTint,oxide);
            diffuseColor.rgb*=(.69+.60*finish.rough)*mix(vec3(1.0),vec3(.43,.39,.35),.86*finish.grime);
            diffuseColor.rgb=mix(diffuseColor.rgb,vec3(.34,.39,.42),.26*finish.flake+.15*finish.scratch);
            diffuseColor.rgb*=mix(vec3(1.0),vec3(.63,.65,.68),finish.louvers);
          `;
          shader.fragmentShader=shader.fragmentShader.replace("#include <color_fragment>",
            "#include <color_fragment>\nFinish finish=readFinish();\n"+finishColor);
          const roughChange=glass?
            "roughnessFactor+=.022*finish.scratch+.014*(finish.tooth-.5);":kind==="metal"?
            `float edgeSpan=min(wearEdge.x,min(wearEdge.y,wearEdge.z));
             float smallHardware=(1.0-smoothstep(.69,1.06,abs(wearPoint.x)))*smoothstep(.50,.78,wearPoint.y);
             roughnessFactor+=.24*finish.grime+.21*(finish.rough-.5)+.10*(finish.tooth-.5)
                   -.087*finish.scratch-.045*finish.flake+.065*finish.heat;
             roughnessFactor=max(roughnessFactor,.22+.085*(1.0-smoothstep(.012,.082,edgeSpan))+.11*smallHardware);
             roughnessFactor=max(roughnessFactor,finish.louvers*(.54+.05*finish.tooth));`:
            `roughnessFactor+=.26*finish.grime+.26*(finish.rough-.50)+.18*(finish.tooth-.50)
                    -.20*finish.scratch-.14*finish.flake+.065*finish.heat;`;
          const ink=kind==="skin"?`
            float ink=1.0-smoothstep(.055,.33,dot(diffuseColor.rgb,vec3(.2126,.7152,.0722)));
            float enamel=smoothstep(.04,.22,diffuseColor.r-diffuseColor.b);
            roughnessFactor+=.065*ink-.050*enamel;`:"";
          shader.fragmentShader=shader.fragmentShader
            .replace("#include <roughnessmap_fragment>","#include <roughnessmap_fragment>\n"+roughChange+ink+
              "\nroughnessFactor=clamp(roughnessFactor,"+(glass?".052,.19":".15,.85")+");")
            .replace("#include <metalnessmap_fragment>","#include <metalnessmap_fragment>\n"+
              (coated?"metalnessFactor+=.25*finish.flake;":kind==="metal"?"metalnessFactor*=(1.0-.48*finish.grime-.20*finish.heat)*(1.0-.46*finish.louvers);":""))
            .replace("#include <normal_fragment_maps>","#include <normal_fragment_maps>\nnormal=finishNormal(normal,-vViewPosition,finish.protrusion*"+
              (glass?".09,.026":kind==="metal"?".94,.17":".95,.19")+");\n"+
              (glass?"float solarEdge=0.0;vec3 solarFinishNormal=normal;\n":
                `// A rolled tile or machined shoulder bends the reflection across a few
                 // centimetres. The distance field contains only true mesh edges.
                 float edgeDistance=min(wearEdge.x,min(wearEdge.y,wearEdge.z));
                 float edgeRadius=`+(kind==="metal"?".038":".025")+`;
                 float solarEdge=1.0-smoothstep(.002,edgeRadius,edgeDistance);
                 float offset=max(0.0,1.0-edgeDistance/edgeRadius);
                 float bevel=-.62*edgeRadius*offset*offset;
                 vec3 solarFinishNormal=finishNormal(normal,-vViewPosition,bevel,.90);
                 `)+
              `#if defined(GL_OES_standard_derivatives) || __VERSION__ >= 300
                // Integrate the normal footprint. A subpixel cut spreads the
                // reflected blue limb over the lobe as the camera moves.
                vec3 nx=dFdx(normal),ny=dFdy(normal);
                float variance=min(`+(glass?".008":".049")+`,.16*(dot(nx,nx)+dot(ny,ny)));
                float aaRough=roughnessFactor*roughnessFactor;
                roughnessFactor=sqrt(sqrt(aaRough*aaRough+variance));
              #endif`)
            .replace("#include <clearcoat_normal_fragment_maps>",`#include <clearcoat_normal_fragment_maps>
              #ifdef USE_CLEARCOAT
                clearcoatNormal=normalize(mix(clearcoatNormal,normal,.62));
              #endif`)
            .replace("#include <lights_fragment_end>",`#include <lights_fragment_end>
             reflectedLight.directSpecular+=emitterReflection(normal,geometryViewDir,roughnessFactor,metalnessFactor,diffuseColor.rgb);`);
          if(coated) shader.fragmentShader=shader.fragmentShader.replace("#include <lights_physical_fragment>",
            `#include <lights_physical_fragment>
             #ifdef USE_CLEARCOAT
               material.clearcoatRoughness=clamp(material.clearcoatRoughness+.25*finish.grime+.18*(finish.rough-.5),.10,.76);
               material.clearcoat*=1.0-.58*finish.grime-.32*finish.flake;
             #endif`);
        }
        if(glass) {
          shader.fragmentShader=shader.fragmentShader.replace("#include <opaque_fragment>",
            `float facing=max(.025,dot(normal,geometryViewDir));
             float glazeF=.073+.927*pow(clamp(1.0-facing,0.0,1.0),5.0);
             float through=exp(-.78/max(facing,.16))*(1.0-glazeF);
             float opticalAlpha=1.0-through;
             gl_FragColor=vec4(outgoingLight/opticalAlpha,opticalAlpha);`);
        }
      };
      mat.customProgramCacheKey=()=>"sv07-flown-orbit-"+kind;
    }
    function set({sunDirection, planetDirection, sunVisibility, solarAltitude, daylight, sunColor, planetCosRadius, weather}) {
      group.updateWorldMatrix(true,false);
      u.craftAxes.value.setFromMatrix4(group.matrixWorld);
      u.orbitSun.value.copy(sunDirection);
      u.orbitPlanet.value.copy(planetDirection);
      u.orbitSunColor.value.copy(sunColor);
      u.orbitSunVisible.value=sunVisibility;
      u.orbitSolarAltitude.value=Number.isFinite(solarAltitude)?solarAltitude:-2;
      u.orbitDay.value=daylight;
      u.orbitCapCos.value=Math.min(.96,Math.max(.04,planetCosRadius));
      u.orbitWeather.value=weather || null;
    }
    return {install,set,lamps:u.localLamps.value,finExposure:u.finExposure};
  }

  // A thin, optically active plasma volume starts inside each nozzle lip. Its
  // emission and extinction are integrated along the view ray in nozzle metres.
  // This also works looking straight down the exhaust, without billboards.
  function createBurners(T, group, materials) {
    const drive = { value:.3 }, clock = { value:0 }, length = { value:2.5 };
    const flow = `
      vec2 slipstream(float z, float u, float time, float seed) {
        float drift=(.003+.067*u*u)*smoothstep(0.0,.46,z);
        return drift*vec2(sin(z*(1.78+.11*seed)-time*1.48+seed) + .28*sin(5.0*z-time*.91),
                         .77*sin(2.13*z-time*1.23+2.1*seed)+ .23*sin(4.21*z-time*1.63));
      }
    `;
    const volumeVertex = `
      uniform float jetLength;
      varying vec3 vEntry;
      varying vec3 vEye;
      void main() {
        vEntry=vec3(position.xy,position.z*jetLength);
        // The nozzle rig has a rigid model-view transform; R transpose gives
        // the camera position in local coordinates on WebGL 1 as well.
        vEye=-modelViewMatrix[3].xyz*mat3(modelViewMatrix);
        gl_Position=projectionMatrix*modelViewMatrix*vec4(vEntry,1.0);
      }
    `;
    const volumeFragment = `
      uniform float drive;
      uniform float filmTime;
      uniform float jetLength;
      uniform float port;
      varying vec3 vEntry;
      varying vec3 vEye;
      ${flow}
      void main() {
        vec3 ray=normalize(vEntry-vEye);
        // The proxy cylinder supplies the near intersection. Find the opposite
        // wall or end cap so the apparent brightness follows the optical path.
        float a=dot(ray.xy,ray.xy), b=dot(vEntry.xy,ray.xy);
        float c=dot(vEntry.xy,vEntry.xy)-.64*.64;
        float toWall=a>.00001 ? (-b+sqrt(max(0.0,b*b-a*c)))/a : 1000.0;
        float toCap=1000.0;
        if(ray.z>.00001) toCap=(jetLength-vEntry.z)/ray.z;
        if(ray.z<-.00001) toCap=-vEntry.z/ray.z;
        float span=max(0.0,min(toWall,toCap));
        if(span<.0001) discard;
        const int samples=32;
        float ds=span/float(samples);
        vec3 stepRay=ray*ds;
        vec3 samplePos=vEntry+.5*stepRay;
        float transmission=1.0;
        vec3 light=vec3(0.0);

        for(int i=0;i<samples;i++){
          float z=clamp(samplePos.z,0.0,jetLength);
          float u=clamp(z/jetLength,0.0,1.0);
          vec2 radial=samplePos.xy-slipstream(z,u,filmTime,port);
          float r2=dot(radial,radial);
          // Collimated plasma contracts into moving bright waists. The cells
          // expand and lose contrast as the gas mixes with the outer stream.
          float cycle=6.28318*z/((.61+.34*drive)*(1.0+.093*z))+
                      .20*sin(filmTime*1.66+port+z*1.25);
          float pinch=.5+.5*cos(cycle);
          float focus=pinch*pinch*pinch;
          float coreRadius=(.108+.038*drive)*(1.0-.52*u)*(1.0+.46*(1.0-2.0*pinch));
          float core=exp(-1.44*r2/(coreRadius*coreRadius))*(1.0-smoothstep(.28,.91,u));
          core*=.49+1.03*focus;
          float throat=exp(-2.8*z);
          float spineRadius=(.065+.027*drive)*(1.0-.37*u)*(.79+.27*focus);
          float spine=exp(-1.72*r2/(spineRadius*spineRadius))*
                      (1.0-smoothstep(.19,.69,u))*(.57+.58*focus);
          float radius=sqrt(r2);
          float cellRadius=(.035+(.114+.036*drive)*(1.0-pinch))*(1.0-.45*u);
          float cellDelta=(radius-cellRadius)/(.029+.015*u);
          float cell=exp(-cellDelta*cellDelta)*(1.0-smoothstep(.30,.82,u));
          // One broad mixing layer, with a lighter folded sheet near its rim.
          // Transverse modes move with the gas, smoothly and independently in
          // each nozzle. Their amplitudes are smallest at the machined lip.
          float wave=sin(5.18*z-filmTime*1.90+radial.x*12.4+port)*
                     sin(2.79*z-filmTime*1.46+radial.y*14.0+2.6*port);
          float sheathRadius=.221+.095*u+.075*u*u+.024*(1.0-pinch)*drive;
          float shear=exp(-1.64*r2/(sheathRadius*sheathRadius))*
                      (1.0-smoothstep(.47,1.0,u))*(.86+.24*u*wave);
          float foldRadius=sheathRadius*(.69+.16*wave);
          float foldDelta=(radius-foldRadius)/(.033+.037*u);
          float fold=exp(-foldDelta*foldDelta)*(1.0-smoothstep(.38,.99,u))*
                     (.30+.32*(wave+1.0));
          vec3 hot=mix(vec3(.045,.54,1.13),vec3(.69,1.13,1.30),throat);
          vec3 mantle=mix(vec3(.019,.245,.86),vec3(.089,.075,.59),u);
          vec3 spineColor=mix(vec3(1.04,1.24,1.36),vec3(.44,.99,1.29),u);
          vec3 emission=spineColor*spine*(6.6+13.8*drive)
                       +hot*core*(4.8+8.8*drive) + mantle*shear*(.44+1.12*drive)
                       +vec3(.061,.25,.89)*fold*(.21+.56*drive)
                       +vec3(.115,.59,1.10)*cell*(.72+1.85*drive);
          float extinction=spine*1.1+core*(1.17+1.20*drive)+shear*.19+fold*.05;
          float halfTransmission=exp(-.5*extinction*ds);
          light+=transmission*halfTransmission*emission*ds;
          transmission*=halfTransmission*halfTransmission;
          samplePos+=stepRay;
        }
        gl_FragColor=vec4(light,1.0-transmission);
      }
    `;
    const volume = new T.CylinderGeometry(.64,.64,1,24,1,false);
    volume.rotateX(Math.PI/2);
    volume.translate(0,0,.5);
    volume.boundingSphere=new T.Sphere(new T.Vector3(0,0,2.66),2.98);

    // Small, tapered parcels of excited gas advect within the boundary layer.
    // Their 3D spindle profiles stay thin when seen in profile and foreshorten
    // down the barrel. Phase and fade are pure functions of the transport clock.
    const parcelVertex = `
      attribute vec4 flowSeed;
      uniform float drive;
      uniform float filmTime;
      uniform float port;
      uniform float jetLength;
      varying float vGlow;
      varying float vAlong;
      varying float vIce;
      ${flow}
      void main() {
        float age=fract(flowSeed.x+filmTime*(.57+.53*flowSeed.w)+port*.177);
        float u=.019+1.10*age;
        float z=jetLength*u;
        float spin=6.28318*flowSeed.y+.44*z+port+.36*sin(z*1.74-filmTime*.82+flowSeed.y*5.0);
        float orbit=(.062+.166*sqrt(flowSeed.z))*(.71+.76*age)+.142*age*age*flowSeed.z;
        vec2 ring=vec2(cos(spin),sin(spin));
        vec2 center=slipstream(z,min(u,1.0),filmTime,port)+orbit*ring;
        float particleRadius=(.0067+.0055*flowSeed.w)*(.69+.42*drive);
        float halfTrail=(.028+.035*drive+.025*age)*(.72+.45*flowSeed.z);
        vec3 local=vec3(center+position.xy*particleRadius+.23*halfTrail*position.z*vec2(-ring.y,ring.x),
                        z+position.z*halfTrail);
        float population=1.0-smoothstep(.19+.76*drive,.28+.76*drive,flowSeed.w);
        vGlow=population*smoothstep(.04,.22,age)*(1.0-smoothstep(.64,.94,age))*(.085+.22*drive);
        vAlong=position.z;
        vIce=flowSeed.y;
        gl_Position=projectionMatrix*modelViewMatrix*vec4(local,1.0);
      }
    `;
    const parcelFragment = `
      varying float vGlow;
      varying float vAlong;
      varying float vIce;
      void main() {
        float profile=max(0.0,1.0-vAlong*vAlong);
        vec3 tint=mix(vec3(.028,.30,.92),vec3(.17,.64,1.10),vIce);
        gl_FragColor=vec4(tint,vGlow*profile*profile);
      }
    `;
    const parcels = new T.InstancedBufferGeometry();
    const parcelPoints=[], parcelIndices=[];
    const rings=[[-1,.012],[-.53,.72],[-.14,1],[.36,.74],[1,.012]];
    for(let k=0;k<rings.length;k++) for(let j=0;j<=8;j++){
      const [z,r]=rings[k], angle=2*Math.PI*j/8;
      parcelPoints.push(r*Math.cos(angle),r*Math.sin(angle),z);
      if(k<rings.length-1 && j<8){
        const i=k*9+j;
        parcelIndices.push(i,i+1,i+10,i,i+10,i+9);
      }
    }
    parcels.setAttribute("position",new T.Float32BufferAttribute(parcelPoints,3));
    parcels.setIndex(parcelIndices);
    let state=0x793d51c3;
    const random=()=>((state=(Math.imul(state,1664525)+1013904223)>>>0)/4294967296);
    const count=29, seeds=new Float32Array(count*4);
    for(let i=0;i<count;i++){
      seeds[i*4]=(i+random()*.82)/count;
      seeds[i*4+1]=random();
      seeds[i*4+2]=random();
      seeds[i*4+3]=random();
    }
    parcels.setAttribute("flowSeed",new T.InstancedBufferAttribute(seeds,4));
    parcels.instanceCount=count;
    parcels.boundingSphere=new T.Sphere(new T.Vector3(0,0,2.88),3.19);
    for(const side of [-1,1]) {
      const uniforms={drive,filmTime:clock,jetLength:length,port:{value:side<0?.41:3.17}};
      const body=new T.Mesh(volume,new T.ShaderMaterial({
        uniforms,vertexShader:volumeVertex,fragmentShader:volumeFragment,
        transparent:true,depthWrite:false,depthTest:true,toneMapped:false,
        blending:T.CustomBlending,blendEquation:T.AddEquation,
        blendSrc:T.OneFactor,blendDst:T.OneMinusSrcAlphaFactor
      }));
      const motes=new T.Mesh(parcels,new T.ShaderMaterial({
        uniforms,vertexShader:parcelVertex,fragmentShader:parcelFragment,
        transparent:true,depthWrite:false,depthTest:true,toneMapped:false,blending:T.AdditiveBlending
      }));
      body.name="SV-07 / plasma volume";
      motes.name="SV-07 / plasma particles";
      body.position.set(side*2.25,.024,5.90);
      motes.position.copy(body.position);
      group.add(body,motes);
    }

    // The emitter sits deeper in the real metal nozzle than the plume. Retain
    // its dark annular groove and the segmentation of its bright outer ring.
    materials.engineCore.onBeforeCompile=shader=>{
      shader.vertexShader="varying vec2 vThroat;\n"+shader.vertexShader.replace(
        "#include <begin_vertex>",
        "#include <begin_vertex>\nvThroat=vec2(abs(position.x)-2.25,position.y-.024)/.24;");
      shader.fragmentShader="varying vec2 vThroat;\n"+shader.fragmentShader.replace(
        "#include <color_fragment>",`#include <color_fragment>
        float radius=length(vThroat), azimuth=atan(vThroat.y,vThroat.x);
        float center=1.0-smoothstep(.38,.72,radius);
        float ring=exp(-80.0*(radius-.82)*(radius-.82));
        float sectors=.68+.32*smoothstep(-.77,-.30,cos(azimuth*12.0));
        diffuseColor.rgb*=.15+1.02*center+.81*ring*sectors;`);
    };
    materials.engineCore.customProgramCacheKey=()=>"sv07-ion-throat";
    const coreColor=materials.engineCore.color.clone(), ringColor=materials.engineRing.color.clone();
    function update(seconds, thrust) {
      const p=Math.max(0,Math.min(1,Number.isFinite(thrust)?thrust:.3));
      drive.value=p;
      clock.value=seconds;
      length.value=1.04+3.07*p;
      const modulation=1+.014*Math.sin(seconds*3.6)+.007*Math.sin(seconds*5.18);
      materials.engineCore.color.copy(coreColor).multiplyScalar((2.15+4.85*p)*modulation);
      materials.engineRing.color.copy(ringColor).multiplyScalar(1.13+2.83*p);
    }
    return update;
  }

  function create(T) {
    const group = new T.Group();
    group.name = "SV-07 • Penumbra";
    const {paint,wear}=paintTexture(T);
    const orbital=orbitalMaterials(T,wear,group);
    const metal = (color, roughness, metalness) => new T.MeshStandardMaterial({color,roughness,metalness});
    const glow = (color, intensity) => {
      const material = new T.MeshBasicMaterial({ color, toneMapped:false });
      material.color.multiplyScalar(intensity);
      return material;
    };
    const materials = {
      skin: new T.MeshPhysicalMaterial({color:0xffffff, map:paint, metalness:.028, roughness:.395,
        ior:1.54, clearcoat:.15, clearcoatRoughness:.23}),
      ivory: metal(0xcacbc2,.405,.035), pale: metal(0x969e9a,.41,.64),
      edge: metal(0x68747a,.31,.81), alloy: metal(0x9aa7ab,.245,.87),
      finEdge: metal(0xb8b5ac,.225,.93),
      copper: metal(0xbe724a,.32,.78), red: metal(0xca462f,.345,.035),
      iron: metal(0x475057,.405,.76), dark: metal(0x27323a,.44,.70),
      black: metal(0x171e22,.54,.31), rubber: metal(0x14212a,.72,.02),
      glass: new T.MeshPhysicalMaterial({color:0x112b3a, metalness:0, roughness:.078,
        ior:1.73, clearcoat:.53, clearcoatRoughness:.065, specularIntensity:1,
        transparent:true, depthWrite:false}),
      pilotShell:metal(0xa5aaa1,.38,.15), visor:metal(0x253744,.16,.72),
      instruments:glow(0x76b4c5,.48), instrumentAmber:glow(0xf4a170,.38),
      light:glow(0xa9f6ff,1.65), engineCore:glow(0xdbfcff,1), engineRing:glow(0x38cbe8,1),
      navRed:glow(0xff4f38,1), navBlue:glow(0x72e5e6,1), dorsalBeacon:glow(0xffbd83,1)
    };
    const finMarks={ positions:[], normals:[], uvs:[] };
    const batches = new Map();
    for (const name of Object.keys(materials)) batches.set(name,{ positions:[], normals:[], uvs:[] });
    function normal(a,b,c) {
      const ax=b[0]-a[0], ay=b[1]-a[1], az=b[2]-a[2];
      const bx=c[0]-a[0], by=c[1]-a[1], bz=c[2]-a[2];
      const x=ay*bz-az*by, y=az*bx-ax*bz, z=ax*by-ay*bx;
      const mag=Math.hypot(x,y,z) || 1;
      return [x/mag,y/mag,z/mag];
    }
    function triangle(mat,a,b,c,n) {
      const dest=batches.get(mat);
      const faceNormal=n || normal(a,b,c);
      for (const p of [a,b,c]) {
        dest.positions.push(...p);
        dest.normals.push(...faceNormal);
        dest.uvs.push((p[0]-paintBounds.left)/paintBounds.width,1-(p[2]-paintBounds.front)/paintBounds.length);
      }
    }
    function quad(mat,a,b,c,d,reverse=false) {
      if (reverse) [b,d]=[d,b];
      triangle(mat,a,b,c);
      triangle(mat,a,c,d);
    }

    // Each closed ring runs counterclockwise in the X/Y plane, viewed from the tail.
    function loft(rings, wallMaterials, frontMaterial, backMaterial, mirrored=false) {
      const count=rings[0].length;
      for (let k=0; k<rings.length-1; k++) for (let j=0; j<count; j++) {
        const i=(j+1)%count;
        quad(wallMaterials[j],rings[k][j],rings[k][i],rings[k+1][i],rings[k+1][j],mirrored);
      }
      const first=rings[0], last=rings[rings.length-1];
      for (let j=1; j<count-1; j++) {
        if (mirrored) {
          triangle(frontMaterial,first[0],first[j],first[j+1]); triangle(backMaterial,last[0],last[j+1],last[j]);
        } else {
          triangle(frontMaterial,first[0],first[j+1],first[j]); triangle(backMaterial,last[0],last[j],last[j+1]);
        }
      }
    }
    // Station values: longitudinal position, centre X, half width, keel, chine, and crown height.
    function shell(stations, m, sign=1) {
      const rings=stations.map(([z,c,w,keel,belt,top]) => {
        const h=top-belt;
        return [[-.68,keel],[.68,keel],[1,belt],[.96,belt+.43*h],[.70,top-.12*h],
          [.32,top],[-.32,top],[-.70,top-.12*h],[-.96,belt+.43*h],[-1,belt]].map(([x,y]) => [sign*(c+x*w),y,z]);
      });
      const surround=[m.belly,m.flank,m.belt||m.flank,m.edge,m.top,m.top,m.top,m.edge,m.belt||m.flank,m.flank];
      loft(rings,surround,m.front||m.flank,m.back||m.flank,sign<0);
    }
    const chassis={belly:"dark",flank:"iron",belt:"dark",edge:"edge",top:"iron"};
    const ceramic={belly:"iron",flank:"pale",belt:"ivory",edge:"skin",top:"skin"};
    const darkArmour={belly:"black",flank:"dark",belt:"iron",edge:"edge",top:"dark"};
    const cowling={belly:"black",flank:"edge",belt:"pale",edge:"skin",top:"skin",front:"iron"};
    function plate(points,sign,topAt,depth,top,side="iron",bottom="dark") {
      let points3=points.map(([x,z])=>[sign*x,typeof topAt==="function"?topAt(x,z):topAt,z]);
      let area=0;
      points3.forEach((p,i)=>{const q=points3[(i+1)%points3.length]; area+=p[0]*q[2]-q[0]*p[2];});
      if (area>0) points3.reverse();
      const lower=points3.map(([x,y,z])=>[x,y-depth,z]);
      const triangles=T.ShapeUtils.triangulateShape(points3.map(p=>new T.Vector2(p[0],p[2])),[]);
      for (let [a,b,c] of triangles) {
        if (normal(points3[a],points3[b],points3[c])[1]<0) [b,c]=[c,b];
        triangle(top,points3[a],points3[b],points3[c]);
        triangle(bottom,lower[c],lower[b],lower[a]);
      }
      points3.forEach((p,i)=>{
        const j=(i+1)%points3.length;
        quad(side,p,lower[i],lower[j],points3[j]);
      });
    }
    const cube=new T.BoxGeometry(1,1,1).toNonIndexed();
    function block(center,size,mat,q) {
      const matrix=new T.Matrix4().compose(new T.Vector3(...center),q||new T.Quaternion(),new T.Vector3(...size));
      const a=cube.getAttribute("position");
      for (let i=0; i<a.count; i+=3) {
        const pts=[i,i+1,i+2].map(j=>new T.Vector3().fromBufferAttribute(a,j).applyMatrix4(matrix).toArray());
        triangle(mat,...pts);
      }
    }
    function strut(a,b,width,height,mat) {
      const av=new T.Vector3(...a), bv=new T.Vector3(...b), direction=bv.sub(av), len=direction.length();
      if (len<.00001) return;
      const q=new T.Quaternion().setFromUnitVectors(new T.Vector3(0,0,1),direction.divideScalar(len));
      block(a.map((v,i)=>(v+b[i])*.5),[width,height,len],mat,q);
    }
    function ovoid(center,radii,mat,phiStart=0,phiLength=2*Math.PI,thetaStart=0,thetaLength=Math.PI) {
      const g=new T.SphereGeometry(1,16,10,phiStart,phiLength,thetaStart,thetaLength);
      const p=g.getAttribute("position"), n=g.getAttribute("normal"), dest=batches.get(mat);
      for(const i of g.index.array) {
        const v=[p.getX(i),p.getY(i),p.getZ(i)].map((c,a)=>center[a]+c*radii[a]);
        const dir=[n.getX(i)/radii[0],n.getY(i)/radii[1],n.getZ(i)/radii[2]];
        const mag=Math.hypot(...dir);
        dest.positions.push(...v); dest.normals.push(...dir.map(c=>c/mag));
        dest.uvs.push((v[0]-paintBounds.left)/paintBounds.width,1-(v[2]-paintBounds.front)/paintBounds.length);
      }
      g.dispose();
    }
    function tubes(x,y,segments,count,angle=0) {
      for (let k=0;k<segments.length-1;k++) {
        const [z0,r0,m]=segments[k], [z1,r1]=segments[k+1];
        for (let j=0;j<count;j++) {
          const a=angle+2*Math.PI*j/count,b=angle+2*Math.PI*(j+1)/count;
          const p=(r,t,z)=>[x+r*Math.cos(t),y+r*Math.sin(t),z];
          quad(m,p(r0,a,z0),p(r0,b,z0),p(r1,b,z1),p(r1,a,z1));
        }
      }
    }
    function endDisk(x,y,z,r,count,mat) {
      for(let i=0;i<count;i++) {
        const a=i*2*Math.PI/count, b=(i+1)*2*Math.PI/count;
        triangle(mat,[x,y,z],[x+r*Math.cos(a),y+r*Math.sin(a),z],[x+r*Math.cos(b),y+r*Math.sin(b),z]);
      }
    }

    // Central pressure hull. Its exposed perimeter is the dark seam around the ceramic tiles.
    shell([[-6.93,0,.07,-.09,-.045,-.013],[-6.35,0,.28,-.20,-.07,.085],
      [-5.10,0,.65,-.33,-.10,.25],[-3.52,0,.98,-.49,-.13,.45],[-1.48,0,1.37,-.64,-.11,.64],
      [.34,0,1.50,-.66,-.095,.71],[2.45,0,1.40,-.61,-.115,.68],[4.12,0,1.08,-.48,-.08,.50],
      [5.14,0,.78,-.32,-.04,.34]],chassis);
    shell([[-6.82,0,.077,-.049,-.016,.04],[-6.23,0,.31,-.085,.00,.13],[-5.15,0,.6,-.07,.06,.31],
      [-4.25,0,.83,-.04,.12,.44],[-3.58,0,.87,.02,.21,.51]],ceramic);
    shell([[-3.54,0,.866,.022,.213,.51],[-2.92,0,1.00,.028,.235,.57],[-2.23,0,1.16,.048,.28,.65]],ceramic);
    // A split ventral keel gives the underside as much structure as the top.
    shell([[-5.58,0,.13,-.30,-.24,-.19],[-3.67,0,.34,-.55,-.48,-.33],
      [-1.37,0,.51,-.83,-.66,-.52],[1.82,0,.47,-.81,-.67,-.46],[4.15,0,.27,-.56,-.46,-.34]],darkArmour);

    const glassShape=[[-3.98,.10,.394,.429,.475],[-3.40,.47,.426,.55,.79],[-2.30,.69,.55,.76,1.30],
                      [-1.05,.789,.59,.845,1.56],[-.39,.741,.628,.856,1.55],[.20,.576,.659,.805,1.31],
                      [.64,.34,.67,.76,1.00]];
    function canopyRing(spec, extra=0, drop=0) {
      const [z,w,b,belt,h]=spec;
      const section=[[-w*.86,b],[w*.86,b]];
      for(let j=0;j<=14;j++) {
        const theta=j*Math.PI/14;
        section.push([w*Math.cos(theta),belt+(h-belt)*Math.pow(Math.max(0,Math.sin(theta)),.84)]);
      }
      return section.map(([x,y])=>[x+Math.sign(x)*extra,y+drop,z]);
    }
    // Interpolate the original design stations with their longitudinal tangents.
    // The pressure canopy is a continuous curved shell between the structural bows.
    const refined=[];
    for(let i=0;i<glassShape.length-1;i++) {
      const a=glassShape[i], b=glassShape[i+1], prev=glassShape[Math.max(i-1,0)];
      const next=glassShape[Math.min(i+2,glassShape.length-1)], dz=b[0]-a[0];
      refined.push(a,a.map((v,k)=>.5*(v+b[k])+.125*dz*((b[k]-prev[k])/(b[0]-prev[0])-
        (next[k]-v)/(next[0]-a[0]))));
    }
    refined.push(glassShape[glassShape.length-1]);
    const support=refined.map(st=>canopyRing(st,.032,-.017));
    const canopy=refined.map(st=>canopyRing(st));
    const glazing=Array(canopy[0].length).fill("glass");
    glazing[0]=glazing[1]=glazing[glazing.length-1]="rubber";
    loft(canopy,glazing,"rubber","iron");

    // The helmet, seat and low instrument coaming sit below the canopy.
    const tub=glassShape.map(([z,w,b])=>[z,0,w*.985,b-.035,b+.03,b+.068]);
    shell(tub,{belly:"dark",flank:"rubber",edge:"rubber",top:"rubber"});
    const recline=new T.Quaternion().setFromAxisAngle(new T.Vector3(1,0,0),.17);
    block([0,.77,-1.47],[.54,.15,.62],"rubber");
    block([0,.98,-1.05],[.53,.53,.15],"dark",recline);
    block([0,1.225,-.975],[.335,.23,.165],"rubber",recline);
    for(const s of [-1,1]){
      strut([s*.238,.78,-1.60],[s*.238,1.16,-1.03],.085,.089,"rubber");
      strut([s*.144,1.15,-1.082],[s*.109,.902,-1.144],.043,.035,"pale");
      strut([s*.44,.715,-1.72],[s*.43,.715,-.80],.095,.094,"iron");
      block([s*.293,.747,-2.426],[.088,.014,.036],"instruments");
    }
    block([0,.715,-2.44],[.71,.079,.225],"black");
    block([0,.763,-2.437],[.184,.012,.061],"instruments");
    for(let j=0;j<4;j++) block([-.247+.055*j,.760,-2.369],[.025,.013,.021],
      j===0?"instrumentAmber":"instruments");
    // A compact survey pilot with an inset dark visor gives the cockpit its scale.
    ovoid([0,.926,-1.430],[.22,.195,.158],"rubber");
    ovoid([0,.970,-1.520],[.193,.127,.113],"iron");
    ovoid([0,1.070,-1.447],[.105,.075,.104],"dark");
    ovoid([0,1.202,-1.456],[.145,.153,.151],"pilotShell");
    ovoid([0,1.201,-1.458],[.148,.155,.155],"visor",Math.PI+.10,Math.PI-.20,.68,1.05);
    for(const sign of [-1,1]) {
      ovoid([sign*.143,1.192,-1.431],[.030,.066,.063],"edge");
      ovoid([sign*.202,1.012,-1.446],[.095,.077,.102],"pale");
      strut([sign*.234,.991,-1.46],[sign*.299,.873,-1.68],.103,.083,"rubber");
      strut([sign*.299,.873,-1.68],[sign*.256,.84,-1.94],.094,.071,"iron");
      ovoid([sign*.255,.844,-1.966],[.055,.042,.070],"rubber");
      strut([sign*.123,1.062,-1.55],[sign*.086,.903,-1.619],.031,.027,"edge");
    }
    function crossCanopy(spec,material,w) {
      const shape=canopyRing(spec,.010,.007);
      for(let i=2;i<shape.length-1;i++) strut(shape[i],shape[i+1],w,w*.66,material);
    }
    crossCanopy(glassShape[1],"dark",.046);
    crossCanopy(glassShape[4],"iron",.070);
    crossCanopy(glassShape[6],"edge",.075);
    for (const sign of [-1,1]) {
      // Low rails frame the canopy without breaking its broad reflective glass facets.
      for(let k=0;k<support.length-1;k++) {
        const i=sign>0?2:support[k].length-1;
        strut(support[k][i],support[k+1][i],.059,.058,"alloy");
      }
      shell([[-4.50,.58,.09,.12,.22,.31],[-3.69,.73,.20,.12,.30,.49],[-2.57,.91,.26,.15,.36,.66],
        [-1.09,1.06,.33,.19,.41,.86],[.38,1.05,.35,.21,.43,.88],[1.26,.93,.33,.20,.40,.80]],ceramic,sign);
      shell([[1.31,.92,.32,.20,.39,.79],[2.49,.86,.30,.17,.34,.74],[3.83,.74,.27,.13,.30,.61],
        [4.66,.54,.22,.11,.22,.45]],ceramic,sign);
      strut([sign*.22,-.12,-6.08],[sign*.51,-.16,-5.23],.056,.048,"edge");
      strut([sign*.46,-.325,-4.80],[sign*.84,-.49,-2.31],.080,.066,"alloy");
      strut([sign*.80,-.52,-2.17],[sign*.95,-.53,.69],.071,.069,"copper");
      // Swept planform; the two cutbacks behind the tip are real silhouette notches.
      const wingY=(x,z)=>.135-.094*(x-1.20)+.020*z;
      const outline=[[.88,-3.03],[1.27,-2.91],[1.83,-2.14],[2.68,-.65],[3.24,.18],[3.77,1.10],
        [4.53,2.54],[4.65,3.34],[4.31,3.57],[3.28,3.14],[3.02,3.59],[2.34,3.83],[1.12,3.24],[.86,2.62]];
      plate(outline,sign,wingY,.25,"dark","iron","iron");
      const tileY=(x,z)=>wingY(x,z)+.095;
      plate([[1.02,-2.81],[1.27,-2.70],[1.78,-2.00],[2.66,-.49],[3.19,.30],[3.77,1.37],
        [4.44,2.57],[4.51,3.05],[4.31,3.19],[3.61,2.91],[2.61,2.08],[1.40,.54]],sign,tileY,.11,"skin","pale");
      plate([[1.25,.61],[1.43,.68],[2.56,2.15],[3.59,2.99],[3.28,2.98],[2.98,3.46],
        [2.41,3.64],[1.22,3.05]],sign,tileY,.10,"skin","edge");
      plate([[4.40,2.60],[4.51,2.75],[4.59,3.25],[4.31,3.45],[4.12,3.34],[4.32,3.15]],
        sign,(x,z)=>tileY(x,z)+.024,.092,"red","iron");
      // A lower ventral wing tile and exposed spars read in counterlight.
      plate([[1.12,-1.90],[1.51,-1.67],[2.55,.02],[3.55,1.72],[3.93,2.70],
        [2.89,2.40],[1.30,1.00]],sign,(x,z)=>wingY(x,z)-.24,.034,"iron","edge","pale");
      strut([sign*1.31,-.17,-1.59],[sign*3.58,-.31,2.18],.063,.055,"alloy");
      strut([sign*2.97,-.23,2.80],[sign*4.11,-.27,3.20],.075,.059,"dark");
      // Exposed hydraulic roots and engine mounts.
      strut([sign*.98,-.32,.85],[sign*2.07,-.26,1.75],.23,.22,"iron");
      strut([sign*.90,-.23,2.27],[sign*2.10,-.20,3.39],.26,.20,"edge");
      strut([sign*1.11,.38,2.00],[sign*2.08,.39,2.83],.14,.15,"alloy");
      // Tapered intake, core, replaceable forward and aft cowlings.
      shell([[-2.32,1.89,.32,-.18,.009,.33],[-1.73,1.93,.48,-.29,.03,.53],[-.55,2.02,.58,-.35,.04,.65],
        [.90,2.15,.635,-.37,.04,.71],[2.92,2.24,.622,-.38,.028,.65],[4.22,2.25,.59,-.40,.014,.57],
        [5.17,2.25,.479,-.34,.018,.47]],darkArmour,sign);
      shell([[-2.34,1.89,.34,-.147,.012,.368],[-1.73,1.93,.49,-.20,.10,.575],[-.55,2.02,.576,-.21,.135,.725],
        [.34,2.10,.598,-.20,.15,.773]],cowling,sign);
      shell([[.405,2.105,.598,-.202,.148,.77],[1.36,2.19,.620,-.208,.144,.78],[2.25,2.21,.618,-.211,.143,.72]],
        cowling,sign);
      shell([[3.14,2.24,.60,-.21,.12,.663],[4.04,2.25,.59,-.22,.105,.635],[4.62,2.25,.51,-.22,.06,.52]],
        cowling,sign);
      // The opposing fan vanes have enough depth to cast their own dark cut-lines.
      for(let j=0;j<6;j++) {
        const z=2.31+j*.134;
        block([sign*2.23,.614,z],[.78,.12,.064],j===0||j===5?"alloy":"iron");
        block([sign*2.23,.680,z-.013],[.62,.027,.037],"edge");
      }
      for(const x of [1.83,2.63]) strut([sign*x,.50,2.19],[sign*(x+.023),.47,3.22],.073,.075,"copper");
      // A recessed forward face, plus a narrow intake lip and three dark grille blades.
      const intake=[
        [1.65,.059],[1.735,.249],[2.064,.249],[2.148,.059],[2.106,-.079],[1.696,-.079]
      ].map(([x,y])=>[sign*x,y,-2.346]);
      const center=[sign*1.90,.081,-2.348];
      for(let j=0;j<intake.length;j++){
        const a=intake[j], b=intake[(j+1)%intake.length];
        const n=normal(center,a,b);
        if(n[2]<0) triangle("black",center,a,b); else triangle("black",center,b,a);
        strut(a,b,.038,.034,j===1?"alloy":"edge");
      }
      for(const xx of [1.78,1.88,1.98]) strut([sign*xx,-.047,-2.365],[sign*(xx+.056),.188,-2.366],.034,.043,"iron");
      strut([sign*1.765,.266,-2.356],[sign*2.042,.266,-2.356],.041,.029,"light");
      for(const z of [-1.20,-.01,.88,1.45]) {
        const x=2.47+(z+1.2)*.115;
        strut([sign*(x-.028),.19,z],[sign*(x+.026),.205,z+.31],.082,.12,"dark");
      }
      const x=sign*2.25, y=.024;
      tubes(x,y,[[4.40,.47,"iron"],[4.72,.55,"edge"],[4.85,.50,"black"],[5.03,.51,"edge"],
        [5.10,.56,"iron"],[5.24,.53,"black"],[5.49,.51,"copper"],[5.55,.55,"alloy"],
        [5.69,.54,"iron"],[5.87,.48,"edge"],[5.91,.435,"alloy"],[5.93,.392,"dark"],
        [5.75,.327,"iron"],[5.64,.275,"engineRing"],[5.63,.235,"engineRing"]],20,Math.PI/20);
      endDisk(x,y,5.635,.24,20,"engineCore");
      for(let j=0;j<12;j++) {
        const a=j*2*Math.PI/12;
        const point=(r,z,t=a)=>[x+Math.cos(t)*r,y+Math.sin(t)*r,z];
        strut(point(.485,4.73),point(.511,5.49,a+.065),.075,.063,j%3===0?"copper":"iron");
        const delta=.098;
        quad(j%3===0?"edge":"iron",point(.556,5.52,a-delta),point(.556,5.52,a+delta),
             point(.498,5.88,a+delta*.67),point(.498,5.88,a-delta*.67));
      }
      // Two canted fins. Their red caps and recessed graphite tips are geometry, visible edge-on.
      function fin(shape,span,matA,matB,offset=0) {
        const fx=(h,z)=>2.25+.40*(h-.43)+.033*(z-2.0)+offset;
        const outer=shape.map(([z,h])=>[sign*(fx(h,z)+span*.5),h,z]);
        const inner=shape.map(([z,h])=>[sign*(fx(h,z)-span*.5),h,z]);
        const triangulated=T.ShapeUtils.triangulateShape(shape.map(([z,h])=>new T.Vector2(z,h)),[]);
        for(let [a,b,c] of triangulated) {
          if(normal(outer[a],outer[b],outer[c])[0]*sign<0) [b,c]=[c,b];
          triangle(matA,outer[a],outer[b],outer[c]); triangle(matA,inner[c],inner[b],inner[a]);
        }
        const center=shape.reduce((p,[z,h])=>[p[0]+z/shape.length,p[1]+h/shape.length],[0,0]);
        for(let i=0;i<shape.length;i++) {
          const j=(i+1)%shape.length, n=normal(outer[i],inner[i],inner[j]);
          const dz=(shape[i][0]+shape[j][0])*.5-center[0],dh=(shape[i][1]+shape[j][1])*.5-center[1];
          quad(matB,outer[i],inner[i],inner[j],outer[j],n[1]*dh+n[2]*dz<0);
        }
      }
      fin([[1.72,.59],[2.08,.66],[3.53,1.83],[4.23,1.86],[4.47,1.59],[4.30,1.44],[4.75,.55],
           [4.50,.37],[3.17,.50]],.147,"ivory","edge");
      fin([[3.28,1.59],[3.54,1.843],[4.23,1.868],[4.43,1.635],[4.35,1.55],[3.72,1.63],[3.51,1.53]],
           .172,"red","red");
      fin([[3.34,.81],[3.50,.98],[4.24,1.07],[4.36,.88],[4.32,.77]],.170,"iron","iron");
      // A 46 mm rolled nickel edge follows the fin cap. Its centre is inset
      // from the outline; the rounded nickel shoulder is exposed to sunlight.
      const edgePoints=[[2.17,.709],[3.546,1.819],[4.218,1.844],[4.444,1.604],[4.353,1.529]]
        .map(([z,h])=>new T.Vector3(sign*(2.25+.40*(h-.43)+.033*(z-2.0)+.0815),h,z));
      const edgePath=new T.CurvePath();
      let start=edgePoints[0];
      for(let i=1;i<edgePoints.length-1;i++) {
        const corner=edgePoints[i], radius=i===3?.048:.060;
        const entry=corner.clone().addScaledVector(edgePoints[i-1].clone().sub(corner).normalize(),radius);
        const exit=corner.clone().addScaledVector(edgePoints[i+1].clone().sub(corner).normalize(),radius);
        edgePath.add(new T.LineCurve3(start,entry));
        edgePath.add(new T.QuadraticBezierCurve3(entry,corner,exit));
        start=exit;
      }
      edgePath.add(new T.LineCurve3(start,edgePoints[edgePoints.length-1]));
      const trim=new T.TubeGeometry(edgePath,62,.023,14,false);
      const pTrim=trim.getAttribute("position"), nTrim=trim.getAttribute("normal"), batch=batches.get("finEdge");
      for(const i of trim.index.array) {
        batch.positions.push(pTrim.getX(i),pTrim.getY(i),pTrim.getZ(i));
        batch.normals.push(nTrim.getX(i),nTrim.getY(i),nTrim.getZ(i));
      }
      trim.dispose();
      for (const face of [-1,1]) {
        const outward=sign*face;
        const left=outward>0?4.19:3.40, right=outward>0?3.40:4.19;
        const corner=(z,h)=>[sign*(2.25+.40*(h-.43)+.033*(z-2.0)+face*.084),h,z];
        const corners=[corner(left,1.48),corner(right,1.48),corner(right,1.16),corner(left,1.16)];
        const uv=[[0,1],[1,1],[1,0],[0,0]];
        for(const tri of [[0,1,2],[0,2,3]]) {
          if(normal(...tri.map(i=>corners[i]))[0]*outward<0) tri.reverse();
          const n=normal(...tri.map(i=>corners[i]));
          for(const i of tri) {
            finMarks.positions.push(...corners[i]); finMarks.normals.push(...n); finMarks.uvs.push(...uv[i]);
          }
        }
      }
      const tip=[sign*4.53,wingY(4.53,3.08)+.161,3.08];
      block([tip[0],tip[1]-.033,tip[2]],[.112,.040,.233],"iron");
      ovoid(tip,[.057,.042,.101],sign<0?"navRed":"navBlue");
    }
    // Aft spine: a split bonnet, raised heat exchanger and service channels.
    shell([[.62,0,.39,.57,.70,1.00],[.97,0,.60,.49,.68,1.10],[1.77,0,.75,.46,.66,1.01],
      [2.34,0,.77,.43,.65,.92]],ceramic);
    shell([[2.39,0,.773,.42,.62,.905],[3.42,0,.69,.31,.53,.84],[4.10,0,.56,.29,.47,.71],
      [4.83,0,.38,.21,.38,.49]],ceramic);
    // Dorsal identification beacon, on a metal collar ahead of the heat exchanger.
    ovoid([0,1.075,1.245],[.114,.042,.126],"dark");
    ovoid([0,1.105,1.245],[.081,.057,.091],"dorsalBeacon");
    block([0,.927,2.39],[.77,.19,1.74],"black");
    for(let j=0;j<11;j++){
      const z=1.62+j*.15;
      const h=.997+Math.sin(j*Math.PI/10)*.046;
      block([0,h,z],[.63,.074,.061],j%3===0?"alloy":"edge");
    }
    for(const s of [-1,1]) {
      strut([s*.47,1.02,1.53],[s*.47,.958,3.24],.071,.058,"copper");
      strut([s*.34,.50,4.70],[s*.34,.20,5.38],.096,.095,"iron");
    }
    strut([0,.163,5.0],[0,.12,5.87],.14,.08,"iron");
    strut([0,.12,5.87],[0,.12,6.23],.053,.037,"alloy");

    const stamp=document.createElement("canvas");
    stamp.width=320; stamp.height=128;
    const dc=stamp.getContext("2d");
    dc.fillStyle="#3e4849";
    dc.font="bold 78px Helvetica, Arial, sans-serif"; dc.textAlign="center"; dc.textBaseline="middle";
    dc.fillText("SV-07",160,64);
    dc.fillRect(45,108,96,6); dc.fillRect(151,108,24,6); dc.fillRect(184,108,8,6);
    const stampMap=new T.CanvasTexture(stamp);
    stampMap.colorSpace=T.SRGBColorSpace; stampMap.anisotropy=4;
    materials.finMark=new T.MeshStandardMaterial({map:stampMap,alphaTest:.36,roughness:.45,metalness:.03});
    batches.set("finMark",finMarks);
    for(const [name,material] of Object.entries(materials)) {
      if(material.isMeshStandardMaterial) {
        orbital.install(material,finishType(name));
      }
    }

    // Gently roll highlights across neighbouring glass and ceramic facets. Mechanical
    // breaks and pale bevels belong to other batches and retain their machined edges.
    function rolledNormals(data,amount,preserveCreases=false) {
      const sums=new Map(), keys=[];
      for(let i=0;i<data.positions.length;i+=3) {
        const k=data.positions.slice(i,i+3).map(n=>Math.round(n*100000)).join(",");
        keys.push(k);
        const sum=sums.get(k)||[0,0,0];
        for(let axis=0;axis<3;axis++) sum[axis]+=data.normals[i+axis];
        sums.set(k,sum);
      }
      keys.forEach((k,v)=>{
        const i=v*3, sum=sums.get(k); const len=Math.hypot(...sum);
        if(!len) return;
        const agreement=(sum[0]*data.normals[i]+sum[1]*data.normals[i+1]+sum[2]*data.normals[i+2])/len;
        const weight=amount*(preserveCreases?Math.max(0,Math.min(1,(agreement-.82)/.16)):1);
        const n=sum.map((c,a)=>c/len*weight+data.normals[i+a]*(1-weight));
        const magnitude=Math.hypot(...n)||1;
        for(let a=0;a<3;a++) data.normals[i+a]=n[a]/magnitude;
      });
    }
    rolledNormals(batches.get("glass"),.995);
    rolledNormals(batches.get("skin"),.59,true);
    for(const name of ["ivory","pale","edge","alloy","iron","dark","red"]) rolledNormals(batches.get(name),.54,true);
    for(const [name,data] of batches) {
      if(!data.positions.length) continue;
      const geometry=new T.BufferGeometry();
      geometry.setAttribute("position",new T.Float32BufferAttribute(data.positions,3));
      geometry.setAttribute("normal",new T.Float32BufferAttribute(data.normals,3));
      if(name==="skin" || name==="finMark") geometry.setAttribute("uv",new T.Float32BufferAttribute(data.uvs,2));
      const finish=finishType(name);
      if(finish!=="glass" && finish!=="interior") geometry.setAttribute("wearDistance",wearDistances(T,data.positions));
      geometry.computeBoundingSphere();
      const mesh=new T.Mesh(geometry,materials[name]);
      mesh.name="SV-07 / "+name;
      if(name==="glass") mesh.receiveShadow=true;
      group.add(mesh);
    }
    cube.dispose();

    const updateBurners=createBurners(T,group,materials);
    const portColor=materials.navRed.color.clone(), starboardColor=materials.navBlue.color.clone();
    const beaconColor=materials.dorsalBeacon.color.clone();
    function roundedPulse(phase,center,radius) {
      const w=Math.max(0,1-Math.abs(phase-center)/radius);
      return w*w*(3-2*w);
    }
    function positionLamp(seconds,offset) {
      const cycle=(seconds+offset)/3.16, phase=cycle-Math.floor(cycle);
      const breathing=.5+.5*Math.cos(2*Math.PI*(phase-.20));
      return .14+1.18*breathing*breathing+4.75*roundedPulse(phase,.18,.065);
    }
    function update(seconds,thrust) {
      updateBurners(seconds,thrust);
      const port=positionLamp(seconds,.43),starboard=positionLamp(seconds,1.91);
      materials.navRed.color.copy(portColor).multiplyScalar(port);
      materials.navBlue.color.copy(starboardColor).multiplyScalar(starboard);
      // Smooth pulse shoulders and an absolute phase keep each exposure identical on seek.
      const cycle=(seconds+.21)/3.60, phase=3.60*(cycle-Math.floor(cycle));
      const ident=.075+8.60*roundedPulse(phase,.57,.14)+5.70*roundedPulse(phase,.94,.13);
      materials.dorsalBeacon.color.copy(beaconColor).multiplyScalar(ident);
      orbital.lamps.set(port,starboard,ident,Math.min(1,Math.max(0,thrust || 0)));
      // This short exposure is centred on the actual mirror crossing of the rear camera.
      const crossing=Math.max(0,1-Math.abs(seconds-65)/1.30);
      orbital.finExposure.value=crossing*crossing*(3-2*crossing);
    }
    update(0,.28);
    return {group,update,setOrbitalLight:orbital.set};
  }
  window.PenumbraCraft={create};
})();
