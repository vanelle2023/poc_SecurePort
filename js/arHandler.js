import * as THREE from 'three';
import { ARButton } from 'three/examples/jsm/webxr/ARButton.js';
import TWEEN from 'https://unpkg.com/@tweenjs/tween.js@18.6.4/dist/tween.esm.js'; 

export function setupAR(app) {
  const { renderer, scene, camera } = app;

  const hint = document.getElementById('hint');
  const controlsDiv = document.getElementById('controls');

  // simple state
  app.ar = app.ar || {};
  app.ar.hitTestSourceRequested = false;
  app.ar.hitTestSource = null;
  app.ar.reticle = null;
  app.ar.modelPlaced = false;

  // --- AR Button (request hit-test AND local-floor features) ---
  document.body.appendChild(
    ARButton.createButton(renderer, { 
      requiredFeatures: ['hit-test', 'local-floor'] 
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
  
  // --- request hit-test source ---
  function requestHitTestSource() {
    const session = renderer.xr.getSession();
    if (!session || app.ar.hitTestSourceRequested) return;
    
    // Die Hit-Test-Quelle wird im 'viewer'-Raum erstellt
    session.requestReferenceSpace('viewer').then((referenceSpace) => {
      session.requestHitTestSource({ space: referenceSpace }).then((source) => {
        app.ar.hitTestSource = source;
      }).catch(err => console.error("HitTest-Quelle konnte nicht erstellt werden:", err));
    }).catch(err => console.error("Viewer Reference Space konnte nicht erstellt werden:", err));

    app.ar.hitTestSourceRequested = true;
  }

  // --- Session Event Listeners ---
  renderer.xr.addEventListener('sessionstart', async () => {
      // 1. Modelle entfernen (GroundMesh + Hauptmodell)
      if (app.groundMesh && scene.children.includes(app.groundMesh)) {
          scene.remove(app.groundMesh);
      }
      if (app.model && scene.children.includes(app.model)) {
          scene.remove(app.model);
      }
      
      // 2. Zustand zurücksetzen
      app.ar.hitTestSource = null;
      app.ar.reticle.visible = false;
      app.ar.modelPlaced = false;
      
      // 3. WICHTIG: Hit-Test-Quelle SOFORT anfordern, nicht erst im Render-Loop
      app.ar.hitTestSourceRequested = false; // Zurücksetzen, um den Aufruf zu erzwingen
      requestHitTestSource();
      
      // 4. Anzeigen der Hinweise
      if (controlsDiv) controlsDiv.style.display = 'none';
      if (hint) {
          hint.style.display = 'block';
          hint.textContent = 'Suche eine Oberfläche (z. B. Tisch oder Boden)...';
      }
  });

  renderer.xr.addEventListener('sessionend', () => {
    app.ar.hitTestSourceRequested = false;
    app.ar.hitTestSource = null;
    app.ar.reticle.visible = false;
    app.ar.modelPlaced = false;
    if (controlsDiv) controlsDiv.style.display = 'flex'; 
    
    // GroundMesh wiederherstellen (für Desktop-Ansicht)
    if (app.groundMesh && !scene.children.includes(app.groundMesh)) {
        scene.add(app.groundMesh);
    }
    // Modell wiederherstellen (falls es im AR-Modus platziert wurde)
    if (app.model && !scene.children.includes(app.model)) scene.add(app.model);
  });


  // --- select handler: place model ---
  function onSelect() {
    if (!app.model || app.ar.modelPlaced) return; // Nur beim ersten Tippen platzieren

    let pos = new THREE.Vector3();
    let isFallback = false;
    
    if (app.ar.reticle.visible) {
        // Platzierung an Reticle-Position
        pos.setFromMatrixPosition(app.ar.reticle.matrix);
    } else {
        // Fallback: Platzierung ohne Reticle (Modell vor Kamera)
        pos.set(0, -0.3, -1.0).applyMatrix4(camera.matrixWorld);
        isFallback = true;
    }
    
    app.model.position.copy(pos);
    app.model.rotation.set(0, 0, 0); 
    app.model.scale.setScalar(0.001); // Startskalierung für Animation
    
    scene.add(app.model);
    
    // Pop-In Animation
    new TWEEN.Tween(app.model.scale)
      .to({ x: 1, y: 1, z: 1 }, 800)
      .easing(TWEEN.Easing.Elastic.Out)
      .start();

    app.ar.reticle.visible = false;
    app.ar.modelPlaced = true;
    
    if(hint) hint.textContent = isFallback ? '🎉 Modell im Fallback platziert!' : '🎉 Modell platziert!';
  }

  // --- Render Loop ---
  renderer.setAnimationLoop(function (timestamp, frame) {
    
    TWEEN.update(); // Wichtig für die Pop-In Animation
    
    // Nur Reticle anzeigen, wenn HitTest verfügbar und Modell noch nicht platziert
    if (frame && !app.ar.modelPlaced) {
      // *KEIN* Aufruf von requestHitTestSource() hier mehr! Er wurde in sessionstart verschoben.

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
            if(hint) hint.textContent = 'Suche eine Oberfläche... (Pose fehlgeschlagen)';
          }
        } else {
          app.ar.reticle.visible = false;
          if(hint) hint.textContent = 'Suche eine Oberfläche...';
        }
      } else if (hint && app.ar.hitTestSourceRequested) {
          // Zeige einen Hinweis an, falls die Quelle noch geladen wird
          hint.textContent = 'Lade AR-Erkennung...';
      }
    }
    
    renderer.render(scene, camera);
  });
}
