import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import express from 'express';
import cors from 'cors';
import jwt from 'jsonwebtoken';
import pool from '../config/db.js';
import careRoutes from '../routes/customerCareRoutes.js';
import { createRequire } from 'node:module';
import fs from 'node:fs/promises';
import path from 'node:path';

const client=await pool.connect();
const originalQuery=pool.query.bind(pool),originalConnect=pool.connect.bind(pool);
const query=client.query.bind(client);
let savepoint=0,server;
const connection={release(){},async query(sql,args){
  if(sql==='BEGIN')return query(`SAVEPOINT care_${++savepoint}`);
  if(sql==='COMMIT')return query(`RELEASE SAVEPOINT care_${savepoint}`);
  if(sql==='ROLLBACK')return query(`ROLLBACK TO SAVEPOINT care_${savepoint}`);
  return query(sql,args);
}};
try {
  await query('BEGIN');pool.query=(sql,args)=>query(sql,args);pool.connect=async()=>connection;
  const users={};
  for(const role of ['vendor','merchant','customer','support']) {
    const id=crypto.randomUUID();
    const {rows}=await query("INSERT INTO sokoeats_users(id,name,email,role,status,profile) VALUES($1,$2,$3,$4,'active','{}') RETURNING *",[id,`Care test ${role}`,`${id}@example.invalid`,role]);
    users[role]={...rows[0],token:jwt.sign({sub:id,role},process.env.JWT_SECRET||process.env.AUTH_JWT_SECRET)};
  }
  for(const role of ['vendor','merchant']) {
    const reference=users[role].application_reference;
    assert.match(reference,/^SKO-APP-\d{4}-\d{8}$/);
    await query('UPDATE sokoeats_users SET name=name WHERE id=$1',[users[role].id]);
    assert.equal((await query('SELECT application_reference FROM sokoeats_users WHERE id=$1',[users[role].id])).rows[0].application_reference,reference);
  }
  assert.notEqual(users.vendor.application_reference,users.merchant.application_reference);
  const app=express();app.use(cors({origin:true,credentials:true}));app.use(express.json());app.use('/api',careRoutes);app.use((error,_req,res,_next)=>res.status(error.status||500).json({message:error.message}));
  server=app.listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));
  const base=`http://127.0.0.1:${server.address().port}`;
  const request=async(role,path,body,method=body?'POST':'GET')=>{
    const response=await fetch(`${base}/api/care${path}`,{method,headers:{'Content-Type':'application/json',Authorization:`Bearer ${users[role].token}`},body:body?JSON.stringify(body):undefined});
    return {status:response.status,data:await response.json()};
  };
  const newMessage=body=>({body,clientMessageId:crypto.randomUUID()});
  assert.equal((await request('vendor','/application')).data.application.reference,users.vendor.application_reference);
  assert.equal((await request('customer','/inbox')).status,403);
  assert.equal((await request('customer','/conversation')).data.conversation,null);
  assert.equal((await request('vendor','/conversation/messages',newMessage('  '))).status,422);
  const input=newMessage('Please review my application.');
  const first=await request('vendor','/conversation/messages',input);assert.equal(first.status,201);
  const id=first.data.conversation.id;
  assert.equal(first.data.conversation.applicationReference,users.vendor.application_reference);
  const repeat=await request('vendor','/conversation/messages',input);assert.equal(repeat.data.messages.length,1);
  assert.equal((await request('customer',`/conversations/${id}`)).status,404);
  assert.equal((await request('customer',`/conversations/${id}/messages`,newMessage('Forbidden'))).status,404);
  assert.equal((await request('customer',`/conversations/${id}`,{status:'resolved'},'PATCH')).status,403);
  const inbox=await request('support','/inbox');assert.equal(inbox.data.conversations[0].unread,1);
  const started=Date.now();
  const waiting=request('vendor',`/conversations/${id}?after=${repeat.data.conversation.version}&wait=1`);
  await request('support',`/conversations/${id}/messages`,newMessage('We have received your enquiry.'));
  const delivered=await waiting;assert.equal(delivered.data.messages.length,2);assert.ok(Date.now()-started<4000,'Live replies must arrive promptly');
  await request('support',`/conversations/${id}/read`,{sequence:delivered.data.messages[0].sequence});
  assert.equal((await request('support','/inbox')).data.conversations[0].unread,0);
  const snapshot=await request('vendor',`/conversations/${id}`);assert.ok(snapshot.data.conversation.staffReadSequence>0);
  const older=await request('vendor',`/conversations/${id}?before=${snapshot.data.messages[1].sequence}`);assert.equal(older.data.messages.length,1);
  await request('support',`/conversations/${id}`,{status:'resolved'},'PATCH');
  assert.equal((await request('vendor',`/conversations/${id}`)).data.conversation.status,'resolved');
  await request('vendor',`/conversations/${id}/messages`,newMessage('One more question.'));
  assert.equal((await request('vendor',`/conversations/${id}`)).data.conversation.status,'open');
  const count=(await query('SELECT count(*)::int AS n FROM sokoeats_chat_conversations WHERE user_id=$1',[users.vendor.id])).rows[0].n;assert.equal(count,1);
  if(process.env.CARE_BROWSER_CHECK==='1') {
    const {chromium}=createRequire(import.meta.url)('playwright');
    const browser=await chromium.launch({headless:true,channel:process.platform==='win32'?'msedge':undefined});
    const testPages=[];
    try {
      const output=path.join(process.env.TEMP||'.','sokoeats-care-check');await fs.mkdir(output,{recursive:true});
      const pageFor=async(role,url)=>{
        const context=await browser.newContext();
        const user=users[role];
        const session={token:user.token,expiresAt:new Date(Date.now()+3600000).toISOString(),user:{id:user.id,name:user.name,email:user.email,role,status:role==='vendor'?'review':'active',profileComplete:true,termsAccepted:true,applicationReference:user.application_reference}};
        await context.addInitScript(value=>localStorage.setItem('sokoeats.auth',JSON.stringify(value)),session);
        await context.route('**/api/**',async route=>{
          try {
          const pathname=new URL(route.request().url());
          if(!pathname.pathname.startsWith('/api/'))return route.continue();
          if(pathname.pathname.startsWith('/api/care')) {
            const response=await route.fetch({url:`${base}${pathname.pathname}${pathname.search}`,headers:{...route.request().headers(),authorization:`Bearer ${user.token}`}});
            await route.fulfill({response});
          } else if(pathname.pathname==='/api/auth/me')await route.fulfill({json:{user:session.user}});
          else if(pathname.pathname.startsWith('/api/legal/terms'))await route.continue();
          else await route.fulfill({json:{vendors:[],items:[],tickets:[],metrics:[],orders:[],cities:[],maps:{}}});
          } catch { await route.abort().catch(()=>{}); }
        });
        const page=await context.newPage();testPages.push(page);page.on('pageerror',error=>console.log(`Browser ${role} error: ${error.message}`));page.setDefaultTimeout(15000);await page.goto(url,{waitUntil:'domcontentloaded'});return page;
      };
      const customer=await pageFor('vendor','http://127.0.0.1:3000');
      await customer.getByText(users.vendor.application_reference,{exact:true}).waitFor();
      const email=customer.getByRole('link',{name:'Request approval by email'});
      assert.ok((await email.getAttribute('href')).includes(encodeURIComponent(users.vendor.application_reference)));
      await customer.getByRole('button',{name:'Chat with customer care',exact:true}).click();
      await customer.getByRole('textbox',{name:'Message customer care'}).fill('Browser test: please review my shop.');
      await customer.getByRole('button',{name:'Send message',exact:true}).click();
      await customer.getByText('Browser test: please review my shop.',{exact:true}).waitFor();
      console.log('Browser customer message sent.');
      const agent=await pageFor('support','http://127.0.0.1:5174');
      await agent.locator('.careInboxList button').filter({hasText:'Care test vendor'}).click();
      await agent.getByRole('textbox',{name:'Message customer care'}).fill('Browser test: our team will review your application.');
      await agent.getByRole('button',{name:'Send message',exact:true}).click();
      await customer.getByText('Browser test: our team will review your application.',{exact:true}).waitFor();
      for(const width of [1366,390]) {
        await customer.setViewportSize({width,height:844});
        const box=await customer.getByRole('dialog',{name:'SokoEats customer care',exact:true}).boundingBox();
        assert.ok(box.x>=0&&box.x+box.width<=width+1&&box.y>=0&&box.y+box.height<=844);
        await customer.screenshot({path:path.join(output,`chat-${width}.png`)});
      }
      await agent.screenshot({path:path.join(output,'staff-inbox.png')});
      console.log('PASS: web application reference and email link; real browser customer-to-staff and staff-to-customer messages; desktop/mobile chat bounds.');
    } catch(error) {
      for(let i=0;i<testPages.length;i++)await testPages[i].screenshot({path:path.join(process.env.TEMP||'.','sokoeats-care-check',`failed-${i}.png`)}).catch(()=>{});
      throw new Error(String(error.message).split('Call log:')[0]);
    } finally { for(const context of browser.contexts())await context.unrouteAll({behavior:'ignoreErrors'});await browser.close(); }
  }
  console.log('PASS: stable application references, private conversations, staff inbox, validation, duplicate retry protection, live replies, read receipts, history cursor, resolve and reopen. Test records rolled back.');
} finally {
  if(server){server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
  pool.query=originalQuery;pool.connect=originalConnect;await query('ROLLBACK');client.release();await pool.end();
}
