import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { RGBELoader } from 'three/examples/jsm/loaders/RGBELoader.js';

export function setupScene(app) {
  const container = document.getElementById('container');

  // Szene + Kamera
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0xddeeff);

  const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.01, 2000);
  camera.position.set(0, 2, 5);

  // Renderer
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(window.devicePixelRatio);
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.xr.enabled = true;
  container.appendChild(renderer.domElement);

  // Licht
  const hemi = new THREE.HemisphereLight(0xffffff, 0x444444, 0.6);
  hemi.position.set(0, 10, 0);
  scene.add(hemi);

  const dir = new THREE.DirectionalLight(0xffffff, 0.8);
  dir.position.set(5, 10, 7);
  dir.castShadow = true;
  scene.add(dir);

  // Orbit-Steuerung
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.minDistance = 0.2;
  controls.maxDistance = 200;
  controls.target.set(0, 0.5, 0);

  // Basis-Material
  const buildingMaterial = new THREE.MeshPhysicalMaterial({
    color: 0x8a8a8a,
    metalness: 0.15,
    roughness: 0.4,
    clearcoat: 0.3,
    clearcoatRoughness: 0.1,
  });

  // HDRI Environment Map
  new RGBELoader().load(
    'venice_sunset_1k.hdr',
    (texture) => {
      texture.mapping = THREE.EquirectangularReflectionMapping;
      scene.environment = texture;
      buildingMaterial.envMap = texture;
    },
    undefined,
    (err) => console.error('HDRI Load Error:', err)
  );

  // Modell laden
  const loader = new GLTFLoader();
  loader.load('mapBremerhaven2.glb', (gltf) => {
    const model = gltf.scene;
    model.traverse((o) => {
      if (o.isMesh) {
        o.castShadow = true;
        o.receiveShadow = true;
        o.material = buildingMaterial;
      }
    });

    // Skalieren und zentrieren
    const box = new THREE.Box3().setFromObject(model);
    const size = box.getSize(new THREE.Vector3());
    const maxDim = Math.max(size.x, size.y, size.z);
    const scale = 1.0 / maxDim;
    model.scale.setScalar(scale);

    const newBox = new THREE.Box3().setFromObject(model);
    const center = newBox.getCenter(new THREE.Vector3());
    model.position.set(-center.x, -newBox.min.y, -center.z);

    // Groundplane hinzufügen
    const groundMesh = createGround(scene, newBox, scene.environment);

    scene.add(model);

    // Referenzen im globalen Objekt speichern
    app.model = model;
    app.groundMesh = groundMesh;
  });

  // Resize
  window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });

  // Szene im App-Objekt speichern
  Object.assign(app, { scene, camera, renderer, controls, buildingMaterial });
}

/**
 * Erstellt die Bodenfläche (Platz/Hafen)
 */
function createGround(scene, bbox, envMap) {
  const size = bbox.getSize(new THREE.Vector3());
  const center = bbox.getCenter(new THREE.Vector3());

  const planeGeo = new THREE.PlaneGeometry(size.x * 1.8, size.z * 1.8, 1, 1);
  const planeMat = new THREE.MeshPhysicalMaterial({
    color: 0x6a7d90,
    metalness: 0.2,
    roughness: 0.35,
    envMap,
    envMapIntensity: 0.6,
    clearcoat: 0.2,
    clearcoatRoughness: 0.2,
  });

  const groundMesh = new THREE.Mesh(planeGeo, planeMat);
  groundMesh.rotation.x = -Math.PI / 2;
  groundMesh.position.set(center.x, bbox.min.y + 0.001, center.z);
  scene.add(groundMesh);

  return groundMesh;
}
