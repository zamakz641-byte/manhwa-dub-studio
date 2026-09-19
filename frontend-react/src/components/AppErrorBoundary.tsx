import React from 'react';

interface State {
  error: Error | null;
}

interface Props {
  children?: React.ReactNode;
}

export class AppErrorBoundary extends React.Component<Props, State> {
  declare readonly props: Readonly<Props>;
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('Manhwa Dub UI error', error, info);
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <main className="min-h-screen bg-[#0a0b0d] text-white flex items-center justify-center p-6">
        <section className="max-w-xl w-full rounded-xl border border-red-500/40 bg-[#14161c] p-6 space-y-4 shadow-2xl">
          <p className="text-[10px] font-bold tracking-widest uppercase text-red-400">Interface récupérable</p>
          <h1 className="text-xl font-black">Une vue a rencontré une erreur</h1>
          <p className="text-sm text-[#9da3af]">La vidéo et le projet restent enregistrés. Rechargez l’interface pour reprendre sans perdre les données.</p>
          <pre className="text-[11px] text-red-200 bg-black/30 rounded p-3 overflow-auto max-h-32">{this.state.error.message}</pre>
          <button className="rounded bg-[#fbbf24] px-4 py-2 text-xs font-black text-black" onClick={() => window.location.reload()}>
            Recharger le studio
          </button>
        </section>
      </main>
    );
  }
}
