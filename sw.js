'use strict';

// Somente a tela de falta de conexão e seus recursos entram no cache da PWA.
// NÃO armazenar HTML do painel, JS de negócios, configuração, Auth ou respostas do Supabase.
const CACHE_PREFIX = 'snoop-installation-';
const CACHE_NAME = `${CACHE_PREFIX}v1`;
const base = self.registration.scope;
const offlineUrl = new URL('offline.html', base).href;
const offlineAssets = [offlineUrl, new URL('assets/logo-snoop-header.png', base).href];

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    await cache.addAll(offlineAssets.map(url => new Request(url, { cache: 'reload' })));
  })());
  // Não usar skipWaiting: atualizações não interrompem sessões abertas.
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(key => key.startsWith(CACHE_PREFIX) && key !== CACHE_NAME).map(key => caches.delete(key)));
  })());
});

self.addEventListener('fetch', event => {
  const request = event.request;
  // Inclui POST de pedidos/caixa: nenhuma requisição mutável é interceptada ou repetida.
  if (request.method !== 'GET' || new URL(request.url).origin !== self.location.origin) return;

  if (request.mode === 'navigate') {
    event.respondWith((async () => {
      try {
        // Páginas sempre vêm da rede; não reabrir uma tela financeira antiga sem conexão.
        return await fetch(request, { cache: 'no-store' });
      } catch {
        const cache = await caches.open(CACHE_NAME);
        return await cache.match(offlineUrl) || new Response('Sem conexão. Conecte-se à internet e abra a Snoop novamente.', {
          status: 503, headers: { 'Content-Type': 'text/plain; charset=utf-8' }
        });
      }
    })());
    return;
  }

  // A única imagem cacheada é a logo pública da tela offline.
  if (request.url === offlineAssets[1]) {
    event.respondWith((async () => {
      try { return await fetch(request); }
      catch {
        const cache = await caches.open(CACHE_NAME);
        return await cache.match(request.url) || Response.error();
      }
    })());
  }
});
