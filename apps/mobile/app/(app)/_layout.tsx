import { Redirect, Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { ActivityIndicator, View } from 'react-native';
import { useSession } from '../../src/session/SessionProvider';
import { tokens } from '../../src/theme/tokens';
import { useTheme } from '../../src/theme/ThemeProvider';

type IconName = keyof typeof Ionicons.glyphMap;

const ICONS: Record<string, { active: IconName; inactive: IconName }> = {
  today: { active: 'today', inactive: 'today-outline' },
  cards: { active: 'repeat', inactive: 'repeat-outline' },
  practice: { active: 'school', inactive: 'school-outline' },
  library: { active: 'library', inactive: 'library-outline' },
  you: { active: 'person', inactive: 'person-outline' },
};

const TABS = ['today', 'cards', 'practice', 'library', 'you'] as const;

const TITLES: Record<(typeof TABS)[number], string> = {
  today: 'Hoy',
  cards: 'Repasos',
  practice: 'Práctica',
  library: 'Biblioteca',
  you: 'Tú',
};

function title(name: (typeof TABS)[number]): string {
  return TITLES[name];
}

export default function AppLayout() {
  const { session, loading } = useSession();
  const { colors } = useTheme();

  if (loading) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator />
      </View>
    );
  }

  if (!session) {
    return <Redirect href="/sign-in" />;
  }

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.vermilion,
        tabBarInactiveTintColor: colors.textMuted,
        tabBarStyle: {
          backgroundColor: colors.bg,
          borderTopColor: colors.border,
          borderTopWidth: 1,
        },
        tabBarLabelStyle: {
          fontSize: tokens.fontSize.xs,
          fontWeight: '600',
          marginTop: 2,
        },
        tabBarHideOnKeyboard: true,
      }}
    >
      {TABS.map((name) => (
        <Tabs.Screen
          key={name}
          name={name}
          options={{
            title: title(name),
            tabBarIcon: ({ focused, color, size }) => (
              <Ionicons
                name={focused ? ICONS[name].active : ICONS[name].inactive}
                size={size}
                color={color}
              />
            ),
          }}
        />
      ))}
      <Tabs.Screen
        name="progress"
        options={{
          href: null,
        }}
      />
      <Tabs.Screen
        name="diagnostic"
        options={{
          href: null,
        }}
      />
    </Tabs>
  );
}
