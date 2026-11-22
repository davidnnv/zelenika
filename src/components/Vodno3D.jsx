// 3D Mount Vodno (three.js): low-poly mountain with glowing contour lines, Zelenika pinned on Sredno Vodno,
// the Millennium Cross on the summit and the lights of Skopje in the valley.
// Loaded after the page shows; paused off-screen / in background tabs; a single still frame for reduced motion;
// falls back to the terrace photo when WebGL is missing.
import { useEffect, useRef, useState } from 'react';
import { nowLocal } from '../lib/time';
import { A } from '../lib/asset';

const GREEN = 0x01b84e;

// Mountain height: a long east–west ridge (Vodno) south of the city, highest near the Cross.
function height(x, z) {
  const ridge = Math.exp(-((z + 6.5) ** 2) / 20) * (0.55 + 0.45 * Math.exp(-((x - 3) ** 2) / 55));
  const spur = 0.35 * Math.exp(-((x + 7) ** 2) / 30 - ((z + 4) ** 2) / 14);
  const n = Math.sin(x * 1.3 + z * 0.7) * 0.18 + Math.sin(x * 0.45 - z * 1.7) * 0.22 + Math.sin(x * 2.9 + z * 2.3) * 0.06;
  const h = 9 * ridge + 2.4 * spur + n * (0.4 + ridge);
  return Math.max(h, 0.02 + n * 0.05);
}

export default function Vodno3D({ labels }) {
  const hostRef = useRef(null);
  const tagRefs = { pin: useRef(null), cross: useRef(null), city: useRef(null) };
  const [state, setState] = useState('loading'); // loading | ready | fallback

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return undefined;
    const probe = document.createElement('canvas');
    if (!(probe.getContext('webgl2') || probe.getContext('webgl'))) { setState('fallback'); return undefined; }
    const calm = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    let disposed = false;
    let cleanup = () => {};

    (async () => {
      const THREE = await import('three');
      if (disposed) return;
      const small = window.innerWidth < 760;
      const { min } = nowLocal();
      const night = min < 390 || min > 1050; // before 6:30 or after 17:30 in Skopje

      const renderer = new THREE.WebGLRenderer({ antialias: !small, alpha: true, powerPreference: 'low-power' });
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, small ? 1.5 : 2));
      renderer.outputColorSpace = THREE.SRGBColorSpace;
      renderer.domElement.className = 'vodno__canvas';
      renderer.domElement.setAttribute('aria-hidden', 'true');
      host.prepend(renderer.domElement);

      const scene = new THREE.Scene();
      scene.fog = new THREE.Fog(0x000000, 30, 70);
      const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 120);

      /* ---- Terrain with contour lines ---- */
      const W = 70, D = 44, SX = small ? 120 : 200, SZ = small ? 80 : 130;
      const geo = new THREE.PlaneGeometry(W, D, SX, SZ);
      geo.rotateX(-Math.PI / 2);
      const pos = geo.attributes.position;
      for (let i = 0; i < pos.count; i++) pos.setY(i, height(pos.getX(i), pos.getZ(i)));
      geo.computeVertexNormals();
      const terrainMat = new THREE.ShaderMaterial({
        transparent: false,
        fog: true,
        uniforms: {
          uTime: { value: 0 },
          uGreen: { value: new THREE.Color(GREEN) },
          uNight: { value: night ? 1 : 0 },
          uPin: { value: new THREE.Vector3() },
          ...THREE.UniformsLib.fog,
        },
        vertexShader: /* glsl */ `
          varying vec3 vPos; varying float vFogDepth;
          void main(){ vec4 w = modelMatrix * vec4(position,1.0); vPos = w.xyz;
            vec4 mv = viewMatrix * w; vFogDepth = -mv.z; gl_Position = projectionMatrix * mv; }`,
        fragmentShader: /* glsl */ `
          uniform float uTime; uniform vec3 uGreen; uniform float uNight; uniform vec3 uPin;
          uniform vec3 fogColor; uniform float fogNear; uniform float fogFar;
          varying vec3 vPos; varying float vFogDepth;
          void main(){
            vec3 n = normalize(cross(dFdx(vPos), dFdy(vPos)));
            vec3 L = normalize(vec3(-0.5, 0.9, 0.55));
            float diff = clamp(dot(n, L), 0.0, 1.0);
            float h = clamp(vPos.y / 7.5, 0.0, 1.0);
            vec3 low = mix(vec3(0.02,0.07,0.04), vec3(0.03,0.11,0.06), 1.0-uNight);
            vec3 high = mix(vec3(0.05,0.20,0.10), vec3(0.10,0.36,0.17), 1.0-uNight);
            vec3 col = mix(low, high, h) * (0.35 + 0.85 * diff);
            // contour lines every 0.55 units, brighter higher up
            float c = vPos.y / 0.55; float f = abs(fract(c) - 0.5); float w = fwidth(c);
            float line = 1.0 - smoothstep(0.0, w * 1.2, 0.5 - f);
            line *= smoothstep(0.08, 0.6, vPos.y);
            col += uGreen * line * (0.22 + 0.45 * h);
            // soft glow around the pin
            float d = distance(vPos.xz, uPin.xz);
            col += uGreen * 0.35 * exp(-d*d*0.35) * (0.75 + 0.25 * sin(uTime*2.0));
            float fogF = smoothstep(fogNear, fogFar, vFogDepth);
            gl_FragColor = vec4(mix(col, fogColor, fogF), 1.0);
          }`,
      });
      terrainMat.extensions = { derivatives: true };
      const terrain = new THREE.Mesh(geo, terrainMat);
      scene.add(terrain);

      /* ---- Zelenika pin on Sredno Vodno ---- */
      const pinXZ = new THREE.Vector2(-1.2, -2.6);
      const pinY = height(pinXZ.x, pinXZ.y);
      const pinBase = new THREE.Vector3(pinXZ.x, pinY, pinXZ.y);
      terrainMat.uniforms.uPin.value.copy(pinBase);
      const pin = new THREE.Group();
      pin.position.copy(pinBase);
      const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 1.6, 8), new THREE.MeshBasicMaterial({ color: 0xf5f3ee }));
      stem.position.y = 0.8;
      const head = new THREE.Mesh(new THREE.SphereGeometry(0.2, 24, 16), new THREE.MeshBasicMaterial({ color: GREEN }));
      head.position.y = 1.7;
      const halo = new THREE.Mesh(new THREE.SphereGeometry(0.42, 24, 16), new THREE.MeshBasicMaterial({ color: GREEN, transparent: true, opacity: 0.18, depthWrite: false }));
      halo.position.y = 1.7;
      const ring = new THREE.Mesh(new THREE.RingGeometry(0.3, 0.36, 48), new THREE.MeshBasicMaterial({ color: GREEN, transparent: true, opacity: 0.8, side: THREE.DoubleSide, depthWrite: false }));
      ring.rotation.x = -Math.PI / 2;
      ring.position.y = 0.04;
      pin.add(stem, head, halo, ring);
      // string lights around the garden
      const bulbs = [];
      const bulbGeo = new THREE.SphereGeometry(0.045, 8, 6);
      for (let i = 0; i < 14; i++) {
        const a = (i / 14) * Math.PI * 2;
        const b = new THREE.Mesh(bulbGeo, new THREE.MeshBasicMaterial({ color: 0xffc46b, transparent: true }));
        const bx = Math.cos(a) * 0.75, bz = Math.sin(a) * 0.45;
        b.position.set(bx, height(pinXZ.x + bx, pinXZ.y + bz) - pinY + 0.16 + Math.sin(i * 1.7) * 0.04, bz);
        pin.add(b); bulbs.push(b);
      }
      scene.add(pin);

      /* ---- Millennium Cross on the summit ---- */
      let top = { x: 3, z: -6.5, y: 0 };
      for (let x = -6; x <= 10; x += 0.25) for (let z = -10; z <= -3; z += 0.25) { const y = height(x, z); if (y > top.y) top = { x, z, y }; }
      const cross = new THREE.Group();
      const crossMat = new THREE.MeshBasicMaterial({ color: night ? 0xfff6d8 : 0xe9e6df });
      const v = new THREE.Mesh(new THREE.BoxGeometry(0.09, 1.1, 0.09), crossMat); v.position.y = 0.55;
      const hb = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.09, 0.09), crossMat); hb.position.y = 0.78;
      cross.add(v, hb);
      cross.position.set(top.x, top.y, top.z);
      scene.add(cross);

      /* ---- City lights in the valley ---- */
      const N = small ? 1400 : 2600;
      const cityPos = new Float32Array(N * 3), cityRnd = new Float32Array(N);
      let s = 7; const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
      for (let i = 0; i < N; i++) {
        // Denser near the river line (z ≈ 9) and the centre (x ≈ 0)
        const x = (rnd() - 0.5) * 64 * (0.45 + 0.55 * rnd());
        const z = 3 + rnd() ** 1.6 * 16 + Math.sin(x * 0.3) * 0.8;
        cityPos.set([x, height(x, z) + 0.05, z], i * 3);
        cityRnd[i] = rnd();
      }
      const cityGeo = new THREE.BufferGeometry();
      cityGeo.setAttribute('position', new THREE.BufferAttribute(cityPos, 3));
      cityGeo.setAttribute('aRnd', new THREE.BufferAttribute(cityRnd, 1));
      const cityMat = new THREE.ShaderMaterial({
        transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
        uniforms: { uTime: { value: 0 }, uPx: { value: renderer.getPixelRatio() }, uNight: { value: night ? 1 : 0.45 } },
        vertexShader: /* glsl */ `
          attribute float aRnd; uniform float uTime; uniform float uPx; varying float vA; varying float vR;
          void main(){ vec4 mv = modelViewMatrix * vec4(position,1.0); gl_Position = projectionMatrix * mv;
            vR = aRnd; vA = 0.55 + 0.45 * sin(uTime * (0.6 + aRnd * 1.8) + aRnd * 40.0);
            gl_PointSize = (2.2 + aRnd * 3.6) * uPx * (34.0 / -mv.z); }`,
        fragmentShader: /* glsl */ `
          uniform float uNight; varying float vA; varying float vR;
          void main(){ float d = length(gl_PointCoord - 0.5); if (d > 0.5) discard;
            vec3 warm = mix(vec3(1.0,0.72,0.36), vec3(1.0,0.9,0.7), vR);
            if (vR > 0.93) warm = vec3(0.35, 0.95, 0.55);
            gl_FragColor = vec4(warm, (1.0 - d*2.0) * vA * uNight); }`,
      });
      const city = new THREE.Points(cityGeo, cityMat);
      scene.add(city);

      /* ---- Camera, pointer, scroll ---- */
      const target = new THREE.Vector3(small ? 0 : -5.5, 3.2, -4);
      const look = { az: 0, el: 0, taz: 0, tel: 0 };
      let intro = calm ? 1 : 0;
      let scrollK = 0;
      const placeCamera = () => {
        const e = 1 - (1 - intro) ** 3;
        const r = (small ? 44 : 38) - 9 * e - scrollK * 4;
        const az = look.az + (1 - e) * 0.9;
        const el = 0.2 + look.el + (1 - e) * 0.5;
        camera.position.set(target.x + Math.sin(az) * r * Math.cos(el), target.y + Math.sin(el) * r, target.z + Math.cos(az) * r * Math.cos(el));
        camera.lookAt(target.x, target.y - scrollK * 0.6, target.z);
      };
      const onMove = (e) => {
        const r = host.getBoundingClientRect();
        look.taz = ((e.clientX - r.left) / r.width - 0.5) * 0.7;
        look.tel = ((e.clientY - r.top) / r.height - 0.5) * -0.22;
      };
      const onScroll = () => {
        const r = host.getBoundingClientRect();
        scrollK = Math.min(1, Math.max(0, -r.top / r.height));
      };
      const fine = window.matchMedia('(hover: hover) and (pointer: fine)').matches;
      if (fine && !calm) window.addEventListener('pointermove', onMove, { passive: true });

      // Touch: drag sideways to turn the mountain (vertical swipes still scroll the page).
      let drag = null;
      let touched = false;
      const onDown = (e) => {
        if (e.pointerType === 'mouse') return;
        drag = { id: e.pointerId, x: e.clientX, y: e.clientY, az: look.taz, el: look.tel };
        touched = true;
      };
      const onDrag = (e) => {
        if (!drag || e.pointerId !== drag.id) return;
        const w = host.clientWidth || 1;
        look.taz = Math.max(-1.1, Math.min(1.1, drag.az + ((e.clientX - drag.x) / w) * 1.6));
        look.tel = Math.max(-0.16, Math.min(0.2, drag.el - ((e.clientY - drag.y) / w) * 0.3));
        if (calm) { look.az = look.taz; look.el = look.tel; render(0); }
      };
      const onUp = (e) => { if (drag && e.pointerId === drag.id) drag = null; };
      host.addEventListener('pointerdown', onDown, { passive: true });
      host.addEventListener('pointermove', onDrag, { passive: true });
      host.addEventListener('pointerup', onUp, { passive: true });
      host.addEventListener('pointercancel', onUp, { passive: true });
      if (!calm) window.addEventListener('scroll', onScroll, { passive: true });

      /* ---- Labels follow their 3D points ---- */
      const anchors = [
        ['pin', new THREE.Vector3(pinBase.x, pinBase.y + 1.7, pinBase.z)],
        ['cross', new THREE.Vector3(top.x, top.y + 1.2, top.z)],
        ['city', new THREE.Vector3(small ? 2 : 13, 0.4, 5)],
      ];
      const tmp = new THREE.Vector3();
      let W0 = 1, H0 = 1;
      const placeLabels = () => {
        for (const [k, p] of anchors) {
          const el = tagRefs[k].current;
          if (!el) continue;
          tmp.copy(p).project(camera);
          const py = ((1 - tmp.y) / 2) * H0;
          const vis = tmp.z < 1 && Math.abs(tmp.x) < 0.92 && py > 90 && py < H0 - 20;
          el.style.transform = `translate(${((tmp.x + 1) / 2) * W0}px, ${((1 - tmp.y) / 2) * H0}px)`;
          el.style.opacity = vis ? '' : '0';
        }
      };

      const resize = () => {
        W0 = host.clientWidth; H0 = host.clientHeight;
        renderer.setSize(W0, H0, false);
        camera.aspect = W0 / H0;
        camera.fov = W0 < 700 ? 48 : 38;
        camera.updateProjectionMatrix();
        render(0);
      };

      let raf = 0, last = performance.now(), running = false, t = 0;
      function render(dt) {
        t += dt;
        if (intro < 1) intro = Math.min(1, intro + dt / 2.4);
        if (!fine && !touched && intro >= 1) look.taz = Math.sin(t * 0.35) * 0.35; // gentle sway until the first touch
        look.az += (look.taz - look.az) * Math.min(1, dt * 3);
        look.el += (look.tel - look.el) * Math.min(1, dt * 3);
        terrainMat.uniforms.uTime.value = t;
        cityMat.uniforms.uTime.value = t;
        const p = (t * 0.6) % 1;
        ring.scale.setScalar(1 + p * 2.6);
        ring.material.opacity = 0.85 * (1 - p);
        halo.scale.setScalar(1 + Math.sin(t * 2) * 0.12);
        bulbs.forEach((b, i) => { b.material.opacity = 0.55 + 0.45 * Math.sin(t * 2.2 + i); });
        placeCamera();
        renderer.render(scene, camera);
        placeLabels();
      }
      const loop = (now) => {
        const dt = Math.min(0.05, (now - last) / 1000);
        last = now;
        render(dt);
        raf = requestAnimationFrame(loop);
      };
      const start = () => { if (running || calm) return; running = true; last = performance.now(); raf = requestAnimationFrame(loop); };
      const stop = () => { running = false; cancelAnimationFrame(raf); };

      const ro = new ResizeObserver(resize);
      ro.observe(host);
      resize();
      const io = new IntersectionObserver(([en]) => (en.isIntersecting && !document.hidden ? start() : stop()));
      io.observe(host);
      const onVis = () => (document.hidden ? stop() : start());
      document.addEventListener('visibilitychange', onVis);
      render(0);
      setState('ready');

      cleanup = () => {
        stop(); ro.disconnect(); io.disconnect();
        document.removeEventListener('visibilitychange', onVis);
        window.removeEventListener('pointermove', onMove);
        host.removeEventListener('pointerdown', onDown);
        host.removeEventListener('pointermove', onDrag);
        host.removeEventListener('pointerup', onUp);
        host.removeEventListener('pointercancel', onUp);
        window.removeEventListener('scroll', onScroll);
        scene.traverse((o) => { o.geometry?.dispose?.(); o.material?.dispose?.(); });
        renderer.dispose();
        renderer.domElement.remove();
      };
    })().catch(() => setState('fallback'));

    return () => { disposed = true; cleanup(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className={`vodno is-${state}`} ref={hostRef} role="img" aria-label={labels.sceneLabel}>
      {state === 'fallback' && <img className="vodno__fallback" src={A('photos/hero.webp')} width="1440" height="810" alt="" />}
      <span className="vodno__tag vodno__tag--pin" ref={tagRefs.pin} aria-hidden="true"><i />{labels.pin}</span>
      <span className="vodno__tag" ref={tagRefs.cross} aria-hidden="true">{labels.cross}</span>
      <span className="vodno__tag vodno__tag--city" ref={tagRefs.city} aria-hidden="true">{labels.city}</span>
    </div>
  );
}
