// Erzeugt eine Sicherung im ALTEN Format (v1) mit dem unveränderten Originalcode
// aus dem Tag "sicherung-vor-weihnachtsdesign". Aufruf: node tests/fixtures/make-v1-fixture.cjs <original-index.html>
const fs=require('fs'),path=require('path');
const lines=fs.readFileSync(process.argv[2],'utf8').split('\n');
const start=lines.findIndex(l=>l.startsWith('const bytesTo64'));
const end=lines.findIndex(l=>l.startsWith('async function decryptData'));
const code=lines.slice(start,end+1).join('\n');
const api=new Function(code+';return {encryptData,decryptData,validBackup}')();
const data={teacher:'Frau Tannenbaum',classes:[
 {id:'k1abc',name:'5a',year:'2025/2026',history:[{year:'2024/2025',className:'4a',date:'2024-12-01T10:00:00.000Z',participants:[{id:'s1',name:'Anna'},{id:'s2',name:'Ben'},{id:'s3',name:'Cem'}],assignments:{s1:'s2',s2:'s3',s3:'s1'},drawn:['s1','s2','s3'],budget:'5',deadline:'2024-12-18'}],
  students:[{id:'s1',name:'Anna'},{id:'s2',name:'Ben'},{id:'s3',name:'Cem'},{id:'s4',name:'Dörte "Dodo" Ölmann'},{id:'s5',name:'=SUMME(A1)'}],
  teacherJoins:true,budget:'10',deadline:'2025-12-19',handover:'Im Klassenzimmer',extra:'Bitte keine Nüsse',
  assignments:{s1:'s3',s3:'teacher',teacher:'s5',s5:'s2',s2:'s4',s4:'s1'},drawn:['s1','s3']},
 {id:'k2def',name:'7b',year:'2025/2026',history:[],students:[{id:'t1',name:'Lina'},{id:'t2',name:'Noah'}],teacherJoins:false,budget:'',deadline:'',handover:'',extra:'',assignments:null,drawn:[]}]};
if(!api.validBackup(data))throw Error('Fixture ungültig');
api.encryptData(data,'Tanne-Stern-Kerze').then(enc=>{
 const dir=__dirname;
 fs.writeFileSync(path.join(dir,'v1-backup.wichtel'),JSON.stringify(enc));
 fs.writeFileSync(path.join(dir,'v1-backup.expected.json'),JSON.stringify(data,null,1));
 console.log('v1-Fixture geschrieben, Passwort: Tanne-Stern-Kerze');
});
