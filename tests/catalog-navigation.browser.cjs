// Teste local isolado: não consulta Supabase nem registra pedidos reais.
// npm.cmd install --prefix .test-tools --no-save --package-lock=false playwright
// node --test tests/catalog-navigation.browser.cjs
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createServer } = require('node:http');
const { readFile } = require('node:fs/promises');
const path = require('node:path');
const { chromium } = require('../.test-tools/node_modules/playwright');
const root = path.resolve(__dirname, '..');
const categories = ['Cervejas', 'Energéticos', 'Refrigerantes', 'Águas', 'Whiskies', 'Vinhos', 'Gins', 'Vodkas', 'Gelo', 'Combos', 'Sucos', 'Licores', 'Destilados & especiais', 'Kits para festas e bebidas especiais sem álcool'];
const products = categories.flatMap((category, c) => Array.from({ length: 8 }, (_, i) => ({
  id: `p-${c}-${i}`, name: `${category} ${i + 1}`, description: 'Produto de teste', price: i === 1 ? 11111 : 10,
  category, image: c % 2 ? 'assets/carousel/06-coca-cola.jpg' : 'assets/carousel/02-heineken.jpg', available: true
})));

test('catálogo responsivo: toque, categorias, busca e carrinho sem acesso ao banco', async t => {
  const server = createServer(async (req, res) => {
    try {
      const url = new URL(req.url, 'http://localhost');
      const file = path.resolve(root, '.' + decodeURIComponent(url.pathname === '/' ? '/index.html' : url.pathname));
      if (!file.startsWith(root + path.sep)) { res.writeHead(403).end(); return; }
      const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.jpg': 'image/jpeg', '.webmanifest': 'application/manifest+json' };
      res.writeHead(200, { 'Content-Type': `${mime[path.extname(file)] || 'application/octet-stream'}; charset=utf-8` });
      res.end(await readFile(file));
    } catch { res.writeHead(404).end(); }
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const origin = `http://127.0.0.1:${server.address().port}`;
  let browser;
  try {
    browser = await chromium.launch({ channel: 'msedge', headless: true });
    for (const width of [320, 360, 375, 390, 430, 560, 768, 820, 1024, 1440]) {
      await t.test(`${width}px: sem cortes e filtros funcionais`, async () => {
        const mobile = width <= 820;
        const context = await browser.newContext({ viewport: { width, height: 844 }, isMobile: mobile, hasTouch: mobile, reducedMotion: 'reduce', serviceWorkers: 'block' });
        const page = await context.newPage();
        let fixtureProducts = products;
        const errors = [];
        page.on('pageerror', error => errors.push(error.message));
        await page.route('**/*', route => {
          const url = new URL(route.request().url());
          if (url.origin !== origin) return route.abort();
          if (url.pathname === '/js/config.js') return route.fulfill({ contentType: 'text/javascript', body: 'window.APP_CONFIG={};' });
          if (url.pathname === '/js/storage.js') return route.fulfill({ contentType: 'text/javascript', body: `window.StoreAPI={getProducts:async()=>${JSON.stringify(fixtureProducts)},createOrder:async()=>{throw Error('Pedidos reais bloqueados no teste')}};` });
          return route.continue();
        });
        await page.goto(origin);
        await page.waitForFunction(() => document.querySelectorAll('.category-button').length === 15);
        await page.locator('#produtos').evaluate(el => el.scrollIntoView({ behavior: 'instant' }));
        await page.waitForTimeout(100);
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, 'a página não deve rolar horizontalmente');
        assert.equal(await page.locator('.product-card').count(), products.length);
        assert.equal(await page.locator('.category-button[aria-pressed=true]').count(), 1);
        if (mobile) {
          await page.locator('#expandCategories').waitFor({ state: 'visible' });
          assert.equal(await page.locator('#previousCategories').isDisabled(), true);
          await page.locator('#nextCategories').click();
          await page.waitForFunction(() => document.querySelector('#categories').scrollLeft > 0);
          await page.locator('#expandCategories').click();
          assert.equal(await page.locator('#expandCategories').getAttribute('aria-expanded'), 'true');
          assert.equal(await page.locator('#nextCategories').isVisible(), false);
          assert.equal(await page.locator('.category-button').evaluateAll(buttons => buttons.every(button => {
            const b = button.getBoundingClientRect();
            const p = button.parentElement.getBoundingClientRect();
            return b.height >= 44 && b.left >= p.left - 1 && b.right <= p.right + 1;
          })), true, 'botões inteiros, com área de toque mínima de 44px');
        } else {
          assert.equal(await page.locator('#expandCategories').isVisible(), false);
          assert.equal(await page.locator('#nextCategories').isVisible(), false);
        }
        const last = page.locator('.category-button').last();
        await last.evaluate(el => { window.originalCategoryButton = el; });
        await last.click();
        assert.equal(await page.locator('.product-card').count(), 8);
        assert.equal(await page.evaluate(() => document.querySelector('.category-button.active') === window.originalCategoryButton), true, 'não recria nem perde o botão selecionado');
        assert.match(await page.locator('#catalogResults').textContent(), /8 produtos/);
        if (mobile) {
          assert.equal(await page.locator('#expandCategories').getAttribute('aria-expanded'), 'false');
          await page.waitForTimeout(80);
          assert.equal(await last.evaluate(el => { const b = el.getBoundingClientRect(); const p = el.parentElement.getBoundingClientRect(); return b.left >= p.left - 1 && b.right <= p.right + 1; }), true, 'categoria ativa permanece visível');
        }
        await page.locator('#searchInput').fill('zzzz-inexistente');
        assert.equal(await page.locator('#emptyState').isVisible(), true);
        assert.match(await page.locator('#catalogResults').textContent(), /0 produtos/);
        await page.locator('#searchInput').fill('');
        assert.equal(await page.locator('.product-card').count(), 8);
        await page.locator('.add-button').first().click();
        assert.equal(await page.locator('#cartCount').textContent(), '1');
        await page.locator('#openCart').click();
        assert.equal(await page.locator('#cartDrawer').getAttribute('aria-hidden'), 'false');
        assert.equal(await page.locator('.cart-line').count(), 1);
        await page.locator('#closeCart').click();
        await page.waitForTimeout(300);
        if (mobile) {
          await page.locator('#expandCategories').click();
          await page.locator('.category-button').first().click();
          await page.locator('#produtos').evaluate(el => el.scrollIntoView({ behavior: 'instant' }));
          await page.evaluate(() => window.scrollBy({ top: 600, behavior: 'instant' }));
          assert.equal(await page.locator('#categoryNavigation').evaluate(el => Math.abs(el.getBoundingClientRect().top - document.querySelector('.topbar').getBoundingClientRect().bottom) < 2), true, 'filtro fixo logo abaixo do cabeçalho');
          await page.locator('#expandCategories').click();
          await page.keyboard.press('Escape');
          assert.equal(await page.locator('#expandCategories').getAttribute('aria-expanded'), 'false');
          assert.equal(await page.locator('#expandCategories').evaluate(el => el === document.activeElement), true);
        }
        if ([390, 768, 1440].includes(width)) {
          await page.locator('#searchInput').fill('');
          await page.locator('#produtos').evaluate(el => el.scrollIntoView({ behavior: 'instant' }));
          await page.locator('#searchInput').blur();
          await page.waitForTimeout(2500);
          await page.screenshot({ path: path.join(root, '.test-tools', `catalog-${width}.png`) });
        }
        if (width === 390) {
          // Deslize real de toque, não apenas alteração programática do scrollLeft.
          const session = await context.newCDPSession(page);
          const rect = await page.locator('#categories').boundingBox();
          const startX = rect.x + rect.width - 15;
          const y = rect.y + rect.height / 2;
          await session.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: startX, y }] });
          for (let step = 1; step <= 6; step++) {
            await session.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: startX - step * 25, y }] });
          }
          await session.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
          await page.waitForFunction(() => document.querySelector('#categories').scrollLeft > 0);
          await session.detach();
          await page.locator('#expandCategories').click();
          await page.waitForTimeout(150);
          assert.equal(await page.locator('#categories').evaluate(el => el.scrollLeft), 0, 'abrir a grade cancela a rolagem lateral anterior');
          assert.equal(await page.locator('.category-button').first().evaluate(el => el.getBoundingClientRect().left >= el.parentElement.getBoundingClientRect().left), true, 'primeira categoria não fica cortada após deslizar');
          await page.screenshot({ path: path.join(root, '.test-tools', 'catalog-categories-expanded.png') });
          await page.setViewportSize({ width: 844, height: 390 });
          await page.waitForFunction(() => !document.querySelector('#categoryNavigation').classList.contains('is-expanded'));
          assert.equal(await page.locator('#expandCategories').isVisible(), false, 'rotação volta ao layout largo');
          await page.setViewportSize({ width: 390, height: 844 });
          await page.locator('#expandCategories').waitFor({ state: 'visible' });
          await page.evaluate(() => { document.documentElement.style.fontSize = '200%'; });
          await page.locator('#expandCategories').click();
          assert.equal(await page.locator('#categories').evaluate(el => el.scrollWidth <= el.clientWidth + 1), true, 'texto ampliado não corta categorias na lista completa');
          fixtureProducts = products.slice(0, 1);
          await page.reload();
          await page.waitForFunction(() => document.querySelectorAll('.category-button').length === 2);
          await page.waitForTimeout(100);
          assert.equal(await page.locator('#expandCategories').isVisible(), false, 'sem controles desnecessários para poucas categorias');
          assert.equal(await page.locator('#nextCategories').isVisible(), false);
          fixtureProducts = [];
          await page.reload();
          await page.waitForFunction(() => document.querySelectorAll('.category-button').length === 1);
          assert.equal(await page.locator('#emptyState').isVisible(), true);
          assert.match(await page.locator('#catalogResults').textContent(), /0 produtos/);
        }
        assert.deepEqual(errors, []);
        await context.close();
      });
    }
  } finally {
    if (browser) await browser.close();
    await new Promise(resolve => server.close(resolve));
  }
});
