/* Letokruh — ukázka (Vladislav Zachariev, Whyte Lynx).
   Hero: five photos of one identical shot (bare screed, oak, walnut, herringbone, stone vinyl).
   The floor plane is known from the photo itself (vanishing point and plank joints measured in
   _zdroje/seams.json), so a WebGL shader can lay the floor plank by plank on scroll, with the edge
   of each fresh plank standing over the screed, and later re-lay it in another material. */
(() => {
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const phone = () => innerWidth <= 640;
  const nb = n => String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');

  /* ---------- smooth scroll ---------- */
  gsap.registerPlugin(ScrollTrigger);
  const lenis = new Lenis({ duration: 1.15, smoothWheel: true });
  lenis.on('scroll', ScrollTrigger.update);
  gsap.ticker.add(t => lenis.raf(t * 1000));
  gsap.ticker.lagSmoothing(0);
  $$('a[href^="#"]').forEach(a => a.addEventListener('click', e => {
    const id = a.getAttribute('href'); if (id.length < 2) return;
    const el = $(id); if (!el) return;
    e.preventDefault(); lenis.scrollTo(el, { offset: id === '#top' ? 0 : -60, duration: 1.6 });
  }));

  const FLOORS = { dub: 'Dub přírodní', orech: 'Ořech', kost: 'Rybí kost', vinyl: 'Vinyl kámen' };
  const SAMPLE = {};
  Object.keys(FLOORS).forEach(f => { const i = new Image(); i.src = `img/vzorek-${f}.webp`; SAMPLE[f] = i; });

  /* ---------- the floor plane (must match the shader) ---------- */
  const VX = 1372, YH = 766, FL = 1835, U0 = .075, DU = .1746, PL = 1.3, SEED = 3;
  const mod = (x, y) => x - y * Math.floor(x / y);
  const pm = x => mod((x * 34 + 1) * x, 289);
  const hv = (a, b) => { a = mod(a + 150, 289); b = mod(b + 150, 289); return pm(pm(pm(a) + b) + SEED) / 289; };
  function plankOrder(x, y) {                // photo px (y down) -> [id, order]; laid from the viewer towards the windows
    const dy = Math.max(y - YH, 1), u = (x - VX) / dy, w = FL / dy;
    const c = Math.floor((u - U0) / DU), off = hv(c, 7) * PL, r = Math.floor((w + off) / PL);
    const wc = (r + .5) * PL - off, t = clamp((wc - 2.2) / 6.8, 0, 1);
    return [c + ':' + r, t * .84 + hv(c, r) * .03 + Math.min(Math.abs(c + .5) * .004, .06)];
  }

  const hero = $('#hero');
  const heroRange = () => hero.offsetHeight - innerHeight;
  const CROP = [836 / 2752, 1072 / 2752];
  const frameA = () => { const c = document.getElementById('gl'); return c.clientWidth / Math.max(1, c.clientHeight); };
  const wantCrop = () => frameA() < .8;
  const src = (f, c) => `img/pokoj-${f}${c ? '-p' : ''}.webp`;
  const loadImg = s => new Promise((res, rej) => { const i = new Image(); i.decoding = 'async'; i.onload = () => res(i); i.onerror = rej; i.src = s; });

  const st = { cur: 'dub', from: null, sw: 1, layP: 0, heroP: 0, laid: 0, total: 0 };
  let orders = [];                            // appear thresholds of every plank in view

  /* count the planks that are actually visible, from the mask, with the shader's own mapping */
  let maskData = null;
  loadImg('img/maska.png').then(im => {
    const c = document.createElement('canvas'); c.width = im.width; c.height = im.height;
    const x = c.getContext('2d'); x.drawImage(im, 0, 0); maskData = x.getImageData(0, 0, c.width, c.height);
    countPlanks();
  }).catch(() => {});
  function countPlanks() {
    if (!maskData) return;
    const crop = wantCrop(), cx = crop ? CROP[0] : 0, cw = crop ? CROP[1] : 1;
    const ca = frameA(), ra = cw * 2752 / 1536, seen = new Map();
    for (let j = 0; j < 90; j++) for (let i = 0; i < 140; i++) {
      let qx = (i + .5) / 140, qy = (j + .5) / 90;
      if (ca > ra) { const k = ra / ca; qy = (qy - .5) * k + .5 - (1 - k) * .3; } else qx = (qx - .5) * ca / ra + .5;
      const px = (cx + qx * cw) * 2752, py = (1 - qy) * 1536;
      const mx = Math.floor(px / 2), my = Math.floor(py / 2);
      if (mx < 0 || my < 0 || mx >= maskData.width || my >= maskData.height) continue;
      if (maskData.data[(my * maskData.width + mx) * 4] < 128) continue;
      const [id, o] = plankOrder(px, py); seen.set(id, o);
    }
    orders = [...seen.values()].sort((a, b) => a - b);
    st.total = orders.length;
  }
  addEventListener('resize', countPlanks);

  /* ---------- hero progress ---------- */
  const nav = $('#nav');
  function heroProgress() {
    st.heroP = clamp((lenis.animatedScroll ?? scrollY) / heroRange(), 0, 1);
    st.layP = clamp(st.heroP / .8, 0, 1);
    const p = st.layP * 1.06;
    let n = 0; while (n < orders.length && orders[n] + .03 < p) n++;
    st.laid = st.layP >= 1 ? st.total : n;
    hero.classList.toggle('is-done', st.heroP > .84);
    nav.classList.toggle('is-solid', scrollY > hero.offsetTop + heroRange() + 20);
    if (fb) { fb[1].style.opacity = st.sw < 1 ? st.sw : st.layP; }
  }

  /* ---------- WebGL ---------- */
  const cv = $('#gl');
  const gl = cv.getContext('webgl', { antialias: false, alpha: false, powerPreference: 'high-performance' });
  let fb = null;
  const VS = `attribute vec2 a;varying vec2 vUv;void main(){vUv=a*.5+.5;gl_Position=vec4(a,0.,1.);}`;
  const FS = `precision highp float;
varying vec2 vUv;
uniform sampler2D uA,uB,uM;
uniform vec2 uRes,uC;
uniform float uImgA,uP,uZ,uFace;
const float VX=${VX}.,YH=${YH}.,FL=${FL}.,U0=${U0},DU=${DU},PL=${PL},SEED=${SEED}.;
float pm(float x){return mod((x*34.+1.)*x,289.);}
float hv(vec2 i){i=mod(i+150.,289.);return pm(pm(pm(i.x)+i.y)+SEED)/289.;}
/* is photo pixel q (px, y down) already covered by its plank; id = column,row.
   Rows go from the viewer towards the windows; each plank slides out along its length, near end first. */
float plank(vec2 q,out vec2 id){
  float dy=max(q.y-YH,1.),u=(q.x-VX)/dy,w=FL/dy;
  float c=floor((u-U0)/DU),off=hv(vec2(c,7.))*PL,g=(w+off)/PL,r=floor(g);
  id=vec2(c,r);
  float wc=(r+.5)*PL-off,t=clamp((wc-2.2)/6.8,0.,1.);
  float o=t*.84+hv(id)*.03+min(abs(c+.5)*.004,.06);
  float a=clamp((uP*1.06-o)/.08,0.,1.);
  a=1.-(1.-a)*(1.-a)*(1.-a);
  return 1.-smoothstep(a*1.03-.03,a*1.03,g-r);
}
void main(){
  float ca=uRes.x/uRes.y,ra=uC.y*uImgA;
  vec2 q=vUv;
  if(ca>ra){float k=ra/ca;q.y=(q.y-.5)*k+.5-(1.-k)*.3;}else q.x=(q.x-.5)*ca/ra+.5;
  q=(q-vec2(.5,.3))/uZ+vec2(.5,.3);
  vec2 p=vec2(uC.x+q.x*uC.y,q.y);
  vec2 px=vec2(p.x*2752.,(1.-p.y)*1536.);
  vec3 A=texture2D(uA,q).rgb,B=texture2D(uB,q).rgb;
  float m=texture2D(uM,p).r;
  vec3 col=mix(A,B,smoothstep(0.,1.,uP));
  if(m>.002){
    vec2 id,ib,iS;
    float a=plank(px,id);
    vec3 f=mix(A,B,a);
    f*=1.+.05*uFace*a*(1.-a)*4.;
    if(uFace>0.&&a<.999){
      float dy=px.y-YH,fh=.013*dy,sx=(px.x-VX)*.013;
      float ab=plank(px-vec2(0.,fh),ib);
      float onF=clamp((ab-a)*1.2,0.,1.)*step(.5,length(ib-id));
      float aS=plank(px+vec2(sx,0.),iS);
      float onS=clamp((aS-a)*1.2,0.,1.)*step(.5,length(iS-id));
      vec3 face=texture2D(uB,q+vec2(0.,fh/1536.)).rgb*vec3(.5,.47,.44);
      vec3 side=texture2D(uB,q+vec2(sx/(2752.*uC.y),0.)).rgb*.64;
      float ab2=plank(px+vec2(0.,fh*.7),ib);
      f*=1.-.13*uFace*clamp(ab2-a,0.,1.)*(1.-onF);
      f=mix(f,side,onS*uFace);
      f=mix(f,face,onF*uFace);
    }
    col=mix(col,f,m);
  }
  gl_FragColor=vec4(col,1.);
}`;
  const UNIT = { 0: 0, dub: 1, orech: 2, kost: 3, vinyl: 4, mask: 5 };
  const have = {};                            // floor -> uploaded for the current crop
  let crop = wantCrop();

  if (!gl) {
    document.documentElement.classList.add('no-gl');
    fb = $$('#fallback img'); fb[0].src = src(0, false); fb[1].src = src('dub', false);
  } else {
    const sh = (type, s) => { const o = gl.createShader(type); gl.shaderSource(o, s); gl.compileShader(o); if (!gl.getShaderParameter(o, gl.COMPILE_STATUS)) console.error(gl.getShaderInfoLog(o)); return o; };
    const pr = gl.createProgram();
    gl.attachShader(pr, sh(gl.VERTEX_SHADER, VS)); gl.attachShader(pr, sh(gl.FRAGMENT_SHADER, FS)); gl.linkProgram(pr); gl.useProgram(pr);
    const buf = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    const loc = gl.getAttribLocation(pr, 'a'); gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
    const U = n => gl.getUniformLocation(pr, n);
    const u = { res: U('uRes'), c: U('uC'), a: U('uImgA'), p: U('uP'), z: U('uZ'), face: U('uFace'), A: U('uA'), B: U('uB'), M: U('uM') };
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
    const texs = [0, 1, 2, 3, 4, 5].map(k => {
      const t = gl.createTexture(); gl.activeTexture(gl.TEXTURE0 + k); gl.bindTexture(gl.TEXTURE_2D, t);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, k === 5 ? new Uint8Array([0, 0, 0, 255]) : new Uint8Array([217, 212, 203, 255]));
      ['TEXTURE_WRAP_S', 'TEXTURE_WRAP_T'].forEach(w => gl.texParameteri(gl.TEXTURE_2D, gl[w], gl.CLAMP_TO_EDGE));
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      return t;
    });
    const upload = (k, img) => { gl.activeTexture(gl.TEXTURE0 + k); gl.bindTexture(gl.TEXTURE_2D, texs[k]); gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img); };
    gl.uniform1i(u.M, UNIT.mask);
    let gen = 0;
    const want = (f, c = crop) => { const g = gen; return loadImg(src(f, c)).then(im => { if (g === gen) { upload(UNIT[f], im); have[f] = true; } }); };
    window.__ensure = f => have[f] ? Promise.resolve() : want(f);
    Promise.all([want(0), want('dub'), loadImg('img/maska.png').then(im => upload(UNIT.mask, im))])
      .then(() => { ready = true; ['orech', 'kost', 'vinyl'].forEach(f => want(f).catch(() => {})); })
      .catch(() => { document.documentElement.classList.add('no-gl'); fb = $$('#fallback img'); fb[0].src = src(0, false); fb[1].src = src(st.cur, false); });
    let ready = false, swapping = false;
    function swapSet() {                      // phone turned: reload what we had, all at once
      if (swapping || !ready || wantCrop() === crop) return;
      swapping = true; const c = wantCrop();
      Promise.all([0, 'dub', 'orech', 'kost', 'vinyl'].filter(f => f === 0 || have[f]).map(f => loadImg(src(f, c)).then(im => [f, im])))
        .then(list => { gen++; list.forEach(([f, im]) => upload(UNIT[f], im)); crop = c; countPlanks(); })
        .catch(() => {}).then(() => { swapping = false; swapSet(); });
    }
    addEventListener('resize', swapSet);

    let W = 0, Hh = 0, dprCap = phone() ? 2 : 1.75, slow = 0, lastNow = 0;
    function size() {
      const dpr = Math.min(devicePixelRatio || 1, dprCap);
      const w = Math.round(cv.clientWidth * dpr), h = Math.round(cv.clientHeight * dpr);
      if (w === W && h === Hh) return;
      W = w; Hh = h; cv.width = W; cv.height = Hh; gl.viewport(0, 0, W, Hh);
    }
    size(); addEventListener('resize', size);
    let visible = true;
    ScrollTrigger.create({ trigger: hero, start: 'top bottom', end: 'bottom top', onToggle: s => { visible = s.isActive; } });
    (function frame(now) {
      requestAnimationFrame(frame);
      if (!visible || !ready) { lastNow = 0; return; }
      if (lastNow) {
        slow = now - lastNow > 30 ? slow + 1 : Math.max(0, slow - 1);
        if (slow > 45 && dprCap > 1.25) { dprCap -= .5; slow = 0; size(); }
      }
      lastNow = now;
      const switching = st.sw < 1 && st.from;
      gl.uniform1i(u.A, switching ? UNIT[st.from] : UNIT[0]);
      gl.uniform1i(u.B, UNIT[st.cur]);
      gl.uniform2f(u.res, W, Hh);
      gl.uniform2f(u.c, crop ? CROP[0] : 0, crop ? CROP[1] : 1);
      gl.uniform1f(u.a, 2752 / 1536);
      gl.uniform1f(u.p, switching ? st.sw : st.layP);
      gl.uniform1f(u.z, reduced ? 1 : 1.06 - .06 * Math.sin(Math.min(st.layP, 1) * Math.PI / 2));
      gl.uniform1f(u.face, switching ? .4 : 1);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    })(performance.now());
  }
  lenis.on('scroll', heroProgress);
  addEventListener('resize', heroProgress);

  /* ---------- one floor everywhere: room, cards, patterns, calculator ---------- */
  let swTween = null;
  function setFloor(f, animate) {
    if (f === st.cur) return;
    const prev = st.cur;
    $$('#pick button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.f === f)));
    $$('#mat button').forEach(b => b.setAttribute('aria-checked', String(b.dataset.f === f)));
    const go = () => {
      if (swTween) swTween.kill();
      st.cur = f;
      if (fb) { fb[0].src = src(prev, false); fb[1].src = src(f, false); }
      if (animate && !reduced) {
        st.from = prev; st.sw = 0;
        swTween = gsap.to(st, { sw: 1, duration: 1.7, ease: 'power2.inOut', onUpdate: heroProgress, onComplete: () => { st.from = null; if (fb) fb[0].src = src(0, false); heroProgress(); } });
      } else { st.sw = 1; st.from = null; if (fb) fb[0].src = src(0, false); }
      layTex = f; drawLay(true); calc();
    };
    if (gl && window.__ensure) window.__ensure(f).then(go, go); else go();
  }
  $$('#pick button').forEach(b => b.addEventListener('click', () => setFloor(b.dataset.f, true)));
  $$('#mat button').forEach(b => b.addEventListener('click', () => setFloor(b.dataset.f, false)));
  $$('.card__go').forEach(b => b.addEventListener('click', () => {
    const f = b.dataset.f;
    lenis.scrollTo(hero.offsetTop + heroRange() * .93, { duration: 1.8, onComplete: () => setTimeout(() => setFloor(f, true), 120) });
  }));

  /* ---------- laying patterns, top view, every piece cut from the real sample ---------- */
  const lc = $('#layCv'), lx = lc.getContext('2d');
  const VIEW_W = 300, VIEW_H = 225;           // cm in view
  let rnd = 1;
  const rand = () => (rnd = (rnd * 16807) % 2147483647) / 2147483647;
  const rectPiece = (x, y, w, h) => [[x, y], [x + w, y], [x + w, y + h], [x, y + h]];
  function makePattern(kind) {
    rnd = 7; const P = [];
    const add = (pts, axis) => {
      const cx = pts.reduce((s, p) => s + p[0], 0) / pts.length, cy = pts.reduce((s, p) => s + p[1], 0) / pts.length;
      const xs = pts.map(p => p[0]), ys = pts.map(p => p[1]);
      if (Math.max(...xs) < -4 || Math.min(...xs) > VIEW_W + 4 || Math.max(...ys) < -4 || Math.min(...ys) > VIEW_H + 4) return;
      P.push({ pts, axis, cx, cy, sx: rand(), sy: rand(), tone: rand() - .5 });
    };
    if (kind === 'rovne') {
      const W = 20;
      for (let x = -W; x < VIEW_W + W; x += W) {
        let y = -rand() * 180;
        while (y < VIEW_H + 20) { const L = 120 + rand() * 90; add(rectPiece(x, y, W, L), Math.PI / 2); y += L; }
      }
    } else if (kind === 'kost') {
      const W = 10, n = 6, c = Math.SQRT1_2, ox = VIEW_W / 2, oy = VIEW_H / 2;
      const rot = ([x, y]) => [ox + (x - y) * c, oy + (x + y) * c];
      for (let j = -5; j <= 5; j++) for (let i = -26; i <= 26; i++) {
        const sx = -n * j, sy = n * j;
        add([[i + sx, i + sy], [i + n + sx, i + sy], [i + n + sx, i + 1 + sy], [i + sx, i + 1 + sy]].map(p => rot([p[0] * W, p[1] * W])), Math.PI / 4);
        add([[i + n + sx, i + 1 - n + sy], [i + n + 1 + sx, i + 1 - n + sy], [i + n + 1 + sx, i + 1 + sy], [i + n + sx, i + 1 + sy]].map(p => rot([p[0] * W, p[1] * W])), -Math.PI / 4);
      }
    } else if (kind === 'fr') {
      const C = 34, Hh = 12 / Math.SQRT1_2, Z = x => C - Math.abs(mod(x, 2 * C) - C);
      for (let k = -1; k * C < VIEW_W + C; k++) {
        const x0 = k * C, x1 = x0 + C, z0 = Z(x0), z1 = Z(x1);
        for (let j = -4; j * Hh < VIEW_H + Hh; j++)
          add([[x0, z0 + j * Hh], [x1, z1 + j * Hh], [x1, z1 + (j + 1) * Hh], [x0, z0 + (j + 1) * Hh]], Math.atan2(z1 - z0, C));
      }
    } else {
      const S = 36, w = 12;
      for (let a = -1; a * S < VIEW_W + S; a++) for (let b = -1; b * S < VIEW_H + S; b++)
        for (let m = 0; m < 3; m++)
          (a + b) % 2 === 0 ? add(rectPiece(a * S + m * w, b * S, w, S), Math.PI / 2) : add(rectPiece(a * S, b * S + m * w, S, w), 0);
    }
    P.forEach(p => { p.order = p.cy * 1.0 + p.cx * .25 + rand() * 14; });
    P.sort((a, b) => a.order - b.order);
    return P;
  }
  const LAYTXT = {
    rovne: 'Prkna rovně, na vazbu. Nejrychlejší pokládka a nejmenší prořez. Místnost se opticky prodlouží ve směru prken.',
    kost: 'Rybí kost. Dílce v úhlu 45°, každý navazuje na sousední. Tradiční pokládka starých vil a činžáků.',
    fr: 'Francouzská kost. Konce dílců jsou šikmo seříznuté a potkávají se v jedné linii. Působí klidněji než rybí kost.',
    kazety: 'Kazety. Čtverce ze tří lamel, střídavě napříč. Hodí se do menších pokojů.'
  };
  let pieces = makePattern('rovne'), layKind = 'rovne', layTex = 'dub', layT0 = 0, layAnim = false, layRaf = 0;
  function sizeLay() {
    const d = Math.min(devicePixelRatio || 1, 2);
    lc.width = Math.round(lc.clientWidth * d); lc.height = Math.round(lc.clientHeight * d);
  }
  function piecePath(ctx, pts, k) { ctx.beginPath(); pts.forEach(([x, y], i) => i ? ctx.lineTo(x * k, y * k) : ctx.moveTo(x * k, y * k)); ctx.closePath(); }
  function drawLay(restart) {
    if (restart) { layT0 = performance.now(); if (!layAnim) { layAnim = true; layRaf = requestAnimationFrame(layFrame); } }
  }
  function layFrame(now) {
    const k = lc.width / VIEW_W, img = SAMPLE[layTex === 'kost' ? 'dub' : layTex];
    const t = (now - layT0) / 1000, N = pieces.length, span = reduced ? 0 : 1.7, dur = reduced ? .01 : .42;
    lx.setTransform(1, 0, 0, 1, 0, 0);
    lx.fillStyle = '#e9e6e0'; lx.fillRect(0, 0, lc.width, lc.height);
    let done = true;
    pieces.forEach((p, i) => {
      const e = clamp((t - (i / N) * span) / dur, 0, 1);
      if (e < 1) done = false;
      if (e <= 0) return;
      const ee = 1 - Math.pow(1 - e, 3), s = 1 + .09 * (1 - ee), lift = (1 - ee) * 10 * k;
      lx.save();
      lx.translate(p.cx * k, p.cy * k - lift); lx.scale(s, s); lx.translate(-p.cx * k, -p.cy * k);
      if (e < 1) { lx.shadowColor = 'rgba(40,25,10,.35)'; lx.shadowBlur = 18 * (1 - ee) * k / 4; lx.shadowOffsetY = lift * .6; }
      lx.globalAlpha = Math.min(1, e * 2.2);
      piecePath(lx, p.pts, k); lx.fillStyle = '#b98a55'; lx.fill();
      lx.shadowColor = 'transparent';
      lx.clip();
      if (img.complete && img.naturalWidth) {
        const len = 260, wid = 60, sw = Math.min(img.naturalWidth, wid * 4.2), sh = Math.min(img.naturalHeight, len * 4.2);
        lx.translate(p.cx * k, p.cy * k); lx.rotate(p.axis - Math.PI / 2);
        lx.drawImage(img, p.sx * (img.naturalWidth - sw), p.sy * (img.naturalHeight - sh), sw, sh, -wid / 2 * k, -len / 2 * k, wid * k, len * k);
        lx.setTransform(1, 0, 0, 1, 0, 0);
        lx.translate(p.cx * k, p.cy * k - lift); lx.scale(s, s); lx.translate(-p.cx * k, -p.cy * k);
      }
      lx.fillStyle = p.tone > 0 ? `rgba(255,236,205,${p.tone * .16})` : `rgba(30,18,6,${-p.tone * .2})`;
      lx.fillRect(-1e4, -1e4, 2e4, 2e4);
      lx.restore();
      lx.save();
      lx.translate(p.cx * k, p.cy * k - lift); lx.scale(s, s); lx.translate(-p.cx * k, -p.cy * k);
      lx.globalAlpha = Math.min(1, e * 2.2) * .55;
      piecePath(lx, p.pts, k); lx.lineWidth = Math.max(1, k * .25); lx.strokeStyle = 'rgba(52,32,12,.75)'; lx.stroke();
      lx.restore();
    });
    const g = lx.createLinearGradient(0, 0, lc.width, lc.height);    // window light from the top left
    g.addColorStop(0, 'rgba(255,246,228,.16)'); g.addColorStop(.55, 'rgba(255,246,228,0)'); g.addColorStop(1, 'rgba(20,12,4,.22)');
    lx.fillStyle = g; lx.fillRect(0, 0, lc.width, lc.height);
    if (done) { layAnim = false; return; }
    layRaf = requestAnimationFrame(layFrame);
  }
  sizeLay();
  addEventListener('resize', () => { sizeLay(); if (!layAnim) { layAnim = true; layT0 = -1e9; requestAnimationFrame(layFrame); } });
  let layShown = false;
  ScrollTrigger.create({ trigger: '#vzory', start: 'top 70%', once: true, onEnter: () => { layShown = true; drawLay(true); } });
  $$('#layTabs button').forEach(b => b.addEventListener('click', () => {
    $$('#layTabs button').forEach(x => x.setAttribute('aria-selected', String(x === b)));
    layKind = b.dataset.p; pieces = makePattern(layKind); $('#layTxt').textContent = LAYTXT[layKind]; drawLay(true);
  }));
  Object.values(SAMPLE).forEach(im => im.addEventListener('load', () => { if (layShown && !layAnim) { layAnim = true; layT0 = -1e9; requestAnimationFrame(layFrame); } }));

  /* ---------- steps: lines draw as they come into view ---------- */
  $$('.step').forEach((s, i) => {
    gsap.fromTo(s, { '--d': 1, '--s': 0 }, { '--d': 0, '--s': 1, ease: 'none', scrollTrigger: { trigger: s, start: 'top 88%', end: 'top 45%', scrub: true } });
  });

  /* ---------- calculator (sample prices) ---------- */
  const PRICE = {
    dub: { name: 'Dub přírodní, třívrstvá prkna', mat: [950, 1600], lay: [280, 380], waste: .07, oil: true },
    orech: { name: 'Americký ořech, třívrstvá prkna', mat: [1900, 2900], lay: [300, 420], waste: .07, oil: true },
    kost: { name: 'Dubová rybí kost, masiv', mat: [1300, 2000], lay: [520, 760], waste: .12, oil: true },
    vinyl: { name: 'Vinyl v dekoru kamene, lepený', mat: [450, 900], lay: [220, 300], waste: .06, oil: false }
  };
  const OIL = [90, 150], OLD = [90, 160], LEVEL = [190, 330], SKIRT = [150, 240];
  const area = $('#area'), shown = { lo: 0, hi: 0 };
  const r100 = v => Math.round(v / 100) * 100;
  function calc() {
    const A = +area.value, P = PRICE[st.cur], Aw = Math.ceil(A * (1 + P.waste)), bm = Math.round(4 * Math.sqrt(A) * 1.15);
    area.style.setProperty('--f', ((A - area.min) / (area.max - area.min) * 100).toFixed(1) + '%');
    $('#areaOut').textContent = A + ' m²';
    const rows = [['Materiál', Aw, P.mat, `${Aw} m²`], ['Pokládka', A, P.lay, `${A} m²`]];
    if (P.oil) rows.push(['Olej a ošetření', A, OIL, `${A} m²`]);
    if ($('#old').checked) rows.push(['Odstranění staré podlahy', A, OLD, `${A} m²`]);
    if ($('#level').checked) rows.push(['Vyrovnání podkladu', A, LEVEL, `${A} m²`]);
    if ($('#skirt').checked) rows.push(['Lišty', bm, SKIRT, `${bm} bm`]);
    let lo = 0, hi = 0;
    $('#billRows').innerHTML = rows.map(([n, q, [a, b], lbl]) => {
      lo += q * a; hi += q * b;
      return `<li><span>${n} · ${lbl}</span><b>${nb(r100(q * a))}–${nb(r100(q * b))}</b></li>`;
    }).join('');
    $('#billName').textContent = P.name;
    $('#billSub').textContent = `${A} m² · s prořezem ${Aw} m²`;
    gsap.to(shown, { lo: r100(lo), hi: r100(hi), duration: reduced ? 0 : .5, ease: 'power2.out', onUpdate: () => {
      $('#billSum').textContent = `${nb(r100(shown.lo))} – ${nb(r100(shown.hi))} Kč`;
    } });
  }
  area.addEventListener('input', calc);
  $$('.checks input').forEach(i => i.addEventListener('change', calc));
  $('#billCta').addEventListener('click', () => { $('#aWhat').value = `${FLOORS[st.cur]}, ${area.value} m²`; });
  calc();

  /* ---------- enquiry (sample: goes nowhere) ---------- */
  const toastEl = $('#toast'); let toastT = 0;
  function toast(msg) { toastEl.textContent = msg; toastEl.classList.add('on'); clearTimeout(toastT); toastT = setTimeout(() => toastEl.classList.remove('on'), 4200); }
  $('#askForm').addEventListener('submit', e => {
    e.preventDefault();
    if (!$('#aName').value.trim()) { toast('Doplňte prosím jméno.'); $('#aName').focus(); return; }
    if ($('#aTel').value.replace(/\D/g, '').length < 9) { toast('Doplňte telefon, ať se Vám můžeme ozvat.'); $('#aTel').focus(); return; }
    toast('Děkujeme. Tohle je jen ukázka, poptávka se nikam neodeslala.');
  });

  addEventListener('load', () => { ScrollTrigger.refresh(); countPlanks(); heroProgress(); });
  heroProgress();
  window.__state = () => ({ heroP: +st.heroP.toFixed(3), layP: +st.layP.toFixed(3), sw: +st.sw.toFixed(2), cur: st.cur, laid: st.laid, total: st.total, gl: !!gl, scroll: Math.round(scrollY) });
  window.__go = y => lenis.scrollTo(y, { immediate: true, force: true });
  window.__floor = f => setFloor(f, true);
})();
