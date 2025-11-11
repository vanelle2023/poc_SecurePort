import { setupScene } from './sceneSetup.js';
import { setupUI } from './uiControls.js';
import { setupAR } from './arHandler.js';
import { animate } from './utils.js';

const app = {};
setupScene(app);
setupUI(app);
setupAR(app);
animate(app);
