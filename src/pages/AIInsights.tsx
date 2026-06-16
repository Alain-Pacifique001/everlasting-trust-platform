import { useState, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Sparkles, Send, Brain, Wallet, TrendingUp, Mic, MicOff, Paperclip, X, FileText, Image as ImageIcon, Volume2, Square } from 'lucide-react';
import { toast } from 'sonner';
import ReactMarkdown from 'react-markdown';

interface Attachment {
  id: string;
  kind: 'image' | 'pdf';
  name: string;
  preview?: string; // data URL for images
  imageData?: string; // base64 data URL for sending
  text?: string; // extracted PDF text
}

interface Message {
  role: 'user' | 'assistant';
  content: any; // string or multimodal array
  display?: string; // what to render in UI for user msgs
  attachments?: Attachment[];
}

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const ANON = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

const SUGGESTION_ICONS = [Wallet, TrendingUp, Brain, Sparkles];
const SUGGESTION_KEYS = ['budget', 'diversification', 'strategy', 'risks'] as const;

const readJson = <T,>(key: string, fallback: T): T => {
  try { const v = localStorage.getItem(key); return v ? JSON.parse(v) : fallback; } catch { return fallback; }
};

const fileToDataUrl = (file: File) => new Promise<string>((res, rej) => {
  const r = new FileReader();
  r.onload = () => res(r.result as string);
  r.onerror = rej;
  r.readAsDataURL(file);
});

const extractPdfText = async (file: File): Promise<string> => {
  const pdfjs: any = await import('pdfjs-dist');
  // Use CDN worker to avoid bundling complexity
  pdfjs.GlobalWorkerOptions.workerSrc = `https://cdn.jsdelivr.net/npm/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;
  const buf = await file.arrayBuffer();
  const doc = await pdfjs.getDocument({ data: buf }).promise;
  let out = '';
  const max = Math.min(doc.numPages, 20);
  for (let i = 1; i <= max; i++) {
    const page = await doc.getPage(i);
    const tc = await page.getTextContent();
    out += tc.items.map((it: any) => it.str).join(' ') + '\n\n';
  }
  return out.trim();
};

const AIInsights = () => {
  const { t } = useTranslation();
  const { user } = useAuth();
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [portfolio, setPortfolio] = useState<any[]>([]);
  const [pendingFiles, setPendingFiles] = useState<Attachment[]>([]);
  const [listening, setListening] = useState(false);
  const [speakingIdx, setSpeakingIdx] = useState<number | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const recognitionRef = useRef<any>(null);

  // Stop any ongoing speech when leaving the page
  useEffect(() => () => { window.speechSynthesis?.cancel(); }, []);

  const stripMarkdown = (md: string) =>
    md
      .replace(/```[\s\S]*?```/g, '')
      .replace(/`([^`]+)`/g, '$1')
      .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
      .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
      .replace(/[*_~#>]+/g, '')
      .replace(/\n{2,}/g, '. ')
      .replace(/\s+/g, ' ')
      .trim();

  const speak = (idx: number, text: string) => {
    if (!('speechSynthesis' in window)) {
      toast.error(t('aiInsights.ttsUnsupported'));
      return;
    }
    if (speakingIdx === idx) {
      window.speechSynthesis.cancel();
      setSpeakingIdx(null);
      return;
    }
    window.speechSynthesis.cancel();
    const utter = new SpeechSynthesisUtterance(stripMarkdown(text));
    utter.rate = 1;
    utter.pitch = 1;
    utter.lang = navigator.language || 'en-US';
    utter.onend = () => setSpeakingIdx(s => (s === idx ? null : s));
    utter.onerror = () => setSpeakingIdx(s => (s === idx ? null : s));
    setSpeakingIdx(idx);
    window.speechSynthesis.speak(utter);
  };

  useEffect(() => {
    if (!user) return;
    supabase.from('holdings').select('symbol,name,shares,avg_price,asset_type').then(({ data }) => {
      setPortfolio(data ?? []);
    });
  }, [user]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages]);

  const buildFinanceSnapshot = () => {
    const expenses = readJson<any[]>('savvy_expenses', []);
    const budgets = readJson<any[]>('savvy_budgets', []);
    const goals = readJson<any[]>('savvy_savings', []);
    const totalIncome = expenses.filter(e => e.type === 'income').reduce((s, e) => s + Number(e.amount || 0), 0);
    const totalExpense = expenses.filter(e => e.type === 'expense').reduce((s, e) => s + Number(e.amount || 0), 0);
    return {
      monthly_income: totalIncome,
      monthly_spending: totalExpense,
      net_cashflow: totalIncome - totalExpense,
      recent_transactions: expenses.slice(-10),
      budgets,
      savings_goals: goals,
    };
  };

  const handleFiles = async (files: FileList | null) => {
    if (!files) return;
    for (const file of Array.from(files)) {
      if (file.size > 10 * 1024 * 1024) {
        toast.error(t('aiInsights.tooLarge', { name: file.name }));
        continue;
      }
      const id = crypto.randomUUID();
      try {
        if (file.type.startsWith('image/')) {
          const data = await fileToDataUrl(file);
          setPendingFiles(p => [...p, { id, kind: 'image', name: file.name, preview: data, imageData: data }]);
        } else if (file.type === 'application/pdf') {
          toast.info(t('aiInsights.reading', { name: file.name }));
          const text = await extractPdfText(file);
          if (!text) { toast.error(t('aiInsights.pdfFailed')); continue; }
          setPendingFiles(p => [...p, { id, kind: 'pdf', name: file.name, text: text.slice(0, 30000) }]);
        } else {
          toast.error(t('aiInsights.unsupportedType', { type: file.type || 'unknown' }));
        }
      } catch (err) {
        console.error(err);
        toast.error(t('aiInsights.processFailed', { name: file.name }));
      }
    }
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const toggleVoice = () => {
    const SR: any = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) {
      toast.error(t('aiInsights.voiceUnsupported'));
      return;
    }
    if (listening) {
      recognitionRef.current?.stop();
      return;
    }
    const rec = new SR();
    rec.continuous = false;
    rec.interimResults = true;
    rec.lang = navigator.language || 'en-US';
    rec.onstart = () => setListening(true);
    rec.onend = () => setListening(false);
    rec.onerror = (e: any) => {
      setListening(false);
      if (e.error !== 'aborted') toast.error(t('aiInsights.voiceError', { error: e.error }));
    };
    rec.onresult = (e: any) => {
      let transcript = '';
      for (let i = 0; i < e.results.length; i++) transcript += e.results[i][0].transcript;
      setInput(transcript);
    };
    recognitionRef.current = rec;
    rec.start();
  };

  const send = async (text: string) => {
    if ((!text.trim() && pendingFiles.length === 0) || loading) return;

    const attachments = pendingFiles;
    const displayText = text.trim() || (attachments.length ? t('aiInsights.attachedFiles') : '');

    // Build multimodal content for the API
    const parts: any[] = [];
    let combinedText = text.trim();
    const pdfs = attachments.filter(a => a.kind === 'pdf');
    if (pdfs.length) {
      combinedText += '\n\n--- Attached document content ---\n' +
        pdfs.map(p => `[${p.name}]\n${p.text}`).join('\n\n');
    }
    if (combinedText) parts.push({ type: 'text', text: combinedText });
    for (const a of attachments.filter(a => a.kind === 'image')) {
      parts.push({ type: 'image_url', image_url: { url: a.imageData! } });
    }

    const apiMessages = [
      ...messages.map(m => ({ role: m.role, content: m.content })),
      { role: 'user' as const, content: parts.length > 1 || parts.some(p => p.type === 'image_url') ? parts : combinedText },
    ];

    const newMessages: Message[] = [
      ...messages,
      { role: 'user', content: parts, display: displayText, attachments },
    ];
    setMessages(newMessages);
    setInput('');
    setPendingFiles([]);
    setLoading(true);

    try {
      const r = await fetch(`${SUPABASE_URL}/functions/v1/ai-insights`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', apikey: ANON, Authorization: `Bearer ${ANON}` },
        body: JSON.stringify({ messages: apiMessages, portfolio, finance: buildFinanceSnapshot() }),
      });

      if (!r.ok) {
        const err = await r.json().catch(() => ({}));
        toast.error(err.error ?? t('aiInsights.requestFailed'));
        setLoading(false);
        return;
      }

      const reader = r.body?.getReader();
      const decoder = new TextDecoder();
      let assistant = '';
      let buffer = '';
      setMessages(m => [...m, { role: 'assistant', content: '' }]);

      while (reader) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        let idx: number;
        while ((idx = buffer.indexOf('\n')) !== -1) {
          let line = buffer.slice(0, idx);
          buffer = buffer.slice(idx + 1);
          if (line.endsWith('\r')) line = line.slice(0, -1);
          if (!line.startsWith('data: ')) continue;
          const data = line.slice(6).trim();
          if (data === '[DONE]') continue;
          try {
            const parsed = JSON.parse(data);
            const delta = parsed.choices?.[0]?.delta?.content;
            if (delta) {
              assistant += delta;
              setMessages(m => {
                const copy = [...m];
                copy[copy.length - 1] = { role: 'assistant', content: assistant };
                return copy;
              });
            }
          } catch {
            buffer = line + '\n' + buffer;
            break;
          }
        }
      }
    } catch (e) {
      toast.error(t('aiInsights.connectionError'));
    } finally {
      setLoading(false);
    }
  };

  const renderUserMessage = (m: Message) => (
    <div className="space-y-2">
      {m.attachments && m.attachments.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {m.attachments.map(a => a.kind === 'image' ? (
            <img key={a.id} src={a.preview} alt={a.name} className="max-h-40 rounded border border-primary-foreground/20" />
          ) : (
            <div key={a.id} className="flex items-center gap-2 bg-primary-foreground/10 rounded px-2 py-1 text-xs">
              <FileText className="w-3.5 h-3.5" />
              <span className="truncate max-w-[180px]">{a.name}</span>
            </div>
          ))}
        </div>
      )}
      {m.display && <p className="whitespace-pre-wrap">{m.display}</p>}
    </div>
  );

  return (
    <div className="p-6 flex flex-col h-[calc(100vh-3rem)] max-w-4xl mx-auto">
      <div className="flex items-center gap-3 mb-4">
        <div className="p-2 rounded-lg bg-gradient-to-br from-primary to-accent">
          <Sparkles className="w-6 h-6 text-primary-foreground" />
        </div>
        <div>
          <h1 className="text-2xl font-bold">{t('aiInsights.title')}</h1>
          <p className="text-sm text-muted-foreground">
            {t('aiInsights.subtitle', { count: portfolio.length })}
          </p>
        </div>
      </div>

      <Card className="flex-1 flex flex-col overflow-hidden">
        <CardContent className="flex-1 overflow-y-auto p-4 space-y-4" ref={scrollRef}>
          {messages.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-center space-y-4">
              <div className="p-3 rounded-full bg-accent">
                <Sparkles className="w-10 h-10 text-accent-foreground" />
              </div>
              <p className="text-muted-foreground max-w-md">
                {t('aiInsights.empty')}
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-w-lg w-full">
                {SUGGESTION_KEYS.map((key, i) => {
                  const Icon = SUGGESTION_ICONS[i];
                  const text = t(`aiInsights.suggestions.${key}`);
                  return (
                    <Button key={key} variant="outline" size="sm"
                      className="text-left justify-start h-auto py-2 gap-2"
                      onClick={() => send(text)}>
                      <Icon className="w-4 h-4 shrink-0 text-primary" />
                      <span className="text-xs">{text}</span>
                    </Button>
                  );
                })}
              </div>
            </div>
          ) : (
            messages.map((m, i) => (
              <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[85%] rounded-lg px-4 py-2 ${
                  m.role === 'user' ? 'bg-primary text-primary-foreground' : 'bg-muted'
                }`}>
                  {m.role === 'assistant' ? (
                    <div className="space-y-1">
                      <div className="prose prose-sm dark:prose-invert max-w-none prose-p:my-1 prose-ul:my-1 prose-headings:my-2">
                        <ReactMarkdown>{(m.content as string) || (loading && i === messages.length - 1 ? '...' : '')}</ReactMarkdown>
                      </div>
                      {typeof m.content === 'string' && (m.content as string).trim() && !(loading && i === messages.length - 1) && (
                        <button
                          onClick={() => speak(i, m.content as string)}
                          className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors mt-1"
                          title={speakingIdx === i ? t('aiInsights.stop') : t('aiInsights.readAloud')}
                        >
                          {speakingIdx === i ? <Square className="w-3 h-3 fill-current" /> : <Volume2 className="w-3 h-3" />}
                          {speakingIdx === i ? t('aiInsights.stop') : t('aiInsights.listen')}
                        </button>
                      )}
                    </div>
                  ) : (
                    renderUserMessage(m)
                  )}
                </div>
              </div>
            ))
          )}
        </CardContent>

        {/* Pending attachments preview */}
        {pendingFiles.length > 0 && (
          <div className="border-t border-border px-3 pt-2 flex flex-wrap gap-2">
            {pendingFiles.map(a => (
              <div key={a.id} className="relative group bg-muted rounded p-1 flex items-center gap-2 text-xs pr-6">
                {a.kind === 'image' ? (
                  <img src={a.preview} alt={a.name} className="h-10 w-10 object-cover rounded" />
                ) : (
                  <FileText className="w-4 h-4 ml-1" />
                )}
                <span className="truncate max-w-[140px]">{a.name}</span>
                <button
                  onClick={() => setPendingFiles(p => p.filter(x => x.id !== a.id))}
                  className="absolute top-0 right-0 p-0.5 rounded-full bg-background/80 hover:bg-destructive hover:text-destructive-foreground"
                >
                  <X className="w-3 h-3" />
                </button>
              </div>
            ))}
          </div>
        )}

        <div className="border-t border-border p-3 flex gap-2 items-center">
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*,application/pdf"
            multiple
            className="hidden"
            onChange={e => handleFiles(e.target.files)}
          />
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={() => fileInputRef.current?.click()}
            disabled={loading}
            title={t('aiInsights.attach')}
          >
            <Paperclip className="w-4 h-4" />
          </Button>
          <Button
            type="button"
            variant={listening ? 'destructive' : 'ghost'}
            size="icon"
            onClick={toggleVoice}
            disabled={loading}
            title={listening ? t('aiInsights.stopVoice') : t('aiInsights.startVoice')}
          >
            {listening ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
          </Button>
          <Input
            placeholder={listening ? t('aiInsights.listening') : t('aiInsights.placeholder')}
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && send(input)}
            disabled={loading}
          />
          <Button onClick={() => send(input)} disabled={loading || (!input.trim() && pendingFiles.length === 0)}>
            <Send className="w-4 h-4" />
          </Button>
        </div>
      </Card>
    </div>
  );
};

export default AIInsights;
