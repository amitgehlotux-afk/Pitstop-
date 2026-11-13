export function Briefing({ text }: { text?: string }) {
  if (!text) return null;
  return (
    <section className="card briefing" aria-labelledby="brief-h">
      <h2 id="brief-h">Briefing</h2>
      <ol className="brief-lines">
        {text
          .split('\n')
          .filter(Boolean)
          .slice(0, 5)
          .map((l, i) => (
            <li key={i}>{l}</li>
          ))}
      </ol>
    </section>
  );
}
