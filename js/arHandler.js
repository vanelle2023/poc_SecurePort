import * as THREE from 'three';
import { ARButton } from 'three/examples/jsm/webxr/ARButton.js';
import TWEEN from 'https://unpkg.com/@tweenjs/tween.js@18.6.4/dist/tween.esm.js';

export function setupAR(app) {
  const { renderer, scene, camera } = app;

  const hint = document.getElementById('hint');
  const controlsDiv = document.getElementById('controls');

  // AR-State
  let reticle;
  let hitTestSource = null;
  let hitTestSourceInitialized = false;
  let localFloor = null;
  let arPlaced = false;
  let floatMode = false;
  let planeTrackingSupported = false;

  // --- Buttons ---
  const floatBtn = document.createElement('button');
  floatBtn.textContent = '🪁 Schwebemodus';
  floatBtn.className = 'ctrl-btn';
  Object.assign(floatBtn.style, {
    position: 'fixed',
    bottom: '80px',
    right: '20px',
    zIndex: '25',
    display: 'none'
  });
  document.body.appendChild(floatBtn);

  floatBtn.addEventListener('click', () => {
    floatMode = !floatMode;
    floatBtn.textContent = floatMode ? '🛬 Stop' : '🪁 Schwebemodus';
    if (app.model) app.model.baseY = app.model.position.y;
  });

  // --- Reticle ---
  initReticle();

  // --- AR Button ---
  document.body.appendChild(ARButton.createButton(renderer, { requiredFeatures: ['local-floor'] }));

  // --- Session Start ---
  renderer.xr.addEventListener('sessionstart', async () => {
    controlsDiv.style.display = 'none';
    hint.style.display = 'block';
    hint.textContent = 'Suche eine Oberfläche (z. B. Tisch oder Boden)...';
    reticle.visible = false;
    arPlaced = false;
    floatBtn.style.display = 'none';

    const session = renderer.xr.getSession();

    try {
      const [viewerSpace, floorSpace] = await Promise.all([
        session.requestReferenceSpace('viewer'),
        session.requestReferenceSpace('local-floor')
      ]);

      localFloor = floorSpace;
      const source = await session.requestHitTestSource({ space: viewerSpace });
      hitTestSource = source;
      hitTestSourceInitialized = true;
      planeTrackingSupported = true;
    } catch (err) {
      console.warn('⚠️ HitTest nicht unterstützt – Fallback aktiv.');
      planeTrackingSupported = false;
    }
  });

  // --- Session Ende ---
  renderer.xr.addEventListener('sessionend', () => {
    controlsDiv.style.display = 'flex';
    reticle.visible = false;
    floatBtn.style.display = 'none';
    hitTestSource = null;
    hitTestSourceInitialized = false;
    if (app.model && !scene.children.includes(app.model)) scene.add(app.model);
  });

  // --- Tap / Select Event ---
  renderer.xr.addEventListener('select', () => {
    if (!app.model) return;

    // --- 1. Platzierung ---
    if (!arPlaced) {
      let pos = new THREE.Vector3();

      if (planeTrackingSupported && reticle.visible) {
        pos.setFromMatrixPosition(reticle.matrix);
      } else {
        // Fallback: einfach vor Kamera
        pos.set(0, -0.3, -1.0).applyMatrix4(camera.matrixWorld);
      }

      app.model.position.copy(pos);
      app.model.rotation.set(0, 0, 0);
      app.model.scale.setScalar(0.001);
      scene.add(app.model);

      // Pop-In Animation
      new TWEEN.Tween(app.model.scale)
        .to({ x: 1, y: 1, z: 1 }, 800)
        .easing(TWEEN.Easing.Elastic.Out)
        .start();

      reticle.visible = false;
      arPlaced = true;
      floatBtn.style.display = 'block';
      hint.textContent = '🎉 Modell platziert! Tippe Gebäude für Infos.';
      return;
    }

    // --- 2. Interaktion nach Platzierung ---
    const raycaster = new THREE.Raycaster();
    raycaster.setFromCamera({ x: 0, y: 0 }, camera);
    const hits = raycaster.intersectObjects(app.model.children, true);

    if (hits.length > 0) {
      const hit = hits[0].object;

      new TWEEN.Tween(hit.scale)
        .to({ x: 1.2, y: 1.2, z: 1.2 }, 200)
        .yoyo(true)
        .repeat(1)
        .easing(TWEEN.Easing.Quadratic.Out)
        .start();

      showPopup(hit.name || 'Gebäude', hit.userData?.nutzung || 'Keine Infos');
    }
  });

  // --- Render Loop ---
  renderer.setAnimationLoop((timestamp, frame) => {
    if (hitTestSourceInitialized && frame && !arPlaced && planeTrackingSupported) {
      const refSpace = localFloor || renderer.xr.getReferenceSpace();
      const hits = frame.getHitTestResults(hitTestSource);

      if (hits.length > 0) {
        const hit = hits[0];
        const pose = hit.getPose(refSpace);
        reticle.visible = true;
        reticle.matrix.fromArray(pose.transform.matrix);
        const s = 1 + 0.05 * Math.sin(performance.now() / 200);
        reticle.scale.set(s, s, s);
        hint.textContent = '📍 Tippe, um das Modell zu platzieren';
      } else {
        reticle.visible = false;
        hint.textContent = 'Suche eine Fläche mit Struktur (z. B. Tisch)';
      }
    } else if (!planeTrackingSupported && !arPlaced) {
      reticle.visible = true;
      reticle.position.set(0, -0.3, -1.0).applyMatrix4(camera.matrixWorld);
      hint.textContent = 'Gerät unterstützt kein AR-Tracking → Modell wird vor Kamera platziert';
    }

    // Float Mode
    if (floatMode && app.model) {
      app.model.rotation.y += 0.005;
      app.model.position.y = app.model.baseY + 0.03 * Math.sin(Date.now() / 300);
    }

    TWEEN.update();
    renderer.render(scene, camera);
  });

  // --- Hilfsfunktionen ---
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

  function showPopup(title, info) {
    const div = document.createElement('div');
    div.textContent = `🏙️ ${title}\n${info}`;
    Object.assign(div.style, {
      position: 'fixed',
      bottom: '140px',
      left: '50%',
      transform: 'translateX(-50%)',
      background: 'rgba(0,0,0,0.8)',
      color: '#fff',
      padding: '8px 14px',
      borderRadius: '10px',
      fontSize: '15px',
      zIndex: 30,
      whiteSpace: 'pre-line',
      textAlign: 'center',
      opacity: 0,
      transition: 'opacity 0.3s ease'
    });
    document.body.appendChild(div);
    requestAnimationFrame(() => (div.style.opacity = 1));
    setTimeout(() => {
      div.style.opacity = 0;
      setTimeout(() => div.remove(), 400);
    }, 2000);
  }
}
