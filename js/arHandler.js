import * as THREE from 'three';
import { ARButton } from 'three/examples/jsm/webxr/ARButton.js';

export function setupAR(app) {
  const { renderer, scene, camera } = app;

  let reticle;
  let hitTestSource = null;
  let hitTestSourceRequested = false;
  let localReferenceSpace = null;
  let modelPlaced = false;

  // --- AR Button ---
  document.body.appendChild(
    ARButton.createButton(renderer, { requiredFeatures: ['hit-test', 'local-floor'] })
  );

  // --- Grüner Kreis (Reticle) ---
  const geometry = new THREE.RingGeometry(0.15, 0.2, 32).rotateX(-Math.PI / 2);
  const material = new THREE.MeshBasicMaterial({
    color: 0x00ff00,
    side: THREE.DoubleSide,
    transparent: true,
    opacity: 0.8
  });
  reticle = new THREE.Mesh(geometry, material);
  reticle.matrixAutoUpdate = false;
  reticle.visible = false;
  scene.add(reticle);

  // --- Tap-Event: Modell platzieren ---
  renderer.xr.addEventListener('select', () => {
    if (!app.model || modelPlaced === true) return;

    const pos = new THREE.Vector3();
    if (reticle.visible) {
      pos.setFromMatrixPosition(reticle.matrix);
    } else {
      pos.set(0, -0.3, -1).applyMatrix4(camera.matrixWorld);
    }

    app.model.position.copy(pos);
    app.model.visible = true;
    scene.add(app.model);
    modelPlaced = true;
  });

  // --- Renderloop ---
  renderer.setAnimationLoop((timestamp, frame) => {
    if (frame) {
      const session = renderer.xr.getSession();

      if (!hitTestSourceRequested) {
        session.requestReferenceSpace('viewer').then((refSpace) => {
          session.requestHitTestSource({ space: refSpace }).then((source) => {
            hitTestSource = source;
          });
        });
        session.requestReferenceSpace('local-floor').then((refSpace) => {
          localReferenceSpace = refSpace;
        });
        hitTestSourceRequested = true;
      }

      if (hitTestSource && localReferenceSpace) {
        const hitTestResults = frame.getHitTestResults(hitTestSource);

        if (hitTestResults.length > 0 && !modelPlaced) {
          const hit = hitTestResults[0];
          const pose = hit.getPose(localReferenceSpace);
          reticle.visible = true;
          reticle.matrix.fromArray(pose.transform.matrix);
        } else if (!modelPlaced) {
          reticle.visible = false;
        }
      }
    }

    renderer.render(scene, camera);
  });
}
