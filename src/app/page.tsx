import Link from "next/link";
import type { CSSProperties, ReactNode } from "react";
import { Faq } from "@/components/landing/Faq";
import { HeroCall } from "@/components/landing/HeroCall";
import { Reveal } from "@/components/landing/Reveal";
import s from "./landing.module.css";

const INDUSTRIES = ["Hair salons", "Day spas", "Plumbers", "HVAC", "Electricians", "Cleaning services", "Auto repair", "Barbershops", "Landscapers", "Consultants"];

const STEPS = [
  ["Answers on the first ring", "Day, night, weekends. Callers hear your business name and a friendly voice, not voicemail."],
  ["Understands the job", "It asks what they need, matches it to your services, and collects name, number and address."],
  ["Finds a real free slot", "It checks your Google Calendar and your hours, so it only offers times you can actually do."],
  ["Books and confirms", "The appointment lands in your calendar and both of you get an email with the details."],
];

const FEATURES: [string, string, ReactNode][] = [
  ["Open 24/7", "After-hours, lunch rush or a busy day on site: every call gets picked up.", <path key="i" d="M12 7v5l3 2M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />],
  ["Never double-books", "It checks the calendar before offering a time and again before booking, so two callers can't take one slot.", <path key="i" d="M8 3v3M16 3v3M4 9h16M5 5h14a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1Zm4 9 2 2 4-4" />],
  ["Recordings and transcripts", "Play any call, read every word, and jump to the moment that matters.", <path key="i" d="M4 10v4M8 7v10M12 4v16M16 8v8M20 11v2" />],
  ["Your whole team", "Each person keeps their own calendar. Callers can ask for someone, or take whoever is free first.", <path key="i" d="M16 19v-1a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4v1M9.5 10a3 3 0 1 0 0-6 3 3 0 0 0 0 6ZM21 19v-1a4 4 0 0 0-3-3.9M15.5 4.1a3 3 0 0 1 0 5.8" />],
  ["Hands off urgent calls", "Burst pipe or upset customer? It transfers the call to your phone right away.", <path key="i" d="M15 4h5v5M20 4l-7 7M5 4h3l1.5 4-2 1.2a10 10 0 0 0 4.3 4.3L13 11.5l4 1.5v3a2 2 0 0 1-2 2A13 13 0 0 1 3 6a2 2 0 0 1 2-2Z" />],
  ["Keep your number", "Get a new local number, or forward your existing line when you're busy or closed.", <path key="i" d="M7 4h10a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1Zm4 13h2" />],
];

const FAQS: [string, string][] = [
  ["Will callers know it's an AI?", "It introduces itself as the virtual assistant, and if anyone asks, it says so honestly. Most callers just want to get booked, and it does that quickly and politely."],
  ["How does it know when I'm free?", "You connect Google Calendar once. Before offering a time it checks your calendar, your opening hours, how long the service takes and any gap you want between jobs."],
  ["Can I keep my current phone number?", "Yes. You get a new local number, and you can forward your existing line to it all the time, only after hours, or only when you don't pick up."],
  ["What if it can't help the caller?", "It takes their name, number and what they need, flags the call as \"call back\" on your dashboard, or transfers urgent calls to you if you set a transfer number."],
  ["Can I hear what happened on a call?", "Every call is recorded and transcribed. Your dashboard shows the summary, the details it collected, and lets you play the recording from any line."],
];

function Icon({ children, size = 18 }: { children: ReactNode; size?: number }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      {children}
    </svg>
  );
}

const Check = () => (
  <Icon size={15}>
    <path d="M5 12.5l4.5 4.5L19 7.5" />
  </Icon>
);

function Words({ text, start, className = "" }: { text: string; start: number; className?: string }) {
  return (
    <span className={`${s.h1Line} ${className}`}>
      {text.split(" ").map((w, i, all) => (
        <span key={i} className={s.word} style={{ "--d": `${start + i * 80}ms` } as CSSProperties}>
          {w}
          {i < all.length - 1 ? " " : ""}
        </span>
      ))}
    </span>
  );
}

function SignupForm({ id, className = "" }: { id: string; className?: string }) {
  return (
    <form action="/signup" method="get" className={`${s.signup} ${className}`}>
      <label htmlFor={id} className="sr-only">Work email</label>
      <input id={id} name="email" type="email" autoComplete="email" placeholder="you@yourbusiness.com" className={s.signupInput} />
      <button className={`btn btn-primary ${s.signupBtn}`}>
        Get my AI receptionist <span className={s.arrow} aria-hidden>→</span>
      </button>
    </form>
  );
}

export default function Home() {
  return (
    <main className={`flex-1 ${s.page}`}>
      <header className={s.header}>
        <div className={s.headerInner}>
          <Link href="/" className={s.logo}>
            <span className={s.logoMark}>
              <Icon size={15}>
                <path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2" />
              </Icon>
            </span>
            <span>
              FrontDesk<span className="text-muted">.ai</span>
            </span>
          </Link>
          <nav className={s.nav}>
            <a href="#how" className={`${s.navLink} ${s.navHide}`}>How it works</a>
            <a href="#dashboard" className={`${s.navLink} ${s.navHide}`}>Dashboard</a>
            <a href="#faq" className={`${s.navLink} ${s.navHide}`}>FAQ</a>
            <Link href="/login" className={s.navLink}>Log in</Link>
            <Link href="/signup" className="btn btn-primary btn-sm">Sign up free</Link>
          </nav>
        </div>
      </header>

      <section className={s.hero}>
        <div className={s.heroInner}>
          <div>
            <span className={`${s.eyebrow} ${s.fadeUp}`}>
              <span className={s.eyebrowPill}>NEW</span> AI receptionist for local service businesses
            </span>
            <h1 className={s.h1}>
              <Words text="Every call answered." start={150} />
              <Words text="Every booking made." start={470} className={s.muted} />
            </h1>
            <p className={`${s.lede} ${s.fadeUp}`} style={{ "--d": "800ms" } as CSSProperties}>
              FrontDesk picks up your business phone 24/7, talks to callers like your best receptionist, books the job into
              your Google Calendar and emails everyone the details. You just show up.
            </p>
            <div className={s.fadeUp} style={{ "--d": "950ms" } as CSSProperties}>
              <SignupForm id="hero-email" />
              <div className={s.ticks}>
                <span className={s.tick}><Check /> Live in about 10 minutes</span>
                <span className={s.tick}><Check /> Local US number</span>
                <span className={s.tick}><Check /> Works with Google Calendar</span>
              </div>
            </div>
          </div>

          <div className={s.callStage}>
            <span className={`${s.chip} ${s.chipA}`} aria-hidden>
              <span className={s.chipIcon}>
                <Icon size={15}>
                  <path d="M12 7v5l3 2M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
                </Icon>
              </span>
              <span>
                After-hours call
                <span className={s.chipSmall}>answered automatically</span>
              </span>
            </span>
            <HeroCall />
            <span className={`${s.chip} ${s.chipB}`} aria-hidden>
              <span className={s.chipIcon}>
                <Icon size={15}>
                  <path d="M8 3v3M16 3v3M4 9h16M5 5h14a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1Z" />
                </Icon>
              </span>
              <span>
                Wed · 9:00 AM
                <span className={s.chipSmall}>added to your calendar</span>
              </span>
            </span>
            <p className="sr-only">
              Example: a caller asks for a plumber tomorrow; the AI receptionist offers 9:00 AM or 1:30 PM, books 9:00 AM and
              sends a confirmation.
            </p>
          </div>
        </div>
      </section>

      <div className={s.marquee} aria-label="Built for local service businesses">
        <div className={s.marqueeTrack}>
          {[...INDUSTRIES, ...INDUSTRIES].map((name, i) => (
            <span key={i} className={s.marqueeItem} aria-hidden={i >= INDUSTRIES.length}>
              {name}
            </span>
          ))}
        </div>
      </div>

      <section id="how" className={s.section}>
        <Reveal>
          <div className={s.kicker}>How it works</div>
          <h2 className={s.h2}>What happens when your phone rings</h2>
          <p className={s.sub}>The same four steps your best receptionist would take, on every call, at any hour.</p>
        </Reveal>
        <Reveal className={s.steps} delay={100}>
          <span className={s.stepsLine} aria-hidden />
          {STEPS.map(([title, text], i) => (
            <div key={title}>
              <div className={s.stepNum}>{i + 1}</div>
              <h3 className={s.stepTitle}>{title}</h3>
              <p className={s.stepText}>{text}</p>
            </div>
          ))}
        </Reveal>
      </section>

      <section id="dashboard" className={s.section} style={{ paddingTop: 24 }}>
        <Reveal>
          <div className={s.kicker}>Your dashboard</div>
          <h2 className={s.h2}>Every call written down, replayable and searchable</h2>
          <p className={s.sub}>See who called, what they needed and whether they booked. Click any line of the transcript to hear that moment.</p>
        </Reveal>
        <Reveal className={s.preview} delay={120}>
          <div className={s.previewWin}>
            <div className={s.previewBar} aria-hidden>
              <i />
              <i />
              <i />
            </div>
            <div className={s.previewBody}>
              <div>
                <div className="flex items-center justify-between">
                  <div>
                    <div className="display text-xl">Maria Lopez</div>
                    <div className="text-[13px] text-muted">(512) 555-0148 · Tue 7:42 PM · 1m 58s</div>
                  </div>
                  <span className="badge badge-ok">Booked</span>
                </div>
                <div className={s.player} style={{ marginTop: 16 }}>
                  <span className={s.playBtn} aria-hidden>
                    <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor">
                      <path d="M8 5v14l11-7z" />
                    </svg>
                  </span>
                  <span className={s.track}>
                    <span className={s.trackFill} />
                  </span>
                  <span className="text-xs text-muted tabular">1:58</span>
                </div>
                <div className={s.tline}>
                  <span className={s.tlineTime}>0:00</span>
                  <span><strong>Agent</strong> · Thanks for calling Riverside Plumbing! How can I help?</span>
                </div>
                <div className={`${s.tline} ${s.tlineActive}`}>
                  <span className={s.tlineTime}>0:04</span>
                  <span><strong>Caller</strong> · Our kitchen sink is backing up. Can someone come tomorrow?</span>
                </div>
                <div className={s.tline}>
                  <span className={s.tlineTime}>0:09</span>
                  <span><strong>Agent</strong> · I have 9:00 AM or 1:30 PM tomorrow. Which works?</span>
                </div>
              </div>
              <div>
                <div className="display text-base">What the agent collected</div>
                <dl className={s.fields}>
                  <dt className={s.fieldKey}>Name</dt>
                  <dd>Maria Lopez</dd>
                  <dt className={s.fieldKey}>Needed</dt>
                  <dd>Kitchen drain cleaning</dd>
                  <dt className={s.fieldKey}>Address</dt>
                  <dd>418 Oak St, Austin</dd>
                  <dt className={s.fieldKey}>Booked</dt>
                  <dd>Wed 9:00 AM</dd>
                  <dt className={s.fieldKey}>Mood</dt>
                  <dd>Positive</dd>
                </dl>
              </div>
            </div>
          </div>
        </Reveal>
      </section>

      <section className={s.section} style={{ paddingTop: 24 }}>
        <Reveal>
          <div className={s.kicker}>Built for the trades and the chair</div>
          <h2 className={s.h2}>Everything a front desk does, without the front desk</h2>
        </Reveal>
        <div className={s.grid3}>
          {FEATURES.map(([title, text, path], i) => (
            <Reveal key={title} delay={(i % 3) * 90}>
              <div className={s.card}>
                <span className={s.cardIcon}>
                  <Icon>{path}</Icon>
                </span>
                <h3 className={s.cardTitle}>{title}</h3>
                <p className={s.cardText}>{text}</p>
              </div>
            </Reveal>
          ))}
        </div>
      </section>

      <section id="faq" className={s.section} style={{ paddingTop: 24 }}>
        <Reveal>
          <div className={s.kicker}>Questions</div>
          <h2 className={s.h2}>Good to know</h2>
          <Faq items={FAQS} />
        </Reveal>
      </section>

      <section className={s.cta}>
        <Reveal className={s.ctaBox}>
          <h2 className={s.ctaTitle}>Stop sending customers to voicemail</h2>
          <p className={s.ctaText}>Set up your AI receptionist tonight. It will be answering your phone before your first coffee tomorrow.</p>
          <SignupForm id="cta-email" className={s.ctaForm} />
        </Reveal>
      </section>

      <footer className={s.footer}>
        <div className={s.footerInner}>
          <span>© {new Date().getFullYear()} FrontDesk AI</span>
          <span className="flex gap-4">
            <Link href="/login" className="hover:text-fg">Log in</Link>
            <Link href="/signup" className="hover:text-fg">Sign up</Link>
          </span>
        </div>
      </footer>
    </main>
  );
}
