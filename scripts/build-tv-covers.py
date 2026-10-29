#!/usr/bin/env python3
"""Original, local vector cover system for the Lux TV folder catalog. No network."""
import json,re,hashlib,html,unicodedata
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'public/assets/tv-covers';OUT.mkdir(parents=True,exist_ok=True)
HIDDEN={'Informações da lista','Outros','Rádios','Internacionais'}
PALETTES={'Esportes':('#0b1923','#138968','#c9ff74'),'TV aberta':('#101831','#365dc8','#81dfff'),'Filmes':('#251112','#b64632','#ffc991'),'Séries e novelas':('#201026','#8c396f','#ffa5ca'),'Infantil':('#171a3a','#6759dc','#ffe296'),'Documentários':('#10211c','#3c8059','#c1db99'),'Variedades':('#281828','#ad466b','#ffd49c'),'Notícias':('#21121b','#a92c44','#f9a3ae'),'Religiosos':('#281f15','#82603b','#ffe3a3'),'Música':('#18102e','#7a3bb9','#ffa2da'),'24h':('#15152b','#3d51a0','#b5c9ff'),'Eventos e PPV':('#21112e','#71399f','#f5bcff'),'Todos os canais':('#111329','#6141a6','#cbb9ff')}
BRANDS={'Premiere':('#09231e','#147e4d','#d7ff67'),'SporTV':('#111c3d','#2343b1','#ff6969'),'ESPN':('#250b14','#b22632','#ffb2a0'),'BandSports':('#2b1710','#bd5831','#ffdb6b'),'Combate':('#211b11','#77613c','#e8ca83'),'UFC Fight Pass':('#1d1014','#922330','#ffb0a1'),'NBA League Pass':('#131b35','#214c9c','#ff9a59'),'CONMEBOL / Paramount+':('#0d1d37','#226cba','#bceaff'),'DAZN':('#17211b','#4e6e42','#e9ff9e'),'CazéTV':('#132327','#226b75','#f9bc6b'),'GOAT':('#211437','#7042ab','#c5fd80'),'HBO':('#171616','#595452','#f5d4a3'),'Telecine':('#2c1118','#a92942','#ffb9ae'),'Cinemax':('#152117','#548543','#daff96'),'Megapix':('#12232d','#2386a4','#b5f2ff'),'TNT e Space':('#271324','#833760','#ffb2b3'),'CNN':('#2e1316','#ad2939','#ffd0c4'),'GloboNews':('#291418','#9d3d49','#ffbbbc'),'BandNews':('#121d32','#275e96','#b2e3ff'),'Bloomberg':('#191827','#655a91','#d6c7ff'),'Jovem Pan':('#2a1517','#ad4143','#ffd0ba'),'Record News':('#141c2b','#3a6587','#afd9e9'),'SBT News':('#151f2a','#36658e','#bcefff'),'Disney+':('#0d1536','#294da2','#c5d5ff'),'Apple TV':('#15191d','#4b5862','#d4f0ed'),'Max':('#161138','#4031a4','#b4abff'),'Netflix':('#270d17','#9e2139','#ff9c98')}
def key(s):return re.sub(r'[^a-z0-9]+','-',unicodedata.normalize('NFD',s).encode('ascii','ignore').decode().lower()).strip('-')
def title_lines(text,limit=22):
 words=text.replace(' / ',' · ').split();lines=[];line=''
 for word in words:
  if len(line+' '+word)>limit and line:lines.append(line);line=word
  else:line=(line+' '+word).strip()
 if line:lines.append(line)
 return lines

def scene(group,name,a,b,seed):
 # Scenes are deliberately geometric illustrations, not imitations of broadcaster logos.
 n=name.lower()
 if group=='24h':
  themes={'Música':'Música','Desenhos e animações':'Infantil','Filmes e franquias':'Filmes','Séries e sitcoms':'Séries e novelas','Bíblicos e religiosos':'Religiosos','Documentários e curiosidades':'Documentários','Relaxamento':'Documentários'}
  if name in themes:return scene(themes[name],name,a,b,seed)
 base=f'<g transform="translate(320 30)" stroke-linejoin="round" stroke-linecap="round">'
 if group=='24h' and 'animes' in n:
  art=f'<path d="m24 40 102 33-56 62 67 19-87 145 12-102-50-15 54-65Z" fill="{b}" opacity=".5"/><path d="M121 118 163 61 221 118 257 156 234 247 165 283 98 247 75 156Z" fill="{a}" stroke="{b}" stroke-width="4"/><path d="M104 153 160 174 228 149 217 184 164 204 112 183Z" fill="{b}"/><path d="m139 231 24-15 25 15-24 16Z" fill="#171b2a"/>'
 elif group=='Documentários' and ('history' in n or 'cultura' in n):
  art=f'<path d="m26 105 139-65 134 65Z" fill="{b}" opacity=".8"/><path d="M28 113h271v17H28ZM20 280h287v19H20Z" fill="{a}"/>'+''.join(f'<path d="M{x} 136h33v133h-33Z" fill="{b}" opacity=".6"/><path d="M{x-5} 134h43M{x-5} 271h43" stroke="{b}" stroke-width="6"/>' for x in [50,115,180,245])
 elif group=='Esportes' and ('nba' in n):
  art=f'<path d="M10 240 110 82 300 150 260 308Z" fill="{a}" opacity=".28"/><path d="M25 224 118 101 281 157 249 289Z" fill="none" stroke="{b}" opacity=".48" stroke-width="3"/><circle cx="171" cy="178" r="73" fill="{b}"/><g fill="none" stroke="#151c35" stroke-width="4"><circle cx="171" cy="178" r="73"/><path d="M100 163Q174 189 238 132M136 112Q204 169 194 247M115 225Q148 145 220 124M107 143Q232 157 220 230"/></g>'
 elif group=='Esportes' and any(x in n for x in ['combate','ufc','lutas']):
  art=f'<path d="M60 83 157 44 253 83 291 180 253 271 157 304 60 271 22 180Z" fill="{a}" opacity=".5" stroke="{b}" stroke-width="4"/><path d="M80 109 157 78 230 109 259 180 229 246 157 274 81 246 53 180Z" fill="#11121b" stroke="{b}" opacity=".8"/><path d="M123 164q-27-57-46-23l-10 45q-2 29 26 40l45-5 19-32-8-31q-14-14-26 6ZM192 164q27-57 46-23l10 45q2 29-26 40l-45-5-19-32 8-31q14-14 26 6Z" fill="{b}"/>'
 elif group=='Esportes' and 'off' not in n:
  art=f'<path d="M-18 209Q138 78 317 211L335 311H-24Z" fill="{a}" opacity=".45"/><path d="M-3 225Q142 111 300 225M24 248Q146 150 274 248" fill="none" stroke="{b}" opacity=".26" stroke-width="3"/><path d="M32 213 277 213 311 299 4 299Z" fill="{a}" stroke="{b}" opacity=".72"/><g stroke="{b}" fill="none" opacity=".55"><path d="M150 213V299M10 259H305"/><ellipse cx="151" cy="257" rx="35" ry="15"/></g><g stroke="{b}" stroke-width="5"><path d="M32 177V51M276 177V51"/><path d="M10 54H56M253 54H299"/></g><g fill="{b}">'+''.join(f'<circle cx="{x}" cy="54" r="5"/>' for x in [12,26,40,54,254,268,282,296])+f'</g><circle cx="171" cy="172" r="56" fill="#ecf1e5"/><path d="m171 144 24 18-9 29h-30l-9-29Z" fill="#253647"/><g fill="none" stroke="#253647" stroke-width="3"><path d="m171 144 0-28M195 162l26-10M186 191l17 22M156 191l-18 22M147 162l-25-10"/></g>'
 elif group in ['Documentários'] or ('aventura' in n) or (group=='Esportes' and 'off' in n):
  art=f'<circle cx="214" cy="78" r="47" fill="{b}" opacity=".8"/><path d="M-30 302 85 95 145 204 205 126 334 302Z" fill="{a}"/><path d="m85 95 39 72-36-19-24 19Z" fill="{b}" opacity=".8"/><path d="M-20 305 137 196 221 275 319 230 340 320Z" fill="{b}" opacity=".3"/><g fill="#101b22">'+''.join(f'<path d="m{x} {y} 22 48h-44Zm0 19 30 51h-60Z"/>' for x,y in [(24,220),(265,204),(294,239)])+'</g>'
 elif group=='Filmes':
  art=f'<g transform="rotate(-13 160 166)"><rect x="46" y="76" width="232" height="180" rx="14" fill="#100f18" stroke="{b}" stroke-width="3"/><path d="M46 94h232v44H46Z" fill="{a}"/><g fill="{b}">'+''.join(f'<path d="m{x} 94 22 0-27 44h-22Z"/>' for x in [72,120,168,216])+f'</g><rect x="74" y="168" width="123" height="9" rx="4" fill="{b}" opacity=".7"/><rect x="74" y="192" width="170" height="7" rx="3" fill="{b}" opacity=".3"/><path d="m210 213 0-43 32 21Z" fill="{b}"/></g><circle cx="270" cy="273" r="31" fill="{a}" stroke="{b}" stroke-width="3"/>'+''.join(f'<circle cx="{x}" cy="{y}" r="7" fill="#171421"/>' for x,y in [(259,260),(283,263),(276,286),(255,280)])
 elif group=='Notícias':
  art=f'<circle cx="181" cy="168" r="105" fill="{a}" opacity=".7"/><g stroke="{b}" opacity=".66" stroke-width="2" fill="none"><circle cx="181" cy="168" r="105"/><ellipse cx="181" cy="168" rx="47" ry="105"/><ellipse cx="181" cy="168" rx="82" ry="105"/><ellipse cx="181" cy="168" rx="105" ry="42"/><path d="M76 168h210M181 63v210"/></g><rect x="28" y="211" width="205" height="64" rx="8" fill="#15131f" stroke="{b}"/><rect x="46" y="229" width="70" height="8" rx="3" fill="{b}"/><path d="M46 250h151" stroke="{b}" opacity=".5" stroke-width="5"/>'
 elif group=='Música' or (group=='24h' and name=='Música'):
  art=f'<circle cx="175" cy="170" r="115" fill="#14121e" stroke="{a}" stroke-width="4"/>'+''.join(f'<circle cx="175" cy="170" r="{r}" fill="none" stroke="{b}" opacity=".13"/>' for r in [105,92,80,68])+f'<circle cx="175" cy="170" r="44" fill="{a}"/><circle cx="175" cy="170" r="10" fill="{b}"/><path d="M252 72h29l-31 130-41 17" fill="none" stroke="{b}" stroke-width="11"/>'+''.join(f'<rect x="{15+i*13}" y="{255-h}" width="7" height="{h}" rx="3" fill="{b}" opacity=".65"/>' for i,h in enumerate([24,43,61,37,72,51,30]))
 elif group=='Religiosos':
  art=f'<path d="M53 296V126a102 102 0 0 1 204 0v170Z" fill="{a}" stroke="{b}" stroke-width="4"/><path d="M74 293V126a81 81 0 0 1 162 0v167Z" fill="#151322"/><g stroke="{b}" fill="none" opacity=".65" stroke-width="2"><path d="M155 45v249M74 128h162M74 198h162M98 68l115 226M211 68 98 294"/><circle cx="155" cy="128" r="37"/></g><path d="M144 92h22v38h36v22h-36v70h-22v-70h-36v-22h36Z" fill="{b}" opacity=".85"/>' if name!='Outros religiosos' else f'<circle cx="162" cy="124" r="71" fill="{b}" opacity=".6"/><path d="M32 298v-91q130-91 260 0v91Z" fill="{a}"/><path d="M35 296q126-59 254 0M161 195v93" stroke="{b}" fill="none" stroke-width="4"/>'
 elif group=='Infantil':
  art=f'<circle cx="176" cy="156" r="83" fill="{a}"/><ellipse cx="176" cy="156" rx="139" ry="34" transform="rotate(-23 176 156)" fill="none" stroke="{b}" stroke-width="13"/><path d="m55 56 10 20 23 3-17 17 4 23-20-11-20 11 4-23-17-17 23-3Z" fill="{b}"/><circle cx="274" cy="254" r="28" fill="{b}"/><path d="m178 78 14 27 30 4-22 21 5 30-27-14-27 14 5-30-22-21 30-4Z" fill="#eee8ff" opacity=".85"/>'
 elif group=='24h':
  art=f'<circle cx="167" cy="160" r="114" fill="#141426" stroke="{a}" stroke-width="13"/><circle cx="167" cy="160" r="93" fill="none" stroke="{b}" opacity=".5" stroke-width="2"/>'+''.join(f'<path d="M167 75v10" transform="rotate({i*30} 167 160)" stroke="{b}" stroke-width="3"/>' for i in range(12))+f'<path d="M167 100v60l45 29" fill="none" stroke="{b}" stroke-width="9"/><circle cx="167" cy="160" r="9" fill="{b}"/><path d="M43 264h240v39H43Z" fill="{a}" opacity=".85"/><text x="163" y="291" text-anchor="middle" fill="#f2eaff" font-size="25" font-weight="800" font-family="Arial,sans-serif">24 / 7</text>'
 elif group=='Eventos e PPV':
  art=f'<path d="M28 54h41l82 230H-18ZM249 54h39l42 230H154Z" fill="{b}" opacity=".17"/><path d="M27 42h48v20H27ZM244 42h48v20h-48Z" fill="{b}"/><g transform="rotate(-15 164 175)"><path d="M44 114h238v42a25 25 0 0 0 0 50v41H44v-41a25 25 0 0 0 0-50Z" fill="{a}" stroke="{b}" stroke-width="3"/><path d="M211 125v111" stroke="{b}" stroke-dasharray="7 7" opacity=".7"/><path d="m106 148 0 64 49-32Z" fill="{b}"/></g>'
 elif group=='Séries e novelas':
  art=f'<g transform="rotate(-9 162 166)">'+''.join(f'<rect x="{x}" y="{y}" width="154" height="195" rx="12" fill="{color}" stroke="{b}" stroke-opacity=".35"/>' for x,y,color in [(38,62,'#171321'),(88,83,a),(138,104,'#20172b')])+f'<circle cx="216" cy="173" r="32" fill="{b}" opacity=".65"/><path d="M166 269q4-60 50-60t50 60" fill="{b}" opacity=".35"/><rect x="160" y="283" width="100" height="5" rx="2" fill="{b}" opacity=".8"/></g>'
 elif group=='TV aberta' or group=='Todos os canais':
  art=f'<rect x="35" y="82" width="244" height="163" rx="18" fill="#131726" stroke="{b}" stroke-width="4"/><rect x="48" y="95" width="217" height="136" rx="10" fill="{a}"/>'+''.join(f'<path d="M{x} 95h36v136h-36Z" fill="{c}" opacity=".65"/>' for x,c in zip([49,85,121,157,193,229],['#aa6bd5','#65a6d2','#70bb9b','#ded07d','#dc9970','#c476b0']))+f'<path d="M98 270h120M156 247v23M107 49l49 31 50-31" fill="none" stroke="{b}" stroke-width="7"/>'
 else:
  # Variedades: a composed editorial still life, with different silhouettes by family.
  if 'agro' in n:art=f'<circle cx="230" cy="74" r="39" fill="{b}"/><path d="M-20 298 162 112 334 298Z" fill="{a}"/>'+''.join(f'<path d="M{x} 300 164 130" stroke="{b}" opacity=".5" stroke-width="3"/>' for x in [10,70,140,210,280,330])
  elif 'pets' in n:art=f'<path d="M88 211q65-103 128 0t-64 67q-127 36-64-67Z" fill="{b}" opacity=".8"/>'+''.join(f'<ellipse cx="{x}" cy="{y}" rx="22" ry="29" transform="rotate({r} {x} {y})" fill="{a}"/>' for x,y,r in [(79,146,-25),(124,108,-10),(176,108,10),(224,146,25)])
  elif 'pesca' in n:art=f'<path d="M76 174q77-92 165 0-88 91-165 0Zm0 0-55-43v85Z" fill="{b}" opacity=".8"/><circle cx="211" cy="159" r="6" fill="#191624"/><path d="M190 57v54q0 27-22 27t-22-24" stroke="{a}" stroke-width="8" fill="none"/><path d="M14 256q45-25 90 0t90 0t90 0" stroke="{b}" opacity=".5" stroke-width="4" fill="none"/>'
  elif 'casa' in n:art=f'<path d="M35 159 160 58 286 159" fill="none" stroke="{b}" stroke-width="8"/><path d="M65 154v132h191V154Z" fill="{a}"/><rect x="135" y="204" width="54" height="82" rx="5" fill="{b}" opacity=".7"/><rect x="87" y="178" width="32" height="32" rx="3" fill="{b}" opacity=".5"/>'
  elif 'viage' in n:art=f'<circle cx="177" cy="168" r="108" fill="{a}" opacity=".7"/><path d="m39 167 100 13 50 86 23-4-17-85 85-64q31-27 12-42t-46 13l-81 64-81-36-23 15 68 57Z" fill="{b}"/>'
  else:art=f'<rect x="45" y="77" width="222" height="170" rx="18" fill="{a}" opacity=".8"/><circle cx="157" cy="161" r="58" fill="#1b1427"/><path d="m143 132 0 60 47-30Z" fill="{b}"/><path d="M75 279h166" stroke="{b}" opacity=".6" stroke-width="7"/><circle cx="275" cy="66" r="27" fill="{b}" opacity=".6"/>'
 return base+art+'</g>'

def cover(group,name):
 digest=hashlib.sha256((group+'|'+name).encode()).digest();bg,a,b=BRANDS.get(name,PALETTES[group]);seed=digest[0]
 # Every subgroup has its own compositional accents and palette, rather than sharing a file.
 accent_x=350+seed%210
 lines=title_lines(name);size=42 if max(map(len,lines))<17 else 34
 start=190-(len(lines)-1)*22
 text=''.join(f'<tspan x="34" y="{start+i*46}">{html.escape(line)}</tspan>' for i,line in enumerate(lines))
 return f'''<svg xmlns="http://www.w3.org/2000/svg" width="640" height="360" viewBox="0 0 640 360" role="img" aria-labelledby="t"><title id="t">{html.escape(name)} — Lux TV</title><defs><linearGradient id="bg" x2="1" y2="1"><stop stop-color="{bg}"/><stop offset="1" stop-color="{a}" stop-opacity=".65"/></linearGradient><linearGradient id="shade"><stop stop-color="{bg}"/><stop offset=".6" stop-color="{bg}" stop-opacity=".8"/><stop offset="1" stop-color="{bg}" stop-opacity="0"/></linearGradient><pattern id="grain" width="24" height="24" patternUnits="userSpaceOnUse"><circle cx="2" cy="2" r=".7" fill="#fff" opacity=".07"/></pattern></defs><path fill="url(#bg)" d="M0 0h640v360H0z"/><circle cx="{accent_x}" cy="95" r="210" fill="{a}" opacity=".22"/><g stroke="{b}" opacity=".1" fill="none"><path d="M-30 300 350-40M100 390 530-40M350 390 690 80" stroke-width="2"/><circle cx="530" cy="80" r="{120+seed%38}"/></g>{scene(group,name,a,b,seed)}<path fill="url(#shade)" d="M0 0h480v360H0z"/><path fill="url(#grain)" d="M0 0h640v360H0z"/><path d="M34 42h24" stroke="{b}" stroke-width="3"/><text x="68" y="46" font-family="Arial,sans-serif" font-size="12" font-weight="700" letter-spacing="3" fill="{b}">LUX TV</text><text font-family="Arial,sans-serif" font-size="{size}" font-weight="800" letter-spacing="-1" fill="#f7f5ff">{text}</text><path d="M34 304h44" stroke="{b}" stroke-width="3"/><text x="34" y="333" font-family="Arial,sans-serif" font-size="11" letter-spacing="2" fill="{b}" opacity=".75">{html.escape(group.upper())}</text></svg>'''

catalog=json.loads((ROOT/'public/data/tv-channel-groups.json').read_text());manifest={'groups':{},'subgroups':{}}
all_path=OUT/'todos-os-canais.svg';all_path.write_text(cover('Todos os canais','Todos os canais'));manifest['all']='/assets/tv-covers/'+all_path.name
for group in catalog['grupos']:
 name=group['nome']
 if name in HIDDEN:continue
 path=OUT/(key(name)+'.svg');path.write_text(cover(name,name));manifest['groups'][name]='/assets/tv-covers/'+path.name
 for sub in group['subgrupos']:
  title=sub['nome'];path=OUT/(key(name)+'--'+key(title)+'.svg');path.write_text(cover(name,title));manifest['subgroups'][name+'\u241f'+title]='/assets/tv-covers/'+path.name
module='// Generated by scripts/build-tv-covers.py. Original vector art; no remote images.\nexport const TV_FOLDER_COVERS='+json.dumps(manifest,ensure_ascii=False,separators=(',',':'))+';\nexport function tvFolderCover(group,subgroup=""){return (subgroup&&TV_FOLDER_COVERS.subgroups[group+"\\u241f"+subgroup])||TV_FOLDER_COVERS.groups[group]||TV_FOLDER_COVERS.all;}\n'
(ROOT/'public/tv-folder-covers.js').write_text(module)
print(json.dumps({'groups':len(manifest['groups']),'subgroups':len(manifest['subgroups']),'assets':len(list(OUT.glob('*.svg'))),'bytes':sum(p.stat().st_size for p in OUT.glob('*.svg'))}))
