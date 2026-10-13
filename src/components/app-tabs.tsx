import { NativeTabs } from 'expo-router/unstable-native-tabs';

import { COLORS } from '@/constants/colors';
import { useRole } from '@/lib/auth';
import { canCreateEvents, canManageAll } from '@/lib/roles';

export default function AppTabs() {
  const { role } = useRole();
  const showEventTab = canCreateEvents(role);
  const showAdminTab = canManageAll(role);

  return (
    <NativeTabs
      backgroundColor={COLORS.card}
      indicatorColor={COLORS.primary}
      labelStyle={{ selected: { color: COLORS.primary } }}>
      <NativeTabs.Trigger name="index">
        <NativeTabs.Trigger.Label>Events</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon
          sf={{ default: 'house', selected: 'house.fill' }}
          md={{ default: 'home', selected: 'home' }}
        />
      </NativeTabs.Trigger>

      <NativeTabs.Trigger name="scan">
        <NativeTabs.Trigger.Label>Scan</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon
          sf={{ default: 'qrcode', selected: 'qrcode' }}
          md={{ default: 'qr_code_scanner', selected: 'qr_code_scanner' }}
        />
      </NativeTabs.Trigger>

      <NativeTabs.Trigger name="history">
        <NativeTabs.Trigger.Label>History</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon
          sf={{ default: 'clock', selected: 'clock.fill' }}
          md={{ default: 'history', selected: 'history' }}
        />
      </NativeTabs.Trigger>

      {/* Event tab: teachers + admins — create/manage events + QR. */}
      <NativeTabs.Trigger name="teacher" hidden={!showEventTab}>
        <NativeTabs.Trigger.Label>Event</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon
          sf={{ default: 'calendar', selected: 'calendar' }}
          md={{ default: 'event', selected: 'event' }}
        />
      </NativeTabs.Trigger>

      {/* Admin tab: administrators only — manage users/events/records/reports. */}
      <NativeTabs.Trigger name="admin" hidden={!showAdminTab}>
        <NativeTabs.Trigger.Label>Admin</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon
          sf={{ default: 'shield', selected: 'shield.fill' }}
          md={{ default: 'admin_panel_settings', selected: 'admin_panel_settings' }}
        />
      </NativeTabs.Trigger>

      <NativeTabs.Trigger name="profile">
        <NativeTabs.Trigger.Label>Profile</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon
          sf={{ default: 'person', selected: 'person.fill' }}
          md={{ default: 'person', selected: 'person' }}
        />
      </NativeTabs.Trigger>

    </NativeTabs>
  );
}
