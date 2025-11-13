import * as THREE from 'three'
import { ARButton } from 'three/examples/jsm/webxr/ARButton.js'

const scene = new THREE.Scene()
const camera = new THREE.PerspectiveCamera(70, window.innerWidth/window.innerHeight, 0.01, 20)
const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true })
renderer.setPixelRatio(window.devicePixelRatio)
renderer.setSize(window.innerWidth, window.innerHeight)
renderer.xr.enabled = true
document.body.appendChild(renderer.domElement)

document.body.appendChild(ARButton.createButton(renderer, { requiredFeatures: ['hit-test', 'local-floor'] }))

const reticle = new THREE.Mesh(
    new THREE.RingGeometry(0.15, 0.2, 32).rotateX(-Math.PI/2),
    new THREE.MeshBasicMaterial({ color: 0x00ff33 })
)
reticle.matrixAutoUpdate = false;
reticle.visible = false;
scene.add(reticle);

let hitTestSource = null;
let hitTestSourceRequested = false;

// Renderloop wie im offiziellen Beispiel!
renderer.setAnimationLoop(function(timestamp, frame) {
    if(frame) {
        if(!hitTestSourceRequested) {
            const session = renderer.xr.getSession();
            session.requestReferenceSpace('viewer').then(function(referenceSpace) {
                session.requestHitTestSource({ space: referenceSpace }).then(function(source) {
                    hitTestSource = source;
                });
            });
            hitTestSourceRequested = true;
        }

        if(hitTestSource && renderer.xr.getSession()) {
            const hitTestResults = frame.getHitTestResults(hitTestSource);
            if(hitTestResults.length) {
                const hit = hitTestResults[0];
                const referenceSpace = renderer.xr.getReferenceSpace();
                const pose = hit.getPose(referenceSpace);

                reticle.visible = true;
                reticle.matrix.fromArray(pose.transform.matrix);
                reticle.matrix.decompose(reticle.position, reticle.quaternion, reticle.scale);
            } else {
                reticle.visible = false;
            }
        }
    }
    renderer.render(scene, camera);
});
