/**
 * Screen state that survives the phone unloading the app: a tab, a view, an
 * open panel. It lives in the route's params, which are saved with the
 * navigation state and restored on relaunch (see RootNavigator), and also show
 * up in the web URL. Use it for "where am I on this screen", not for form text.
 */
import { useCallback, useState } from 'react';
import { useNavigation, useRoute } from '@react-navigation/native';

export function useParamState<T extends string | boolean>(key: string, fallback: T): [T, (v: T) => void] {
  const route = useRoute();
  const navigation = useNavigation();
  const saved = (route.params as Record<string, unknown> | undefined)?.[key] as T | undefined;
  const [value, setValue] = useState<T>(saved ?? fallback);
  const set = useCallback((v: T) => {
    setValue(v);
    (navigation.setParams as unknown as (p: object) => void)({ [key]: v === fallback ? undefined : v });
  }, [navigation, key, fallback]);
  return [value, set];
}
