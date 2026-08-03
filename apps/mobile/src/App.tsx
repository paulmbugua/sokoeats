import React, { useMemo, useState } from 'react';
import { SafeAreaView, ScrollView, StatusBar, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
const vendors = ['Urban Bowls', 'Mama Nia Kitchen', 'Taco Moto'];
const menu = [
  { name: 'Glow Bowl', vendor: 'Urban Bowls', price: 980, tag: 'Avocado, chicken, greens' },
  { name: 'Nyama Plate', vendor: 'Mama Nia Kitchen', price: 860, tag: 'Beef stew, sukuma, chapati' },
  { name: 'Fire Trio Tacos', vendor: 'Taco Moto', price: 790, tag: 'Salsa verde, smoky crema' },
];
export default function App() {
  const [vendor, setVendor] = useState(vendors[0]);
  const [cart, setCart] = useState<Record<string, number>>({});
  const items = menu.filter((item) => item.vendor === vendor);
  const subtotal = useMemo(() => menu.reduce((sum, item) => sum + (cart[item.name] || 0) * item.price, 0), [cart]);
  return <SafeAreaView style={styles.safe}><StatusBar barStyle="light-content" /><ScrollView contentContainerStyle={styles.page}>
    <View style={styles.hero}><Text style={styles.brand}>Sokoeats</Text><Text style={styles.title}>Order lunch without the noise.</Text><Text style={styles.copy}>Browse vendors, build a basket, and keep support one tap away.</Text></View>
    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.tabs}>{vendors.map((name) => <TouchableOpacity key={name} onPress={() => setVendor(name)} style={[styles.tab, vendor === name && styles.tabActive]}><Text style={[styles.tabText, vendor === name && styles.tabTextActive]}>{name}</Text></TouchableOpacity>)}</ScrollView>
    <View style={styles.section}><Text style={styles.heading}>{vendor}</Text>{items.map((item) => <View style={styles.card} key={item.name}><View style={{ flex: 1 }}><Text style={styles.item}>{item.name}</Text><Text style={styles.muted}>{item.tag}</Text><Text style={styles.price}>KES {item.price.toLocaleString('en-KE')}</Text></View><TouchableOpacity style={styles.add} onPress={() => setCart((c) => ({ ...c, [item.name]: (c[item.name] || 0) + 1 }))}><Text style={styles.addText}>Add</Text></TouchableOpacity></View>)}</View>
    <View style={styles.basket}><Text style={styles.heading}>Basket</Text><Text style={styles.muted}>Subtotal</Text><Text style={styles.total}>KES {subtotal.toLocaleString('en-KE')}</Text><TouchableOpacity style={styles.checkout}><Text style={styles.checkoutText}>Place demo order</Text></TouchableOpacity></View>
  </ScrollView></SafeAreaView>;
}
const styles = StyleSheet.create({ safe:{flex:1,backgroundColor:'#10231d'}, page:{paddingBottom:28,backgroundColor:'#fbfaf6'}, hero:{backgroundColor:'#10231d',padding:24,paddingTop:44}, brand:{color:'#f7bd42',fontWeight:'900',fontSize:18}, title:{color:'white',fontWeight:'900',fontSize:40,lineHeight:42,marginTop:18}, copy:{color:'#dbe9e1',fontSize:16,marginTop:12}, tabs:{padding:16}, tab:{backgroundColor:'white',borderRadius:8,paddingVertical:12,paddingHorizontal:14,marginRight:10,borderWidth:1,borderColor:'#e7decf'}, tabActive:{backgroundColor:'#f7bd42',borderColor:'#f7bd42'}, tabText:{fontWeight:'800',color:'#26352d'}, tabTextActive:{color:'#10231d'}, section:{paddingHorizontal:16}, heading:{fontWeight:'900',fontSize:22,color:'#18251f',marginBottom:12}, card:{backgroundColor:'white',borderRadius:8,padding:16,marginBottom:12,borderWidth:1,borderColor:'#e7decf',flexDirection:'row',gap:12,alignItems:'center'}, item:{fontWeight:'900',fontSize:18,color:'#18251f'}, muted:{color:'#68776e',marginTop:4}, price:{fontWeight:'900',marginTop:10,color:'#dc6b21'}, add:{backgroundColor:'#17372d',borderRadius:8,paddingVertical:10,paddingHorizontal:14}, addText:{color:'white',fontWeight:'900'}, basket:{margin:16,backgroundColor:'white',borderRadius:8,padding:16,borderWidth:1,borderColor:'#e7decf'}, total:{fontSize:28,fontWeight:'900',marginVertical:8}, checkout:{backgroundColor:'#f7bd42',borderRadius:8,padding:14,alignItems:'center'}, checkoutText:{fontWeight:'900',color:'#10231d'} });
