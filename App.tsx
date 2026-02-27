import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  FlatList,
  Linking,
  Platform,
  ScrollView,
  StatusBar,
  StyleSheet,
  View,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import DateTimePicker, {
  type DateTimePickerEvent,
} from '@react-native-community/datetimepicker';
import MaterialDesignIcons from '@react-native-vector-icons/material-design-icons';
import notifee, {
  AndroidCategory,
  AndroidImportance,
  AndroidVisibility,
  EventType,
  RepeatFrequency,
  TimeUnit,
  TriggerType,
  type Trigger,
  type TimestampTrigger,
} from '@notifee/react-native';
import {
  Appbar,
  Button,
  Card,
  Chip,
  MD3DarkTheme,
  PaperProvider,
  Text,
  TextInput,
  Checkbox,
  IconButton,
  Dialog,
  Portal,
  SegmentedButtons,
} from 'react-native-paper';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';

type NoteType = 'todo' | 'text';
type RepeatOption = 'once' | 'daily' | 'weekly' | 'custom';

type TodoItem = {
  id: string;
  text: string;
  done: boolean;
};

type Reminder = {
  id: string;
  title: string;
  reminderTime: string;
  repeat: RepeatOption;
  customRepeatMinutes?: number;
  noteType: NoteType;
  notes: string;
  todoItems: TodoItem[];
  notificationId?: string;
  completed: boolean;
};

const REMINDERS_STORAGE_KEY = 'reminder_app_items';
const REMINDER_CHANNEL_ID = 'reminders';

const TODO_ROW_BG_COLOR = 'rgba(144,164,210,0.16)';
const REPEAT_LABELS: Record<RepeatOption, string> = {
  once: 'Once',
  daily: 'Daily',
  weekly: 'Weekly',
  custom: 'Custom',
};
const MIN_CUSTOM_REPEAT_MINUTES = 30;
const CUSTOM_REPEAT_OPTIONS = [30, 60, 120, 180, 240, 300, 360] as const;

const formatCustomRepeatLabel = (minutes?: number) => {
  if (!minutes) {
    return 'Custom';
  }

  if (minutes % 60 === 0) {
    const hours = minutes / 60;
    return hours === 1 ? 'Every 1 hour' : `Every ${hours} hours`;
  }

  return `Every ${minutes} min`;
};

const getRepeatDisplayLabel = (repeat: RepeatOption, customRepeatMinutes?: number) => {
  if (repeat === 'custom') {
    return formatCustomRepeatLabel(customRepeatMinutes);
  }

  return REPEAT_LABELS[repeat];
};

const renderPaperIcon = (props: {
  color?: string;
  size?: number;
  name: string;
}) => (
  <MaterialDesignIcons
    name={props.name as never}
    color={props.color}
    size={props.size}
  />
);

const getNextReminderDate = (selectedTime: Date) => {
  const now = new Date();
  const next = new Date(now);

  next.setHours(selectedTime.getHours(), selectedTime.getMinutes(), 0, 0);

  if (next.getTime() <= now.getTime()) {
    next.setDate(next.getDate() + 1);
  }

  return next;
};

const parseLegacyTodoItems = (notes: string): TodoItem[] => {
  return notes
    .split('\n')
    .map(item => item.trim())
    .filter(Boolean)
    .map(item => ({
      id: `${Date.now()}-${Math.random()}-${item}`,
      text: item,
      done: false,
    }));
};

const createTodoItem = (text: string): TodoItem => ({
  id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
  text,
  done: false,
});

function App() {
  const alarmDarkTheme = {
    ...MD3DarkTheme,
    colors: {
      ...MD3DarkTheme.colors,
      primary: '#8AB4F8',
      secondary: '#7EA7F9',
      tertiary: '#9ABAFD',
      surface: '#1B212B',
      surfaceVariant: '#242C38',
      background: '#080A0F',
      onSurface: '#E8ECF4',
      elevation: {
        ...MD3DarkTheme.colors.elevation,
        level2: '#1E2632',
        level3: '#242F3E',
      },
    },
  };

  return (
    <SafeAreaProvider>
      <PaperProvider
        theme={alarmDarkTheme}
        settings={{
          icon: renderPaperIcon,
        }}>
        <StatusBar barStyle="light-content" />
        <ReminderScreen />
      </PaperProvider>
    </SafeAreaProvider>
  );
}

function ReminderScreen() {
  const [isAddSectionVisible, setIsAddSectionVisible] = useState(false);
  const [newReminder, setNewReminder] = useState('');
  const [showNotes, setShowNotes] = useState(false);
  const [newNotes, setNewNotes] = useState('');
  const [newTodoItemText, setNewTodoItemText] = useState('');
  const [draftTodoItems, setDraftTodoItems] = useState<TodoItem[]>([]);
  const [noteType, setNoteType] = useState<NoteType>('text');
  const [repeatOption, setRepeatOption] = useState<RepeatOption>('once');
  const [customRepeatMinutes, setCustomRepeatMinutes] = useState<number>(30);
  const [reminders, setReminders] = useState<Reminder[]>([]);
  const [hasLoadedReminders, setHasLoadedReminders] = useState(false);
  const [showTimePicker, setShowTimePicker] = useState(false);
  const [selectedTime, setSelectedTime] = useState<Date>(new Date());
  const [editingReminderId, setEditingReminderId] = useState<string | null>(null);
  const [detailReminderId, setDetailReminderId] = useState<string | null>(null);
  const [isDetailsDialogVisible, setIsDetailsDialogVisible] = useState(false);
  const [pendingOpenReminderId, setPendingOpenReminderId] = useState<string | null>(
    null,
  );
  const remindersRef = useRef<Reminder[]>([]);

  remindersRef.current = reminders;

  const selectedReminder = useMemo(
    () => reminders.find(reminder => reminder.id === detailReminderId) ?? null,
    [detailReminderId, reminders],
  );

  const openReminderDetails = (reminderId: string) => {
    setDetailReminderId(reminderId);
    setIsDetailsDialogVisible(true);
  };

  const closeReminderDetails = () => {
    setIsDetailsDialogVisible(false);
    setDetailReminderId(null);
  };

  const startEditingReminder = (reminder: Reminder) => {
    setIsAddSectionVisible(true);
    setEditingReminderId(reminder.id);
    setNewReminder(reminder.title);
    setSelectedTime(new Date(reminder.reminderTime));
    setRepeatOption(reminder.repeat ?? 'once');
    setCustomRepeatMinutes(reminder.customRepeatMinutes ?? 30);
    setShowNotes(Boolean(reminder.notes) || reminder.todoItems.length > 0);
    setNoteType(reminder.noteType);
    setNewNotes(reminder.notes);
    setDraftTodoItems(reminder.todoItems);
    setNewTodoItemText('');
    closeReminderDetails();
  };

  const addDraftTodoItem = () => {
    const trimmed = newTodoItemText.trim();
    if (!trimmed) {
      return;
    }

    setDraftTodoItems(current => [...current, createTodoItem(trimmed)]);
    setNewTodoItemText('');
  };

  const removeDraftTodoItem = (todoItemId: string) => {
    setDraftTodoItems(current => current.filter(item => item.id !== todoItemId));
  };

  const toggleDraftTodoItem = (todoItemId: string) => {
    setDraftTodoItems(current =>
      current.map(item =>
        item.id === todoItemId ? { ...item, done: !item.done } : item,
      ),
    );
  };

  const moveDraftTodoItem = (todoItemId: string, direction: 'up' | 'down') => {
    setDraftTodoItems(current => {
      const index = current.findIndex(item => item.id === todoItemId);
      if (index === -1) {
        return current;
      }

      const targetIndex = direction === 'up' ? index - 1 : index + 1;
      if (targetIndex < 0 || targetIndex >= current.length) {
        return current;
      }

      const next = [...current];
      const [moved] = next.splice(index, 1);
      next.splice(targetIndex, 0, moved);
      return next;
    });
  };

  const handleNotificationOpen = (reminderId?: string) => {
    if (!reminderId) {
      return;
    }
    setPendingOpenReminderId(reminderId);
  };

  const extractReminderId = (value: unknown): string | undefined => {
    return typeof value === 'string' ? value : undefined;
  };

  useEffect(() => {
    const setupNotifications = async () => {
      await notifee.requestPermission();
      await notifee.createChannel({
        id: REMINDER_CHANNEL_ID,
        name: 'Reminders',
        importance: AndroidImportance.HIGH,
        visibility: AndroidVisibility.PUBLIC,
        sound: 'default',
        vibration: true,
      });

      if (Platform.OS === 'android') {
        Alert.alert(
          'Enable reminder pop-up permissions',
          'To show reminders over other apps and ring on time, allow notification pop-up/sound and alarms in Android settings.',
          [
            {
              text: 'Later',
              style: 'cancel',
            },
            {
              text: 'Open Settings',
              onPress: async () => {
                await notifee.openAlarmPermissionSettings().catch(() => {});
                await notifee.openNotificationSettings(REMINDER_CHANNEL_ID).catch(
                  () => {},
                );
                await Linking.openSettings().catch(() => {});
              },
            },
          ],
        );
      }
    };

    setupNotifications().catch(() => {});
  }, []);

  useEffect(() => {
    const unsubscribe = notifee.onForegroundEvent(({ type, detail }) => {
      if (type !== EventType.PRESS && type !== EventType.ACTION_PRESS) {
        return;
      }

      handleNotificationOpen(extractReminderId(detail.notification?.data?.reminderId));
    });

    notifee
      .getInitialNotification()
      .then(initialNotification => {
        handleNotificationOpen(
          extractReminderId(initialNotification?.notification?.data?.reminderId),
        );
      })
      .catch(() => {});

    return unsubscribe;
  }, []);

  useEffect(() => {
    const loadReminders = async () => {
      try {
        const storedValue = await AsyncStorage.getItem(REMINDERS_STORAGE_KEY);
        if (!storedValue) {
          return;
        }

        const parsedReminders: Reminder[] = JSON.parse(storedValue).map(
          (reminder: Partial<Reminder>) => ({
            id: reminder.id ?? `${Date.now()}-${Math.random()}`,
            title: reminder.title ?? 'Reminder',
            reminderTime: reminder.reminderTime ?? new Date().toISOString(),
            repeat:
              reminder.repeat === 'daily' ||
              reminder.repeat === 'weekly' ||
              reminder.repeat === 'custom'
                ? reminder.repeat
                : 'once',
            customRepeatMinutes:
              typeof reminder.customRepeatMinutes === 'number'
                ? reminder.customRepeatMinutes
                : undefined,
            noteType: reminder.noteType === 'todo' ? 'todo' : 'text',
            notes: reminder.notes ?? '',
            todoItems:
              reminder.noteType === 'todo'
                ? Array.isArray(reminder.todoItems)
                  ? reminder.todoItems
                  : parseLegacyTodoItems(reminder.notes ?? '')
                : [],
            notificationId: reminder.notificationId,
            completed: reminder.completed ?? false,
          }),
        );
        setReminders(parsedReminders);
      } catch {
      } finally {
        setHasLoadedReminders(true);
      }
    };

    loadReminders();
  }, []);

  useEffect(() => {
    if (!hasLoadedReminders) {
      return;
    }

    AsyncStorage.setItem(REMINDERS_STORAGE_KEY, JSON.stringify(reminders)).catch(
      () => {},
    );
  }, [hasLoadedReminders, reminders]);

  useEffect(() => {
    if (!pendingOpenReminderId) {
      return;
    }

    const reminderExists = reminders.some(reminder => reminder.id === pendingOpenReminderId);
    if (!reminderExists) {
      return;
    }

    openReminderDetails(pendingOpenReminderId);
    setPendingOpenReminderId(null);
  }, [pendingOpenReminderId, reminders]);

  const completedCount = useMemo(
    () => reminders.filter(reminder => reminder.completed).length,
    [reminders],
  );

  const scheduleReminderNotification = async (
    reminderId: string,
    title: string,
    notes: string,
    reminderDate: Date,
    repeat: RepeatOption,
    customMinutes?: number,
  ) => {
    let trigger: Trigger;

    if (repeat === 'custom') {
      trigger = {
        type: TriggerType.INTERVAL,
        interval: customMinutes ?? MIN_CUSTOM_REPEAT_MINUTES,
        timeUnit: TimeUnit.MINUTES,
      };
    } else {
      const timestampTrigger: TimestampTrigger = {
        type: TriggerType.TIMESTAMP,
        timestamp: reminderDate.getTime(),
        alarmManager: {
          allowWhileIdle: true,
        },
      };

      if (repeat === 'daily') {
        timestampTrigger.repeatFrequency = RepeatFrequency.DAILY;
      }

      if (repeat === 'weekly') {
        timestampTrigger.repeatFrequency = RepeatFrequency.WEEKLY;
      }

      trigger = timestampTrigger;
    }

    const notificationId = await notifee.createTriggerNotification(
      {
        title: 'Reminder',
        body: title,
        data: {
          reminderId,
        },
        android: {
          channelId: REMINDER_CHANNEL_ID,
          importance: AndroidImportance.HIGH,
          category: AndroidCategory.ALARM,
          visibility: AndroidVisibility.PUBLIC,
          sound: 'default',
          loopSound: true,
          fullScreenAction: {
            id: 'default',
          },
          pressAction: {
            id: 'default',
          },
        },
        ios: {
          sound: 'default',
        },
      },
      trigger,
    );

    return notificationId;
  };

  const saveReminder = async () => {
    const title = newReminder.trim();
    if (!title) {
      return;
    }

    const nextReminderDate = getNextReminderDate(selectedTime);
    const effectiveNoteType: NoteType = showNotes ? noteType : 'text';
    const effectiveCustomRepeatMinutes =
      repeatOption === 'custom'
        ? Math.max(customRepeatMinutes, MIN_CUSTOM_REPEAT_MINUTES)
        : undefined;

    if (repeatOption === 'custom' && customRepeatMinutes < MIN_CUSTOM_REPEAT_MINUTES) {
      Alert.alert(
        'Custom repeat updated',
        'Minimum supported custom repeat is every 30 minutes. We set it to 30 minutes.',
      );
    }

    const notes = showNotes && effectiveNoteType === 'text' ? newNotes.trim() : '';
    const todoItems =
      showNotes && effectiveNoteType === 'todo'
        ? draftTodoItems.map(item => ({ ...item }))
        : [];

    if (showNotes && effectiveNoteType === 'todo' && todoItems.length === 0) {
      Alert.alert('Add todo items', 'Please add at least one todo item before saving.');
      return;
    }

    if (editingReminderId) {
      const existingReminder = remindersRef.current.find(
        reminder => reminder.id === editingReminderId,
      );

      if (existingReminder?.notificationId) {
        await notifee.cancelNotification(existingReminder.notificationId);
      }

      const notificationId = await scheduleReminderNotification(
        editingReminderId,
        title,
        notes,
        nextReminderDate,
        repeatOption,
        effectiveCustomRepeatMinutes,
      );

      setReminders(current =>
        current.map(reminder =>
          reminder.id === editingReminderId
            ? {
                ...reminder,
                title,
                reminderTime: nextReminderDate.toISOString(),
                repeat: repeatOption,
                customRepeatMinutes: effectiveCustomRepeatMinutes,
                noteType: effectiveNoteType,
                notes,
                todoItems,
                notificationId,
              }
            : reminder,
        ),
      );
    } else {
      const reminderId = `${Date.now()}-${title}`;
      const notificationId = await scheduleReminderNotification(
        reminderId,
        title,
        notes,
        nextReminderDate,
        repeatOption,
        effectiveCustomRepeatMinutes,
      );

      setReminders(current => [
        ...current,
        {
          id: reminderId,
          title,
          reminderTime: nextReminderDate.toISOString(),
          repeat: repeatOption,
          customRepeatMinutes: effectiveCustomRepeatMinutes,
          noteType: effectiveNoteType,
          notes,
          todoItems,
          notificationId,
          completed: false,
        },
      ]);
    }

    setNewReminder('');
    setShowNotes(false);
    setNewNotes('');
    setNewTodoItemText('');
    setDraftTodoItems([]);
    setNoteType('text');
    setRepeatOption('once');
    setCustomRepeatMinutes(30);
    setEditingReminderId(null);
    setIsAddSectionVisible(false);
  };

  const onTimeChange = (event: DateTimePickerEvent, date?: Date) => {
    if (Platform.OS === 'android') {
      setShowTimePicker(false);
    }

    if (event.type === 'set' && date) {
      setSelectedTime(date);
    }
  };

  const selectedTimeLabel = selectedTime.toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
  });

  const resetReminderForm = () => {
    setEditingReminderId(null);
    setNewReminder('');
    setShowNotes(false);
    setNewNotes('');
    setDraftTodoItems([]);
    setNewTodoItemText('');
    setNoteType('text');
    setRepeatOption('once');
    setCustomRepeatMinutes(30);
    setIsAddSectionVisible(false);
  };

  const toggleReminder = (id: string) => {
    setReminders(current =>
      current.map(reminder =>
        reminder.id === id
          ? { ...reminder, completed: !reminder.completed }
          : reminder,
      ),
    );
  };

  const toggleTodoItemFromReminder = (reminderId: string, todoItemId: string) => {
    setReminders(current =>
      current.map(reminder =>
        reminder.id === reminderId
          ? {
              ...reminder,
              todoItems: reminder.todoItems.map(item =>
                item.id === todoItemId ? { ...item, done: !item.done } : item,
              ),
            }
          : reminder,
      ),
    );
  };

  const removeReminder = async (id: string) => {
    const reminderToRemove = reminders.find(reminder => reminder.id === id);
    if (reminderToRemove?.notificationId) {
      await notifee.cancelNotification(reminderToRemove.notificationId);
    }

    setReminders(current => current.filter(reminder => reminder.id !== id));
  };

  const confirmRemoveReminder = (id: string, title: string) => {
    Alert.alert('Delete reminder?', `Delete "${title}"? This action cannot be undone.`, [
      {
        text: 'Cancel',
        style: 'cancel',
      },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => {
          removeReminder(id).catch(() => {});
        },
      },
    ]);
  };

  const selectedTimeText = selectedReminder
    ? new Date(selectedReminder.reminderTime).toLocaleTimeString([], {
        hour: '2-digit',
        minute: '2-digit',
      })
    : '';

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.container}>
          <Appbar.Header elevated style={styles.headerBar}>
            <Appbar.Content
              title="My Reminders"
              subtitle={`${completedCount}/${reminders.length} completed`}
              titleStyle={styles.headerBarTitle}
              subtitleStyle={styles.headerBarSubtitle}
            />
            <Appbar.Action icon="alarm" onPress={() => {}} disabled />
          </Appbar.Header>

          {!isAddSectionVisible ? (
            <Button
              mode="contained"
              icon="plus"
              style={styles.openComposerButton}
              contentStyle={styles.openComposerButtonContent}
              onPress={() => setIsAddSectionVisible(true)}>
              Add Reminder
            </Button>
          ) : null}

          {isAddSectionVisible ? (
          <Card mode="elevated" style={styles.composerCard}>
            <ScrollView
              style={styles.composerScroll}
              contentContainerStyle={styles.composerScrollContent}
              showsVerticalScrollIndicator={false}
              nestedScrollEnabled
              keyboardShouldPersistTaps="handled">
            <Card.Content style={styles.composerContent}>
            <View style={styles.composerIntroWrap}>
              <Text variant="titleMedium" style={styles.composerTitle}>
                {editingReminderId ? 'Edit reminder' : 'Create reminder'}
              </Text>
              <Text variant="bodySmall" style={styles.composerSubtitle}>
                Set time, repeat, and optional notes or todo list.
              </Text>
            </View>
            <TextInput
              mode="outlined"
              label="Reminder title"
              value={newReminder}
              onChangeText={setNewReminder}
              style={styles.input}
            />

            <View style={styles.notesToggleRow}>
              <Checkbox
                status={showNotes ? 'checked' : 'unchecked'}
                onPress={() => setShowNotes(current => !current)}
              />
              <Text variant="bodyMedium" style={styles.notesToggleText}>
                Add notes
              </Text>
            </View>

            {showNotes ? (
              <SegmentedButtons
                value={noteType}
                onValueChange={value => {
                  const nextType = value as NoteType;
                  setNoteType(nextType);
                  if (nextType === 'text') {
                    setDraftTodoItems([]);
                    setNewTodoItemText('');
                  } else {
                    setNewNotes('');
                  }
                }}
                buttons={[
                  {
                    value: 'text',
                    label: 'Text Note',
                    style: styles.segmentedButton,
                  },
                  {
                    value: 'todo',
                    label: 'Todo List',
                    style: styles.segmentedButton,
                  },
                ]}
                style={styles.noteTypeButtons}
              />
            ) : null}

            {showNotes && noteType === 'text' ? (
              <TextInput
                mode="outlined"
                label="Text notes (optional)"
                value={newNotes}
                onChangeText={setNewNotes}
                multiline
                style={styles.input}
              />
            ) : null}

            {showNotes && noteType === 'todo' ? (
              <View style={styles.todoEditorContainer}>
                <Text variant="labelLarge" style={styles.todoHeaderText}>
                  Build your todo list
                </Text>
                <TextInput
                  mode="outlined"
                  label="Add todo item"
                  value={newTodoItemText}
                  onChangeText={setNewTodoItemText}
                  onSubmitEditing={addDraftTodoItem}
                  returnKeyType="done"
                  style={styles.input}
                />
                <Button
                  mode="outlined"
                  onPress={addDraftTodoItem}
                  style={styles.addTodoButton}
                  disabled={!newTodoItemText.trim()}>
                  Add Item
                </Button>

                {draftTodoItems.length > 0 ? (
                  <FlatList
                    data={draftTodoItems}
                    keyExtractor={item => item.id}
                    scrollEnabled={false}
                    renderItem={({ item, index }) => (
                      <View style={styles.todoRow}>
                        <Checkbox
                          status={item.done ? 'checked' : 'unchecked'}
                          onPress={() => toggleDraftTodoItem(item.id)}
                        />
                        <Text style={[styles.todoText, item.done ? styles.doneText : undefined]}>
                          {item.text}
                        </Text>
                        <IconButton
                          icon="arrow-up"
                          size={18}
                          disabled={index === 0}
                          onPress={() => moveDraftTodoItem(item.id, 'up')}
                        />
                        <IconButton
                          icon="arrow-down"
                          size={18}
                          disabled={index === draftTodoItems.length - 1}
                          onPress={() => moveDraftTodoItem(item.id, 'down')}
                        />
                        <IconButton
                          icon="delete-outline"
                          size={18}
                          onPress={() => removeDraftTodoItem(item.id)}
                        />
                      </View>
                    )}
                  />
                ) : (
                  <Text variant="bodySmall" style={styles.todoEmptyText}>
                    Add at least one item to save this todo reminder.
                  </Text>
                )}
              </View>
            ) : null}

            <Button
              mode="outlined"
              icon="clock-outline"
              style={styles.timeButton}
              onPress={() => setShowTimePicker(true)}>
              Remind at {selectedTimeLabel}
            </Button>

            <SegmentedButtons
              value={repeatOption}
              onValueChange={value => setRepeatOption(value as RepeatOption)}
              buttons={[
                {
                  value: 'once',
                  label: 'Once',
                  style: styles.segmentedButton,
                },
                {
                  value: 'daily',
                  label: 'Daily',
                  style: styles.segmentedButton,
                },
                {
                  value: 'weekly',
                  label: 'Weekly',
                  style: styles.segmentedButton,
                },
                {
                  value: 'custom',
                  label: 'Custom',
                  style: styles.segmentedButton,
                },
              ]}
              style={styles.repeatButtons}
            />

            {repeatOption === 'custom' ? (
              <View style={styles.customRepeatWrap}>
                {CUSTOM_REPEAT_OPTIONS.map(option => (
                  <Chip
                    key={option}
                    selected={customRepeatMinutes === option}
                    mode="outlined"
                    onPress={() => setCustomRepeatMinutes(option)}
                    style={styles.customRepeatChip}>
                    {option >= 60 && option % 60 === 0
                      ? `${option / 60}h`
                      : `${option}m`}
                  </Chip>
                ))}
                <Text variant="bodySmall" style={styles.customRepeatHint}>
                  Custom repeat supports 30m to 6h.
                </Text>
              </View>
            ) : null}

            {showTimePicker ? (
              <DateTimePicker
                mode="time"
                value={selectedTime}
                onChange={onTimeChange}
                display={Platform.OS === 'ios' ? 'spinner' : 'default'}
              />
            ) : null}

            <Button
              mode="contained"
              style={styles.saveReminderButton}
              contentStyle={styles.saveReminderButtonContent}
              onPress={() => saveReminder().catch(() => {})}>
              {editingReminderId ? 'Save Reminder' : 'Set Reminder'}
            </Button>

            <Button mode="text" style={styles.cancelEditButton} onPress={resetReminderForm}>
              Cancel
            </Button>
            </Card.Content>
            </ScrollView>
          </Card>
          ) : null}

          <FlatList
          data={reminders}
          keyExtractor={item => item.id}
          contentContainerStyle={styles.listContent}
          ListEmptyComponent={
            <Text variant="bodyMedium" style={styles.emptyText}>
              No reminders yet.
            </Text>
          }
          renderItem={({ item }) => (
            <Card
              mode="contained"
              style={[styles.card, item.completed ? styles.cardCompleted : undefined]}
              onPress={() => openReminderDetails(item.id)}>
              <Card.Content style={styles.cardContent}>
                <Checkbox
                  status={item.completed ? 'checked' : 'unchecked'}
                  onPress={() => toggleReminder(item.id)}
                />
                <View style={styles.reminderTextContainer}>
                  <Text
                    variant="bodyLarge"
                    style={[styles.reminderTitleText, item.completed ? styles.doneText : undefined]}>
                    {item.title}
                  </Text>
                  <View style={styles.chipRow}>
                    <Chip compact icon="clock-outline" style={styles.detailChip}>
                      {new Date(item.reminderTime).toLocaleTimeString([], {
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </Chip>
                    <Chip compact icon="repeat" style={styles.detailChip}>
                      {getRepeatDisplayLabel(item.repeat ?? 'once', item.customRepeatMinutes)}
                    </Chip>
                    <Chip
                      compact
                      icon={item.noteType === 'todo' ? 'format-list-checks' : 'note-text-outline'}
                      style={styles.detailChip}>
                      {item.noteType === 'todo' ? 'Todo List' : 'Text Note'}
                    </Chip>
                  </View>
                </View>
                <IconButton
                  icon="delete-outline"
                  onPress={() => confirmRemoveReminder(item.id, item.title)}
                />
              </Card.Content>
            </Card>
          )}
          />

          <Portal>
          <Dialog visible={isDetailsDialogVisible} onDismiss={closeReminderDetails}>
            <Dialog.Title>Reminder Details</Dialog.Title>
            <Dialog.Content>
              <Text variant="titleMedium">{selectedReminder?.title ?? ''}</Text>
              <View style={styles.dialogMetaRow}>
                <Chip compact icon="clock-outline" style={styles.dialogMetaChip}>
                  {selectedTimeText}
                </Chip>
                <Chip compact icon="repeat" style={styles.dialogMetaChip}>
                  {getRepeatDisplayLabel(
                    selectedReminder?.repeat ?? 'once',
                    selectedReminder?.customRepeatMinutes,
                  )}
                </Chip>
                <Chip
                  compact
                  icon={
                    selectedReminder?.noteType === 'todo'
                      ? 'format-list-checks'
                      : 'note-text-outline'
                  }
                  style={styles.dialogMetaChip}>
                  {selectedReminder?.noteType === 'todo' ? 'Todo List' : 'Text Note'}
                </Chip>
              </View>

              {selectedReminder?.noteType === 'text' ? (
                <Card mode="contained" style={styles.dialogNoteCard}>
                  <Card.Content>
                    <Text variant="labelMedium">Notes</Text>
                    <Text variant="bodyMedium" style={styles.dialogField}>
                      {selectedReminder?.notes ? selectedReminder.notes : 'No notes'}
                    </Text>
                  </Card.Content>
                </Card>
              ) : (
                <View style={styles.dialogTodoContainer}>
                  <Text variant="labelMedium" style={styles.dialogTodoCount}>
                    {selectedReminder?.todoItems.filter(item => item.done).length ?? 0}/
                    {selectedReminder?.todoItems.length ?? 0} completed
                  </Text>
                  {selectedReminder && selectedReminder.todoItems.length > 0 ? (
                    selectedReminder.todoItems.map(todoItem => (
                      <View key={todoItem.id} style={styles.dialogTodoRow}>
                        <Checkbox
                          status={todoItem.done ? 'checked' : 'unchecked'}
                          onPress={() =>
                            toggleTodoItemFromReminder(selectedReminder.id, todoItem.id)
                          }
                        />
                        <Text
                          style={[
                            styles.todoText,
                            todoItem.done ? styles.doneText : undefined,
                          ]}>
                          {todoItem.text}
                        </Text>
                      </View>
                    ))
                  ) : (
                    <Text variant="bodyMedium" style={styles.dialogField}>
                      No todo items
                    </Text>
                  )}
                </View>
              )}
            </Dialog.Content>
            <Dialog.Actions style={styles.dialogActions}>
              <IconButton
                icon="pencil"
                containerColor="rgba(138,180,248,0.24)"
                style={styles.dialogActionIcon}
                onPress={() => {
                  if (selectedReminder) {
                    startEditingReminder(selectedReminder);
                  }
                }}
              />
              <IconButton
                icon="check"
                containerColor="rgba(210,227,252,0.18)"
                style={styles.dialogActionIcon}
                onPress={closeReminderDetails}
              />
            </Dialog.Actions>
          </Dialog>
          </Portal>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#080A0F',
  },
  container: {
    flex: 1,
    paddingHorizontal: 16,
    paddingTop: 8,
  },
  headerBar: {
    marginBottom: 12,
    borderRadius: 16,
    backgroundColor: '#1B212B',
  },
  headerBarTitle: {
    fontSize: 24,
  },
  headerBarSubtitle: {
    opacity: 0.8,
  },
  title: {
    marginBottom: 2,
    color: '#F1F5FF',
  },
  subtitle: {
    color: '#A9B4C8',
  },
  composerCard: {
    borderRadius: 16,
    marginBottom: 12,
    backgroundColor: '#1B212B',
    elevation: 1,
    maxHeight: '72%',
  },
  composerScroll: {
    flexGrow: 0,
  },
  composerScrollContent: {
    paddingBottom: 8,
  },
  composerContent: {
    gap: 2,
  },
  composerIntroWrap: {
    marginBottom: 12,
  },
  composerTitle: {
    color: '#EAF1FF',
    marginBottom: 2,
  },
  composerSubtitle: {
    color: '#A6B2C7',
  },
  openComposerButton: {
    marginBottom: 10,
    borderRadius: 14,
  },
  openComposerButtonContent: {
    minHeight: 46,
  },
  input: {
    marginBottom: 12,
    backgroundColor: '#1F2732',
  },
  noteTypeButtons: {
    marginBottom: 12,
    backgroundColor: '#222B37',
    borderRadius: 10,
  },
  segmentedButton: {
    borderColor: 'transparent',
  },
  notesToggleRow: {
    alignItems: 'center',
    flexDirection: 'row',
    marginBottom: 8,
    marginTop: -6,
  },
  notesToggleText: {
    opacity: 0.95,
    color: '#E6E6E6',
  },
  repeatButtons: {
    marginBottom: 12,
    backgroundColor: '#222B37',
    borderRadius: 10,
  },
  customRepeatWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 12,
  },
  customRepeatChip: {
    alignSelf: 'flex-start',
    backgroundColor: '#222B37',
  },
  customRepeatHint: {
    marginTop: 4,
    opacity: 0.8,
    color: '#D2D2D2',
    width: '100%',
  },
  todoEditorContainer: {
    marginBottom: 12,
  },
  addTodoButton: {
    marginBottom: 8,
  },
  todoHeaderText: {
    marginBottom: 8,
  },
  todoEmptyText: {
    marginBottom: 8,
    opacity: 0.7,
  },
  timeButton: {
    marginBottom: 12,
  },
  saveReminderButton: {
    marginTop: 4,
    borderRadius: 14,
  },
  saveReminderButtonContent: {
    minHeight: 46,
  },
  cancelEditButton: {
    marginBottom: 8,
    marginTop: 4,
  },
  listContent: {
    paddingVertical: 16,
    gap: 10,
  },
  emptyText: {
    marginTop: 20,
    color: '#BDBDBD',
  },
  card: {
    borderRadius: 12,
    backgroundColor: '#1B212B',
  },
  cardCompleted: {
    opacity: 0.85,
  },
  cardContent: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    gap: 8,
  },
  reminderTextContainer: {
    flex: 1,
  },
  reminderTitleText: {
    color: '#F1F1F1',
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 6,
  },
  detailChip: {
    alignSelf: 'flex-start',
    backgroundColor: '#242C38',
  },
  timeText: {
    marginTop: 4,
    opacity: 0.75,
  },
  noteTextPreview: {
    marginTop: 4,
    opacity: 0.8,
    color: '#BCC6D9',
  },
  todoRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 8,
    backgroundColor: TODO_ROW_BG_COLOR,
    borderRadius: 10,
    marginBottom: 6,
    paddingHorizontal: 4,
  },
  todoText: {
    flex: 1,
  },
  todoPreviewItem: {
    marginTop: 2,
    opacity: 0.8,
    color: '#B9C4D8',
  },
  dialogField: {
    marginTop: 8,
  },
  dialogMetaRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 10,
  },
  dialogMetaChip: {
    alignSelf: 'flex-start',
    backgroundColor: '#242C38',
  },
  dialogNoteCard: {
    marginTop: 10,
    borderRadius: 12,
    backgroundColor: '#242C38',
  },
  dialogTodoContainer: {
    marginTop: 8,
  },
  dialogTodoCount: {
    marginBottom: 8,
    opacity: 0.8,
  },
  dialogTodoRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 8,
    borderRadius: 10,
    backgroundColor: 'rgba(168,199,250,0.08)',
    marginBottom: 6,
  },
  dialogActions: {
    paddingHorizontal: 12,
    paddingBottom: 12,
  },
  dialogActionIcon: {
    borderRadius: 20,
  },
  doneText: {
    color: '#8892A4',
    textDecorationLine: 'line-through',
  },
});

export default App;
