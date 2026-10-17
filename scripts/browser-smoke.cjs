// Run with Playwright installed. Uses the local in-memory integration server only.
const {chromium}=require('playwright');
const {spawn}=require('node:child_process');
const {mkdirSync}=require('node:fs');
const assert=require('node:assert/strict');
(async()=>{
 const server=spawn(process.execPath,['scripts/dev-test-server.mjs'],{stdio:['ignore','pipe','inherit']});
 let browser;
 try{
  await new Promise((resolve,reject)=>{server.stdout.on('data',data=>{if(String(data).includes('Local integration server'))resolve()});server.on('exit',code=>reject(Error('Test server exited: '+code)));setTimeout(()=>reject(Error('Test server timeout')),10000).unref()});
  browser=await chromium.launch({headless:true});const page=await browser.newPage({viewport:{width:1365,height:900}}),errors=[];
  page.on('pageerror',e=>errors.push(e.message));await page.route('https://**/*',r=>r.abort());
  await page.goto('http://localhost:4173/');await page.fill('#login-identity','admin');await page.fill('#login-password','local-test-only-bootstrap-password');
  await page.click('#login-form button[type=submit]');await page.waitForURL('**/account/');
  await page.locator('summary').filter({hasText:'Criar ou editar perfil'}).click();await page.fill('#profile-name','Principal');
  await page.click('#profile-form button:not([type=button])');await page.getByRole('button',{name:'Principal',exact:true}).waitFor();
  mkdirSync('test-results',{recursive:true});await page.screenshot({path:'test-results/account-desktop.png',fullPage:true});
  await page.getByRole('button',{name:'Principal',exact:true}).click();await page.waitForURL('**/cinema/');
  await page.locator('#lux-boot').waitFor({state:'hidden',timeout:20000});
  const fixture='#EXTM3U\n#EXTINF:-1 group-title="Filmes | Ação",Filme de teste (2024)\nhttps://example.com/movie/1.mp4\n#EXTINF:-1 group-title="Séries",Jornada S01E01\nhttps://example.com/series/1.mp4\n#EXTINF:-1 group-title="Séries",Jornada S02E01\nhttps://example.com/series/2.mp4\n#EXTINF:-1 tvg-id="sportv" group-title="TV Esportes",SporTV HD\nhttps://example.com/live/1.m3u8\n#EXTINF:-1 tvg-id="sportv" group-title="TV Esportes",SporTV FHD\nhttps://example.com/live/2.m3u8';
  await page.locator('input[type=file]').setInputFiles({name:'fixture.m3u',mimeType:'audio/x-mpegurl',buffer:Buffer.from(fixture)});
  await page.getByRole('button',{name:/Ver detalhes de Jornada/}).first().click();await page.locator('.lux-fullscreen-detail[open]').waitFor();
  await page.getByRole('tab',{name:'Temporada 2',exact:true}).click();assert.equal(await page.locator('.lux-full-episode-card').count(),1);
  const assertFullscreen=async()=>assert.equal(await page.locator('.lux-fullscreen-detail').evaluate(el=>{const r=el.getBoundingClientRect();return Math.abs(r.x)<1&&Math.abs(r.y)<1&&Math.abs(r.width-innerWidth)<1&&Math.abs(r.height-innerHeight)<1&&el.matches(':modal')}),true);
  await assertFullscreen();await page.screenshot({path:'test-results/series-desktop.png'});
  await page.keyboard.press('Tab');assert.equal(await page.evaluate(()=>Boolean(document.activeElement.closest('.lux-fullscreen-detail'))),true);
  await page.setViewportSize({width:390,height:844});await assertFullscreen();await page.screenshot({path:'test-results/series-mobile.png'});
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  await page.keyboard.press('Escape');await page.locator('.lux-fullscreen-detail').waitFor({state:'hidden'});
  await page.getByRole('button',{name:/Ver detalhes de Jornada/}).first().click();
  assert.equal(await page.getByRole('tab',{name:'Temporada 2',exact:true}).getAttribute('aria-selected'),'true');
  assert.deepEqual(errors,[]);
  console.log('Browser smoke passed: login → profile → catalog → series, focus, season memory and mobile. Playback not exercised.');
 }finally{await browser?.close();server.kill('SIGTERM')}
})().catch(error=>{console.error(error);process.exitCode=1});
