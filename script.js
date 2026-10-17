import { pipeline, env } from "https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.5.2";
import { shades } from "./shades.js";
const $=id=>document.getElementById(id);
const photoInput=$("photoInput"),uploadZone=$("uploadZone"),canvas=$("resultCanvas"),ctx=canvas.getContext("2d",{willReadFrequently:true});
let sourceImage=null,selectedShade=shades[0],wallShade=shades[0],ceilingShade=shades[0],currentMood="all",visibleShadeCount=10,segmenter=null,wallMask=null,ceilingMask=null,activeSurface="walls",toastTimer=null,originalCanvas=null,previewEnabled=false,maskEditMode="erase",isMaskPainting=false;
function toast(msg){$("toast").textContent=msg;$("toast").classList.add("show");clearTimeout(toastTimer);toastTimer=setTimeout(()=>$("toast").classList.remove("show"),3200)}
function status(msg){$("aiStatusText").textContent=msg}
function hexRgb(hex){return [parseInt(hex.slice(1,3),16),parseInt(hex.slice(3,5),16),parseInt(hex.slice(5,7),16)]}
function applyShade(shade){
  selectedShade=shade;
  if(activeSurface==="walls"||activeSurface==="both") wallShade=shade;
  if(activeSurface==="ceiling"||activeSurface==="both") ceilingShade=shade;
  updateSelected();
  if(sourceImage && (wallMask||ceilingMask)){
    previewEnabled=true;
    paintPreview();
    $("previewStatus").textContent="SHADE PREVIEW";
    toast(`${shade.name} applied to ${activeSurface==="ceiling"?"the ceiling":activeSurface==="both"?"walls and ceiling":"the walls"}.`);
  } else {
    toast("Shade selected. Upload a photo and detect surfaces to preview it.");
  }
  renderShades();
}
function renderShades(){const grid=$("shadeGrid");grid.innerHTML="";const q=($("shadeSearch")?.value||"").trim().toLowerCase();const filtered=shades.filter(s=>(currentMood==="all"||s.mood===currentMood)&&(!q||s.name.toLowerCase().includes(q)||s.code.toLowerCase().includes(q)));const shown=filtered.slice(0,visibleShadeCount);if($("shadeCount"))$("shadeCount").textContent=`Showing ${shown.length} of ${filtered.length} matching shades`;const loadMore=$("loadMoreShadesBtn");if(loadMore)loadMore.hidden=shown.length>=filtered.length;if(!filtered.length){grid.innerHTML="<p class=\"no-shades\">No shades match that search. Try another name or code.</p>";return;}shown.forEach(shade=>{const card=document.createElement("article");card.className="shade-card"+(shade.code===selectedShade.code?" selected":"");const select=document.createElement("button");select.type="button";select.className="shade-select-button";select.innerHTML=`<div class="shade-chip" style="background:${shade.hex}"></div><strong>${shade.name}</strong><small>${shade.code}</small>`;select.addEventListener("click",()=>applyShade(shade));card.append(select);grid.appendChild(card)})}

function setMaskMode(mode){
  maskEditMode=mode;
  $("eraseModeBtn").classList.toggle("active",mode==="erase");
  $("addModeBtn").classList.toggle("active",mode==="add");
  $("eraseModeBtn").setAttribute("aria-pressed",String(mode==="erase"));
  $("addModeBtn").setAttribute("aria-pressed",String(mode==="add"));
}
$("eraseModeBtn").addEventListener("click",()=>setMaskMode("erase"));
$("addModeBtn").addEventListener("click",()=>setMaskMode("add"));
$("brushSize").addEventListener("input",e=>$("brushSizeValue").textContent=`${e.target.value} px`);
function editMaskAt(event){
  if((!wallMask&&!ceilingMask)||!isMaskPainting)return;
  const rect=canvas.getBoundingClientRect();
  const px=(event.clientX-rect.left)*canvas.width/rect.width;
  const py=(event.clientY-rect.top)*canvas.height/rect.height;
  const radius=Number($("brushSize").value)/2*(canvas.width/rect.width);
  const targetMasks=activeSurface==="walls"?[wallMask]:activeSurface==="ceiling"?[ceilingMask]:[wallMask,ceilingMask];
  const referenceMask=targetMasks.find(Boolean);if(!referenceMask)return;
  const sx=referenceMask.width/canvas.width,sy=referenceMask.height/canvas.height;
  const cx=px*sx,cy=py*sy,rx=Math.max(1,radius*sx),ry=Math.max(1,radius*sy);
  const minX=Math.max(0,Math.floor(cx-rx)),maxX=Math.min(wallMask.width-1,Math.ceil(cx+rx));
  const minY=Math.max(0,Math.floor(cy-ry)),maxY=Math.min(wallMask.height-1,Math.ceil(cy+ry));
  const value=maskEditMode==="add"?1:0;
  for(let y=minY;y<=maxY;y++)for(let x=minX;x<=maxX;x++){
    const dx=(x-cx)/rx,dy=(y-cy)/ry;
    if(dx*dx+dy*dy<=1)wallMask.data[y*wallMask.width+x]=value;
  }
  paintPreview();
}
canvas.addEventListener("pointerdown",e=>{if(!wallMask||$("maskTools").hidden)return;isMaskPainting=true;if(canvas.setPointerCapture)canvas.setPointerCapture(e.pointerId);editMaskAt(e);});
canvas.addEventListener("pointermove",e=>editMaskAt(e));
canvas.addEventListener("pointerup",()=>{isMaskPainting=false;});
canvas.addEventListener("pointercancel",()=>{isMaskPainting=false;});
function updateSelected(){$("selectedSwatch").style.background=selectedShade.hex;$("selectedName").textContent=selectedShade.name;$("selectedCode").textContent=`Book of Colours 2015 · ${selectedShade.code}`;document.querySelector(".tag-swatch").style.background=selectedShade.hex;renderShades()}
function setImage(img){sourceImage=img;wallMask=null;ceilingMask=null;previewEnabled=false;$("maskTools").hidden=true;canvas.classList.remove("mask-editing");$("recommendationBox").hidden=true;$("emptyState").hidden=true;canvas.hidden=false;$("previewTip").hidden=false;$("previewStatus").textContent="PHOTO LOADED";$("detectBtn").disabled=false;paintOriginal();status("Photo ready. Click “Detect walls with AI” to start segmentation.");}
function fitGeometry(img){const cw=canvas.width,ch=canvas.height,scale=Math.min(cw/img.naturalWidth,ch/img.naturalHeight),w=img.naturalWidth*scale,h=img.naturalHeight*scale;return{x:(cw-w)/2,y:(ch-h)/2,w,h,scale}}
function paintOriginal(){if(!sourceImage)return;const frame=$("previewFrame");const maxW=1000,maxH=700,scale=Math.min(maxW/sourceImage.naturalWidth,maxH/sourceImage.naturalHeight,1);canvas.width=Math.round(sourceImage.naturalWidth*scale);canvas.height=Math.round(sourceImage.naturalHeight*scale);ctx.clearRect(0,0,canvas.width,canvas.height);ctx.drawImage(sourceImage,0,0,canvas.width,canvas.height);originalCanvas=document.createElement("canvas");originalCanvas.width=canvas.width;originalCanvas.height=canvas.height;originalCanvas.getContext("2d").drawImage(sourceImage,0,0,canvas.width,canvas.height);canvas.style.width="100%";canvas.style.height="100%";canvas.style.objectFit="contain";if(wallMask)paintPreview()}
function refineMask(raw,width,height){
  // Light 3x3 blur at the model's mask resolution reduces staircase edges
  // without broadly expanding the detected wall into nearby furniture.
  const smooth=new Float32Array(raw.length);
  const weights=[1,2,1,2,4,2,1,2,1];
  for(let y=0;y<height;y++){
    for(let x=0;x<width;x++){
      let sum=0,weightSum=0,k=0;
      for(let dy=-1;dy<=1;dy++){
        const yy=Math.max(0,Math.min(height-1,y+dy));
        for(let dx=-1;dx<=1;dx++,k++){
          const xx=Math.max(0,Math.min(width-1,x+dx));
          const wt=weights[k],v=raw[yy*width+xx];
          sum+=v*wt;weightSum+=wt;
        }
      }
      smooth[y*width+x]=sum/weightSum;
    }
  }
  return smooth;
}
function sampleMaskBilinear(mask,mw,mh,x,y){
  const fx=Math.max(0,Math.min(mw-1,(x+.5)*mw/canvas.width-.5));
  const fy=Math.max(0,Math.min(mh-1,(y+.5)*mh/canvas.height-.5));
  const x0=Math.floor(fx),y0=Math.floor(fy),x1=Math.min(mw-1,x0+1),y1=Math.min(mh-1,y0+1);
  const tx=fx-x0,ty=fy-y0;
  const top=mask[y0*mw+x0]*(1-tx)+mask[y0*mw+x1]*tx;
  const bottom=mask[y1*mw+x0]*(1-tx)+mask[y1*mw+x1]*tx;
  return top*(1-ty)+bottom*ty;
}
function recommendShadesFallback(){
  if(!originalCanvas)return;
  const sampleCtx=originalCanvas.getContext("2d",{willReadFrequently:true});
  const data=sampleCtx.getImageData(0,0,originalCanvas.width,originalCanvas.height).data;
  let total=0,count=0;
  // Sample every 20th pixel to estimate overall photo brightness cheaply.
  for(let i=0;i<data.length;i+=80){
    total+=(0.2126*data[i]+0.7152*data[i+1]+0.0722*data[i+2]);
    count++;
  }
  const brightness=count?total/count:128;
  let picks,reason;
  if(brightness<95){
    picks=["Pure Ivory","Snowflake","Natural Linen"];
    reason="This photo looks relatively dim. Light, soft shades are a useful starting point because they can help a room feel brighter.";
  }else if(brightness>175){
    picks=["Biscuit","Mint Ice","Light Sky"];
    reason="This photo looks bright. Gentle neutrals and muted colours are good options to compare in the room's lighting.";
  }else{
    picks=["Moonlight","Snowflake","Olive Oil"];
    reason="The photo has mid-range overall brightness. These versatile neutrals and soft greens are suggested starting points.";
  }
  const chosen=picks.map(name=>shades.find(s=>s.name===name)).filter(Boolean);
  $("recommendationReason").textContent=reason+" This is a lighting-based suggestion, not a guaranteed perfect match.";
  const container=$("recommendationShades");container.innerHTML="";
  chosen.forEach(shade=>{
    const card=document.createElement("div");
    card.className="recommendation-shade-card";
    const button=document.createElement("button");
    button.type="button";button.className="recommendation-shade";
    button.innerHTML=`<div class="recommendation-chip" style="background:${shade.hex}"></div><strong>${shade.name}</strong><small>${shade.code} · catalogue</small>`;
    button.addEventListener("click",()=>applyShade(shade));
    card.append(button);container.appendChild(card);
  });
  $("recommendationBox").hidden=false;
}



function paintPreview(){
  if(!sourceImage||!originalCanvas)return;
  ctx.clearRect(0,0,canvas.width,canvas.height);
  ctx.drawImage(originalCanvas,0,0);
  if((!wallMask&&!ceilingMask)||!previewEnabled){
    $("previewStatus").textContent=wallMask||ceilingMask?"SURFACES DETECTED":"PHOTO LOADED";
    return;
  }
  const imageData=ctx.getImageData(0,0,canvas.width,canvas.height),pixels=imageData.data;
  const overlays=[];
  if((activeSurface==="walls"||activeSurface==="both")&&wallMask)overlays.push([wallMask,wallShade]);
  if((activeSurface==="ceiling"||activeSurface==="both")&&ceilingMask)overlays.push([ceilingMask,ceilingShade]);
  for(const [maskObj,shade] of overlays){
    const mask=maskObj.data,mw=maskObj.width,mh=maskObj.height,[r,g,b]=hexRgb(shade.hex);
    for(let y=0;y<canvas.height;y++)for(let x=0;x<canvas.width;x++){
      let m=sampleMaskBilinear(mask,mw,mh,x,y);
      m=Math.max(0,Math.min(1,(m-.16)/.68));m=m*m*(3-2*m);
      if(m>.005){const i=(y*canvas.width+x)*4,a=Math.min(.78,m*.72);
        pixels[i]=pixels[i]*(1-a)+r*a;pixels[i+1]=pixels[i+1]*(1-a)+g*a;pixels[i+2]=pixels[i+2]*(1-a)+b*a;}
    }
  }
  ctx.putImageData(imageData,0,0);
  $("previewStatus").textContent=activeSurface==="both"?"WALLS + CEILING COLOURED":activeSurface==="ceiling"?"CEILING COLOURED":"WALLS COLOURED";
}
function setSurface(mode){
  activeSurface=mode;
  for(const [id,value] of [["wallsModeBtn","walls"],["ceilingModeBtn","ceiling"],["bothModeBtn","both"]]){
    $(id).classList.toggle("active",mode===value);$(id).setAttribute("aria-pressed",String(mode===value));
  }
  $("surfaceNote").textContent=mode==="walls"?"Catalogue shades apply to walls. Ceiling colour stays independent.":mode==="ceiling"?"Catalogue shades apply to the ceiling. Wall colour stays independent.":"Catalogue shades apply to both surfaces.";
  if(wallMask||ceilingMask){previewEnabled=true;paintPreview();}
}
$("wallsModeBtn").addEventListener("click",()=>setSurface("walls"));
$("ceilingModeBtn").addEventListener("click",()=>setSurface("ceiling"));
$("bothModeBtn").addEventListener("click",()=>setSurface("both"));
async function getSegmenter(){if(segmenter)return segmenter;status("Loading the AI model… the first download may take a little while.");$("detectBtn").disabled=true;try{env.allowLocalModels=false;env.useBrowserCache=true;segmenter=await pipeline("image-segmentation","Xenova/segformer-b0-finetuned-ade-512-512",{device:"wasm"});return segmenter}catch(e){segmenter=null;throw e}finally{$("detectBtn").disabled=!sourceImage}}
function loadFile(file){
  if(!file)return;
  if(!file.type.startsWith("image/")){toast("Please select a JPG, PNG or WEBP image.");photoInput.value="";return;}
  const url=URL.createObjectURL(file),img=new Image();
  img.onload=()=>{setImage(img);URL.revokeObjectURL(url);photoInput.value="";};
  img.onerror=()=>{URL.revokeObjectURL(url);photoInput.value="";toast("Couldn't load that image. Try a JPG or PNG photo.");};
  img.src=url;
}
// Robust upload handling: explicitly open the file picker and handle both
// a newly selected file and re-selecting the same file.
uploadZone.addEventListener("click",e=>{
  if(e.target===photoInput)return;
  e.preventDefault();
  photoInput.click();
});
photoInput.addEventListener("change",e=>{
  const file=e.target.files&&e.target.files[0];
  if(file)loadFile(file);
});
["dragenter","dragover"].forEach(t=>uploadZone.addEventListener(t,e=>{e.preventDefault();uploadZone.classList.add("dragging")}));
["dragleave","drop"].forEach(t=>uploadZone.addEventListener(t,e=>{e.preventDefault();uploadZone.classList.remove("dragging")}));
uploadZone.addEventListener("drop",e=>loadFile(e.dataTransfer.files[0]));
$("useDemoBtn").addEventListener("click",()=>{const img=new Image();img.onload=()=>{setImage(img);$("previewStatus").textContent="SAMPLE ROOM";toast("Sample room loaded. Now detect its walls with AI.")};img.onerror=()=>{toast("Sample room image could not load. Check the image URL.");console.error("Failed to load sample room image:",img.src)};img.src="/sample-room.png"});
$("detectBtn").addEventListener("click",async()=>{
  if(!sourceImage)return toast("Upload a room photo first.");
  $("detectBtn").disabled=true;
  $("detectBtn").textContent="AI is detecting…";
  try{
    const model=await getSegmenter();
    status("Analysing the photo for wall and ceiling regions…");
    const inputCanvas=document.createElement("canvas");
    inputCanvas.width=sourceImage.naturalWidth;
    inputCanvas.height=sourceImage.naturalHeight;
    inputCanvas.getContext("2d").drawImage(sourceImage,0,0);
    const results=await model(inputCanvas);
    const wallResults=results.filter(r=>String(r.label).toLowerCase().includes("wall"));
    const ceilingResults=results.filter(r=>String(r.label).toLowerCase().includes("ceiling"));
    if(!wallResults.length&&!ceilingResults.length){
      wallMask=null;ceilingMask=null;previewEnabled=false;paintOriginal();
      $("maskTools").hidden=true;
      status("The model didn't identify wall or ceiling regions in this photo. Try a clearer, well-lit photo.");
      toast("No wall or ceiling regions detected. Try another photo.");
      return;
    }
    const toUnit=value=>value>1?value/255:value;
    const combineResults=items=>{
      if(!items.length)return null;
      const w=items[0].mask.width,h=items[0].mask.height,combined=new Float32Array(w*h);
      for(const item of items){const m=item.mask.data;for(let i=0;i<combined.length;i++){const value=toUnit(m[i]);if(value>combined[i])combined[i]=value;}}
      return {data:refineMask(combined,w,h),width:w,height:h};
    };
    // Keep the model's wall and ceiling classes as separate masks. Do not subtract
    // ceiling pixels from the wall mask globally; users can choose which surface to paint.
    wallMask=combineResults(wallResults);
    ceilingMask=combineResults(ceilingResults);
    previewEnabled=true;
    $("maskTools").hidden=false;
    canvas.classList.add("mask-editing");
    paintPreview();
    const selectedMask=activeSurface==="walls"?wallMask:activeSurface==="ceiling"?ceilingMask:(wallMask||ceilingMask);
    const countMask=selectedMask||wallMask||ceilingMask;
    const detectedPixels=countMask.data.reduce((sum,value)=>sum+(value>=0.5?1:0),0);
    const wallPercent=Math.round(detectedPixels/countMask.data.length*100);
    const imageData=originalCanvas.getContext("2d",{willReadFrequently:true}).getImageData(0,0,originalCanvas.width,originalCanvas.height).data;
    let brightnessTotal=0,brightnessCount=0;for(let i=0;i<imageData.length;i+=160){brightnessTotal+=0.2126*imageData[i]+0.7152*imageData[i+1]+0.0722*imageData[i+2];brightnessCount++;}
    recommendShadesFallback();
    status(`Detected ${wallResults.length?"wall regions":"no wall regions"} and ${ceilingResults.length?"ceiling regions":"no ceiling regions"}. Choose a surface mode and review the boundaries.`);
    toast("Wall and ceiling detection finished. Review the edges, then choose colours.");
    $("previewTip").textContent="AI-detected surfaces · separate wall and ceiling masks · review before painting";
  }catch(err){
    console.error(err);
    status("AI processing failed. Check the browser console for the exact error; network errors may mean the model could not download.");
    toast("AI failed. See the status message and browser console for details.");
  }finally{
    $("detectBtn").disabled=!sourceImage;
    $("detectBtn").textContent="✦ Detect walls & ceiling with AI";
  }
});
document.querySelectorAll(".mood-tab").forEach(b=>b.addEventListener("click",()=>{currentMood=b.dataset.mood;visibleShadeCount=10;document.querySelectorAll(".mood-tab").forEach(x=>x.classList.toggle("active",x===b));renderShades()}));
$("shadeSearch")?.addEventListener("input",()=>{visibleShadeCount=10;renderShades()});
$("loadMoreShadesBtn")?.addEventListener("click",()=>{visibleShadeCount+=10;renderShades()});
$("resetBtn").addEventListener("click",()=>{sourceImage=null;wallMask=null;ceilingMask=null;originalCanvas=null;previewEnabled=false;$("maskTools").hidden=true;canvas.classList.remove("mask-editing");$("recommendationBox").hidden=true;photoInput.value="";ctx.clearRect(0,0,canvas.width,canvas.height);canvas.hidden=true;$("emptyState").hidden=false;$("previewTip").hidden=true;$("previewStatus").textContent="NO PHOTO";$("detectBtn").disabled=true;status("AI model loads when you first detect walls.");toast("Preview reset.")});
$("copyShadeBtn").addEventListener("click",async()=>{const details=`${selectedShade.name} — ${selectedShade.code} — ${selectedShade.hex} (listed in the uploaded Book of Colours 2015; digital HEX is an approximate preview, not an official calibrated value)`;try{await navigator.clipboard.writeText(details);toast("Shade details copied.")}catch{toast(details)}});

// Asian Paints-only nearby store finder. Server queries official Asian Paints locator pages.
function setStoreStatus(message) { const el = $('storeStatus'); if (el) el.textContent = message; }
function makeLink(url, text, className = '') {
  const a = document.createElement('a'); a.href = url; a.target = '_blank'; a.rel = 'noopener noreferrer'; a.textContent = text;
  if (className) a.className = className;
  return a;
}
function storeCard(store) {
  const card = document.createElement('article'); card.className = 'store-result';
  const title = document.createElement('strong'); title.textContent = store.name;
  const address = document.createElement('p'); address.textContent = store.address || 'Address shown by the official store locator';
  const distance = document.createElement('p'); distance.className = 'store-distance'; distance.textContent = `${store.distanceKm.toFixed(1)} km away`;
  const actions = document.createElement('div'); actions.className = 'store-actions';
  if (store.phone) actions.append(makeLink(`tel:${store.phone}`, 'Call'));
  if (store.website) actions.append(makeLink(store.website, 'Website'));
  // Always open Google Maps' directions view for this specific store.
  // Do not reuse locator/map links, which may open a general map or store page.
  const destinationText = [store.name, store.address].filter(Boolean).join(', ');
  const directionsUrl = new URL('https://www.google.com/maps/dir/');
  directionsUrl.searchParams.set('api', '1');
  directionsUrl.searchParams.set('destination', destinationText);
  directionsUrl.searchParams.set('travelmode', 'driving');
  actions.append(makeLink(directionsUrl.toString(), 'Open directions'));
  card.append(title, address, distance, actions);
  return card;
}
async function findStoresAt(latitude, longitude, label) {
  const results = $('storeResults'); results.replaceChildren();
  setStoreStatus(`Searching official Asian Paints listings within 20 km of ${label}…`);
  try {
    const response = await fetch(`/api/stores?lat=${encodeURIComponent(latitude)}&lon=${encodeURIComponent(longitude)}`);
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Store search failed.');
    if (!data.stores?.length) {
      setStoreStatus(`No store listings with verified distances within 20 km of ${label} were returned. Try the official locator for more results.`);
      results.append(makeLink('https://colourideas-dealers-nearme.asianpaints.com/', 'Search official Asian Paints stores', 'store-fallback-link'));
      return;
    }
    data.stores.forEach(store => results.append(storeCard(store)));
    setStoreStatus(`${data.stores.length} Asian Paints store listing${data.stores.length === 1 ? '' : 's'} found within 20 km of ${label}.`);
  } catch (error) {
    setStoreStatus(error.message || 'Could not load nearby stores. Please try again.');
    results.append(makeLink('https://colourideas-dealers-nearme.asianpaints.com/', 'Search official Asian Paints stores', 'store-fallback-link'));
  }
}
$('useLocationBtn')?.addEventListener('click', () => {
  if (!navigator.geolocation) { setStoreStatus('Location detection is not supported by this browser. Try the official store locator instead.'); return; }
  setStoreStatus('Requesting permission to use your current location…');
  navigator.geolocation.getCurrentPosition(position => {
    const { latitude, longitude } = position.coords;
    findStoresAt(latitude, longitude, 'your location');
  }, error => {
    setStoreStatus(error.code === 1 ? 'Location permission was denied. Allow location access or use the official locator.' : 'Could not detect your location. Try again or use the official locator.');
  }, { enableHighAccuracy: false, timeout: 12000, maximumAge: 300000 });
});
updateSelected();


// Built-in shade assistant: deterministic, catalogue-based guidance with no external AI/API.
function addChatMessage(text, role="assistant") {
  const item=document.createElement("div"); item.className=`chat-message ${role==="user"?"user-message":"assistant-message"}`; item.textContent=text;
  $("chatTranscript").appendChild(item); $("chatTranscript").scrollTop=$("chatTranscript").scrollHeight;
}
function answerShadeQuestion(raw) {
  const q=raw.toLowerCase();
  let mood=null, reason="Based on your description, here are a few catalogue shades worth trying in your room.";
  if(/calm|peace|relax|sleep|bedroom|serene|sooth/.test(q)){mood="neutral";reason="For a calm, restful room, start with soft neutrals or gentle greens; test them in both daylight and evening light.";}
  else if(/nature|green|plant|fresh|natural/.test(q)){mood="green";reason="For a nature-inspired feel, compare muted greens with a warm neutral so the room stays balanced.";}
  else if(/bold|bright|statement|energy|lively|colourful|colorful|kids|play/.test(q)){mood="bold";reason="For a more expressive room, try a statement shade on one wall and keep the other surfaces lighter.";}
  else if(/small|dark|dim|lighten|brighter|tiny/.test(q)){mood="neutral";reason="For a small or dim room, lighter neutrals are a useful starting point. Lighting and finish also affect the result.";}
  else if(/warm|beige|cream|wood|brown|sofa/.test(q)){mood="neutral";reason="Warm whites and beige shades often pair comfortably with wood and brown furnishings; compare undertones before choosing.";}
  else if(/blue|cool|coastal|fresh/.test(q)){mood="green";reason="For a fresh, cool feeling, compare gentle greens and pale neutrals from the catalogue; use the shade search to explore blues too.";}
  const filtered=shades.filter(s=>!mood||s.mood===mood);
  const chosen=(filtered.length?filtered:shades).slice(0,3);
  if(!chosen.length)return "I couldn't find catalogue shades to suggest. Try searching the colour catalogue by name or code.";
  const list=chosen.map(s=>`${s.name} (${s.code})`).join(", ");
  return `${reason} Try: ${list}. Select a shade in the catalogue to preview it on your detected wall. These are built-in suggestions, not a trained conversational AI, and screen colours are approximate.`;
}
$("shadeChatForm")?.addEventListener("submit",e=>{e.preventDefault();const input=$("shadeChatInput");const message=input.value.trim();if(!message)return;addChatMessage(message,"user");addChatMessage(answerShadeQuestion(message));input.value="";});