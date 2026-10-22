"""UI and export regression for v13 layer controls; requires Playwright only for testing."""
import shutil
from pathlib import Path
from urllib.parse import urlparse
from playwright.sync_api import sync_playwright
root=Path(__file__).resolve().parent.parent
with sync_playwright() as p:
    browser=p.chromium.launch(headless=True,executable_path=shutil.which('chromium') or shutil.which('chromium-browser') or None,args=['--no-sandbox'])
    ctx=browser.new_context(viewport={'width':1440,'height':930},accept_downloads=True)
    page=ctx.new_page()
    errors=[]
    page.on('pageerror',lambda e: errors.append(str(e)))
    def route(r):
        fn=(root/urlparse(r.request.url).path.lstrip('/')).resolve()
        if fn.is_file() and fn.is_relative_to(root):
            typ={'.html':'text/html','.js':'text/javascript','.css':'text/css'}.get(fn.suffix,'application/octet-stream')
            r.fulfill(status=200,content_type=typ,body=fn.read_bytes())
        else:r.fulfill(status=404,body='not found')
    page.route('**/*',route)
    html=(root/'index.html').read_text(encoding='utf-8').replace('<link rel="stylesheet" href="styles.css">', '<base href="http://geomap.example/"><link rel="stylesheet" href="styles.css">')
    page.set_content(html)
    page.wait_for_function("document.querySelector('#status').textContent.includes('слоёв')",timeout=90000)
    assert page.locator('[data-field="layerCount"]').count()==0
    assert page.locator('[data-field="dip"]').count()==0
    assert page.locator('[data-field="azimuth"]').count()==0
    page.locator('[data-field="customLayerCount"]').check()
    page.locator('[data-field="layerCount"]').fill('7')
    page.locator('[data-field="layerCount"]').press('Tab')
    page.locator('[data-field="customDip"]').check()
    page.locator('[data-field="dip"]').fill('32.5')
    page.locator('[data-field="dip"]').press('Tab')
    page.locator('[data-field="customAzimuth"]').check()
    page.locator('[data-field="azimuth"]').fill('135.5')
    page.locator('[data-field="azimuth"]').press('Tab')
    page.wait_for_function("document.querySelector('#modelInfo').textContent.includes('7 слоёв, моноклинальное залегание (угол 32.5°')",timeout=90000)
    page.locator('#addComplex').click()
    page.wait_for_function("document.querySelector('#modelInfo').textContent.includes('слоёв: 14')",timeout=90000)
    # Independent controls by complex.
    page.locator('.complex-card').nth(1).locator('[data-field="layerCount"]').fill('3')
    page.locator('.complex-card').nth(1).locator('[data-field="layerCount"]').press('Tab')
    page.wait_for_function("document.querySelector('#modelInfo').textContent.includes('слоёв: 10')",timeout=90000)
    layers=page.locator('#layersInfo tbody tr').count()
    assert layers==10, layers
    vals=page.evaluate('''async()=>{const {state}=await import('./js/core.js');return {counts:state.model.complexes.map(c=>c.T.length),dips:state.model.complexes.map(c=>c.d),az:state.model.complexes.map(c=>c.az),k:state.model.totalUnits}}''')
    assert vals=={'counts':[7,3],'dips':[32.5,32.5],'az':[135.5,135.5],'k':10},vals
    page.locator('details.map-subsection').first.locator('summary').click()
    page.locator('#showColors').check()
    page.screenshot(path='/mnt/data/GeoMap_v13_layers_preview.png',full_page=True)
    with page.expect_download(timeout=30000) as dl:page.locator('#save').click()
    svg=dl.value
    out='/mnt/data/GeoMap_v13_layers_sample.svg';svg.save_as(out)
    assert Path(out).read_text().startswith('<?xml') or '<svg' in Path(out).read_text()
    # PDF print page must use the same on-screen SVG geometry, without section controls.
    ctx.add_init_script('window.print = function(){window.__printed=true}')
    with ctx.expect_page() as popup_info:
        page.locator('#savePdf').click()
    popup=popup_info.value
    popup.wait_for_load_state('load')
    print_svg=popup.locator('svg').count()
    assert print_svg==1
    assert popup.locator('.sectionline,.handle,.sectionEnd').count()==0
    assert 'width="270mm"' in popup.locator('svg').evaluate('(el)=>el.outerHTML')
    popup.close()
    # Untick -> default, 5 units in this complex (retains custom values for next re-enable).
    page.locator('.complex-card').nth(0).locator('[data-field="customLayerCount"]').uncheck()
    page.wait_for_function("document.querySelector('#modelInfo').textContent.includes('слоёв: 8')",timeout=90000)
    page.locator('.complex-card').nth(0).locator('[data-field="customDip"]').uncheck()
    page.locator('.complex-card').nth(0).locator('[data-field="customAzimuth"]').uncheck()
    page.wait_for_function("document.querySelector('#modelInfo').textContent.includes('слоёв: 8')",timeout=90000)
    assert page.locator('.complex-card').nth(0).locator('[data-field="dip"]').count()==0
    assert not errors,errors
    print('PASS browser UI / conditional fields / independent complexes / SVG / toggling overrides / no JS errors')
    browser.close()
