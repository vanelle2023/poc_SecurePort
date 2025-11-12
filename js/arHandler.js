import * as THREE from "three";
import { ARButton } from "three/examples/jsm/webxr/ARButton.js";

export function setupAR(app) {
  const { renderer, scene, camera } = app;
  let reticle;
  let hitTestSource = null;
  let hitTestSourceInitialized = false;
  let localSpace = null;
  let modelPlaced = false;

  // --- AR-Button ---
  document.body.appendChild(
    ARButton.createButton(renderer, { requiredFeatures: ["local-floor"] })
  );

  // --- Reticle (Kreis) ---
  const geometry = new THREE.RingGeometry(0.15, 0.2, 32).rotateX(-Math.PI / 2);
  const material = new THREE.MeshBasicMaterial({
    color: 0x00ffcc,
    side: THREE.DoubleSide,
    transparent: true,
    opacity: 0.8
  });
  reticle = new THREE.Mesh(geometry, material);
  reticle.matrixAutoUpdate = false;
  reticle.visible = false;
  scene.add(reticle);

  // --- Session starten ---
  renderer.xr.addEventListener("sessionstart", async () => {
    const session = renderer.xr.getSession();
    const viewerSpace = await session.requestReferenceSpace("viewer");
    localSpace = await session.requestReferenceSpace("local-floor");

    session.requestHitTestSource({ space: viewerSpace }).then((source) => {
      hitTestSource = source;
      hitTestSourceInitialized = true;
    });
  });

  // --- Session beenden ---
  renderer.xr.addEventListener("sessionend", () => {
    hitTestSource = null;
    hitTestSourceInitialized = false;
    modelPlaced = false;
  });

  // --- Tippen: Modell platzieren ---
  renderer.xr.addEventListener("select", () => {
    if (!app.model || modelPlaced === true) return;

    const pos = new THREE.Vector3();

    if (reticle.visible) {
      pos.setFromMatrixPosition(reticle.matrix);
    } else {
      // Fallback – vor Kamera platzieren
      pos.set(0, -0.3, -1).applyMatrix4(camera.matrixWorld);
    }

    app.model.position.copy(pos);
    scene.add(app.model);
    modelPlaced = true;
    reticle.visible = false;
  });

  // --- Renderloop ---
  renderer.setAnimationLoop((timestamp, frame) => {
    if (hitTestSourceInitialized && frame && !modelPlaced) {
      const refSpace = localSpace || renderer.xr.getReferenceSpace();
      const hits = frame.getHitTestResults(hitTestSource);

      if (hits.length > 0) {
        const hit = hits[0];
        const pose = hit.getPose(refSpace);
        reticle.visible = true;
        reticle.matrix.fromArray(pose.transform.matrix);
      } else {
        reticle.visible = false;
      }
    }

    renderer.render(scene, camera);
  });
}
