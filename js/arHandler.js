import * as THREE from 'three';
import { ARButton } from 'three/examples/jsm/webxr/ARButton.js';

export function setupAR(app) {
  const { renderer, scene, camera } = app;

  // UI Elemente
  const hint = document.getElementById('hint');
  const controlsDiv = document.getElementById('controls');

  // AR state initialisieren
  app.ar = {
    hitTestSourceRequested: false,
    hitTestSource: null,
    reticle: null,
    modelPlaced: false
  };

  // AR Button einbinden
  document.body.appendChild(
    ARButton.createButton(renderer, {
      requiredFeatures: ['hit-test', 'local-floor']
    })
  );

  // Reticle aufsetzen (grüner Kreis)
  const ringGeo = new THREE.RingGeometry(0.15, 0.2, 32).rotateX(-Math.PI / 2);
  const ringMat = new THREE.MeshBasicMaterial({
    color: 0x00ff33,
    side: THREE.DoubleSide,
    transparent: true,
    opacity: 0.9
  });
  const reticle = new THREE.Mesh(ringGeo, ringMat);
  reticle.matrixAutoUpdate = false;
  reticle.visible = false;
  scene.add(reticle);

  app.ar.reticle = reticle;

  // AR Controller für 'select'
  const controller = renderer.xr.getController(0);
  controller.addEventListener('select', () => {
    // Nur Modell platzieren, wenn noch nicht platziert
    if (!app.model || app.ar.modelPlaced) return;

    let pos = new THREE.Vector3();
    if (app.ar.reticle.visible) {
      pos.setFromMatrixPosition(app.ar.reticle.matrix);
    } else {
      // Notfallplatzierung vor die Kamera
      pos.set(0, -0.3, -1.0).applyMatrix4(camera.matrixWorld);
    }
    app.model.position.copy(pos);
    app.model.rotation.set(0, 0, 0);
    app.model.scale.setScalar(1);

    scene.add(app.model);
    app.ar.modelPlaced = true;
    app.ar.reticle.visible = false;

    if (hint) hint.textContent = '🎉 Modell platziert!';
  });
  scene.add(controller);

  // --- Hit-Test-Quelle anfordern ---
  function requestHitTestSource() {
    const session = renderer.xr.getSession();
    if (!session || app.ar.hitTestSourceRequested) return;

    session.requestReferenceSpace('viewer').then((referenceSpace) => {
      session.requestHitTestSource({ space: referenceSpace }).then((source) => {
        app.ar.hitTestSource = source;
      }).catch(err => {
        console.error("Fehler bei requestHitTestSource:", err);
        if (hint) hint.textContent = 'Fehler bei AR-HitTest!';
      });
    }).catch(err => {
      console.error("Fehler bei requestReferenceSpace:", err);
      if (hint) hint.textContent = 'Fehler bei AR-Referenz!';
    });

    app.ar.hitTestSourceRequested = true;
  }

  // --- AR Session Event Listener ---
  renderer.xr.addEventListener('sessionstart', () => {
    app.ar.hitTestSourceRequested = false;
    app.ar.hitTestSource = null;
    app.ar.reticle.visible = false;
    app.ar.modelPlaced = false;

    requestHitTestSource();

    if (controlsDiv) controlsDiv.style.display = 'none';
    if (hint) {
      hint.style.display = 'block';
      hint.textContent = 'Scanne Boden/Oberfläche...';
    }
  });
  renderer.xr.addEventListener('sessionend', () => {
    app.ar.hitTestSourceRequested = false;
    app.ar.hitTestSource = null;
    app.ar.reticle.visible = false;
    app.ar.modelPlaced = false;
    if (controlsDiv) controlsDiv.style.display = 'flex';
  });

  // --- Render Loop für Reticle ---
  renderer.setAnimationLoop((timestamp, frame) => {
    // Modell schon platziert? Kein Reticle mehr anzeigen
    if (frame && !app.ar.modelPlaced && app.ar.hitTestSource) {
      const hitTestResults = frame.getHitTestResults(app.ar.hitTestSource);

      if (hitTestResults.length > 0) {
        const hit = hitTestResults[0];
        const referenceSpace = renderer.xr.getReferenceSpace();
        const pose = hit.getPose(referenceSpace);
        if (pose) {
          app.ar.reticle.visible = true;
          app.ar.reticle.matrix.fromArray(pose.transform.matrix);
          const s = 1 + 0.05 * Math.sin(performance.now() / 200);
          app.ar.reticle.scale.set(s, s, s);
          if (hint) hint.textContent = '📍 Tippe, um das Modell zu platzieren';
        } else {
          app.ar.reticle.visible = false;
          if (hint) hint.textContent = 'Suche Oberfläche... (Pose fehlgeschlagen)';
        }
      } else {
        app.ar.reticle.visible = false;
        if (hint) hint.textContent = 'Suche Oberfläche...';
      }
    } else if (hint && app.ar.hitTestSourceRequested && !app.ar.modelPlaced) {
      hint.textContent = 'Lade AR...';
    }

    renderer.render(scene, camera);
  });
}
