import React from 'react';

type Props = { children: React.ReactNode };

type State = { hasError: boolean; error?: any };

export default class ErrorBoundary extends React.Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(error: any): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: any, info: any) {
    console.error('ErrorBoundary caught:', error, info);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="p-4 text-sm text-red-300 border border-red-800 rounded-md bg-red-950/40">
          Something broke in this section. Check console for details.
        </div>
      );
    }
    return this.props.children;
  }
}