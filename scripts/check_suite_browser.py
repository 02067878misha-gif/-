#!/usr/bin/env python3
"""Check the running GeoMap/Wulff application through its actual shared server."""
import argparse
import json
from pathlib import Path
import shutil
from urllib.parse import urljoin, urlparse

from playwright.sync_api import sync_playwright

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('url')
parser.add_argument('--out', type=Path, default=Path('dist/suite-verification'))
parser.add_argument('--close', action='store_true', help='Also check the common close button and stop the test server')
args = parser.parse_args()
args.out.mkdir(parents=True, exist_ok=True)

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True, executable_path=shutil.which('chromium') or shutil.which('chromium-browser'), args=['--no-sandbox'])
    context = browser.new_context(viewport={'width': 1440, 'height': 1000}, accept_downloads=True)
    page = context.new_page()
    errors, external = [], []
    page.on('pageerror', lambda error: errors.append(str(error)))
    page.on('request', lambda request: external.append(request.url) if urlparse(request.url).scheme in ['http', 'https'] and urlparse(request.url).netloc != urlparse(args.url).netloc else None)
    page.goto(args.url)
    page.wait_for_function("async () => (await import('./js/core.js')).state.ready", timeout=90000)
    assert page.locator('#tab-map').get_attribute('aria-selected') == 'true'
    page.locator('#seed').fill('777')
    page.locator('#generate').click()
    page.wait_for_function("async () => {const {state}=await import('./js/core.js');return state.ready && state.seed===777;}", timeout=90000)
    page.locator('details.map-subsection').first.evaluate('el => el.open=true')
    page.locator('#showColors').check()
    page.locator('#labelAges').click()
    assert page.locator('#mapSvg .ageLabel').count() > 0
    snapshot = "async () => {const {state}=await import('./js/core.js');return JSON.stringify({seed:state.seed,complexes:state.complexConfig,terrain:state.terrainConfig,styles:state.model.unitStyles,labels:state.ageLabels});}"
    map_state = page.evaluate(snapshot)
    page.screenshot(path=str(args.out/'geomap-tab.png'))
    page.locator('#tab-wulff').click()
    frame = page.frame_locator('#wulff-frame')
    frame.locator('#generate').wait_for()
    assert len(context.pages) == 1, 'Opening the Wulff tab opened another browser window'
    assert frame.locator('body').get_attribute('class') == 'is-embedded'
    assert frame.locator('#quit').is_hidden()
    assert page.locator('#suite-exit').is_visible()
    page.screenshot(path=str(args.out/'wulff-settings.png'))
    frame.locator('#title').fill('Общий комплект')
    frame.locator('#count').fill('2')
    frame.locator('#colors-enabled').check()
    frame.locator('#color-name-P').fill('красным')
    assert frame.locator('#color-P').input_value() == '#c23632'
    frame.locator('#seed-options').evaluate('el => el.open=true')
    frame.locator('#seed').fill('SUITE-2026')
    with page.expect_response('**/wulff/generate') as generation:
        frame.locator('#generate').click()
    assert generation.value.status == 200, generation.value.text()
    frame.locator('#result').wait_for(state='visible')
    generated = generation.value.json()
    assert generated['pages'] == 4
    href = frame.locator('#json').get_attribute('href')
    child_url = page.locator('#wulff-frame').evaluate('el => el.src')
    response = page.request.get(urljoin(child_url, href))
    assert response.ok
    settings = response.json()
    assert settings['config']['element_colors']['P'] == {'hex': '#c23632', 'name': 'красным'}
    for key, filename in [('students', 'students.pdf'), ('teacher', 'teacher.pdf'), ('guide', 'student_guide.pdf'), ('zip', 'wulff-set.zip'), ('json', 'settings.json')]:
        response = page.request.get(urljoin(child_url, frame.locator('#'+key).get_attribute('href')))
        assert response.ok, filename
        (args.out/filename).write_bytes(response.body())
    page.screenshot(path=str(args.out/'wulff-tab.png'))
    page.locator('#tab-map').click()
    assert page.evaluate(snapshot) == map_state, 'Switching tabs changed the map model or labels'
    with page.expect_download() as download:
        page.locator('#save').click()
    download.value.save_as(str(args.out/'map.svg'))
    svg = (args.out/'map.svg').read_text()
    assert 'ageLabel' in svg and 'sectionline' not in svg
    with context.expect_page() as opened:
        page.locator('#savePdf').click()
    print_page = opened.value
    print_page.wait_for_selector('svg')
    assert print_page.locator('svg .ageLabel').count() > 0
    print_page.pdf(path=str(args.out/'map.pdf'), prefer_css_page_size=True, print_background=True)
    print_page.close()
    page.locator('#tab-wulff').click()
    assert frame.locator('#result-seed').inner_text() == 'SUITE-2026'
    assert frame.locator('#count').input_value() == '2'
    assert frame.locator('#color-name-P').input_value() == 'красным'
    assert frame.locator('#json').get_attribute('href') == href, 'The ready set was discarded when returning to the tab'
    assert page.request.get(urljoin(child_url, href)).ok
    page.locator('#tab-wulff').focus()
    page.keyboard.press('Home')
    assert page.locator('#tab-map').get_attribute('aria-selected') == 'true'
    page.keyboard.press('End')
    assert page.locator('#tab-wulff').get_attribute('aria-selected') == 'true'
    page.set_viewport_size({'width': 390, 'height': 844})
    assert page.evaluate('document.documentElement.scrollWidth <= innerWidth')
    assert frame.locator('html').evaluate('el => el.scrollWidth <= el.clientWidth')
    frame.locator('body').evaluate('() => window.scrollTo(0, 0)')
    page.screenshot(path=str(args.out/'mobile-wulff.png'))
    page.locator('#tab-map').click()
    assert page.evaluate(snapshot) == map_state
    assert page.evaluate('document.documentElement.scrollWidth <= innerWidth')
    page.screenshot(path=str(args.out/'mobile-map.png'))
    page.goto(args.url+'#wulff')
    page.frame_locator('#wulff-frame').locator('#generate').wait_for()
    assert page.locator('#tab-wulff').get_attribute('aria-selected') == 'true'
    if args.close:
        page.locator('#suite-exit').click()
        page.wait_for_selector('.suite-closed')
        assert 'Программа закрыта' in page.locator('.suite-closed').inner_text()
    assert not errors, errors
    assert not external, external
    print('PASS: GeoMap and Wulff tabs, map state, colors, four-page PDF sets, map SVG/PDF export, ready downloads, keyboard navigation, mobile layout, direct tab link and offline resources')
    browser.close()
