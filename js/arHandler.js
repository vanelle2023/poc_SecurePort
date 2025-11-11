import * as THREE from 'three';
import { ARButton } from 'three/examples/jsm/webxr/ARButton.js';
import TWEEN from 'https://unpkg.com/@tweenjs/tween.js@18.6.4/dist/tween.esm.js';

export function setupAR(app) {
  const { renderer, scene, camera } = app;

  // UI
  const hint = document.getElementById('hint');
  const controlsDiv = document.getElementById('controls');

  // State
  let reticle;
  let hitTestSource = null;
  let hitTestSourceInitialized = false;
  let arPlaced = false;
  let floatMode = false;

  // --- AR Button erstellen ---
  document.body.appendChild(ARButton.createButton(renderer, { requiredFeatures: ['local-floor'] }));

  // --- Reticle initialisieren ---
  initReticle();

  // --- Extra Button (Schwebemodus) ---
  const floatBtn = document.createElement('button');
  floatBtn.textContent = '🪁 Schwebemodus';
  floatBtn.className = 'ctrl-btn';
  floatBtn.style.position = 'fixed';
  floatBtn.style.bottom = '80px';
  floatBtn.style.right = '20px';
  floatBtn.style.zIndex = '25';
  floatBtn.style.display = 'none';
  document.body.appendChild(floatBtn);

  floatBtn.addEventListener('click', () => {
    floatMode = !floatMode;
    floatBtn.textContent = floatMode ? '🛬 Stop' : '🪁 Schwebemodus';
    if (app.model) app.model.baseY = app.model.position.y;
  });

  // --- AR Session Start ---
  renderer.xr.addEventListener('sessionstart', () => {
    controlsDiv.style.display = 'none';
    hint.textContent = 'Bewege dein Gerät, um eine Fläche (z. B. Tisch) zu finden...';
    hint.style.display = 'block';
    reticle.visible = false;
    arPlaced = false;
    floatBtn.style.display = 'none';

    const session = renderer.xr.getSession();
    session.requestReferenceSpace('viewer').then((refSpace) => {
      session.requestHitTestSource({ space: refSpace }).then((source) => {
        hitTestSource = source;
        hitTestSourceInitialized = true;
      });
    });
  });

  // --- AR Session Ende ---
  renderer.xr.addEventListener('sessionend', () => {
    controlsDiv.style.display = 'flex';
    reticle.visible = false;
    floatBtn.style.display = 'none';
    hitTestSource = null;
    hitTestSourceInitialized = false;
    if (app.model && !scene.children.includes(app.model)) scene.add(app.model);
  });

  // --- Tippen / Platzieren ---
  renderer.xr.addEventListener('select', () => {
    if (!app.model) return;

    // 1. Platzierung
    if (!arPlaced && reticle.visible) {
      // Modell an Reticle-Position setzen
      const pos = new THREE.Vector3();
      pos.setFromMatrixPosition(reticle.matrix);
      app.model.position.copy(pos);
      app.model.rotation.set(0, 0, 0);
      app.model.scale.setScalar(0.001);
      scene.add(app.model);

      // Pop-in Animation
      new TWEEN.Tween(app.model.scale)
        .to({ x: 1, y: 1, z: 1 }, 800)
        .easing(TWEEN.Easing.Elastic.Out)
        .start();

      // Optisches Feedback
      const glow = createGlowEffect();
      glow.position.copy(pos);
      scene.add(glow);
      new TWEEN.Tween(glow.material)
        .to({ opacity: 0 }, 1500)
        .onComplete(() => scene.remove(glow))
        .start();

      reticle.visible = false;
      arPlaced = true;
      floatBtn.style.display = 'block';
      hint.textContent = '🎉 Modell platziert! Tippe Gebäude für Infos.';
      return;
    }

    // 2. Interaktion mit Modell
    if (arPlaced) {
      const raycaster = new THREE.Raycaster();
      raycaster.setFromCamera({ x: 0, y: 0 }, camera);
      const hits = raycaster.intersectObjects(app.model.children, true);

      if (hits.length > 0) {
        const hit = hits[0].object;

        // kleine "Boing"-Animation
        new TWEEN.Tween(hit.scale)
          .to({ x: 1.2, y: 1.2, z: 1.2 }, 180)
          .yoyo(true)
          .repeat(1)
          .easing(TWEEN.Easing.Quadratic.Out)
          .start();

        // optionales Info-Popup
        showPopup(hit.name, hit.userData?.nutzung || 'Unbekannt');
      }
    }
  });

  // --- Render Loop / AR-HitTest ---
  renderer.setAnimationLoop((timestamp, frame) => {
    if (hitTestSourceInitialized && frame && !arPlaced) {
      const refSpace = renderer.xr.getReferenceSpace();
      const hits = frame.getHitTestResults(hitTestSource);

      if (hits.length > 0) {
        const hit = hits[0];
        const pose = hit.getPose(refSpace);
        reticle.visible = true;
        reticle.matrix.fromArray(pose.transform.matrix);

        // Atmende Reticle-Animation
        const s = 1 + 0.05 * Math.sin(performance.now() / 200);
        reticle.scale.set(s, s, s);

        hint.textContent = '📍 Tippe auf die Fläche, um zu platzieren';
      } else {
        reticle.visible = false;
        hint.textContent = 'Suche eine stabile Fläche (Tisch, Boden)...';
      }
    }

    // Floating Mode Animation
    if (floatMode && app.model) {
      app.model.rotation.y += 0.005;
      app.model.position.y = app.model.baseY + 0.03 * Math.sin(Date.now() / 300);
    }

    // Update Tween Animationen
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
      opacity: 0.8,
    });
    reticle = new THREE.Mesh(geo, mat);
    reticle.matrixAutoUpdate = false;
    reticle.visible = false;
    scene.add(reticle);
  }

  function createGlowEffect() {
    const geo = new THREE.RingGeometry(0.25, 0.4, 64).rotateX(-Math.PI / 2);
    const mat = new THREE.MeshBasicMaterial({
      color: 0x00ffff,
      transparent: true,
      opacity: 0.6,
      side: THREE.DoubleSide,
    });
    return new THREE.Mesh(geo, mat);
  }

  function showPopup(title, info) {
    const div = document.createElement('div');
    div.textContent = `🏙️ ${title}\n${info}`;
    Object.assign(div.style, {
      position: 'fixed',
      bottom: '140px',
      left: '50%',
      transform: 'translateX(-50%)',
      background: 'rgba(0,0,0,0.75)',
      color: '#fff',
      padding: '8px 14px',
      borderRadius: '10px',
      fontSize: '15px',
      zIndex: 30,
      whiteSpace: 'pre-line',
      textAlign: 'center',
      opacity: 0,
      transition: 'opacity 0.3s ease',
    });
    document.body.appendChild(div);
    requestAnimationFrame(() => (div.style.opacity = 1));
    setTimeout(() => {
      div.style.opacity = 0;
      setTimeout(() => div.remove(), 400);
    }, 2000);
  }
}
