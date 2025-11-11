import * as THREE from 'three';

export function fitCameraToObject(app, obj, factor = 1.3) {
  const { camera, controls } = app;
  const box = new THREE.Box3().setFromObject(obj);
  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());
  const maxDim = Math.max(size.x, size.y, size.z);
  const fov = camera.fov * (Math.PI / 180);
  const distance = Math.abs(maxDim / 2 / Math.tan(fov / 2)) * factor;

  const dir = new THREE.Vector3().subVectors(camera.position, controls.target).normalize();
  const newPos = center.clone().add(dir.multiplyScalar(distance));

  app.cameraStart = { pos: camera.position.clone(), tgt: controls.target.clone() };
  app.cameraTarget = { pos: newPos, tgt: center };
  app.cameraLerpT = 0;
  app.isAnimatingCamera = true;
}

export function easeInOutQuad(x) {
  return x < 0.5 ? 2 * x * x : 1 - Math.pow(-2 * x + 2, 2) / 2;
}

export function animate(app) {
  const clock = new THREE.Clock();
  app.clock = clock;

  app.renderer.setAnimationLoop(() => render(app));
}

function render(app) {
  const dt = app.clock.getDelta();
  const { renderer, scene, camera, controls, model } = app;

  // Kamera smooth bewegen
  if (app.isAnimatingCamera && app.cameraStart && app.cameraTarget) {
    app.cameraLerpT = Math.min(1, app.cameraLerpT + dt * 2.2);
    const t = easeInOutQuad(app.cameraLerpT);
    camera.position.lerpVectors(app.cameraStart.pos, app.cameraTarget.pos, t);
    controls.target.lerpVectors(app.cameraStart.tgt, app.cameraTarget.tgt, t);
    controls.update();
    if (app.cameraLerpT >= 1) app.isAnimatingCamera = false;
  } else {
    controls.update();
  }

  // 🔁 leichte Modellrotation im normalen Modus
  if (model && !renderer.xr.isPresenting) {
    model.rotation.y += 0.0008;
  }

  renderer.render(scene, camera);
}
