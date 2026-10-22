"""UI, geometry, and export smoke test for the improved v20 intrusion geometry."""
import shutil
from pathlib import Path
from urllib.parse import urlparse
from playwright.sync_api import sync_playwright
root=Path(__file__).resolve().parent.parent
with sync_playwright() as p:
    browser=p.chromium.launch(headless=True,executable_path=shutil.which('chromium') or shutil.which('chromium-browser') or None,args=['--no-sandbox'])
    ctx=browser.new_context(viewport={'width':1550,'height':1000},accept_downloads=True)
    page=ctx.new_page(); errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
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
    for _ in range(3):page.locator('.add-intrusion').click()
    assert page.locator('.intrusion-card').count()==3
    # stock controls: irregular, apophyses, and corrected wall-angle convention
    stock=page.locator('.intrusion-card').nth(0)
    assert stock.locator('[data-intrusion-field="apophyses"]').count()==1
    assert stock.locator('[data-intrusion-field="roughContact"]').count()==1
    stock.locator('[data-intrusion-field="wallDip"]').fill('-45')
    stock.locator('[data-intrusion-field="wallDip"]').press('Tab')
    stock.locator('[data-intrusion-field="apophyses"]').check()
    stock.locator('[data-intrusion-field="roughContact"]').check()
    stock.locator('[data-intrusion-field="applyDeformation"]').check()
    # dike spread control; update and keep its width, azimuth and dip
    dike=page.locator('.intrusion-card').nth(1)
    assert dike.locator('[data-intrusion-field="spreadArea"]').count()==1
    dike.locator('[data-intrusion-field="spreadArea"]').fill('1700')
    dike.locator('[data-intrusion-field="spreadArea"]').press('Tab')
    dike.locator('[data-intrusion-field="applyDeformation"]').check()
    # Sill has no checkbox and its applied deformation is always true
    sill=page.locator('.intrusion-card').nth(2)
    assert sill.locator('[data-intrusion-field="spreadArea"]').count()==1
    assert sill.locator('[data-intrusion-field="applyDeformation"]').count()==0
    sill.locator('[data-intrusion-field="spreadArea"]').fill('1900')
    sill.locator('[data-intrusion-field="spreadArea"]').press('Tab')
    # Test faults and folding with all three intrusions together
    page.locator('[data-field="structureType"]').select_option('folding')
    page.locator('[data-field="foldAmplitude"]').fill('35')
    page.locator('[data-field="foldAmplitude"]').press('Tab')
    page.wait_for_function("document.querySelector('#status').textContent.includes('3 интрузий')",timeout=60000)
    props=page.evaluate('''async()=>{const {state}=await import('./js/core.js');return state.model.intrusions.map(b=>({type:b.type,wallDip:b.wallDip,apophyses:b.apophyses,roughContact:b.roughContact,spreadArea:b.spreadArea,applyDeformation:b.applyDeformation}))}''')
    assert props[0]['wallDip']==-45 and props[0]['apophyses'] and props[0]['roughContact'] and props[0]['applyDeformation'],props
    assert props[1]['spreadArea']==1700 and props[1]['applyDeformation'],props
    assert props[2]['spreadArea']==1900 and props[2]['applyDeformation'],props
    # Capture both the map and the new controls in the screenshot.
    page.screenshot(path='/mnt/data/GeoMap_v20_Intrusion_Controls_Preview.png',full_page=True)
    page.locator('.intrusion-card').nth(1).evaluate('(el)=>{const aside=el.closest("aside"); aside.scrollTop=el.getBoundingClientRect().top-aside.getBoundingClientRect().top+aside.scrollTop-180}')
    page.screenshot(path='/mnt/data/GeoMap_v20_Intrusion_Settings_Preview.png',full_page=True)
    with page.expect_download(timeout=30000) as dl:page.locator('#save').click()
    dl.value.save_as('/mnt/data/GeoMap_v20_Intrusion_Example.svg')
    svg=Path('/mnt/data/GeoMap_v20_Intrusion_Example.svg').read_text()
    assert '<svg' in svg and 'acidPlus' in svg and 'url(#acidPlus)' in svg
    with ctx.expect_page() as popup:page.locator('#savePdf').click()
    printed=popup.value
    printed.wait_for_load_state('load')
    assert 'acidPlus' in printed.locator('svg').evaluate('(el)=>el.outerHTML')
    printed.close()
    # Switching sill to stock and back must restore checkbox to absence.
    sill=page.locator('.intrusion-card').nth(2)
    sill.locator('[data-intrusion-field="type"]').select_option('stock')
    assert page.locator('.intrusion-card').nth(2).locator('[data-intrusion-field="applyDeformation"]').count()==1
    page.locator('.intrusion-card').nth(2).locator('[data-intrusion-field="type"]').select_option('sill')
    assert page.locator('.intrusion-card').nth(2).locator('[data-intrusion-field="applyDeformation"]').count()==0
    assert not errors,errors
    print('PASS v20 browser UI / stock options / dike+sill area / sill always deformed / folded hosts / SVG+PDF')
    browser.close()
