"""Test v19 layout interactions and v18 geometry parity in Chromium."""
import json
import shutil
from pathlib import Path
from urllib.parse import urlparse
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parent.parent
BASE=ROOT.parent/'baseline'/'GeoMap_v18_Intrusions'
def mount(page,root):
    def serve(req):
        path=(root/urlparse(req.request.url).path.lstrip('/')).resolve()
        if path.is_file() and path.is_relative_to(root):
            kind={'.html':'text/html','.js':'text/javascript','.css':'text/css'}.get(path.suffix,'application/octet-stream')
            req.fulfill(status=200,body=path.read_bytes(),content_type=kind)
        else:req.fulfill(status=404,body='not found')
    page.route('**/*',serve)
    raw=(root/'index.html').read_text(encoding='utf-8').replace('<link rel="stylesheet" href="styles.css">', '<base href="http://geomap.example/"><link rel="stylesheet" href="styles.css">')
    page.set_content(raw)
    page.wait_for_function("document.querySelector('#status').textContent.includes('слоёв')",timeout=90000)

def snapshot(page):
    return page.evaluate("""async()=>{
      const {state}=await import('./js/core.js');
      return {model:JSON.stringify(state.model),heights:Array.from(state.heights),units:Array.from(state.units),map:document.querySelector('#mapSvg').outerHTML,section:document.querySelector('#sectionSvg').innerHTML};
    }""")

with sync_playwright() as p:
    browser=p.chromium.launch(headless=True,executable_path=shutil.which('chromium') or shutil.which('chromium-browser') or None,args=['--no-sandbox'])
    ctx_new=browser.new_context(viewport={'width':1680,'height':980},accept_downloads=True)
    ctx_old=browser.new_context(viewport={'width':1680,'height':980},accept_downloads=True)
    new=ctx_new.new_page(); old=ctx_old.new_page()
    errors=[];new.on('pageerror',lambda e:errors.append(str(e)))
    mount(new,ROOT);mount(old,BASE)
    assert new.locator('aside > .settings-card').count()==1
    assert new.locator('#mapSettingsTitle').inner_text()=='Настройки карты'
    assert new.locator('.complex-card').count()==1
    assert new.locator('.complex-card').first.locator('.complex-header').inner_text().startswith('01')
    assert new.locator('.settings-card #seed').count()==1
    assert new.locator('.settings-card #save').count()==1
    assert new.locator('.settings-card #savePdf').count()==1
    assert new.locator('.settings-card #cx').count()==1
    assert new.locator('.settings-card #showColors').count()==1
    assert new.locator('.settings-card #modelInfo').count()==1
    assert new.locator('.complex-card [data-field="structureType"]').count()==1
    assert new.locator('.complex-card .add-intrusion').count()==1
    assert new.locator('#statComplexes').inner_text()=='1'
    assert new.locator('#statLayers').inner_text()=='5'
    assert new.locator('#statIntrusions').inner_text()=='0'
    assert snapshot(old)==snapshot(new),'Default model/map/section differ from v18'
    # Collapsing a card must not lose settings during rerender triggered by seed change.
    new.locator('.complex-header').first.click()
    assert not new.locator('.complex-card').first.evaluate('(el)=>el.open')
    new.locator('#nextSeed').click()
    new.wait_for_function("document.querySelector('#status').textContent.includes('SEED 43')",timeout=90000)
    assert not new.locator('.complex-card').first.evaluate('(el)=>el.open')
    new.locator('.complex-header').first.click()
    old.locator('#nextSeed').click()
    old.wait_for_function("document.querySelector('#status').textContent.includes('SEED 43')",timeout=90000)
    assert snapshot(old)==snapshot(new),'SEED43 model/map/section differ'
    # Toggle map settings/exports and preserve layout metadata.
    new.locator('details.map-subsection').first.locator('summary').click()
    new.locator('#showColors').check();old.locator('#showColors').check()
    new.wait_for_timeout(550);old.wait_for_timeout(550)
    assert snapshot(old)==snapshot(new),'Colour map differs'
    new.locator('#showContours').uncheck();old.locator('#showContours').uncheck()
    new.wait_for_timeout(550);old.wait_for_timeout(550)
    assert snapshot(old)==snapshot(new),'Contour toggle differs'
    new.locator('details.map-subsection').last.locator(':scope > summary').first.click()
    assert new.locator('#modelInfo').is_visible()
    # Add separate complex and customise its geology.
    new.locator('#addComplex').click();old.locator('#addComplex').click()
    new.wait_for_function("document.querySelector('#statComplexes').textContent==='2'",timeout=90000)
    new.locator('.complex-card').last.locator('[data-field="structureType"]').select_option('folding')
    old.locator('.complex-card').last.locator('[data-field="structureType"]').select_option('folding')
    new.locator('.complex-card').last.locator('[data-field="foldAmplitude"]').fill('20');new.locator('.complex-card').last.locator('[data-field="foldAmplitude"]').press('Tab')
    old.locator('.complex-card').last.locator('[data-field="foldAmplitude"]').fill('20');old.locator('.complex-card').last.locator('[data-field="foldAmplitude"]').press('Tab')
    assert snapshot(old)==snapshot(new),'2 complexes with folds differ'
    assert new.locator('#complexCount').inner_text()=='2'
    assert new.locator('#statLayers').inner_text()=='10'
    # Intrusion controls remain inside their own complex panel.
    new.locator('.complex-card').last.locator('.add-intrusion').click()
    old.locator('.complex-card').last.locator('.add-intrusion').click()
    new.wait_for_timeout(450);old.wait_for_timeout(450)
    a,b=snapshot(old),snapshot(new)
    if a!=b:print('INTRUSION DIFF',[(k,len(str(a[k])),len(str(b[k]))) for k in a if a[k]!=b[k]])
    assert a==b,'Intrusive model differs'
    assert new.locator('#statIntrusions').inner_text()=='1'
    # When collapsed, summary remains informative and the next panel stays usable.
    new.locator('.complex-header').first.click()
    new.locator('.complex-card').last.locator('[data-field="foldWidth"]').fill('50')
    new.locator('.complex-card').last.locator('[data-field="foldWidth"]').press('Tab')
    assert not new.locator('.complex-card').first.evaluate('(el)=>el.open')
    # Export same SVG after identical fold width.
    old.locator('.complex-card').last.locator('[data-field="foldWidth"]').fill('50')
    old.locator('.complex-card').last.locator('[data-field="foldWidth"]').press('Tab')
    new.wait_for_timeout(450);old.wait_for_timeout(450)
    assert snapshot(old)==snapshot(new),'Fold width differs'
    with new.expect_download(timeout=30000) as d:new.locator('#save').click()
    d.value.save_as('/mnt/data/GeoMap_v19_interface_example.svg')
    with ctx_new.expect_page() as pdf_popup:new.locator('#savePdf').click()
    popup=pdf_popup.value;popup.wait_for_load_state('load')
    assert popup.locator('svg').count()==1
    popup.close()
    assert not errors,errors
    # Screenshot initial panel overview with both complexes.
    new.locator('.complex-header').first.click()
    new.locator('details.map-subsection').first.locator('summary').click()
    new.locator('details.map-subsection').last.locator(':scope > summary').click()
    new.screenshot(path='/mnt/data/GeoMap_v19_interface_preview.png',full_page=True)
    # Capture the full sidebar with two cards to review the complete settings hierarchy.
    new.add_style_tag(content='aside.editor-sidebar{position:static!important;max-height:none!important;min-height:0!important;overflow:visible!important}')
    new.locator('aside.editor-sidebar').screenshot(path='/mnt/data/GeoMap_v19_settings_blocks.png')
    # Mobile layout: map must remain reachable below controls.
    mobile=ctx_new.new_page();mobile.set_viewport_size({'width':390,'height':844});mount(mobile,ROOT)
    m=mobile.evaluate("""()=>({aside:document.querySelector('aside').getBoundingClientRect().width,
      body:document.documentElement.scrollWidth,vw:window.innerWidth,map:document.querySelector('#mapSvg').getBoundingClientRect().width})""")
    assert m['body']<=m['vw']+3,m
    mobile.screenshot(path='/mnt/data/GeoMap_v19_interface_mobile.png',full_page=True)
    print('PASS v19 cards / collapse persistence / v18 geometry identity across SEED/folds/intrusions / SVG/PDF / responsive layout')
    browser.close()
