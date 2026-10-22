"""v17 inheritance toggle: UI, deterministic geology, map/section, SVG and PDF."""
import shutil
from pathlib import Path
from urllib.parse import urlparse
from playwright.sync_api import sync_playwright
from PIL import Image, ImageDraw, ImageFont
root=Path(__file__).resolve().parent.parent
out=Path('/mnt/data')
with sync_playwright() as p:
    browser=p.chromium.launch(headless=True,executable_path=shutil.which('chromium') or shutil.which('chromium-browser') or None,args=['--no-sandbox'])
    context=browser.new_context(viewport={'width':1500,'height':1000},accept_downloads=True)
    page=context.new_page();errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
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
    assert page.locator('[data-field="foldAffectsOlder"]').count()==0
    # Monocline for the oldest, young folding. No faults for easier comparison.
    page.locator('.complex-card').nth(0).locator('[data-field="enableFaults"]').uncheck()
    page.locator('.complex-card').nth(0).locator('[data-field="customDip"]').check()
    dip=page.locator('.complex-card').nth(0).locator('[data-field="dip"]');dip.fill('0');dip.press('Tab')
    page.locator('#addComplex').click()
    page.wait_for_function("document.querySelectorAll('.complex-card').length===2",timeout=90000)
    card=page.locator('.complex-card').nth(1)
    card.locator('[data-field="structureType"]').select_option('folding')
    page.wait_for_function("document.querySelectorAll('[data-field=foldAffectsOlder]').length===1",timeout=90000)
    for field,value in [('foldAmplitude','45'),('foldWidth','55'),('foldStrike','0')]:
        inp=card.locator(f'[data-field="{field}"]')
        inp.fill(value);inp.press('Tab')
        page.wait_for_function("document.querySelector('#status').textContent.includes('слоёв')",timeout=90000)
    page.locator('details.map-subsection').first.locator('summary').click()
    page.locator('#showColors').check()
    page.wait_for_timeout(350)
    off=page.evaluate('''async()=>{const {state}=await import('./js/core.js');return {geom:state.geoPath,units:Array.from(state.units),sec:document.querySelector('#sectionSvg').innerHTML,values:state.model.complexes.map(c=>c.foldAffectsOlder),heights:Array.from(state.heights)}}''')
    assert off['values']==[False,False],off['values']
    page.locator('#mapSvg').screenshot(path=str(out/'GeoMap_v17_before_map.png'))
    page.locator('#sectionSvg').screenshot(path=str(out/'GeoMap_v17_before_section.png'))
    # Update only the inheritance toggle; the same young fold remains in place.
    card.locator('[data-field="foldAffectsOlder"]').check()
    page.wait_for_function("document.querySelector('#modelInfo').textContent.includes('воздействие на древние: да')",timeout=90000)
    page.wait_for_timeout(400)
    on=page.evaluate('''async()=>{const {state}=await import('./js/core.js');return {geom:state.geoPath,units:Array.from(state.units),sec:document.querySelector('#sectionSvg').innerHTML,values:state.model.complexes.map(c=>c.foldAffectsOlder),heights:Array.from(state.heights)}}''')
    assert on['values']==[False,True],on['values']
    assert on['geom']!=off['geom'], 'Geological map boundaries should change'
    assert on['units']!=off['units'], 'The geologic surface grid should change'
    assert on['sec']!=off['sec'], 'Geological section should change'
    assert on['heights']==off['heights'], 'Topography should be unchanged'
    page.locator('#mapSvg').screenshot(path=str(out/'GeoMap_v17_after_map.png'))
    page.locator('#sectionSvg').screenshot(path=str(out/'GeoMap_v17_after_section.png'))
    page.screenshot(path=str(out/'GeoMap_v17_inheritance_preview.png'),full_page=True)
    # Export paths equal on-screen SVG; no interactive handles.
    with page.expect_download(timeout=30000) as dl:page.locator('#save').click()
    dl.value.save_as(str(out/'GeoMap_v17_inheritance_example.svg'))
    assert (out/'GeoMap_v17_inheritance_example.svg').read_text().count('<path')>5
    context.add_init_script('window.print=function(){window.__printed=true}')
    with context.expect_page() as popup_info:page.locator('#savePdf').click()
    popup=popup_info.value;popup.wait_for_load_state('load',timeout=30000)
    assert popup.locator('svg').count()==1
    assert popup.locator('.sectionline,.handle,.sectionEnd').count()==0
    popup.close()
    # Toggling off must recover exactly the previous map and section.
    card.locator('[data-field="foldAffectsOlder"]').uncheck()
    page.wait_for_function("document.querySelector('#modelInfo').textContent.includes('воздействие на древние: нет')",timeout=90000)
    page.wait_for_timeout(350)
    back=page.evaluate('''async()=>{const {state}=await import('./js/core.js');return {geom:state.geoPath,units:Array.from(state.units),sec:document.querySelector('#sectionSvg').innerHTML}}''')
    assert back['geom']==off['geom']
    assert back['units']==off['units']
    assert back['sec']==off['sec']
    assert not errors,errors
    browser.close()

# Compact visual comparison for the user.
images=[]
for stem in ['before_map','after_map','before_section','after_section']:
    im=Image.open(out/f'GeoMap_v17_{stem}.png').convert('RGB')
    images.append(im)
width=max(images[0].width,images[1].width)
height=max(images[0].height,images[1].height)
sec_height=max(images[2].height,images[3].height)
margin=24;title=54;column_width=width+margin*2
canvas=Image.new('RGB',(column_width*2, title+height+sec_height+margin*3),'#eef2f7')
draw=ImageDraw.Draw(canvas)
try:font=ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf',22)
except OSError:font=ImageFont.load_default()
for i,caption in enumerate(['Выключено: усечение','Включено: наследование складчатости']):
    x=i*column_width+margin
    draw.text((x,title//3),caption,font=font,fill='#20364e')
    canvas.paste(images[i],(x,title+margin))
    canvas.paste(images[i+2],(x,title+height+margin*2))
canvas.save(out/'GeoMap_v17_inheritance_comparison.png')
print('PASS browser toggle / changing map+section / same relief / restoring old result / SVG / PDF / no JS errors')
