import { Component, type ReactNode, Suspense } from 'react';
import { reportStaleBuild } from '@/pwa/staleBuild';

type Props = { children: ReactNode; fallback?: ReactNode };

/**
 * Suspense for a lazy part of the UI that can fail to load (a chunk gone
 * after a deploy, a dropped connection). Without a boundary React unmounts
 * the whole app; this renders nothing in its place and offers a reload.
 */
export class LazyBoundary extends Component<Props, { failed: boolean }> {
  override state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  override componentDidCatch() {
    reportStaleBuild();
  }

  override render() {
    if (this.state.failed) return null;
    return <Suspense fallback={this.props.fallback ?? null}>{this.props.children}</Suspense>;
  }
}
