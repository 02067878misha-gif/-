"""Regression checks for v16 fold UI, generated map, section and export."""
import shutil
from pathlib import Path
from urllib.parse import urlparse
from playwright.sync_api import sync_playwright

root=Path(__file__).resolve().parent.parent
with sync_playwright() as p:
    browser=p.chromium.launch(headless=True,executable_path=shutil.which('chromium') or shutil.which('chromium-browser') or None,args=['--no-sandbox'])
    context=browser.new_context(viewport={'width':1550,'height':1000},accept_downloads=True)
    page=context.new_page()
    errors=[];page.on('pageerror', lambda e:errors.append(str(e)))
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
    page.locator('[data-field="enableFaults"]').uncheck()
    page.locator('details.map-subsection').first.locator('summary').click()
    page.locator('#showColors').check()
    page.wait_for_timeout(200)
    initial=page.evaluate('''async()=>{let {state}=await import('./js/core.js');return {geo:state.geoPath,units:[...state.units],sec:document.querySelector('#sectionSvg').innerHTML}}''')
    assert page.locator('[data-field="structureType"]').input_value()=='monocline'
    assert page.locator('.fold-settings').count()==0
    assert page.locator('[data-field="customDip"]').count()==1
    page.locator('[data-field="structureType"]').select_option('folding')
    page.wait_for_function("document.querySelector('.fold-settings')!==null && document.querySelector('#modelInfo').textContent.includes('складчатость')",timeout=90000)
    assert page.locator('[data-field="customDip"]').count()==0
    page.locator('[data-field="customAzimuth"]').count()==0
    for field,value in [('foldAmplitude','30'),('foldWidth','45'),('foldStrike','0')]:
        field_box=page.locator('[data-field="'+field+'"]')
        field_box.fill(value)
        field_box.press('Tab')
        page.wait_for_function("document.querySelector('#status').textContent.includes('слоёв')",timeout=90000)
    page.wait_for_timeout(600)
    result=page.evaluate('''async()=>{let {state}=await import('./js/core.js');return {complex:state.model.complexes.map(c=>({type:c.structureType,A:c.foldAmplitude,w:c.foldWidth,strike:c.foldStrike})),geo:state.geoPath,units:[...state.units],sec:document.querySelector('#sectionSvg').innerHTML}}''')
    assert result['complex']==[{'type':'folding','A':30,'w':45,'strike':0}],result['complex']
    assert result['geo']!=initial['geo'],'folded map should differ from monocline'
    assert result['units']!=initial['units'],'folded stratigraphy must differ on the grid'
    assert result['sec']!=initial['sec'],'section must change with fold type'
    assert page.locator('#modelInfo').text_content().find('амплитуда 30 м')>=0
    page.screenshot(path='/mnt/data/GeoMap_v16_Folding_preview.png',full_page=True)
    with page.expect_download(timeout=30000) as di:
        page.locator('#save').click()
    svg_path=Path('/mnt/data/GeoMap_v16_Folding_example.svg')
    di.value.save_as(svg_path)
    svg_txt=svg_path.read_text(encoding='utf-8')
    assert '<svg' in svg_txt and '#b' in svg_txt and 'path' in svg_txt
    # Model with independent fold and monocline complexes and custom faults.
    page.locator('#addComplex').click()
    page.wait_for_function("document.querySelectorAll('.complex-card').length===2",timeout=90000)
    page.locator('.complex-card').nth(1).locator('[data-field="structureType"]').select_option('monocline')
    page.wait_for_function("document.querySelector('#modelInfo').textContent.includes('Комплекс 2:')",timeout=90000)
    mixed=page.evaluate('''async()=>{let {state}=await import('./js/core.js');return state.model.complexes.map(c=>c.structureType)}''')
    assert mixed==['folding','monocline'],mixed
    page.locator('.complex-card').nth(1).locator('[data-field="structureType"]').select_option('folding')
    page.locator('.complex-card').nth(1).locator('[data-field="foldAmplitude"]').fill('12')
    page.locator('.complex-card').nth(1).locator('[data-field="foldAmplitude"]').press('Tab')
    page.wait_for_function("document.querySelector('#modelInfo').textContent.includes('Комплекс 2: 5 слоёв, складчатость (амплитуда 12 м')",timeout=90000)
    pair=page.evaluate('''async()=>{let {state}=await import('./js/core.js');return state.model.complexes.map(c=>[c.foldAmplitude,c.structureType])}''')
    assert pair==[[30,'folding'],[12,'folding']],pair
    page.locator('.complex-card').nth(0).locator('[data-field="structureType"]').select_option('monocline')
    page.wait_for_function("document.querySelector('#modelInfo').textContent.includes('Комплекс 1:')",timeout=90000)
    page.locator('.complex-card').nth(0).locator('[data-field="structureType"]').select_option('folding')
    assert page.locator('.complex-card').nth(0).locator('[data-field="foldAmplitude"]').input_value()=='30'
    # Exported PDF uses same on-screen SVG, without line handles.
    context.add_init_script('window.print=function(){window.__printed=true}')
    with context.expect_page() as popup_info:
        page.locator('#savePdf').click()
    popup=popup_info.value
    popup.wait_for_load_state('load',timeout=30000)
    assert popup.locator('svg').count()==1
    assert popup.locator('.sectionline,.handle,.sectionEnd').count()==0
    popup.close()
    assert not errors,errors
    print('PASS browser fold controls, geo map, section, two complexes, SVG/PDF and no JS errors')
    browser.close()
