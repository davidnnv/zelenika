// Shows a friendly message (instead of a blank page) if something crashes while rendering.
import { Component } from 'react';

export default class ErrorBoundary extends Component {
  state = { error: null };

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error) {
    if (import.meta.env.DEV) console.error(error);
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <main className="crash">
        <div className="crash__card">
          <h1>Нешто не тргна како што треба</h1>
          <p>Освежете ја страната. Ако проблемот остане, јавете ни се на 078 366 023.</p>
          <button type="button" className="btn btn-solid" onClick={() => window.location.reload()}>
            Освежи
          </button>
          {import.meta.env.DEV && <pre className="crash__detail">{String(this.state.error?.message || this.state.error)}</pre>}
        </div>
      </main>
    );
  }
}
