import React, { useEffect, useRef, useState } from 'react';
import { AppState, KeyboardAvoidingView, Linking, Modal, Platform, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { applicationStatus, approvalEmail, useCustomerCare, type CareRequest, type PartnerApplication } from '@sokoeats/shared/support/useCustomerCare';
import { AppIcon } from './AppIcon';

type CareUser = { id: string; name: string; role: string; status?: string; applicationReference?: string | null };
export function ApplicationTracker({ user, request, onApproved }: { user: CareUser; request: CareRequest; onApproved?:()=>Promise<void> }) {
  const [application,setApplication]=useState<PartnerApplication|null>(null);
  const [error,setError]=useState('');
  useEffect(()=>{
    if(!['vendor','merchant'].includes(user.role))return;
    let active=true;
    const refresh=()=>request<{application:PartnerApplication|null}>('/api/care/application').then(result=>{if(active){setApplication(result.application);setError('');}}).catch(()=>{if(active)setError('Status unavailable. Please try again or email support.');});
    void refresh();const timer=setInterval(refresh,15000);return()=>{active=false;clearInterval(timer);};
  },[user.id,user.role,request]);
  if(!['vendor','merchant'].includes(user.role))return null;
  const reference=application?.reference||user.applicationReference;
  return <View style={styles.application}><Text style={styles.meta}>YOUR APPLICATION</Text><Text style={styles.title}>{application?applicationStatus[application.status]||application.status.replaceAll('_',' '):'Application tracking'}</Text><Text style={styles.body}>Tracking number</Text><Text selectable style={styles.reference}>{reference||'Loading...'}</Text>{!!application?.note&&<Text style={styles.body}>{application.note}</Text>}{!!error&&<Text style={styles.error}>{error}</Text>}{reference&&application?.status!=='verified'&&<TouchableOpacity accessibilityRole="button" style={styles.primary} onPress={()=>Linking.openURL(approvalEmail(reference,application?.businessName||user.name)).catch(()=>setError('Open your email app and write to support@sokoeats.co.ke with the tracking number above.'))}><AppIcon name="sms" size={20} color="#fff"/><Text style={styles.primaryText}>Request approval by email</Text></TouchableOpacity>}{application?.status==='verified'&&user.status!=='active'&&onApproved&&<TouchableOpacity accessibilityRole="button" style={styles.primary} onPress={()=>onApproved().catch(()=>setError('Could not open your approved account. Please try again.'))}><Text style={styles.primaryText}>Open approved account</Text></TouchableOpacity>}</View>;
}

export function CustomerCareChat({ user, request, onSignIn, initiallyOpen = false, onClose }: { user: CareUser|null; request: CareRequest; onSignIn:()=>void; initiallyOpen?:boolean; onClose?:()=>void }) {
  const [open,setOpen]=useState(initiallyOpen);
  const [foreground,setForeground]=useState(AppState.currentState==='active');
  const [emailError,setEmailError]=useState('');
  const insets=useSafeAreaInsets();
  const scroll=useRef<ScrollView>(null);
  const nearBottom=useRef(true);
  useEffect(()=>{const sub=AppState.addEventListener('change',state=>setForeground(state==='active'));return()=>sub.remove();},[]);
  const chat=useCustomerCare(request,user?.id,open,undefined,false,foreground);
  const close=()=>{setOpen(false);onClose?.();};
  return <>
    <TouchableOpacity accessibilityRole="button" accessibilityLabel="Chat with customer care" style={[styles.launcher,{bottom:insets.bottom+112}]} onPress={()=>setOpen(true)}><AppIcon name="sms" size={27} color="#fff"/>{chat.unread>0&&<View style={styles.badge}><Text style={styles.badgeText}>{chat.unread>9?'9+':chat.unread}</Text></View>}</TouchableOpacity>
    <Modal visible={open} transparent animationType="slide" onRequestClose={close}>
      <KeyboardAvoidingView behavior={Platform.OS==='ios'?'padding':'height'} style={[styles.overlay,{paddingTop:insets.top+12}]}>
        <View style={[styles.sheet,{paddingBottom:Math.max(insets.bottom,12)}]} accessibilityViewIsModal>
          <View style={styles.header}><View style={{flex:1}}><Text style={styles.headerTitle}>SokoEats customer care</Text><Text style={styles.headerSubtitle}>Orders, accounts and applications</Text></View><TouchableOpacity accessibilityRole="button" accessibilityLabel="Close customer care" style={styles.iconButton} onPress={close}><AppIcon name="back" size={24} color="#fff"/></TouchableOpacity></View>
          {!user ? <View style={styles.guest}><Text style={styles.title}>Talk to our team</Text><Text style={styles.body}>Sign in to send messages and keep your conversation across devices.</Text><TouchableOpacity style={styles.primary} onPress={()=>{close();onSignIn();}}><Text style={styles.primaryText}>Sign in to chat</Text></TouchableOpacity><TouchableOpacity style={styles.secondary} onPress={()=>Linking.openURL('mailto:support@sokoeats.co.ke').catch(()=>setEmailError('Email support@sokoeats.co.ke from your email app.'))}><Text style={styles.link}>Email customer care</Text></TouchableOpacity>{!!emailError&&<Text style={styles.error}>{emailError}</Text>}</View> : <>
            <View style={styles.metaRow}><Text style={styles.meta}>{chat.conversation?.code||'A new conversation'}</Text><Text style={styles.meta}>{chat.connected?'Connected':'Reconnecting...'}</Text></View>
            {!!chat.conversation?.applicationReference&&<Text style={styles.applicationReference}>Application {chat.conversation.applicationReference}</Text>}
            <ScrollView ref={scroll} style={{flex:1}} contentContainerStyle={styles.messages} keyboardShouldPersistTaps="handled" onContentSizeChange={()=>{if(nearBottom.current)scroll.current?.scrollToEnd({animated:true});}} onScroll={({nativeEvent})=>{nearBottom.current=nativeEvent.contentSize.height-nativeEvent.contentOffset.y-nativeEvent.layoutMeasurement.height<90;}} scrollEventThrottle={100}>
              {chat.hasOlder&&<TouchableOpacity style={styles.secondary} disabled={chat.loadingOlder} onPress={()=>void chat.loadOlder()}><Text style={styles.link}>{chat.loadingOlder?'Loading...':'Earlier messages'}</Text></TouchableOpacity>}
              {!chat.messages.length&&<View style={styles.guest}><AppIcon name="sms" size={40} color="#087648"/><Text style={styles.title}>How can we help?</Text><Text style={styles.body}>Tell us about your order, account or application. Our team will reply here.</Text></View>}
              {chat.messages.map(message=><View key={message.id} style={[styles.message,message.senderKind==='customer'&&styles.mine]}><Text style={styles.sender}>{message.senderKind==='customer'?'You':message.senderName}</Text><Text selectable style={styles.messageBody}>{message.body}</Text><Text style={styles.time}>{new Date(message.createdAt).toLocaleString([], {month:'short',day:'numeric',hour:'2-digit',minute:'2-digit'})}{message.senderKind==='customer'?` · ${message.sequence<=(chat.conversation?.staffReadSequence||0)?'Seen':'Sent'}`:''}</Text></View>)}
            </ScrollView>
            {chat.conversation?.status==='resolved'&&<Text style={styles.notice}>Resolved. Send a message to reopen this conversation.</Text>}
            {!!chat.error&&<Text accessibilityRole="alert" style={styles.error}>{chat.error}</Text>}
            <View style={styles.composer}><TextInput accessibilityLabel="Message customer care" style={styles.input} multiline maxLength={4000} placeholder="Write your message..." placeholderTextColor="#637b6b" value={chat.draft} onChangeText={chat.setDraft}/><TouchableOpacity accessibilityRole="button" accessibilityLabel="Send message" disabled={chat.sending||!chat.draft.trim()} style={[styles.send,(chat.sending||!chat.draft.trim())&&{opacity:.45}]} onPress={()=>{nearBottom.current=true;void chat.send();}}><AppIcon name="chevron" size={24} color="#fff"/></TouchableOpacity></View>
          </>}
        </View>
      </KeyboardAvoidingView>
    </Modal>
  </>;
}
const styles=StyleSheet.create({
  application:{paddingVertical:20,gap:10,borderBottomWidth:1,borderBottomColor:'#d2dfd7',marginBottom:18},reference:{fontSize:19,fontWeight:'800',color:'#105d39'},body:{fontSize:16,lineHeight:24,color:'#3c5a49'},title:{fontSize:21,fontWeight:'700',color:'#193d2b'},meta:{fontSize:11,color:'#52725e'},primary:{minHeight:48,backgroundColor:'#087648',borderRadius:6,flexDirection:'row',justifyContent:'center',alignItems:'center',gap:10,padding:12},primaryText:{fontSize:16,fontWeight:'700',color:'#fff',flexShrink:1},
  launcher:{position:'absolute',right:20,width:56,height:56,borderRadius:28,backgroundColor:'#087648',alignItems:'center',justifyContent:'center',borderWidth:2,borderColor:'#fff',elevation:6},badge:{position:'absolute',right:-3,top:-3,backgroundColor:'#d9492b',borderRadius:12,minWidth:22,padding:3,alignItems:'center'},badgeText:{color:'#fff',fontSize:11,fontWeight:'800'},
  overlay:{flex:1,backgroundColor:'#0007',justifyContent:'flex-end'},sheet:{height:'92%',backgroundColor:'#f7faf8',borderTopLeftRadius:18,borderTopRightRadius:18,overflow:'hidden'},header:{backgroundColor:'#12432f',padding:16,flexDirection:'row',alignItems:'center',gap:10},headerTitle:{fontSize:18,fontWeight:'700',color:'#fff'},headerSubtitle:{fontSize:12,color:'#d6e9dd',marginTop:4},iconButton:{width:44,height:44,alignItems:'center',justifyContent:'center'},metaRow:{flexDirection:'row',justifyContent:'space-between',flexWrap:'wrap',gap:8,padding:12,backgroundColor:'#fff'},applicationReference:{fontSize:12,color:'#715015',backgroundColor:'#fff0d5',padding:10},messages:{padding:16,gap:14,flexGrow:1},guest:{padding:22,gap:14},message:{maxWidth:'88%',alignSelf:'flex-start',padding:12,backgroundColor:'#fff',borderWidth:1,borderColor:'#dce6df',borderRadius:8},mine:{alignSelf:'flex-end',backgroundColor:'#dff4e8',borderColor:'#bfe2cf'},sender:{fontSize:12,fontWeight:'700',color:'#29533c'},messageBody:{fontSize:16,lineHeight:23,color:'#203b2e',marginVertical:7},time:{fontSize:10,color:'#4c6958'},secondary:{padding:12,minHeight:44,alignItems:'center'},link:{fontSize:15,color:'#076840',fontWeight:'700'},notice:{padding:10,fontSize:12,color:'#506b58'},error:{fontSize:13,color:'#ad2920',padding:10},composer:{padding:12,flexDirection:'row',gap:10,alignItems:'flex-end',borderTopWidth:1,borderColor:'#d9e5de',backgroundColor:'#fff'},input:{flex:1,minHeight:46,maxHeight:130,borderWidth:1,borderColor:'#c4d6ca',padding:10,borderRadius:6,fontSize:16,color:'#1d3b29'},send:{height:46,width:46,backgroundColor:'#087648',borderRadius:6,alignItems:'center',justifyContent:'center'},
});
