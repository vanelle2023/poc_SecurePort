import * as THREE from 'three';
import { ARButton } from 'three/examples/jsm/webxr/ARButton.js';

let camera, scene, renderer;
let reticle, hitTestSource = null, hitTestSourceRequested = false;

// 1. Scene & Camera Setup
scene = new THREE.Scene();
camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.01, 20);

// 2. Optional: die "map" (Plane mit großer Fläche)
const mapGeo = new THREE.PlaneGeometry(5, 5); // 5x5 Meter große Fläche!
const mapMat = new THREE.MeshBasicMaterial({
  color: 0xcccccc,
  side: THREE.DoubleSide,
  transparent: true,
  opacity: 0.3
});
const mapMesh = new THREE.Mesh(mapGeo, mapMat);
mapMesh.rotation.x = -Math.PI / 2; // Flach auf Boden!
mapMesh.position.y = 0;            // <== ACHTUNG: eigentlicher AR-Boden ist oft y ~= 0
scene.add(mapMesh);

// Debug: mapMesh immer sichtbar?
console.log("Map Mesh added to scene:", mapMesh);

// 3. Renderer
renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
renderer.setPixelRatio(window.devicePixelRatio);
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.xr.enabled = true;
document.body.appendChild(renderer.domElement);

// 4. ARButton
document.body.appendChild(ARButton.createButton(renderer, { requiredFeatures: ['hit-test', 'local-floor'] }));

// 5. Reticle (grüner Kreis)
reticle = new THREE.Mesh(
  new THREE.RingGeometry(0.15, 0.2, 32).rotateX(-Math.PI / 2),
  new THREE.MeshBasicMaterial({ color: 0x00ff33 })
);
reticle.matrixAutoUpdate = false;
reticle.visible = false;
scene.add(reticle);

// 6. Handle Window Resize
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// 7. Renderloop inkl. Hit-Test und Reticle-Logik
renderer.setAnimationLoop(function (timestamp, frame) {
  // Optional: Debug-Ausgabe, ist AR-Sitzung aktiv?
  // console.log("XR Presenting:", renderer.xr.isPresenting);

  if (frame) {
    // Hit-Test-Quelle bei Bedarf (nur einmal pro Session!) anfordern
    if (!hitTestSourceRequested) {
      const session = renderer.xr.getSession();
      session.requestReferenceSpace('viewer').then(function (referenceSpace) {
        session.requestHitTestSource({ space: referenceSpace }).then(function (source) {
          hitTestSource = source;
        });
      });
      hitTestSourceRequested = true;
    }

    // Wenn Hit-Test möglich, Reticle anhand Pose platzieren
    if (hitTestSource) {
      const hitTestResults = frame.getHitTestResults(hitTestSource);
      if (hitTestResults.length) {
        const hit = hitTestResults[0];
        const referenceSpace = renderer.xr.getReferenceSpace();
        const pose = hit.getPose(referenceSpace);
        if (pose) {
          reticle.visible = true;
          reticle.matrix.fromArray(pose.transform.matrix);
          reticle.matrix.decompose(reticle.position, reticle.quaternion, reticle.scale);
          // Debug: Reticle und Pose ausgeben
          // console.log("Reticle Pose:", pose.transform.position);
        }
      } else {
        reticle.visible = false;
      }
    }
  }

  renderer.render(scene, camera);
});
