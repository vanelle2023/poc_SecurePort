
import * as THREE from 'three';
import { GLTFLoader } from 'https://unpkg.com/three@0.158.0/examples/jsm/loaders/GLTFLoader.js';
import { OrbitControls } from 'https://unpkg.com/three@0.158.0/examples/jsm/controls/OrbitControls.js';
import { ARButton } from 'https://unpkg.com/three@0.158.0/examples/jsm/webxr/ARButton.js';
import { RGBELoader } from 'https://unpkg.com/three@0.158.0/examples/jsm/loaders/RGBELoader.js';

// ---------- Globale Variablen ----------
let container = document.getElementById('container');
let scene, camera, renderer, controls;
let model = null; 
let arModelGroup = new THREE.Group(); 
const clock = new THREE.Clock(); 

const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();
let hovered = null; 
let isInfoBoxPinned = false; 

// NEU FÜR AR:
let reticle; // Das Zielkreuz-Mesh
let hitTestSource = null; // Der Raycaster für die reale Welt
let hitTestSourceInitialized = false; // Flag, um Initialisierung einmalig durchzuführen
let arPlacementConfirmed = false; // NEU: Flag, ob das Modell platziert wurde

let buildingBaseMaterial = new THREE.MeshPhysicalMaterial({
    color: 0x8a8a8a,  
    metalness: 0.15,
    roughness: 0.4,
    clearcoat: 0.3, 
    clearcoatRoughness: 0.1,
    envMapIntensity: 1.0 
});

// Für weiche Kamerabewegungen
let isAnimatingCamera = false;
let cameraTarget = null;
let cameraStart = null;
let cameraLerpT = 0;

// UI-Elemente
const infoBox = document.getElementById('info-box');
const infoTitle = document.getElementById('info-title');
const infoBody = document.getElementById('info-body');
const controlsDiv = document.getElementById('controls');
const hintDiv = document.getElementById('hint');
const searchSelect = document.getElementById('location-select');

const btnTop = document.getElementById('btn-top');
const btnFront = document.getElementById('btn-front');
const btnFit = document.getElementById('btn-fit');
const btnReset = document.getElementById('btn-reset');
const toggleGround = document.getElementById('toggle-ground');

let groundMesh = null; 

init();
animate();

function init() {
  // Scene + Camera
  scene = new THREE.Scene(); 
  
  const backgroundColor = new THREE.Color(0xddeeff);
  scene.background = backgroundColor;

  camera = new THREE.PerspectiveCamera(60, window.innerWidth/window.innerHeight, 0.01, 2000);
  camera.position.set(0, 2, 5); 

  // --- Renderer ---
  renderer = new THREE.WebGLRenderer({ antialias:true, alpha:true });
  renderer.setPixelRatio(window.devicePixelRatio);
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping; 
  renderer.toneMappingExposure = 1.0; 
  renderer.xr.enabled = true; 
  container.appendChild(renderer.domElement);
  
  // --- Environment Map (HDRI-Beleuchtung) ---
  const rgbeLoader = new RGBELoader();
  rgbeLoader.load('venice_sunset_1k.hdr', (texture) => {
      texture.mapping = THREE.EquirectangularReflectionMapping;
      scene.environment = texture;
      buildingBaseMaterial.envMap = texture; 
  }, 
  (xhr) => { console.log((xhr.loaded / xhr.total * 100) + '% loaded HDRI'); }, 
  (error) => { console.error('HDRI load error:', error); }
  );

  controlsDiv.style.display = 'flex';
  hintDiv.style.display = 'block';

  // --- Lichtquellen --- 
  const hemi = new THREE.HemisphereLight(0xffffff, 0x444444, 0.6); 
  hemi.position.set(0, 10, 0);
  scene.add(hemi);

  const dir = new THREE.DirectionalLight(0xffffff, 0.8); 
  dir.position.set(5, 10, 7);
  dir.castShadow = true;
  scene.add(dir);

   // --- Kamerasteuerung ---
  controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.screenSpacePanning = false;
  controls.minDistance = 0.2;
  controls.maxDistance = 200;
  controls.target.set(0, 0.5, 0);

  // --- AR Button & Setup ---
  // Hinzufügen des AR-Buttons mit Session-Features
  document.body.appendChild( ARButton.createButton( renderer, { requiredFeatures: [ 'local-floor' ] } ) );

  renderer.xr.addEventListener('sessionstart', onARStart);
  renderer.xr.addEventListener('sessionend', onAREnd);
  // NEU: Listener für das Tipp-Event in AR
  renderer.xr.addEventListener('select', onARSelect);
  // NEU: Reticle initialisieren
  initReticle();


  // --- 3D-Modell laden ---
  const loader = new GLTFLoader();
  loader.load('mapBremerhaven2.glb', gltf => {
    model = gltf.scene;
    model.traverse(obj => {
      if (obj.isMesh) {
            obj.castShadow = true;
            obj.receiveShadow = true;
            obj.material = buildingBaseMaterial;
        }
    });

    const bbox = new THREE.Box3().setFromObject(model);
    const size = bbox.getSize(new THREE.Vector3());
    const maxDim = Math.max(size.x, size.y, size.z);
    const target = 1.0; 
    const scale = target / maxDim;
    model.scale.setScalar(scale);

    const newBox = new THREE.Box3().setFromObject(model);
    const newCenter = newBox.getCenter(new THREE.Vector3());
    model.position.set(-newCenter.x, -newBox.min.y, -newCenter.z);

    // Füge das Modell zur AR-Gruppe hinzu
    arModelGroup.add(model);
    // WICHTIG: arModelGroup wird HIER NICHT zur Szene hinzugefügt!
    // Nur im Desktop-Modus ODER nach Platzierung in AR.

    if (!renderer.xr.isPresenting) {
        scene.add(arModelGroup); 
        createGroundSurface(newBox);
        fitCameraToObject(model, 1.4); 
    }


  }, undefined, err => {
    console.error('GLB load error:', err);
    alert('Fehler beim Laden von mapBremerhaven.glb. Schau in die Konsole.');
  });

  // Events
  window.addEventListener('resize', onWindowResize);
  renderer.domElement.addEventListener('pointermove', onPointerMove);
  renderer.domElement.addEventListener('dblclick', onDoubleClick);
  searchSelect.addEventListener('change', onLocationSelect); 

  // Buttons
  btnTop.addEventListener('click', () => goToPreset('top'));
  btnFront.addEventListener('click', () => goToPreset('front'));
  btnFit.addEventListener('click', () => {
    if (hovered) fitCameraToObject(hovered, 1.3);
    else if (model) fitCameraToObject(model, 1.4);
  });
  btnReset.addEventListener('click', () => {
    if (model) {
      controls.target.set(0, 0.6, 0);
      fitCameraToObject(model, 1.4);
    }
    if (isInfoBoxPinned) {
      isInfoBoxPinned = false;
      hideInfoBox();
    }
  });
  toggleGround.addEventListener('change', () => { if (groundMesh) groundMesh.visible = toggleGround.checked; });
}

// --- NEU: Reticle (Zielkreuz) initialisieren ---
function initReticle() {
    // Ein einfacher Ring, der auf dem Boden erscheint
    const geometry = new THREE.RingGeometry(0.15, 0.2, 32).rotateX(-Math.PI / 2);
    const material = new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.DoubleSide });
    reticle = new THREE.Mesh(geometry, material);
    reticle.matrixAutoUpdate = false; // Manuelle Aktualisierung
    reticle.visible = false; // Am Anfang versteckt
    scene.add(reticle);
}

// --- NEU: Beim Start der AR-Sitzung ---
function onARStart() {
    controls.enabled = false;
    controlsDiv.style.display = 'none';
    hintDiv.style.display = 'none';
    hideInfoBox();
    isInfoBoxPinned = false; 
    arPlacementConfirmed = false; // Wichtig: Zurücksetzen
    reticle.visible = true; // Reticle anzeigen, um Platzierung zu beginnen

    if (groundMesh) groundMesh.visible = false; 
    
    // Model Group aus der Szene entfernen, falls sie im Desktop-Modus war (wird später platziert)
    if (scene.children.includes(arModelGroup)) {
        scene.remove(arModelGroup);
    }
    
    // NEU: Hit-Testing initialisieren (asynchron, da Reference Space benötigt wird)
    const session = renderer.xr.getSession();
    session.requestReferenceSpace('viewer').then((referenceSpace) => {
        session.requestHitTestSource({ space: referenceSpace }).then((source) => {
            hitTestSource = source;
            hitTestSourceInitialized = true;
        });
    });
}

// --- NEU: Beim Ende der AR-Sitzung ---
function onAREnd() {
    controls.enabled = true;
    controlsDiv.style.display = 'flex';
    hintDiv.style.display = 'block';
    
    // NEU: Reticle ausblenden und Hit-Testing beenden
    reticle.visible = false;
    if (hitTestSource) {
        hitTestSource.cancel();
        hitTestSource = null;
        hitTestSourceInitialized = false;
    }

    // Model Group entfernen
    if (model && scene.children.includes(arModelGroup)) {
        scene.remove(arModelGroup);
    }
     // Model Group FÜR DESKTOP-ANSICHT WIEDER HINZUFÜGEN
    if (model && !scene.children.includes(arModelGroup)) {
        scene.add(arModelGroup);
    }
    
    if (groundMesh) groundMesh.visible = toggleGround.checked;
    
    if (model) {
        controls.target.set(0, 0.6, 0);
        fitCameraToObject(model, 1.4);
    }
}

// --- NEU: Interaktion in AR (Tippen auf den Bildschirm) ---
function onARSelect() {
    // 1. Platzierung bestätigen
    if (renderer.xr.isPresenting && !arPlacementConfirmed) {
        if (reticle.visible) {
            // Verschiebe die arModelGroup an die Reticle-Position
            arModelGroup.position.setFromMatrixPosition(reticle.matrix);
            // Füge die Gruppe zur Szene hinzu
            scene.add(arModelGroup);
            
            reticle.visible = false;
            arPlacementConfirmed = true;
            
            // Hinweis für weitere Interaktion aktualisieren
            hintDiv.innerHTML = "Modell platziert. Tippen: Info/Zoom";
            hintDiv.style.display = 'block'; // Falls in onARStart ausgeblendet
        }
        return;
    }
    
    // 2. Interaktion (Zoom/Info) nach Platzierung
    if (renderer.xr.isPresenting && arPlacementConfirmed) {
        // Ein einfacher Raycast in die Mitte des Bildschirms
        const arRaycaster = new THREE.Raycaster();
        // Nullpunkt für AR-Kamera (Mitte des Bildschirms)
        arRaycaster.setFromCamera({ x: 0, y: 0 }, camera); 
        
        const intersects = arRaycaster.intersectObjects(model.children, true);
        
        if (intersects.length > 0) {
            const hit = intersects[0].object;
            // Da wir keine OrbitControls haben, machen wir nur ein Highlight und die Info-Box
            if (hovered && hovered.userData._origMat) {
                hovered.material = hovered.userData._origMat;
            }
            if (!hit.userData._origMat) hit.userData._origMat = hit.material;
            // Highlight
            hit.material = hit.material.clone();
            hit.material.emissive = new THREE.Color(0x555555); 
            hit.material.emissiveIntensity = 0.8;
            hovered = hit;
            
            // Info-Box anzeigen (als 2D-Overlay, kann später 3D werden)
            showInfoBoxAtScreen(intersects[0].point, { 
                title: hit.name || 'Gebäudeteil',
                body: buildInfoContent(hit)
            });
            isInfoBoxPinned = true; // Pin-Logik wird für AR einfacher verwendet
        } else {
            // Wenn nichts getroffen, Highlight und Info-Box entfernen
            if (hovered && hovered.userData._origMat) {
                hovered.material = hovered.userData._origMat;
            }
            hovered = null;
            isInfoBoxPinned = false;
            hideInfoBox();
        }
    }
}

function onLocationSelect(event) {
    if (renderer.xr.isPresenting) return; // Ignoriere in AR
    if (!model) return;
    const targetName = event.target.value;
    if (targetName === '') return;
    
    // Setzt das Dropdown zurück auf den ersten Eintrag, nachdem ausgewählt wurde
    event.target.value = ''; 

    let targetObject = null;
    model.traverse(obj => {
        // ANNAHME: Die Namen in der GLB-Datei sind korrekt. Wir suchen das Objekt.
        if (obj.name === targetName) {
            targetObject = obj;
        }
    });

    if (targetObject) {
        fitCameraToObject(targetObject, 1.3);
        
        // **MANUELLES SETZEN DES HIGHLIGHTS UND PINNEN DER INFO-BOX**
        // 1. Altes Highlight entfernen
        if (hovered && hovered.userData._origMat) {
            hovered.material = hovered.userData._origMat;
        }

        // 2. Neues Highlight setzen
        if (!targetObject.userData._origMat) targetObject.userData._origMat = targetObject.material;
        targetObject.material = targetObject.material.clone();
        targetObject.material.emissive = new THREE.Color(0x555555); // Gleiches Highlight wie Hover
        targetObject.material.emissiveIntensity = 0.8;
        hovered = targetObject; // Setze das neue hervorgehobene Objekt

        // 3. Info-Box pinnen und anzeigen
        isInfoBoxPinned = true;
        
        // Finde die Bildschirmkoordinaten des Objekts, um die Box zu platzieren
        const bbox = new THREE.Box3().setFromObject(targetObject);
        const center = bbox.getCenter(new THREE.Vector3());
        
        showInfoBoxAtScreen(center, {
            title: targetObject.name || 'Gebäudeteil',
            body: buildInfoContent(targetObject)
        });
    }
}
function onWindowResize() {
  camera.aspect = window.innerWidth/window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
}
function onPointerMove(event) {
  if (renderer.xr.isPresenting) return; 

  const rect = renderer.domElement.getBoundingClientRect();
  pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
  pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

  if (!model) return;
  raycaster.setFromCamera(pointer, camera);
  const intersects = raycaster.intersectObjects(model.children, true);

  if (intersects.length > 0) {
    const hit = intersects[0].object;
    if (hovered !== hit) {
      if (hovered && hovered.userData._origMat) {
        hovered.material = hovered.userData._origMat;
      }
      if (!hit.userData._origMat) hit.userData._origMat = hit.material;
      hit.material = hit.material.clone();
      hit.material.emissive = new THREE.Color(0x555555); 
      hit.material.emissiveIntensity = 0.8;
      hovered = hit;
    }
    if (!isInfoBoxPinned) {
      showInfoBoxAtScreen(intersects[0].point, {
          title: hit.name || 'Gebäudeteil',
          body: buildInfoContent(hit)
      });
    }
  } else {
    if (hovered && !isInfoBoxPinned) {
      if (hovered.userData._origMat) hovered.material = hovered.userData._origMat;
      hovered = null;
      hideInfoBox();
    } else if (hovered && isInfoBoxPinned) {
      if (hovered.userData._origMat) hovered.material = hovered.userData._origMat;
      hovered = null; 
    }
  }
}
function buildInfoContent(obj) {
  if (obj.name.includes('Klimahaus')) {
      obj.userData.baujahr = 2009;
      obj.userData.nutzung = 'Wissens- und Erlebniswelt';
      obj.userData.höhe = 30;
      obj.userData.material = 'Glas/Stahl';
  }
  
  const info = obj.userData || {};

  let html = '';
  html += `<h4>${obj.name || '(unbenannt)'}</h4>`;

  let details = '';
  if (info.baujahr) details += `Baujahr: ${info.baujahr}<br>`;
  if (info.nutzung) details += `Nutzung: ${info.nutzung}<br>`;
  if (info.höhe) details += `Höhe: ${info.höhe} m<br>`;
  if (info.material) details += `Material: ${info.material}<br>`;
  
  if (details.trim() === '') details = 'Keine weiteren Informationen verfügbar. **Doppelklick zum Pinnen!**';
  
  return html + details;
}
function onDoubleClick(event) {
  if (renderer.xr.isPresenting) return;
  
  const rect = renderer.domElement.getBoundingClientRect();
  pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
  pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
  if (!model) return;
  raycaster.setFromCamera(pointer, camera);
  const intersects = raycaster.intersectObjects(model.children, true);
  
  if (intersects.length > 0) {
    const hit = intersects[0].object;
    fitCameraToObject(hit, 1.2);
    
    isInfoBoxPinned = true;
    showInfoBoxAtScreen(intersects[0].point, {
        title: hit.name || 'Gebäudeteil',
        body: buildInfoContent(hit)
    });
    onPointerMove(event); 
    
  } else {
    fitCameraToObject(model, 1.4);
    isInfoBoxPinned = false;
    hideInfoBox();
  }
}
function showInfoBoxAtScreen(point3, { title, body }) {
  const pos = point3.clone();
  pos.project(camera);
  const x = (pos.x * 0.5 + 0.5) * window.innerWidth;
  const y = (-pos.y * 0.5 + 0.5) * window.innerHeight;
  infoTitle.innerHTML = title;
  infoBody.innerHTML = body;
  infoBox.style.left = `${Math.min(window.innerWidth - 340, Math.max(8, x + 10))}px`;
  infoBox.style.top = `${Math.min(window.innerHeight - 120, Math.max(8, y - 10))}px`;
  infoBox.style.display = 'block';
}
function hideInfoBox() {
  if (!isInfoBoxPinned) {
    infoBox.style.display = 'none';
  }
}
function fitCameraToObject(object, targetScaleFactor = 1.2) {
  if (renderer.xr.isPresenting) return; 
  
  isInfoBoxPinned = false; 
  hideInfoBox();

  const box = new THREE.Box3().setFromObject(object);
  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());

  const maxDim = Math.max(size.x, size.y, size.z);
  const fov = camera.fov * (Math.PI / 180);
  let cameraDistance = Math.abs(maxDim / 2 / Math.tan(fov / 2)) * targetScaleFactor;

  const dir = new THREE.Vector3().subVectors(camera.position, controls.target).normalize();
  if (dir.lengthSq() === 0) dir.set(0, 0, 1);
  const newCamPos = center.clone().add(dir.multiplyScalar(cameraDistance));
  cameraStart = { pos: camera.position.clone(), tgt: controls.target.clone() };
  cameraTarget = { pos: newCamPos.clone(), tgt: center.clone() };
  cameraLerpT = 0;
  isAnimatingCamera = true;
}
function goToPreset(preset) {
  if (renderer.xr.isPresenting) return;

  isInfoBoxPinned = false;
  hideInfoBox();

  if (!model) return;
  const box = new THREE.Box3().setFromObject(model);
  const center = box.getCenter(new THREE.Vector3());
  let newPos;
  if (preset === 'top') {
    newPos = center.clone().add(new THREE.Vector3(0, Math.max(box.getSize(new THREE.Vector3()).y, 6), 0));
  } else { 
    const sizeZ = box.getSize(new THREE.Vector3()).z;
    newPos = center.clone().add(new THREE.Vector3(0, 1.5, sizeZ * 2)); 
  }
  cameraStart = { pos: camera.position.clone(), tgt: controls.target.clone() };
  cameraTarget = { pos: newPos, tgt: center };
  cameraLerpT = 0;
  isAnimatingCamera = true;
}
function createGroundSurface(bbox) {
  const size = bbox.getSize(new THREE.Vector3());
  const center = bbox.getCenter(new THREE.Vector3());
  const planeGeo = new THREE.PlaneGeometry(size.x * 1.8, size.z * 1.8, 1, 1);
  const planeMat = new THREE.MeshPhysicalMaterial({
  color: 0x6a7d90, 
  metalness: 0.2,
  roughness: 0.35,        
  envMap: scene.environment,
  envMapIntensity: 0.6,
  clearcoat: 0.2,
  clearcoatRoughness: 0.2
  });
  groundMesh = new THREE.Mesh(planeGeo, planeMat);
  groundMesh.rotation.x = -Math.PI / 2;
  groundMesh.position.set(center.x, bbox.min.y + 0.001, center.z);
  scene.add(groundMesh);
}


// --- Haupt-Animationsschleife ---
function animate() {
  renderer.setAnimationLoop(render);
}

function render(timestamp, frame) {
  const dt = clock.getDelta();
  
  // Kamera-Animation (Desktop-Modus)
  if (!renderer.xr.isPresenting) {
    if (isAnimatingCamera && cameraStart && cameraTarget) {
      cameraLerpT = Math.min(1, cameraLerpT + dt * 2.2); 
      const t = easeInOutQuad(cameraLerpT);
      camera.position.lerpVectors(cameraStart.pos, cameraTarget.pos, t);
      controls.target.lerpVectors(cameraStart.tgt, cameraTarget.tgt, t);
      controls.update();
      if (cameraLerpT >= 1) {
        isAnimatingCamera = false;
      }
    } else {
      controls.update();
    }
     // Modell dreht sich leicht (Desktop-Modus)
    if (model) model.rotation.y += 0.0008;
  } 
  // NEU: AR-Modus-Logik (Reticle-Aktualisierung)
  else {
      // Nur Hit-Testing, wenn die Platzierung noch nicht bestätigt wurde
      if (frame && hitTestSourceInitialized && !arPlacementConfirmed) {
          const referenceSpace = renderer.xr.getReferenceSpace();
          const hitTestResults = frame.getHitTestResults(hitTestSource);

          if (hitTestResults.length > 0) {
              const hit = hitTestResults[0];
              const pose = hit.getPose(referenceSpace);
              
              reticle.visible = true;
              reticle.matrix.fromArray(pose.transform.matrix);
              
              // Aktualisiere Hinweis
              hintDiv.innerHTML = "Reticle gefunden. Tippen, um Modell zu platzieren!";
              hintDiv.style.display = 'block';

          } else {
              reticle.visible = false;
              if (!arPlacementConfirmed) {
                   hintDiv.innerHTML = "Suche nach einer Oberfläche (Boden/Tisch)...";
                   hintDiv.style.display = 'block';
              }
          }
      }
  }

  renderer.render(scene, camera);
}

// --- Sanfte Interpolationskurve ---
function easeInOutQuad(x) {
  return x < 0.5 ? 2 * x * x : 1 - Math.pow(-2 * x + 2, 2) / 2;
}
