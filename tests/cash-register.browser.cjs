const {test}=require('node:test');
const assert=require('node:assert/strict');
const {createServer}=require('node:http');
const fs=require('node:fs/promises');
const path=require('node:path');
const {chromium}=require('../.test-tools/node_modules/playwright');
test('confirmar recebe, bloqueia edição, contabiliza saídas e fecha o caixa',async()=>{
 const root=path.resolve(__dirname,'..');
 const server=createServer(async(req,res)=>{try{const url=new URL(req.url,'http://localhost');const file=path.resolve(root,'.'+decodeURIComponent(url.pathname));if(!file.startsWith(root+path.sep)){res.writeHead(403).end();return;}res.setHeader('Content-Type',({'.html':'text/html','.js':'text/javascript','.css':'text/css'}[path.extname(file)]||'application/octet-stream')+'; charset=utf-8');res.end(await fs.readFile(file));}catch{res.writeHead(404).end();}});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin=`http://127.0.0.1:${server.address().port}`;
 let browser;
 try{
  browser=await chromium.launch({channel:'msedge',headless:true});
  const context=await browser.newContext({viewport:{width:1536,height:1100},serviceWorkers:'block'});
  const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/*',route=>{const url=new URL(route.request().url());if(url.origin!==origin)return route.abort();if(url.pathname==='/js/config.js')return route.fulfill({contentType:'text/javascript',body:'window.APP_CONFIG={demoAdminPin:"test",storeName:"Snoop"};'});return route.continue();});
  await page.addInitScript(()=>{if(localStorage.getItem('fixture'))return;localStorage.setItem('fixture','yes');sessionStorage.setItem('snoop_admin_session_v1','authenticated');localStorage.setItem('snoop_orders_v1',JSON.stringify(['Dinheiro','Pix','Cartão na entrega','Pix'].map((payment,i)=>({id:`10000000-0000-0000-0000-00000000000${i+1}`,code:`TESTE${i+1}`,customerName:'Cliente teste',status:i===3?'cancelled':'pending',trustedTotal:[40,60,30,20][i],clientTotal:999,address:'Venda presencial',payment,items:[],createdAt:new Date(Date.now()-86400000).toISOString()}))));});
  await page.goto(origin+'/admin.html');await page.locator('[data-view=cashClosing]').click();
  await page.locator('#registerOpenForm input').fill('100');await page.locator('#registerOpenForm button').click();
  await page.locator('#registerContent').waitFor({state:'visible'});
  assert.match(await page.locator('#registerTotals').innerText(),/100,00/);
  assert.equal(await page.locator('#registerMovementForm option[value=receipt]').count(),0);
  await page.locator('[data-view=orders]').click();
  for(let i=1;i<=3;i++) {await page.locator(`#ordersList [data-id="10000000-0000-0000-0000-00000000000${i}"] [data-status=confirmed]`).click();await page.locator(`#ordersList [data-id="10000000-0000-0000-0000-00000000000${i}"]`).waitFor({state:'detached'});}
  await page.locator('[data-order-filter=confirmed]').click();
  assert.equal(await page.locator('#confirmedOrdersList [data-status]').count(),0);
  const rejection=await page.evaluate(async()=>{try{await StoreAPI.updateOrderStatus('10000000-0000-0000-0000-000000000001','cancelled');return 'aceito';}catch(e){return e.message;}});
  assert.match(rejection,/não pode ser alterado/);
  await page.evaluate(()=>StoreAPI.updateOrderStatus('10000000-0000-0000-0000-000000000001','confirmed'));
  await page.locator('[data-view=cashClosing]').click();
  assert.match(await page.locator('#registerPendingTitle').innerText(),/Nenhum/);
  assert.equal(await page.locator('#registerCloseForm button[type=submit]').isDisabled(),false);
  assert.equal(await page.locator('[data-verify]').count(),0);
  assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('snoop_register_v2')).movements.filter(m=>m.kind==='receipt').length),3);
  await page.locator('[data-view=expenses]').click();
  await page.locator('#expenseForm [name=description]').fill('Compra de embalagens');await page.locator('#expenseForm [name=amount]').fill('25');await page.locator('#expenseForm [name=method]').selectOption('cash');await page.locator('#expenseForm button[type=submit]').click();
  await page.waitForFunction(()=>document.querySelector('#expenseForm [name=amount]').value==='');
  await page.locator('[data-view=cashClosing]').click();await page.waitForFunction(()=>document.querySelector('.register-expected').textContent.includes('115,00'));
  assert.match(await page.locator('#registerSalesTotal').innerText(),/130,00/,'total das vendas inclui dinheiro, Pix e cartão, sem subtrair a despesa');
  assert.match(await page.locator('#registerSalesMethods').innerText(),/40,00/);
  assert.match(await page.locator('#registerSalesMethods').innerText(),/60,00/);
  assert.match(await page.locator('#registerSalesMethods').innerText(),/30,00/);
  await page.screenshot({path:'.test-tools/register-desktop.png',fullPage:true});
  const count=page.locator('#registerCloseForm [name=counted_cash]');await count.fill('35.50');
  assert.equal(await page.locator('#registerNotesLabel').isVisible(),true);
  assert.match(await page.locator('#registerNotesReason').innerText(),/falta de.*79,50/);
  await count.fill('115');
  assert.match(await page.locator('#registerDifference').innerText(),/Confere/);
  assert.equal(await page.locator('#registerNotesLabel').isVisible(),false);
  await page.locator('#registerCloseForm button[type=submit]').click();await page.locator('#saveCashClosing').click();await page.locator('#cashClosingConfirm').waitFor({state:'hidden'});
  await page.locator('#registerSaved').waitFor({state:'visible'});assert.equal(await page.locator('#registerEntryCard').isVisible(),false);
  await page.reload();await page.locator('[data-view=cashClosing]').click();await page.locator('#registerSaved').waitFor({state:'visible'});
  await page.locator('#registerRevise').click();await count.fill('116');await page.locator('#registerCloseForm [name=notes]').fill('Moeda encontrada na recontagem');await page.locator('#registerCloseForm button[type=submit]').click();await page.locator('#saveCashClosing').click();await page.locator('#cashClosingConfirm').waitFor({state:'hidden'});
  assert.match(await page.locator('#registerSaved').innerText(),/versão 2/);
  await page.locator('#registerViewLatest').click();assert.match(await page.locator('#closingReportBody').innerText(),/Moeda encontrada/);await page.locator('#cashClosingReport [data-close-closing]').first().click();
  for(const width of [390,768]){await page.setViewportSize({width,height:900});await page.waitForTimeout(300);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,`sem overflow em ${width}`);assert.ok((await page.locator('.admin-sidebar').boundingBox()).x<0,'menu recolhido no celular');await page.screenshot({path:`.test-tools/register-${width}.png`,fullPage:true});}
  assert.deepEqual(errors,[]);
 }finally{await browser?.close();await new Promise(r=>server.close(r));}
});
