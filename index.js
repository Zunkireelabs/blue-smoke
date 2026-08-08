/**
 * @format
 */

// Must be first: replaces RN's read-only-property URL with a WHATWG-compliant
// one. supabase-js's constructor assigns `url.protocol` (http→ws for realtime),
// which throws on RN's built-in URL — before any request is made.
import 'react-native-url-polyfill/auto';
import { AppRegistry } from 'react-native';
import App from './App';
import { name as appName } from './app.json';

AppRegistry.registerComponent(appName, () => App);
