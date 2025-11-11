import * as THREE from 'three';
import { fitCameraToObject } from './utils.js';

export function setupUI(app) {
  const { renderer, camera, controls } = app;

  const infoBox = document.getElementById('info-box');
  const infoTitle = document.getElementById('info-title');
  const infoBody = document.getElementById('info-body');

  const btnTop = document.getElementById('btn-top');
  const btnFront = document.getElementById('btn-front');
  const btnFit = document.getElementById('btn-fit');
  const btnReset = document.getElementById('btn-reset');
  const toggleGround = document.getElementById('toggle-ground');
  const searchSelect = document.getElementById('location-select');

  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();

  let hovered = null;
  let pinned = null; // ersetzt isPinned: speichert aktives Objekt

  // ---------- Mausbewegung ----------
  renderer.domElement.addEventListener('pointermove', (e) => {
    if (!app.model || renderer.xr.isPresenting) return;

    const rect = renderer.domElement.getBoundingClientRect();
    pointer.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    pointer.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
    raycaster.setFromCamera(pointer, camera);
    const hits = raycaster.intersectObjects(app.model.children, true);

    // Kein Hover, wenn etwas gepinnt ist
    if (pinned) return;

    if (hits.length > 0) {
      const hit = hits[0].object;
      if (hovered !== hit) {
        clearHighlight();
        setHighlight(hit);
        showInfo(hits[0].point, hit);
        hovered = hit;
      }
    } else {
      clearHighlight();
      hideInfo();
    }
  });

  // ---------- Doppelklick ----------
  renderer.domElement.addEventListener('dblclick', (e) => {
    if (!app.model || renderer.xr.isPresenting) return;

    const rect = renderer.domElement.getBoundingClientRect();
    pointer.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    pointer.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
    raycaster.setFromCamera(pointer, camera);
    const hits = raycaster.intersectObjects(app.model.children, true);

    if (hits.length > 0) {
      const hit = hits[0].object;
      pinned = hit;
      clearHighlight();
      setHighlight(hit);
      fitCameraToObject(app, hit, 1.25);
      showInfo(hits[0].point, hit);
    } else {
      pinned = null;
      clearHighlight();
      fitCameraToObject(app, app.model, 1.4);
      hideInfo();
    }
  });

  // ---------- Dropdown-Auswahl ----------
  searchSelect.addEventListener('change', (e) => {
    if (!app.model || renderer.xr.isPresenting) return;
    const name = e.target.value;
    e.target.value = '';
    if (!name) return;

    let found = null;
    app.model.traverse((obj) => {
      if (obj.name === name) found = obj;
    });
    if (found) {
      pinned = found;
      clearHighlight();
      setHighlight(found);
      fitCameraToObject(app, found, 1.3);
      showInfo(found.getWorldPosition(new THREE.Vector3()), found);
    }
  });

  // ---------- Buttons ----------
  btnTop.addEventListener('click', () => goToPreset('top'));
  btnFront.addEventListener('click', () => goToPreset('front'));
  btnFit.addEventListener('click', () => {
    fitCameraToObject(app, pinned || hovered || app.model, 1.3);
  });
  btnReset.addEventListener('click', () => {
    pinned = null;
    clearHighlight();
    fitCameraToObject(app, app.model, 1.4);
    hideInfo();
  });

  toggleGround.addEventListener('change', () => {
    if (app.groundMesh) app.groundMesh.visible = toggleGround.checked;
  });

  // ---------- Hilfsfunktionen ----------
  function showInfo(point3, obj) {
    const p = point3.clone().project(camera);
    const x = (p.x * 0.5 + 0.5) * window.innerWidth;
    const y = (-p.y * 0.5 + 0.5) * window.innerHeight;
    infoTitle.textContent = obj.name || '(unbenannt)';
    infoBody.innerHTML = buildInfoContent(obj);
    const left = Math.min(window.innerWidth - 340, Math.max(8, x + 10));
    const top = Math.min(window.innerHeight - 120, Math.max(8, y - 10));
    infoBox.style.left = `${left}px`;
    infoBox.style.top = `${top}px`;
    infoBox.style.display = 'block';
  }

  function hideInfo() {
    infoBox.style.display = 'none';
  }

  function setHighlight(obj) {
    if (!obj.userData.origMat) obj.userData.origMat = obj.material;
    obj.material = obj.material.clone();
    obj.material.emissive = new THREE.Color(0x555555);
    obj.material.emissiveIntensity = 0.8;
    hovered = obj;
  }

  function clearHighlight() {
    if (hovered && hovered.userData.origMat) hovered.material = hovered.userData.origMat;
    if (pinned && pinned.userData.origMat && pinned !== hovered) pinned.material = pinned.userData.origMat;
    hovered = null;
  }

  function buildInfoContent(obj) {
    if (obj.name.includes('Klimahaus')) {
      obj.userData = Object.assign({}, obj.userData, {
        baujahr: 2009,
        nutzung: 'Wissens- und Erlebniswelt',
        höhe: 30,
        material: 'Glas/Stahl'
      });
    }
    const i = obj.userData || {};
    return `
      Baujahr: ${i.baujahr || '–'}<br>
      Nutzung: ${i.nutzung || '–'}<br>
      Höhe: ${i.höhe || '–'} m<br>
      Material: ${i.material || '–'}
    `;
  }

  function goToPreset(preset) {
    if (!app.model) return;
    const box = new THREE.Box3().setFromObject(app.model);
    const center = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3());
    let newPos;
    if (preset === 'top') newPos = center.clone().add(new THREE.Vector3(0, Math.max(size.y, 6), 0));
    else newPos = center.clone().add(new THREE.Vector3(0, 1.5, size.z * 2));
    app.cameraStart = { pos: camera.position.clone(), tgt: controls.target.clone() };
    app.cameraTarget = { pos: newPos, tgt: center };
    app.cameraLerpT = 0;
    app.isAnimatingCamera = true;
    pinned = null;
    clearHighlight();
    hideInfo();
  }

  // expose optional state
  app.ui = { hovered, pinned };
}
