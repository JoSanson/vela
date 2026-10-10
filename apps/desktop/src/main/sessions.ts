import type { Id } from '@vela/core';
import { app, session, type Session } from 'electron';

export const DEFAULT_PARTITION = 'persist:default';

/** Strips Electron/Vela tokens so sites (Google sign-in, Cloudflare) treat us like Chrome. */
export function chromeLikeUserAgent(): string {
  return app.userAgentFallback
    .replace(/ Vela\/\S+/i, '')
    .replace(/ Electron\/\S+/i, '')
    .replace(/ vela\/\S+/i, '');
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
