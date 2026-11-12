# Calcula el recorte del avatar (av / av2 en tienda.js) para que la cara entre entera en el círculo de 44 px.
# Edita BOX con el recuadro de la cara (x0, x1, y0, y1; fracciones de la imagen) de cada skin calma y enojada.
# Uso (desde la carpeta del juego):  python3 herramientas/ajustar-avatares.py            → solo muestra los valores
#                                    python3 herramientas/ajustar-avatares.py aplicar    → los escribe en tienda.js
import json,re,subprocess,sys
R=''
ch=json.loads(subprocess.check_output(['node','-e','global.window={};require("./'+R+'tienda.js");console.log(JSON.stringify(window.TIENDA.ch))']).decode())
BOX={ # id: (calmo bbox, enojado bbox)
 'tio':((.27,.82,.15,.50),(.30,.80,.08,.48)),
 'tia':((.13,.80,.13,.50),(.31,.74,.12,.46)),
 'conejo':((.10,.84,.18,.52),(.25,.80,.20,.54)),
 'conejita':((.22,.85,.25,.56),(.22,.82,.25,.58)),
 'bigotes':((.12,.80,.17,.50),(.22,.82,.18,.52)),
 'tios':((.17,.88,.10,.49),(.17,.88,.12,.50)),
 'galactico':((.10,.82,.17,.54),(.25,.80,.26,.58)),
 'millonario':((.05,.78,.22,.55),(.10,.85,.22,.60)),
}
DIA=44; FIT_D=45
def fit(b,asp):
    x0,x1,y0,y1=b
    import math
    w=FIT_D/math.hypot(x1-x0,(y1-y0)*asp)          # la caja de la cara debe caber en el círculo: se ajusta por la diagonal, no por los lados
    fx=(x0+x1)/2; fy=(y0+y1)/2-1.5/(w*asp)   # la cara baja ~1,5 px para no chocar con la corona
    return dict(w=round(w),fx=round(fx,3),fy=round(fy,3))
res={}
for c in ch:
    if c['id'] not in BOX: continue
    a=fit(BOX[c['id']][0],c['asp']); b=fit(BOX[c['id']][1],c['asp2'])
    res[c['id']]=(a,b); print(c['id'],a,b)
if len(sys.argv)>1 and sys.argv[1]=='aplicar':
    s=open(R+'tienda.js',encoding='utf-8').read()
    for cid,(a,b) in res.items():
        i=s.index("id: '"+cid+"'"); j=s.index("av: {",i); k=s.index("av2: {",j); e=s.index("}",k)
        fmt=lambda d:'{ w: %d, fx: %s, fy: %s }'%(d['w'],('%.3f'%d['fx']).rstrip('0').lstrip('0'),('%.3f'%d['fy']).rstrip('0').lstrip('0'))
        s=s[:j]+'av: '+fmt(a)+', av2: '+fmt(b)+s[e+1:]
    open(R+'tienda.js','w',encoding='utf-8').write(s)
    print('aplicado')
