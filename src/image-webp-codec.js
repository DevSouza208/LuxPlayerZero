/** Real WebP output encoded in Workers using jSquash WASM, without Cloudflare Images charges. */
import decodeJpeg,{init as initJpeg} from '@jsquash/jpeg/decode';
import decodePng,{init as initPng} from '@jsquash/png/decode';
import encodeWebp,{init as initWebp} from '@jsquash/webp/encode';
import JPEG_WASM from '../node_modules/@jsquash/jpeg/codec/dec/mozjpeg_dec.wasm';
import PNG_WASM from '../node_modules/@jsquash/png/codec/pkg/squoosh_png_bg.wasm';
import WEBP_WASM from '../node_modules/@jsquash/webp/codec/enc/webp_enc_simd.wasm';
import {IMAGE_BUDGET} from './vod-image-policy.js';

function imageType(bytes){
 const b=new Uint8Array(bytes,0,Math.min(bytes.byteLength,12));
 if(b[0]===255&&b[1]===216&&b[2]===255)return 'jpeg';
 if(b[0]===137&&b[1]===80&&b[2]===78&&b[3]===71)return 'png';
 return null;
}
let jpegReady,pngReady,webpReady;
export async function toWebp(buffer,{quality=78}={}){
 if(!(buffer instanceof ArrayBuffer)||buffer.byteLength<30||buffer.byteLength>IMAGE_BUDGET.maxSourceBytes)throw Error('Imagem fora dos limites.');
 const source=imageType(buffer);
 if(!source)throw Error('Formato de origem nao suportado.');
 let rgba;
 if(source==='jpeg'){
  jpegReady ||=initJpeg(JPEG_WASM);
  await jpegReady;
  rgba=await decodeJpeg(buffer);
 }else{
  pngReady ||=initPng(PNG_WASM);
  await pngReady;
  rgba=await decodePng(buffer);
 }
 if(!rgba||!rgba.width||!rgba.height||rgba.width*rgba.height>IMAGE_BUDGET.maxPixels)throw Error('Dimensoes fora dos limites.');
 webpReady ||=initWebp(WEBP_WASM);
 await webpReady;
 const output=await encodeWebp(rgba,{quality,method:3});
 const bytes=new Uint8Array(output);
 if(bytes.length<24||bytes.length>IMAGE_BUDGET.maxBytesPerImage||
    String.fromCharCode(...bytes.slice(0,4))!=='RIFF'||
    String.fromCharCode(...bytes.slice(8,12))!=='WEBP')throw Error('WebP invalido ou grande demais.');
 return output;
}
