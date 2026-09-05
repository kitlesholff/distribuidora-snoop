const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.join(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

function worker({ offline = false } = {}) {
  const events = {}, calls = [], cache = new Map(), deleted = [];
  cache.set('https://snoop.test/offline.html', new Response('<h1>Você está sem conexão</h1>'));
  const sandbox = {
    URL, Request, Response, console,
    self: { registration: { scope: 'https://snoop.test/' }, location: { origin: 'https://snoop.test' },
      addEventListener: (type, callback) => { events[type] = callback; } },
    caches: {
      open: async () => ({ addAll: async requests => { calls.push(...requests.map(r => r.url)); }, match: async url => cache.get(url)?.clone() }),
      keys: async () => ['snoop-installation-v0', 'snoop-installation-v1', 'other-app-cache'],
      delete: async key => { deleted.push(key); return true; }
    },
    fetch: async request => { if (offline) throw new TypeError('offline'); return new Response(`network:${request.url}`); }
  };
  vm.runInNewContext(read('sw.js'), sandbox);
  return { events, calls, deleted };
}

test('cada app tem identidade e destino próprios; manifests e ícones estão completos', () => {
  const store = JSON.parse(read('manifest.webmanifest'));
  const admin = JSON.parse(read('admin.webmanifest'));
  assert.notEqual(store.id, admin.id);
  assert.equal(store.start_url, './index.html');
  assert.equal(admin.start_url, './admin.html');
  for (const [manifest, html] of [[store, 'index.html'], [admin, 'admin.html']]) {
    assert.equal(manifest.display, 'standalone');
    assert.equal(manifest.scope, './');
    for (const size of ['192x192', '512x512']) assert.ok(manifest.icons.some(i => i.sizes === size && i.purpose === 'any'));
    for (const icon of manifest.icons) {
      const file = fs.readFileSync(path.join(root, icon.src));
      assert.equal(`${file.readUInt32BE(16)}x${file.readUInt32BE(20)}`, icon.sizes);
    }
    assert.match(read(html), /rel="manifest"/);
    assert.match(read(html), /js\/pwa\.js/);
  }
  const config = JSON.parse(read('vercel.json'));
  assert.ok(config.headers.find(h => h.source === '/sw.js').headers.some(h => h.key === 'Cache-Control' && h.value.includes('no-store')));
});

test('instalação guarda somente a página offline e a logo; atualização respeita outros caches', async () => {
  const w = worker();
  let done;
  w.events.install({ waitUntil: promise => { done = promise; } }); await done;
  assert.deepEqual(w.calls, ['https://snoop.test/offline.html', 'https://snoop.test/assets/logo-snoop-header.png']);
  w.events.activate({ waitUntil: promise => { done = promise; } }); await done;
  assert.deepEqual(w.deleted, ['snoop-installation-v0']);
});

test('pedidos POST, Supabase, Auth, configuração e scripts não são interceptados', () => {
  const w = worker();
  for (const request of [
    { method: 'POST', url: 'https://snoop.test/orders', mode: 'cors' },
    { method: 'GET', url: 'https://project.supabase.co/rest/v1/orders', mode: 'cors' },
    { method: 'GET', url: 'https://project.supabase.co/auth/v1/user', mode: 'cors' },
    { method: 'GET', url: 'https://snoop.test/js/config.js', mode: 'cors' },
    { method: 'GET', url: 'https://snoop.test/js/admin.js?v=1', mode: 'cors' },
    { method: 'GET', url: 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2', mode: 'cors' }
  ]) {
    w.events.fetch({ request, respondWith: () => assert.fail(`Requisição interceptada: ${request.url}`) });
  }
});

test('painel e catálogo usam rede; offline nunca retorna uma cópia do painel', async () => {
  for (const pathname of ['admin.html', 'index.html']) {
    for (const offline of [false, true]) {
      const w = worker({ offline });
      let response;
      const request = { method: 'GET', url: `https://snoop.test/${pathname}`, mode: 'navigate' };
      w.events.fetch({ request, respondWith: promise => { response = promise; } });
      const body = await (await response).text();
      assert.equal(body, offline ? '<h1>Você está sem conexão</h1>' : `network:https://snoop.test/${pathname}`);
      assert.equal(w.calls.length, 0);
    }
  }
});

test('o registro é progressivo e não roda em file:// ou fora de contexto seguro', () => {
  for (const [secure, protocol, enabled] of [[true, 'https:', true], [true, 'file:', false], [false, 'http:', false]]) {
    const registrations = [], listeners = [];
    const sandbox = {
      URL, console, Date, location: { protocol },
      document: { currentScript: { src: 'https://snoop.test/js/pwa.js' }, readyState: 'loading' },
      window: { isSecureContext: secure, addEventListener: (name, callback) => listeners.push({ name, callback }) },
      navigator: { serviceWorker: { register: (...args) => { registrations.push(args); return Promise.resolve({ update: async () => {} }); } } }
    };
    vm.runInNewContext(read('js/pwa.js'), sandbox);
    assert.equal(listeners.length, enabled ? 1 : 0);
    assert.equal(registrations.length, 0);
  }
});
