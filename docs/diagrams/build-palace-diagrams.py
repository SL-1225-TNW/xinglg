from pathlib import Path
from html import escape

OUT=Path(__file__).resolve().parent
BG='#f7f2e8';INK='#243b50';MUTED='#637584';LINE='#526c80'
COL={'public':'#d9e9e4','state':'#f2dfb5','private':'#e5ddec','service':'#e5d4c3','garden':'#d9e5ca','historic':'#d9dee3'}

def begin(w,h,title,sub):
 return [f'<svg xmlns="http://www.w3.org/2000/svg" width="{w}" height="{h}" viewBox="0 0 {w} {h}">', '<defs><pattern id="grid" width="20" height="20" patternUnits="userSpaceOnUse"><path d="M20 0H0V20" fill="none" stroke="#d5d9d5" stroke-width=".5"/></pattern><pattern id="roof" width="12" height="12" patternUnits="userSpaceOnUse"><path d="M0 12L12 0" stroke="#8d989e" stroke-width="1"/></pattern><marker id="arrow" markerWidth="8" markerHeight="8" refX="6" refY="4" orient="auto"><path d="M0 0L8 4L0 8" fill="#567b7c"/></marker></defs>',f'<rect width="{w}" height="{h}" fill="{BG}"/>',f'<rect x="24" y="94" width="{w-48}" height="{h-166}" fill="url(#grid)"/>',f'<style>text{{font-family:"Microsoft YaHei","Noto Sans CJK SC",sans-serif;fill:{INK};font-size:21px}}.muted{{fill:{MUTED};font-size:16px}}.heading{{font-weight:700;font-size:30px}}.room{{stroke:{LINE};stroke-width:2.5}}.path{{stroke:#8eaaa7;stroke-width:11;fill:none;stroke-linecap:square;stroke-linejoin:round}}.axis{{stroke:#8f7450;stroke-width:2;stroke-dasharray:6 7;fill:none}}</style>',f'<text x="38" y="44" class="heading">{escape(title)}</text>',f'<text x="40" y="76" class="muted">{escape(sub)}</text>']

def text(s,x,y,msg,size=None,cls=None,anchor='middle'):
 attrs=f' text-anchor="{anchor}"'+(f' style="font-size:{size}px"' if size else '')+(f' class="{cls}"' if cls else '')
 s.append(f'<text x="{x}" y="{y}"{attrs}>{escape(msg)}</text>')

def box(s,x,y,w,h,label,cat='public',subtitle=None):
 s.append(f'<rect x="{x}" y="{y}" width="{w}" height="{h}" fill="{COL[cat]}" class="room"/>')
 parts=None
 if len(label)*21>w-12:
  for sep in ['／','/']:
   if sep in label:parts=label.split(sep,1);break
 if parts:
  text(s,x+w/2,y+h/2-8,parts[0]);text(s,x+w/2,y+h/2+23,parts[1])
 else:text(s,x+w/2,y+h/2+(0 if subtitle else 7),label)
 if subtitle:text(s,x+w/2,y+h/2+28,subtitle,cls='muted')

def line(s,path,cls='path'):
 s.append(f'<path d="{path}" class="{cls}"/>')

def stairs(s,x,y,label='大楼梯',cat='state'):
 s.append(f'<rect x="{x}" y="{y}" width="86" height="44" fill="{COL[cat]}" class="room"/>')
 for i in range(1,5):s.append(f'<path d="M{x+2} {y+i*8}H{x+84}" stroke="{LINE}" stroke-width="1"/>')
 s.append(f'<rect x="{x-7}" y="{y+44}" width="100" height="28" fill="{BG}"/>')
 text(s,x+43,y+64,label,size=17)

def footer(s,h):
 cats=[('public','公众／办事'),('state','礼仪／接待'),('private','起居／访问'),('service','后勤'),('garden','花园／露台')]
 for i,(key,label) in enumerate(cats):
  x=40+i*174;s.append(f'<rect x="{x}" y="{h-43}" width="17" height="17" fill="{COL[key]}" stroke="{LINE}"/>');text(s,x+25,h-29,label,size=16,anchor='start')
 s.append('</svg>')

def save(name,s):
 (OUT/(name+'.svg')).write_text('\n'.join(s),encoding='utf-8')

s=begin(960,830,'白蔷薇宫城 · 总平面草案','三层主宫＋两层翼楼＋地下服务层｜功能草图，非比例施工图')
box(s,260,115,460,110,'蔷薇花园','garden','花坛 · 园丁 · 散步路线')
box(s,230,260,520,105,'主宫 · 地上三层','state','1F办事 / 2F礼仪 / 3F起居')
box(s,155,390,155,195,'西翼 · 两层','public','档案 · 音乐 · 礼拜')
box(s,670,390,155,195,'东翼 · 两层','state','接待 · 宴会 · 备餐')
box(s,335,405,310,160,'荣誉内庭','garden','环院回廊 · 露天庭院')
box(s,845,390,90,195,'服务院','service','侧门')
box(s,350,630,280,58,'门楼与游客接待','public')
box(s,315,715,350,48,'城市仪式广场','public')
box(s,35,390,98,100,'礼拜堂','historic','下厅＋观礼廊')
s.append(f'<circle cx="130" cy="287" r="58" fill="{COL["historic"]}" stroke="{LINE}" stroke-width="2.5"/>');text(s,130,286,'旧堡塔楼',size=20);text(s,130,313,'石基 · 观景',cls='muted')
line(s,'M130 346V375H180V390');line(s,'M133 440H155');line(s,'M310 487H324V382H656V487H670');line(s,'M310 545H324V610H656V545H670');line(s,'M490 688V714');line(s,'M490 610V630');line(s,'M750 317H860V390');
line(s,'M490 750V357','axis');line(s,'M490 260V225','axis')
text(s,493,600,'主门 → 内庭 → 大楼梯',size=19)
s.append('<circle cx="584" cy="486" r="23" fill="#b7d7db" stroke="#638f98" stroke-width="2"/>');text(s,584,491,'泉',size=19)
stairs(s,447,344,'大楼梯')
text(s,824,337,'独立后勤路线',size=18)
text(s,43,148,'北 ↑',size=20,anchor='start')
footer(s,830);save('palace-masterplan',s)

floors={
 'palace-f1':('一层 1F · 公众与办事','第一次到访：门厅、文书、档案与可见的大楼梯',
 [('公开档案','public'),('文书与委托室','public'),('供货交接室','service')],('礼拜堂下厅','public'),('卫兵值班／接待','public'),('门厅 · 游客接待','public'),('花园回廊','garden')),
 'palace-f2':('二层 2F · 宫廷礼仪主层','上楼后进入接待序列；同层房间通过回廊连续步行',
 [('音乐沙龙','state'),('王座厅','state'),('宴会厅','state')],('礼拜堂观礼廊','state'),('正式接待厅','state'),('前庭观礼廊','state'),('镜厅式长廊 · 面向花园','state')),
 'palace-f3':('三层 3F · 书房、起居与访问','主宫三层继续可游览；两层翼楼上方为局部露台',
 [('主人书房','private'),('寝居与会客','private'),('客房／访问室','private')],('西翼露台','garden'),('东翼露台','garden'),('门楼屋面 · 不可走','historic'),('阅读与访客廊','public')),
 'palace-b1':('地下 B1 · 后勤与旧堡石基','厨房位于宴会翼下方；服务梯贯通B1、1F与2F',
 [('储藏与酒窖','service'),('旧堡石基展示','historic'),('厨房与炉灶','service')],('维修间','service'),('食材仓库','service'),('后勤走道与收货','service'),('地下维修走廊','service'))
}
for name,(title,sub,rooms,left,right,bottom,north) in floors.items():
 s=begin(920,700,title,sub)
 # 保持各层同一主楼／翼楼轮廓与楼梯轴线。
 box(s,190,117,540,48,north[0],north[1])
 for i,(label,cat) in enumerate(rooms):box(s,190+i*180,182,180,86,label,cat)
 box(s,190,316,160,128,left[0],left[1])
 box(s,570,316,160,128,right[0],right[1])
 if name!='palace-b1':box(s,370,326,180,105,'荣誉内庭','garden','露天／临空')
 else:box(s,370,326,180,105,'地基与检修区','historic','非公众通行区')
 line(s,'M270 165V182');line(s,'M460 165V182');line(s,'M650 165V182');
 line(s,'M360 286H560V464H360Z');line(s,'M270 277V306');line(s,'M650 277V306');line(s,'M350 380H360');line(s,'M560 380H570')
 if name=='palace-f3':
  s.append('<rect x="370" y="494" width="180" height="60" fill="url(#roof)" class="room"/>');text(s,460,529,bottom[0],size=17)
 else:
  box(s,370,494,180,60,bottom[0],bottom[1]);line(s,'M460 464V494');line(s,'M350 460H360');line(s,'M560 460H570')
 if name!='palace-b1':stairs(s,417,271)
 else:
  s.append('<rect x="417" y="271" width="86" height="44" fill="url(#roof)" class="room"/>');text(s,460,299,'无主梯',size=17)
 if name!='palace-f3':
  line(s,'M673 444V456');stairs(s,630,456,'服务梯','service')
 else:text(s,679,493,'翼楼屋面',cls='muted')
 text(s,47,158,'北 ↑',size=20,anchor='start')
 text(s,47,585,'图中留白／粗线为回廊；同位置楼梯连接上下层。',cls='muted',anchor='start')
 text(s,47,615,'B1经服务路线进入；私密房间按具体许可开放。',cls='muted',anchor='start')
 footer(s,700);save(name,s)
print('Generated 5 palace diagrams')
