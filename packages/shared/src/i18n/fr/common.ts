import type { common as en } from '../en/common';

export const common = {
  'common.cancel': 'Annuler',
  'common.done': 'Terminé',
  'common.ok': 'OK',
  'common.close': 'Fermer',
  'common.delete': 'Supprimer',
  'common.remove': 'Retirer',
  'common.save': 'Enregistrer',
  'common.copy': 'Copier',
  'common.open': 'Ouvrir',
  'common.search': 'Rechercher',
  'common.loading': 'Chargement…',
  'common.back': 'Retour',
  'common.retry': 'Réessayer',
  'common.tabs.count': '{n, plural, one {# onglet} other {# onglets}}',
} satisfies Record<keyof typeof en, string>;
