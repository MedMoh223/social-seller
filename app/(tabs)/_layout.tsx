import { Feather } from '@expo/vector-icons';
import { Tabs } from 'expo-router';
import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';

const ACTIVE_COLOR = '#6366F1';
const INACTIVE_COLOR = '#94A3B8';

// Statuts considérés comme "terminés" — exclus du badge commandes.
// Modifier cette liste pour ajuster la logique du badge.
const ORDERS_DONE_STATUSES = ['delivered', 'cancelled'];

export default function TabsLayout() {
  const [unreadCount, setUnreadCount] = useState(0);
  const [activeOrdersCount, setActiveOrdersCount] = useState(0);

  useEffect(() => {
    let convChannel: ReturnType<typeof supabase.channel> | null = null;
    let ordersChannel: ReturnType<typeof supabase.channel> | null = null;

    async function loadUnread() {
      const { count } = await supabase
        .from('messages')
        .select('id', { count: 'exact', head: true })
        .eq('direction', 'inbound')
        .eq('is_read', false);
      setUnreadCount(count ?? 0);
    }

    async function loadActiveOrders() {
      const { count } = await supabase
        .from('orders')
        .select('id', { count: 'exact', head: true })
        .not('status', 'in', `(${ORDERS_DONE_STATUSES.join(',')})`);
      setActiveOrdersCount(count ?? 0);
    }

    loadUnread();
    loadActiveOrders();

    // Nom de canal unique par montage — évite "cannot add callbacks after
    // subscribe()" si le composant remonte (navigation, strict mode dev).
    const ts = Date.now();
    convChannel = supabase
      .channel(`unread-badge-${ts}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'messages' }, loadUnread)
      .subscribe();

    ordersChannel = supabase
      .channel(`orders-badge-${ts}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, loadActiveOrders)
      .subscribe();

    return () => {
      if (convChannel) supabase.removeChannel(convChannel);
      if (ordersChannel) supabase.removeChannel(ordersChannel);
    };
  }, []);

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: ACTIVE_COLOR,
        tabBarInactiveTintColor: INACTIVE_COLOR,
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Dashboard',
          tabBarIcon: ({ color, size }) => <Feather name="home" size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="inbox"
        options={{
          title: 'Inbox',
          tabBarBadge: unreadCount > 0 ? unreadCount : undefined,
          tabBarIcon: ({ color, size }) => (
            <Feather name="message-square" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen name="clients" options={{ href: null }} />
      <Tabs.Screen
        name="orders"
        options={{
          title: 'Commandes',
          tabBarBadge: activeOrdersCount > 0 ? activeOrdersCount : undefined,
          tabBarIcon: ({ color, size }) => (
            <Feather name="shopping-cart" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen name="stock" options={{ href: null }} />
      <Tabs.Screen
        name="stats"
        options={{
          title: 'Stats',
          tabBarIcon: ({ color, size }) => (
            <Feather name="bar-chart-2" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen name="channels" options={{ href: null }} />
      <Tabs.Screen
        name="profile"
        options={{
          title: 'Profil',
          tabBarIcon: ({ color, size }) => <Feather name="user" size={size} color={color} />,
        }}
      />
    </Tabs>
  );
}
