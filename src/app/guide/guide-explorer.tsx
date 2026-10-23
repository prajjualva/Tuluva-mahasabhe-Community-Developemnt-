"use client";
import Link from "next/link";
import { useState } from "react";
import { filterGuide, guideAudiences, GuideAudience } from "../../content/platform-guide";

export function GuideExplorer() {
  const [query, setQuery] = useState("");
  const [audience, setAudience] = useState<GuideAudience>("Everyone");
  const entries = filterGuide(query, audience);
  const topics = [...new Set(entries.map((entry) => entry.topic))];
  return (
    <section className="guide-explorer" aria-labelledby="guide-search-heading">
      <div className="guide-tools">
        <h2 id="guide-search-heading">Find your next step.</h2>
        <label htmlFor="guide-search">Search the guide</label>
        <input
          id="guide-search"
          type="search"
          value={query}
          maxLength={160}
          placeholder="Try wallet, nominee, approval…"
          onChange={(event) => setQuery(event.target.value)}
          aria-controls="guide-results"
        />
        <div className="guide-filters" role="group" aria-label="Guide audience">
          {guideAudiences.map((role) => (
            <button
              key={role}
              type="button"
              aria-pressed={audience === role}
              onClick={() => setAudience(role)}
            >
              {role === "Everyone" ? "All guides" : role}
            </button>
          ))}
        </div>
        <p className="muted" role="status">
          {entries.length} {entries.length === 1 ? "guide" : "guides"} found
        </p>
      </div>
      <div id="guide-results">
        {entries.length === 0 ? (
          <div className="guide-empty">
            <h3>No matching guides</h3>
            <p>Try another word or show all roles.</p>
            <button
              type="button"
              onClick={() => {
                setQuery("");
                setAudience("Everyone");
              }}
            >
              Clear filters
            </button>
          </div>
        ) : (
          topics.map((topic) => (
            <section className="guide-topic" key={topic} aria-label={topic}>
              <h2>{topic}</h2>
              {entries
                .filter((entry) => entry.topic === topic)
                .map((entry) => (
                  <details className="guide-answer" key={entry.id}>
                    <summary>{entry.title}</summary>
                    <div className="guide-answer-content">
                      <p>{entry.summary}</p>
                      <ol>
                        {entry.steps.map((step) => (
                          <li key={step}>{step}</li>
                        ))}
                      </ol>
                      {entry.note && <p className="guide-note">{entry.note}</p>}
                      <Link href={entry.href}>
                        {entry.action} <span aria-hidden="true">→</span>
                      </Link>
                    </div>
                  </details>
                ))}
            </section>
          ))
        )}
      </div>
    </section>
  );
}
