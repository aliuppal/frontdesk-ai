"use client";

import { useState } from "react";
import s from "@/app/landing.module.css";

/** Accordion using the grid 0fr→1fr technique, so opening animates to the content's real height. */
export function Faq({ items }: { items: [string, string][] }) {
  const [open, setOpen] = useState<number | null>(0);
  return (
    <ul className={s.faq}>
      {items.map(([q, a], i) => {
        const isOpen = open === i;
        return (
          <li key={q} className={s.faqItem}>
            <h3>
              <button type="button" className={s.faqQ} aria-expanded={isOpen} aria-controls={`faq-${i}`} onClick={() => setOpen(isOpen ? null : i)}>
                {q}
                <span className={`${s.plus} ${isOpen ? s.plusOpen : ""}`} aria-hidden />
              </button>
            </h3>
            <div id={`faq-${i}`} className={`${s.faqA} ${isOpen ? s.faqOpen : ""}`}>
              <div className={s.faqInner}>
                <p>{a}</p>
              </div>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
