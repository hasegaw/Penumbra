/* Planet, atmosphere and star field for PENUMBRA. No texture downloads. */
(function () {
  "use strict";

  // One tile holds independent octaves of terrain, weather, fine relief and grain.
  // Mipmapping it keeps the clouds stable where the viewing angle is very shallow.
  function makeAtlas(THREE) {
    const size = 512;
    const gridSize = 256;
    const lattice = new Float32Array(gridSize * gridSize);
    let seed = 0x7b6107ca;
    function random() {
      seed ^= seed << 13;
      seed ^= seed >>> 17;
      seed ^= seed << 5;
      return (seed >>> 0) / 4294967296;
    }
    for (let i = 0; i < lattice.length; i++) lattice[i] = random();

    function octave(x, y, frequency, xOffset, yOffset) {
      const gx = x * frequency;
      const gy = y * frequency;
      const ix = Math.floor(gx);
      const iy = Math.floor(gy);
      const mask = frequency - 1;
      const x0 = ((ix & mask) + xOffset) & 255;
      const x1 = (((ix + 1) & mask) + xOffset) & 255;
      const y0 = (((iy & mask) + yOffset) & 255) * gridSize;
      const y1 = ((((iy + 1) & mask) + yOffset) & 255) * gridSize;
      let fx = gx - ix;
      let fy = gy - iy;
      fx *= fx * (3 - 2 * fx);
      fy *= fy * (3 - 2 * fy);
      const a = lattice[y0 + x0] * (1 - fx) + lattice[y0 + x1] * fx;
      const b = lattice[y1 + x0] * (1 - fx) + lattice[y1 + x1] * fx;
      return a * (1 - fy) + b * fy;
    }

    const pixels = new Uint8Array(size * size * 4);
    let offset = 0;
    for (let j = 0; j < size; j++) {
      for (let i = 0; i < size; i++) {
        const x = (i + 0.5) / size;
        const y = (j + 0.5) / size;
        let terrain = 0;
        let weather = 0;
        let relief = 0;
        let weight = 0.495;
        let total = 0;
        for (let k = 0; k < 6; k++) {
          const f = 4 << k;
          terrain += weight * octave(x, y, f, 19 + 11 * k, 73 + 7 * k);
          weather += weight * octave(x, y, f, 89 + 13 * k, 15 + 17 * k);
          relief += weight * octave(x, y, f * 2, 117 + 7 * k, 162 + 13 * k);
          total += weight;
          weight *= 0.53;
        }
        pixels[offset++] = Math.round(255 * terrain / total);
        pixels[offset++] = Math.round(255 * weather / total);
        pixels[offset++] = Math.round(255 * relief / total);
        pixels[offset++] = Math.round(255 * random());
      }
    }
    const texture = new THREE.DataTexture(pixels, size, size, THREE.RGBAFormat);
    texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
    texture.magFilter = THREE.LinearFilter;
    texture.minFilter = THREE.LinearMipmapLinearFilter;
    texture.generateMipmaps = true;
    texture.needsUpdate = true;
    return texture;
  }

  // A seeded catalogue on the celestial sphere. The galactic poles and the
  // bright binaries are fixed world directions shared with the dusty backdrop.
  function makeGalaxyBasis(THREE) {
    const center = new THREE.Vector3(12.6, -9, 13.8).normalize();
    const right = center.clone().cross(new THREE.Vector3(0, 1, 0)).normalize();
    const up = right.clone().cross(center);
    const pole = up.addScaledVector(right, 0.31).addScaledVector(center, -0.075).normalize();
    const zero = center.addScaledVector(pole, -center.dot(pole)).normalize();
    const east = zero.clone().cross(pole).normalize();
    const basis = new THREE.Matrix3().set(zero.x, zero.y, zero.z, pole.x, pole.y, pole.z, east.x, east.y, east.z);
    return { pole, zero, east, basis };
  }

  function makeStars(THREE, galaxy, sky) {
    let seed = 0x209bcdf2;
    function sample() {
      seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5;
      return ((seed >>> 0) + 0.5) / 4294967296;
    }
    function normal() {
      return Math.sqrt(-2 * Math.log(sample())) * Math.cos(2 * Math.PI * sample());
    }

    const directions = [], powers = [], colors = [];
    // Linear RGB, from cool M/K giants to hot B stars. Most visible stars sit
    // between the endpoints, with a few amber and blue outliers.
    const spectra = [[1,0.42,0.19], [1,0.71,0.44], [1,0.91,0.78], [0.86,0.91,1], [0.62,0.77,1], [0.46,0.66,1]];
    function put(lon, lat, power, temperature) {
      const planar = Math.cos(lat);
      const a = planar * Math.cos(lon), b = Math.sin(lat), d = planar * Math.sin(lon);
      const {zero, pole, east} = galaxy;
      directions.push(a*zero.x+b*pole.x+d*east.x, a*zero.y+b*pole.y+d*east.y, a*zero.z+b*pole.z+d*east.z);
      powers.push(power);
      const spectral = Math.max(0, Math.min(4.999, temperature));
      const i = Math.floor(spectral), f = spectral - i;
      for (let k=0; k<3; k++) colors.push(spectra[i][k]*(1-f)+spectra[i+1][k]*f);
    }
    function midplane(lon) { return 0.026 * Math.sin(3 * lon + 1.1) + 0.014 * Math.sin(8 * lon - 0.63); }
    function starPower(minimum, ceiling) { return Math.min(ceiling, minimum * Math.pow(sample(), -0.67)); }

    for (let i=0; i<10500; i++) {
      put(sample()*2*Math.PI, Math.asin(2*sample()-1), starPower(0.022, 3.3), 0.28 + 4.7 * sample());
    }
    const fieldCount = powers.length;
    // Unresolved disk stars concentrate on both sides of the Great Rift.
    for (let i=0; i<14700; i++) {
      const lon = sample() * 2 * Math.PI;
      const offset = normal() * (0.038 + 0.105 * sample());
      if (Math.abs(offset - 0.011) < 0.018 && sample() < 0.72) continue;
      put(lon, midplane(lon) + offset, starPower(0.012, 0.61), 0.82 + 3.95 * sample());
    }
    // A few genuine concentrations and double stars interrupt the sparse field.
    const clusters = [[-0.267,0.028,64,0.010], [0.208,-0.052,39,0.008], [1.92,0.06,85,0.015], [-2.16,-0.038,52,0.011]];
    for (const [lon, lat, count, width] of clusters) {
      for (let j=0;j<count;j++) {
        const spread = width * (0.52 + 0.96 * sample());
        put(lon+normal()*spread, lat+normal()*spread, starPower(0.024,0.6), 2.0+2.8*sample());
      }
    }
    put(-0.464, -0.143, 4.25, 4.0);
    put(-0.259, -0.101, 2.7, 4.4);
    put(-0.255, -0.103, 0.49, 2.4);
    put(0.151, 0.048, 1.98, 0.81);
    put(0.315, 0.16, 1.4, 3.65);
    put(1.251, 0.249, 2.48, 2.31);
    put(1.867, 0.055, 1.96, 4.20);
    put(-0.774, 0.047, 2.71, 3.65);

    // Hash field-star indices separately so a distance draw cannot move a
    // binary, change a spectrum, or perturb the structure of the Milky Way.
    function depthSample(bits) {
      bits = Math.imul(bits ^ (bits >>> 16), 0x7feb352d);
      bits = Math.imul(bits ^ (bits >>> 15), 0x846ca68b);
      return (((bits ^ (bits >>> 16)) >>> 0) + 0.5) / 4294967296;
    }
    const inverseDistances = new Float32Array(powers.length);
    for (let i = 0; i < fieldCount; i++) {
      const id = i ^ 0x14a8cccd;
      const pick = depthSample(id), span = depthSample(id ^ 0xa3b19535);
      const power = powers[i];
      const near = 0.006 + 0.24 * smoothstep(0.055, 0.25, power) + 0.49 * smoothstep(0.38, 1.12, power);
      // The flight uses metres. Brighter local candidates are easier to follow
      // against the distant field. Disk stars, clusters and binaries stay at infinity.
      if (pick < near) {
        const distance = 4000 + 4000 * span;
        inverseDistances[i] = 1 / distance;
        // Set a constant apparent flux at the gate. A few intrinsically faint
        // neighbours survive the daylight exposure without enlarging in flight.
        const fluxAtGate = power * (7000 / distance) ** 2;
        powers[i] = Math.max(power, Math.min(0.96, fluxAtGate));
      } else if (pick < near + (1 - near) * 0.319) {
        inverseDistances[i] = 1 / (20000 + 25000 * span);
      }
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("inverseDistance", new THREE.BufferAttribute(inverseDistances, 1));
    geometry.setAttribute("position", new THREE.Float32BufferAttribute(directions, 3));
    geometry.setAttribute("power", new THREE.Float32BufferAttribute(powers, 1));
    geometry.setAttribute("tint", new THREE.Float32BufferAttribute(colors, 3));
    const dimensions = {value: new THREE.Vector2(960, 540)};
    const material = new THREE.ShaderMaterial({
      uniforms: {
        uFrameSize: dimensions, uViewFromSky: sky.uViewFromSky, uAspect: sky.uAspect, uDay: sky.uDay,
        uPlanetCenter: sky.uPlanetCenter, uPlanetRadius: sky.uPlanetRadius,
        uSunCenter: sky.uSunCenter, uSunVisibility: sky.uSunVisibility, uSunInFront: sky.uSunInFront
      },
      vertexShader: `
        attribute float power, inverseDistance;
        attribute vec3 tint;
        uniform vec2 uFrameSize;
        uniform mat3 uViewFromSky;
        uniform float uAspect, uDay, uPlanetRadius, uSunVisibility, uSunInFront;
        uniform vec2 uPlanetCenter, uSunCenter;
        varying vec2 vCenter;
        varying vec3 vTint;
        varying float vPower, vSigma, vGlare;
        void main() {
          // cameraPosition is the renderer's world-space eye in gate coordinates.
          // Homogeneous projection cancels the ray length, including at infinity.
          vec3 ray = position - cameraPosition * inverseDistance;
          vec4 clip = projectionMatrix * vec4(uViewFromSky * ray, 0.0);
          vec2 ndc = clip.xy / max(clip.w, 0.00001);
          vec2 p = ndc * vec2(uAspect, 1.0);
          float height = length(p - uPlanetCenter) - uPlanetRadius;
          float lineOfSight = smoothstep(0.0, 0.085, height);
          float sunlight = uSunVisibility * uSunInFront * exp(-length(p - uSunCenter) * 1.6);
          float wash = clamp(uDay * (0.81 + 0.21 * exp(-max(height, 0.0) * 2.6)) + 0.37 * sunlight, 0.0, 1.0);
          float contrast = smoothstep(0.0005 + 0.11 * wash * wash, 0.019 + 0.72 * wash * wash, power);
          // A daylight exposure hides the unresolved field. The few most
          // luminous stars still register high above the atmosphere, away from the sun.
          float clearSky = smoothstep(0.14, 0.51, height) * (1.0 - smoothstep(0.063, 0.48, sunlight));
          float firstMagnitude = smoothstep(0.55, 1.92, power);
          float survivingLight = 0.41 * uDay * clearSky * firstMagnitude;
          float transmission = lineOfSight * contrast * (pow(1.0 - 0.954 * wash, 1.9) + survivingLight);
          if (clip.w <= 0.0 || power * transmission < 0.00025 || any(greaterThan(abs(ndc), vec2(1.06)))) {
            gl_Position = vec4(2.0, 2.0, 2.0, 1.0); gl_PointSize = 1.0; return;
          }
          vCenter = (ndc * 0.5 + 0.5) * uFrameSize;
          vTint = tint;
          vGlare = smoothstep(0.91, 2.45, power);
          float scale = clamp(uFrameSize.y / 810.0, 0.65, 2.3);
          float sigma = (0.42 + 0.38 * smoothstep(0.04, 1.2, power)) * scale;
          // Convolution with a pixel footprint conserves subpixel energy in a pan.
          vSigma = sqrt(sigma*sigma + 0.18);
          vPower = power * transmission * sigma*sigma / (vSigma*vSigma);
          gl_PointSize = ceil(vSigma * (7.0 + 15.0 * vGlare) + 2.0);
          gl_Position = vec4(clip.xy, clip.w * 0.9999, clip.w);
        }
      `,
      fragmentShader: `
        precision highp float;
        varying vec2 vCenter;
        varying vec3 vTint;
        varying float vPower, vSigma, vGlare;
        void main() {
          vec2 d = (gl_FragCoord.xy - vCenter) / vSigma;
          float r = length(d);
          float core = exp(-0.5 * dot(d,d));
          float wing = 0.031 * vGlare * exp(-r * 0.46);
          float blade = exp(-abs(d.y)*2.85 - abs(d.x)*0.285);
          blade += 0.39 * exp(-abs(d.x)*3.9 - abs(d.y)*0.48);
          vec3 hot = mix(vTint, vec3(1.0), 0.26 * vGlare);
          vec3 light = vPower * (hot*core + vTint*(wing + 0.128*vGlare*blade));
          gl_FragColor = vec4(light, 1.0);
        }
      `,
      depthTest: false, depthWrite: false, toneMapped: false,
      blending: THREE.CustomBlending, blendEquation: THREE.AddEquation,
      blendSrc: THREE.OneFactor, blendDst: THREE.OneFactor,
      blendSrcAlpha: THREE.ZeroFactor, blendDstAlpha: THREE.OneFactor
    });
    const points = new THREE.Points(geometry, material);
    points.name = "Celestial sphere";
    points.frustumCulled = false;
    points.renderOrder = -9999;
    points.onBeforeRender = renderer => renderer.getDrawingBufferSize(dimensions.value);
    return points;
  }

  const vertex = `
    uniform mat3 uSkyRays;
    varying vec3 vGalacticRay;
    varying vec2 vScreen;
    void main() {
      vScreen = position.xy;
      vGalacticRay = uSkyRays * vec3(position.xy, 1.0);
      gl_Position = vec4(position.xy, 0.99999, 1.0);
    }
  `;

  const fragment = `
    precision highp float;
    varying vec3 vGalacticRay;
    varying vec2 vScreen;
    uniform float uTime;
    uniform float uTrackLongitude;
    uniform float uAspect;
    uniform float uDay;
    uniform float uDawn;
    uniform vec2 uPlanetCenter;
    uniform float uPlanetRadius;
    uniform vec2 uLimbTangent;
    uniform vec2 uSunCenter;
    uniform vec2 uSunRadii;
    uniform float uSolarAltitude;
    uniform float uSunVisibility;
    uniform float uSunInFront;
    uniform vec2 uSurfaceSun;
    uniform sampler2D uAtlas;

    mat2 spin(float a) {
      float c = cos(a), s = sin(a);
      return mat2(c, s, -s, c);
    }

    vec3 deepSky(float above, float day, float solarGlow) {
      vec3 ray = normalize(vGalacticRay);
      float lon = atan(ray.z, ray.x);
      float lat = asin(clamp(ray.y, -1.0, 1.0));
      float turn = lon * 0.1591549431;
      float mid = 0.026 * sin(3.0*lon + 1.1) + 0.014 * sin(8.0*lon - 0.63);
      float h = lat - mid;
      // Longitude is periodic in every texture lookup. Dust has a narrower
      // scale height than the unresolved background stars and obscures both banks.
      vec4 large = texture2D(uAtlas, vec2(turn*3.0 + 0.31, lat*1.8 + 0.62));
      vec4 clumps = texture2D(uAtlas, vec2(turn*7.0 - 0.13, lat*4.9 + 0.33) + (large.gb-0.5)*0.21);
      vec4 fine = texture2D(uAtlas, vec2(turn*21.0 + 0.56, lat*13.5 + 0.82) + (clumps.rb-0.5)*0.13);
      vec4 grain = texture2D(uAtlas, vec2(turn*71.0 + 0.34, lat*46.0 + 0.89) + (fine.gb-0.5)*0.21);
      float along = 0.48 + 0.52 * pow(0.5 + 0.5*cos(lon - 0.16), 3.0);
      float envelope = exp(-0.5 * pow(h / (0.105 + 0.032*large.r), 2.0));
      float riftY = 0.009 + (large.r-0.5)*0.10 + (clumps.g-0.5)*0.038 + (fine.r-0.5)*0.013;
      float mainRift = exp(-0.5 * pow((h-riftY) / (0.009 + 0.014*fine.r), 2.0));
      float darkVein = exp(-0.5*pow((h-riftY+0.047+(clumps.r-0.5)*0.077)/0.0075,2.0));
      float clouds = (0.26 + 0.84 * smoothstep(0.22,0.76,clumps.g)) * (0.76 + 0.46*fine.b);
      float knots = 0.66 + 0.68 * smoothstep(0.25, 0.72, grain.r * 0.65 + fine.b * 0.35);
      float unresolved = along * envelope * clouds * knots * (1.0-0.76*mainRift) * (1.0-0.40*darkVein);
      vec3 starlight = mix(vec3(0.117,0.148,0.208), vec3(0.205,0.179,0.184), smoothstep(0.28,0.73,large.g));
      vec3 sky = vec3(0.006, 0.011, 0.027);
      float extinction = (1.0 - 0.94*day) * (1.0 - 0.86*solarGlow) * smoothstep(-0.025,0.18,above);
      vec2 knot = vec2((lon + 0.108) * 13.0, (h + 0.042 + (clumps.r-0.5)*0.025) * 37.0);
      float emission = exp(-dot(knot,knot)) * smoothstep(0.34,0.69,0.55*fine.r + 0.45*grain.b);
      sky += (starlight * unresolved + vec3(0.064,0.018,0.024) * emission) * extinction;
      sky += vec3(0.006,0.015,0.032) * exp(-above*3.6);
      return sky;
    }

    vec2 rotateStorm(vec2 p, vec2 center, float radius, float amount) {
      vec2 d = p - center;
      float falloff = exp(-dot(d, d) / (radius * radius));
      return center + spin(amount * falloff) * d;
    }

    vec3 districtCode(vec2 id) {
      vec3 q = fract(id.xyx * vec3(0.1031, 0.1030, 0.0973));
      q += dot(q, q.yxz + 33.33);
      return fract((q.xxy + q.yzz) * q.zyx);
    }

    vec3 cityLights(vec2 ground, vec2 region, float elevation, float night, float facing, float clock) {
      vec4 towns = texture2D(uAtlas, region * 8.63 + 0.43);
      float settlement = exp(-abs(elevation - 0.510) * 27.0) * smoothstep(0.42, 0.67, towns.r);
      float streets = smoothstep(0.61, 0.86, texture2D(uAtlas, region * 2.02 + 0.174).a);

      // Steady street grids remain visible as independently timed districts
      // brighten and settle. The district boundaries follow the rough coastline.
      vec2 district = floor(region * 92.0 + (towns.gb - 0.5) * 2.2);
      vec3 code = districtCode(district);
      float cycle = 0.5 + 0.5 * sin(clock * mix(0.57, 1.46, code.x) + 6.2832 * code.y);
      float local = 0.5 + 0.5 * sin(clock * (0.46 + 0.53 * code.y) + 13.1 * towns.b + 6.2832 * code.z);
      float activity = smoothstep(0.16, 0.86, 0.78 * cycle + 0.22 * local);
      vec3 streetColor = mix(vec3(0.99, 0.55, 0.22), vec3(0.96, 0.77, 0.50), code.z * code.z * 0.74);
      vec3 lights = streetColor * streets * settlement * (0.42 + 0.64 * activity);
      lights += vec3(0.047, 0.024, 0.008) * settlement * smoothstep(0.49, 0.72, towns.b);

      // Small beacon sites have independent clocks and fixed ground positions.
      // Project the geographic offset onto the pixel axes to keep the lens
      // footprint compact as the surface becomes foreshortened near the limb.
      vec2 grid = spin(0.27) * ground * 151.0;
      vec2 id = floor(grid);
      vec3 station = districtCode(id + vec2(211.7, 83.4));
      vec2 delta = fract(grid) - (0.18 + 0.64 * station.xy);
      vec2 dx = dFdx(grid), dy = dFdy(grid);
      float determinant = dx.x * dy.y - dx.y * dy.x;
      float invDet = sign(determinant) / max(abs(determinant), 0.0000001);
      vec2 pixelDelta = vec2(delta.x * dy.y - delta.y * dy.x, dx.x * delta.y - dx.y * delta.x) * invDet;
      float scale = clamp(0.00247 / max(fwidth(vScreen.y), 0.00015), 0.68, 2.2);
      float sigma = scale * (0.62 + 0.20 * station.x);
      float variance = sigma * sigma + 0.18;
      float dist2 = dot(pixelDelta, pixelDelta);
      float core = exp(-0.5 * dist2 / variance) * sigma * sigma / variance;
      float halo = 0.10 * exp(-sqrt(dist2) / (1.48 * scale));
      float phase = fract(clock * (0.205 + 0.242 * station.y) + station.x + 0.37 * code.y);
      float pulse = smoothstep(0.035, 0.18, phase) * (1.0 - smoothstep(0.24, 0.58, phase));
      float site = step(0.73, station.z) * smoothstep(0.11, 0.50, settlement) * smoothstep(0.075, 0.20, facing);
      vec3 lamp = mix(vec3(1.12, 0.69, 0.32), vec3(0.76, 0.87, 0.98), smoothstep(0.57, 0.94, station.x));
      lights += lamp * (core + halo) * site * (0.20 + 1.80 * pulse);
      return lights * night;
    }

    // Geodetic coordinates span a small patch of a much larger world. Latitude
    // collapses to a fine line at the limb, just as it does in an orbital photo.
    vec3 surface(vec2 geo, vec3 normal, float lateral, float glint, out float airLight, out vec3 oceanSpecular) {
      vec2 ground = geo + vec2(uTrackLongitude, 0.00027 * uTime);
      vec2 region = spin(-0.52) * ground * 1.15 + vec2(0.28, 0.63);
      vec2 erosion = texture2D(uAtlas, region * 0.84 + 0.41).gb - 0.5;
      region += erosion * 0.18;
      vec4 geography = texture2D(uAtlas, region);
      float fineTerrain = texture2D(uAtlas, region * 4.9).b;
      float elevation = geography.r * 0.82 + geography.g * 0.12 + fineTerrain * 0.06;
      float land = smoothstep(0.485, 0.498, elevation);
      float shelf = smoothstep(0.410, 0.492, elevation);
      float peaks = clamp(0.54 + 0.53 * (geography.b - fineTerrain), 0.2, 0.83);

      // Two counter-rotating weather systems pull irregular fronts into long
      // arcs. Upper cirrus and denser clouds move and cast shadows separately.
      vec2 air = ground + vec2(0.00022, -0.00009) * uTime;
      vec2 unevenWind = texture2D(uAtlas, air * 4.3 + vec2(0.12, 0.51)).gb - 0.5;
      vec2 flow = rotateStorm(air + unevenWind * 0.018, vec2(0.066, 0.302), 0.080, -2.75);
      flow = rotateStorm(flow, vec2(-0.171, 0.420), 0.075, 1.8);
      vec2 jet = spin(-0.39) * flow;
      vec2 wind = texture2D(uAtlas, jet * 1.17 + vec2(0.18, 0.70)).rg - 0.5;
      vec2 gust = texture2D(uAtlas, air * 11.7 + unevenWind * 0.12).rg - 0.5;
      vec2 front = jet * vec2(2.10, 3.62) + wind * vec2(0.18, 0.26) + gust * 0.072 + vec2(0.74, 0.30);
      vec4 weather = texture2D(uAtlas, front);
      vec4 billows = texture2D(uAtlas, flow * 6.3 + wind * 0.03);
      vec2 eddy = air * 16.1 + billows.rg * 0.15;
      vec4 puffs = texture2D(uAtlas, eddy);
      vec2 grainUV = air * 47.8 + puffs.gb * 0.06;
      vec4 grain = texture2D(uAtlas, grainUV);
      float density = 0.56 * weather.g + 0.16 * billows.r + 0.21 * puffs.g + 0.07 * grain.b;
      float cloud = smoothstep(0.435, 0.625, density);
      float shadowDensity = texture2D(uAtlas, front + vec2(0.006 * uSurfaceSun.x, -0.009)).g;
      float shadow = smoothstep(0.43, 0.65, shadowDensity);
      vec2 filaments = (spin(-0.21) * air + wind * 0.026 + gust * 0.009) * vec2(3.65, 13.8);
      vec4 wisps = texture2D(uAtlas, filaments + vec2(0.61, 0.03));
      float cirrus = 0.30 * smoothstep(0.53, 0.73, wisps.b) * (0.5 + weather.r);
      float coverage = min(0.97, cloud + cirrus * (1.0 - cloud));

      // The sea sees a local horizon. Elevated cloud tops see over it first.
      // The along-limb term follows the sun across the camera cut, and the
      // view-facing normal keeps the foreground ocean in shadow in a backlight.
      float altitude = uSolarAltitude;
      float incidence = 3.48 * altitude - 0.060 + 1.34 * lateral * uSurfaceSun.x
        + normal.z * 0.76 * uSurfaceSun.y;
      float firstRay = smoothstep(-0.022, 0.011, altitude);
      float twilight = smoothstep(-0.125, 0.060, altitude) * smoothstep(-0.19, 0.11, incidence);
      float direct = firstRay * smoothstep(-0.002, 0.068, incidence);
      float sunlight = direct * sqrt(clamp(incidence * 1.55, 0.0, 1.0));
      float redSun = 1.0 - smoothstep(0.028, 0.35, incidence);
      float tower = mix(0.023, 0.092, smoothstep(0.433, 0.605, density)) + 0.025 * cirrus;
      float cloudIncidence = incidence + tower;
      float cloudSun = firstRay * smoothstep(-0.011, 0.069, cloudIncidence)
        * (0.24 + 0.76 * sqrt(clamp(cloudIncidence * 1.48, 0.0, 1.0)));
      airLight = max(0.55 * twilight, max(sunlight, 0.72 * cloudSun));

      vec3 darkWater = mix(vec3(0.006, 0.013, 0.027), vec3(0.015, 0.029, 0.047), shelf);
      vec3 darkLand = mix(vec3(0.015, 0.023, 0.037), vec3(0.040, 0.054, 0.070), peaks);
      vec3 litWater = mix(vec3(0.052, 0.154, 0.256), vec3(0.095, 0.292, 0.352), shelf);
      vec3 litLand = mix(vec3(0.129, 0.191, 0.165), vec3(0.372, 0.341, 0.261), peaks);
      vec3 unlit = mix(darkWater, darkLand, land) + twilight * vec3(0.008, 0.014, 0.023);
      vec3 albedo = mix(litWater, litLand, land) * mix(vec3(1.0), vec3(1.09, 0.83, 0.60), redSun);
      vec3 planet = mix(unlit, albedo, sunlight);
      planet *= 1.0 - (0.11 + 0.44 * sunlight) * shadow;
      // Only the illuminated, unobscured water can reflect the morning sun.
      planet += mix(vec3(0.86, 0.65, 0.38), vec3(1.08, 0.54, 0.18), redSun)
        * glint * (1.0 - land) * direct * (0.17 + 0.73 * billows.b) * (1.0 - 0.62 * shadow);

      float nightLights = land * (1.0 - firstRay * smoothstep(0.005, 0.29, incidence)) * (1.0 - 0.18 * twilight);
      planet += cityLights(ground, region, elevation, nightLights, normal.z, uTime);

      float puffLight = puffs.g - texture2D(uAtlas, eddy + vec2(0.009 * uSurfaceSun.x, -0.019)).g;
      float relief = clamp(0.67 + (density - shadowDensity) * 1.28 + puffLight * 1.45 + (grain.b - 0.5) * 0.48, 0.3, 1.04);
      // At sunrise, small cumulus towers cast shadows on the lower cloud deck.
      // The smaller noise scales use mipmaps so sunlit texture fades into the limb.
      vec2 tuftUV = air * 137.0 + grain.rg * 0.07;
      vec4 tufts = texture2D(uAtlas, tuftUV);
      float fineSlope = grain.b - texture2D(uAtlas, grainUV + vec2(0.016 * uSurfaceSun.x, -0.014)).b;
      float tuftSlope = tufts.b - texture2D(uAtlas, tuftUV + vec2(0.022 * uSurfaceSun.x, -0.019)).b;
      float cloudLight = smoothstep(0.25, 1.02, relief + 1.23 * fineSlope + 0.64 * tuftSlope);
      float brokenEdges = smoothstep(0.444, 0.607, density + 0.072 * (tufts.b - 0.5));
      coverage = mix(coverage, min(0.99, brokenEdges + cirrus * (1.0 - brokenEdges)), cloudSun);
      vec3 darkCloud = mix(vec3(0.020, 0.032, 0.053), vec3(0.082, 0.116, 0.155), cloudLight);
      darkCloud += twilight * vec3(0.018, 0.022, 0.032);
      vec3 litCloud = mix(vec3(0.236, 0.313, 0.399), vec3(1.02, 1.015, 0.97), cloudLight);
      vec3 goldenCloud = mix(vec3(0.239, 0.176, 0.165), vec3(1.14, 0.735, 0.355), cloudLight);
      float amber = 1.0 - smoothstep(0.048, 0.32, cloudIncidence);
      vec3 cloudColor = mix(darkCloud, mix(litCloud, goldenCloud, amber), cloudSun);
      // Thin sunward ridges and high cirrus catch direct light above the
      // terminator, before the lower cloud deck or the ocean underneath.
      float crest = smoothstep(0.43, 0.89, cloudLight + (grain.b - 0.5) * 0.31);
      float rim = firstRay * smoothstep(-0.010, 0.048, cloudIncidence)
        * (1.0 - smoothstep(0.065, 0.22, cloudIncidence)) * (0.22 + 0.78 * crest);
      cloudColor += vec3(0.38, 0.184, 0.060) * rim;
      planet = mix(planet, cloudColor, coverage);

      // Sun glitter is reflected radiance, in addition to the ocean's diffuse
      // colour. Only a narrow set of clear-water facets reflect into the lens.
      float openWater = (1.0 - land) * (1.0 - coverage);
      vec2 waveCoord = (spin(-0.31) * ground) * vec2(34.0, 116.0) + geography.gb * 0.06;
      vec2 wave = texture2D(uAtlas, waveCoord).gb;
      float facets = pow(smoothstep(0.46, 0.69, dot(wave, vec2(0.60, 0.40))), 2.4);
      float fresnel = 0.025 + 0.975 * pow(1.0 - normal.z, 5.0);
      float glitter = 2.3 * facets * pow(glint, 1.43) * fresnel * openWater * direct * (1.0 - 0.66 * shadow);
      oceanSpecular = mix(vec3(1.0, 0.89, 0.68), vec3(1.0, 0.56, 0.245), redSun) * glitter;
      return planet;
    }

    // In an optically thin spherical emission layer the tangent is bright.
    // Above it emissivity falls rapidly; below it the ray crosses the shell
    // at a steeper angle and the additional path through the layer is shorter.
    float shellPath(float altitude, float peak, float width) {
      float z = (altitude - peak) / width;
      float above = max(z, 0.0), below = max(-z, 0.0);
      return exp(-0.5 * above * above) * inversesqrt(1.0 + 2.4 * below * below);
    }

    vec3 atmosphere(vec3 incoming, float h, float longitude, float sunward, float sunbreak, float airLight) {
      // Altitude is measured in planet radii. The density scale height of
      // the low atmosphere is about 1/650 of a radius. At a grazing angle
      // the full path is longer than the foreground-only path over land.
      float mu2 = max(0.0, -h * (2.0 + h));
      float grazingPath = exp(-mu2 * 23.0);
      float foreground = 0.043 * inversesqrt(mu2 + 0.0016)
        * mix(0.17 + 0.16 * uDay, 1.0, grazingPath);
      float tangentPath = 2.15 * exp(-max(h, 0.0) / 0.00155);
      float airmass = mix(foreground, tangentPath, smoothstep(-0.00017, 0.00035, h));
      vec3 transmittance = exp(-airmass * vec3(0.58, 1.02, 1.66));
      float day = uDay;
      float amber = pow(sunward, 1.40) * uDawn;
      vec3 source = mix(vec3(0.020,0.097,0.264), vec3(0.116,0.335,0.747), day);
      source = mix(source, vec3(1.04,0.444,0.153), amber * (0.72 + 0.20 * sunbreak));
      // At depth the column of air is illuminated by the surface's local sky.
      // Preserve the long tangential path and the high nightglow above the limb.
      source *= mix(1.0, 0.25 + 0.75 * airLight, smoothstep(0.0015, 0.028, -h));
      vec3 light = incoming * transmittance + source * (1.0 - transmittance);

      // The blue stratosphere is lower than the tenuous cyan and violet
      // airglow. Variation along the limb is anchored in surface coordinates.
      float inLayer = smoothstep(-0.017, -0.003, h) * (1.0 - smoothstep(0.032, 0.046, h));
      if (inLayer > 0.0) {
        float groundLon = longitude + uTrackLongitude;
        vec4 air = texture2D(uAtlas, vec2(groundLon * 2.8 + 0.39, 0.63 + groundLon * 0.28));
        float airglowHeight = 0.0081 + 0.0011 * (air.g - 0.5);
        float stratosphere = shellPath(h, 0.00265, 0.0017);
        float upper = shellPath(h, airglowHeight, 0.0027);
        float haze = 0.78 + 0.42 * air.b;
        vec3 stratColor = mix(vec3(0.009,0.067,0.204), vec3(0.032,0.142,0.341), day);
        stratColor = mix(stratColor, vec3(0.98,0.338,0.081), amber * (0.57 + 0.33 * sunbreak));
        vec3 upperColor = mix(vec3(0.007,0.051,0.073), vec3(0.023,0.096,0.143), day);
        upperColor = mix(upperColor, vec3(0.32,0.124,0.093), amber * (0.43 + 0.36 * sunbreak));
        float lowCrest = exp(-0.5 * pow((h + 0.00014) / 0.00062, 2.0));
        vec3 lowColor = mix(vec3(0.010,0.045,0.117), vec3(0.24,0.123,0.036), amber);
        light += inLayer * haze * (lowCrest * lowColor + stratosphere * stratColor + upper * upperColor);

        // An auroral oval is only locally in view. Quiet, folded curtains
        // rise from green oxygen emission into a dimmer high red fringe.
        float night = 1.0 - smoothstep(0.20, 0.82, day);
        float along = (groundLon + 0.083) / 0.051;
        float oval = exp(-0.5 * along * along) * night * (1.0 - 0.76 * amber);
        if (oval > 0.004) {
          float foldCoord = groundLon + 0.0017 * sin(groundLon * 82.0) + h * 0.34;
          vec4 folds = texture2D(uAtlas, vec2(foldCoord * 10.4 + 0.48, 0.23 + groundLon * 0.71 + uTime * 0.00012));
          float fold = smoothstep(0.27, 0.70, folds.b * 0.6 + folds.r * 0.4);
          float foot = 0.0113 + 0.00125 * sin(groundLon * 59.0 + air.r * 3.5) + 0.0014 * (air.g - 0.5);
          float altitude = h - foot;
          float ribbon = exp(-0.5 * pow(altitude / 0.00123, 2.0));
          float rays = smoothstep(-0.0014, 0.0009, altitude) * exp(-max(0.0,altitude) / (0.0030 + 0.0039 * fold));
          float redOxygen = shellPath(h, foot + 0.0060 + 0.0008 * fold, 0.0028);
          vec3 green = vec3(0.004,0.187,0.106) * (0.29 + 0.71 * fold) * (0.69*ribbon + 0.68*rays);
          vec3 red = vec3(0.056,0.008,0.041) * (0.32 + 0.68 * fold) * redOxygen;
          light += inLayer * oval * (green + red);
        }
      }
      return light;
    }

    void main() {
      // Pixel-space metric keeps the sun and all star discs round at any aspect.
      float aspect = max(0.1, uAspect);
      vec2 p = vec2(vScreen.x * aspect, vScreen.y);
      float pixel = max(fwidth(p.y), 0.00032);
      float day = uDay;
      float dawn = uDawn;
      vec2 tangent = uLimbTangent;
      vec2 outward = vec2(-tangent.y, tangent.x);
      float radius = uPlanetRadius;
      vec2 center = uPlanetCenter;
      vec2 fromCenter = p - center;
      float r = length(fromCenter);
      float edge = r - radius;
      float above = max(edge, 0.0);
      float limbLongitude = atan(dot(fromCenter,tangent), dot(fromCenter,outward));

      vec2 toSun = p - uSunCenter;
      float sunDist = length(toSun);
      float nearSun = uSunInFront * exp(-abs(toSun.x) * 1.55);
      float emerged = uSunVisibility * uSunInFront;
      float sunbreak = emerged * (1.0 - smoothstep(0.035, 0.16, uSolarAltitude));
      float discDistance = length(toSun / uSunRadii);

      vec3 col;
      float sunDisc = 0.0, airLight = 1.0;
      vec3 oceanSpecular = vec3(0.0);
      if (edge > 0.0) {
        col = deepSky(above, day, emerged * exp(-sunDist * 1.6));
        float blanket = exp(-above * 5.1);
        col += vec3(0.023, 0.080, 0.144) * blanket;
        col += vec3(0.19, 0.085, 0.045) * nearSun * (0.22 + dawn * 1.5) * blanket;
        col += vec3(0.415, 0.158, 0.060) * exp(-sunDist * 3.25) * dawn * uSunInFront;
        col += vec3(0.56, 0.314, 0.109) * exp(-sunDist * 10.7) * emerged;
        col += vec3(0.67, 0.527, 0.273) * exp(-sunDist * 31.0) * emerged;
        // Warm forward scattering runs along the atmosphere as the disk clears it.
        col += vec3(0.37, 0.186, 0.071) * exp(-above * 19.0 - abs(toSun.x) * 2.85) * sunbreak;
        float edgeWidth = pixel / uSunRadii.x;
        sunDisc = uSunInFront * (1.0 - smoothstep(1.0 - edgeWidth, 1.0 + edgeWidth, discDistance));
      } else {
        vec2 nxy = fromCenter / radius;
        vec3 normal = vec3(nxy, sqrt(max(0.0, 1.0 - dot(nxy, nxy))));
        float lateral = dot(nxy, tangent);
        float latitude = asin(clamp(normal.z, 0.0, 0.9999));
        float reflection = exp(-abs(toSun.x) * 7.1 - normal.z * 3.2) * day * uSunInFront;
        col = surface(vec2(limbLongitude, latitude), normal, lateral, reflection, airLight, oceanSpecular);
      }

      col += vec3(0.30, 0.16, 0.061) * exp(-sunDist * 14.5) * emerged;
      // The anamorphic streak is aligned with the lens. The flare gains light
      // only from the visible fraction of the disk, even through a rolled shot.
      float dx = abs(toSun.x), dy = abs(toSun.y);
      float longStreak = exp(-dy / (0.0017 + pixel * 0.40)) * exp(-dx * 2.75);
      float softStreak = exp(-dy / 0.008) * exp(-dx * 8.8);
      col += (vec3(0.315, 0.212, 0.121) * longStreak + vec3(0.16, 0.099, 0.052) * softStreak) * (emerged + 0.40 * sunbreak);

      // The art-directed palette is sRGB. Decode it to scene-linear light
      // before adding the solar photosphere in multiples of diffuse white.
      // The shared final pass owns the display transform and quantization.
      vec3 linearColor = mix(col / 12.92, pow((col + 0.055) / 1.055, vec3(2.4)), step(vec3(0.04045), col));
      float sunward = uSunInFront * exp(-abs(dot(toSun,tangent)) * 1.10);
      linearColor = atmosphere(linearColor + oceanSpecular, edge / radius, limbLongitude, sunward, sunbreak, airLight);
      float solarMu = sqrt(max(0.0, 1.0 - discDistance * discDistance));
      vec3 photosphere = mix(vec3(13.6, 13.1, 12.35), vec3(13.2, 10.65, 7.86), sunbreak);
      linearColor = mix(linearColor, photosphere * (0.74 + 0.26 * solarMu), sunDisc);
      gl_FragColor = vec4(linearColor, 1.0);
    }
  `;

  function smoothstep(min, max, value) {
    const x = Math.max(0, Math.min(1, (value - min) / (max - min)));
    return x * x * (3 - 2 * x);
  }

  // During transit integrate the visible vertical strips of the projected
  // elliptical photosphere against the actual circular silhouette. The sine
  // substitution resolves the narrow tips of the disk; full occultation and
  // full visibility require only one distance test.
  function visibleSolarFraction(planet, radius, sun, radii) {
    const dx = sun.x - planet.x;
    const dy = sun.y - planet.y;
    const clearance = Math.hypot(dx, dy) - radius;
    const reach = Math.max(radii.x, radii.y);
    if (clearance >= reach) return 1;
    if (clearance <= -reach) return 0;

    const strips = 48;
    let exposedArea = 0;
    for (let i = 0; i < strips; i++) {
      const angle = Math.PI * ((i + 0.5) / strips - 0.5);
      const cosine = Math.cos(angle);
      const x = dx + radii.x * Math.sin(angle);
      const halfStrip = radii.y * cosine;
      const planetHeight = Math.sqrt(Math.max(0, radius * radius - x * x));
      const occulted = Math.max(0, Math.min(dy + halfStrip, planetHeight) - Math.max(dy - halfStrip, -planetHeight));
      exposedArea += (2 * halfStrip - occulted) * cosine;
    }
    return Math.max(0, Math.min(1, exposedArea / (radii.y * strips)));
  }

  window.PenumbraCosmos = {
    create(THREE, scene) {
      const galaxy = makeGalaxyBasis(THREE);
      const eyeRays = new THREE.Matrix3(), eyeOrientation = new THREE.Matrix3();
      const uniforms = {
        uSkyRays: { value: new THREE.Matrix3() },
        uViewFromSky: { value: new THREE.Matrix3() },
        uTrackLongitude: { value: 0 },
        uAtlas: { value: makeAtlas(THREE) },
        uTime: { value: 0 },
        uAspect: { value: 16 / 9 },
        uDay: { value: 0 },
        uDawn: { value: 0 },
        uPlanetCenter: { value: new THREE.Vector2() },
        uPlanetRadius: { value: 10.7 },
        uLimbTangent: { value: new THREE.Vector2() },
        uSunCenter: { value: new THREE.Vector2() },
        uSunRadii: { value: new THREE.Vector2() },
        uSolarAltitude: { value: 0 },
        uSunVisibility: { value: 0 },
        uSunInFront: { value: 1 },
        uSurfaceSun: { value: new THREE.Vector2(1, -1) }
      };
      const material = new THREE.ShaderMaterial({
        uniforms,
        vertexShader: vertex,
        fragmentShader: fragment,
        depthTest: false,
        depthWrite: false,
        toneMapped: false,
        extensions: { derivatives: true }
      });
      const sky = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), material);
      sky.name = "Orbital horizon and atmosphere";
      sky.frustumCulled = false;
      sky.renderOrder = -10000;
      scene.add(sky, makeStars(THREE, galaxy, uniforms));
      const lighting = {
        viewFromSky: uniforms.uViewFromSky.value,
        sunWorld: null,
        planetCenter: uniforms.uPlanetCenter.value,
        planetRadius: uniforms.uPlanetRadius.value,
        sunNDC: new THREE.Vector2(),
        horizonNDC: new THREE.Vector2(),
        horizonTangent: new THREE.Vector2(),
        sunVisibility: 0,
        sunInFront: true,
        solarAltitude: 0,
        day: 0
      };

      const viewSun = new THREE.Vector3();
      const resolvedSun = new THREE.Vector3();
      const clipSun = new THREE.Vector4();
      const actualRotation = new THREE.Matrix4();
      const horizonRay = new THREE.Vector3(), right = new THREE.Vector3(), up = new THREE.Vector3();
      const limbToView = new THREE.Matrix3(), panRotation = new THREE.Matrix3();
      const takes = Array.from({ length: 7 }, () => ({
        skyToLimb: new THREE.Matrix3(), pan: 0, longitude: 0, ready: false
      }));

      function orientSky(camera, framing, time, aspect, horizonY, tangent, radius) {
        const lens = camera?.projectionMatrix.elements;
        const fx = lens ? lens[0] : 3.2/aspect, fy = lens ? lens[5] : 3.2;
        const shiftX = lens?.[8] ?? 0, shiftY = lens?.[9] ?? 0;
        eyeRays.set(1/fx, 0, shiftX/fx, 0, 1/fy, shiftY/fy, 0, 0, -1);
        if (camera) eyeOrientation.setFromMatrix4(actualRotation.extractRotation(camera.matrixWorld));
        else eyeOrientation.identity();

        const take = Number.isInteger(framing?.skyTake) ? takes[framing.skyTake] : undefined;
        const viewFromSky = uniforms.uViewFromSky.value;
        let longitude = 0.00112 * time;
        if (take && (take.ready || (framing.calibrateSky && camera))) {
          // The projected anchor ray includes lens shift. Differentiate that ray
          // along one unit of the physical-screen tangent, then orthonormalize.
          horizonRay.set(shiftX/fx, (horizonY+shiftY)/fy, -1);
          const rayLength = horizonRay.length();
          horizonRay.multiplyScalar(1/rayLength);
          right.set(tangent.x/(aspect*fx), tangent.y/fy, 0);
          right.addScaledVector(horizonRay, -right.dot(horizonRay));
          const radiansPerScreenUnit = right.length()/rayLength;
          right.normalize();
          up.crossVectors(right, horizonRay).normalize();
          limbToView.set(right.x,up.x,-horizonRay.x, right.y,up.y,-horizonRay.y, right.z,up.z,-horizonRay.z);

          const pan = framing.skyPan ?? 0;
          if (framing.calibrateSky && camera) {
            take.skyToLimb.multiplyMatrices(eyeOrientation, limbToView).transpose();
            take.pan = pan;
            take.longitude = longitude;
            take.ready = true;
          }
          const delta = Math.atan2(Math.sin(pan-take.pan),Math.cos(pan-take.pan));
          const co = Math.cos(delta), si = Math.sin(delta);
          panRotation.set(co,0,si, 0,1,0, -si,0,co);
          viewFromSky.copy(limbToView).multiply(panRotation).multiply(take.skyToLimb);
          eyeOrientation.copy(viewFromSky).transpose();

          // A surface longitude changes by 1/R per screen unit at the tangent.
          // Match its apparent pan rate to stellar bearings at the same anchor.
          longitude = take.longitude + delta/(radius*radiansPerScreenUnit);
        } else {
          viewFromSky.copy(eyeOrientation).transpose();
        }
        uniforms.uTrackLongitude.value = longitude;
        uniforms.uSkyRays.value.copy(galaxy.basis).multiply(eyeOrientation).multiply(eyeRays);
      }

      function projectWorldSun(direction, camera, aspect, tangent, sun) {
        // w=0 is a direction at infinity. A camera translation cannot move it;
        // an asymmetric projection must still affect its displayed position.
        viewSun.copy(direction).transformDirection(camera.matrixWorldInverse);
        clipSun.set(viewSun.x, viewSun.y, viewSun.z, 0).applyMatrix4(camera.projectionMatrix);
        const lateral = viewSun.x * tangent.x + viewSun.y * tangent.y;
        uniforms.uSurfaceSun.value.set(Math.max(-1, Math.min(1, lateral * 2.3)), viewSun.z);
        if (clipSun.w > 0.000001) {
          sun.set(aspect * clipSun.x / clipSun.w, clipSun.y / clipSun.w);
          return true;
        }

        // A rear-hemisphere ray has no film-plane image. Preserve its lateral
        // bearing offscreen without mirroring it through a negative homogeneous w.
        const lens = camera.projectionMatrix.elements;
        const sx = lens[0] * viewSun.x + lens[4] * viewSun.y;
        const sy = lens[1] * viewSun.x + lens[5] * viewSun.y;
        const extent = Math.max(Math.abs(sx), Math.abs(sy));
        if (extent < 0.000001) sun.set(aspect * 12, 0);
        else sun.set(aspect * (12 * sx / extent - lens[8]), 12 * sy / extent - lens[9]);
        return false;
      }

      function update({ time, progress, aspect, camera, framing }) {
        const metricAspect = Math.max(0.1, aspect);
        const day = smoothstep(0.36, 0.93, progress);
        const dawn = smoothstep(0.20, 0.76, progress);
        const slope = 0.265 + 0.026 * Math.sin(progress * 5.8) - 0.070 * day;
        const angle = Math.atan(slope) + (framing?.roll ?? 0);
        const tangent = uniforms.uLimbTangent.value.set(Math.cos(angle), Math.sin(angle));
        const radius = 10.7 - day;
        const anchorY = (framing?.horizonY ?? 0) + 0.035 * Math.sin(progress * 5.2) + day * 0.018;
        const center = uniforms.uPlanetCenter.value.set(tangent.y * radius, anchorY - tangent.x * radius);
        const horizonY = center.y + Math.sqrt(Math.max(0, radius * radius - center.x * center.x));
        orientSky(camera, framing, time, metricAspect, horizonY, tangent, radius);

        const sunX = (0.62 + 0.045 * day) * metricAspect;
        const dx = sunX - center.x;
        const limbAtSun = center.y + Math.sqrt(Math.max(0, radius * radius - dx * dx));
        const rise = -0.185 + 0.407 * smoothstep(0.37, 0.91, progress);
        const sun = uniforms.uSunCenter.value.set(sunX, limbAtSun + rise);
        const sunRadius = 0.025;
        const radii = uniforms.uSunRadii.value.set(sunRadius, sunRadius * (0.90 + 0.10 * smoothstep(0.015, 0.1, rise)));
        let direction = null;
        if (camera && framing?.sunSky) {
          direction = resolvedSun.copy(framing.sunSky).applyMatrix3(lighting.viewFromSky).transformDirection(camera.matrixWorld);
        } else if (camera && framing?.sunWorld) {
          direction = resolvedSun.copy(framing.sunWorld).normalize();
        }
        let sunInFront = true;
        if (direction) sunInFront = projectWorldSun(direction, camera, metricAspect, tangent, sun);
        else uniforms.uSurfaceSun.value.set(1, -1);
        const visibility = direction ? 1 : visibleSolarFraction(center, radius, sun, radii);

        uniforms.uTime.value = time;
        uniforms.uAspect.value = metricAspect;
        uniforms.uDay.value = day;
        uniforms.uDawn.value = dawn;
        uniforms.uPlanetRadius.value = radius;
        uniforms.uSolarAltitude.value = rise;
        uniforms.uSunVisibility.value = visibility;
        uniforms.uSunInFront.value = sunInFront ? 1 : 0;

        lighting.sunWorld = direction;
        lighting.planetRadius = radius;
        lighting.sunNDC.set(sun.x / metricAspect, sun.y);
        lighting.horizonNDC.set(0, horizonY);
        lighting.horizonTangent.copy(tangent);
        lighting.sunVisibility = visibility;
        lighting.sunInFront = sunInFront;
        lighting.solarAltitude = rise;
        lighting.day = day;
        return lighting;
      }

      update({ time: 0, progress: 0, aspect: 16 / 9 });
      return { atlas: uniforms.uAtlas.value, update };
    }
  };
}());
