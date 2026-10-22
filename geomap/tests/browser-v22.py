"""Regression of v22 age divisions, legend, collapsible map/terrain/complex sub-panels, and exports."""
import shutil
from pathlib import Path
from urllib.parse import urlparse
from playwright.sync_api import sync_playwright
root=Path(__file__).resolve().parent.parent
with sync_playwright() as p:
 browser=p.chromium.launch(headless=True,executable_path=shutil.which('chromium') or shutil.which('chromium-browser') or None,args=['--no-sandbox'])
 context=browser.new_context(viewport={'width':1650,'height':940},accept_downloads=True)
 page=context.new_page();errors=[]
 page.on('pageerror',lambda e:errors.append(str(e)))
 def route(req):
  file=(root/urlparse(req.request.url).path.lstrip('/')).resolve()
  if file.is_file() and file.is_relative_to(root):
   kind={'.html':'text/html','.css':'text/css','.js':'text/javascript'}.get(file.suffix,'application/octet-stream')
   req.fulfill(status=200,body=file.read_bytes(),content_type=kind)
  else:req.fulfill(status=404,body='not found')
 page.route('**/*',route)
 html=(root/'index.html').read_text(encoding='utf-8').replace('<link rel="stylesheet" href="styles.css">','<base href="http://geomap.example/"><link rel="stylesheet" href="styles.css">')
 page.set_content(html)
 page.wait_for_function("document.querySelector('#status').textContent.includes('слоёв')",timeout=90000)
 assert page.locator('#ageLegend .age-legend-row').count()>0
 assert page.locator('#layersInfo').inner_html().find('Отдел / подразделение')>=0
 assert page.locator('.settings-card').count()==2
 assert page.locator('.complex-card .complex-subsection').count()==3
 # Collapse both upper cards, without losing controls; reopen them.
 for name in ['#mapSettingsCard','#terrainSettingsCard']:
  panel=page.locator(name)
  assert panel.evaluate('(x)=>x.open')
  panel.locator(':scope > summary').click()
  assert not panel.evaluate('(x)=>x.open')
  panel.locator(':scope > summary').click()
  assert panel.evaluate('(x)=>x.open')
 # independently collapse subsections; rerender UI through toggling structure type
 card=page.locator('.complex-card').first
 card.locator('.complex-subsection[data-section="faults"] > summary').click()
 card.locator('.complex-subsection[data-section="intrusions"] > summary').click()
 assert not card.locator('.complex-subsection[data-section="faults"]').evaluate('(x)=>x.open')
 assert not card.locator('.complex-subsection[data-section="intrusions"]').evaluate('(x)=>x.open')
 card.locator('[data-field="structureType"]').select_option('folding')
 page.wait_for_function("document.querySelector('#status').textContent.includes('SEED')",timeout=90000)
 card=page.locator('.complex-card').first
 assert not card.locator('.complex-subsection[data-section="faults"]').evaluate('(x)=>x.open')
 assert not card.locator('.complex-subsection[data-section="intrusions"]').evaluate('(x)=>x.open')
 assert card.locator('.complex-subsection[data-section="layers"]').evaluate('(x)=>x.open')
 # restore old fold type for smoke test and check new age legend
 card.locator('[data-field="structureType"]').select_option('monocline')
 page.locator('details.map-subsection').first.locator('summary').click()
 page.locator('#labelAges').click()
 assert page.locator('#mapSvg text.ageLabel').count()>0
 legends=page.locator('#ageLegend .age-legend-row').count()
 distinct=page.evaluate("""async()=>{const {state}=await import('./js/core.js');return new Set(state.model.unitStyles.slice(1,state.model.totalUnits+1).map(x=>x.symbol)).size}""")
 assert distinct==legends,(distinct,legends)
 assert not errors, errors
 page.screenshot(path='/mnt/data/GeoMap_v22_Chronostratigraphy_UI.png',full_page=True)
 # Collapsed clean screenshot
 for name in ['#mapSettingsCard','#terrainSettingsCard']:
  page.locator(name+' > summary').click()
 card.locator('.complex-subsection[data-section="layers"] > summary').click()
 page.screenshot(path='/mnt/data/GeoMap_v22_Collapsed_Settings.png',full_page=True)
 # Reopen map card to get to exports and ensure currently rendered age labels persist in export.
 page.locator('#mapSettingsCard > summary').click()
 with page.expect_download(timeout=30000) as d:page.locator('#save').click()
 d.value.save_as('/mnt/data/GeoMap_v22_Chronostratigraphy_example.svg')
 svg=Path('/mnt/data/GeoMap_v22_Chronostratigraphy_example.svg').read_text(encoding='utf-8')
 assert 'ageLabel' in svg and 'sectionline' not in svg
 with context.expect_page() as popup:page.locator('#savePdf').click()
 print_page=popup.value;print_page.wait_for_load_state('load')
 assert print_page.locator('svg .ageLabel').count()>0
 print_page.close()
 assert not errors,errors
 print('PASS v22: legend, all collapsible cards, persistence, ages, SVG/PDF, no JS errors')
 browser.close()
