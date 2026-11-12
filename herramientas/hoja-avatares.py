# Dibuja una hoja con el avatar de cada skin (calma y enojada) tal como se verá en el juego, para revisar que se vea la cara entera.
# Uso (desde la carpeta del juego):  python3 herramientas/hoja-avatares.py [hoja.png]
import json,re,subprocess,sys
from PIL import Image, ImageDraw, ImageFont
R=''
out=subprocess.check_output(['node','-e','global.window={};require("./'+R+'tienda.js");console.log(JSON.stringify(window.TIENDA.ch))']).decode()
ch=json.loads(out)
Z=6; D=44
def tile(img,w,fx,fy,asp):
    im=Image.open(R+img).convert('RGBA')
    W=w; H=w*asp
    im=im.resize((max(1,round(W*Z)),max(1,round(H*Z))),Image.LANCZOS)
    bg=Image.new('RGBA',(D*Z,D*Z),(200,205,215,255))
    left=round((22-fx*w)*Z); top=round((22-fy*w*asp)*Z)
    bg.alpha_composite(im,(left,top)) if left>=0 and top>=0 else bg.paste(im,(left,top),im)
    m=Image.new('L',(D*Z,D*Z),0); ImageDraw.Draw(m).ellipse((0,0,D*Z-1,D*Z-1),fill=255)
    res=Image.new('RGBA',(D*Z,D*Z),(255,255,255,0)); res.paste(bg,(0,0),m)
    # anillo blanco como en el juego
    ImageDraw.Draw(res).ellipse((0,0,D*Z-1,D*Z-1),outline=(255,255,255,255),width=Z*2)
    return res
tiles=[]
for c in ch:
    if not c.get('stat'): continue
    tiles.append((c['id']+' calmo',tile(c['stat'],c['av']['w'],c['av']['fx'],c['av']['fy'],c['asp'])))
    tiles.append((c['id']+' enojado',tile(c['stat2'],c['av2']['w'],c['av2']['fx'],c['av2']['fy'],c['asp2'])))
cols=4; rows=(len(tiles)+cols-1)//cols; pad=24
sheet=Image.new('RGB',(cols*(D*Z+10)+10,rows*(D*Z+pad+10)+10),(255,247,194))
d=ImageDraw.Draw(sheet)
for i,(n,t) in enumerate(tiles):
    x=10+(i%cols)*(D*Z+10); y=10+(i//cols)*(D*Z+pad+10)
    sheet.paste(t,(x,y+pad),t); d.text((x,y+4),n,fill=(0,0,0))
sheet.save(sys.argv[1] if len(sys.argv)>1 else 'hoja-avatares.png'); print(sheet.size,len(tiles))
