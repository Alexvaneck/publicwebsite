(() => {
  const form = document.querySelector('.contact-form');
  const status = form.querySelector('.contact-status');
  const button = form.querySelector('button[type="submit"]');
  let sending = false;

  form.addEventListener('submit', async event => {
    event.preventDefault();
    if (sending || !form.reportValidity()) return;
    sending = true;
    button.disabled = true;
    status.textContent = 'Uw bericht wordt verstuurd…';

    try {
      const response = await fetch(form.action, {
        method: 'POST',
        body: new FormData(form),
        headers: {Accept: 'application/json'},
        signal: AbortSignal.timeout(30000)
      });
      const result = await response.json();
      if (!response.ok || result.success !== true) {
        throw new Error(result.message || 'Versturen is niet gelukt. Probeer het later opnieuw of mail ons via info@speebeheer.nl.');
      }
      form.reset();
      status.textContent = result.message;
    } catch (error) {
      console.error('IDMB-contactformulier:', error);
      status.textContent = error instanceof Error && error.message.startsWith('Versturen')
        ? error.message
        : 'We konden de verzending niet bevestigen. Uw invoer is bewaard. Probeer het later opnieuw of mail ons via info@speebeheer.nl.';
    } finally {
      sending = false;
      button.disabled = false;
    }
  });
})();
