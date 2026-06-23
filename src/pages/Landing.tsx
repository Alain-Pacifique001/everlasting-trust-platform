import { Link } from 'react-router-dom';
import { useState } from 'react';
import {
  Sparkles, ShieldCheck, BarChart3, Users, ArrowRight, Building2,
  Target, Eye, Phone, Mail, MessageCircle, CheckCircle2, Lightbulb, LifeBuoy, Send, Loader2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/components/ui/sonner';

const CONTACT_PHONE = '+250 798 254 398';
const CONTACT_PHONE_RAW = '0798254398';
const CONTACT_EMAIL = 'hakizimanaalainpacifique@gmail.com';

const features = [
  { icon: BarChart3, title: 'Finance Intelligence', desc: 'Real-time spend, budgets and forecasts with AI-driven insights.' },
  { icon: Users, title: 'Team Collaboration', desc: 'Live chat, mentions and presence so finance and ops move as one.' },
  { icon: Sparkles, title: 'AI Voice Briefings', desc: 'Daily executive briefings, on demand, in your language.' },
  { icon: ShieldCheck, title: 'Enterprise RBAC', desc: 'Role-based access from CEO to auditor — secure by default.' },
];

const NavLinks = () => (
  <>
    <a href="#home" className="hover:text-foreground transition">Home</a>
    <a href="#about" className="hover:text-foreground transition">About</a>
    <a href="#mission" className="hover:text-foreground transition">Mission & Vision</a>
    <a href="#features" className="hover:text-foreground transition">Features</a>
    <a href="#contact" className="hover:text-foreground transition">Contact</a>
  </>
);

const ContactForm = () => {
  const [category, setCategory] = useState<'idea' | 'support'>('idea');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !email.trim() || !message.trim()) {
      toast.error('Please fill in name, email and message');
      return;
    }
    setSubmitting(true);
    const { error } = await supabase.from('contact_messages').insert({
      name: name.trim(), email: email.trim(), category, subject: subject.trim() || null, message: message.trim(),
    });
    setSubmitting(false);
    if (error) { toast.error(error.message); return; }
    toast.success(category === 'idea' ? 'Thanks for sharing your idea!' : 'Support request received — we will reply soon');
    setName(''); setEmail(''); setSubject(''); setMessage('');
  };

  return (
    <Card className="max-w-3xl mx-auto mt-10">
      <CardContent className="p-6">
        <div className="flex flex-col sm:flex-row gap-2 mb-5">
          <button
            type="button"
            onClick={() => setCategory('idea')}
            className={`flex-1 inline-flex items-center justify-center gap-2 rounded-lg border px-4 py-2 text-sm font-medium transition ${category === 'idea' ? 'bg-primary text-primary-foreground border-primary' : 'border-border hover:bg-muted'}`}
          >
            <Lightbulb className="w-4 h-4" /> Share an idea
          </button>
          <button
            type="button"
            onClick={() => setCategory('support')}
            className={`flex-1 inline-flex items-center justify-center gap-2 rounded-lg border px-4 py-2 text-sm font-medium transition ${category === 'support' ? 'bg-primary text-primary-foreground border-primary' : 'border-border hover:bg-muted'}`}
          >
            <LifeBuoy className="w-4 h-4" /> Request support
          </button>
        </div>
        <form onSubmit={submit} className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="cm-name">Your name</Label>
              <Input id="cm-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={120} required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="cm-email">Email</Label>
              <Input id="cm-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} maxLength={200} required />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="cm-subject">Subject (optional)</Label>
            <Input id="cm-subject" value={subject} onChange={(e) => setSubject(e.target.value)} maxLength={200}
              placeholder={category === 'idea' ? 'Idea title…' : 'What do you need help with?'} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="cm-message">{category === 'idea' ? 'Your idea' : 'Describe the issue'}</Label>
            <Textarea id="cm-message" rows={5} value={message} onChange={(e) => setMessage(e.target.value)} maxLength={4000} required
              placeholder={category === 'idea'
                ? 'Tell us what you would like Savvy AI to do…'
                : 'Share steps to reproduce, screenshots, or any details that help us assist you.'} />
          </div>
          <Button type="submit" className="w-full sm:w-auto" disabled={submitting}>
            {submitting ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Send className="w-4 h-4 mr-2" />}
            {category === 'idea' ? 'Submit idea' : 'Send support request'}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
};

const Landing = () => {
  const { user } = useAuth();
  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b border-border/60 backdrop-blur supports-[backdrop-filter]:bg-background/70 sticky top-0 z-40">
        <div className="container mx-auto flex items-center justify-between px-4 py-3">
          <Link to="/" className="flex items-center gap-2">
            <div className="size-8 rounded-lg bg-gradient-to-br from-primary to-accent grid place-items-center">
              <Building2 className="w-4 h-4 text-primary-foreground" />
            </div>
            <span className="font-bold text-lg bg-gradient-to-r from-primary to-accent-foreground bg-clip-text text-transparent">
              Savvy AI
            </span>
          </Link>
          <nav className="hidden md:flex items-center gap-6 text-sm text-muted-foreground">
            <NavLinks />
          </nav>
          <div className="flex items-center gap-2">
            {user ? (
              <Button asChild size="sm">
                <Link to="/dashboard">Go to dashboard <ArrowRight className="w-4 h-4 ml-1" /></Link>
              </Button>
            ) : (
              <>
                <Button asChild variant="ghost" size="sm">
                  <Link to="/auth">Log in</Link>
                </Button>
                <Button asChild size="sm">
                  <Link to="/auth?mode=signup">Sign up</Link>
                </Button>
              </>
            )}
          </div>
        </div>
      </header>

      {/* HOME / HERO */}
      <section id="home" className="container mx-auto px-4 py-16 md:py-24 text-center">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border bg-accent/40 text-xs mb-6">
          <Sparkles className="w-3 h-3 text-primary" /> AI-powered enterprise operations
        </div>
        <h1 className="text-4xl md:text-6xl font-bold tracking-tight max-w-3xl mx-auto">
          The intelligent operating system for modern finance teams
        </h1>
        <p className="mt-6 text-lg text-muted-foreground max-w-2xl mx-auto">
          Savvy AI unifies finance, HR, collaboration and intelligent automation into one secure platform —
          built for organizations that move fast.
        </p>
        <div className="mt-8 flex flex-col sm:flex-row gap-3 justify-center">
          {user ? (
            <Button asChild size="lg">
              <Link to="/dashboard">Open dashboard <ArrowRight className="w-4 h-4 ml-2" /></Link>
            </Button>
          ) : (
            <>
              <Button asChild size="lg">
                <Link to="/auth?mode=signup">Get started free</Link>
              </Button>
              <Button asChild variant="outline" size="lg">
                <Link to="/auth">Log in</Link>
              </Button>
            </>
          )}
        </div>
      </section>

      {/* ABOUT */}
      <section id="about" className="container mx-auto px-4 py-16 border-t border-border/60">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-10 items-center">
          <div>
            <p className="text-sm font-semibold uppercase tracking-wider text-primary mb-2">About</p>
            <h2 className="text-3xl md:text-4xl font-bold">A modern ERP-lite, powered by AI</h2>
            <p className="mt-4 text-muted-foreground leading-relaxed">
              Savvy AI was built for growing organizations that have outgrown spreadsheets but don't want the
              weight of legacy ERP suites. We blend finance, HR, workflow automation and conversational AI
              into a single, secure workspace — so leaders can decide faster and teams can ship together.
            </p>
            <ul className="mt-6 space-y-2 text-sm">
              {['Multi-tenant by design', 'Role-based access from CEO to auditor', 'Real-time collaboration', 'Audit-friendly logging']
                .map((item) => (
                  <li key={item} className="flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-primary" /> {item}
                  </li>
                ))}
            </ul>
          </div>
          <Card className="bg-gradient-to-br from-primary/10 via-background to-accent/10 border-primary/20">
            <CardContent className="p-8 grid grid-cols-2 gap-6 text-center">
              {[
                { k: '10k+', v: 'Transactions analyzed daily' },
                { k: '99.9%', v: 'Uptime SLA target' },
                { k: '12+', v: 'Enterprise roles supported' },
                { k: '8', v: 'Languages out of the box' },
              ].map((s) => (
                <div key={s.k}>
                  <div className="text-3xl font-bold text-primary">{s.k}</div>
                  <div className="text-xs text-muted-foreground mt-1">{s.v}</div>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      </section>

      {/* MISSION & VISION */}
      <section id="mission" className="container mx-auto px-4 py-16 border-t border-border/60">
        <div className="text-center max-w-2xl mx-auto mb-10">
          <p className="text-sm font-semibold uppercase tracking-wider text-primary mb-2">Our Purpose</p>
          <h2 className="text-3xl md:text-4xl font-bold">Mission & Vision</h2>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <Card>
            <CardContent className="p-8">
              <div className="size-12 rounded-xl bg-primary/10 grid place-items-center mb-4">
                <Target className="w-6 h-6 text-primary" />
              </div>
              <h3 className="text-xl font-semibold">Our Mission</h3>
              <p className="mt-3 text-muted-foreground leading-relaxed">
                Empower every organization — from startups to enterprises — with intelligent, secure and
                accessible operations tools that turn data into decisions and teams into outcomes.
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-8">
              <div className="size-12 rounded-xl bg-accent/30 grid place-items-center mb-4">
                <Eye className="w-6 h-6 text-primary" />
              </div>
              <h3 className="text-xl font-semibold">Our Vision</h3>
              <p className="mt-3 text-muted-foreground leading-relaxed">
                To become Africa's leading AI-powered operations platform, helping organizations
                everywhere run smarter, collaborate better and grow with confidence.
              </p>
            </CardContent>
          </Card>
        </div>
      </section>

      {/* FEATURES */}
      <section id="features" className="container mx-auto px-4 py-16 border-t border-border/60">
        <div className="text-center max-w-2xl mx-auto mb-10">
          <p className="text-sm font-semibold uppercase tracking-wider text-primary mb-2">Platform</p>
          <h2 className="text-3xl md:text-4xl font-bold">Everything your team needs</h2>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {features.map((f) => (
            <Card key={f.title} className="hover:shadow-lg transition">
              <CardContent className="p-6">
                <div className="size-10 rounded-lg bg-primary/10 grid place-items-center mb-4">
                  <f.icon className="w-5 h-5 text-primary" />
                </div>
                <h3 className="font-semibold mb-1">{f.title}</h3>
                <p className="text-sm text-muted-foreground">{f.desc}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      {/* CTA */}
      <section className="container mx-auto px-4 py-16">
        <Card className="bg-gradient-to-br from-primary/10 via-background to-accent/10 border-primary/20">
          <CardContent className="p-8 md:p-12 text-center">
            <h2 className="text-2xl md:text-3xl font-bold">Ready to transform your operations?</h2>
            <p className="mt-3 text-muted-foreground max-w-xl mx-auto">
              Join finance teams using Savvy AI to automate, collaborate, and decide faster.
            </p>
            <div className="mt-6">
              <Button asChild size="lg">
                <Link to={user ? '/dashboard' : '/auth?mode=signup'}>
                  {user ? 'Open dashboard' : 'Start free trial'} <ArrowRight className="w-4 h-4 ml-2" />
                </Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      </section>

      {/* CONTACT & SUPPORT */}
      <section id="contact" className="container mx-auto px-4 py-16 border-t border-border/60">
        <div className="text-center max-w-2xl mx-auto mb-10">
          <p className="text-sm font-semibold uppercase tracking-wider text-primary mb-2">Get in touch</p>
          <h2 className="text-3xl md:text-4xl font-bold">Contact & Support</h2>
          <p className="mt-3 text-muted-foreground">
            Reach our team for sales questions, partnerships or technical support.
          </p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 max-w-4xl mx-auto">
          <Card>
            <CardContent className="p-6 text-center">
              <div className="size-12 rounded-xl bg-primary/10 grid place-items-center mb-3 mx-auto">
                <Phone className="w-5 h-5 text-primary" />
              </div>
              <h3 className="font-semibold">Call us</h3>
              <a href={`tel:${CONTACT_PHONE_RAW}`} className="text-sm text-primary hover:underline block mt-2">
                {CONTACT_PHONE}
              </a>
              <p className="text-xs text-muted-foreground mt-1">Mon–Fri · 9am–6pm CAT</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-6 text-center">
              <div className="size-12 rounded-xl bg-primary/10 grid place-items-center mb-3 mx-auto">
                <Mail className="w-5 h-5 text-primary" />
              </div>
              <h3 className="font-semibold">Email</h3>
              <a href={`mailto:${CONTACT_EMAIL}`} className="text-sm text-primary hover:underline break-all block mt-2">
                {CONTACT_EMAIL}
              </a>
              <p className="text-xs text-muted-foreground mt-1">We reply within 24 hours</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-6 text-center">
              <div className="size-12 rounded-xl bg-primary/10 grid place-items-center mb-3 mx-auto">
                <MessageCircle className="w-5 h-5 text-primary" />
              </div>
              <h3 className="font-semibold">Support</h3>
              <a href={`mailto:${CONTACT_EMAIL}`} className="text-sm text-primary hover:underline break-all block mt-2">
                {CONTACT_EMAIL}
              </a>
              <a href={`tel:${CONTACT_PHONE_RAW}`} className="text-xs text-muted-foreground hover:text-foreground block mt-1">
                or call {CONTACT_PHONE}
              </a>
            </CardContent>
          </Card>
        </div>
      </section>

      <footer className="border-t border-border/60 mt-12">
        <div className="container mx-auto px-4 py-8 grid grid-cols-1 md:grid-cols-3 gap-6 text-sm">
          <div>
            <div className="flex items-center gap-2 mb-3">
              <div className="size-7 rounded-md bg-gradient-to-br from-primary to-accent grid place-items-center">
                <Building2 className="w-3.5 h-3.5 text-primary-foreground" />
              </div>
              <span className="font-bold">Savvy AI</span>
            </div>
            <p className="text-muted-foreground">AI-powered enterprise operations & organizational intelligence.</p>
          </div>
          <div>
            <h4 className="font-semibold mb-3">Navigate</h4>
            <ul className="space-y-2 text-muted-foreground">
              <li><a href="#home" className="hover:text-foreground">Home</a></li>
              <li><a href="#about" className="hover:text-foreground">About</a></li>
              <li><a href="#mission" className="hover:text-foreground">Mission & Vision</a></li>
              <li><a href="#features" className="hover:text-foreground">Features</a></li>
              <li><a href="#contact" className="hover:text-foreground">Contact</a></li>
            </ul>
          </div>
          <div>
            <h4 className="font-semibold mb-3">Reach us</h4>
            <ul className="space-y-2 text-muted-foreground">
              <li className="flex items-center gap-2"><Phone className="w-3.5 h-3.5" /> {CONTACT_PHONE}</li>
              <li className="flex items-center gap-2 break-all"><Mail className="w-3.5 h-3.5 shrink-0" /> {CONTACT_EMAIL}</li>
            </ul>
          </div>
        </div>
        <div className="border-t border-border/60">
          <div className="container mx-auto px-4 py-4 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-muted-foreground">
            <p>© {new Date().getFullYear()} Savvy AI. All rights reserved.</p>
            <div className="flex gap-4">
              <Link to="/auth" className="hover:text-foreground">Log in</Link>
              <Link to="/auth?mode=signup" className="hover:text-foreground">Sign up</Link>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default Landing;
