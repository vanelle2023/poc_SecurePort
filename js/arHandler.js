import * as THREE from 'three';
import { ARButton } from 'three/examples/jsm/webxr/ARButton.js';
import TWEEN from 'https://unpkg.com/@tweenjs/tween.js@18.6.4/dist/tween.esm.js';

export function setupAR(app) {
  const { renderer, scene, camera } = app;

  const hint = document.getElementById('hint');
  const controlsDiv = document.getElementById('controls');

  // === Zustände ===
  let reticle, hitTestSource = null, localRefSpace = null;
  let hitTestReady = false, arPlaced = false;
  let dragging = false, floatMode = false;
  let planeTrackingSupported = false;

  // === UI Buttons ===
  const floatBtn = createButton('🪁 Schwebemodus', 'bottom:80px;right:20px;', () => {
    floatMode = !floatMode;
    floatBtn.textContent = floatMode ? '🛬 Stop' : '🪁 Schwebemodus';
    if (app.model) app.model.baseY = app.model.position.y;
  });

  const ui = document.createElement('div');
  ui.innerHTML = `
    <button id="scaleUp" class="ctrl-btn">🔍+</button>
    <button id="scaleDown" class="ctrl-btn">🔍−</button>
    <button id="rotate" class="ctrl-btn">🔄</button>
  `;
  Object.assign(ui.style, {
    position: 'fixed',
    bottom: '20px',
    left: '50%',
    transform: 'translateX(-50%)',
    display: 'none',
    gap: '10px',
    zIndex: 40
  });
  document.body.appendChild(ui);

  const scaleUpBtn = ui.querySelector('#scaleUp');
  const scaleDownBtn = ui.querySelector('#scaleDown');
  const rotateBtn = ui.querySelector('#rotate');

  scaleUpBtn.onclick = () => app.model?.scale.multiplyScalar(1.1);
  scaleDownBtn.onclick = () => app.model?.scale.multiplyScalar(0.9);
  rotateBtn.onclick = () => app.model?.rotation.y += Math.PI / 6;

  // === Reticle (Platzierungsanzeige) ===
  initReticle();

  // === AR Button mit intelligentem Fallback ===
  const supportsDomOverlay = navigator.userAgent.includes('Chrome') && /Android/i.test(navigator.userAgent);

  const features = {
    requiredFeatures: ['hit-test'],
    optionalFeatures: ['local-floor', 'plane-detection'],
  };
  if (supportsDomOverlay) {
    features.optionalFeatures.push('dom-overlay');
    features.domOverlay = { root: document.body };
  }

  try {
    const arBtn = ARButton.createButton(renderer, features);
    document.body.appendChild(arBtn);
  } catch (e) {
    console.warn('⚠️ ARButton konnte nicht erstellt werden:', e);
  }

  // === Session Start ===
  renderer.xr.addEventListener('sessionstart', async () => {
    controlsDiv.style.display = 'none';
    hint.style.display = 'block';
    hint.textContent = 'Scanne eine Oberfläche (Tisch oder Boden)...';
    floatBtn.style.display = 'none';
    ui.style.display = 'none';
    arPlaced = false;

    const session = renderer.xr.getSession();
    try {
      const viewerSpace = await session.requestReferenceSpace('viewer');
      localRefSpace = await session.requestReferenceSpace('local-floor');
      hitTestSource = await session.requestHitTestSource({ space: viewerSpace });
      hitTestReady = true;
      planeTrackingSupported = true;
    } catch (e) {
      console.warn('⚠️ Kein HitTest – Fallback aktiv.');
      planeTrackingSupported = false;
    }

    // Dragging Events
    session.addEventListener('selectstart', () => {
      if (arPlaced) dragging = true;
    });
    session.addEventListener('selectend', () => {
      dragging = false;
    });
  });

  // === Session Ende ===
  renderer.xr.addEventListener('sessionend', () => {
    controlsDiv.style.display = 'flex';
    floatBtn.style.display = 'none';
    ui.style.display = 'none';
    reticle.visible = false;
    hitTestSource = null;
    hitTestReady = false;
    if (app.model && !scene.children.includes(app.model)) scene.add(app.model);
  });

  // === Tap → Modell platzieren ===
  renderer.xr.addEventListener('select', () => {
    if (!app.model) return;

    if (!arPlaced) {
      let pos = new THREE.Vector3();
      if (planeTrackingSupported && reticle.visible) {
        pos.setFromMatrixPosition(reticle.matrix);
      } else {
        pos.set(0, -0.3, -1.0).applyMatrix4(camera.matrixWorld);
      }

      app.model.position.copy(pos);
      app.model.rotation.set(0, 0, 0);
      app.model.scale.setScalar(0.001);
      app.model.traverse(o => {
        if (o.isMesh) {
          o.castShadow = true;
          o.receiveShadow = true;
        }
      });
      scene.add(app.model);

      // sanfte Pop-In Animation
      new TWEEN.Tween(app.model.scale)
        .to({ x: 1, y: 1, z: 1 }, 800)
        .easing(TWEEN.Easing.Elastic.Out)
        .start();

      addShadowPlane(scene, app.model);

      arPlaced = true;
      floatBtn.style.display = 'block';
      ui.style.display = 'flex';
      reticle.visible = false;
      hint.textContent = '🎉 Modell platziert! Du kannst es drehen, skalieren oder bewegen.';
      return;
    }
  });

  // === Render Loop ===
  renderer.setAnimationLoop((timestamp, frame) => {
    if (hitTestReady && frame && !arPlaced && planeTrackingSupported) {
      const hits = frame.getHitTestResults(hitTestSource);
      if (hits.length > 0) {
        const hit = hits[0];
        const pose = hit.getPose(localRefSpace);
        reticle.visible = true;
        reticle.matrix.fromArray(pose.transform.matrix);
        const s = 1 + 0.05 * Math.sin(performance.now() / 200);
        reticle.scale.set(s, s, s);
        hint.textContent = '📍 Tippe, um das Modell zu platzieren';
      } else {
        reticle.visible = false;
        hint.textContent = 'Bewege dein Gerät, um eine Fläche zu finden.';
      }
    }

    // Drag-Bewegung nach Platzierung
    if (dragging && hitTestReady && frame) {
      const hits = frame.getHitTestResults(hitTestSource);
      if (hits.length > 0) {
        const pose = hits[0].getPose(localRefSpace);
        const pos = new THREE.Vector3().setFromMatrixPosition(new THREE.Matrix4().fromArray(pose.transform.matrix));
        app.model.position.lerp(pos, 0.25);
      }
    }

    // Float Mode Animation
    if (floatMode && app.model) {
      app.model.rotation.y += 0.005;
      app.model.position.y = app.model.baseY + 0.03 * Math.sin(Date.now() / 300);
    }

    TWEEN.update();
    renderer.render(scene, camera);
  });

  // === Hilfsfunktionen ===
  function initReticle() {
    const geo = new THREE.RingGeometry(0.15, 0.2, 32).rotateX(-Math.PI / 2);
    const mat = new THREE.MeshBasicMaterial({
      color: 0x00ffff,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.8
    });
    reticle = new THREE.Mesh(geo, mat);
    reticle.matrixAutoUpdate = false;
    reticle.visible = false;
    scene.add(reticle);
  }

  function createButton(text, style, onClick) {
    const btn = document.createElement('button');
    btn.textContent = text;
    btn.className = 'ctrl-btn';
    Object.assign(btn.style, {
      position: 'fixed',
      zIndex: 25,
      display: 'none',
      ...Object.fromEntries(style.split(';').filter(Boolean).map(s => s.split(':').map(t => t.trim())))
    });
    btn.addEventListener('click', onClick);
    document.body.appendChild(btn);
    return btn;
  }

  function addShadowPlane(scene, model) {
    const shadowPlane = new THREE.Mesh(
      new THREE.PlaneGeometry(2, 2),
      new THREE.ShadowMaterial({ opacity: 0.3 })
    );
    shadowPlane.rotation.x = -Math.PI / 2;
    shadowPlane.position.y = model.position.y - 0.001;
    shadowPlane.receiveShadow = true;
    scene.add(shadowPlane);
  }
}
