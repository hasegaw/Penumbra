/* Offline film projection in Chrome. All production scene and score code is loaded first. */
(() => {
  "use strict";

  let film, view, output, credit, ink;
  const cameraTrace = [];

  async function prepare(width, height, fontData) {
    const font = new FontFace("Barlow Display", 'url("data:font/woff2;base64,' + fontData + '")',
      {style:"italic", weight:"800"});
    document.fonts.add(await font.load());
    view = document.createElement("canvas");
    film = PenumbraFlight.create(view, null, () => {});
    film.resize(width, height, 1);

    // The interactive player caps its pixel budget. Find the native HD buffer
    // using its quality control before drawing any export frames.
    if (view.width < width || view.height < height) {
      let low = 1;
      let high = Math.max((width+1)/view.width, (height+1)/view.height);
      for (let i=0; i<16; i++) {
        const quality = (low + high) / 2;
        film.resize(width, height, quality);
        if (view.width === width && view.height === height) break;
        if (view.width < width || view.height < height) low = quality;
        else high = quality;
      }
    }
    if (view.width !== width || view.height !== height) throw Error("Chrome could not produce a native HD drawing buffer.");
    view.addEventListener("webglcontextlost", () => { film = null; });
    output = document.createElement("canvas");
    credit = document.createElement("canvas");
    output.width = credit.width = width;
    output.height = credit.height = height;
    ink = output.getContext("2d", {alpha:false, colorSpace:"srgb"});
    PenumbraDisplay.title.paint(credit);
  }

  function capture(time) {
    if (!film) throw Error("Chrome lost the WebGL drawing context.");
    const engine = film.draw(time, "playing", 0, 0);
    cameraTrace.push({...engine});
    ink.globalAlpha = 1;
    ink.drawImage(view, 0, 0);
    const title = PenumbraDisplay.title.opacityAt(time);
    if (title > 0) {
      ink.globalAlpha = title;
      ink.drawImage(credit, 0, 0);
    }
    const shutter = PenumbraDisplay.openingOpacity(time, PenumbraScore.openingCallEnd);
    if (shutter > 0) {
      ink.globalAlpha = shutter;
      ink.fillStyle = "#000";
      ink.fillRect(0, 0, output.width, output.height);
    }
    return output.toDataURL("image/png").split(",")[1];
  }

  async function soundtrack(seconds, rate) {
    const samples = Math.round(seconds * rate);
    const ctx = new OfflineAudioContext(2, samples + Math.ceil(.1 * rate), rate);
    const score = new PenumbraScore();
    score.prepare(ctx);
    score.setEngineView(cameraTrace[0]);
    score.begin(0);
    const run = score.run;
    clearInterval(run.timer);
    score.queue(run, seconds);
    for (const view of cameraTrace) run.engine.move(view, run.zero + view.time);
    const audio = await ctx.startRendering();

    // Remove the score scheduler's device lead-in at sample precision.
    const start = Math.round(run.zero * rate);
    if (start + samples > audio.length) throw Error("Offline score is shorter than the film.");
    const left = audio.getChannelData(0), right = audio.getChannelData(1);
    const bytes = new ArrayBuffer(samples * 4), pcm = new DataView(bytes);
    for (let i=0; i<samples; i++) {
      pcm.setInt16(4*i, Math.round(Math.max(-1, Math.min(1, left[start+i])) * 32767), true);
      pcm.setInt16(4*i+2, Math.round(Math.max(-1, Math.min(1, right[start+i])) * 32767), true);
    }
    const blob = new Blob([bytes], {type:"application/octet-stream"});
    return new Promise((resolve,reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result.split(",")[1]);
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(blob);
    });
  }

  window.filmExport = {prepare, capture, soundtrack};
})();
