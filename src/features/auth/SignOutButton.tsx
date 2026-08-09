import { Button } from '@/shared/ui';
import { useAuthClient } from './AuthClientContext';

/**
 * F6.Z (USER_FLOWS.md) — "every screen on the verify and pending stacks carries a persistent
 * sign-out." Before this, sign-out existed in exactly one place in the whole signed-in app
 * (`ProfileScreen`), unreachable from a declined or stuck user. Shared here rather than
 * repeated per screen so every verification surface calls the same, already-correct
 * `authClient.signOut()` — the session store's `onAuthStateChange` listener drives the UI back
 * to the auth stack, so there is nothing to await beyond the fire-and-forget call itself.
 */
export function SignOutButton() {
  const authClient = useAuthClient();
  return (
    <Button
      label="Sign out"
      variant="secondary"
      onPress={() => {
        authClient.signOut().catch(() => {});
      }}
    />
  );
}
