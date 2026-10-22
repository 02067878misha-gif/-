import shutil
from pathlib import Path
from urllib.parse import urlparse
from playwright.sync_api import sync_playwright
root=Path(__file__).resolve().parent.parent
with sync_playwright() as p:
    browser=p.chromium.launch(headless=True,executable_path=shutil.which('chromium') or shutil.which('chromium-browser') or None,args=['--no-sandbox'])
    ctx=browser.new_context(viewport={'width':1480,'height':980},accept_downloads=True)
    page=ctx.new_page(); errors=[]; page.on('pageerror',lambda e: errors.append(str(e)))
    def route(r):
        fn=(root/urlparse(r.request.url).path.lstrip('/')).resolve()
        if fn.is_file() and fn.is_relative_to(root):
            typ={'.html':'text/html','.js':'text/javascript','.css':'text/css'}.get(fn.suffix,'application/octet-stream')
            r.fulfill(status=200,content_type=typ,body=fn.read_bytes())
        else:r.fulfill(status=404,body='not found')
    page.route('**/*',route)
    html=(root/'index.html').read_text(encoding='utf-8').replace('<link rel="stylesheet" href="styles.css">','<base href="http://geomap.example/"><link rel="stylesheet" href="styles.css">')
    page.set_content(html)
    page.wait_for_function("document.querySelector('#status').textContent.includes('слоёв')",timeout=90000)
    # enable manual fault params for first complex
    page.locator('[data-field="customFaultParams"]').check()
    page.wait_for_function("document.querySelectorAll('.fault-card').length===2",timeout=10000)
    page.locator('[data-field="faultCount"]').fill('2'); page.locator('[data-field="faultCount"]').press('Tab')
    # Fault 1
    page.locator('.fault-card').nth(0).locator('[data-fault-field="type"]').select_option('взброс')
    page.locator('.fault-card').nth(0).locator('[data-fault-field="slip"]').fill('11.5'); page.locator('.fault-card').nth(0).locator('[data-fault-field="slip"]').press('Tab')
    page.locator('.fault-card').nth(0).locator('[data-fault-field="az"]').fill('35'); page.locator('.fault-card').nth(0).locator('[data-fault-field="az"]').press('Tab')
    page.locator('.fault-card').nth(0).locator('[data-fault-field="dip"]').fill('50'); page.locator('.fault-card').nth(0).locator('[data-fault-field="dip"]').press('Tab')
    # Fault 2
    page.locator('.fault-card').nth(1).locator('[data-fault-field="type"]').select_option('сдвиг')
    page.locator('.fault-card').nth(1).locator('[data-fault-field="slip"]').fill('17'); page.locator('.fault-card').nth(1).locator('[data-fault-field="slip"]').press('Tab')
    page.locator('.fault-card').nth(1).locator('[data-fault-field="az"]').fill('120'); page.locator('.fault-card').nth(1).locator('[data-fault-field="az"]').press('Tab')
    page.locator('.fault-card').nth(1).locator('[data-fault-field="dip"]').fill('70'); page.locator('.fault-card').nth(1).locator('[data-fault-field="dip"]').press('Tab')
    page.wait_for_timeout(400)
    vals=page.evaluate('''async()=>{const {state}=await import('./js/core.js');return state.model.faults.map(f=>({kind:f.kind,slip:f.slip,az:f.az,dip:f.dip}))}''')
    assert vals==[
        {'kind':'взброс','slip':11.5,'az':35,'dip':50},
        {'kind':'сдвиг','slip':17,'az':120,'dip':70}
    ], vals
    txt=page.locator('#modelInfo').text_content()
    assert 'взброс' in txt and 'сдвиг' in txt and 'амплитуда 17 м' in txt
    page.screenshot(path='/mnt/data/GeoMap_v15_fault_controls_preview.png',full_page=True)
    assert not errors, errors
    print('PASS browser fault controls / no JS errors')
    browser.close()
