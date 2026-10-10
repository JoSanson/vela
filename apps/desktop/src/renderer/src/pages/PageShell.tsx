import { useEffect, type CSSProperties, type ReactNode } from 'react';
import { Icon, type IconName } from '../components/Icon';
import styles from './PageShell.module.css';

interface Props {
  title: string;
  icon?: IconName | undefined;
  subtitle?: ReactNode | undefined;
  actions?: ReactNode | undefined;
  /** Rendered under the title inside the sticky header (search boxes, filters). */
  toolbar?: ReactNode | undefined;
  /** Children fill the viewport and own their scrolling (virtualized lists). */
  fill?: boolean | undefined;
  maxWidth?: number | undefined;
  testId: string;
  children: ReactNode;
}

export function PageShell({
  title,
  icon,
  subtitle,
  actions,
  toolbar,
  fill,
  maxWidth,
  testId,
  children,
}: Props) {
  useEffect(() => {
    document.title = `${title} · Vela`;
  }, [title]);
  const style = maxWidth ? ({ '--page-max': `${maxWidth}px` } as CSSProperties) : undefined;
  return (
    <div className={`${styles.shell} ${fill ? styles.fill : ''}`} data-testid={testId} style={style}>
      <header className={styles.header}>
        <div className={styles.headerInner}>
          <div className={styles.titleRow}>
            <div className={styles.titleWrap}>
              {icon && (
                <span className={styles.titleIcon}>
                  <Icon name={icon} size={18} />
                </span>
              )}
              <div>
                <h1 className={styles.title}>{title}</h1>
                {subtitle && <p className={styles.subtitle}>{subtitle}</p>}
              </div>
            </div>
            {actions && <div className={styles.actions}>{actions}</div>}
          </div>
          {toolbar && <div className={styles.toolbar}>{toolbar}</div>}
        </div>
      </header>
      <div className={styles.body}>
        <div className={styles.bodyInner}>{children}</div>
      </div>
    </div>
  );
}
