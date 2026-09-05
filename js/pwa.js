(function () {
  'use strict';
  // Adaptação de instalação: não altera DOM, autenticação ou regras de negócio.
  if (!('serviceWorker' in navigator) || !window.isSecureContext || !/^https?:$/.test(location.protocol)) return;
  const workerUrl = new URL('../sw.js', document.currentScript.src);
  const scope = new URL('./', workerUrl).href;
  async function register() {
    try {
      const registration = await navigator.serviceWorker.register(workerUrl.href, { scope, updateViaCache: 'none' });
      // A próxima abertura adota a atualização. Não recarregar um caixa/formulário em uso.
      let lastCheck = Date.now();
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible' && navigator.onLine && Date.now() - lastCheck > 60 * 60 * 1000) {
          lastCheck = Date.now();
          registration.update().catch(() => {});
        }
      });
    } catch (error) {
      // Uma falha na instalação não impede o funcionamento normal do site.
      console.warn('Não foi possível habilitar a instalação da Snoop neste navegador.', error);
    }
  }
  if (document.readyState === 'complete') register();
  else window.addEventListener('load', register, { once: true });
})();
