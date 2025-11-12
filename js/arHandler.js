// js/arHandler.js
import * as THREE from 'three';
import { ARButton } from 'three/examples/jsm/webxr/ARButton.js';

export function setupAR(app) {
  const { renderer, scene, camera } = app;

  // simple state
  app.ar = app.ar || {};
  app.ar.hitTestSourceRequested = false;
  app.ar.hitTestSource = null;
  app.ar.reticle = null;
  app.ar.modelPlaced = false;

  // add AR button (request hit-test feature)
  document.body.appendChild(
    ARButton.createButton(renderer, { requiredFeatures: ['hit-test'] })
  );

  // create a reticle (green ring)
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

  // request hit-test source (like Nik's requestHitTestSource)
  function requestHitTestSource() {
    const session = renderer.xr.getSession();
    if (!session) return;
    session.requestReferenceSpace('viewer').then((referenceSpace) => {
      session.requestHitTestSource({ space: referenceSpace }).then((source) => {
        app.ar.hitTestSource = source;
      });
    });

    session.addEventListener('end', () => {
      app.ar.hitTestSourceRequested = false;
      app.ar.hitTestSource = null;
      app.ar.reticle.visible = false;
      app.ar.modelPlaced = false;
    });

    app.ar.hitTestSourceRequested = true;
  }

  // select handler: place or move model to reticle
  function onSelect() {
    if (!app.model) return;

    if (app.ar.reticle.visible) {
      // if model already visible, move it; otherwise place it
      if (app.model.visible) {
        // move model smoothly to new position (simple direct set here)
        const pos = new THREE.Vector3().setFromMatrixPosition(app.ar.reticle.matrix);
        app.model.position.copy(pos);
      } else {
        // place model exactly at reticle
        app.model.position.setFromMatrixPosition(app.ar.reticle.matrix);
        app.model.visible = true;
        scene.add(app.model);
        app.ar.modelPlaced = true;
      }
    } else {
      // fallback: place slightly in front of camera
      const pos = new THREE.Vector3(0, -0.3, -1).applyMatrix4(camera.matrixWorld);
      app.model.position.copy(pos);
      app.model.visible = true;
      scene.add(app.model);
      app.ar.modelPlaced = true;
    }
  }

  // render loop — use same pattern as Nik: request hit test source once, then get results
  renderer.setAnimationLoop(function (timestamp, frame) {
    // get hit-test results each frame when possible
    if (frame) {
      if (!app.ar.hitTestSourceRequested) {
        requestHitTestSource();
      }

      if (app.ar.hitTestSource) {
        const hitTestResults = frame.getHitTestResults(app.ar.hitTestSource);
        if (hitTestResults.length > 0 && !app.ar.modelPlaced) {
          const hit = hitTestResults[0];
          // use renderer.xr.getReferenceSpace() for pose (like Nik)
          const referenceSpace = renderer.xr.getReferenceSpace();
          const pose = hit.getPose(referenceSpace);
          if (pose) {
            app.ar.reticle.visible = true;
            app.ar.reticle.matrix.fromArray(pose.transform.matrix);
          } else {
            app.ar.reticle.visible = false;
          }
        } else {
          // hide reticle when no hit or when model already placed
          if (!app.ar.modelPlaced) app.ar.reticle.visible = false;
        }
      }
    }

    renderer.render(scene, camera);
  });
}
