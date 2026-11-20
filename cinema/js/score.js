/* PENUMBRA · original score for oscillators, filtered noise and stereo delay. */
(() => {
  "use strict";

  const BEAT = 60 / 96;
  const BAR = BEAT * 4;
  const DURATION = BAR * 36;
  const GATE_PASS = 40.5;
  const hz = midi => 440 * 2 ** ((midi - 69) / 12);
  const clamp = (value, lo, hi) => Math.max(lo, Math.min(hi, value));

  // A ninth-bar turnaround bridges each shot. The last E major chord lifts the
  // opening E minor theme into daylight.
  const chords = {
    em: { bass: 28, bed: [55, 59, 62, 66], arp: [52, 59, 64, 66, 67, 71, 74, 78] },
    c:  { bass: 24, bed: [55, 59, 62, 64], arp: [52, 55, 60, 62, 64, 67, 71, 74] },
    g:  { bass: 31, bed: [54, 57, 59, 62], arp: [50, 55, 59, 62, 66, 67, 71, 74] },
    ds: { bass: 26, bed: [55, 57, 62, 64], arp: [50, 57, 62, 64, 67, 69, 74, 76] },
    d:  { bass: 26, bed: [54, 57, 62, 64], arp: [50, 57, 62, 64, 66, 69, 74, 76] },
    bm: { bass: 35, bed: [54, 57, 61, 64], arp: [54, 59, 61, 64, 66, 69, 71, 73] },
    a:  { bass: 33, bed: [52, 57, 59, 62], arp: [52, 57, 59, 62, 64, 69, 71, 74] },
    b:  { bass: 35, bed: [54, 57, 63, 66], arp: [51, 54, 59, 63, 66, 69, 71, 75] },
    e:  { bass: 28, bed: [56, 59, 63, 66], arp: [52, 59, 63, 66, 68, 71, 75, 78] }
  };
  const progression = [
    ["em", 2], ["c", 2], ["g", 2], ["ds", 2], ["bm", 1],
    ["em", 2], ["c", 2], ["g", 2], ["ds", 2], ["d", 1],
    ["c", 2], ["g", 2], ["em", 2], ["d", 2], ["bm", 1],
    ["c", 2], ["g", 2], ["d", 1], ["a", 1], ["b", 1], ["e", 2]
  ];

  // Six stations join the circuit as the flight changes sectors. Each keeps
  // the same operator, receive band and position on the ship's stereo bus.
  // The three tract ratios move vowel resonances independently.
  const stations = [
    { role: "Orbital Control", pitch:105, tract:[0.94,0.96,0.90], pace:1.07, gap:1.28, accent:1.06,
      arc:0.68, ending:-0.025, open:0.56, grit:0.14, breath:0.029, presence:0.89,
      drive:6.55, low:320, high:2480, pan:-0.30,
      pilotTone:1080, leak:0.010, floor:0.021, tail:0.151, snap:755 },
    { role: "Vesper Seven", pitch:171, tract:[1.08,1.06,1.10], pace:0.96, gap:0.95, accent:1.12,
      arc:1.08, ending:-0.038, open:0.75, grit:0.032, breath:0.106, presence:0.95,
      drive:5.48, low:275, high:3300, pan:0.14,
      pilotTone:1355, leak:0.005, floor:0.013, tail:0.108, snap:1050 },
    { role: "Relay Two", pitch:147, tract:[0.99,1.19,1.07], pace:0.84, gap:0.79, accent:0.94,
      arc:0.85, ending:0.039, open:0.55, grit:0.068, breath:0.039, presence:1.34,
      drive:6.86, low:470, high:3430, pan:-0.48,
      pilotTone:1780, leak:0.021, floor:0.030, tail:0.174, snap:1260 },
    { role: "Approach Four", pitch:84, tract:[0.89,0.87,0.91], pace:1.17, gap:1.22, accent:1.15,
      arc:0.59, ending:-0.052, open:0.51, grit:0.59, breath:0.041, presence:0.72,
      drive:8.24, low:395, high:2040, pan:0.32,
      pilotTone:830, leak:0.015, floor:0.026, tail:0.136, snap:592 },
    { role: "Gate Nine", pitch:213, tract:[1.23,1.14,1.19], pace:1.06, gap:1.38, accent:1.04,
      arc:1.18, ending:0.026, open:0.79, grit:0.018, breath:0.168, presence:1.11,
      drive:4.93, low:540, high:3020, pan:-0.13,
      pilotTone:1530, leak:0.014, floor:0.019, tail:0.124, snap:919 },
    { role: "Dawn Track", pitch:127, tract:[1.10,0.91,1.055], pace:0.90, gap:1.47, accent:0.93,
      arc:1.29, ending:-0.092, open:0.645, grit:0.25, breath:0.056, presence:1.17,
      drive:7.34, low:505, high:2260, pan:0.45,
      pilotTone:1195, leak:0.036, floor:0.047, tail:0.206, snap:682 }
  ];
  const vowels = {
    IY: [285, 2250, 3020], IH: [400, 1980, 2600], EH: [520, 1790, 2480],
    AE: [670, 1730, 2430], AA: [745, 1130, 2460], AH: [640, 1230, 2460],
    AX: [460, 1510, 2490], AO: [530, 850, 2380], UH: [440, 1080, 2280],
    UW: [330, 795, 2220], ER: [465, 1360, 1670]
  };
  const glides = { AY: ["AA","IH"], OW: ["AO","UW"], EY: ["EH","IH"], AW: ["AA","UH"] };
  const resonants = {
    M: [255, 1070, 2300], N: [275, 1550, 2280], NG: [295, 1780, 2280],
    R: [375, 1180, 1640], L: [355, 1290, 2520], W: [275, 730, 2240], Y: [263, 2200, 2870]
  };
  const fricatives = { S: 0.88, SH: 0.73, ZH: 0.43, Z: 0.52, F: 0.43, V: 0.29, TH: 0.39, DH: 0.24, HH: 0.33 };
  const stops = new Set(["P","T","K","B","D","G","CH","JH"]);
  const voiced = new Set(["V","Z","ZH","DH","B","D","G","JH"]);
  const calls = [
    [0.82, 0, 0.262, "OW1 R B IH T / K AH N T R OW1 L | V EH1 S P ER / S EH1 V AX N"],
    [4.22, 1, 0.245, "V EH1 S P ER / S EH1 V AX N | R IY1 D IH NG"],
    [8.06, 0, 0.239, "CH EH1 K / S T AA1 R B ER D / ER EY1"],
    [11.23, 1, 0.225, "ER EY1 / G R IY1 N"],
    [15.48, 2, 0.249, "R IY1 L EY / T UW1 | S W IH1 CH / T UW1"],
    [19.08, 1, 0.236, "AA1 N / T UW1 | K AA1 P IY"],
    [23.28, 2, 0.269, "V EH1 K T ER / TH R IY1 | HH OW1 L D"],
    [26.62, 1, 0.235, "S T AE1 N D IH NG / B AY1"],
    [30.36, 3, 0.264, "AX P R OW1 CH / F AO1 R | K L OW1 Z IH NG"],
    [33.35, 1, 0.253, "V IH1 ZH UW AX L | P AO1 R T / S AY1 D"],
    [36.37, 4, 0.269, "G EY1 T / N AY1 N | R IH1 NG / K L IH1 R"],
    [38.34, 1, 0.231, "K AA1 P IY"],
    [42.39, 5, 0.232, "D AO1 N / T R AE1 K | V EH1 S P ER / AX K W AY1 ER D"],
    [45.41, 4, 0.215, "T R AE1 N S F ER / G UH1 D"],
    [48.47, 3, 0.174, "T R AE1 K / K AH M P L IY1 T"],
    [54.64, 1, 0.115, "AY1 / S IY1 / L AY1 T"],
    [61.75, 5, 0.065, "R AA1 JH ER"]
  ].map(([at, station, level, line], id) => {
    const random = randomSequence(41105 + id * 737);
    const operator = stations[station];
    let time = 0.043;
    const phones = line.split(" ").map(token => {
      const phone = token.replace(/[0-2]/g, "");
      const stress = token.endsWith("1");
      const glide = glides[phone];
      const vowel = vowels[phone] || (glide && vowels[glide[0]]);
      const formants = vowel || resonants[phone];
      let length = vowel ? (stress ? 0.155 : 0.106) : formants ? 0.072 : stops.has(phone) ? 0.056 : 0.084;
      if (phone === "/") length = 0.043;
      if (phone === "|") length = 0.148;
      if (phone === "/" || phone === "|") length *= operator.gap;
      else if (vowel) length *= stress ? operator.accent : 1 / Math.sqrt(operator.accent);
      length *= operator.pace * (1 + 0.17 * random());
      const segment = {
        phone, at: time, length, formants, endFormants: glide ? vowels[glide[1]] : formants,
        vowel: Boolean(vowel), stress, accent: 0.029 * random()
      };
      time += length;
      return segment;
    });
    let next = vowels.AX;
    for (let i = phones.length - 1; i >= 0; i--) {
      const p = phones[i];
      if (p.formants) next = p.formants;
      else p.formants = p.endFormants = next;
    }
    const carrierEnd = time + operator.tail + random() * 0.022;
    return { at, station, level, id, phones, speechEnd: time, carrierEnd, duration: carrierEnd + 0.026 };
  });

  // A glottal pulse train excites three moving vocal-tract resonances. Breathy
  // consonants, stop bursts and the receiver noise have separate envelopes.
  // Render a call once, at speech bandwidth; seeking can then resume any sample.
  function radioBuffer(ctx, msg) {
    const rate = 22050, station = stations[msg.station];
    const buffer = ctx.createBuffer(1, Math.ceil(rate * msg.duration), rate);
    const pcm = buffer.getChannelData(0), random = randomSequence(75029 + msg.id * 3137);
    const a1 = [0,0,0], a2 = [0,0,0], b0 = [0,0,0], z1 = [0,0,0], z2 = [0,0,0];
    const widths = [88, 124, 175], weights = [1, 0.93 * station.presence, 0.62 * station.presence];
    const rise = station.open * (0.60 + 0.11 * station.grit);
    const hp = 1 - Math.exp(-2 * Math.PI * station.low / rate);
    const lp = 1 - Math.exp(-2 * Math.PI * station.high / rate);
    let index = 0, phase = 0.19, cycle = 0, jitter = 1, f0 = station.pitch, previous = 0, previous2 = 0;
    let hissLow = 0, dc = 0, top = 0, top2 = 0, peak = 0, energy = 0;
    for (let i = 0; i < pcm.length; i++) {
      const t = i / rate;
      let changed = false;
      while (index + 1 < msg.phones.length && t >= msg.phones[index + 1].at) { index++; changed = true; }
      const p = msg.phones[index];
      const f = clamp((t - p.at) / p.length, 0, 1);
      if (changed || i % 24 === 0) {
        const last = index > 0 ? msg.phones[index - 1].endFormants : vowels.AX;
        const blend = clamp((t - p.at) / 0.039, 0, 1), diphthong = clamp((f - 0.27) * 1.65, 0, 1);
        for (let k = 0; k < 3; k++) {
          const target = p.formants[k] + (p.endFormants[k] - p.formants[k]) * diphthong;
          const omega = 2 * Math.PI * station.tract[k] * (last[k] + (target - last[k]) * blend) / rate;
          const radius = Math.exp(-Math.PI * widths[k] / rate);
          a1[k] = 2 * radius * Math.cos(omega);
          a2[k] = -radius * radius;
          b0[k] = 1 - radius;
        }
        const sentence = clamp(t / msg.speechEnd, 0, 1);
        const contour = 0.103 - 0.22 * sentence + 0.049 * Math.sin(t * 9.1 + msg.id * 0.7);
        const accent = (p.stress ? 0.108 : 0.029) * Math.sin(Math.PI * f) + p.accent;
        const ending = station.ending * clamp((sentence - 0.67) / 0.33, 0, 1);
        f0 = station.pitch * (1 + station.arc * (contour + accent) + ending + 0.007 * Math.sin(t * 34));
      }
      const n = random();
      hissLow += 0.38 * (n - hissLow);
      phase += f0 * jitter / rate;
      if (phase >= 1) {
        phase -= 1; cycle++;
        jitter = 1 + station.grit * (0.041 * n + (cycle % 2 ? 0.010 : -0.010));
      }
      const glottis = phase < rise ? 0.49 * Math.sin(Math.PI * phase / rise)
        : phase < station.open ? -Math.sin((phase - rise) * 0.5 * Math.PI / (station.open - rise)) : 0;
      const speaking = t >= p.at && t < msg.speechEnd;
      let gain = p.vowel ? (p.stress ? 1 : 0.79) : resonants[p.phone] ? 0.58 : voiced.has(p.phone) ? 0.23 : 0;
      gain *= speaking ? 0.47 + 0.53 * Math.sin(Math.PI * f) : 0;
      const shimmer = 1 - (cycle % 2 ? 0.49 * station.grit : 0.025 * station.grit);
      const excitation = (glottis * shimmer + station.breath * n * (phase < station.open ? 1 : 0.38)) * gain;
      let mouth = 0;
      for (let k = 0; k < 3; k++) {
        const y = b0[k] * (excitation - previous2) + a1[k] * z1[k] + a2[k] * z2[k];
        z2[k] = z1[k]; z1[k] = y; mouth += weights[k] * y;
      }
      previous2 = previous; previous = excitation;
      let air = fricatives[p.phone] || 0;
      if (stops.has(p.phone)) air = f < 0.49 ? 0 : 1.18 * Math.exp(-(f - 0.49) * 8);
      const consonant = speaking ? air * (n - hissLow * 0.87) * Math.min(1, f * 9, (1 - f) * 10) : 0;
      const radio = Math.tanh(mouth * station.drive + consonant * (0.55 + 0.54 * station.presence));
      const unlock = clamp((t - msg.speechEnd + 0.076) / 0.110, 0, 1);
      const staticLevel = station.floor + (0.40 + 1.48 * station.tail) * unlock + 0.14 * Math.exp(-t * 54);
      // The distant tracking receiver has a looser carrier and longer squelch
      // hang. Its low heterodyne whistle is clearest just as speech gives way.
      const drift = station.leak * 19 * Math.sin(t * 4.7 + msg.station);
      const carrier = station.leak * (0.67 + 0.33 * unlock) * Math.sin(2 * Math.PI * station.pilotTone * t + drift);
      const input = radio + n * staticLevel + carrier;
      dc += hp * (input - dc); top += lp * (input - dc - top); top2 += lp * (top - top2);
      const gate = Math.min(1, t / 0.008, Math.max(0, (msg.carrierEnd - t) / 0.0028));
      const release = t - msg.carrierEnd + 0.002;
      const relay = release > 0 ? 0.19 * Math.sin(2 * Math.PI * station.snap * release) * Math.exp(-release * 420) : 0;
      const sample = top2 * gate + relay;
      pcm[i] = sample; peak = Math.max(peak, Math.abs(sample)); energy += sample * sample;
    }
    const trim = Math.min(0.93 / Math.max(peak, 0.001), 0.27 / Math.max(0.001, Math.sqrt(energy / pcm.length)));
    for (let i = 0; i < pcm.length; i++) pcm[i] *= trim;
    return buffer;
  }

  // The same two-note equipment call opens each screening while the screen is black.
  const openingCall = [
    {at:0.27, note:75, length:0.092},
    {at:0.397, note:84, length:0.153}
  ];
  // The other eleven instrument cues rotate on replay. Notes are [offset, MIDI, length].
  const signalSlots = [
    [6.61,0.077,0.43], [13.42,0.083,-0.39], [21.83,0.10,0.29],
    [28.62,0.080,0.46], [35.28,0.098,-0.31], [39.42,0.083,-0.16], [41.45,0.087,0.37],
    [47.36,0.071,-0.27], [52.17,0.054,0.22], [58.72,0.033,0.37], [67.17,0.017,-0.15]
  ];
  const signalPrograms = [
    [
      ["bell",       [[0,81,0.273]]],
      ["relay",      [[0,67,0.072], [0.083,72,0.068], [0.214,79,0.104]]],
      ["chirp",      [[0,70,0.113], [0.161,78,0.164]]],
      ["packet",     [[0,86,0.13], [0.216,79,0.095]]],
      ["reed",       [[0,66,0.123], [0.144,71,0.175]]],
      ["contact",    [[0,73,0.102]]],
      ["scope",      [[0,75,0.130], [0.185,83,0.199]]],
      ["interferer", [[0,72,0.133], [0.181,69,0.115]]],
      ["scanner",    [[0,80,0.235]]],
      ["bell",       [[0,85,0.219]]],
      ["link",       [[0,76,0.172]]]
    ], [
      ["chirp",      [[0,77,0.204]]],
      ["packet",     [[0,71,0.111], [0.195,80,0.131]]],
      ["bell",       [[0,75,0.145], [0.089,82,0.241]]],
      ["scope",      [[0,88,0.066], [0.113,83,0.078], [0.204,77,0.137]]],
      ["contact",    [[0,65,0.059], [0.100,72,0.098]]],
      ["scanner",    [[0,84,0.125]]],
      ["interferer", [[0,78,0.118], [0.169,85,0.178]]],
      ["relay",      [[0,71,0.126]]],
      ["link",       [[0,82,0.201]]],
      ["bell",       [[0,81,0.116], [0.162,76,0.171]]],
      ["reed",       [[0,73,0.165]]]
    ], [
      ["interferer", [[0,83,0.224]]],
      ["link",       [[0,74,0.092], [0.18,68,0.145]]],
      ["scanner",    [[0,70,0.133], [0.215,81,0.168]]],
      ["bell",       [[0,87,0.292]]],
      ["reed",       [[0,69,0.102], [0.151,72,0.081], [0.248,76,0.112]]],
      ["packet",     [[0,79,0.149]]],
      ["chirp",      [[0,82,0.090], [0.114,76,0.177]]],
      ["scope",      [[0,75,0.147], [0.183,80,0.095]]],
      ["relay",      [[0,77,0.186]]],
      ["scanner",    [[0,80,0.274]]],
      ["interferer", [[0,74,0.182]]]
    ]
  ];

  function compose(edition) {
    const score = [];
    function add(kind, at, length, note, level, pan = 0) {
      const duration = Math.min(length, DURATION - 0.03 - at);
      if (duration > 0.025) score.push({ kind, at, duration, note, level, pan });
    }

    let bar = 0;
    for (const [name, span] of progression) {
      const harmony = chords[name];
      const chapter = Math.floor(bar / 9);
      const last = bar === 34;

      harmony.bed.forEach((note, i) => {
        const stagger = [0.03, 0.09, 0.18, 0.26][i];
        const length = span * BAR + (last ? -0.12 : 0.72) - stagger;
        const level = [0.041, 0.039, 0.049, 0.059][chapter] * [1.0, 0.74, 0.87, 0.74][i];
        add("pad", bar * BAR + stagger, length, note, level, [-0.58, 0.40, -0.23, 0.61][i]);
      });

      for (let repeat = 0; repeat < span; repeat++) {
        const measure = bar + repeat;
        const at = (beat, offset = 0) => measure * BAR + beat * BEAT + offset;
        const root = harmony.bass;
        if (chapter === 0 || measure >= 34) {
          if (repeat === 0) add("pedal", at(0), span * BAR + 0.25, root, last ? 0.128 : 0.080);
        } else {
          const pulses = measure >= 32 ? [0, 2.5] : chapter === 1 ? [0, 1.5, 3, 3.5] : [0, 0.75, 1.5, 2.5, 3.5];
          pulses.forEach((b, i) => {
            if (measure % 2 === 0 && i === pulses.length - 1) return;
            const jump = i === pulses.length - 1 && measure % 3 === 1 ? 12 : 0;
            const strength = (chapter === 1 ? 0.125 : 0.153) * [1, 0.64, 0.83, 0.69, 0.71][i];
            add("bass", at(b), (i === 0 ? 0.71 : 0.48) * BEAT, root + jump, strength);
          });
        }

        if (measure >= 5 && measure < 35) {
          const pattern = measure % 2 === 0 ? [0, 2, 1, 4, 2, 5, 3, 6] : [1, 3, 2, 5, 1, 4, 3, 7];
          for (let step = 0; step < 8; step++) {
            if (chapter === 0 && step !== 3 && step !== 6) continue;
            if ((chapter === 1 || measure >= 31) && step % 2 === 1 && step !== 3) continue;
            if (measure === 34 && step > 4) continue;
            const octave = measure === 34 ? 0 : chapter === 0 ? 12 : 0;
            const pan = [-0.46, 0.22, -0.13, 0.51, -0.32, 0.29, 0.07, -0.49][step];
            const level = [0.030, 0.068, 0.064, 0.058][chapter] * [0.95, 0.56, 0.69, 0.91, 0.71, 0.63, 0.84, 0.58][step];
            add("keys", at(step / 2, step % 2 ? 0.012 : 0), 0.75, harmony.arp[pattern[step]] + octave, level, pan);
          }
        }

        if (measure >= 12 && measure < 31) {
          const kicks = measure >= 29 ? [0] : chapter === 1 ? [0, 2.75] : (measure % 4 === 3 ? [0, 1.5, 2.75] : [0, 2.5]);
          kicks.forEach((b, i) => add("kick", at(b), 0.39, 0, i === 0 ? 0.275 : 0.202));
          if (measure >= 16) add("snare", at(2, 0.009), 0.27, 0, chapter === 1 ? 0.040 : 0.079, 0.12);
          const steps = chapter === 1 ? [1, 5] : [1, 3, 5, 6, 7];
          steps.forEach((step, i) => {
            const open = step === 7 && measure % 2 === 1;
            add("shaker", at(step / 2, 0.012), open ? 0.18 : 0.079, 0, i % 2 ? 0.032 : 0.026, step % 3 === 0 ? -0.52 : 0.44);
          });
        }
      }
      bar += span;
    }

    // Hand-phrased melody. Space between the statements belongs to the delay.
    const theme = [
      [1, 1.4, 71, 1.7], [3, 2.5, 67, 1.1], [5, 0.4, 69, 2.1], [7, 1.5, 66, 1.8],
      [10, 1.5, 71, 1.0], [12, 2, 74, 1.1], [14, 0.5, 69, 1.5], [16, 2.5, 66, 1.4],
      [18, 0.5, 71, 1.55], [18, 2.5, 67, 0.65], [19, 0, 64, 2.55],
      [20, 0.5, 69, 1.0], [20, 2, 71, 0.9], [21, 0, 74, 2.55],
      [22, 0.5, 76, 1.8], [22, 2.75, 74, 0.65], [23, 0, 71, 2.2],
      [24, 0.5, 69, 1.45], [24, 2.5, 66, 1.0], [25, 0, 64, 1.75], [26, 1, 66, 1.9],
      [27, 0.5, 71, 1.6], [27, 2.5, 74, 0.78], [28, 0, 76, 2.5],
      [29, 0.5, 74, 1.05], [29, 2, 71, 0.93], [30, 0, 69, 2.5],
      [31, 0.5, 66, 2.2], [32, 0.5, 64, 2.2], [33, 1, 63, 2.1],
      [34, 0.25, 68, 2.75], [35, 0, 64, 2.45]
    ];
    theme.forEach(([b, pulse, note, beats], i) => {
      const early = b < 18;
      add(early ? "beacon" : "lead", b * BAR + pulse * BEAT, beats * BEAT + 0.42, note,
        early ? 0.046 : 0.103, early ? (i % 2 ? -0.41 : 0.44) : -0.10 + (i % 3) * 0.08);
    });
    // The leading edge of the pressure wave reaches the lens as the hull clears the ring.
    add("transit", GATE_PASS - 0.10, 0.78, 0, 0.315, -0.86);
    // Filtered thruster passes sit beneath the score at the shot transitions.
    [[0.03, 5.1, 0.036, -0.42], [20.75, 4.6, 0.124, -0.22], [42.3, 5.8, 0.084, 0.27],
      [65.4, 4.05, 0.043, -0.20]].forEach(([t, d, volume, pan]) => {
      add("burn", t, d, 0, volume, pan);
    });
    // Thin the arrangement after the horizon opens, leaving the last sustained
    // harmony and the two drives audible on the pullback.
    for (const e of score) e.level *= 1 - 0.32 * clamp((e.at - 67.5) / 18, 0, 1);
    for (const m of calls) add("radio", m.at, m.duration, m.id, m.level, stations[m.station].pan);

    for (const note of openingCall) add("link", note.at, note.length, note.note, 0.087, -0.19);
    signalPrograms[edition].forEach(([kind, notes], i) => {
      const [t, level, pan] = signalSlots[i];
      for (const [offset, note, length] of notes) add(kind, t + offset, length, note, level, pan);
    });
    return score.sort((a, b) => a.at - b.at);
  }

  // Restore the current point on an envelope when starting in the middle of a note.
  function automate(param, points, skip, at, exponential = false) {
    let value = points[0][1];
    for (let i = 0; i < points.length; i++) {
      const [x, y] = points[i];
      if (x <= skip) { value = y; continue; }
      if (i > 0) {
        const [prevX, prevY] = points[i - 1];
        const f = (skip - prevX) / (x - prevX);
        value = exponential ? prevY * (y / prevY) ** f : prevY + (y - prevY) * f;
      }
      break;
    }
    param.setValueAtTime(value, at);
    for (const [x, y] of points) {
      if (x <= skip) continue;
      const end = at + x - skip;
      if (exponential) param.exponentialRampToValueAtTime(y, end);
      else param.linearRampToValueAtTime(y, end);
    }
  }

  function randomSequence(seed) {
    return () => {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      return seed / 4294967296 * 2 - 1;
    };
  }

  function soundbank(ctx) {
    const random = randomSequence(7163);
    const noise = ctx.createBuffer(1, Math.ceil(ctx.sampleRate * 2.1), ctx.sampleRate);
    const data = noise.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = random();

    const impulse = ctx.createBuffer(2, Math.ceil(ctx.sampleRate * 2.15), ctx.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const channel = impulse.getChannelData(ch);
      let dark = 0;
      for (let i = Math.ceil(0.021 * ctx.sampleRate); i < channel.length; i++) {
        const seconds = i / ctx.sampleRate;
        dark = 0.56 * dark + 0.44 * random();
        channel[i] = dark * Math.exp(-seconds * 3.05) * Math.min(1, seconds * 12);
      }
    }
    const wave = harmonics => ctx.createPeriodicWave(new Float32Array(harmonics.length), new Float32Array(harmonics));
    return {
      noise, impulse, radio: [],
      ion: wave([0, 1, 0.40, 0.48, 0.17, 0.23, 0.12, 0.105, 0.087, 0.069, 0.06, 0.04, 0.026]),
      string: wave([0, 1, 0.49, 0.38, 0.21, 0.19, 0.13, 0.105, 0.075, 0.064, 0.045, 0.038, 0.03, 0.02]),
      bass: wave([0, 1, 0.68, 0.36, 0.19, 0.14, 0.081, 0.051, 0.041]),
      brass: wave([0, 1, 0.38, 0.23, 0.11, 0.086, 0.058, 0.040, 0.023])
    };
  }

  // Each nozzle has a detuned electric rotor, ion filament, filtered exhaust
  // and a slow vibration. The camera moves the sources continuously in the mix.
  class IonDrive {
    constructor(ctx, bank, bus, from, at, end, view) {
      this.ctx = ctx;
      this.nodes = [];
      this.sources = [];
      this.lastUpdate = -Infinity;
      const keep = node => { this.nodes.push(node); return node; };
      const outlet = keep(ctx.createGain());
      outlet.connect(bus);
      automate(outlet.gain, [[0,1], [GATE_PASS - 0.46,1], [GATE_PASS - 0.34,0.53],
        [GATE_PASS - 0.08,0.53], [GATE_PASS + 0.15,1]], from, at);
      this.units = [-1,1].map(side => {
        const level = keep(ctx.createGain()), pan = keep(ctx.createStereoPanner());
        level.connect(pan).connect(outlet);
        const hull = keep(ctx.createBiquadFilter());
        hull.type = "lowpass"; hull.Q.value = 0.56; hull.connect(level);
        const vibration = keep(ctx.createGain()); vibration.gain.value = 0.87; vibration.connect(hull);
        const rotor = keep(ctx.createOscillator()); rotor.setPeriodicWave(bank.ion); rotor.connect(vibration);
        const filament = keep(ctx.createOscillator()); filament.type = "triangle";
        const plasma = keep(ctx.createGain()); filament.connect(plasma).connect(vibration);
        const motion = keep(ctx.createOscillator()), depth = keep(ctx.createGain());
        motion.connect(depth).connect(vibration.gain);
        const wind = keep(ctx.createBufferSource()); wind.buffer = bank.noise; wind.loop = true;
        const jet = keep(ctx.createBiquadFilter()); jet.type = "bandpass"; jet.Q.value = 0.72;
        const hiss = keep(ctx.createGain()); wind.connect(jet).connect(hiss).connect(hull);
        this.sources.push(rotor, filament, motion, wind);
        rotor.start(at); filament.start(at); motion.start(at);
        wind.start(at, (from + (side < 0 ? 0.18 : 1.19)) % bank.noise.duration);
        return { side, level, pan, hull, rotor, filament, plasma, motion, depth, jet, hiss };
      });
      this.move(view, at, true);
      this.stop(end + 0.02);
    }

    move(view, at, initial = false) {
      if (!initial && at - this.lastUpdate < 0.028) return;
      this.lastUpdate = at;
      const thrust = clamp(view.thrust, 0, 1), rear = 0.5 + 0.5 * clamp(view.aft, -1, 1);
      const metres = clamp(view.distance, 1, 500);
      const near = Math.min(1.10, 12 / Math.sqrt(metres * metres + 42));
      const doppler = 175 / (175 + clamp(view.radialSpeed, -27, 30));
      const spread = clamp(3.3 / metres, 0.035, 0.39);
      const set = (param, value) => {
        if (initial) param.setValueAtTime(value, at);
        else param.setTargetAtTime(value, at, 0.063);
      };
      for (const u of this.units) {
        const wobble = Math.sin(view.time * 0.73 + 0.83 * u.side);
        const body = (52 + 26 * thrust + 0.52 * wobble) * doppler * (1 + 0.013 * u.side);
        set(u.rotor.frequency, body);
        set(u.filament.frequency, body * (6.34 + 0.066 * u.side + 0.30 * thrust));
        set(u.motion.frequency, 3.9 + 3.5 * thrust + 0.42 * u.side);
        set(u.depth.gain, 0.073 + thrust * 0.072);
        set(u.pan.pan, clamp(view.pan + u.side * spread * (0.55 + 0.45 * Math.abs(view.aft)), -0.96, 0.96));
        set(u.level.gain, near * (0.078 + 0.063 * thrust) * (0.64 + 0.39 * rear));
        set(u.hull.frequency, (470 + 1250 * rear + 530 * thrust) * (0.64 + near * 0.48));
        set(u.plasma.gain, (0.083 + 0.16 * thrust) * (0.24 + 0.76 * rear * rear));
        set(u.jet.frequency, (320 + 965 * rear + 590 * thrust) * doppler);
        set(u.hiss.gain, (0.23 + 0.49 * thrust) * (0.28 + 0.72 * rear));
      }
    }

    stop(at) { this.sources.forEach(node => { try { node.stop(at); } catch (_) {} }); }
    disconnect() { this.nodes.forEach(node => node.disconnect()); }
  }

  class Voice {
    constructor(ctx, bank, run, event, at, skip) {
      this.ctx = ctx;
      this.bank = bank;
      this.run = run;
      this.at = at;
      this.skip = skip;
      this.duration = event.duration;
      this.nodes = [];
      this.sources = [];
      this.envelope = this.keep(ctx.createGain());
      this.pan = this.keep(ctx.createStereoPanner());
      this.pan.pan.value = event.pan;
      this.envelope.connect(this.pan);
      const pulse = event.kind === "bass" || event.kind === "kick";
      this.pan.connect(pulse ? run.lowPulse : run.bus);
      this.input = this.envelope;
    }

    keep(node) { this.nodes.push(node); return node; }

    curve(param, points, exponential = false) {
      automate(param, points, this.skip, this.at, exponential);
    }

    shape(level, points) {
      this.curve(this.envelope.gain, points.map(([x, y]) => [x * this.duration, level * y]));
    }

    filter(type, cutoff, q = 0.6) {
      const filter = this.keep(this.ctx.createBiquadFilter());
      filter.type = type;
      filter.frequency.value = cutoff;
      filter.Q.value = q;
      filter.connect(this.input);
      this.input = filter;
      return filter;
    }

    tone(type, frequency, mix = 1, detune = 0, destination = this.input) {
      const osc = this.keep(this.ctx.createOscillator());
      if (typeof type === "string") osc.type = type;
      else osc.setPeriodicWave(type);
      osc.frequency.value = frequency;
      osc.detune.value = detune;
      if (mix === 1) osc.connect(destination);
      else {
        const volume = this.keep(this.ctx.createGain());
        volume.gain.value = mix;
        osc.connect(volume).connect(destination);
      }
      this.sources.push([osc, 0]);
      return osc;
    }

    noise(offset) {
      const source = this.keep(this.ctx.createBufferSource());
      source.buffer = this.bank.noise;
      source.loop = true;
      source.connect(this.input);
      this.sources.push([source, (offset + this.skip) % source.buffer.duration]);
    }

    play() {
      let live = this.sources.length;
      this.run.voices.add(this);
      const end = this.at + this.duration - this.skip + 0.012;
      for (const [source, offset] of this.sources) {
        source.onended = () => {
          if (--live !== 0) return;
          this.run.voices.delete(this);
          this.nodes.forEach(node => node.disconnect());
        };
        if (source.buffer) source.start(this.at, offset);
        else source.start(this.at);
        source.stop(end);
      }
    }

    stop(at) {
      this.sources.forEach(([source]) => { try { source.stop(at); } catch (_) {} });
    }
  }

  function playNote(ctx, bank, run, e, at, skip) {
    const v = new Voice(ctx, bank, run, e, at, skip);
    const d = e.duration;
    const freq = hz(e.note);
    const daylight = clamp(e.at / 75, 0, 1);
    if (["pad", "keys", "beacon", "lead", "snare", "burn", "transit"].includes(e.kind)) v.pan.connect(run.space);
    if (["keys", "beacon", "lead"].includes(e.kind)) v.pan.connect(run.echo);

    switch (e.kind) {
      case "pad": {
        const f = v.filter("lowpass", 600);
        v.curve(f.frequency, [[0, 280 + 280 * daylight], [d * 0.45, 670 + 1950 * daylight], [d, 430 + 620 * daylight]], true);
        const left = v.tone(bank.string, freq, 0.79, -3);
        v.tone("triangle", freq, 0.43, 4.8);
        v.curve(left.detune, [[0, -4.7], [d * 0.52, -1.8], [d, -5.4]]);
        v.shape(e.level, [[0, 0], [0.14, 0.84], [0.35, 1], [0.77, 0.86], [1, 0]]);
        break;
      }
      case "pedal":
      case "bass": {
        const plucked = e.kind === "bass";
        const f = v.filter("lowpass", 240);
        v.curve(f.frequency, [[0, plucked ? 540 : 135], [d * 0.28, plucked ? 290 : 220], [d, 110]], true);
        v.tone(bank.bass, freq);
        v.shape(e.level, plucked ? [[0, 0], [0.06, 1], [0.34, 0.73], [0.69, 0.52], [1, 0]]
          : [[0, 0], [0.13, 0.83], [0.32, 1], [0.79, 0.83], [1, 0]]);
        break;
      }
      case "keys":
      case "beacon": {
        const soft = e.kind === "beacon";
        v.filter("lowpass", soft ? 1750 : 3050, 0.46);
        v.tone("triangle", freq, 0.79);
        v.tone("sine", freq * (soft ? 2.003 : 2.997), soft ? 0.23 : 0.20);
        v.shape(e.level, [[0, 0], [soft ? 0.11 : 0.015, 1], [0.22, 0.49], [0.66, 0.105], [1, 0]]);
        break;
      }
      case "lead": {
        const f = v.filter("lowpass", 1250, 0.51);
        v.curve(f.frequency, [[0, 760], [d * 0.24, 2650], [d * 0.72, 2080], [d, 1120]], true);
        const core = v.tone(bank.brass, freq, 0.86);
        const octave = v.tone("sine", freq * 2, 0.17, 2.1);
        v.curve(core.detune, [[0, -43], [0.091, 1], [d, -1]]);
        const wobble = v.keep(ctx.createGain());
        v.curve(wobble.gain, [[0, 0], [d * 0.30, 0.7], [d * 0.78, 6.2], [d, 3.2]]);
        wobble.connect(core.detune);
        wobble.connect(octave.detune);
        v.tone("sine", 4.45, 1, 0, wobble);
        v.shape(e.level, [[0, 0], [0.094, 0.83], [0.25, 1], [0.66, 0.84], [1, 0]]);
        break;
      }
      case "kick": {
        const core = v.tone("sine", 55);
        v.curve(core.frequency, [[0, 132], [0.034, 66], [0.131, 48], [d, 40]], true);
        v.shape(e.level, [[0, 0], [0.015, 1], [0.23, 0.76], [0.63, 0.25], [1, 0]]);
        break;
      }
      case "snare":
      case "shaker": {
        const snare = e.kind === "snare";
        if (snare) v.tone("triangle", 187, 0.30);
        v.filter(snare ? "bandpass" : "highpass", snare ? 2210 : 6300, snare ? 0.67 : 0.48);
        v.noise(e.at * 0.37);
        v.shape(e.level, [[0, 0], [0.023, 1], [0.12, 0.67], [0.39, 0.24], [1, 0]]);
        break;
      }
      case "radio": {
        if (!bank.radio[e.note]) bank.radio[e.note] = radioBuffer(ctx, calls[e.note]);
        const source = v.keep(ctx.createBufferSource());
        source.buffer = bank.radio[e.note];
        source.connect(v.input);
        v.sources.push([source, skip]);
        v.envelope.gain.value = e.level;
        break;
      }
      case "link": {
        const osc = v.tone("sine", freq);
        v.tone("sine", freq * 2.005, 0.18);
        v.curve(osc.frequency, [[0, freq * 0.97], [0.022, freq], [d, freq]], true);
        v.shape(e.level, [[0,0], [0.09,1], [0.60,0.71], [1,0]]);
        break;
      }
      case "scope": {
        const carrier = v.tone("sine", freq), index = v.keep(ctx.createGain());
        index.connect(carrier.frequency);
        v.curve(index.gain, [[0, freq * 0.42], [d * 0.30, freq * 0.18], [d, 0]]);
        v.tone("sine", freq * 1.51, 1, 0, index);
        v.curve(carrier.frequency, [[0, freq * 1.12], [d * 0.55, freq * 0.98], [d, freq * 0.89]], true);
        v.shape(e.level, [[0,0], [0.055,1], [0.34,0.47], [1,0]]);
        break;
      }
      case "relay": {
        v.filter("lowpass", 2350, 0.70);
        v.tone("triangle", freq);
        v.tone("sine", freq * 2.73, 0.21);
        v.shape(e.level, [[0,0], [0.055,1], [0.30,0.69], [1,0]]);
        break;
      }
      case "bell": {
        const shimmer = v.keep(ctx.createGain());
        shimmer.connect(v.input);
        v.curve(shimmer.gain, [[0,0.55], [d*0.21,0.22], [d,0.012]]);
        v.tone("sine", freq, 0.80);
        v.tone("sine", freq*2.39, 0.75, 0, shimmer);
        v.tone("sine", freq*3.71, 0.35, 0, shimmer);
        v.shape(e.level, [[0,0], [0.035,1], [0.20,0.68], [0.58,0.22], [1,0]]);
        break;
      }
      case "chirp": {
        const throat = v.filter("bandpass", freq*1.33, 1.02);
        const osc = v.tone("sawtooth", freq);
        v.curve(osc.frequency, [[0,freq*0.65], [d*0.37,freq*1.04], [d*0.76,freq*1.40], [d,freq*1.36]], true);
        v.curve(throat.frequency, [[0,freq*0.95], [d,freq*2.4]], true);
        v.shape(e.level*1.12, [[0,0], [0.11,0.65], [0.54,1], [0.84,0.63], [1,0]]);
        break;
      }
      case "packet": {
        v.filter("lowpass", 2480, 0.60);
        const bit = v.tone("square", freq, 0.70);
        v.curve(bit.frequency, [[0,freq], [d*0.40,freq], [d*0.44,freq*1.27], [d*0.71,freq*1.27], [d,freq*1.12]]);
        v.shape(e.level, [[0,0], [0.04,0.92], [0.33,0.72], [0.42,0.10], [0.49,0.91], [0.80,0.72], [1,0]]);
        break;
      }
      case "reed": {
        const mellow = v.filter("lowpass", 980, 0.72);
        v.curve(mellow.frequency, [[0,820], [d*0.41,1880], [d,780]], true);
        v.tone(bank.brass, freq, 0.81);
        v.tone("triangle", freq*1.498, 0.32);
        v.shape(e.level, [[0,0], [0.22,0.76], [0.46,1], [0.77,0.58], [1,0]]);
        break;
      }
      case "contact": {
        const coil = v.tone("triangle", freq*0.53, 0.69);
        v.curve(coil.frequency, [[0,freq*0.84], [d*0.18,freq*0.51], [d,freq*0.46]], true);
        v.filter("bandpass", 1850, 0.74);
        v.noise(0.37+e.at);
        v.shape(e.level*1.20, [[0,0], [0.034,1], [0.15,0.46], [0.41,0.13], [1,0]]);
        break;
      }
      case "interferer": {
        v.tone("sine", freq*0.995, 0.65);
        const other = v.tone("sine", freq, 0.48);
        v.curve(other.frequency, [[0,freq+36], [d*0.65,freq+9], [d,freq+3]], true);
        v.shape(e.level, [[0,0], [0.12,0.87], [0.37,1], [0.78,0.43], [1,0]]);
        break;
      }
      case "scanner": {
        const edge = v.tone("sine", freq, 0.55);
        v.curve(edge.frequency, [[0,freq*1.47], [d*0.48,freq*1.15], [d,freq*0.74]], true);
        const air = v.filter("bandpass", 2450, 1.42);
        v.curve(air.frequency, [[0,3300], [d*0.45,2010], [d,710]], true);
        v.noise(0.59+e.at);
        v.shape(e.level*1.20, [[0,0], [0.075,1], [0.32,0.76], [0.75,0.31], [1,0]]);
        break;
      }
      case "transit": {
        // The rising whistle and air arrive from port. A short FM ring gives
        // the near-field attack a metal edge as the pressure falls to starboard.
        const pressure = v.tone("sine", 110, 0.56);
        v.curve(pressure.frequency, [[0, 138], [0.10, 88], [0.26, 51], [d, 33]], true);
        const shell = v.tone("sine", 515, 0.28);
        v.curve(shell.frequency, [[0, 631], [0.10, 513], [0.25, 378], [d, 248]], true);
        const modulation = v.keep(ctx.createGain());
        modulation.connect(shell.frequency);
        v.curve(modulation.gain, [[0, 8], [0.076, 15], [0.10, 318], [0.21, 75], [d, 0]]);
        v.tone("sine", 337, 1, 0, modulation);
        const air = v.filter("bandpass", 380, 0.66);
        v.curve(air.frequency, [[0, 380], [0.10, 3400], [0.25, 1160], [d, 235]], true);
        v.noise(e.at + 0.87);
        v.curve(v.pan.pan, [[0, e.pan], [0.055, -0.69], [0.10, -0.04], [0.19, 0.62], [0.38, 0.88], [d, 0.94]]);
        v.shape(e.level, [[0, 0], [0.062, 0.24], [0.128, 1], [0.21, 0.65], [0.44, 0.26], [0.78, 0.08], [1, 0]]);
        break;
      }
      case "burn": {
        const engine = v.tone("sine", 52, 0.35);
        v.curve(engine.frequency, [[0, 39], [d * 0.49, 63], [d, 32]], true);
        const f = v.filter("bandpass", 250, 0.52);
        v.curve(f.frequency, [[0, 85], [d * 0.54, 1560], [d, 170]], true);
        v.noise(0.29 + e.at);
        v.curve(v.pan.pan, [[0, e.pan], [d, -e.pan]]);
        v.shape(e.level, [[0, 0], [0.34, 0.33], [0.56, 1], [0.72, 0.71], [1, 0]]);
        break;
      }
    }
    v.play();
  }

  class PenumbraScore {
    constructor() {
      this.edition = 0;
      this.events = compose(this.edition);
      this.ctx = null;
      this.run = null;
      this.pending = null;
      this.muted = false;
      this.engineView = { time: 0, thrust: 0.22, distance: 20, pan: 0, aft: 0, radialSpeed: 0 };
    }

    async unlock() {
      try {
        if (!this.ctx) {
          const Audio = window.AudioContext || window.webkitAudioContext;
          if (!Audio) return false;
          this.prepare(new Audio({ latencyHint: "interactive" }));
        }
        if (this.ctx.state !== "running") await this.ctx.resume();
        if (this.pending !== null) {
          const from = this.pending;
          this.pending = null;
          this.begin(from);
        }
        return true;
      } catch (_) {
        return false;
      }
    }

    prepare(ctx) {
      this.ctx = ctx;
      this.bank = soundbank(ctx);
      this.master = ctx.createGain();
      this.master.gain.value = this.muted ? 0 : 0.92;
      const highpass = ctx.createBiquadFilter();
      highpass.type = "highpass";
      highpass.frequency.value = 24;
      highpass.Q.value = 0.57;
      const compressor = ctx.createDynamicsCompressor();
      compressor.threshold.value = -13;
      compressor.knee.value = 8;
      compressor.ratio.value = 2.3;
      compressor.attack.value = 0.018;
      compressor.release.value = 0.22;
      highpass.connect(compressor).connect(this.master).connect(ctx.destination);
      this.output = highpass;
    }

    // The picture waits for the last note to reach the audio output.
    static get openingCallEnd() {
      const last = openingCall[openingCall.length - 1];
      return last.at + last.length;
    }

    audibleTime() {
      if (!this.run || this.ctx.state !== "running") return null;
      const stamp = this.ctx.getOutputTimestamp?.();
      const head = stamp?.contextTime > 0 ? stamp.contextTime :
        this.ctx.currentTime - (this.ctx.outputLatency || this.ctx.baseLatency || 0);
      return head - this.run.zero;
    }

    nextScreening() {
      this.edition = (this.edition + 1) % signalPrograms.length;
      this.events = compose(this.edition);
    }

    setEngineView(view) {
      if (!view) return;
      // The camera reuses a single object; preserve the last individual values while paused.
      for (const key in this.engineView) {
        if (Number.isFinite(view[key])) this.engineView[key] = view[key];
      }
      if (this.run) this.run.engine.move(this.engineView, this.ctx.currentTime);
    }

    setMuted(muted) {
      this.muted = Boolean(muted);
      if (this.master) this.master.gain.setTargetAtTime(this.muted ? 0 : 0.92, this.ctx.currentTime, 0.013);
    }

    start(timeSeconds = 0) {
      this.pause();
      const from = clamp(Number(timeSeconds) || 0, 0, DURATION);
      if (from >= DURATION) return;
      if (this.ctx && this.ctx.state === "running") this.begin(from);
      else {
        this.pending = from;
        void this.unlock();
      }
    }

    begin(from) {
      const ctx = this.ctx;
      const at = ctx.currentTime + 0.012;
      const bus = ctx.createGain();
      bus.connect(this.output);
      const end = at + DURATION - from;
      const fade = Math.min(0.055, (end - at) * 0.2);
      bus.gain.setValueAtTime(0, at);
      bus.gain.linearRampToValueAtTime(Math.min(1, (end - at - fade) / 1.2), at + fade);
      if (end - 1.2 > at + fade) bus.gain.setValueAtTime(1, end - 1.2);
      bus.gain.linearRampToValueAtTime(0, end);

      // Duck only the rhythm section for the half-second of negative space
      // before the crossing. This envelope uses film time, including after a seek.
      const lowPulse = ctx.createGain();
      lowPulse.connect(bus);
      automate(lowPulse.gain, [[0, 1], [GATE_PASS - 0.48, 1], [GATE_PASS - 0.41, 0.075],
        [GATE_PASS - 0.08, 0.075], [GATE_PASS, 1]], from, at);

      const space = ctx.createGain();
      space.gain.value = 0.29;
      const reverb = ctx.createConvolver();
      reverb.buffer = this.bank.impulse;
      const air = ctx.createBiquadFilter();
      air.type = "highpass";
      air.frequency.value = 230;
      space.connect(reverb).connect(air).connect(bus);

      const echo = ctx.createBiquadFilter();
      echo.type = "lowpass";
      echo.frequency.value = 2600;
      const fx = [lowPulse, space, reverb, air, echo];
      for (const [beats, side, strength] of [[0.75, -0.67, 0.215], [1.50, 0.71, 0.145], [2.25, -0.37, 0.073]]) {
        const delay = ctx.createDelay(1.5);
        delay.delayTime.value = BEAT * beats;
        const tap = ctx.createGain();
        tap.gain.value = strength;
        const pan = ctx.createStereoPanner();
        pan.pan.value = side;
        echo.connect(delay).connect(tap).connect(pan).connect(bus);
        fx.push(delay, tap, pan);
      }

      const run = { bus, lowPulse, space, echo, fx, from, zero: at - from, index: 0, events: this.events, voices: new Set(), timer: null };
      run.engine = new IonDrive(ctx, this.bank, bus, from, at, end, this.engineView);
      this.run = run;
      this.queue(run, from + 0.32);
      run.timer = window.setInterval(() => {
        if (this.run !== run) return;
        const now = ctx.currentTime - run.zero;
        if (now >= DURATION) this.pause();
        else this.queue(run, now + 0.32);
      }, 72);
    }

    queue(run, through) {
      const now = Math.max(run.from, this.ctx.currentTime - run.zero);
      while (run.index < run.events.length && run.events[run.index].at <= through) {
        const e = run.events[run.index++];
        const skip = Math.max(0, now - e.at);
        if (skip + 0.022 >= e.duration) continue;
        playNote(this.ctx, this.bank, run, e, run.zero + e.at + skip, skip);
      }
    }

    pause() {
      this.pending = null;
      const run = this.run;
      if (!run) return;
      this.run = null;
      window.clearInterval(run.timer);
      const now = this.ctx.currentTime;
      const g = run.bus.gain;
      if (g.cancelAndHoldAtTime) g.cancelAndHoldAtTime(now);
      else {
        const level = g.value;
        g.cancelScheduledValues(now);
        g.setValueAtTime(level, now);
      }
      g.linearRampToValueAtTime(0, now + 0.033);
      run.voices.forEach(voice => voice.stop(now + 0.037));
      run.engine.stop(now + 0.037);
      // Disconnect after the fade so a seek also clears the old reverb and delay.
      window.setTimeout(() => {
        run.bus.disconnect();
        run.engine.disconnect();
        run.fx.forEach(node => node.disconnect());
      }, 90);
    }
  }

  window.PenumbraScore = PenumbraScore;
})();
