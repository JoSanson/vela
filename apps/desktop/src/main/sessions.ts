import type { Id } from '@vela/core';
import { app, session, type Session } from 'electron';

export const DEFAULT_PARTITION = 'persist:default';

/**
 * Strips the Electron/Vela tokens and freezes the Chrome version to `N.0.0.0`, exactly what Chrome
 * sends since its user-agent reduction: a full build number like `152.0.7977.130` only ever comes
 * from embedders, and Google's sign-in refuses those ("this browser or app may not be secure").
 */
export function chromeLikeUserAgent(fallback = app.userAgentFallback): string {
  return fallback
    .replace(/ Vela\/\S+/i, '')
    .replace(/ Electron\/\S+/i, '')
    .replace(/Chrome\/(\d+)\.\S+/, 'Chrome/$1.0.0.0');
}

export type SessionConfigurator = (ses: Session, partition: string) => void;

export class SessionManager {
  private configured = new Set<string>();
  private configurators: SessionConfigurator[] = [];

  addConfigurator(fn: SessionConfigurator): void {
    this.configurators.push(fn);
    for (const partition of this.configured) fn(session.fromPartition(partition), partition);
  }

  partitionFor(profilePartition: string | null | undefined): string {
    return profilePartition ?? DEFAULT_PARTITION;
  }

  get(partition: string): Session {
    const ses = session.fromPartition(partition);
    if (!this.configured.has(partition)) {
      this.configured.add(partition);
      ses.setUserAgent(chromeLikeUserAgent());
      for (const fn of this.configurators) fn(ses, partition);
    }
    return ses;
  }

  forProfile(profileId: Id | null, partitions: Record<Id, string | undefined>): Session {
    const partition = profileId ? partitions[profileId] : undefined;
    return this.get(this.partitionFor(partition));
  }

  allPartitions(): string[] {
    return [...this.configured];
  }
}
