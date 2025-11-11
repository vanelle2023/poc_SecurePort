import { ARButton } from 'three/examples/jsm/webxr/ARButton.js';
import * as THREE from 'three';

export function setupAR(app) {
  const { renderer, scene } = app;
  document.body.appendChild(ARButton.createButton(renderer, { requiredFeatures: ['local-floor'] }));

  let reticle;
  let hitTestSource = null;
  let hitTestSourceInitialized = false;
  let arPlaced = false;

  const hint = document.getElementById('hint');
  const controlsDiv = document.getElementById('controls');

  initReticle();

  renderer.xr.addEventListener('sessionstart', () => {
    controlsDiv.style.display = 'none';
    hint.textContent = 'Suche nach einer Fläche...';
    reticle.visible = true;
    arPlaced = false;

    const session = renderer.xr.getSession();
    session.requestReferenceSpace('viewer').then((refSpace) => {
      session.requestHitTestSource({ space: refSpace }).then((source) => {
        hitTestSource = source;
        hitTestSourceInitialized = true;
      });
    });
  });

  renderer.xr.addEventListener('sessionend', () => {
    controlsDiv.style.display = 'flex';
    reticle.visible = false;
    hitTestSource = null;
    hitTestSourceInitialized = false;
    if (app.model && !scene.children.includes(app.model)) scene.add(app.model);
  });

  renderer.xr.addEventListener('select', () => {
    if (!app.model || arPlaced === true) return;
    if (reticle.visible) {
      app.model.position.setFromMatrixPosition(reticle.matrix);
      scene.add(app.model);
      reticle.visible = false;
      arPlaced = true;
      hint.textContent = 'Modell platziert. Tippen = Info/Zoom';
    }
  });

  renderer.setAnimationLoop((timestamp, frame) => {
    if (hitTestSourceInitialized && frame && !arPlaced) {
      const refSpace = renderer.xr.getReferenceSpace();
      const hits = frame.getHitTestResults(hitTestSource);
      if (hits.length > 0) {
        const hit = hits[0];
        const pose = hit.getPose(refSpace);
        reticle.matrix.fromArray(pose.transform.matrix);
        reticle.visible = true;
        hint.textContent = 'Tippe, um das Modell zu platzieren';
      } else {
        reticle.visible = false;
      }
    }
    renderer.render(scene, app.camera);
  });

  function initReticle() {
    const geo = new THREE.RingGeometry(0.15, 0.2, 32).rotateX(-Math.PI / 2);
    const mat = new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.DoubleSide });
    reticle = new THREE.Mesh(geo, mat);
    reticle.matrixAutoUpdate = false;
    reticle.visible = false;
    scene.add(reticle);
  }
}
