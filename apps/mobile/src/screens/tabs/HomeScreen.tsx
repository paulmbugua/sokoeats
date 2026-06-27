import React from 'react';
import { View, Text, ScrollView, TextInput } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { colors, spacing } from '../../theme/tokens';
import Card from '../../components/Card';
import PrimaryButton from '../../components/PrimaryButton';
import { categories as seedCategories } from '@myhandymanapp/shared/api/kenya-data';

export default function HomeScreen({ navigation }: any) {
  return (
    <View style={{ flex: 1, backgroundColor: 'white' }}>
      <ScrollView contentContainerStyle={{ paddingBottom: 24 }}>
        <LinearGradient colors={[colors.primary, colors.primaryDark]} style={{ paddingTop: 16, paddingHorizontal: 18, paddingBottom: 18 }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <Text style={{ color: 'white', fontWeight: '700' }}>📍 Kilimani</Text>
            <Text style={{ color: 'white', fontWeight: '800' }}>🔔 3</Text>
          </View>
          <Text style={{ color: 'white', fontSize: 28, fontWeight: '900', marginTop: 10 }}>Hello, John! 👋</Text>
          <View style={{ backgroundColor: 'white', borderRadius: 14, paddingHorizontal: 12, marginTop: 12 }}>
            <TextInput placeholder="What do you need fixed today?" placeholderTextColor={colors.muted} style={{ paddingVertical: 12, fontSize: 15 }} />
          </View>
        </LinearGradient>

        <View style={{ paddingHorizontal: 18, marginTop: 12 }}>
          <Card style={{ backgroundColor: '#FF6A00', borderColor: '#FF6A00', padding: 16 }}>
            <Text style={{ color: 'white', fontWeight: '900', fontSize: 16 }}>10% Off First Job</Text>
            <Text style={{ color: 'white', marginTop: 4, opacity: 0.95 }}>Use code: FIRST10</Text>
          </Card>

          <Text style={{ marginTop: 16, fontWeight: '900', fontSize: 16 }}>Categories</Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 10 }}>
            {(seedCategories || []).slice(0, 12).map((c: any) => (
              <Card key={c.id} style={{ width: '30%', alignItems: 'center', paddingVertical: 14 }}>
                <Text style={{ fontSize: 12, fontWeight: '800', textAlign: 'center' }}>{c.name}</Text>
              </Card>
            ))}
          </View>

          <Text style={{ marginTop: 16, fontWeight: '900', fontSize: 16 }}>Recent Requests</Text>
          <View style={{ marginTop: 10 }}>
            <Card style={{ marginBottom: 10 }}>
              <Text style={{ fontWeight: '900' }}>Leaking tap repair</Text>
              <Text style={{ color: colors.green, fontWeight: '800', marginTop: 6 }}>3 quotes received →</Text>
            </Card>
            <Card>
              <Text style={{ fontWeight: '900' }}>Wall painting 2-bedroom</Text>
              <Text style={{ color: colors.muted, marginTop: 6 }}>In Progress</Text>
            </Card>
          </View>

          <View style={{ marginTop: 16 }}>
            <PrimaryButton title="Request a Quote" onPress={() => navigation.navigate('CategorySelect')} />
          </View>
        </View>
      </ScrollView>
    </View>
  );
}
