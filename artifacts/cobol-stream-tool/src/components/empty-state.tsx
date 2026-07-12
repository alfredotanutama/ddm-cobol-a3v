export function EmptyState({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative overflow-hidden rounded-md border">
      <img
        src="/cobol-code.jpeg"
        alt=""
        aria-hidden
        className="absolute inset-0 h-full w-full object-cover"
      />
      <div aria-hidden className="absolute inset-0 bg-black/65" />
      <div
        aria-hidden
        className="absolute inset-0 bg-[repeating-linear-gradient(0deg,rgba(0,0,0,0.3)_0px,rgba(0,0,0,0.3)_1px,transparent_1px,transparent_3px)]"
      />
      <p className="relative px-6 py-12 text-center font-mono text-sm text-zinc-100">{children}</p>
    </div>
  );
}
