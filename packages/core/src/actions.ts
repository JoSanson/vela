import type {
  ArchiveReason,
  AtcRule,
  CoreState,
  Folder,
  Id,
  MoveTarget,
  Profile,
  Space,
  SplitLayout,
  Tab,
} from './types';

export type TabPatch = Partial<
  Pick<
    Tab,
    | 'url'
    | 'certWarning'
    | 'title'
    | 'customTitle'
    | 'emoji'
    | 'favicon'
    | 'loading'
    | 'canGoBack'
    | 'canGoForward'
    | 'audible'
    | 'muted'
    | 'sleeping'
    | 'alwaysActive'
    | 'loaded'
    | 'zoom'
    | 'scrollY'
    | 'homeUrl'
    | 'profileId'
  >
>;

export type SpacePatch = Partial<Pick<Space, 'name' | 'emoji' | 'theme' | 'profileId'>>;
export type FolderPatch = Partial<Pick<Folder, 'name' | 'emoji' | 'collapsed'>>;

export type CoreAction =
  | { type: 'state/replace'; state: CoreState }
  | { type: 'space/create'; space: Space; index?: number }
  | { type: 'space/update'; id: Id; patch: SpacePatch }
  | { type: 'space/delete'; id: Id; now: number }
  | { type: 'space/reorder'; order: Id[] }
  | { type: 'space/activate'; id: Id; now: number }
  | { type: 'space/setActiveTab'; spaceId: Id; tabId: Id | null }
  | { type: 'tab/open'; tab: Tab; index?: number; activate: boolean }
  /** `spaceId`: the window's Space the click came from (see `activateTab`). */
  | { type: 'tab/activate'; id: Id; now: number; spaceId?: Id }
  | { type: 'tab/close'; id: Id; now: number; reason?: ArchiveReason }
  | { type: 'tab/update'; id: Id; patch: TabPatch }
  | { type: 'tab/pin'; id: Id; index?: number }
  | { type: 'tab/unpin'; id: Id; now: number }
  | { type: 'tab/favorite'; id: Id; index?: number }
  | { type: 'tab/move'; id: Id; to: MoveTarget; now: number }
  | { type: 'tab/reset'; id: Id }
  | { type: 'folder/create'; folder: Folder; index?: number; parentFolderId?: Id }
  | { type: 'folder/update'; id: Id; patch: FolderPatch }
  | { type: 'folder/delete'; id: Id }
  | { type: 'folder/move'; id: Id; to: MoveTarget }
  | { type: 'archive/restore'; id: Id; newTabId: Id; now: number }
  | { type: 'archive/remove'; id: Id }
  | { type: 'archive/clear' }
  | { type: 'maintenance/autoArchive'; now: number; maxAgeMs: number; keepTabIds?: Id[] }
  | { type: 'maintenance/pruneArchive'; max: number }
  | { type: 'split/set'; spaceId: Id; layout: SplitLayout | null }
  | { type: 'split/add'; spaceId: Id; tabId: Id; index?: number }
  | { type: 'split/remove'; spaceId: Id; tabId: Id }
  | { type: 'split/resize'; spaceId: Id; sizes: number[] }
  | { type: 'atc/set'; rules: AtcRule[] }
  | { type: 'profile/create'; profile: Profile }
  | { type: 'profile/update'; id: Id; patch: Partial<Pick<Profile, 'name' | 'color'>> }
  | { type: 'profile/delete'; id: Id };

export type CoreActionType = CoreAction['type'];
