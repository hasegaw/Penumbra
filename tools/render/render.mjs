import {spawnSync} from "node:child_process";
import {mkdir, readFile, readdir, realpath, rename, writeFile} from "node:fs/promises";
import path from "node:path";
import {fileURLToPath} from "node:url";
import {parseArgs} from "node:util";
import {chromium} from "playwright-core";

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, "../..");
const cinema = path.join(repo, "cinema");
const width = 1920, height = 1080, duration = 90, sampleRate = 48000;

function command(name, args, capture = false) {
  const run = spawnSync(name, args, {encoding:"utf8", stdio:capture ? "pipe" : "inherit"});
  if (run.error) throw run.error;
  if (run.status !== 0) throw Error(name + " failed" + (run.stderr ? "\n" + run.stderr : "."));
  return run.stdout;
}

function waveHeader(byteLength) {
  const h = Buffer.alloc(44);
  h.write("RIFF"); h.writeUInt32LE(byteLength+36, 4);
  h.write("WAVEfmt ", 8); h.writeUInt32LE(16, 16);
  h.writeUInt16LE(1, 20); h.writeUInt16LE(2, 22);
  h.writeUInt32LE(sampleRate, 24); h.writeUInt32LE(sampleRate*4, 28);
  h.writeUInt16LE(4, 32); h.writeUInt16LE(16, 34);
  h.write("data", 36); h.writeUInt32LE(byteLength, 40);
  return h;
}

async function render() {
  const {values} = parseArgs({options:{
    out:{type:"string"}, fps:{type:"string", default:"24"}, help:{type:"boolean", short:"h"}
  }});
  if (values.help) {
    console.log("Render PENUMBRA in Chrome at 1920×1080. Requires Chrome, FFmpeg and ffprobe.");
    console.log("node render.mjs [--out EMPTY_DIRECTORY] [--fps 24|25|30|50|60]");
    console.log("The default output is a timestamped directory under renders/.");
    return;
  }
  const fps = Number(values.fps);
  if (![24,25,30,50,60].includes(fps)) throw Error("Choose 24, 25, 30, 50 or 60 fps.");
  const stamp = new Date().toISOString().replaceAll(":", "-");
  const output = path.resolve(values.out || path.join(repo, "renders", stamp));
  // Resolve existing parents as well, so a symlink cannot put output in the Pages payload.
  let ancestor = output;
  while (!(await realpath(ancestor).catch(() => null))) ancestor = path.dirname(ancestor);
  const canonical = path.resolve(await realpath(ancestor), path.relative(ancestor, output));
  const within = (base, target) => target === base || target.startsWith(base + path.sep);
  if (within(await realpath(cinema), canonical) || within(path.join(repo, ".git"), canonical)) {
    throw Error("Choose an output directory outside cinema/ and .git/.");
  }
  command("ffmpeg", ["-version"], true);
  command("ffprobe", ["-version"], true);
  await mkdir(output, {recursive:true});
  if ((await readdir(output)).length) throw Error("Output directory must be empty: " + output);
  const frames = path.join(output, "frames");
  await mkdir(frames);
  const count = fps * duration;
  const pad = n => String(n).padStart(6,"0");
  const browser = await chromium.launch({channel:"chrome", headless:true});
  try {
    const page = await browser.newPage({viewport:{width,height}, deviceScaleFactor:1});
    const errors = [];
    page.on("pageerror", error => errors.push(error.message));
    await page.addScriptTag({path:path.join(cinema, "assets/vendor/three.r160.min.js")});
    for (const script of ["craft","cosmos","display","flight","score"]) {
      await page.addScriptTag({path:path.join(cinema, "js", script + ".js")});
    }
    await page.addScriptTag({path:path.join(here, "frames.js")});
    const font = await readFile(path.join(cinema, "assets/fonts/barlow-condensed-800-italic.woff2"));
    await page.evaluate(args => filmExport.prepare(...args), [width, height, font.toString("base64")]);
    console.log("Rendering " + count + " PNGs at " + fps + " fps into " + frames);
    for (let i=0; i<count; i++) {
      const png = await page.evaluate(t => filmExport.capture(t), i/fps);
      if (errors.length) throw Error(errors.join("\n"));
      await writeFile(path.join(frames,"frame-" + pad(i) + ".png"), Buffer.from(png,"base64"), {flag:"wx"});
      if ((i+1) % (fps*5) === 0) console.log((i+1) + "/" + count + " frames");
    }
    console.log("Rendering the stereo score and camera-relative engines...");
    const audio = Buffer.from(await page.evaluate(args => filmExport.soundtrack(...args), [duration,sampleRate]), "base64");
    if (errors.length) throw Error(errors.join("\n"));
    if (audio.length !== duration * sampleRate * 4) throw Error("Incomplete stereo audio.");
    await writeFile(path.join(output,"score.wav"), Buffer.concat([waveHeader(audio.length), audio]), {flag:"wx"});
  } finally {
    await browser.close();
  }
  const part = path.join(output, "PENUMBRA.partial.mp4");
  command("ffmpeg", ["-hide_banner","-loglevel","error","-nostdin","-n",
    "-framerate",String(fps),"-start_number","0","-i",path.join(frames,"frame-%06d.png"),
    "-i",path.join(output,"score.wav"),"-map","0:v:0","-map","1:a:0",
    "-vf","scale=out_color_matrix=bt709:out_range=tv,format=yuv420p",
    "-c:v","libx264","-preset","medium","-crf","16","-color_primaries","bt709","-color_trc","iec61966-2-1",
    "-colorspace","bt709","-color_range","tv","-c:a","aac","-b:a","256k","-movflags","+faststart",part]);
  const probe = JSON.parse(command("ffprobe",["-v","error","-show_streams","-of","json",part],true));
  const video = probe.streams.find(s=>s.codec_type==="video"), audio = probe.streams.find(s=>s.codec_type==="audio");
  if (video?.width!==width || video?.height!==height || Number(video.nb_frames)!==count ||
      audio?.channels!==2 || Number(audio.sample_rate)!==sampleRate ||
      [video,audio].some(s=>!Number.isFinite(Number(s.duration)) || Math.abs(Number(s.duration)-duration)>1/fps)) throw Error("Encoded streams failed verification.");
  const movie = path.join(output,"PENUMBRA.mp4");
  await rename(part, movie);
  console.log(movie);
}

render().catch(error => {console.error(error.message); process.exitCode=1;});
