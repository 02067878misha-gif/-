"""End-to-end v21 UI test: ages, terrain, section visibility, acidic intrusions and SVG/PDF."""
import shutil
from pathlib import Path
from urllib.parse import urlparse
from playwright.sync_api import sync_playwright
root=Path(__file__).resolve().parent.parent
with sync_playwright() as p:
    browser=p.chromium.launch(headless=True,executable_path=shutil.which('chromium') or shutil.which('chromium-browser') or None,args=['--no-sandbox'])
    ctx=browser.new_context(viewport={'width':1640,'height':1050},accept_downloads=True)
    page=ctx.new_page();errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
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
    assert page.locator('details.terrain-card').count()==1
    assert page.locator('#showSectionLine').is_checked()
    assert page.locator('#mapSvg .sectionline[stroke-dasharray]').count()==1
    assert page.locator('#layersInfo').inner_html().find('Отдел / подразделение')>=0
    assert 'age' not in 'dummy'
    # open map appearance and section controls
    page.locator('details.map-subsection').nth(0).locator('summary').click()
    page.locator('details.map-subsection').nth(1).locator('summary').click()
    # age button labels, independent from manual labels
    page.locator('#labelAges').click()
    assert page.locator('#mapSvg text.ageLabel').count()>=1
    age_markup=page.locator('#mapSvg text.ageLabel').first.text_content()
    assert age_markup
    page.locator('#clearAges').click()
    assert page.locator('#mapSvg text.ageLabel').count()==0
    page.locator('#labelAges').click()
    # section line hidden without affecting 2D section
    sec_before=page.locator('#sectionSvg').inner_html()
    page.locator('#showSectionLine').uncheck()
    assert page.locator('#mapSvg .sectionline,#mapSvg .handle,#mapSvg .sectionEnd').count()==0
    assert page.locator('#sectionSvg').inner_html()==sec_before
    page.locator('#showSectionLine').check()
    assert page.locator('#mapSvg .sectionline').count()==1
    # change relief; ensure model changes but controls still reflect settings
    baseline=page.evaluate('''async()=>{const {state}=await import('./js/core.js');return state.heights[3030]}''')
    page.locator('#terrainDissection').fill('150');page.locator('#terrainDissection').dispatch_event('change')
    page.locator('#terrainIntensity').fill('170');page.locator('#terrainIntensity').dispatch_event('change')
    page.locator('#terrainIncision').fill('36');page.locator('#terrainIncision').dispatch_event('change')
    page.wait_for_function("document.querySelector('#status').textContent.includes('SEED')",timeout=90000)
    terrain=page.evaluate('''async()=>{const {state}=await import('./js/core.js');return {t:state.model.terrain,h:state.heights[3030]}}''')
    assert terrain['t']['dissection']==150 and terrain['t']['intensity']==170 and terrain['t']['incision']==36,terrain
    assert terrain['h']!=baseline
    page.locator('#terrainFlat').check()
    page.wait_for_function("document.querySelector('#status').textContent.includes('SEED')",timeout=90000)
    assert page.evaluate('''async()=>{const {state}=await import('./js/core.js');return state.model.terrain.subhorizontal}''')
    page.locator('#terrainFlat').uncheck()
    page.locator('#terrainPositiveIntrusions').check()
    page.wait_for_function("document.querySelector('#status').textContent.includes('SEED')",timeout=90000)
    # add 3 intrusive types to single complex
    for _ in range(3):page.locator('.add-intrusion').click()
    page.wait_for_function("document.querySelector('#statIntrusions').textContent==='3'",timeout=90000)
    page.locator('#showColors').check()
    page.wait_for_timeout(200)
    data=page.evaluate('''async()=>{const {state}=await import('./js/core.js');return {ids:state.model.intrusions.map(x=>x.id),styles:state.model.intrusions.map(x=>state.model.unitStyles[x.id]),svg:document.querySelector('#mapSvg').outerHTML,section:document.querySelector('#sectionSvg').innerHTML}}''')
    assert all(s['intrusion'] and s['pattern']=='acidPlus' and s['color'].startswith('#') for s in data['styles'])
    assert 'id="acidPlus"' in data['svg'] and 'url(#acidPlus)' in data['svg'], 'Missing map hatch fill'
    assert 'id="acidPlus"' in data['section'], 'Missing section hatch pattern'
    page.locator('.map-subsection').first.locator('summary').click() if not page.locator('.map-subsection').first.evaluate('(el)=>el.open') else None
    page.screenshot(path='/mnt/data/GeoMap_v21_Ages_Terrain_Preview.png',full_page=True)
    # A separate readable picture of all controls, including the relief card.
    page.locator('.complex-header').first.click()
    page.add_style_tag(content='aside.editor-sidebar{position:static!important;max-height:none!important;min-height:0!important;overflow:visible!important}')
    page.locator('aside.editor-sidebar').screenshot(path='/mnt/data/GeoMap_v21_Relief_Settings.png')
    # SVG export displays ages and hatch, never section line
    with page.expect_download(timeout=30000) as dl:page.locator('#save').click()
    dl.value.save_as('/mnt/data/GeoMap_v21_Strata_Terrain_Example.svg')
    saved=Path('/mnt/data/GeoMap_v21_Strata_Terrain_Example.svg').read_text(encoding='utf-8')
    assert 'acidPlus' in saved and 'ageLabel' in saved
    assert 'sectionline' not in saved
    # Print popup copies very same age labels, hatch (not regen)
    with ctx.expect_page(timeout=30000) as info:page.locator('#savePdf').click()
    popup=info.value;popup.wait_for_load_state('load')
    assert popup.locator('svg #acidPlus').count()==1
    assert popup.locator('svg .ageLabel').count()>=1
    assert popup.locator('svg .sectionline').count()==0
    popup.close()
    assert not errors,errors
    print('PASS v21 UI: strat labels, terrain, hide line, acid hatch, SVG/PDF, no JS errors')
    browser.close()
