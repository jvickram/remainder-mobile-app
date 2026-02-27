/**
 * @format
 */

import 'react-native-gesture-handler';
import 'react-native-reanimated';
import { AppRegistry } from 'react-native';
import notifee from '@notifee/react-native';
import App from './App';
import { name as appName } from './app.json';

notifee.onBackgroundEvent(async () => {});

AppRegistry.registerComponent(appName, () => App);
