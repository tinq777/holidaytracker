import asyncio, json
from playwright.async_api import async_playwright
URL='http://localhost:4173/'; S='/tmp/e2e/shots/'
errors=[]
hid=json.load(open('/tmp/e2e/state.json'))['hid']
async def shot(p,n,full=True): await p.screenshot(path=S+n+'.png', full_page=full)
JS="""() => new Promise(res=>{const r=indexedDB.open('holiday-tracker');r.onsuccess=()=>{const db=r.result;const names=['holidays','expenses','accommodations','statementTxns','lessons','checklist'];const out={};let n=names.length;const tx=db.transaction(names);names.forEach(s=>{const q=tx.objectStore(s).getAll();q.onsuccess=()=>{out[s]=q.result;if(--n==0){db.close();res(out)}}})}})"""
def ok(c,msg): print(('PASS ' if c else 'FAIL ')+msg)
async def main():
    async with async_playwright() as pw:
        mk=lambda: pw.chromium.launch_persistent_context('/tmp/e2e/profile',viewport={'width':390,'height':844},device_scale_factor=2,is_mobile=True,has_touch=True,locale='en-AU',timezone_id='Australia/Sydney',accept_downloads=True)
        ctx=await mk(); p=ctx.pages[0] if ctx.pages else await ctx.new_page()
        p.on('pageerror',lambda e: errors.append(str(e)))
        p.on('dialog', lambda d: asyncio.ensure_future(d.accept()))
        await p.goto(URL+f'#/trip/{hid}'); await p.wait_for_timeout(1200)
        c=await p.evaluate(JS); ex=[e for e in c['expenses'] if e['holidayId']==hid]
        ok(len(ex)==7, f'close/reopen persistence: {len(ex)} expenses kept')
        await p.reload(); await p.wait_for_timeout(1000)
        ok('China 2027' in await p.content(), 'refresh persistence: trip still shown')
        # reconcile
        await p.goto(URL+f'#/trip/{hid}/reconcile'); await p.wait_for_timeout(700)
        await p.get_by_role('button',name='Add to Restaurant').click(); await p.wait_for_timeout(400)
        await p.get_by_role('button',name='Add',exact=True).click(); await p.wait_for_timeout(500)
        await shot(p,'20-reconcile-done')
        c=await p.evaluate(JS); ex=[e for e in c['expenses'] if e['holidayId']==hid]
        r=[e for e in ex if e['merchant']=='Restaurant'][0]
        ok(len(ex)==8, f'reconcile: {len(ex)} expenses (7 + Taobao only, no duplicates)')
        ok(r.get('actualHome')==27.9 and r.get('fee')==0.84, f"restaurant actual {r.get('actualHome')} fee {r.get('fee')}")
        # review + lessons
        await p.goto(URL+f'#/trip/{hid}/review'); await p.wait_for_timeout(600)
        for cat,t in [('Hotels','Layover hotels added a lot to the total cost.'),('Money','Check payment-app fees before using a linked credit card.'),('Kids','Allow extra downtime for the kids.')]:
            await p.get_by_role('button',name=cat,exact=True).click()
            await p.get_by_placeholder('e.g. Layover hotels').fill(t)
            await p.get_by_role('button',name='Add lesson').click(); await p.wait_for_timeout(300)
        await shot(p,'21-review')
        # new holiday shows reminders
        await p.goto(URL+'#/new'); await p.wait_for_timeout(700)
        html=await p.content()
        ok('Lessons from previous trips' in html and 'Layover hotels added' in html, 'lessons appear as reminders on New holiday')
        await shot(p,'22-new-holiday-lessons')
        # home
        await p.goto(URL); await p.wait_for_timeout(600); await shot(p,'23-home')
        # backup export
        await p.goto(URL+'#/more/backup'); await p.wait_for_timeout(500)
        async with p.expect_download() as d: await p.get_by_role('button',name='Export backup').click()
        dl=await d.value; await dl.save_as('/tmp/e2e/backup.json')
        bk=json.load(open('/tmp/e2e/backup.json'))
        ok(len(bk['data']['expenses'])==8, f"backup has {len(bk['data']['expenses'])} expenses; settings excluded: {'settings' not in bk['data']}")
        # offline
        await ctx.set_offline(True)
        await p.reload(); await p.wait_for_timeout(1500)
        sw=await p.evaluate('!!navigator.serviceWorker.controller')
        await p.goto(URL+f'#/trip/{hid}'); await p.wait_for_timeout(600); await p.reload(); await p.wait_for_timeout(1200)
        ok(sw and 'China 2027' in await p.content(), f'offline reload works (service worker controlling: {sw})')
        await p.locator('button:has-text("Capture")').first.click(); await p.wait_for_timeout(300)
        await p.get_by_text('Type it').click(); await p.wait_for_timeout(300)
        await p.locator('.sheet').get_by_label('Amount').fill('35'); await p.locator('.sheet').get_by_placeholder('Restaurant').fill('Offline lunch')
        await p.locator('.sheet button.btn.primary').click(); await p.wait_for_timeout(500)
        await shot(p,'24-offline',False)
        c=await p.evaluate(JS); ok(any(e['merchant']=='Offline lunch' for e in c['expenses']), 'manual expense added offline')
        # packing offline
        await p.goto(URL+f'#/trip/{hid}/plan'); await p.wait_for_timeout(400)
        await ctx.set_offline(False)
        # restore: replace with backup -> offline lunch gone, 8 expenses
        await p.goto(URL+'#/more/backup'); await p.wait_for_timeout(500)
        await p.set_input_files('input[type=file]','/tmp/e2e/backup.json'); await p.wait_for_timeout(500)
        await shot(p,'25-restore-sheet',False)
        txt=await p.locator('.sheet').inner_text(); ok('add/replace' in txt.lower() or 'replace' in txt.lower(), 'restore warning shown: '+txt.split('\n')[1][:80])
        rb=await p.locator('.sheet button').all_inner_texts(); print('restore buttons',rb)
        await p.locator('.sheet button',has_text='Replace').first.click(); await p.wait_for_timeout(500)
        if await p.locator('.sheet button',has_text='Replace').count(): await p.locator('.sheet button',has_text='Replace').last.click(); await p.wait_for_timeout(800)
        c=await p.evaluate(JS); ex=[e for e in c['expenses'] if e['holidayId']==hid]
        ok(len(ex)==8 and not any(e['merchant']=='Offline lunch' for e in ex), f'replace restore -> {len(ex)} expenses')
        await p.goto(URL+'#/more/backup'); await p.wait_for_timeout(500)
        await p.set_input_files('input[type=file]','/tmp/e2e/backup.json'); await p.wait_for_timeout(500)
        await p.get_by_role('button',name='Add to this device').click(); await p.wait_for_timeout(800)
        c=await p.evaluate(JS); ok(len([e for e in c['expenses'] if e['holidayId']==hid])==8, 'merge restore does not duplicate')
        # sample data + compare
        await p.goto(URL+'#/more/data'); await p.wait_for_timeout(400)
        await p.get_by_role('button',name='Add sample trips').click(); await p.wait_for_timeout(1200)
        await p.goto(URL); await p.wait_for_timeout(800); await shot(p,'26-home-samples')
        await p.goto(URL+'#/compare'); await p.wait_for_timeout(800); await shot(p,'27-compare')
        await ctx.close()
        print('ERRORS',errors)
asyncio.run(main())
