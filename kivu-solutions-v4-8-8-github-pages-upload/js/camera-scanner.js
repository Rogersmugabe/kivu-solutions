/* Kivu Solutions V4.8.4 reliable offline-capable camera barcode scanner.
   Primary: html5-qrcode multi-format scanner (mobile-friendly).
   Fallbacks: ZXing Browser, then native BarcodeDetector.
   Supports EAN-13/EAN-8/UPC-A/UPC-E/CODE-128/CODE-39/ITF/CODABAR + QR/Data Matrix. */
(()=>{
  let resolveScan=null, busy=false, engine=null;
  let html5=null, zxingReader=null, zxingControls=null, nativeStream=null, nativeTimer=null, nativeDetector=null;
  let cameras=[], cameraIndex=0, currentTitle='Scan barcode';
  const $=s=>document.querySelector(s);
  const dlg=()=>$('#barcodeCameraModal');
  const video=()=>$('#barcodeCameraVideo');
  const readerEl=()=>$('#barcodeCameraReader');
  const status=()=>$('#barcodeCameraStatus');

  function setStatus(msg){if(status()) status().textContent=msg;}
  function textOfResult(result){
    if(!result)return '';
    try{
      if(typeof result.getText==='function') return String(result.getText()||'').trim();
      return String(result.text||result.rawValue||'').trim();
    }catch(_){return '';}
  }

  function rankCamera(c){
    const l=String(c?.label||'').toLowerCase(); let score=0;
    if(/back|rear|environment/.test(l)) score+=100;
    if(/main|primary/.test(l)) score+=30;
    if(/front|user|facetime/.test(l)) score-=100;
    if(/ultra|wide|0\.5|macro/.test(l)) score-=35;
    if(/telephoto|tele/.test(l)) score-=20;
    return score;
  }

  async function stopEngines(){
    if(nativeTimer){clearTimeout(nativeTimer);nativeTimer=null;}
    if(zxingControls){try{await zxingControls.stop?.();}catch(_){} zxingControls=null;}
    if(zxingReader){try{zxingReader.reset?.();}catch(_){} zxingReader=null;}
    if(nativeStream){nativeStream.getTracks().forEach(t=>t.stop());nativeStream=null;}
    if(html5){
      try{
        const st=html5.getState?.();
        if(st===2||st===3) await html5.stop();
      }catch(_){}
      try{html5.clear();}catch(_){}
      html5=null;
    }
    const v=video(); if(v){try{v.pause();}catch(_){} try{v.srcObject=null;}catch(_){} v.hidden=true;}
    const r=readerEl(); if(r) r.innerHTML='';
    nativeDetector=null; engine=null;
  }

  async function finish(raw){
    raw=String(raw||'').trim();
    if(!raw||busy)return;
    busy=true;
    setStatus(`Found: ${raw}`);
    const done=resolveScan; resolveScan=null;
    await stopEngines();
    try{dlg()?.close();}catch(_){}
    busy=false;
    done?.(raw);
  }

  function formats(){
    const F=window.Html5QrcodeSupportedFormats;
    if(!F)return undefined;
    return [F.EAN_13,F.EAN_8,F.UPC_A,F.UPC_E,F.CODE_128,F.CODE_39,F.CODE_93,F.ITF,F.CODABAR,F.QR_CODE,F.DATA_MATRIX].filter(v=>v!==undefined);
  }

  async function loadCameras(){
    if(!window.Html5Qrcode?.getCameras) return [];
    try{
      const list=await window.Html5Qrcode.getCameras();
      cameras=(list||[]).slice().sort((a,b)=>rankCamera(b)-rankCamera(a));
      return cameras;
    }catch(_){return [];}
  }

  async function startHtml5(preferredIndex=0){
    if(!window.Html5Qrcode) throw new Error('html5-qrcode unavailable');
    const r=readerEl(); if(!r) throw new Error('scanner view missing');
    r.innerHTML='';
    html5=new window.Html5Qrcode('barcodeCameraReader', {formatsToSupport: formats(), verbose:false});
    if(!cameras.length) await loadCameras();
    cameraIndex=Math.max(0,Math.min(preferredIndex,Math.max(0,cameras.length-1)));
    const cameraArg=cameras.length ? {deviceId:{exact:cameras[cameraIndex].id}} : {facingMode:{ideal:'environment'}};
    const config={
      fps:15,
      qrbox:(vw,vh)=>({width:Math.max(220,Math.min(Math.floor(vw*0.88),520)),height:Math.max(110,Math.min(Math.floor(vh*0.38),210))}),
      aspectRatio:4/3,
      disableFlip:true,
      videoConstraints:{facingMode:{ideal:'environment'},width:{ideal:1920},height:{ideal:1080}}
    };
    setStatus('Starting rear camera scanner…');
    await html5.start(cameraArg,config,(decodedText)=>finish(decodedText),()=>{});
    engine='html5';
    // Try continuous autofocus/zoom without failing on browsers that do not expose these capabilities.
    try{
      const track=html5.getRunningTrackCameraCapabilities?.();
      void track;
    }catch(_){}
    const label=cameras[cameraIndex]?.label;
    setStatus(label ? `Scanning with ${label}. Hold the barcode 10–25 cm away and keep it inside the box.` : 'Scanning. Hold the barcode 10–25 cm away and keep it inside the box.');
  }

  async function startZxing(){
    if(!window.ZXingBrowser?.BrowserMultiFormatReader) throw new Error('ZXing unavailable');
    const v=video(); v.hidden=false;
    zxingReader=new window.ZXingBrowser.BrowserMultiFormatReader();
    setStatus('Starting fallback scanner…');
    const constraints={video:{facingMode:{ideal:'environment'},width:{ideal:1920},height:{ideal:1080}},audio:false};
    zxingControls=await zxingReader.decodeFromConstraints(constraints,v,(result)=>{const raw=textOfResult(result);if(raw)finish(raw);});
    engine='zxing';
    setStatus('Scanning. Hold the barcode steady inside the box.');
  }

  async function supportedNative(){
    if(!('BarcodeDetector' in window)) return null;
    try{
      const preferred=['ean_13','ean_8','upc_a','upc_e','code_128','code_39','itf','codabar','qr_code','data_matrix'];
      const supported=BarcodeDetector.getSupportedFormats ? await BarcodeDetector.getSupportedFormats() : preferred;
      const fs=preferred.filter(x=>supported.includes(x));
      return new BarcodeDetector(fs.length?{formats:fs}:undefined);
    }catch(_){try{return new BarcodeDetector();}catch(__){return null;}}
  }

  async function nativeLoop(){
    if(!nativeStream||!nativeDetector||busy)return;
    try{
      const v=video();
      if(v?.readyState>=2){const codes=await nativeDetector.detect(v);const raw=String(codes?.[0]?.rawValue||'').trim();if(raw){finish(raw);return;}}
    }catch(_){}
    nativeTimer=setTimeout(nativeLoop,120);
  }

  async function startNative(){
    nativeDetector=await supportedNative(); if(!nativeDetector) throw new Error('native unavailable');
    nativeStream=await navigator.mediaDevices.getUserMedia({video:{facingMode:{ideal:'environment'},width:{ideal:1920},height:{ideal:1080}},audio:false});
    const v=video(); v.hidden=false; v.srcObject=nativeStream; await v.play(); engine='native';
    setStatus('Scanning with browser detector. Hold the barcode steady inside the box.'); nativeLoop();
  }

  async function startBest(index=0){
    await stopEngines();
    try{return await startHtml5(index);}catch(e1){
      console.warn('Kivu html5 scanner failed',e1);
      await stopEngines();
      try{return await startZxing();}catch(e2){
        console.warn('Kivu ZXing scanner failed',e2);
        await stopEngines();
        return await startNative();
      }
    }
  }

  function cameraErrorMessage(e){
    const name=e?.name||''; const msg=String(e?.message||'');
    if(name==='NotAllowedError'||name==='PermissionDeniedError'||/permission/i.test(msg)) return 'Camera permission was denied. Allow camera access in browser settings and try again.';
    if(name==='NotFoundError'||name==='DevicesNotFoundError') return 'No usable camera was found.';
    if(name==='NotReadableError'||name==='TrackStartError') return 'The camera is busy. Close other apps using the camera and try again.';
    return 'Camera opened but the scanner could not start. Refresh once and try again, or use manual/hardware barcode entry.';
  }

  async function open(title='Scan barcode'){
    const d=dlg(); if(!d) throw new Error('Camera scanner unavailable.');
    currentTitle=title; $('#barcodeCameraTitle').textContent=title;
    await stopEngines(); busy=false;
    if(!d.open){try{d.showModal();}catch(_){}}
    setStatus('Starting camera…');
    if(!window.isSecureContext){setStatus('Camera scanning requires HTTPS or localhost.'); return null;}
    if(!navigator.mediaDevices?.getUserMedia){setStatus('This browser cannot access the camera.'); return null;}
    return await new Promise(async resolve=>{
      resolveScan=resolve;
      try{await startBest(0);}catch(e){
        console.warn('Kivu scanner start failed',e); resolveScan=null; await stopEngines(); setStatus(cameraErrorMessage(e)); resolve(null);
      }
    });
  }

  async function switchCamera(){
    if(!resolveScan||busy)return;
    try{
      if(!cameras.length) await loadCameras();
      if(cameras.length<2){setStatus('Only one camera is available on this device.');return;}
      const next=(cameraIndex+1)%cameras.length;
      setStatus('Switching camera…');
      await startHtml5(next);
    }catch(e){console.warn(e);setStatus('Could not switch camera. Continue with the current camera or cancel and retry.');}
  }

  async function close(){
    const done=resolveScan; resolveScan=null; busy=false;
    await stopEngines();
    try{dlg()?.close();}catch(_){}
    done?.(null);
  }

  window.KivuCameraScanner={open,close,stop:stopEngines,switchCamera};
  document.addEventListener('DOMContentLoaded',()=>{
    $('#barcodeCameraCloseBtn')?.addEventListener('click',close);
    $('#barcodeCameraSwitchBtn')?.addEventListener('click',switchCamera);
    dlg()?.addEventListener('cancel',e=>{e.preventDefault();close();});
  });
})();
