import hashlib, json, os, random, re, sys
from pathlib import Path
from PIL import Image, ImageDraw

BASE=Path(__file__).resolve().parents[1]; ROOT=BASE/'fixtures'; MAN=BASE/'manifest.json'; REPORT=BASE/'validation.json'
SEED=20261117

def sha(p):
 h=hashlib.sha256()
 with p.open('rb') as f:
  for b in iter(lambda:f.read(1024*1024),b''): h.update(b)
 return h.hexdigest()
def rel(p): return p.relative_to(ROOT).as_posix()
def owned_write(p):
 p.parent.mkdir(parents=True,exist_ok=True)
 if p.exists():
  prev=old.get(rel(p))
  if not prev or sha(p)!=prev['sha256']: raise RuntimeError('拒绝覆盖未知或已修改文件: '+str(p))
 return p

def generate():
 global old
 old={}
 if MAN.exists():
  old={x['path']:x for x in json.loads(MAN.read_text(encoding='utf8'))['files']}
 entries=[]
 def record(p,**kw):
  entries.append(dict(path=rel(p),bytes=p.stat().st_size,sha256=sha(p),**kw))
 def doc(kind,tier,target,small=False):
  p=owned_write(ROOT/('compatible' if tier=='1.8MB' else 'over-limit')/kind/(('many-small-' if small else '')+tier+'.md'))
  lines=0; units=0; blocks=0
  with p.open('wb') as f:
   def emit(s):
    nonlocal lines
    b=s.encode('utf8');f.write(b);lines+=s.count('\n')
   emit('# HIVE 压力测试：'+kind+' '+tier+'\n\n')
   if kind=='text':
    pattern='这是用于性能测试的合成文字，不包含真实文稿。段落包含中文、English、数字 0123456789 与标点。\n\n'
    while f.tell()<target: emit(pattern);units+=1
   elif kind=='tables':
    header='| 编号 | 内容 | 分类 | 数值 | 状态 | 备注 |\n| --- | --- | --- | --- | --- | --- |\n'
    if not small: emit(header);blocks=1
    while f.tell()<target:
     if small and units%10==0: emit('\n'+header);blocks+=1
     emit('| %08d | 测试记录 | 合成数据 | 123456 | 正常 | Markdown 表格压力测试 |\n'%units);units+=1
   else:
    pattern='```python\ndef calculate(value):\n    return sum(i * i for i in range(value))\n```\n\n行内公式 $E=mc^2$；公式文本测试。\n\n$$\n\\sum_{i=1}^{n} i^2 = \\frac{n(n+1)(2n+1)}{6}\n$$\n\n'
    while f.tell()<target: emit(pattern);units+=1
  info={'category':kind,'tier':tier,'baseline_compatible':p.stat().st_size<=2000000,'lines':lines}
  if kind=='text':info.update(paragraphs=units)
  elif kind=='tables':info.update(tables=blocks,data_rows=units,columns=6,data_cells=units*6)
  else:info.update(code_blocks=units,inline_formulas=units,display_formulas=units)
  record(p,**info)
 for k in ['text','tables','code-formula']:
  for tier,n in [('1.8MB',1800000),('10MiB',10*1024**2),('50MiB',50*1024**2),('100MiB',100*1024**2)]:doc(k,tier,n)
 doc('tables','1.8MB',1800000,True)
 assets=[]
 for i in range(256):
  p=owned_write(ROOT/'compatible'/'images'/'assets'/('image-%03d.png'%i))
  rng=random.Random(SEED+i); im=Image.new('RGB',(128,128)); pix=im.load()
  for y in range(128):
   for x in range(128):pix[x,y]=((x*2+i*13)%256,(y*2+i*7)%256,((x//8+y//8)*23+rng.randrange(16)+i)%256)
  im.save(p,format='PNG',compress_level=6);assets.append(p);record(p,category='image',width=128,height=128,baseline_compatible=p.stat().st_size<=12*1024**2)
 heavy=[]
 for i in range(4096):
  p=owned_write(ROOT/'compatible'/'images'/'heavy-assets'/('heavy-%04d.png'%i))
  im=Image.new('RGB',(32,32)); d=ImageDraw.Draw(im)
  for y in range(32):
   for x in range(32): d.point((x,y),fill=((x*8+i*13)%256,(y*8+(i//256)*17)%256,((x+y)*4+i)%256))
  d.text((0,0),str(i),fill=(255,255,255))
  im.resize((512,512),Image.Resampling.NEAREST).save(p,format='PNG',compress_level=6)
  heavy.append(p);record(p,category='image',width=512,height=512,baseline_compatible=p.stat().st_size<=12*1024**2)
 for size in [1024,2048,4096,8192]:
  p=owned_write(ROOT/'compatible'/'images'/'assets'/('high-%d.png'%size))
  im=Image.new('RGB',(256,256)); d=ImageDraw.Draw(im)
  for j in range(32):d.rectangle((j*4,j*4,255-j*4,255-j*4),outline=((j*37)%256,(j*71)%256,(j*19)%256),width=2)
  im.resize((size,size),Image.Resampling.NEAREST).save(p,format='PNG',compress_level=6)
  assets.append(p);record(p,category='image',width=size,height=size,baseline_compatible=p.stat().st_size<=12*1024**2)
 def page(name,refs):
  p=owned_write(ROOT/'compatible'/'images'/(name+'.md'))
  with p.open('w',encoding='utf8',newline='\n') as f:
   f.write('# '+name+'\n\n')
   for i,a in enumerate(refs):f.write('![image %d](%s/%s)\n\n'%(i,a.parent.name,a.name))
  record(p,category='image-page',tier=name,baseline_compatible=p.stat().st_size<=2000000,lines=2+2*len(refs),image_references=len(refs),unique_resources=len(set(refs)))
 for n in [32,128,256]:page('unique-%d'%n,assets[:n])
 for n in [128,1024,4096]:page('repeated-%d'%n,[assets[0]]*n)
 for n in [512,1024,4096]:page('heavy-unique-%d'%n,heavy[:n])
 page('high-resolution',assets[-4:])
 MAN.write_text(json.dumps({'seed':SEED,'generated_by':'scripts/generate.py','files':entries},ensure_ascii=False,indent=2)+'\n',encoding='utf8')
 print('generated',len(entries),'files',sum(x['bytes'] for x in entries),'bytes')

def validate():
 entries=json.loads(MAN.read_text(encoding='utf8'))['files']; results=[]
 for e in entries:
  p=ROOT/e['path']; errors=[]
  if not p.is_file(): errors.append('missing')
  else:
   if p.stat().st_size!=e['bytes']: errors.append('size')
   if sha(p)!=e['sha256']:errors.append('sha256')
   if e.get('baseline_compatible') != (p.stat().st_size <= (12*1024**2 if e['category']=='image' else 2000000)):errors.append('baseline threshold')
   cat=e['category']
   if cat=='image':
    try:
     with Image.open(p) as im:
      if list(im.size)!=[e['width'],e['height']]:errors.append('dimensions')
      im.load()
    except Exception as ex: errors.append('decode: '+str(ex))
   else:
    lines=rows=tables=code=inline=display=paragraphs=fences=0; refs=[]; badlinks=[]
    with p.open('r',encoding='utf8') as f:
     for line in f:
      lines+=1
      if cat=='tables':
       if line.startswith('| --- |'):tables+=1
       elif line.startswith('| ') and not line.startswith('| 编号 |'):
        rows+=1
        if len(line.strip().split('|'))-2!=e['columns']:errors.append('column count line '+str(lines))
      elif cat=='code-formula':
       if line.startswith('```'):fences+=1
       if line.startswith('```python'):code+=1
       inline+=line.count('$E=mc^2$')
       if line.strip()=='$$':display+=1
      elif cat=='text' and line.startswith('这是用于性能测试'):paragraphs+=1
      elif cat=='image-page':
       m=re.match(r'^!\[.*?\]\((.*?)\)',line)
       if m:
        ref=m.group(1); refs.append(ref)
        if re.match(r'^(?:[a-z][\w+.-]*:|/|\\)',ref,re.I) or not (p.parent/ref).is_file() or not (p.parent/ref).resolve().is_relative_to(ROOT.resolve()):badlinks.append(ref)
    if lines!=e['lines']:errors.append('lines')
    if cat=='tables' and (rows!=e['data_rows'] or tables!=e['tables'] or rows*e['columns']!=e['data_cells']):errors.append('table metrics')
    if cat=='code-formula' and (code!=e['code_blocks'] or inline!=e['inline_formulas'] or display!=2*e['display_formulas'] or fences!=2*code):errors.append('code/formula metrics or unpaired delimiters')
    if cat=='text' and paragraphs!=e['paragraphs']:errors.append('paragraphs')
    if cat=='image-page' and (len(refs)!=e['image_references'] or len(set(refs))!=e['unique_resources'] or badlinks):errors.append('image references: '+str(badlinks[:3]))
  results.append({'path':e['path'],'ok':not errors,'errors':errors})
 heavy_hashes=[e['sha256'] for e in entries if '/heavy-assets/' in e['path']]
 unique_heavy=len(set(heavy_hashes))==len(heavy_hashes)==4096
 report={'ok':all(r['ok'] for r in results) and unique_heavy,'files_checked':len(results),'heavy_unique_hashes':len(set(heavy_hashes)),'results':results}
 REPORT.write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n',encoding='utf8')
 print('validation',report['ok'],'files',len(results));return report['ok']
if __name__=='__main__':
 if sys.argv[1:] == ['generate']:generate();sys.exit(0 if validate() else 1)
 if sys.argv[1:] == ['validate']:sys.exit(0 if validate() else 1)
 print('Usage: python generate.py generate|validate');sys.exit(2)
