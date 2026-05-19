import { useEffect, useState, useRef } from 'react';

const MIN_RESPONSE_MS = 450;

const sanitizeAction = (value) => value.toString().trim();

const detectDevtools = () => {
  return window.outerWidth - window.innerWidth > 160 || window.outerHeight - window.innerHeight > 160;
};

const useAntiCheat = ({ onAlert } = {}) => {
  const [status, setStatus] = useState('ok');
  const lastGuessTimestamp = useRef(0);
  const attemptCount = useRef(0);

  const registerAttempt = () => {
    const now = performance.now();
    const delta = now - lastGuessTimestamp.current;
    lastGuessTimestamp.current = now;
    attemptCount.current += 1;

    if (delta < MIN_RESPONSE_MS) {
      setStatus('fast');
      onAlert?.('Resposta muito rápida. Possível automação detectada.');
    }

    if (attemptCount.current > 12 && delta < 1200) {
      setStatus('bot');
      onAlert?.('Muitas tentativas em pouco tempo. Bloqueio ativado.');
    }
  };

  useEffect(() => {
    const onKeyDown = (event) => {
      if (event.key === 'F12' || (event.ctrlKey && event.shiftKey && event.key.toLowerCase() === 'i')) {
        setStatus('devtools');
        onAlert?.('DevTools detectado. Alguns recursos podem ser bloqueados.');
      }
    };

    const onResize = () => {
      if (detectDevtools()) {
        setStatus('devtools');
        onAlert?.('DevTools detectado. Alguns recursos podem ser bloqueados.');
      }
    };

    if (navigator.webdriver) {
      setStatus('bot');
      onAlert?.('Navegador automatizado detectado.');
    }

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('resize', onResize);

    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('resize', onResize);
    };
  }, [onAlert]);

  return { status, registerAttempt, sanitizeAction };
};

export default useAntiCheat;
