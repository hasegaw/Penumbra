(function () {
  "use strict";
  const DURATION=90;
  const CHAPTER_LENGTH=22.5;
  const names=["NIGHTSIDE","IGNITION","FIRST LIGHT","SUNWARD"];
  const byId=id=>document.getElementById(id);
  const cinema=byId("cinema"), stage=byId("stage"), view=byId("view"), hdr=byId("hdr-view");
  const seek=byId("seek"), elapsed=byId("elapsed"), transport=byId("transport");
  const titleCard=byId("title-card");
  const shutter=byId("play-shutter");
  const openingOpacity=window.PenumbraDisplay?.openingOpacity;
  let fadeOut=null, revealing=false;
  const credit=byId("film-credit");
  const creditArt=window.PenumbraDisplay?.title;
  const masthead=cinema.querySelector(".masthead"), deck=cinema.querySelector(".deck");
  const chapters=Array.from(document.querySelectorAll(".chapter"));
  const reduction=window.matchMedia("(prefers-reduced-motion: reduce)");
  const score=new window.PenumbraScore();
  let state="intro", position=0, startedAt=0, audioSession=0, muted=false;
  let film=null, contextLost=false, currentChapter=-1, currentStill="";
  let scrubbing=false, resumeAfterScrub=false, dirty=true, quality=1;
  let lastDraw=-Infinity, performanceStart=0, renderedFrames=0, noticeTimer=0;
  let pointerX=0, pointerY=0, driftX=0, driftY=0;
  let mouseY=null, keyboardNavigation=false, touchControls=false, touchTimer=0, touchOrigin=null, selectionTimer=0;

  const clamp=t=>Math.max(0,Math.min(DURATION,t));
  const now=()=>performance.now();
  const filmTime=(stamp=now())=>state==="playing"?clamp(position+(stamp-startedAt)/1000):position;
  function clock(t) {
    const secs=Math.floor(t+.00001);
    return String(Math.floor(secs/60)).padStart(2,"0")+":"+String(secs%60).padStart(2,"0");
  }
  function notice(message, keep=false) {
    clearTimeout(noticeTimer);
    byId("notice").textContent=message;
    byId("notice").hidden=!message;
    if (message && !keep) noticeTimer=setTimeout(()=>byId("notice").hidden=true,4800);
  }
  function setMode(mode) {
    const tag=byId("display-mode");
    tag.textContent=mode;
    tag.dataset.hdr=String(mode==="HDR");
    tag.title=mode==="HDR"?"High dynamic range output":"Standard dynamic range output";
    dirty=true;
  }
  function stateTo(next) {
    state=next;
    cinema.dataset.state=state;
    const playing=state==="playing";
    byId("transport-icon").className=playing?"pause-shape":"play-shape";
    transport.setAttribute("aria-label",playing?"Pause (Space)":"Play (Space)");
    const covered=state==="intro" || state==="ended";
    titleCard.inert=!covered;
    if (!playing) {
      clearTimeout(touchTimer);
      touchControls=false;
    }
    if (!covered) pointerX=pointerY=driftX=driftY=0;
    updateChrome();
    byId("launch-label").textContent=state==="ended"?"REPLAY FILM":"PLAY FILM";
    document.querySelector(".overline").lastChild.textContent=state==="ended"?" END OF TRANSMISSION":" AN ORBITAL SHORT FILM";
    dirty=true;
  }
  function drawFilmTitle(time) {
    // A tab can span a deployment. An older document or compositor has no credit.
    if (!credit || !creditArt) return;
    const alpha = (state==="playing" || state==="paused") ? creditArt.opacityAt(time) : 0;
    if (alpha <= 0) {
      if (!credit.hidden) credit.hidden = true;
      return;
    }
    const pixelRatio = Math.min(devicePixelRatio || 1, 2);
    const width = Math.max(1, Math.round(stage.clientWidth*pixelRatio));
    const height = Math.max(1, Math.round(stage.clientHeight*pixelRatio));
    if (credit.width!==width || credit.height!==height) {
      credit.width = width;
      credit.height = height;
      creditArt.paint(credit);
    }
    credit.style.opacity = alpha.toFixed(3);
    credit.hidden = false;
  }
  function clearShutter() {
    if (fadeOut) fadeOut.cancel();
    fadeOut=null;
    revealing=false;
    if (shutter) shutter.hidden=true;
  }
  function revealShip(t) {
    if (!revealing) return;
    const audible=score.audibleTime?.();
    // A stalled output clock must still allow the silent picture to run.
    const cue=Number.isFinite(audible) ? Math.max(t-.5, Math.min(t,audible)) : t;
    const opacity=openingOpacity(cue,window.PenumbraScore.openingCallEnd ?? .55);
    shutter.style.opacity=String(opacity);
    if (opacity===0) clearShutter();
  }
  function drawControls(t) {
    revealShip(t);
    drawFilmTitle(t);
    const chapter=Math.min(3,Math.floor(t/CHAPTER_LENGTH));
    if (chapter!==currentChapter) {
      currentChapter=chapter;
      chapters.forEach((el,i)=>{
        el.classList.toggle("current",i===chapter);
        if (i===chapter) el.setAttribute("aria-current","true");
        else el.removeAttribute("aria-current");
      });
      byId("caption-number").textContent="0"+(chapter+1);
      byId("caption-name").textContent=names[chapter];
    }
    if (!film || contextLost) {
      const portrait = matchMedia("(max-aspect-ratio: 4/5)").matches;
      let still = "scene-0" + (chapter+1);
      if (state === "intro") still = portrait ? "loading-ship-portrait" : "poster";
      else if (chapter === 0) {
        if (t < 12.5) still = portrait ? "nightside-portrait" : "scene-01";
        else still = portrait ? "opening-wide-portrait" : "opening-wide";
      }
      if (currentStill !== still) {
        stage.style.backgroundImage = "url('./assets/stills/"+still+".webp')";
        currentStill = still;
      }
      const boundary = Math.abs(t-12.5)<.8 ? 12.5 : Math.round(t/CHAPTER_LENGTH)*CHAPTER_LENGTH;
      const offset = t-boundary;
      const distance = Math.min(1, Math.abs(offset)/(offset<0?.6:.78));
      let opacity = boundary>0 && boundary<DURATION ? 1-distance*distance*(3-2*distance) : 0;
      if (boundary === 12.5) opacity *= .22;
      stage.style.setProperty("--still-shutter", String(opacity));
    }
    elapsed.textContent=clock(t);
    if (!scrubbing) seek.value=String(t);
    seek.style.setProperty("--played",(t/DURATION*100).toFixed(3)+"%");
    const seconds=Math.floor(t);
    const spoken=seconds+(seconds===1?" second":" seconds");
    if (seek.getAttribute("aria-valuetext")!==spoken) seek.setAttribute("aria-valuetext",spoken);
  }
  async function playAt(t) {
    if (document.documentElement.classList.contains("film-loading")) return;
    const target=t>=DURATION ? 0 : clamp(t);
    if (fadeOut && target===0) return;
    const session=++audioSession;
    clearShutter();
    const replay=state==="ended" && target===0;
    score.pause();
    if (target===0 && shutter && openingOpacity) {
      shutter.style.opacity="0";
      shutter.hidden=false;
      fadeOut=shutter.animate([{opacity:0},{opacity:1}],
        {duration:500,easing:"ease-in-out",fill:"forwards"});
    }
    // Unlock inside the initiating gesture, even when the first shot starts later.
    const audio=score.unlock();
    if (fadeOut) {
      // Keep the outgoing picture and layout until black. A blocked audio device
      // can delay the cut briefly, but never strand the viewer in the dark.
      let deadline;
      const timeout=new Promise(resolve=>{deadline=setTimeout(resolve,1500);});
      await Promise.all([fadeOut.finished.catch(()=>{}),Promise.race([audio,timeout])]);
      clearTimeout(deadline);
      if (session!==audioSession) return;
      shutter.style.opacity="1";
      fadeOut.cancel();
      fadeOut=null;
      revealing=true;
    }
    if (replay) score.nextScreening?.();
    position=target;
    startedAt=now();
    stateTo("playing");
    drawControls(position);
    const unlocked=await audio;
    if (session!==audioSession || state!=="playing") return;
    if (unlocked) score.start(filmTime());
    else notice("Audio could not start. Use the sound control to try again.");
  }
  function hold(at=filmTime()) {
    position=clamp(at);
    ++audioSession;
    clearShutter();
    score.pause();
    stateTo(position>=DURATION?"ended":"paused");
    drawControls(position);
  }
  function toggle() {
    if (state==="playing" || fadeOut) hold();
    else void playAt(state==="ended"?0:position);
  }
  function jump(to, continuePlaying) {
    const target=clamp(to);
    if (target>=DURATION || !continuePlaying) hold(target);
    else void playAt(target);
  }
  byId("launch").addEventListener("click",()=>{
    void playAt(state==="ended"?0:position);
    stage.focus({preventScroll:true});
  });
  transport.addEventListener("click",toggle);
  chapters.forEach((el,i)=>el.addEventListener("click",()=>jump(i*CHAPTER_LENGTH,true)));
  // Once a shot is selected, a parked mouse can watch it too. Actual movement
  // at the controls immediately recalls the deck.
  deck.addEventListener("click",event=>{
    if (state!=="playing" || mouseY===null || !event.detail || !event.target.closest("button")) return;
    clearTimeout(selectionTimer);
    selectionTimer=setTimeout(()=>{mouseY=null;updateChrome();},1100);
  });

  seek.addEventListener("input",()=>{
    if (!scrubbing) {
      scrubbing=true;
      resumeAfterScrub=state==="playing";
    }
    hold(Number(seek.value));
  });
  function finishScrub() {
    if (!scrubbing) return;
    scrubbing=false;
    const target=Number(seek.value);
    jump(target,resumeAfterScrub);
  }
  seek.addEventListener("change",finishScrub);
  seek.addEventListener("pointercancel",finishScrub);
  seek.addEventListener("blur",finishScrub);

  function toggleSound() {
    muted=!muted;
    score.setMuted(muted);
    byId("sound").setAttribute("aria-pressed",String(muted));
    byId("sound").setAttribute("aria-label",muted?"Unmute sound (M)":"Mute sound (M)");
    byId("sound-text").textContent=muted?"SOUND OFF":"SOUND ON";
    if (!muted && state==="playing") void playAt(filmTime());
  }
  byId("sound").addEventListener("click",toggleSound);
  const full=byId("fullscreen");
  const isFull=()=>Boolean(document.fullscreenElement || document.webkitFullscreenElement);
  async function toggleFull() {
    try {
      if (isFull()) {
        const exit=document.exitFullscreen || document.webkitExitFullscreen;
        if (exit) await exit.call(document);
      } else {
        const enter=cinema.requestFullscreen || cinema.webkitRequestFullscreen;
        if (enter) await enter.call(cinema);
      }
    } catch (_) { notice("Fullscreen is unavailable in this window."); }
  }
  full.hidden=!(cinema.requestFullscreen || cinema.webkitRequestFullscreen);
  full.addEventListener("click",toggleFull);
  function updateChrome() {
    const projecting=state==="playing" && !scrubbing;
    let nearHeader=false, nearDeck=false;
    if (projecting && mouseY!==null) {
      const margin=Math.min(18,Math.max(8,stage.clientHeight*.018));
      nearHeader=mouseY<=masthead.getBoundingClientRect().bottom+margin;
      nearDeck=mouseY>=deck.getBoundingClientRect().top-margin;
    }
    const focused=keyboardNavigation?document.activeElement:null;
    cinema.classList.toggle("show-header",projecting && (nearHeader || touchControls || masthead.contains(focused)));
    cinema.classList.toggle("show-deck",projecting && (nearDeck || touchControls || deck.contains(focused)));
  }
  function setTouchControls(visible) {
    clearTimeout(touchTimer);
    touchControls=visible;
    if (visible) touchTimer=setTimeout(()=>setTouchControls(false),3600);
    updateChrome();
  }
  function trackPointer(event) {
    if (event.pointerType==="touch") return;
    clearTimeout(selectionTimer);
    keyboardNavigation=false;
    if (touchControls) setTouchControls(false);
    mouseY=event.clientY;
    updateChrome();
  }
  cinema.addEventListener("pointermove",trackPointer,{passive:true});
  cinema.addEventListener("pointerleave",event=>{
    if (event.pointerType==="touch") return;
    mouseY=null;
    updateChrome();
  });
  cinema.addEventListener("pointerdown",event=>{
    if (!event.isPrimary) return;
    if (event.pointerType!=="touch") {trackPointer(event);return;}
    mouseY=null;
    keyboardNavigation=false;
    clearTimeout(touchTimer);
    touchOrigin={x:event.clientX,y:event.clientY,control:Boolean(event.target.closest("input,button"))};
    updateChrome();
  });
  cinema.addEventListener("pointerup",event=>{
    if (event.pointerType!=="touch" || !touchOrigin || !event.isPrimary) return;
    const tap=Math.hypot(event.clientX-touchOrigin.x,event.clientY-touchOrigin.y)<14;
    if (state==="playing") {
      if (touchOrigin.control || !tap) setTouchControls(touchControls);
      else setTouchControls(!touchControls);
    }
    touchOrigin=null;
  });
  cinema.addEventListener("pointercancel",event=>{
    if (event.pointerType!=="touch") return;
    touchOrigin=null;
    setTouchControls(false);
  });
  cinema.addEventListener("focusin",updateChrome);
  cinema.addEventListener("focusout",()=>requestAnimationFrame(updateChrome));
  function fullChanged() {
    const label=isFull()?"Exit fullscreen (F)":"Enter fullscreen (F)";
    full.setAttribute("aria-label",label);
    full.title=label;
    fit();
  }
  document.addEventListener("fullscreenchange",fullChanged);
  document.addEventListener("webkitfullscreenchange",fullChanged);
  document.addEventListener("keydown",event=>{
    if (event.altKey || event.ctrlKey || event.metaKey || document.documentElement.classList.contains("film-loading")) return;
    if (event.key==="Tab") {
      keyboardNavigation=true;
      mouseY=null;
      updateChrome();
    }
    if (event.key==="Escape" && state==="playing") {
      stage.focus({preventScroll:true});
      setTouchControls(false);
    }
    const button=event.target instanceof HTMLElement && Boolean(event.target.closest("button"));
    if (event.code==="Space" && !button) { event.preventDefault(); if (!event.repeat) toggle(); }
    else if (event.code==="KeyM" && !event.repeat) toggleSound();
    else if (event.code==="KeyF" && !event.repeat && !full.hidden) void toggleFull();
    else if (event.key==="ArrowLeft" || event.key==="ArrowRight") {
      event.preventDefault();
      jump(filmTime()+(event.key==="ArrowRight"?5:-5),state==="playing");
    }
  });
  document.addEventListener("visibilitychange",()=>{
    if (document.hidden && (state==="playing" || fadeOut)) hold();
    else { dirty=true; performanceStart=0; }
  });
  stage.addEventListener("pointermove",event=>{
    if (state==="playing" || state==="paused" || event.pointerType==="touch" || reduction.matches) return;
    const r=stage.getBoundingClientRect();
    pointerX=(event.clientX-r.left)/r.width*2-1;
    pointerY=1-(event.clientY-r.top)/r.height*2;
  });
  stage.addEventListener("pointerleave",()=>{pointerX=0;pointerY=0;});

  function fit() {
    updateChrome();
    if (film && !contextLost) film.resize(stage.clientWidth,stage.clientHeight,quality);
    dirty=true;
    performanceStart=0;
  }
  function setup() {
    try {
      film=window.PenumbraFlight.create(view,hdr,setMode);
      fit();
      film.draw(filmTime(),state);
      stage.style.backgroundImage="none";
      currentStill="";
      stage.classList.remove("stills");
    } catch (error) {
      console.warn("PENUMBRA: 3D renderer unavailable.",error);
      film=null;
      stage.classList.add("stills");
      view.hidden=true; hdr.hidden=true;
      setMode("SDR");
      notice("3D is unavailable. Playing with stills and sound.",true);
    }
  }
  view.addEventListener("webglcontextlost",event=>{
    event.preventDefault();
    contextLost=true;
    stage.classList.add("stills");
    if (state==="playing") hold();
    hdr.hidden=true; view.hidden=true;
    setMode("SDR");
    currentChapter=-1; drawControls(position);
    notice("Graphics interrupted. Waiting for the picture to return.",true);
  });
  view.addEventListener("webglcontextrestored",()=>{
    contextLost=false;
    stage.classList.remove("stills");
    view.hidden=false;
    notice("");
    // Three and the compositor restore their GPU objects on this same event.
    // Rebuild the baked environment after both listeners have finished.
    requestAnimationFrame(()=>{
      if (film) {film.restore();fit();}
      else setup();
    });
  });
  new ResizeObserver(fit).observe(stage);

  function frame(stamp) {
    requestAnimationFrame(frame);
    if (document.hidden || document.documentElement.classList.contains("film-loading")) return;
    let t=filmTime(stamp);
    if (state==="playing" && t>=DURATION && !fadeOut) {hold(DURATION);t=DURATION;}
    const running=state==="playing";
    if (running || dirty) drawControls(t);
    const drift=Math.max(Math.abs(pointerX-driftX),Math.abs(pointerY-driftY));
    const idleInterval=drift>.012?34:1000;
    if (!film || contextLost || (!dirty && !running && stamp-lastDraw<idleInterval)) return;
    driftX+=(pointerX-driftX)*.16;
    driftY+=(pointerY-driftY)*.16;
    const engine=film.draw(t,state,driftX,driftY);
    if (engine) score.setEngineView?.(engine);
    lastDraw=stamp;
    dirty=false;
    if (!running) {performanceStart=0;return;}
    if (!performanceStart) {performanceStart=stamp;renderedFrames=0;}
    renderedFrames++;
    // Sustained slow playback gets a smaller render buffer; music keeps its clock.
    if (stamp-performanceStart>3000) {
      const fps=renderedFrames*1000/(stamp-performanceStart);
      if (fps<25 && quality>.66) {quality=Math.max(.66,quality*.84);fit();}
      performanceStart=stamp;renderedFrames=0;
    }
  }
  setup();
  drawControls(0);
  window.PenumbraOpening?.pictureReady(film ? amount=>{
    if (!contextLost) film.draw(0,"intro",0,0,amount);
  } : null);
  requestAnimationFrame(frame);
}());
