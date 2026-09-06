import React, { useEffect, useState } from 'react';
import { Modal, ScrollView, Share, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppIcon } from './AppIcon';

export type TermsConsent = { accepted: true; role: string; version: string; hash: string };
type TermsDocument = { role: string; title: string; version: string; hash: string; effectiveDate: string; operator: string; address: string; contact: string; sections: { title: string; body: string }[] };
type Props = { role: string; value: TermsConsent | null; onChange: (value: TermsConsent | null) => void; api: <T>(path: string) => Promise<T>; accepted?: boolean };
export function PartnerTerms({ role, value, onChange, api, accepted = false }: Props) {
  const insets = useSafeAreaInsets();
  const [document, setDocument] = useState<TermsDocument | null>(null);
  const [visible, setVisible] = useState(false);
  const [opened, setOpened] = useState(false);
  const [error, setError] = useState('');
  const [retry, setRetry] = useState(0);
  const [acceptedAt, setAcceptedAt] = useState('');
  const openAcceptedCopy = async () => {
    try {
      const result = await api<{ acceptances: { role: string; document: TermsDocument; accepted_at: string }[] }>('/api/auth/terms/acceptances');
      const receipt = result.acceptances.find((entry) => entry.role === role);
      if (!receipt) throw new Error('No acceptance record found.');
      setDocument(receipt.document); setAcceptedAt(receipt.accepted_at); setVisible(true);
    } catch { setError('The accepted copy could not be loaded. Please try again.'); }
  };
  useEffect(() => {
    let active = true;
    setDocument(null); setOpened(false); setVisible(false); setError(''); onChange(null);
    if (!['rider', 'vendor', 'merchant'].includes(role)) return;
    api<TermsDocument>(`/api/legal/terms/${role}`).then((result) => { if (active) setDocument(result); }).catch(() => { if (active) setError('Terms could not be loaded. Please retry.'); });
    return () => { active = false; };
  }, [role, retry]);
  if (!['rider', 'vendor', 'merchant'].includes(role)) return null;
  const checked = !!document && value?.role === role && value.hash === document.hash;
  const share = async () => {
    if (!document) return;
    try {
      await Share.share({ title: document.title, message: [document.title, `Version ${document.version} | Effective ${document.effectiveDate}`, document.operator, document.address, document.contact, ...document.sections.map((s, i) => `${i + 1}. ${s.title}\n${s.body}`)].join('\n\n') });
    } catch { setError('Unable to share this copy. Please try again.'); }
  };
  return <View style={styles.root}>
    <TouchableOpacity accessibilityRole="button" disabled={!document} onPress={() => { setOpened(true); setVisible(true); }} style={styles.link}><AppIcon name="receipt" size={22} color="#08663e" /><Text style={styles.linkText}>Read {role} terms of service</Text></TouchableOpacity>
    {!document && !error && <Text style={styles.body}>Loading terms...</Text>}
    {!!error && <View><Text accessibilityRole="alert" style={styles.error}>{error}</Text><TouchableOpacity accessibilityRole="button" onPress={() => setRetry((n) => n + 1)} style={styles.link}><Text style={styles.linkText}>Retry</Text></TouchableOpacity></View>}
    {accepted ? <TouchableOpacity accessibilityRole="button" style={styles.link} onPress={openAcceptedCopy}><Text style={styles.linkText}>Your accepted copy</Text></TouchableOpacity> : <TouchableOpacity accessibilityRole="checkbox" accessibilityState={{ checked, disabled: !document || !opened }} disabled={!document || !opened} onPress={() => onChange(checked || !document ? null : { accepted: true, role, version: document.version, hash: document.hash })} style={styles.checkRow}>
      <View style={[styles.box, checked && styles.selected]}>{checked && <AppIcon name="check" size={18} color="#fff" />}</View><Text style={styles.checkText}>I have read and agree to the {role} terms of service{document ? ` (version ${document.version})` : ''}.</Text>
    </TouchableOpacity>}
    <Modal visible={visible} animationType="slide" transparent onRequestClose={() => setVisible(false)}>
      <View style={[styles.overlay, { paddingTop: insets.top + 16 }]}><View accessibilityViewIsModal style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, 16) + 12 }]}>
        <View style={styles.heading}><Text accessibilityRole="header" style={styles.title}>{document?.title}</Text><TouchableOpacity accessibilityRole="button" accessibilityLabel="Close terms" style={styles.close} onPress={() => setVisible(false)}><AppIcon name="back" size={24} color="#172b21" /></TouchableOpacity></View>
        {!!acceptedAt && <Text style={styles.body}>Accepted {new Date(acceptedAt).toLocaleString()}</Text>}
        <ScrollView contentContainerStyle={styles.content}>{document && <><Text style={styles.body}>Version {document.version} | Effective {document.effectiveDate}</Text><Text style={styles.body}>{document.operator}{'\n'}{document.address}{'\n'}{document.contact}</Text>{document.sections.map((section, i) => <View key={section.title} style={styles.section}><Text accessibilityRole="header" style={styles.sectionTitle}>{i + 1}. {section.title}</Text><Text selectable style={styles.body}>{section.body}</Text></View>)}</>}</ScrollView>
        <View style={styles.actions}><TouchableOpacity accessibilityRole="button" onPress={share} style={styles.secondary}><Text style={styles.linkText}>Share copy</Text></TouchableOpacity><TouchableOpacity accessibilityRole="button" onPress={() => setVisible(false)} style={styles.primary}><Text style={styles.primaryText}>Back to account</Text></TouchableOpacity></View>
      </View></View>
    </Modal>
  </View>;
}
const styles = StyleSheet.create({
  root: { marginVertical: 18, gap: 12 }, link: { minHeight: 48, flexDirection: 'row', alignItems: 'center', gap: 10 }, linkText: { fontSize: 16, color: '#08663e', fontWeight: '700', flexShrink: 1 },
  checkRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, minHeight: 48 }, checkText: { flex: 1, fontSize: 16, lineHeight: 24, color: '#172b21' },
  box: { width: 24, height: 24, borderWidth: 2, borderColor: '#527562', borderRadius: 4, alignItems: 'center', justifyContent: 'center', marginTop: 2 }, selected: { backgroundColor: '#08663e' },
  overlay: { flex: 1, backgroundColor: '#0009', justifyContent: 'flex-end' }, sheet: { maxHeight: '100%', backgroundColor: '#fff', borderTopLeftRadius: 20, borderTopRightRadius: 20, flexShrink: 1 },
  heading: { flexDirection: 'row', alignItems: 'center', padding: 20, gap: 10 }, title: { flex: 1, fontSize: 21, fontWeight: '700', color: '#172b21' }, close: { minWidth: 48, minHeight: 48, alignItems: 'center', justifyContent: 'center' },
  content: { paddingHorizontal: 22, paddingBottom: 24 }, section: { marginTop: 24 }, sectionTitle: { fontSize: 18, fontWeight: '700', lineHeight: 26, marginBottom: 8, color: '#172b21' }, body: { fontSize: 16, lineHeight: 26, color: '#354b3e' },
  actions: { flexDirection: 'row', gap: 12, padding: 16, flexWrap: 'wrap' }, primary: { flexGrow: 1, minHeight: 48, borderRadius: 6, backgroundColor: '#ff9100', padding: 14, alignItems: 'center', justifyContent: 'center' }, primaryText: { fontSize: 16, fontWeight: '700', color: '#172b21' }, secondary: { minHeight: 48, padding: 14, alignItems: 'center', justifyContent: 'center' }, error: { color: '#b42318', fontSize: 16 },
});
