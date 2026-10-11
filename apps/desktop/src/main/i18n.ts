import { createTranslator, resolveLocale, type Locale, type Translator } from '@vela/shared';
import { app } from 'electron';
import type { PrefsStore } from './prefs';

/** UI locale for main-process strings (menus, dialogs). `VELA_LOCALE` pins the OS language in tests. */
export class I18n {
  readonly systemLocale: string;

  constructor(private readonly prefs: PrefsStore) {
    this.systemLocale = process.env.VELA_LOCALE ?? app.getLocale();
  }

  get locale(): Locale {
    return resolveLocale(this.prefs.value.language, this.systemLocale);
  }

  get t(): Translator {
    return createTranslator(this.locale);
  }
}
