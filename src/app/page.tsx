import Link from "next/link";

export default function Home() {
  return (
    <main className="flex-1">
      <header className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
        <span className="display text-lg">
          FrontDesk<span className="text-muted">.ai</span>
        </span>
        <nav className="flex items-center gap-2">
          <Link href="/login" className="btn btn-sm">Log in</Link>
          <Link href="/signup" className="btn btn-primary btn-sm">Start free</Link>
        </nav>
      </header>

      <section className="max-w-6xl mx-auto px-6 pt-20 pb-24 grid lg:grid-cols-[1.1fr_1fr] gap-14 items-center">
        <div>
          <p className="badge mb-6">For salons, spas, plumbers, HVAC and every shop that misses calls</p>
          <h1 className="text-[44px] sm:text-[60px] leading-[1.05]">
            Your phone gets answered.
            <br />
            Every call. Every hour.
          </h1>
          <p className="text-lg text-muted mt-6 max-w-xl leading-relaxed">
            FrontDesk gives your business a local number with an AI receptionist on it. It talks to callers like a
            person would, finds a free slot in your Google Calendar, books it, and emails everyone the details.
          </p>
          <div className="flex flex-wrap gap-3 mt-9">
            <Link href="/signup" className="btn btn-primary h-11 px-5 text-[15px]">Get your number</Link>
            <a href="#how" className="btn btn-ghost h-11 px-5 text-[15px]">See how a call goes</a>
          </div>
        </div>

        {/* An example call, not an illustration: the product is the picture. */}
        <div className="card p-6 text-[15px]" aria-label="Example call transcript">
          <div className="flex items-center justify-between mb-5">
            <div>
              <div className="font-semibold">Example call · after hours</div>
              <div className="text-xs text-muted">Tue 7:42 PM</div>
            </div>
            <span className="badge badge-ok">Booked</span>
          </div>
          <ol className="space-y-3">
            {[
              ["agent", "Thanks for calling Riverside Plumbing! How can I help?"],
              ["user", "My water heater's leaking. Can someone come tomorrow?"],
              ["agent", "I'm sorry to hear that. I have 9 AM or 1:30 PM tomorrow. Which works?"],
              ["user", "Nine, please."],
              ["agent", "You're booked for Wednesday at 9 AM. What's the address?"],
            ].map(([who, text], i) => (
              <li key={i} className={who === "agent" ? "pr-10" : "pl-10 text-right"}>
                <span className={`inline-block rounded-xl px-3.5 py-2 text-left ${who === "agent" ? "bg-surface-2" : "bg-fg text-white"}`}>{text}</span>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section id="how" className="bg-surface-2 py-20">
        <div className="max-w-6xl mx-auto px-6">
          <h2 className="text-[36px] max-w-xl leading-tight">Set it up in ten minutes. It works while you sleep.</h2>
          <div className="grid md:grid-cols-3 gap-5 mt-12">
            {[
              ["Tell it about your business", "Services, how long each takes, your hours, and how you like the phone answered."],
              ["Connect Google Calendar", "It only offers times you're actually free, and adds every booking to your calendar."],
              ["Forward your calls", "Use the new number, or forward missed and after-hours calls from your existing line."],
            ].map(([title, body], i) => (
              <div key={title} className="card p-6">
                <div className="display text-sm text-muted tabular">0{i + 1}</div>
                <h3 className="text-lg mt-3">{title}</h3>
                <p className="text-sm text-muted mt-2 leading-relaxed">{body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="max-w-6xl mx-auto px-6 py-20 grid md:grid-cols-2 gap-10 items-center">
        <div>
          <h2 className="text-[36px] leading-tight">Every call, written down and replayable.</h2>
          <p className="text-muted mt-4 leading-relaxed">
            Read the transcript, play the recording, and click any line to jump to that moment. See who called, what they
            needed and whether they booked, all in one place.
          </p>
        </div>
        <div className="card p-6">
          <dl className="grid grid-cols-2 gap-y-4 text-sm">
            <dt className="text-muted">Caller</dt>
            <dd>Maria Lopez</dd>
            <dt className="text-muted">Needed</dt>
            <dd>Water heater leak</dd>
            <dt className="text-muted">Address</dt>
            <dd>418 Oak St, Austin</dd>
            <dt className="text-muted">Outcome</dt>
            <dd>
              <span className="badge badge-ok">Booked · Wed 9:00 AM</span>
            </dd>
          </dl>
        </div>
      </section>

      <footer className="border-t border-black/5 py-8 text-center text-sm text-muted">FrontDesk AI</footer>
    </main>
  );
}
