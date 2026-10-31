/** Keep original file bytes and original pixels separate from the working preview. */
export async function loadSketch(file:File){
  if(!['image/jpeg','image/png'].includes(file.type)||file.size>20*1024*1024)throw new Error('Оберіть JPEG або PNG до 20 МБ.');
  const url=URL.createObjectURL(file);
  try{
    const image=new Image();
    await new Promise<void>((resolve,reject)=>{image.onload=()=>resolve();image.onerror=()=>reject(new Error('Не вдалося відкрити зображення.'));image.src=url;});
    if(!image.naturalWidth||!image.naturalHeight||image.naturalWidth*image.naturalHeight>16_777_216)throw new Error('Максимальний розмір макета — 16,7 мегапікселя.');
    const canvas=document.createElement('canvas');canvas.width=image.naturalWidth;canvas.height=image.naturalHeight;
    const context=canvas.getContext('2d',{willReadFrequently:true});if(!context)throw new Error('Canvas недоступний.');
    context.drawImage(image,0,0);const original=context.getImageData(0,0,canvas.width,canvas.height);
    const scale=Math.min(1,1536/Math.max(canvas.width,canvas.height));let preview=original;
    if(scale<1){canvas.width=Math.max(1,Math.round(image.naturalWidth*scale));canvas.height=Math.max(1,Math.round(image.naturalHeight*scale));context.drawImage(image,0,0,canvas.width,canvas.height);preview=context.getImageData(0,0,canvas.width,canvas.height);}
    return {url,original,preview};
  }catch(error){URL.revokeObjectURL(url);throw error;}
}
