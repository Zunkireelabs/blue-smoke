/**
 * Soft, dismissible "a newer BlueSmoke build is available" notice — not in TECHNICAL_SPEC.md
 * or any `docs/project-roadmap-todos/*.md` phase, decided with the client so that a bug found
 * after launch can be pushed to users without a blocking gate. Deliberately no force-update /
 * min-version enforcement here — that would need a Supabase-backed minimum-version check and
 * is flagged as future work in the PR description, not built now.
 *
 * `sp-react-native-in-app-updates` does the actual version comparison — Android via Google
 * Play Core, iOS via the public iTunes lookup API — compared against the version this build
 * reports at runtime (`DeviceInfo.getVersion()`, the native `versionName` /
 * `CFBundleShortVersionString`, not `package.json`'s independently-drifted `version` field).
 * Deliberately not using the library's Android "flexible"/"immediate" in-app-download flows —
 * only its version check — so both platforms behave the same: a dismissible notice that deep
 * links to the store listing, not a platform-specific native install flow.
 */
import { Platform } from 'react-native';
import notifee, { AndroidImportance } from '@notifee/react-native';
import DeviceInfo from 'react-native-device-info';
import SpInAppUpdates from 'sp-react-native-in-app-updates';
import type {
  AndroidNeedsUpdateResponse,
  IosNeedsUpdateResponse,
  NeedsUpdateResponse,
} from 'sp-react-native-in-app-updates';

export const APP_UPDATE_CHANNEL_ID = 'app-update-available';
export const APP_UPDATE_NOTIFICATION_ID = 'app-update-available-notification';

/**
 * Pure extraction of the store URL from the library's response, kept separate from notifee so
 * it's testable without a notifee mock. `null` means "nothing to show" — either the installed
 * build is current, or the response didn't carry a URL we can link to.
 */
export function resolveStoreUrl(result: NeedsUpdateResponse): string | null {
  if (!result.shouldUpdate) {
    return null;
  }
  if (Platform.OS === 'android') {
    const packageName = (result as AndroidNeedsUpdateResponse).other?.packageName;
    return packageName ? `https://play.google.com/store/apps/details?id=${packageName}` : null;
  }
  const trackViewUrl = (result as IosNeedsUpdateResponse).other?.trackViewUrl;
  return trackViewUrl ?? null;
}

async function ensureChannel(): Promise<void> {
  if (Platform.OS !== 'android') {
    return;
  }
  await notifee.createChannel({
    id: APP_UPDATE_CHANNEL_ID,
    name: 'App updates',
    importance: AndroidImportance.DEFAULT,
  });
}

/**
 * `data.storeUrl` is read back by `initAppUpdateCheck.ts`'s press-event handler to open the
 * store listing — notifee's `pressAction` only opens the app itself, it can't open a URL on
 * its own.
 */
async function showAppUpdateNotification(storeUrl: string): Promise<void> {
  await ensureChannel();
  await notifee.displayNotification({
    id: APP_UPDATE_NOTIFICATION_ID,
    title: 'A newer version of BlueSmoke is available',
    body: 'Update to get the latest fixes and improvements.',
    data: { storeUrl },
    android: {
      channelId: APP_UPDATE_CHANNEL_ID,
      importance: AndroidImportance.DEFAULT,
      pressAction: { id: 'default' },
    },
    ios: {
      // No foreground-service/ongoing concept on iOS (see connectionNotification.ts's
      // reasoning) — a plain local notification with the same `data.storeUrl` is enough for
      // `initAppUpdateCheck.ts`'s press handler to open it.
    },
  });
}

const inAppUpdates = new SpInAppUpdates(false);

/**
 * Runs the version check and, if a newer build is listed, displays the update notice. Call
 * once at app boot (`initAppUpdateCheck.ts`). Inert (resolves, shows nothing) until the app's
 * first store release — see the PR description.
 */
export async function checkAppUpdate(): Promise<void> {
  const result = await inAppUpdates.checkNeedsUpdate({ curVersion: DeviceInfo.getVersion() });
  const storeUrl = resolveStoreUrl(result);
  if (storeUrl) {
    await showAppUpdateNotification(storeUrl);
  }
}
