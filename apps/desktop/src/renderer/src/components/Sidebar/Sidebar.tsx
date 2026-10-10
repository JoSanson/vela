import { FavoritesGrid } from './FavoritesGrid';
import { NavBar } from './NavBar';
import { PinnedList } from './PinnedList';
import { SpaceBar } from './SpaceBar';
import { TodayList } from './TodayList';
import styles from './Sidebar.module.css';

interface Props {
  width: number;
  onToggle: () => void;
  floating?: boolean;
}

export function Sidebar({ width, onToggle, floating = false }: Props) {
  return (
    <aside
      className={`${styles.sidebar} ${floating ? styles.floating : ''} grain`}
      style={{ width }}
      aria-label="Sidebar"
      data-testid="sidebar"
    >
      <NavBar onToggleSidebar={onToggle} />
      <FavoritesGrid />
      <div className={styles.scroll} role="tree" aria-label="Tabs">
        <PinnedList />
        <TodayList />
      </div>
      <SpaceBar />
    </aside>
  );
}
