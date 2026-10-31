"""CPU OpenCV crop processing. One JSON request on stdin, one JSON response on stdout."""
import os
os.environ.setdefault('OMP_NUM_THREADS', '1')
import base64, json, sys
import cv2
import numpy as np
from scipy.ndimage import distance_transform_edt
cv2.setNumThreads(1)

def decode(value):
    raw = base64.b64decode(value.split(',')[-1], validate=True)
    image = cv2.imdecode(np.frombuffer(raw, np.uint8), cv2.IMREAD_UNCHANGED)
    if image is None: raise ValueError('Не вдалося відкрити зображення')
    return image

def png(image):
    ok, data = cv2.imencode('.png', image)
    if not ok: raise ValueError('Помилка PNG')
    return 'data:image/png;base64,' + base64.b64encode(data).decode('ascii')

def border_model(image, box):
    """Robust affine background estimate from a ring outside the requested element."""
    h,w = image.shape[:2]; x,y,bw,bh = box
    yy,xx = np.mgrid[:h,:w]
    pad=max(10,int(min(bw,bh)*.3))
    outer=(xx>=max(0,x-pad))&(xx<min(w,x+bw+pad))&(yy>=max(0,y-pad))&(yy<min(h,y+bh+pad))
    ring = outer & ((xx < x) | (xx >= x+bw) | (yy < y) | (yy >= y+bh))
    if np.count_nonzero(ring) < 20:
        ring[:2,:] = True; ring[-2:,:] = True; ring[:,:2] = True; ring[:,-2:] = True
    samples = np.flatnonzero(ring)
    samples = samples[::max(1,len(samples)//6000)]
    design = np.column_stack([np.ones(h*w),xx.ravel()/max(w,1),yy.ravel()/max(h,1)]).astype(np.float32)
    values = image.reshape(-1,3).astype(np.float32)
    keep = np.ones(len(samples),bool)
    for _ in range(4):
        coeff = np.linalg.lstsq(design[samples[keep]],values[samples[keep]],rcond=None)[0]
        residual = np.linalg.norm(values[samples]-design[samples]@coeff,axis=1)
        threshold = max(10,float(np.percentile(residual,70)))
        keep = residual <= threshold
    field = np.clip(design@coeff,0,255).reshape(h,w,3).astype(np.float32)
    noise = float(np.median(np.linalg.norm(values[samples[keep]]-field.reshape(-1,3)[samples[keep]],axis=1)))
    return field,noise

def clean_components(mask, min_area):
    n,labels,stats,_ = cv2.connectedComponentsWithStats(mask.astype(np.uint8),8)
    output = np.zeros(mask.shape,np.uint8)
    for i in range(1,n):
        if stats[i,cv2.CC_STAT_AREA] >= min_area: output[labels==i] = 1
    return output

def segment(request):
    original=decode(request['image'])
    if original.ndim!=3: original=cv2.cvtColor(original,cv2.COLOR_GRAY2BGRA)
    source_alpha=original[:,:,3] if original.shape[2]==4 else np.full(original.shape[:2],255,np.uint8)
    image=original[:,:,:3];h,w=image.shape[:2]
    box=request.get('box',[2,2,w-4,h-4]);x,y,bw,bh=[int(v) for v in box]
    x=max(0,min(w-1,x));y=max(0,min(h-1,y));bw=max(1,min(w-x,bw));bh=max(1,min(h-y,bh));box=[x,y,bw,bh]
    allowed=np.zeros((h,w),np.uint8);allowed[y:y+bh,x:x+bw]=1
    bg,noise=border_model(image,box)
    gray=cv2.cvtColor(image,cv2.COLOR_BGR2GRAY).astype(np.float32)
    bg_gray=cv2.cvtColor(bg.astype(np.uint8),cv2.COLOR_BGR2GRAY).astype(np.float32)
    mode=request.get('mode','auto')
    residual=np.linalg.norm(image.astype(np.float32)-bg,axis=2)/np.sqrt(3)
    light=gray-bg_gray;dark=bg_gray-gray
    if mode=='auto':
        hi=float(np.percentile(light[allowed>0],92));lo=float(np.percentile(dark[allowed>0],92))
        median=float(np.median(bg_gray))
        mode='light' if hi>max(24,lo*1.45) and median<170 else ('dark' if lo>max(24,hi*1.45) and median>90 else 'multicolor')
    diff=light if mode=='light' else dark if mode=='dark' else residual
    noise_limit=max(7,min(28,noise*0.7))
    clipped=np.clip(diff[allowed>0],0,255).astype(np.uint8)
    otsu,_=cv2.threshold(clipped,0,255,cv2.THRESH_BINARY+cv2.THRESH_OTSU)
    threshold=max(noise_limit,min(80,float(otsu)*0.65))
    hard=((diff>threshold)&(allowed>0)&(source_alpha>0)).astype(np.uint8)
    hard=clean_components(hard,max(2,int(bw*bh*0.00003)))
    warnings=[]
    region_hard=hard[y:y+bh,x:x+bw]
    if np.any(region_hard[0]) or np.any(region_hard[-1]) or np.any(region_hard[:,0]) or np.any(region_hard[:,-1]):
        warnings.append('Виділення торкається рамки: перевірте, чи не обрізано край; за потреби розширте область.')
    if mode in ('multicolor','grabcut','emblem') and np.count_nonzero(hard)>5:
        gc=np.full((h,w),cv2.GC_BGD,np.uint8)
        gc[allowed>0]=cv2.GC_PR_BGD
        gc[(allowed>0)&(diff>threshold*.6)]=cv2.GC_PR_FGD
        sure=cv2.erode(hard,np.ones((3,3),np.uint8))
        if not np.any(sure):sure=hard
        gc[sure>0]=cv2.GC_FGD
        try:
            cv2.grabCut(image,gc,None,np.zeros((1,65)),np.zeros((1,65)),4,cv2.GC_INIT_WITH_MASK)
            hard=((gc==cv2.GC_FGD)|(gc==cv2.GC_PR_FGD)).astype(np.uint8)*allowed
            hard=clean_components(hard,max(2,int(bw*bh*.00003)))
        except cv2.error:
            warnings.append('GrabCut не зміг уточнити маску; використано колірний контраст.')
    if mode=='emblem':
        contours,_=cv2.findContours(hard,cv2.RETR_EXTERNAL,cv2.CHAIN_APPROX_SIMPLE)
        filled=np.zeros_like(hard);cv2.drawContours(filled,contours,-1,1,cv2.FILLED);hard=filled*allowed
        warnings.append('Режим суцільної емблеми зберігає внутрішні білі деталі; для літер з отворами оберіть інший режим.')
    if not np.any(hard):raise ValueError('Контрастного елемента не знайдено. Оберіть інший режим або уточніть область.')
    # Include mixed JPEG/antialiased edge pixels, but preserve holes and disconnected letters.
    support=cv2.dilate(hard,np.ones((3,3),np.uint8))*allowed
    core=cv2.erode(hard,np.ones((3,3),np.uint8))
    if not np.any(core):core=hard.copy()
    # Estimate nearby unmixed foreground colors; estimate hidden background with Telea.
    _,nearest=distance_transform_edt(core==0,return_indices=True)
    foreground=image[nearest[0],nearest[1]].astype(np.float32)
    repair=cv2.dilate(hard,np.ones((5,5),np.uint8))
    estimated_bg=cv2.inpaint(image,(repair*255).astype(np.uint8),3,cv2.INPAINT_TELEA).astype(np.float32)
    if noise<12:estimated_bg=bg
    vector=foreground-estimated_bg
    alpha=np.sum((image.astype(np.float32)-estimated_bg)*vector,axis=2)/np.maximum(20,np.sum(vector*vector,axis=2))
    alpha=np.clip(alpha,0,1)*support
    # Keep opaque interiors; solve foreground colors only at genuinely mixed boundaries.
    alpha[core>0]=1
    alpha[alpha<0.035]=0;alpha[alpha>0.98]=1
    unmixed=(image.astype(np.float32)-(1-alpha[:,:,None])*estimated_bg)/np.maximum(alpha[:,:,None],0.08)
    # Low-alpha estimates are ill-conditioned; use the nearest known foreground color.
    blend=np.clip((alpha-.12)/.35,0,1)[:,:,None]
    unmixed=np.clip(unmixed*blend+foreground*(1-blend),0,255).astype(np.uint8)
    opaque=(alpha>=.98);unmixed[opaque]=image[opaque]
    # Brush additions outside the inferred matte must use real source pixels.
    unmixed[alpha==0]=image[alpha==0]
    matte=np.round(alpha*255).astype(np.uint8)
    rgba=np.dstack([unmixed,np.full((h,w),255,np.uint8)])
    coverage=float(np.count_nonzero(matte)/max(1,bw*bh))
    if coverage>.8:warnings.append('Виділено понад 80% області: перевірте, чи не потрапив фон.')
    if noise>18:warnings.append('Неоднорідний фон: перевірте дрібні краї та отвори на світлому й темному прев’ю.')
    if min(bw,bh)<25:warnings.append('Малий елемент: початковий растр обмежує точність деталей.')
    return {'foreground':png(rgba),'mask':png(matte),'mode':mode,'warnings':warnings,'metrics':{'coverage':round(coverage,3),'backgroundVariation':round(noise,1),'threshold':round(threshold,1)}}

def restore(request):
    original=decode(request['image']);image=original[:,:,:3]
    mask=decode(request['mask']);mask=mask[:,:,0] if mask.ndim==3 else mask
    if mask.shape!=image.shape[:2]:raise ValueError('Розміри маски не збігаються')
    binary=(mask>0).astype(np.uint8)*255
    if not np.any(binary) or np.all(binary):raise ValueError('Потрібні маска та видимий навколишній фон')
    mode=request.get('mode','telea')
    filled=cv2.inpaint(image,binary,3,cv2.INPAINT_NS if mode=='ns' else cv2.INPAINT_TELEA)
    if mode=='gradient':
        yy,xx=np.where(binary>0);box=[int(xx.min()),int(yy.min()),int(xx.max()-xx.min()+1),int(yy.max()-yy.min()+1)]
        field,_=border_model(image,box);filled[binary>0]=np.round(field[binary>0]).astype(np.uint8)
    if original.shape[2]==4:filled=np.dstack([filled,original[:,:,3]])
    filled[binary==0]=original[binary==0]
    return {'image':png(filled),'method':mode}

def palette(request):
    import io,hashlib
    from pypdf import PdfReader
    from PIL import Image,ImageCms
    raw=base64.b64decode(request['file'],validate=True)
    if not raw.startswith(b'%PDF-'):raise ValueError('Підтримується лише PDF-сумісний Illustrator/PDF із векторними прямокутними зразками.')
    reader=PdfReader(io.BytesIO(raw),strict=False)
    if len(reader.pages)>4:raise ValueError('Завелика таблиця палітри')
    colors=[];profile_name=None
    for page_number,page in enumerate(reader.pages):
        resources=page.get('/Resources',{}).get_object();spaces=resources.get('/ColorSpace',{}).get_object() if '/ColorSpace' in resources else {}
        transforms={}
        for key,entry in spaces.items():
            entry=entry.get_object()
            if isinstance(entry,(list,tuple)) or hasattr(entry,'__getitem__'):
                try:
                    if str(entry[0])=='/ICCBased':
                        profile=ImageCms.ImageCmsProfile(io.BytesIO(entry[1].get_object().get_data()))
                        channels=int(entry[1].get_object().get('/N',0));mode='CMYK' if channels==4 else 'RGB'
                        transforms[str(key)]=(ImageCms.buildTransformFromOpenProfiles(profile,ImageCms.createProfile('sRGB'),mode,'RGB'),mode,ImageCms.getProfileName(profile).strip())
                except Exception:pass
        space='/DeviceGray';value=[0];rect=None
        operations=page.get_contents().operations
        if len(operations)>50000:raise ValueError('Надто складна PDF-палітра')
        for args,op in operations:
            if op==b'cs':space=str(args[0])
            elif op in (b'scn',b'sc'):value=[float(v) for v in args]
            elif op==b'k':space='/DeviceCMYK';value=[float(v) for v in args]
            elif op==b'rg':space='/DeviceRGB';value=[float(v) for v in args]
            elif op==b'g':space='/DeviceGray';value=[float(args[0])]
            elif op==b're':rect=[float(v) for v in args]
            elif op in (b'f',b'f*',b'B',b'B*') and rect:
                x,y,w,h=rect;rect=None
                if abs(w)<2 or abs(h)<2:continue
                cmyk=None;profile=None
                if space in transforms:
                    transform,mode,profile=transforms[space]
                    if len(value)!=(4 if mode=='CMYK' else 3):continue
                    rgb=ImageCms.applyTransform(Image.new(mode,(1,1),tuple(round(max(0,min(1,v))*255) for v in value)),transform).getpixel((0,0))
                    if mode=='CMYK':cmyk=dict(zip(['c','m','y','k'],[round(v*100,3) for v in value]))
                    profile_name=profile
                elif space=='/DeviceRGB' and len(value)==3:rgb=tuple(round(v*255) for v in value)
                elif space=='/DeviceCMYK' and len(value)==4:
                    c,m,yellow,k=value;rgb=tuple(round(255*(1-v)*(1-k)) for v in (c,m,yellow));cmyk=dict(zip(['c','m','y','k'],[round(v*100,3) for v in value]))
                else:continue
                colors.append({'hex':'#%02X%02X%02X'%rgb,'cmyk':cmyk,'profile':profile,'page':page_number+1,'x':min(x,x+w),'y':max(y,y+h),'width':abs(w),'height':abs(h)})
    if not colors:raise ValueError('Не знайдено підтримуваних векторних зразків; експортуйте палітру в CSV.')
    colors.sort(key=lambda c:(c['page'],-round(c['y'],1),c['x']))
    row=0;last=None;column=0
    for color in colors:
        key=(color['page'],round(color['y'],1))
        if key!=last:row+=1;column=0;last=key
        column+=1;color['name']=f'Ряд {row:02d} · зразок {column:02d}'
    return {'colors':colors,'source':{'format':'PDF-compatible Illustrator/PDF','sha256':hashlib.sha256(raw).hexdigest(),'profile':profile_name,'count':len(colors)}}

def main():
    request=json.load(sys.stdin)
    if request.get('op')=='segment':result=segment(request)
    elif request.get('op')=='restore':result=restore(request)
    elif request.get('op')=='palette':result=palette(request)
    else:raise ValueError('Невідома CV-операція')
    json.dump(result,sys.stdout,ensure_ascii=False)
if __name__=='__main__':
    try:main()
    except Exception as error:
        json.dump({'error':str(error)},sys.stdout,ensure_ascii=False);sys.exit(1)
