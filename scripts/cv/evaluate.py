"""Generate inspectable outputs from the actual supplied JPEG archive. No visual score is fabricated."""
import argparse,base64,hashlib,json,zipfile
from pathlib import Path
import cv2,numpy as np
from PIL import Image,ImageOps,ImageDraw
from worker import segment,restore,png

def main():
    parser=argparse.ArgumentParser();parser.add_argument('--archive',default='OneDrive_2026-10-30.zip');parser.add_argument('--out',default='artifacts/quality-report');args=parser.parse_args()
    output=Path(args.out);output.mkdir(parents=True,exist_ok=True)
    specs=json.loads(Path('tests/fixtures/client-regions.json').read_text());archive=zipfile.ZipFile(args.archive);names=[n for n in archive.namelist() if n.lower().endswith('.jpg')]
    hashes=[hashlib.sha256(archive.read(n)).hexdigest() for n in names];records=[];rows=[]
    for test,spec in enumerate(specs):
        raw=archive.read(names[spec['index']]);original=cv2.imdecode(np.frombuffer(raw,np.uint8),cv2.IMREAD_COLOR);h,w=original.shape[:2]
        x,y,bw,bh=spec['box'];pad=max(12,round(min(bw,bh)*.12));left=max(0,x-pad);top=max(0,y-pad);right=min(w,x+bw+pad);bottom=min(h,y+bh+pad);crop=original[top:bottom,left:right]
        result=segment({'image':png(crop),'box':[x-left,y-top,bw,bh],'mode':spec['mode']})
        colors=cv2.imdecode(np.frombuffer(base64.b64decode(result['foreground'].split(',')[1]),np.uint8),cv2.IMREAD_UNCHANGED)
        matte=cv2.imdecode(np.frombuffer(base64.b64decode(result['mask'].split(',')[1]),np.uint8),cv2.IMREAD_GRAYSCALE)
        yy,xx=np.where(matte>0);bounds={'x':left+int(xx.min()),'y':top+int(yy.min()),'width':int(xx.max()-xx.min()+1),'height':int(yy.max()-yy.min()+1)}
        layer=colors.copy();layer[:,:,3]=matte;layer=layer[yy.min():yy.max()+1,xx.min():xx.max()+1]
        full_mask=np.zeros((h,w),np.uint8);full_mask[top:bottom,left:right]=matte;repair=cv2.dilate((full_mask>0).astype(np.uint8),cv2.getStructuringElement(cv2.MORPH_ELLIPSE,(5,5)))*255
        filled=restore({'image':png(original),'mask':png(repair),'mode':spec['restore']});background=cv2.imdecode(np.frombuffer(base64.b64decode(filled['image'].split(',')[1]),np.uint8),cv2.IMREAD_COLOR)
        unchanged=bool(np.array_equal(background[repair==0],original[repair==0]));assert unchanged
        folder=output/f'{test:02d}';folder.mkdir(exist_ok=True)
        for name,image in [('source.png',crop),('layer.png',layer),('mask.png',matte),('background.png',background[top:bottom,left:right])]:cv2.imwrite(str(folder/name),image)
        record={**spec,'source':names[spec['index']],'sourceSha256':hashes[spec['index']],'bounds':bounds,'outsideRepairMaskUnchanged':unchanged,'warnings':result['warnings'],'metrics':result['metrics']};records.append(record)
        original_pil=Image.fromarray(cv2.cvtColor(crop,cv2.COLOR_BGR2RGB));layer_pil=Image.fromarray(cv2.cvtColor(layer,cv2.COLOR_BGRA2RGBA));background_pil=Image.fromarray(cv2.cvtColor(background[top:bottom,left:right],cv2.COLOR_BGR2RGB))
        row=Image.new('RGB',(1400,190),'#ddd');d=ImageDraw.Draw(row);d.text((8,4),f'{test:02d}: source {spec["index"]:02d} | {spec["mode"]} | coverage {result["metrics"]["coverage"]}',fill='black')
        previews=[original_pil,Image.alpha_composite(Image.new('RGBA',layer_pil.size,'white'),layer_pil).convert('RGB'),Image.alpha_composite(Image.new('RGBA',layer_pil.size,'#303030'),layer_pil).convert('RGB'),background_pil]
        for col,image in enumerate(previews):
            image=ImageOps.contain(image,(330,150));row.paste(image,(col*350+(350-image.width)//2,30))
        rows.append(row)
    for start in [0,6]:
        subset=rows[start:start+6];sheet=Image.new('RGB',(1400,190*len(subset)),'white')
        for n,row in enumerate(subset):sheet.paste(row,(0,n*190))
        sheet.save(output/f'comparison-{start//6+1}.png')
    report={'sourceFiles':len(names),'uniqueFiles':len(set(hashes)),'regions':records,'note':'Рамки задані вручну для оцінки сегментації окремо від детектора. Ground truth масок клієнт не надав; візуальна якість потребує окремої перевірки.'}
    (output/'results.json').write_text(json.dumps(report,ensure_ascii=False,indent=2))
    links=''.join(f'<tr><td>{i:02d} {r["name"]}</td><td><img src="{i:02d}/source.png"></td><td class="white"><img src="{i:02d}/layer.png"></td><td class="dark"><img src="{i:02d}/layer.png"></td><td><img src="{i:02d}/background.png"></td><td>{" ".join(r["warnings"])}</td></tr>' for i,r in enumerate(records))
    (output/'index.html').write_text('<meta charset="utf-8"><title>MAXSport: quality inspection</title><style>body{font:14px sans-serif}table{width:100%;border-collapse:collapse}td{border:1px solid #bbb;padding:8px}img{max-width:280px;max-height:160px}.white{background:white}.dark{background:#303030}</style><h1>Реальні JPEG: вихідний фрагмент / PNG на білому / PNG на темному / локальний фон</h1><p>11 файлів, 10 унікальних. Візуальна перевірка; числова точність масок не заявляється.</p><table>'+links+'</table>')
    print(json.dumps({'files':len(names),'unique':len(set(hashes)),'regions':len(records),'outsideMaskPreserved':all(r['outsideRepairMaskUnchanged'] for r in records)},ensure_ascii=False))
if __name__=='__main__':main()
