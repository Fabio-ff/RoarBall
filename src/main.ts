import { startGame } from './app';
import { readGameOptions } from './app/url-options';

const root = document.getElementById('app');
if (!root) throw new Error('#app not found');

startGame(root, readGameOptions(window.location.search, Date.now()));
