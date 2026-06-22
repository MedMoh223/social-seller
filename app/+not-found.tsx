import { Link, Stack } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';

export default function NotFoundScreen() {
  return (
    <>
      <Stack.Screen options={{ title: 'Oops !' }} />
      <View style={styles.container}>
        <Text style={styles.title}>Cette page n&apos;existe pas.</Text>
        <Link href="/" style={styles.link}>
          <Text>Retour à l&apos;accueil</Text>
        </Link>
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 20 },
  title: { fontSize: 20, fontWeight: '600' },
  link: { marginTop: 16, paddingVertical: 12 },
});
