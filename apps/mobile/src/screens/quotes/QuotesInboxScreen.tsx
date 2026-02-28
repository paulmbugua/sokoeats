import React, { useState } from 'react';
import { View, Text, ScrollView } from 'react-native';
import { colors, spacing } from '../../theme/tokens';
import Chip from '../../components/Chip';
import Card from '../../components/Card';
import PrimaryButton from '../../components/PrimaryButton';
import SecondaryButton from '../../components/SecondaryButton';

const quotes = [
  { id: 'q1', name: 'James Kamau', rating: 4.9, reviews: 127, total: 3000, labor: 1800, materials: 900, transport: 300, distance: 2.3, eta: 10, badge: 'Best Value' },
  { id: 'q2', name: 'Peter Omondi', rating: 4.8, reviews: 89, total: 3500, labor: 2100, materials: 1050, transport: 350, distance: 3.1, eta: 15, badge: null },
  { id: 'q3', name: 'John Mwangi', rating: 4.7, reviews: 64, total: 4000, labor: 2400, materials: 1200, transport: 400, distance: 5.8, eta: 30, badge: null },
];

export default function QuotesInboxScreen({ navigation }: any) {
  const [filter, setFilter] = useState<'Price' | 'Rating' | 'Soonest'>('Price');

  return (
    <View style={{ flex: 1, backgroundColor: 'white' }}>
      <View style={{ padding: spacing.xl, paddingBottom: 10 }}>
        <Text style={{ fontWeight: '900', fontSize: 16 }}>Quotes Received</Text>
        <Text style={{ color: colors.muted, marginTop: 4 }}>5 providers responded</Text>
        <View style={{ flexDirection: 'row', gap: 10, marginTop: 12 }}>
          <Chip label="Price" active={filter === 'Price'} onPress={() => setFilter('Price')} />
          <Chip label="Rating" active={filter === 'Rating'} onPress={() => setFilter('Rating')} />
          <Chip label="Soonest" active={filter === 'Soonest'} onPress={() => setFilter('Soonest')} />
        </View>
      </View>

      <ScrollView contentContainerStyle={{ padding: spacing.xl, paddingTop: 0, paddingBottom: 24 }}>
        <Card style={{ backgroundColor: colors.primary, borderColor: colors.primary }}>
          <Text style={{ color: 'white', fontWeight: '900' }}>Leaking tap repair</Text>
          <Text style={{ color: 'rgba(255,255,255,0.9)', marginTop: 6 }}>Kilimani, Nairobi · ASAP</Text>
        </Card>

        {quotes.map((q) => (
          <Card key={q.id} style={{ marginTop: 12 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
              <View style={{ flex: 1, paddingRight: 10 }}>
                <Text style={{ fontWeight: '900', fontSize: 16 }}>{q.name}</Text>
                <Text style={{ color: colors.muted, marginTop: 6 }}>⭐ {q.rating} ({q.reviews}) · {q.distance} km · Under {q.eta} min</Text>
              </View>
              <View>
                <Text style={{ fontWeight: '900', fontSize: 16 }}>KES {q.total.toLocaleString()}</Text>
                <Text style={{ color: colors.muted, textAlign: 'right' }}>Total</Text>
              </View>
            </View>

            {q.badge ? (
              <View style={{ alignSelf: 'flex-end', marginTop: 8, backgroundColor: colors.greenSoft, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999 }}>
                <Text style={{ color: colors.green, fontWeight: '900', fontSize: 12 }}>✓ {q.badge}</Text>
              </View>
            ) : null}

            <View style={{ marginTop: 10 }}>
              <Text style={{ color: colors.muted }}>Labor: KES {q.labor.toLocaleString()}</Text>
              <Text style={{ color: colors.muted }}>Materials (est.): KES {q.materials.toLocaleString()}</Text>
              <Text style={{ color: colors.muted }}>Transport: KES {q.transport.toLocaleString()}</Text>
            </View>

            <View style={{ flexDirection: 'row', gap: 10, marginTop: 12 }}>
              <SecondaryButton title="View Details" onPress={() => navigation.navigate('QuoteDetail', { quoteId: q.id })} style={{ flex: 1 }} />
              <PrimaryButton title="Accept Quote" onPress={() => navigation.navigate('BookingConfirmed', { bookingId: 'b1', jobId: 'job_demo_1', quoteId: q.id })} style={{ flex: 1 }} />
            </View>
          </Card>
        ))}
      </ScrollView>
    </View>
  );
}
