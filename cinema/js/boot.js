/* Open on the empty orbit. The live vessel enters only after its first frame is ready. */
(() => {
  "use strict";

  const byId = id => document.getElementById(id);
  const cover = byId("opening");
  const dial = byId("loading-progress");
  const reduced = matchMedia("(prefers-reduced-motion: reduce)");
  const version = new URL(document.currentScript.src, document.baseURI).searchParams.get("v");
  const scriptQuery = version && location.protocol !== "file:" ? "?v="+encodeURIComponent(version) : "";
  const scripts = [
    ["craft", 77], ["cosmos", 45], ["score", 43],
    ["display", 20], ["flight", 52], ["player", 14]
  ];
  // HTTP reports the large library in bytes. Other work completes when decoded,
  // evaluated, or painted. Keep the last share for the playable picture.
  const weights = new Map([["space", 12], ["style", 14], ["fonts", 48],
    ["three", 670], ...scripts, ["frame", 45]]);
  const total = [...weights.values()].reduce((sum, value) => sum + value, 0);
  const work = new Map();
  let drawVessel;
  window.PenumbraOpening = {
    pictureReady(draw) { drawVessel = draw; }
  };

  function advance(key, fraction = 1) {
    work.set(key, Math.max(work.get(key) || 0, Math.min(1, fraction)));
    let complete = 0;
    for (const [id, part] of work) complete += weights.get(id) * part;
    const value = Math.round(complete * 1000 / total) / 10;
    const integer = Math.floor(value);
    dial.style.setProperty("--filled", value + "%");
    if (dial.getAttribute("aria-valuenow") !== String(integer)) {
      dial.setAttribute("aria-valuenow", String(integer));
      byId("loading-percent").textContent = integer + "%";
    }
  }

  function stage(phase, text) {
    if (cover.dataset.phase === "error") return;
    cover.dataset.phase = phase;
    byId("loading-label").textContent = text;
  }

  const painted = () => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));

  async function finishTransition(element) {
    await Promise.allSettled(element.getAnimations().map(animation => animation.finished));
  }

  function imageReady(image) {
    const loaded = new Promise((resolve, reject) => {
      if (image.complete && image.currentSrc) {
        if (image.naturalWidth) resolve();
        else reject();
      } else {
        image.addEventListener("load", resolve, {once:true});
        image.addEventListener("error", reject, {once:true});
      }
    });
    return loaded.then(() => image.decode?.()).catch(() => { image.hidden = true; });
  }

  function stillOrbit(space, poster) {
    if (!space.naturalWidth || !poster.naturalWidth) return;
    const sky = document.createElement("canvas");
    const width = sky.width = poster.naturalWidth;
    const height = sky.height = poster.naturalHeight;
    const ctx = sky.getContext("2d");
    if (!ctx) return;
    // These outlines follow the vessel on the two stills, in source pixels.
    // Keep every other star from the final poster on the stationary layer.
    const outline = new Path2D(height > width
      ? "M93 369L145 284 214 195 265 148 304 146 355 173 430 185 479 210 486 321 309 348 106 384Z"
      : "M690 598L866 347 1105 133 1175 130 1308 177 1504 218 1536 390 1540 457 1125 535 716 620Z");
    // The landscape clean plate is cropped about the poster's 70% optical centre.
    const cleanWidth = space.naturalWidth * height / space.naturalHeight;
    ctx.drawImage(poster, 0, 0);
    ctx.clip(outline);
    ctx.drawImage(space, (width - cleanWidth) * .70, 0, cleanWidth, height);
    sky.className = "opening-orbit";
    sky.setAttribute("aria-hidden", "true");
    cover.insertBefore(sky, poster);
    const vessel = sky.cloneNode(false);
    const paint = vessel.getContext("2d");
    paint.clip(outline);
    paint.drawImage(poster, 0, 0);
    vessel.className = "opening-plate";
    poster.hidden = true;
    cover.insertBefore(vessel, poster);
  }

  async function prepareStyle() {
    const sheet = byId("screen-style");
    if (sheet.dataset.failed) throw new Error("Stylesheet unavailable");
    if (!sheet.sheet) {
      await new Promise((resolve, reject) => {
        sheet.addEventListener("load", resolve, {once:true});
        sheet.addEventListener("error", reject, {once:true});
      });
    }
    sheet.media = "all";
    advance("style");
    if (document.fonts) {
      const faces = ['italic 800 24px "Barlow Display"', '600 16px "Barlow Condensed"', '500 12px "IBM Plex Mono"'];
      await Promise.allSettled(faces.map(face => document.fonts.load(face)));
    }
    advance("fonts");
  }

  function script(url) {
    return new Promise((resolve, reject) => {
      const element = document.createElement("script");
      element.async = false;
      element.onload = resolve;
      element.onerror = () => reject(new Error("Script unavailable"));
      element.src = url;
      document.head.append(element);
    });
  }

  async function library() {
    const url = "./assets/vendor/three.r160.min.js";
    if (location.protocol === "file:") {
      await script(url);
      return;
    }
    try {
      const blob = await new Promise((resolve, reject) => {
        const request = new XMLHttpRequest();
        request.open("GET", url);
        request.responseType = "blob";
        request.onprogress = event => {
          const bytes = event.lengthComputable && event.total > 0 ? event.total : Math.max(670000, event.loaded);
          advance("three", .98 * event.loaded / bytes);
        };
        request.onload = () => {
          if (request.status >= 200 && request.status < 300) resolve(new Blob([request.response], {type:"text/javascript"}));
          else reject(new Error("Library unavailable"));
        };
        request.onerror = () => reject(new Error("Connection interrupted"));
        request.send();
      });
      const local = URL.createObjectURL(blob);
      try { await script(local); }
      finally { URL.revokeObjectURL(local); }
      if (!window.THREE) throw new Error("Library did not initialize");
    } catch {
      // A host can restrict blob scripts and still allow native same-origin scripts.
      await script(url);
    }
  }

  async function preparePicture() {
    await Promise.all([imageReady(byId("opening-space")), painted()]);
    advance("space");
    stage("space", "PREPARING FILM");
    await library();
    advance("three");
    // These classic scripts download together and execute in insertion order.
    await Promise.all(scripts.map(([id]) => script("./js/" + id + ".js" + scriptQuery).then(() => advance(id))));
    if (drawVessel === undefined) throw new Error("Player did not initialize");
    if (drawVessel) {
      drawVessel(0);
    } else {
      const plate = byId("opening-ship");
      plate.src = matchMedia("(max-aspect-ratio: 4/5)").matches
        ? "./assets/stills/loading-ship-portrait.webp" : "./assets/stills/poster.webp";
      await imageReady(plate);
      stillOrbit(byId("opening-space"), plate);
      cover.classList.add("still-reveal");
    }
    await painted();
  }

  function reveal() {
    if (reduced.matches) {
      return painted().then(() => drawVessel?.(1));
    }
    const start = performance.now();
    return new Promise(resolve => {
      function frame(stamp) {
        const t = Math.max(0, Math.min(1, (stamp - start) / 1750));
        drawVessel?.(t * t * (3 - 2 * t));
        if (t < 1) requestAnimationFrame(frame);
        else resolve();
      }
      requestAnimationFrame(frame);
    });
  }

  async function open() {
    await Promise.all([prepareStyle(), preparePicture()]);
    // Finish the photograph before uncovering the final lens. Their stars
    // need not occupy the same pixels at the viewer's aspect ratio.
    if (!reduced.matches) {
      stage("dim", "PREPARING FILM");
      await finishTransition(byId("opening-space"));
    }
    drawVessel?.(0);
    stage("orbit", "PREPARING FILM");
    await finishTransition(cover.querySelector(".opening-orbit") || cover);
    await painted();
    advance("frame");
    stage("reveal", "READY");
    await reveal();
    cover.hidden = true;
    document.documentElement.classList.remove("film-loading");
    byId("cinema").setAttribute("aria-busy", "false");
    byId("launch").disabled = false;
  }

  open().catch(() => {
    stage("error", "UNABLE TO LOAD FILM");
    byId("loading-retry").hidden = false;
  });
})();
