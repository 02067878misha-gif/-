"""Integration checks for intrusion controls, map/section rendering and vector export."""
import shutil
from pathlib import Path
from urllib.parse import urlparse
from playwright.sync_api import sync_playwright
root=Path(__file__).resolve().parent.parent
with sync_playwright() as p:
    browser=p.chromium.launch(headless=True,executable_path=shutil.which('chromium') or shutil.which('chromium-browser') or None,args=['--no-sandbox'])
    ctx=browser.new_context(viewport={'width':1500,'height':1000},accept_downloads=True)
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
    assert page.locator('.intrusion-card').count()==0
    for i in range(4):
        page.locator('.add-intrusion').click()
        page.wait_for_function(f"document.querySelectorAll('.intrusion-card').length==={i+1}",timeout=90000)
    assert page.locator('.add-intrusion').is_disabled()
    assert page.locator('.intrusion-card').count()==4
    kinds=page.locator('.intrusion-card [data-intrusion-field="type"]').evaluate_all('(els)=>els.map(e=>e.value)')
    assert kinds==['stock','dike','sill','stock'],kinds
    # Edit all three subtypes. Chromium 'change' listeners require commit.
    stock=page.locator('.intrusion-card').nth(0)
    stock.locator('[data-intrusion-field="area"]').fill('1000')
    stock.locator('[data-intrusion-field="area"]').press('Tab')
    stock.locator('[data-intrusion-field="wallDip"]').fill('22')
    stock.locator('[data-intrusion-field="wallDip"]').press('Tab')
    dike=page.locator('.intrusion-card').nth(1)
    dike.locator('[data-intrusion-field="width"]').fill('12')
    dike.locator('[data-intrusion-field="width"]').press('Tab')
    dike.locator('[data-intrusion-field="dip"]').fill('75')
    dike.locator('[data-intrusion-field="dip"]').press('Tab')
    dike.locator('[data-intrusion-field="azimuth"]').fill('125')
    dike.locator('[data-intrusion-field="azimuth"]').press('Tab')
    sill=page.locator('.intrusion-card').nth(2)
    sill.locator('[data-intrusion-field="width"]').fill('14')
    sill.locator('[data-intrusion-field="width"]').press('Tab')
    # Folded host, deformation checkbox and fault attachment.
    page.locator('[data-field="structureType"]').select_option('folding')
    page.locator('[data-field="foldAmplitude"]').fill('34')
    page.locator('[data-field="foldAmplitude"]').press('Tab')
    page.locator('.intrusion-card').nth(0).locator('[data-intrusion-field="applyDeformation"]').check()
    page.locator('.intrusion-card').nth(1).locator('[data-intrusion-field="attachFault"]').check()
    page.wait_for_function("document.querySelector('#status').textContent.includes('интрузий')",timeout=90000)
    vals=page.evaluate('''async()=>{const {state}=await import('./js/core.js');return {
      intr:state.model.intrusions.map(b=>({type:b.type,area:b.area,wallDip:b.wallDip,width:b.width,dip:b.dip,azimuth:b.azimuth,applyDeformation:b.applyDeformation,linkedFault:b.linkedFault})),
      map:document.querySelector('#mapSvg').outerHTML,section:document.querySelector('#sectionSvg').innerHTML,
      units:[...new Set(state.units)].filter(v=>v>state.model.totalUnits), total:state.model.totalUnits
    }}''')
    assert len(vals['intr'])==4,vals['intr']
    assert vals['intr'][0]['area']==1000 and vals['intr'][0]['wallDip']==22 and vals['intr'][0]['applyDeformation']
    assert vals['intr'][1]['width']==12 and vals['intr'][1]['dip']==75 and vals['intr'][1]['azimuth']==125
    assert vals['intr'][1]['linkedFault'] is not None
    assert vals['intr'][2]['width']==14
    assert any('#d87581' in vals['map'] for _ in [0])
    assert vals['units'],'At least one intrusion needs to crop out for this test seed'
    assert 'fill="#' in vals['section']
    # Magmatic bodies remain filled even if sedimentary-colour checkbox is off.
    page.locator('details.map-subsection').first.locator('summary').click()
    page.locator('#showColors').check()
    assert '#d87581' in page.locator('#mapSvg').evaluate('(el)=>el.outerHTML')
    page.locator('#showColors').uncheck()
    assert '#d87581' in page.locator('#mapSvg').evaluate('(el)=>el.outerHTML')
    page.screenshot(path='/mnt/data/GeoMap_v18_Intrusions_preview.png',full_page=True)
    with page.expect_download(timeout=30000) as dl:page.locator('#save').click()
    dl.value.save_as('/mnt/data/GeoMap_v18_Intrusions_example.svg')
    text=Path('/mnt/data/GeoMap_v18_Intrusions_example.svg').read_text()
    assert '#d87581' in text and '<svg' in text
    with ctx.expect_page() as popup_info:page.locator('#savePdf').click()
    popup=popup_info.value
    popup.wait_for_load_state('load')
    assert popup.locator('svg').count()==1
    assert '#d87581' in popup.locator('svg').evaluate('(el)=>el.outerHTML')
    popup.close()
    # invalid attempt to attach without faults must be explained in UI
    page.locator('[data-field="enableFaults"]').uncheck()
    assert 'не менее одного обязательного разлома' in page.locator('#status').inner_text()
    page.locator('[data-field="enableFaults"]').check()
    page.locator('.intrusion-card').nth(3).locator('.remove-intrusion').click()
    assert page.locator('.intrusion-card').count()==3
    assert not errors, errors
    print('PASS browser intrusion UI / 4 cap / 3 types / geological model / map / section / PDF / SVG / validation')
    browser.close()
