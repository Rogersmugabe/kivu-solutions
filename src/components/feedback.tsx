import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from 'react';
import { CheckCircle2, AlertTriangle, Info, XCircle, X } from 'lucide-react';
import { Button, Dialog, Field, Input, cx } from './ui';

/* ---------------------------------- Toasts ---------------------------------- */

type Tone = 'success' | 'error' | 'info' | 'warning';
interface Toast { id: number; tone: Tone; title: string; message?: string }

interface Feedback {
  toast: (tone: Tone, title: string, message?: string) => void;
  confirm: (opts: { title: string; message?: ReactNode; confirmLabel?: string; danger?: boolean }) => Promise<boolean>;
  prompt: (opts: { title: string; label: string; placeholder?: string; confirmLabel?: string; required?: boolean }) => Promise<string | null>;
}

const FeedbackContext = createContext<Feedback | null>(null);

const ICONS = { success: CheckCircle2, error: XCircle, info: Info, warning: AlertTriangle };
const TONES = { success: 'text-emerald-600', error: 'text-red-600', info: 'text-brand-600', warning: 'text-amber-600' };

interface ConfirmState { title: string; message?: ReactNode; confirmLabel?: string; danger?: boolean; resolve: (v: boolean) => void }
interface PromptState { title: string; label: string; placeholder?: string; confirmLabel?: string; required?: boolean; resolve: (v: string | null) => void }

export function FeedbackProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [confirmState, setConfirmState] = useState<ConfirmState | null>(null);
  const [promptState, setPromptState] = useState<PromptState | null>(null);
  const [promptValue, setPromptValue] = useState('');
  const nextId = useRef(1);

  const toast = useCallback((tone: Tone, title: string, message?: string) => {
    const id = nextId.current++;
    setToasts(t => [...t.slice(-3), { id, tone, title, message }]);
    window.setTimeout(() => setToasts(t => t.filter(x => x.id !== id)), tone === 'error' ? 7000 : 4000);
  }, []);

  const confirm = useCallback<Feedback['confirm']>(opts => new Promise(resolve => setConfirmState({ ...opts, resolve })), []);
  const prompt = useCallback<Feedback['prompt']>(opts => new Promise(resolve => { setPromptValue(''); setPromptState({ ...opts, resolve }); }), []);

  const closeConfirm = (v: boolean) => { confirmState?.resolve(v); setConfirmState(null); };
  const closePrompt = (v: string | null) => { promptState?.resolve(v); setPromptState(null); };

  return (
    <FeedbackContext.Provider value={{ toast, confirm, prompt }}>
      {children}

      <div aria-live="polite" className="pointer-events-none fixed inset-x-0 bottom-4 z-[60] flex flex-col items-center gap-2 px-4 sm:bottom-6 sm:right-6 sm:left-auto sm:items-end">
        {toasts.map(t => {
          const Icon = ICONS[t.tone];
          return (
            <div key={t.id} role={t.tone === 'error' ? 'alert' : 'status'} className="pointer-events-auto flex w-full max-w-sm items-start gap-3 rounded-xl border border-zinc-200 bg-white p-3.5 shadow-[var(--shadow-pop)]">
              <Icon className={cx('mt-0.5 size-5 shrink-0', TONES[t.tone])} aria-hidden />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-zinc-900">{t.title}</p>
                {t.message && <p className="mt-0.5 text-[13px] text-zinc-600">{t.message}</p>}
              </div>
              <button type="button" aria-label="Dismiss" onClick={() => setToasts(x => x.filter(y => y.id !== t.id))} className="text-zinc-400 hover:text-zinc-700"><X className="size-4" /></button>
            </div>
          );
        })}
      </div>

      <Dialog
        open={!!confirmState}
        onClose={() => closeConfirm(false)}
        title={confirmState?.title ?? ''}
        size="sm"
        footer={<>
          <Button onClick={() => closeConfirm(false)}>Cancel</Button>
          <Button variant={confirmState?.danger ? 'danger' : 'primary'} onClick={() => closeConfirm(true)} data-autofocus>{confirmState?.confirmLabel ?? 'Confirm'}</Button>
        </>}
      >
        <div className="text-sm text-zinc-600">{confirmState?.message}</div>
      </Dialog>

      <Dialog
        open={!!promptState}
        onClose={() => closePrompt(null)}
        title={promptState?.title ?? ''}
        size="sm"
        footer={<>
          <Button onClick={() => closePrompt(null)}>Cancel</Button>
          <Button variant="primary" disabled={!!promptState?.required && !promptValue.trim()} onClick={() => closePrompt(promptValue.trim())}>{promptState?.confirmLabel ?? 'Continue'}</Button>
        </>}
      >
        <form onSubmit={e => { e.preventDefault(); if (!promptState?.required || promptValue.trim()) closePrompt(promptValue.trim()); }}>
          <Field label={promptState?.label ?? ''}>
            <Input autoFocus value={promptValue} placeholder={promptState?.placeholder} onChange={e => setPromptValue(e.target.value)} />
          </Field>
        </form>
      </Dialog>
    </FeedbackContext.Provider>
  );
}

export function useFeedback(): Feedback {
  const ctx = useContext(FeedbackContext);
  if (!ctx) throw new Error('useFeedback must be used inside <FeedbackProvider>');
  return ctx;
}
