# ทดสอบหน้าแบรนด์ส่วนแคมเปญ (brand.html) ด้วยเบราว์เซอร์จริง + ระบบหลังบ้านจำลอง
# python3 tools/apps-script/e2e_campaign.py <โฟลเดอร์เว็บที่แตก zip>
import json, threading, http.server, functools, time, copy, sys
from playwright.sync_api import sync_playwright
SITE=sys.argv[1] if len(sys.argv)>1 else '/home/claude/site'
class Q(http.server.SimpleHTTPRequestHandler):
    def log_message(self,*a): pass
srv=http.server.ThreadingHTTPServer(('127.0.0.1',8771),functools.partial(Q,directory=SITE))
threading.Thread(target=srv.serve_forever,daemon=True).start()
BASE='http://127.0.0.1:8771/brand.html'; KEY='0f5e500e727343108f05cec10cfaf271'
IMG='http://127.0.0.1:8771/pimg/5a5e97a00e.jpg'
DAY=86400000; NOW=int(time.time()*1000)
ORDERS={'ok':True,'brand':'Narris','orders':[],'payouts':[],'upcoming':{'amount':0,'orders':[]},'companies':['Flash'],'claimDays':3}
def daily(n=12, sold=None):
    import datetime
    d0=datetime.date.today()-datetime.timedelta(days=3); out=[]
    for i in range(n):
        dd=(d0+datetime.timedelta(days=i)).isoformat(); p=(sold or {}).get(dd,0); out.append({'date':dd,'pcs':p,'amount':p*757})
    return out
def camp(**kw):
    c={'id':'CP-001','name':'ช้อปได้ไม่ต้องรองาน Sale','description':'เลือกรุ่นที่อยากโปรโมต','phase':'soon','canRegister':True,
       'registerFrom':NOW-DAY,'freeUntil':NOW+5*DAY,'registerUntil':NOW+15*DAY,'start':NOW+6*DAY,'end':NOW+17*DAY,'fixedPct':15,
       'fee':{'first':5,'count':5,'rest':4},'free':True,'registeredAt':0,'entries':{},
       'sales':{'pcs':0,'orders':0,'gross':0,'fee':0,'feeFull':0,'net':0,'free':True,'daily':daily(),'products':[]}}
    c.update(kw); return c
PRODS=[{'name':'Hobo Bag','price':890,'orig':1690,'left':35,'skus':['MRA078','MRA079'],'img':IMG},
       {'name':'Soft Boston','price':300,'orig':990,'left':5,'skus':['MRA123'],'img':''},
       {'name':'Merlin','price':300,'orig':1090,'left':0,'skus':['MRA124'],'img':''}]
st={'camp':camp(),'calls':[],'fail':None,'off':False}
def view(): return {'ok':True,'brand':'Narris','now':NOW,'campaigns':[st['camp']] if st['camp'] else [],'products':PRODS}
def route(r):
    b=json.loads(r.request.post_data or '{}'); a=b.get('action'); st['calls'].append(b)
    if a=='brandOrders': out=ORDERS
    elif a=='brandProducts': out={'ok':True,'brand':'Narris','products':[],'maxAdd':100,'categories':[],'formUrl':''}
    elif a=='brandCampaign': out={'ok':False,'code':'BAD_ACTION','error':'x'} if st['off'] else view()
    elif a=='brandCampaignSave':
        if st['fail']: out={'ok':False,'code':'CAMP_BAD','error':st['fail']}
        else:
            ent={}
            for it in b['items']:
                p=[x for x in PRODS if x['name']==it['product']][0]
                price=round(p['price']*0.85) if it['mode']=='fixed' else it['price']
                ent[it['product'].lower()]={'id':'CE-1','status':'Pending','mode':it['mode'],'price':price,'online':it['online'],'meraPrice':p['price'],'note':'','applied':False}
            st['camp']['entries']=ent; st['camp']['registeredAt']=NOW
            out=dict(view(),saved=len(ent),notified=True)
    else: out={'ok':False,'code':'BAD_ACTION','error':'x'}
    r.fulfill(status=200,content_type='application/json',body=json.dumps(out,ensure_ascii=False))
res=[]
def check(n,c,info=None):
    res.append(bool(c)); print(('PASS' if c else 'FAIL'),n, '' if c or info is None else info)
with sync_playwright() as p:
    br=p.chromium.launch()
    c=br.new_context(viewport={'width':390,'height':844},device_scale_factor=2,is_mobile=True,has_touch=True)
    c.route('https://script.google.com/**',route); c.route('**/data/catalog.json',lambda r:r.fulfill(status=404))
    pg=c.new_page(); pg.on('dialog', lambda d: d.accept())
    errs=[]; pg.on('pageerror', lambda e: errs.append(str(e)))
    pg.goto(BASE+'#k='+KEY); pg.wait_for_selector('.cban')
    check('banner on ship tab', 'ช้อปได้ไม่ต้องรองาน Sale' in pg.inner_text('.cban') and 'ไม่หักค่าบริการ' in pg.inner_text('.cban'))
    pg.click('[data-v=stock]'); pg.wait_for_timeout(300)
    check('banner on stock tab', pg.locator('.cban').count()==1)
    pg.click('.cban'); pg.wait_for_selector('.chero')
    check('hero', 'ช้อปได้ไม่ต้องรองาน Sale' in pg.inner_text('.chero'))
    check('fees 5/4 + example', '5%' in pg.inner_text('.fees') and '4%' in pg.inner_text('.fees') and '15 บาท' in pg.inner_text('.fees') and '12 บาท' in pg.inner_text('.fees'))
    check('vat note', 'VAT' in pg.inner_text('main'))
    check('3 products', pg.locator('.cprod').count()==3)
    check('merlin disabled', pg.locator('.cprod >> nth=2 >> .ctick').is_disabled())
    check('no bar yet', pg.locator('.sbar').count()==0)
    pg.click('.cprod >> nth=0 >> .ctick')
    check('ticked opens body', pg.locator('.cprod >> nth=0 >> .cbody').count()==1)
    check('needs online', 'กรอกราคาออนไลน์' in pg.inner_text('#cr-0'))
    check('bar shows, send disabled', pg.locator('.sbar').count()==1 and pg.locator('.sbar .btn').is_disabled())
    pg.fill('#cx-on-0','700'); check('fixed above online → error', 'ต่ำกว่าราคาออนไลน์' in pg.inner_text('#cr-0'))
    check('typing keeps focus', pg.evaluate("document.activeElement.id")=='cx-on-0')
    pg.fill('#cx-on-0','890'); check('fixed ok 757', '757' in pg.inner_text('#cr-0') and 'ถูกกว่าราคาออนไลน์' in pg.inner_text('#cr-0'), pg.inner_text('#cr-0'))
    check('fee waived text', 'ยกเว้น' in pg.inner_text('#cr-0'))
    pg.click('.cprod >> nth=1 >> .ctick'); pg.click('[data-a=campMode][data-k="soft boston"][data-v=own]')
    pg.fill('#cx-on-1','290'); pg.fill('#cx-pr-1','300')
    check('own ≥ mera → error', 'ต่ำกว่าราคาบนมีร่า' in pg.inner_text('#cr-1'))
    check('bar counts bad', 'ยังไม่ผ่าน 1' in pg.inner_text('.sbar .btn'), pg.inner_text('.sbar'))
    pg.fill('#cx-pr-1','249'); check('own ok', '249' in pg.inner_text('#cr-1'))
    check('need agree', 'ติ๊กยืนยัน' in pg.inner_text('.sbar .btn') and pg.locator('.sbar .btn').is_disabled())
    pg.check('#cagree'); check('agree enables', not pg.locator('.sbar .btn').is_disabled() and 'ส่งให้มีร่าตรวจ 2 รุ่น' in pg.inner_text('.sbar .btn'))
    pg.screenshot(path='/tmp/c1_pick.png', full_page=True)
    # error from server
    st['fail']='Hobo Bag: ราคาบนมีร่าต้องต่ำกว่าราคาออนไลน์ของแบรนด์'
    pg.click('.sbar .btn'); pg.wait_for_selector('.err')
    check('server error shown', 'ราคาบนมีร่าต้องต่ำกว่า' in pg.inner_text('.err'))
    st['fail']=None
    pg.fill('#cx-on-0','990'); pg.click('.sbar .btn'); pg.wait_for_selector('.toast')
    sv=[x for x in st['calls'] if x.get('action')=='brandCampaignSave'][-1]
    check('save payload', sv['campaignId']=='CP-001' and sv['agree'] is True and sv['items']==[{'product':'Hobo Bag','mode':'fixed','price':None,'online':990},{'product':'Soft Boston','mode':'own','price':249,'online':290}], sv)
    refs=[x['clientRef'] for x in st['calls'] if x.get('action')=='brandCampaignSave']
    check('new ref after edit', len(set(refs))==2, refs)
    check('after save pending pills', pg.locator('.pill.wait').count()==2 and pg.locator('.sbar').count()==0)
    pg.screenshot(path='/tmp/c2_sent.png', full_page=True)
    # untick → withdraw
    pg.click('.cprod >> nth=1 >> .ctick')
    check('withdraw pill', 'จะถอนออก' in pg.inner_text('.cprod >> nth=1') and 'ถอนออก 1' in pg.inner_text('.sbar'))
    pg.click('[data-a=campReset]'); check('reset', pg.locator('.sbar').count()==0 and pg.locator('.cprod.on').count()==2)
    # rejected + note
    st['camp']['entries']['soft boston']['status']='Rejected'; st['camp']['entries']['soft boston']['note']='ร้านออนไลน์ลดเหลือ 240'
    pg.click('[data-a=reload]'); pg.wait_for_function("document.body.innerText.indexOf('ร้านออนไลน์ลดเหลือ 240')>=0")
    check('rejected note', 'ไม่ผ่าน' in pg.inner_text('.cprod >> nth=1') and 'ร้านออนไลน์ลดเหลือ 240' in pg.inner_text('.cprod >> nth=1'))
    # back
    pg.click('[data-a=campBack]'); check('back to stock', pg.locator('.tab.on').inner_text().startswith('สินค้า'))
    # sales view
    st['camp'].update(phase='live',canRegister=True,start=NOW-2*DAY,end=NOW+9*DAY)
    import datetime; D0=datetime.date.today()-datetime.timedelta(days=3); sold={(D0).isoformat():2,(D0+datetime.timedelta(days=1)).isoformat():3,(D0+datetime.timedelta(days=3)).isoformat():1}
    st['camp']['sales']={'pcs':6,'orders':4,'gross':3258,'fee':0,'feeFull':159.15,'net':3258,'free':True,'daily':daily(sold=sold),'products':[{'name':'Hobo Bag','sold':4,'amount':3028},{'name':'Soft Boston','sold':2,'amount':498}]}
    pg.click('[data-a=reload]'); pg.wait_for_timeout(500); pg.click('.cban'); pg.wait_for_selector('.seg')
    pg.click('[data-a=campView][data-v=sales]'); pg.wait_for_selector('.bars')
    check('net', '3,258' in pg.inner_text('.money'))
    check('stats', '6 ชิ้น' in pg.inner_text('.stats') and '4 ออเดอร์' in pg.inner_text('.stats') and 'ยกเว้น' in pg.inner_text('.stats'))
    check('tier cells', pg.locator('.tier span.a').count()==5 and pg.locator('.tier span.b').count()==1)
    check('waived note', '159.15' in pg.inner_text('main'))
    check('12 bars', pg.locator('.bars button').count()==12 and pg.locator('.bars i').count()==4, pg.locator('.bars i').count())
    pg.click('.bars button >> nth=1'); check('bar tip', ' · 3 ชิ้น · ' in pg.inner_text('main'))
    check('per product', pg.locator('.prow').count()==2 and 'Hobo Bag' in pg.inner_text('.prow >> nth=0'))
    pg.screenshot(path='/tmp/c3_sales.png', full_page=True)
    # not free
    st['camp']['free']=False; st['camp']['sales'].update(free=False,fee=159.15,net=3098.85)
    pg.click('[data-a=reload]'); pg.wait_for_timeout(500)
    check('fee charged', '3,098.85' in pg.inner_text('.money') and pg.locator('.rv.ok').count()==0)
    # closed registration
    st['camp'].update(canRegister=False,phase='ended')
    pg.click('[data-a=reload]'); pg.wait_for_timeout(500); pg.click('[data-a=campView][data-v=pick]')
    check('closed note + disabled', 'จบแล้ว' in pg.inner_text('.note') and pg.locator('.ctick[disabled]').count()==3 and pg.locator('[data-a=campAll]').count()==0)
    # no campaign / not installed → no banner
    pg2=c.new_page(); st['off']=True; pg2.goto(BASE+'#k='+KEY); pg2.wait_for_selector('.tab'); pg2.wait_for_timeout(500)
    check('not installed: no banner', pg2.locator('.cban').count()==0)
    st['off']=False; st['camp']=None; pg2.click('[data-a=reload]'); pg2.wait_for_timeout(500)
    check('no campaign: no banner', pg2.locator('.cban').count()==0)
    check('no page errors', not errs, errs)
    br.close()
print('%d/%d'%(sum(res),len(res)))
sys.exit(0 if all(res) else 1)
