var startupLoginGuideShown = false;
var loginGuideAnimating = false;
var loginGuideRaf = null;
function runLoginGuideParticles(done) {
  var canvas = document.getElementById('login-guide-canvas');
  if (!canvas || reduceSplashMotion) {
    if (done) setTimeout(done, 120);
    return;
  }
  if (loginGuideAnimating) {
    if (done) setTimeout(done, 720);
    return;
  }
  loginGuideAnimating = true;
  document.body.classList.add('login-guide-active');
  var ctx = canvas.getContext('2d');
  var dpr = Math.min(window.devicePixelRatio || 1, 1.8);
  var w = window.innerWidth, h = window.innerHeight;
  canvas.width = Math.floor(w * dpr);
  canvas.height = Math.floor(h * dpr);
  canvas.style.width = w + 'px';
  canvas.style.height = h + 'px';
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  var cx = w * 0.5;
  var cy = h * 0.5 - 10;
  var maxR = Math.max(w, h);
  var particles = [];
  for (var i = 0; i < 92; i++) {
    var ang = Math.random() * Math.PI * 2;
    var ring = maxR * (0.30 + Math.random() * 0.35);
    var arcBias = Math.random() < 0.42 ? Math.PI * 0.5 : 0;
    particles.push({
      sx: cx + Math.cos(ang + arcBias) * ring + (Math.random() - 0.5) * 80,
      sy: cy + Math.sin(ang) * ring * 0.72 + (Math.random() - 0.5) * 80,
      tx: cx + (Math.random() - 0.5) * 172,
      ty: cy + (Math.random() - 0.5) * 172,
      r: 0.8 + Math.random() * 1.9,
      delay: Math.random() * 0.22,
      hue: Math.random(),
      spin: Math.random() * Math.PI * 2
    });
  }
  var started = performance.now();
  var duration = 1050;
  if (loginGuideRaf) cancelAnimationFrame(loginGuideRaf);
  function draw(now) {
    var raw = Math.min(1, (now - started) / duration);
    ctx.clearRect(0, 0, w, h);
    ctx.globalCompositeOperation = 'lighter';
    var centerPulse = Math.sin(Math.PI * raw);
    var halo = ctx.createRadialGradient(cx, cy, 0, cx, cy, Math.min(w, h) * 0.28);
    halo.addColorStop(0, 'rgba(255,255,255,' + (0.060 * centerPulse) + ')');
    halo.addColorStop(0.55, 'rgba(255,255,255,' + (0.026 * centerPulse) + ')');
    halo.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = halo;
    ctx.fillRect(0, 0, w, h);

    for (var j = 0; j < particles.length; j++) {
      var p = particles[j];
      var lt = Math.max(0, Math.min(1, (raw - p.delay) / (1 - p.delay)));
      var e = 1 - Math.pow(1 - lt, 3);
      var wobble = Math.sin(lt * Math.PI * 2 + p.spin) * (1 - lt) * 18;
      var x = p.sx + (p.tx - p.sx) * e + Math.cos(p.spin) * wobble;
      var y = p.sy + (p.ty - p.sy) * e + Math.sin(p.spin) * wobble * 0.6;
      var alpha = Math.sin(Math.PI * lt) * (0.18 + p.hue * 0.18);
      if (alpha <= 0) continue;
      var warm = false;
      ctx.beginPath();
      ctx.arc(x, y, p.r * (0.75 + lt * 0.45), 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(255,255,255,' + alpha + ')';
      ctx.fill();
      if (lt > 0.08 && lt < 0.92) {
        var tx = p.sx + (p.tx - p.sx) * Math.max(0, e - 0.045);
        var ty = p.sy + (p.ty - p.sy) * Math.max(0, e - 0.045);
        ctx.strokeStyle = 'rgba(255,255,255,' + (alpha * 0.20) + ')';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(tx, ty);
        ctx.lineTo(x, y);
        ctx.stroke();
      }
    }
    if (raw < 1) {
      loginGuideRaf = requestAnimationFrame(draw);
    } else {
      function finish() {
        ctx.clearRect(0, 0, w, h);
        document.body.classList.remove('login-guide-active');
        loginGuideAnimating = false;
        loginGuideRaf = null;
        if (done) done();
      }
      if (window.gsap) {
        window.gsap.to(canvas, {
          opacity: 0, duration: 0.28, ease: 'power2.out', onComplete: function () {
            finish();
            window.gsap.set(canvas, { clearProps: 'opacity' });
          }
        });
      } else {
        finish();
      }
    }
  }
  loginGuideRaf = requestAnimationFrame(draw);
}
function maybeRunStartupLoginGuide(source) {
  if (startupLoginGuideShown || loginGuideAnimating) return;
  if (typeof loginEasterEggAllowsStartupGuide === 'function' && !loginEasterEggAllowsStartupGuide()) return;
  if (visualGuideActive) return;
  if (document.body.classList.contains('splash-active')) return;
  if (immersiveMode) return;
  if (!loginStatusChecked || loginStatusCheckFailed || loginStatus.loggedIn || playing) return;
  var loginModal = document.getElementById('login-modal');
  var userModal = document.getElementById('user-modal');
  if ((loginModal && loginModal.classList.contains('show')) || (userModal && userModal.classList.contains('show'))) return;
  startupLoginGuideShown = true;
  setTimeout(function () {
    if (loginStatus.loggedIn || playing || immersiveMode || document.body.classList.contains('splash-active')) return;
    runLoginGuideParticles(function () { showLoginModal({ guided: true, source: source || 'startup' }); });
  }, source === 'splash' ? 6200 : 2600);
}

// ============================================================
//  空场待机引导
