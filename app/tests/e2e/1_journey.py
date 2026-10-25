import asyncio, json, sys
from playwright.async_api import async_playwright
URL='http://localhost:4173/'
S='/tmp/e2e/shots/'
errors=[]
async def shot(p,n): await p.screenshot(path=S+n+'.png', full_page=True)
async def counts(p):
    return await p.evaluate("""() => new Promise(res=>{const r=indexedDB.open('holiday-tracker');r.onsuccess=()=>{const db=r.result;const names=['holidays','expenses','accommodations','statementTxns','lessons','checklist'];const out={};let n=names.length;const tx=db.transaction(names);names.forEach(s=>{const q=tx.objectStore(s).getAll();q.onsuccess=()=>{out[s]=q.result;if(--n==0){db.close();res(out)}}})}})""")
async def main():
    async with async_playwright() as pw:
        import shutil; shutil.rmtree('/tmp/e2e/profile',ignore_errors=True)
        ctx=await pw.chromium.launch_persistent_context('/tmp/e2e/profile',viewport={'width':390,'height':844},device_scale_factor=2,is_mobile=True,has_touch=True,locale='en-AU',timezone_id='Australia/Sydney')
        p=ctx.pages[0] if ctx.pages else await ctx.new_page()
        p.on('pageerror',lambda e: errors.append(str(e)))
        p.on('console',lambda m: m.type=='error' and errors.append(m.text))
        p.on('dialog', lambda d: asyncio.ensure_future(d.accept('0.213')))
        await p.goto(URL); await p.wait_for_timeout(1500); await shot(p,'01-home-empty')
        # AI -> demo
        await p.goto(URL+'#/more/ai'); await p.wait_for_timeout(500)
        await p.get_by_text('Demo',exact=True).click(); await p.wait_for_timeout(300)
        # create holiday
        await p.goto(URL+'#/'); await p.wait_for_timeout(500)
        await p.get_by_text('New Holiday').first.click(); await p.wait_for_timeout(400)
        await p.get_by_placeholder('China 2027').fill('China 2027')
        await p.get_by_placeholder('Shanghai').fill('Shanghai'); await p.get_by_role('button',name='Add',exact=True).click()
        await p.get_by_placeholder('Shanghai').fill('Beijing')
        dates=p.locator('input[type=date]'); await dates.nth(0).fill('2027-04-01'); await dates.nth(1).fill('2027-04-14')
        await p.get_by_placeholder('8000').fill('8000')
        await p.get_by_label('Add currency').select_option('CNY')
        await p.locator('.stepper').nth(1).locator('button').last.click(); await p.locator('.stepper').nth(1).locator('button').last.click()
        await shot(p,'02-new-holiday')
        await p.get_by_role('button',name='Create holiday').click(); await p.wait_for_timeout(800)
        await shot(p,'03-trip-overview')
        hid=p.url.split('/trip/')[1].split('/')[0]
        # set manual rate (network blocked in sandbox)
        await p.goto(URL+'#/more/rates'); await p.wait_for_timeout(500)
        await p.get_by_role('button',name='Set').first.click(); await p.wait_for_timeout(500)
        await shot(p,'04-rates')
        # Plan: stays + flight
        await p.goto(URL+f'#/trip/{hid}/plan'); await p.wait_for_timeout(500)
        async def stay(name,city,ci,co,total,layover=False):
            await p.get_by_role('button',name='+ Add stay').click(); await p.wait_for_timeout(300)
            sh=p.locator('.sheet')
            await sh.get_by_placeholder('Pullman Guangzhou Airport').fill(name)
            await sh.locator('input').nth(1).fill(city)
            d=sh.locator('input[type=date]'); await d.nth(0).fill(ci); await d.nth(1).fill(co)
            await sh.locator('input.num').first.fill(total)
            if layover: await sh.locator('input[type=checkbox]').check()
            await sh.get_by_role('button',name='Save stay').click(); await p.wait_for_timeout(400)
        await stay('Pullman Guangzhou Airport','Guangzhou','2027-04-01','2027-04-02','850',True)
        await stay('Hilton Shanghai','Shanghai','2027-04-02','2027-04-08','6600')
        await stay('Beijing Hotel','Beijing','2027-04-08','2027-04-14','5400')
        await p.get_by_role('button',name='+ Add flight').click(); await p.wait_for_timeout(400)
        await shot(p,'05-flight-editor')
        sh=p.locator('.sheet'); await sh.get_by_label('Amount').fill('2480')
        await sh.get_by_placeholder('Restaurant').fill('China Southern SYD-CAN')
        await shot(p,'05b-flight-filled')
        btns=await sh.locator('button').all_inner_texts(); print('flight sheet buttons',btns)
        await sh.locator('button.primary').first.click(); await p.wait_for_timeout(500)
        await shot(p,'06-plan-bookings')
        # packing
        await p.get_by_role('button',name='Packing').click(); await p.wait_for_timeout(300); await shot(p,'07-packing')
        await p.locator('.check').first.click(); await p.wait_for_timeout(200)
        # capture Alipay
        async def capture(f):
            await p.goto(URL+f'#/trip/{hid}'); await p.wait_for_timeout(400)
            await p.locator('.capture-fab, button:has-text("Capture")').first.click(); await p.wait_for_timeout(300)
            await p.set_input_files('input[aria-label="Choose screenshots"]', f); await p.wait_for_timeout(1500)
        await capture('tests/e2e/alipay.png'); await shot(p,'08-capture-alipay-confirm')
        await p.locator('.sheet button.btn.primary').click(); await p.wait_for_timeout(600)
        await shot(p,'09-overview-after-alipay')
        await capture('tests/e2e/didi.png'); await shot(p,'10-didi-confirm')
        await p.locator('.sheet button.btn.primary').click(); await p.wait_for_timeout(600)
        # voice entry
        await p.locator('.capture-fab, button:has-text("Capture")').first.click(); await p.wait_for_timeout(300)
        await p.get_by_text('Say it').click(); await p.locator('textarea').fill('299 yuan Pokémon shopping'); await p.get_by_role('button',name='Add expense').click(); await p.wait_for_timeout(600)
        await shot(p,'11-voice-confirm'); await p.locator('.sheet button.btn.primary').click(); await p.wait_for_timeout(500)
        c=await counts(p); ex=[e for e in c['expenses'] if e['holidayId']==hid]
        print('expenses before import', [(e['merchant'],e['amount'],e['currency'],e.get('estHome'),e['status'],e['category']) for e in ex])
        # import CSV
        await p.goto(URL+f'#/trip/{hid}/import'); await p.wait_for_timeout(500)
        await p.set_input_files('input[type=file]','tests/e2e/sample-card.csv'); await p.wait_for_timeout(800)
        await shot(p,'12-import-mapping')
        if await p.get_by_role('button',name='Continue').count(): await p.get_by_role('button',name='Continue').click(); await p.wait_for_timeout(600)
        await shot(p,'13-import-preview')
        await p.get_by_role('button',name='Import 4 transactions').click(); await p.wait_for_timeout(800)
        await shot(p,'14-after-import')
        await p.goto(URL+f'#/trip/{hid}/reconcile'); await p.wait_for_timeout(600); await shot(p,'15-reconcile')
        c=await counts(p); ex=[e for e in c['expenses'] if e['holidayId']==hid]; tx=[t for t in c['statementTxns'] if t['holidayId']==hid]
        print('after import: expenses',len(ex),'txns',[(t['description'],t['amount'],t['status'],t.get('expenseId') is not None) for t in tx])
        json.dump({'hid':hid},open('/tmp/e2e/state.json','w'))
        # reimport same CSV -> should add nothing
        await p.goto(URL+f'#/trip/{hid}/import'); await p.wait_for_timeout(500)
        await p.set_input_files('input[type=file]','tests/e2e/sample-card.csv'); await p.wait_for_timeout(800)
        if await p.get_by_role('button',name='Continue').count(): await p.get_by_role('button',name='Continue').click(); await p.wait_for_timeout(600)
        await shot(p,'16-reimport-preview')
        print('ERRORS',errors)
        await ctx.close()
asyncio.run(main())
