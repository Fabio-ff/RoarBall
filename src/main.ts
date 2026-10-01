import { AppShell } from './app';
import { hasMatchParams, readGameOptions } from './app/url-options';

const root = document.getElementById('app');
if (!root) throw new Error('#app not found');

const search = window.location.search;
new AppShell(root, {
  initial: hasMatchParams(search) ? readGameOptions(search, Date.now()) : null,
});
