import { startGame } from './app';

const root = document.getElementById('app');
if (!root) throw new Error('#app not found');

const debug = new URLSearchParams(window.location.search).has('debug');
startGame(root, { debug });
