import shutil
from pathlib import Path
from urllib.parse import urlparse
from playwright.sync_api import sync_playwright
root=Path(__file__).resolve().parent.parent
with sync_playwright() as p:
    browser=p.chromium.launch(headless=True,executable_path=shutil.which('chromium') or shutil.which('chromium-browser') or None,args=['--no-sandbox'])
    ctx=browser.new_context(viewport={'width':1440,'height':930},accept_downloads=True)
    page=ctx.new_page(); errors=[]; page.on('pageerror',lambda e: errors.append(str(e)))
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
    # Make five complexes.
    for _ in range(3): page.locator('#addComplex').click()
    page.wait_for_function("document.querySelectorAll('.complex-card').length===4",timeout=10000)
    page.locator('details.map-subsection').first.locator('summary').click()
    page.locator('#showColors').check()
    page.wait_for_timeout(500)
    vals=page.evaluate('''async()=>{const {state}=await import('./js/core.js');return {eras:state.model.complexes.map(c=>c.eraKey), colors:state.model.complexes.map(c=>c.colors), fills:Array.from(document.querySelectorAll('#mapSvg path[fill]')).slice(0,40).map(p=>p.getAttribute('fill'))}}''')
    assert vals['eras']==['proterozoic','paleozoic','mesozoic','cenozoic'], vals['eras']
    # check representative colors from first and last complexes appear in SVG fills
    fills=set(vals['fills'])
    assert any(c in fills for c in vals['colors'][0]), fills
    assert any(c in fills for c in vals['colors'][1]), fills
    assert any(c in fills for c in vals['colors'][2]), fills
    assert any(c in fills for c in vals['colors'][3]), fills
    table_html=page.locator('#layersInfo').inner_html()
    assert 'Эратема' in table_html and 'Цвет' in table_html
    assert 'Протерозой' in table_html and 'Палеозой' in table_html and 'Кайнозой' in table_html
    page.screenshot(path='/mnt/data/GeoMap_v14_strat_colors_preview.png',full_page=True)
    assert not errors, errors
    print('PASS browser stratigraphic colors / fills / layer table / no JS errors')
    browser.close()
