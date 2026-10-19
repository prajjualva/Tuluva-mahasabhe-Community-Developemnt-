export default function Loading() {
  return (
    <main aria-busy="true" aria-live="polite">
      <p className="eyebrow">COMMUNITY SUPPORT FOUNDATION</p>
      <div className="loading-mark" aria-hidden="true" />
      <h1>Opening your workspace…</h1>
      <p>Securely loading the latest Foundation records.</p>
    </main>
  );
}
