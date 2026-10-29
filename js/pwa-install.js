// Optional browser installation prompt. Does not affect POS, login or sales.
(() => {
  const bar = document.getElementById('pwaInstallBar');
  const action = document.getElementById('pwaInstallBtn');
  const dismiss = document.getElementById('pwaInstallDismiss');
  const message = document.getElementById('pwaInstallText');
  if (!bar || !action || !dismiss || !message) return;
  let promptEvent = null;
  const isStandalone = () => window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
  const onIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const dismissed = () => sessionStorage.getItem('kivu-install-dismissed') === 'yes';
  const hide = () => bar.classList.add('hidden');
  const show = () => {};
  dismiss.addEventListener('click', () => { sessionStorage.setItem('kivu-install-dismissed','yes'); hide(); });
  if (isStandalone()) return;
  window.addEventListener('beforeinstallprompt', event => {
    event.preventDefault();
    promptEvent = event;
    message.textContent = 'Install Kivu Solutions on this device.';
    action.textContent = 'Install app';
    show();
  });
  window.addEventListener('appinstalled', () => { promptEvent = null; hide(); });
  if (onIOS) {
    message.textContent = 'On iPhone/iPad, use Safari Share → Add to Home Screen.';
    action.textContent = 'How to install';
    show();
  }
  action.addEventListener('click', async () => {
    if (promptEvent) {
      const event = promptEvent; promptEvent = null;
      try { await event.prompt(); await event.userChoice; } catch (e) { console.warn('Install cancelled:',e); }
      hide();
      return;
    }
    if (onIOS) {
      alert('Open this website in Safari, tap Share, then Add to Home Screen. Open Kivu Solutions from its new icon.');
    } else {
      alert('In Chrome or Edge, open the browser menu and choose Install app or Create shortcut (if supported).');
    }
  });
})();
