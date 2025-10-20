import { Suspense } from 'react';
import { Route, Switch } from 'wouter';
import Home from '@/pages/Home';
import Demo from '@/pages/Demo';
import NotFound from '@/pages/NotFound';
import ErrorBoundary from './components/ErrorBoundary';
import { ThemeProvider } from './contexts/ThemeContext';

export default function App() {
  return (
    <ThemeProvider>
      <ErrorBoundary>
        <Suspense fallback={<div className="p-6 text-zinc-400">Loading…</div>}>
          <Switch>
            <Route path="/" component={Home} />
            <Route path="/demo" component={Demo} />
            <Route component={NotFound} />
          </Switch>
        </Suspense>
      </ErrorBoundary>
    </ThemeProvider>
  );
}