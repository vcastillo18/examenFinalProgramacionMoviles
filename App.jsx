import React, { useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { setupIonicReact, IonApp, IonContent, IonHeader, IonToolbar, IonTitle, IonPage, IonLabel, IonIcon, IonButton, IonCard, IonCardContent, IonCardHeader, IonCardTitle, IonInput, IonItem, IonList, IonSelect, IonSelectOption, IonTextarea, IonBadge, IonToast, IonSpinner, IonBackButton, IonButtons, IonDatetime, IonChip, IonAlert } from '@ionic/react';
import { homeOutline, calendarOutline, peopleOutline, cutOutline, barChartOutline, addOutline, arrowBackOutline, createOutline, trashOutline } from 'ionicons/icons';
import { Capacitor } from '@capacitor/core';
import initSqlJs from 'sql.js';
import sqlWasmUrl from 'sql.js/dist/sql-wasm.wasm?url';
import { CapacitorSQLite, SQLiteConnection } from '@capacitor-community/sqlite';
import '@ionic/react/css/core.css';
import '@ionic/react/css/normalize.css';
import '@ionic/react/css/structure.css';
import '@ionic/react/css/typography.css';
import './theme.css';

setupIonicReact();
const sqlite = new SQLiteConnection(CapacitorSQLite);
const webDbKey = 'agenda-salon.sqlite';
let webDatabase = null;
const localDate = new Date();
const today = `${localDate.getFullYear()}-${String(localDate.getMonth()+1).padStart(2,'0')}-${String(localDate.getDate()).padStart(2,'0')}`;
const demoDate = '2026-11-18';
const formatDate = date => new Date(`${date}T00:00:00`).toLocaleDateString('es-MX',{day:'numeric',month:'short',year:'numeric'});
const stylists = ['Laura','Mario'];
const appointmentTimes = ['09:00','10:00','11:00','12:00','12:30','14:00','15:00','16:00','17:00'];
const workdayStart = 9 * 60;
const workdayEnd = 18 * 60;
const getAvailableSlots = (appointments,services) => {
  return appointmentTimes.filter(time=>{
    const [hours,minutes]=time.split(':').map(Number);
    const start=hours*60+minutes;
    if(start<workdayStart)return false;
    return stylists.some(stylist=>services.some(service=>{
      const end=start+Number(service.duration||0);
      if(end>workdayEnd)return false;
      return !appointments.some(a=>{
        if(a.status==='Cancelada'||a.stylist!==stylist)return false;
        const [apptHour,apptMinute]=a.time.split(':').map(Number);
        const apptStart=apptHour*60+apptMinute;
        const apptEnd=apptStart+Number(a.duration||0);
        return start<apptEnd&&end>apptStart;
      });
    }));
  }).length;
};
const money = n => `$${Number(n || 0).toLocaleString('es-MX')}`;
const withTimeout = (promise, stage, ms = 15000) => new Promise((resolve, reject) => {
  const timer = setTimeout(() => reject(new Error(`Tiempo agotado al ${stage}.`)), ms);
  promise.then(resolve, reject).finally(() => clearTimeout(timer));
});
const encodeBase64 = bytes => {
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(binary);
};
const persistWebDatabase = () => {
  if (webDatabase) window.localStorage.setItem(webDbKey, encodeBase64(webDatabase.export()));
};
function createWebConnection(database) {
  return {
    open: async () => {},
    isDBOpen: async () => ({ result: true }),
    isOpened: async () => ({ result: true }),
    execute: async statements => { database.exec(statements); persistWebDatabase(); return {}; },
    query: async statement => {
      const stmt = database.prepare(statement); const values = [];
      try { while (stmt.step()) values.push(stmt.getAsObject()); } finally { stmt.free(); }
      return { values };
    },
    run: async (statement, values = []) => {
      const stmt = database.prepare(statement);
      try { stmt.run(values); } finally { stmt.free(); }
      persistWebDatabase(); return {};
    }
  };
}
const persistDb = async () => {
  if (Capacitor.getPlatform() === 'web') persistWebDatabase();
};

async function openDb(onStage = () => {}) {
  let db;
  if (Capacitor.getPlatform() === 'web') {
    onStage('Iniciando SQLite para web…');
    const SQL = await withTimeout(initSqlJs({ locateFile: () => sqlWasmUrl }), 'cargar el motor sql.js');
    const saved = window.localStorage.getItem(webDbKey);
    if (saved) {
      try {
        const binary = atob(saved); const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
        webDatabase = new SQL.Database(bytes);
      } catch (e) {
        console.error('Error al restaurar base de datos de localStorage:', e);
        webDatabase = new SQL.Database();
      }
    } else webDatabase = new SQL.Database();
    webDatabase.run('PRAGMA foreign_keys = ON');
    db = createWebConnection(webDatabase);
  } else {
    onStage('Conectando la base de datos…');
    const connCheck = await sqlite.isConnection('agenda-salon', false);
    if (connCheck && connCheck.result) {
      db = await sqlite.retrieveConnection('agenda-salon', false);
    } else {
      db = await withTimeout(sqlite.createConnection('agenda-salon', false, 'no-encryption', 1, false), 'crear la base de datos');
    }
    const openCheck = typeof db.isDBOpen === 'function' ? await db.isDBOpen() : (typeof db.isOpened === 'function' ? await db.isOpened() : { result: true });
    if (!openCheck || !openCheck.result) {
      await withTimeout(db.open(), 'abrir la base de datos');
    }
  }
  await withTimeout(db.execute(`CREATE TABLE IF NOT EXISTS clients(id INTEGER PRIMARY KEY AUTOINCREMENT,name TEXT NOT NULL,phone TEXT DEFAULT '',email TEXT DEFAULT '');
CREATE TABLE IF NOT EXISTS services(id INTEGER PRIMARY KEY AUTOINCREMENT,name TEXT NOT NULL,duration INTEGER NOT NULL,price REAL NOT NULL,description TEXT DEFAULT '');
CREATE TABLE IF NOT EXISTS appointments(id INTEGER PRIMARY KEY AUTOINCREMENT,client_id INTEGER,service_id INTEGER,stylist TEXT,date TEXT,time TEXT,duration INTEGER,status TEXT DEFAULT 'Pendiente',notes TEXT DEFAULT '',price REAL,FOREIGN KEY(client_id) REFERENCES clients(id),FOREIGN KEY(service_id) REFERENCES services(id));`), 'crear las tablas');
  const appointmentColumns = (await withTimeout(db.query('PRAGMA table_info(appointments)'), 'revisar las citas')).values || [];
  if (!appointmentColumns.some(column => column.name === 'price')) await withTimeout(db.execute('ALTER TABLE appointments ADD COLUMN price REAL'), 'actualizar el historial de citas');
  await withTimeout(db.run('UPDATE appointments SET price=(SELECT price FROM services WHERE services.id=appointments.service_id) WHERE price IS NULL'), 'guardar los precios históricos');
  const run = async (sql, values) => withTimeout(db.run(sql, values), 'guardar datos de SQLite');
  onStage('Cargando clientes, servicios y citas…');
  const demoAppointments = [['Ana Torres','Corte de cabello','Laura','09:00',45,'Atendida'],['Carlos Mendoza','Tinte','Mario','10:00',120,'Confirmada'],['María López','Manicure','Laura','12:30',60,'Pendiente'],['Jorge Ruiz','Peinado','Mario','16:00',60,'Pendiente']];
  for (const [client,service,stylist,time,duration,status] of demoAppointments) {
    await run('DELETE FROM appointments WHERE client_id=(SELECT id FROM clients WHERE name=?) AND service_id=(SELECT id FROM services WHERE name=?) AND stylist=? AND date=? AND time=? AND duration=? AND status=?', [client,service,stylist,demoDate,time,duration,status]);
  }
  const demoClients = [['Ana Torres','5551234567'],['Carlos Mendoza','5559876543'],['María López','5557654321'],['Jorge Ruiz','5551112233']];
  for (const [name,phone] of demoClients) await run("DELETE FROM clients WHERE name=? AND phone=? AND COALESCE(email,'')='' AND NOT EXISTS (SELECT 1 FROM appointments WHERE appointments.client_id=clients.id)", [name,phone]);
  const demoServices = [['Corte de cabello',45,250],['Tinte',120,850],['Manicure',60,300],['Peinado',60,450]];
  for (const [name,duration,price] of demoServices) await run("DELETE FROM services WHERE name=? AND duration=? AND price=? AND COALESCE(description,'')='' AND NOT EXISTS (SELECT 1 FROM appointments WHERE appointments.service_id=services.id)", [name,duration,price]);
  await withTimeout(persistDb(), 'guardar la base de datos'); return db;
}

function App() {
  const [db,setDb]=useState(null), [data,setData]=useState({clients:[],services:[],appointments:[]}), [tab,setTab]=useState('Inicio'), [page,setPage]=useState('main'), [name,setName]=useState('Laura'), [login,setLogin]=useState('Laura'), [signed,setSigned]=useState(false), [form,setForm]=useState({}), [selected,setSelected]=useState(null), [editing,setEditing]=useState(null), [pendingDelete,setPendingDelete]=useState(null), [filter,setFilter]=useState('Todos'), [toast,setToast]=useState(''), [busy,setBusy]=useState(true), [initStage,setInitStage]=useState('Preparando tu agenda…'), [loadError,setLoadError]=useState('');
  const refresh=async (d=db)=>{if(!d)return; const [c,s,a]=await Promise.all([d.query('SELECT * FROM clients ORDER BY name'),d.query('SELECT * FROM services ORDER BY name'),d.query('SELECT a.id,a.client_id,a.service_id,a.stylist,a.date,a.time,a.duration,a.status,a.notes,COALESCE(a.price,s.price,0) price,c.name client_name,s.name service_name FROM appointments a LEFT JOIN clients c ON c.id=a.client_id LEFT JOIN services s ON s.id=a.service_id ORDER BY date,time')]);setData({clients:c.values||[],services:s.values||[],appointments:a.values||[]});};
  useEffect(()=>{(async()=>{try{const d=await openDb(setInitStage);setDb(d);await withTimeout(refresh(d),'leer las citas');}catch(e){setLoadError(e?.message||String(e));}finally{setBusy(false);}})()},[]);
  const todayAppts=data.appointments.filter(a=>a.date===today&&a.status!=='Cancelada');
  const freeSlotsToday=getAvailableSlots(todayAppts,data.services);
  const go=(t)=>{setTab(t);setPage('main');setEditing(null);setForm({})}; const back=()=>{setPage('main');setEditing(null);setForm({})}; const set=(k,v)=>setForm(f=>({...f,[k]:v}));
  const agendaAppointments=data.appointments.filter(a=>filter==='Todos'||a.stylist===filter);
  const save=async (sql,args)=>{await db.run(sql,args);await persistDb();setForm({});setEditing(null);setPage('main');await refresh();};
  const saveClient=async()=>{if(!form.name?.trim())return setToast('Escribe el nombre del cliente.');if(editing?.type==='client')await save('UPDATE clients SET name=?,phone=?,email=? WHERE id=?',[form.name.trim(),form.phone||'',form.email||'',editing.id]);else await save('INSERT INTO clients(name,phone,email) VALUES(?,?,?)',[form.name.trim(),form.phone||'',form.email||'']);};
  const saveService=async()=>{if(!form.name?.trim()||!form.duration||!form.price)return setToast('Nombre, duración y precio son obligatorios.');if(editing?.type==='service')await save('UPDATE services SET name=?,duration=?,price=?,description=? WHERE id=?',[form.name.trim(),Number(form.duration),Number(form.price),form.description||'',editing.id]);else await save('INSERT INTO services(name,duration,price,description) VALUES(?,?,?,?)',[form.name.trim(),Number(form.duration),Number(form.price),form.description||'']);};
  const editClient=c=>{setEditing({type:'client',id:c.id});setForm({name:c.name,phone:c.phone||'',email:c.email||''});setPage('editClient')};
  const editService=s=>{setEditing({type:'service',id:s.id});setForm({name:s.name,duration:s.duration,price:s.price,description:s.description||''});setPage('editService')};
  const removeEntity=async()=>{if(!pendingDelete)return;const {type,item}=pendingDelete;const linked=data.appointments.filter(a=>type==='client'?a.client_id===item.id:a.service_id===item.id).length;if(linked){setPendingDelete(null);setToast(`No se puede eliminar: tiene ${linked} cita${linked===1?'':'s'} asociadas.`);return;}const table=type==='client'?'clients':'services';try{await db.run(`DELETE FROM ${table} WHERE id=?`,[item.id]);await persistDb();setPendingDelete(null);await refresh();}catch(e){setPendingDelete(null);setToast(`No se pudo eliminar: ${e?.message||e}`)}};
  const saveAppt=async()=>{const c=data.clients.find(x=>x.id===Number(form.client_id)),s=data.services.find(x=>x.id===Number(form.service_id));if(!c||!s||!form.time)return setToast('Selecciona cliente, servicio y hora.');await save('INSERT INTO appointments(client_id,service_id,stylist,date,time,duration,status,notes,price) VALUES(?,?,?,?,?,?,?,?,?)',[c.id,s.id,form.stylist||'Laura',form.date||today,form.time,s.duration,'Pendiente',form.notes||'',Number(s.price)]);};
  const changeStatus=async(a,status)=>{await db.run('UPDATE appointments SET status=? WHERE id=?',[status,a.id]);await persistDb();await refresh();setPage('main')};
  const header=(title,showBack=false)=><IonHeader><IonToolbar>{showBack&&<IonButtons slot="start"><IonButton onClick={back}><IonIcon icon={arrowBackOutline}/></IonButton></IonButtons>}<IonTitle>{title}</IonTitle></IonToolbar></IonHeader>;
  const card=(title,sub,tail)=><IonCard className="surface"><IonCardContent><div className="row"><div><strong>{title}</strong>{sub&&<div className="muted">{sub}</div>}</div>{tail}</div></IonCardContent></IonCard>;
  const button=(label,action,fill='solid')=><IonButton expand="block" fill={fill} onClick={action}>{label}</IonButton>;
  const heading=(title,subtitle)=><div className="heading"><h1>{title}</h1>{subtitle&&<p>{subtitle}</p>}</div>;
  const apptCard=a=><IonCard button key={a.id} className="surface" onClick={()=>{setSelected(a);setPage('detail')}}><IonCardContent><div className="row"><div className="time"><strong>{a.time}</strong><small>{formatDate(a.date)} · {a.duration} min</small></div><div className="grow"><strong>{a.client_name}</strong><div className="muted">{a.service_name} · {a.stylist}</div></div><IonBadge color={a.status==='Atendida'?'tertiary':a.status==='Confirmada'?'success':a.status==='Cancelada'?'medium':'warning'}>{a.status}</IonBadge></div></IonCardContent></IonCard>;
  const field=(label,key,placeholder,type='text')=><IonItem><IonInput label={label} labelPlacement="stacked" placeholder={placeholder} type={type} value={form[key]||''} onIonInput={e=>set(key,e.detail.value)} /></IonItem>;
  let content;
  if(busy) content=<div className="loading"><IonSpinner/><p>{initStage}</p></div>;
  else if(loadError) content=<div className="load-error"><h1>No se pudo iniciar la agenda</h1><p>{loadError}</p><p>En Brave, verifica que el sitio permita almacenamiento local. Abre la app desde <code>http://localhost</code> o <code>http://127.0.0.1</code>, no desde un archivo HTML.</p><IonButton onClick={()=>window.location.reload()}>Reintentar</IonButton></div>;
  else if(!signed) content=<><div className="login"><div className="brand">Agenda <span>Salón</span></div><p>Tu negocio, en orden.</p><IonItem><IonInput label="Nombre de usuario" labelPlacement="stacked" value={login} onIonInput={e=>setLogin(e.detail.value)}/></IonItem><IonItem><IonInput label="Contraseña" labelPlacement="stacked" type="password" placeholder="Ingresa tu contraseña"/></IonItem><IonButton expand="block" onClick={()=>{if(!login.trim())return setToast('Escribe tu nombre');setName(login.trim());setSigned(true)}}>Iniciar sesión</IonButton><p className="login-foot">Sistema de citas · Salón</p></div></>;
  else if(page==='newClient'||page==='editClient') content=<>{heading(page==='editClient'?'Editar cliente':'Nuevo cliente',page==='editClient'?'Actualiza su información':'Agrega su información')}<IonList>{field('Nombre','name','Nombre completo')}{field('Teléfono','phone','55 1234 5678','tel')}{field('Correo electrónico','email','cliente@correo.com','email')}</IonList>{button(page==='editClient'?'Guardar cambios':'Guardar cliente',saveClient)}</>;
  else if(page==='newService'||page==='editService') content=<>{heading(page==='editService'?'Editar servicio':'Nuevo servicio',page==='editService'?'Actualiza el servicio':'Configura el servicio')}<IonList>{field('Nombre del servicio','name','Corte de cabello')}{field('Duración (minutos)','duration','45','number')}{field('Precio','price','250','number')}{field('Descripción','description','Descripción breve')}</IonList>{button(page==='editService'?'Guardar cambios':'Guardar servicio',saveService)}</>;
  else if(page==='newAppt') content=<>{heading('Nueva cita','Elige los datos y la hora')}<IonItem><IonSelect label="Cliente" labelPlacement="stacked" value={form.client_id} onIonChange={e=>set('client_id',e.detail.value)}>{data.clients.map(c=><IonSelectOption key={c.id} value={c.id}>{c.name}</IonSelectOption>)}</IonSelect></IonItem><IonItem><IonSelect label="Servicio" labelPlacement="stacked" value={form.service_id} onIonChange={e=>set('service_id',e.detail.value)}>{data.services.map(s=><IonSelectOption key={s.id} value={s.id}>{s.name} · {s.duration} min · {money(s.price)}</IonSelectOption>)}</IonSelect></IonItem><IonItem><IonInput label="Fecha" labelPlacement="stacked" type="date" value={form.date||today} onIonInput={e=>set('date',e.detail.value)}/></IonItem><IonItem><IonSelect label="Hora" labelPlacement="stacked" value={form.time} onIonChange={e=>set('time',e.detail.value)}>{appointmentTimes.map(t=><IonSelectOption key={t} value={t}>{t}</IonSelectOption>)}</IonSelect></IonItem><IonItem><IonSelect label="Estilista" labelPlacement="stacked" value={form.stylist||'Laura'} onIonChange={e=>set('stylist',e.detail.value)}><IonSelectOption value="Laura">Laura</IonSelectOption><IonSelectOption value="Mario">Mario</IonSelectOption></IonSelect></IonItem><IonItem><IonTextarea label="Notas" labelPlacement="stacked" value={form.notes||''} onIonInput={e=>set('notes',e.detail.value)}/></IonItem>{button('Confirmar cita',saveAppt)}</>;
  else if(page==='detail'&&selected) content=<>{heading('Detalle de cita',selected.date)}{card(selected.client_name,selected.service_name)}<IonList>{[['Fecha',selected.date],['Hora',`${selected.time} · ${selected.duration} min`],['Estilista',selected.stylist],['Estado',selected.status],['Precio',money(selected.price)]].map(x=><IonItem key={x[0]}><IonLabel>{x[0]}</IonLabel><IonLabel slot="end">{x[1]}</IonLabel></IonItem>)}</IonList>{selected.status==='Pendiente'&&button('Marcar como confirmada',()=>changeStatus(selected,'Confirmada'))}{selected.status!=='Cancelada'&&selected.status!=='Atendida'&&button('Marcar como atendida',()=>changeStatus(selected,'Atendida'))}{selected.status!=='Cancelada'&&selected.status!=='Atendida'&&button('Cancelar cita',()=>changeStatus(selected,'Cancelada'),'outline')}</>;
  else if(tab==='Inicio') content=<>{heading(`Hola, ${name}`,`Hoy · ${formatDate(today)}`)}<div className="stats">{[[todayAppts.length,'Citas hoy'],[todayAppts.filter(a=>a.status==='Pendiente').length,'Por confirmar'],[freeSlotsToday,'Horarios libres']].map(x=><IonCard className="surface stat" key={x[1]}><strong>{x[0]}</strong><small>{x[1]}</small></IonCard>)}</div><div className="actions">{button('+ Nueva cita',()=>{setForm({date:today,stylist:'Laura'});setPage('newAppt')})}{button('+ Nuevo cliente',()=>{setForm({});setPage('newClient')},'outline')}</div><div className="section-title"><h2>Agenda de hoy</h2><IonButton fill="clear" onClick={()=>go('Agenda')}>Ver agenda</IonButton></div>{todayAppts.map(apptCard)}</>;
  else if(tab==='Agenda') content=<>{heading('Agenda',`${data.appointments.length} citas registradas`)}<div className="filters">{['Todos','Laura','Mario'].map(f=><IonChip color={filter===f?'primary':'medium'} onClick={()=>setFilter(f)} key={f}>{f}</IonChip>)}</div>{button('+ Nueva cita',()=>{setForm({date:today,stylist:'Laura'});setPage('newAppt')})}{agendaAppointments.map(apptCard)}</>;
  else if(tab==='Clientes') content=<>{heading('Clientes',`${data.clients.length} clientes registrados`)}{button('+ Nuevo cliente',()=>{setEditing(null);setForm({});setPage('newClient')})}{data.clients.map(c=><IonCard className="surface" key={c.id}><IonCardContent><div className="row"><div className="grow"><strong>{c.name}</strong><div className="muted">{c.phone||'Sin teléfono'} · {data.appointments.filter(a=>a.client_id===c.id).length} citas</div>{c.email&&<div className="muted">{c.email}</div>}</div><div className="entity-actions"><IonButton fill="clear" aria-label={`Editar ${c.name}`} onClick={()=>editClient(c)}><IonIcon icon={createOutline}/></IonButton><IonButton fill="clear" color="danger" aria-label={`Eliminar ${c.name}`} onClick={()=>setPendingDelete({type:'client',item:c})}><IonIcon icon={trashOutline}/></IonButton></div></div></IonCardContent></IonCard>)}</>;
  else if(tab==='Servicios') content=<>{heading('Servicios',`${data.services.length} servicios activos`)}{button('+ Nuevo servicio',()=>{setEditing(null);setForm({});setPage('newService')})}{data.services.map(s=><IonCard className="surface" key={s.id}><IonCardContent><div className="row"><div className="grow"><strong>{s.name}</strong><div className="muted">{s.duration} min · {money(s.price)}</div>{s.description&&<div className="muted">{s.description}</div>}</div><div className="entity-actions"><IonButton fill="clear" aria-label={`Editar ${s.name}`} onClick={()=>editService(s)}><IonIcon icon={createOutline}/></IonButton><IonButton fill="clear" color="danger" aria-label={`Eliminar ${s.name}`} onClick={()=>setPendingDelete({type:'service',item:s})}><IonIcon icon={trashOutline}/></IonButton></div></div></IonCardContent></IonCard>)}</>;
  else {const done=data.appointments.filter(a=>a.status==='Atendida'),revenue=done.reduce((n,a)=>n+Number(a.price||0),0);content=<>{heading('Reportes','Resumen del negocio')}{card('Ingresos registrados',`Noviembre 2026`,<strong className="price">{money(revenue)}</strong>)}<div className="stats">{[[data.appointments.length,'Citas totales'],[done.length,'Atendidas']].map(x=><IonCard className="surface stat" key={x[1]}><strong>{x[0]}</strong><small>{x[1]}</small></IonCard>)}</div><h2>Servicios populares</h2>{data.services.map(s=>card(s.name,`${data.appointments.filter(a=>a.service_id===s.id).length} citas`))}</>}
  return <IonApp><IonPage>{page==='main'&&signed?header(tab):page!=='main'&&signed?header(page==='detail'?'Detalle de cita':page==='newAppt'?'Nueva cita':page==='newClient'?'Nuevo cliente':page==='editClient'?'Editar cliente':page==='editService'?'Editar servicio':'Nuevo servicio',true):null}<IonContent className="ion-padding"><main>{content}</main></IonContent>{signed&&page==='main'&&<nav className="bottom-nav" aria-label="Navegación principal">{[['Inicio',homeOutline],['Agenda',calendarOutline],['Clientes',peopleOutline],['Servicios',cutOutline],['Reportes',barChartOutline]].map(([t,ic])=><button type="button" key={t} className={tab===t?'active':''} onClick={()=>go(t)}><IonIcon icon={ic}/><span>{t}</span></button>)}</nav>}<IonToast isOpen={!!toast} message={toast} duration={2500} onDidDismiss={()=>setToast('')}/><IonAlert isOpen={!!pendingDelete} header={`Eliminar ${pendingDelete?.type==='client'?'cliente':'servicio'}`} message={`¿Quieres eliminar “${pendingDelete?.item?.name||''}”?`} buttons={[{text:'Cancelar',role:'cancel'},{text:'Eliminar',role:'destructive',handler:()=>{void removeEntity()}}]} onDidDismiss={()=>setPendingDelete(null)}/></IonPage></IonApp>;
}

createRoot(document.getElementById('root')).render(<App/>);
