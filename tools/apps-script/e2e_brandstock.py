import json, threading, http.server, functools, time, copy
from playwright.sync_api import sync_playwright
import sys; SITE=sys.argv[1] if len(sys.argv)>1 else 'site'
class Q(http.server.SimpleHTTPRequestHandler):
    def log_message(self,*a): pass
srv=http.server.ThreadingHTTPServer(('127.0.0.1',8766),functools.partial(Q,directory=SITE))
threading.Thread(target=srv.serve_forever,daemon=True).start()
BASE='http://127.0.0.1:8766/brand.html'; KEY='0f5e500e727343108f05cec10cfaf271'
now=int(time.time()*1000)
ORDERS={'ok':True,'brand':'Narris','orders':[],'payouts':[],'upcoming':{'amount':0,'orders':[]},'companies':['Flash'],'claimDays':3,'shippingPayout':35,'shippingMax':100}
PROD0={'ok':True,'brand':'Narris','maxAdd':100,'formUrl':'https://forms.gle/abc','products':[
 {'name':'Hobo Bag','cat':'กระเป๋า','price':890,'orig':1690,'variants':[
   {'sku':'MRA079','color':'สีเงิน PU','size':'-','stock':24,'sold':1,'remaining':23,'held':2,'active':True},
   {'sku':'MRA080','color':'คาราเมล','size':'-','stock':12,'sold':0,'remaining':12,'held':3,'active':True}]},
 {'name':'Soft boston','cat':'กระเป๋า','price':300,'orig':990,'variants':[
   {'sku':'MRA091','color':'น้ำตาล','size':'-','stock':0,'sold':0,'remaining':0,'held':0,'active':True},
   {'sku':'MRA122','color':'Yellow','size':'-','stock':3,'sold':1,'remaining':2,'held':0,'active':True}]}]}
st={'prod':copy.deepcopy(PROD0),'calls':[],'fail':None}
def route(r):
    b=json.loads(r.request.post_data or '{}'); st['calls'].append(b); a=b.get('action')
    if a=='brandOrders': out=ORDERS
    elif a=='brandProducts': out=st['prod'] if st['fail']!='noaction' else {'ok':False,'code':'BAD_ACTION','error':'x'}
    elif a=='brandStock':
        if st['fail']=='below': out={'ok':False,'code':'BELOW_RESERVED','error':'คาราเมล: ลดได้มากสุด 9 ชิ้น (ลูกค้าจองไว้ 3 ชิ้น รอโอน)'}
        else:
            P=st['prod']; ups=0
            for c in b['changes']:
                for p in P['products']:
                    for v in p['variants']:
                        if v['sku']==c['sku']: v['stock']+=c['delta']; v['remaining']=max(0,v['stock']-v['sold']); ups+= c['delta']>0
            out=dict(P,saved=len(b['changes']),notified=ups>0,duplicate=False)
    else: out={'products':[]}
    r.fulfill(status=200,content_type='application/json',body=json.dumps(out,ensure_ascii=False))
res=[]
def check(n,c): res.append(c); print(('PASS' if c else 'FAIL'),n)
with sync_playwright() as p:
    br=p.chromium.launch()
    c=br.new_context(viewport={'width':390,'height':844},device_scale_factor=2,is_mobile=True,has_touch=True)
    c.route('https://script.google.com/**',route); c.route('**/data/catalog.json',lambda r:r.fulfill(status=404))
    pg=c.new_page(); pg.goto(BASE+'#k='+KEY); pg.wait_for_selector('.tab')
    check('5 tabs incl สินค้า', pg.locator('.tab').count()==5 and 'สินค้า' in pg.inner_text('nav'))
    pg.click('[data-v=stock]'); pg.wait_for_selector('.ssum')
    check('summary', '2 รายการ' in pg.inner_text('.ssum') and 'เหลือ 37 ชิ้น' in pg.inner_text('.ssum') and 'หมด 1' in pg.inner_text('.ssum') and 'ใกล้หมด 1' in pg.inner_text('.ssum'))
    check('tab badge = sold out count', pg.inner_text('[data-v=stock]').strip().endswith('1'))
    check('form link', pg.get_attribute('a.out','href')=='https://forms.gle/abc')
    check('held shown', 'ลูกค้าจองรอโอน 2' in pg.inner_text('main'))
    check('no save bar initially', pg.locator('.sbar').count()==0)
    pg.screenshot(path='/tmp/s1_stock.png', full_page=True)
    # + on sold out item 3 times
    for _ in range(3): pg.click('[data-sku=MRA091][data-d="1"]')
    check('stepper +3', pg.input_value('#st-MRA091')=='3' and '+3 จาก 0' in pg.inner_text('main'))
    check('save bar shows add + note', 'แก้ 1 รายการ' in pg.inner_text('.sbar') and 'เพิ่ม 3 ชิ้น' in pg.inner_text('.sbar') and pg.locator('#stnote').count()==1)
    # minus disabled at held floor
    pg.fill('#st-MRA080','1'); pg.locator('#st-MRA080').blur()
    check('clamped to held 3', pg.input_value('#st-MRA080')=='3')
    check('minus disabled at floor', pg.locator('[data-sku=MRA080][data-d="-1"]').is_disabled())
    # type a value then tap save directly (keyboard open)
    pg.fill('#stnote','ของล็อตใหม่')
    pg.locator('#st-MRA079').fill('30')
    pg.screenshot(path='/tmp/s2_editing.png')
    pg.click('[data-a=stSave]')
    pg.wait_for_selector('.toast')
    sv=[x for x in st['calls'] if x.get('action')=='brandStock'][-1]
    ch={x['sku']:x['delta'] for x in sv['changes']}
    check('save sent deltas', ch=={'MRA091':3,'MRA080':-9,'MRA079':7}, ) or print(ch)
    check('note + clientRef sent', sv['note']=='ของล็อตใหม่' and sv['clientRef'].startswith('st'))
    check('toast notified', 'แจ้งทีม Mera แล้ว' in pg.inner_text('.toast'))
    check('bar gone, values refreshed', pg.locator('.sbar').count()==0 and pg.input_value('#st-MRA079')=='30')
    # cancel
    pg.click('[data-sku=MRA122][data-d="-1"]'); check('decrease-only bar no note', pg.locator('#stnote').count()==0 and 'ลด 1 ชิ้น' in pg.inner_text('.sbar'))
    pg.click('[data-a=stReset]'); check('cancel resets', pg.locator('.sbar').count()==0 and pg.input_value('#st-MRA122')=='2')
    # server rejects
    st['fail']='below'; pg.click('[data-sku=MRA122][data-d="1"]'); pg.click('[data-a=stSave]'); pg.wait_for_selector('.sbar .err')
    check('error shown, draft kept', 'ลดได้มากสุด' in pg.inner_text('.sbar') and pg.input_value('#st-MRA122')=='3')
    pg.screenshot(path='/tmp/s3_error.png')
    # other tabs hide bar
    pg.click('[data-v=ship]'); check('bar hidden on other tab', pg.locator('.sbar').count()==0)
    pg.click('[data-v=stock]'); check('draft kept when back', pg.locator('.sbar').count()==1)
    c.close()
    # backend not installed
    st['fail']='noaction'; st['prod']=copy.deepcopy(PROD0)
    c=br.new_context(viewport={'width':390,'height':844}); c.route('https://script.google.com/**',route); c.route('**/data/catalog.json',lambda r:r.fulfill(status=404))
    pg=c.new_page(); pg.goto(BASE+'#k='+KEY); pg.wait_for_selector('.tab'); pg.click('[data-v=stock]'); pg.wait_for_selector('main .err')
    check('backend missing message', 'ยังไม่เปิดใช้งาน' in pg.inner_text('main'))
    br.close()
print('%d/%d'%(sum(res),len(res)))
