import json, threading, http.server, functools, time, copy, sys, base64
from playwright.sync_api import sync_playwright
SITE=sys.argv[1] if len(sys.argv)>1 else '/home/claude/site4'
class Q(http.server.SimpleHTTPRequestHandler):
    def log_message(self,*a): pass
srv=http.server.ThreadingHTTPServer(('127.0.0.1',8768),functools.partial(Q,directory=SITE))
threading.Thread(target=srv.serve_forever,daemon=True).start()
BASE='http://127.0.0.1:8768/brand.html'; KEY='0f5e500e727343108f05cec10cfaf271'
IMG='http://127.0.0.1:8768/pimg/5a5e97a00e.jpg'; IMG2='http://127.0.0.1:8768/pimg/2a22a205da.jpg'
ORDERS={'ok':True,'brand':'Narris','orders':[],'payouts':[],'upcoming':{'amount':0,'orders':[]},'companies':['Flash'],'claimDays':3}
P0={'ok':True,'brand':'Narris','maxAdd':100,'maxPhotos':5,'categories':['กระเป๋า','เสื้อผ้า','รองเท้า'],'formUrl':'https://forms.gle/x','products':[
 {'name':'Hobo Bag','cat':'กระเป๋า','price':890,'orig':1690,'images':[IMG,IMG2],'description':'ใช้ทุกวัน','material':'PU','size':'30 ซม.','review':None,'variants':[
   {'sku':'MRA079','color':'สีเงิน PU','size':'-','stock':24,'sold':1,'remaining':23,'held':2},
   {'sku':'MRA080','color':'คาราเมล','size':'-','stock':12,'sold':0,'remaining':12,'held':0}]},
 {'name':'Soft boston','cat':'กระเป๋า','price':300,'orig':990,'images':[],'description':'','material':'','size':'','review':{'id':'PE-0003','status':'Rejected','note':'ราคาต่ำเกินไป','changes':'ราคาขาย: 300 → 100','at':1},'variants':[
   {'sku':'MRA091','color':'น้ำตาล','size':'-','stock':0,'sold':0,'remaining':0,'held':0}]},
 {'name':'Merlin','cat':'กระเป๋า','price':300,'orig':1090,'images':[],'description':'','material':'','size':'','review':{'id':'PE-0004','status':'Pending','note':'','changes':'ชื่อสินค้า: Merlin → Merlin Mini','at':1},'variants':[
   {'sku':'MRA082','color':'แดง','size':'-','stock':5,'sold':0,'remaining':5,'held':0}]}]}
st={'prod':copy.deepcopy(P0),'calls':[]}
def route(r):
    b=json.loads(r.request.post_data or '{}'); a=b.get('action'); st['calls'].append(b)
    if a=='brandOrders': out=ORDERS
    elif a=='brandProducts': out=st['prod']
    elif a=='brandStock':
        for c in b['changes']:
            for p in st['prod']['products']:
                for v in p['variants']:
                    if v['sku']==c['sku']: v['stock']+=c['delta']; v['remaining']=max(0,v['stock']-v['sold'])
        out=dict(st['prod'],notified=True)
    elif a=='brandEdit':
        p=[p for p in st['prod']['products'] if p['name']==b['product']][0]
        p['review']={'id':'PE-0009','status':'Pending','note':'','changes':'\n'.join(k for k in b['changes']),'at':2}
        out=dict(st['prod'],requestId='PE-0009',notified=True)
    else: out={'products':[]}
    r.fulfill(status=200,content_type='application/json',body=json.dumps(out,ensure_ascii=False))
res=[]
def check(n,c,info=None):
    res.append(bool(c)); print(('PASS' if c else 'FAIL'),n, '' if c or info is None else info)
with sync_playwright() as p:
    br=p.chromium.launch()
    c=br.new_context(viewport={'width':390,'height':844},device_scale_factor=2,is_mobile=True,has_touch=True)
    c.route('https://script.google.com/**',route); c.route('**/data/catalog.json',lambda r:r.fulfill(status=404))
    pg=c.new_page(); pg.goto(BASE+'#k='+KEY); pg.wait_for_selector('.tab'); pg.click('[data-v=stock]'); pg.wait_for_selector('.pgrid')
    check('grid 3 cards', pg.locator('.pcard').count()==3)
    check('stats', 'เหลือรวม' in pg.inner_text('.stats') and '40' in pg.inner_text('.stats'))
    check('card tags', 'หมด' in pg.inner_text('.pcard >> nth=1') and 'ไม่ผ่าน' in pg.inner_text('.pcard >> nth=1') and 'รอทีม Mera ตรวจ' in pg.inner_text('.pcard >> nth=2'))
    check('card image', pg.locator('.pcard >> nth=0 >> img').get_attribute('src')==IMG)
    check('filter rev', (pg.click('[data-a=pFil][data-v=rev]') or True) and pg.locator('.pcard').count()==1)
    pg.click('[data-a=pFil][data-v=need]'); check('filter need', pg.locator('.pcard').count()==1)
    pg.click('[data-a=pFil][data-v=all]'); pg.fill('#pq','hobo'); pg.wait_for_timeout(400); check('search', pg.locator('.pcard').count()==1)
    check('search keeps focus', pg.evaluate("document.activeElement.id")=='pq')
    pg.fill('#pq',''); pg.wait_for_timeout(400)
    pg.screenshot(path='/tmp/e1_grid.png', full_page=True)
    # open detail
    pg.click('.pcard >> nth=0'); pg.wait_for_selector('.dhead')
    check('detail fields', pg.input_value('#ed-name')=='Hobo Bag' and pg.input_value('#ed-price')=='890' and pg.input_value('#ed-description')=='ใช้ทุกวัน')
    check('2 thumbs + add', pg.locator('.th').count()==2 and pg.locator('.addph').count()==1)
    check('no bar yet', pg.locator('.sbar').count()==0)
    # stock + edits
    pg.click('[data-sku=MRA080][data-d="1"]'); pg.click('[data-sku=MRA080][data-d="1"]')
    pg.fill('#ed-name','Hobo Bag XL'); pg.fill('#ed-price','790'); pg.fill('#ed-description','ใบใหญ่')
    pg.click('[data-a=phCover][data-v="1"]'); check('cover moved', pg.locator('.th.c img').get_attribute('src')==IMG2)
    # add photo
    pg.set_input_files('#phAdd',SITE+'/pimg/136e31a215.jpg'); pg.wait_for_function("document.querySelectorAll('.th').length===3")
    check('photo added', pg.locator('.th').count()==3)
    pg.click('[data-a=nvAdd]'); pg.fill('#nv-c-0','ดำ'); pg.fill('#nv-q-0','4')
    bar=pg.inner_text('.sbar')
    check('bar lists both', 'สต็อก 1 รายการ' in bar and 'ขึ้นเว็บทันที' in bar and 'ชื่อสินค้า' in bar and 'ราคาขาย' in bar and 'รายละเอียด' in bar and 'รูป' in bar and 'เพิ่มสี/ไซซ์ 1' in bar and 'รอทีม Mera ตรวจ' in bar, bar)
    pg.fill('#stnote','ล็อตใหม่')
    pg.screenshot(path='/tmp/e2_edit.png', full_page=True)
    pg.fill('#ed-material','PU แท้'); pg.click('[data-a=stSave]')   # แก้ช่องแล้วกดบันทึกทันที (คลิกเดียวต้องติด)
    pg.wait_for_selector('.toast')
    ss=[x for x in st['calls'] if x.get('action')=='brandStock'][-1]; se=[x for x in st['calls'] if x.get('action')=='brandEdit'][-1]
    check('stock call', ss['changes']==[{'sku':'MRA080','delta':2}] and ss['note']=='ล็อตใหม่', ss)
    check('edit call', se['product']=='Hobo Bag' and se['changes']=={'name':'Hobo Bag XL','price':'790','description':'ใบใหญ่','material':'PU แท้'} and se['newVariants']==[{'color':'ดำ','size':'','stock':4}], se)
    check('edit photos order', [x.get('url') for x in se['photos']]==[IMG2,IMG,None] and se['photos'][2]['mime']=='image/jpeg' and len(se['photos'][2]['data'])>100)
    check('edit ref differs', se['clientRef']==ss['clientRef']+'e')
    check('after save: pending banner + fresh form', 'ส่งให้ทีม Mera ตรวจแล้ว · PE-0009' in pg.inner_text('.rv') and pg.input_value('#ed-name')=='Hobo Bag' and pg.locator('.sbar').count()==0)
    pg.screenshot(path='/tmp/e3_pending.png')
    # back
    pg.fill('#ed-price','1'); pg.click('[data-a=pBack]'); pg.wait_for_selector('.pgrid')
    check('back discards + toast', 'ยกเลิกการแก้ข้อมูล' in pg.locator('.toast').last.inner_text() and pg.locator('.sbar').count()==0)
    # rejected product shows note
    pg.click('.pcard >> nth=1'); pg.wait_for_selector('.rv')
    check('rejected banner', 'ไม่ผ่าน' in pg.inner_text('.rv') and 'ราคาต่ำเกินไป' in pg.inner_text('.rv'))
    check('no photos → empty thumbs + add', pg.locator('.th').count()==0 and pg.locator('.addph').count()==1)
    pg.click('[data-a=phDel]') if pg.locator('[data-a=phDel]').count() else None
    br.close()
print('%d/%d'%(sum(res),len(res)))
