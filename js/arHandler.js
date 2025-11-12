// js/arHandler.js
import * as THREE from 'three';
import { ARButton } from 'three/examples/jsm/webxr/ARButton.js';
// TWEEN ist im Originalcode enthalten, daher füge ich es hinzu, um die Skalierung zu ermöglichen
import TWEEN from 'https://unpkg.com/@tweenjs/tween.js@18.6.4/dist/tween.esm.js';

export function setupAR(app) {
  const { renderer, scene, camera } = app;

  const hint = document.getElementById('hint');

  // simple state
  app.ar = app.ar || {};
  app.ar.hitTestSourceRequested = false;
  app.ar.hitTestSource = null;
  app.ar.reticle = null;
  app.ar.modelPlaced = false;

  // --- AR Button (request hit-test AND local-floor features) ---
  document.body.appendChild(
    ARButton.createButton(renderer, { 
      requiredFeatures: ['hit-test', 'local-floor'] // <- Hinzugefügt: 'local-floor'
    })
  );

  // --- Reticle (green ring) ---
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

  // controller for 'select' like Nik does
  const controller = renderer.xr.getController(0);
  controller.addEventListener('select', onSelect);
  scene.add(controller);

  // --- Session Event Listeners ---
  renderer.xr.addEventListener('sessionstart', () => {
    // Initialer Hinweis bei Start
    if(hint) hint.textContent = 'Suche eine Oberfläche...';
  });

  renderer.xr.addEventListener('sessionend', () => {
    app.ar.hitTestSourceRequested = false;
    app.ar.hitTestSource = null;
    app.ar.reticle.visible = false;
    app.ar.modelPlaced = false;
    // Wenn das Modell sichtbar war, wird es automatisch wieder in der Szene sein,
    // aber wir setzen die Animation zurück, falls nötig.
  });

  // --- request hit-test source (like Nik's requestHitTestSource) ---
  function requestHitTestSource() {
    const session = renderer.xr.getSession();
    if (!session) return;
    
    // Die Hit-Test-Quelle wird im 'viewer'-Raum erstellt
    session.requestReferenceSpace('viewer').then((referenceSpace) => {
      session.requestHitTestSource({ space: referenceSpace }).then((source) => {
        app.ar.hitTestSource = source;
      });
    });

    app.ar.hitTestSourceRequested = true;
  }

  // --- select handler: place model ---
  function onSelect() {
    if (!app.model) return;

    // Nur das erste Platzieren behandeln (wie im Originalcode)
    if (!app.ar.modelPlaced && app.ar.reticle.visible) {
      
      // Platzierung an Reticle-Position
      app.model.position.setFromMatrixPosition(app.ar.reticle.matrix);
      app.model.rotation.set(0, 0, 0); // Rotation zurücksetzen
      app.model.scale.setScalar(0.001); // Startskalierung für Animation
      
      scene.add(app.model);
      app.model.visible = true; // Sicherstellen, dass es sichtbar ist (falls vorher unsichtbar)
      
      // Pop-In Animation (TWEEN erforderlich)
      new TWEEN.Tween(app.model.scale)
        .to({ x: 1, y: 1, z: 1 }, 800)
        .easing(TWEEN.Easing.Elastic.Out)
        .start();

      app.ar.reticle.visible = false;
      app.ar.modelPlaced = true;
      if(hint) hint.textContent = '🎉 Modell platziert!';
      
    } else if (!app.ar.modelPlaced && !app.ar.reticle.visible) {
      // Fallback: Platzierung ohne Reticle (wie im Original-Fallback)
      const pos = new THREE.Vector3(0, -0.3, -1.0).applyMatrix4(camera.matrixWorld);
      app.model.position.copy(pos);
      app.model.scale.setScalar(1); // Keine Animation im Fallback
      scene.add(app.model);
      app.model.visible = true;
      app.ar.modelPlaced = true;
      if(hint) hint.textContent = '🎉 Modell im Fallback platziert!';
    }
    
    // Ansonsten (wenn Modell platziert ist) passiert bei onSelect nichts (keine Interaktion in dieser einfachen Version)
  }

  // --- Render Loop ---
  renderer.setAnimationLoop(function (timestamp, frame) {
    
    TWEEN.update(); // Wichtig für die Animation
    
    // Nur Reticle anzeigen, wenn HitTest verfügbar und Modell noch nicht platziert
    if (frame && !app.ar.modelPlaced) {
      if (!app.ar.hitTestSourceRequested) {
        requestHitTestSource();
      }

      if (app.ar.hitTestSource) {
        const hitTestResults = frame.getHitTestResults(app.ar.hitTestSource);
        
        if (hitTestResults.length > 0) {
          const hit = hitTestResults[0];
          
          // Verwende den globalen Referenzraum der Session für die Pose (local-floor)
          const referenceSpace = renderer.xr.getReferenceSpace();
          const pose = hit.getPose(referenceSpace);
          
          if (pose) {
            app.ar.reticle.visible = true;
            app.ar.reticle.matrix.fromArray(pose.transform.matrix);
            // Optische Skalierung/Animation des Reticle
            const s = 1 + 0.05 * Math.sin(performance.now() / 200);
            app.ar.reticle.scale.set(s, s, s); 
            if(hint) hint.textContent = '📍 Tippe, um das Modell zu platzieren';
          } else {
            app.ar.reticle.visible = false;
            if(hint) hint.textContent = 'Suche eine Oberfläche...';
          }
        } else {
          app.ar.reticle.visible = false;
          if(hint) hint.textContent = 'Suche eine Oberfläche...';
        }
      }
    }
    
    renderer.render(scene, camera);
  });
}
