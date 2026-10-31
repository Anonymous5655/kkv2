import {extension_settings} from '../../../extensions.js';
import {saveSettingsDebounced,getRequestHeaders} from '../../../../script.js';
import {SECRET_KEYS,secret_state} from '../../../secrets.js';
import {installTransport} from './transport.mjs';

const API='/api/plugins/nai-connection-hub';
extension_settings.nai_connection_hub??={enabled:false};
const settings=extension_settings.nai_connection_hub;
let container,connected=false,ownsGate=false,oldGate,timer,revision=0;
const el=id=>container?.querySelector('#hub-'+id);
const show=text=>{if(el('status'))el('status').textContent=text;};
const conflict=()=>extension_settings.sharednai_bridge?.enabled||extension_settings.sakura_nai_bridge?.enabled;
function gate(){
    if(settings.enabled&&connected&&!conflict()&&!ownsGate){oldGate=secret_state[SECRET_KEYS.NOVEL];secret_state[SECRET_KEYS.NOVEL]=true;ownsGate=true;}
    else if((!settings.enabled||!connected||conflict())&&ownsGate){secret_state[SECRET_KEYS.NOVEL]=oldGate;ownsGate=false;}
}
function disableOld(){
    for(const [name,id] of [['sharednai_bridge','snb-enabled'],['sakura_nai_bridge','skb-enabled']]){
        const checkbox=document.getElementById(id);
        if(checkbox?.checked){checkbox.checked=false;checkbox.dispatchEvent(new Event('change',{bubbles:true}));}
        if(extension_settings[name])extension_settings[name].enabled=false;
    }
    saveSettingsDebounced();
}
function display(summary){
    if(!el('account'))return;
    el('account').replaceChildren();const a=summary?.data;if(!a)return;
    const n=v=>typeof v==='number'?v.toLocaleString():'정보 없음';
    const rows=summary.kind==='sharednai'
        ?[['계정 Anlas',n(a.anlas_balance)],['공식 Anlas',n(a.official_anlas_balance)],['공유 Anlas',n(a.shared_available_anlas_balance??a.shared_anlas_balance)],['요금제',a.tier_name||'정보 없음']]
        :[['키 상태',a.active?'활성':'비활성'],['Anlas',n(a.anlas)],['Opus 잔여 비율',a.usagePercent==null?'정보 없음':`${a.usageNegative?'-':''}${a.usagePercent}%`],['등급',n(a.tier)]];
    if(summary.kind==='sharednai'&&!a.uses_official_token)rows.push(['V5 남은 수량',n(a.is_trial_vip?a.trial_v5_quota:a.v5_remaining_images)]);
    for(const [label,value] of rows){const dt=document.createElement('dt'),dd=document.createElement('dd');dt.textContent=label;dd.textContent=value;el('account').append(dt,dd);}
}
function apply(data){
    connected=!!data.active;const list=data.profiles||[];
    el('saved').replaceChildren();
    for(const p of list)el('saved').append(new Option(`${p.label} · ${p.baseUrl}`,p.id));
    el('saved').value=data.active||(list[0]?.id??'');
    const active=list.find(p=>p.id===data.active);
    el('active').textContent=active?`현재 연결: ${active.label} · ${active.baseUrl}`:'현재 연결 없음';
    el('persist-active').checked=!!active?.remembered;el('persist-active').disabled=!active;
    gate();display(data.account);
}
function activate(data){disableOld();settings.enabled=true;el('enabled').checked=true;saveSettingsDebounced();apply(data);}
async function api(path,body){
    const r=await fetch(API+path,{method:body===undefined?'GET':'POST',headers:getRequestHeaders(),cache:'no-store',...(body===undefined?{}:{body:JSON.stringify(body)})});
    if(!r.ok){let message=r.status===404?'NAI 통합 서버 플러그인을 설치하고 서버를 재시작하세요.':`HTTP ${r.status}`;try{message=(await r.json()).message||message;}catch{}const error=new Error(message);error.status=r.status;throw error;}
    return r.json();
}
async function recover(error){if(error.status===401){try{apply(await api('/status'));}catch{connected=false;gate();display(null);}}show(error.message);}
async function refresh(){
    if(!connected)return show('먼저 연결하세요.');const current=++revision;
    try{const r=await api('/account');if(current===revision)display(r.account);}
    catch(e){if(current===revision){display(null);await recover(e);}}
}
installTransport(window,()=>settings.enabled,conflict,(status,generation)=>{
    if(status===401){connected=false;gate();display(null);show('키 또는 로그인이 만료되었습니다. 연결을 갱신하세요.');}
    else if(generation){clearTimeout(timer);timer=setTimeout(()=>void refresh(),800);}
});
jQuery(async()=>{
    const r=await fetch(new URL('./settings.html',import.meta.url));container=document.createElement('div');container.innerHTML=await r.text();document.querySelector('#extensions_settings').append(container);
    const draft=()=>{const kind=el('preset').value;el('login').hidden=kind!=='sharednai';el('key-row').hidden=kind==='sharednai';el('custom').hidden=kind!=='custom';el('url').readOnly=kind!=='custom';el('url').value=kind==='sharednai'?'https://sharednai5.pro':kind==='sakura'?'https://relay.tenshimomone.com':'';};
    el('preset').addEventListener('change',draft);draft();
    const task=async fn=>{
        revision++;for(const b of container.querySelectorAll('button,input[type=checkbox],select'))b.disabled=true;
        try{await fn();}catch(e){await recover(e);}
        finally{for(const b of container.querySelectorAll('button,input[type=checkbox],select'))b.disabled=false;el('persist-active').disabled=!connected;}
    };
    el('enabled').checked=!!settings.enabled;
    el('enabled').addEventListener('change',()=>{settings.enabled=el('enabled').checked;if(settings.enabled)disableOld();saveSettingsDebounced();gate();});
    document.addEventListener('change',event=>{if(['snb-enabled','skb-enabled'].includes(event.target.id)&&event.target.checked){settings.enabled=false;el('enabled').checked=false;gate();saveSettingsDebounced();}},true);
    el('connect').addEventListener('click',()=>void task(async()=>{
        const body={preset:el('preset').value,baseUrl:el('url').value,label:el('label').value,username:el('username').value,password:el('password').value,key:el('key').value,remember:el('remember').checked};
        el('password').value='';el('key').value='';show('연결 확인 중…');
        activate(await api('/connect',body));show('연결되었습니다.');
    }));
    el('select').addEventListener('click',()=>void task(async()=>{activate(await api('/select',{id:el('saved').value}));show('연결을 전환했습니다.');}));
    el('check').addEventListener('click',()=>void task(async()=>{const data=await api('/check',{});connected=true;gate();display(data.account);show('인증 정상');}));
    el('refresh').addEventListener('click',()=>void task(refresh));
    el('disconnect').addEventListener('click',()=>void task(async()=>{apply(await api('/disconnect',{}));show('현재 연결과 저장된 인증 정보를 삭제했습니다. 다른 연결은 유지됩니다.');}));
    el('persist-active').addEventListener('change',()=>void task(async()=>{
        try{apply(await api('/remember',{remember:el('persist-active').checked}));show('저장 설정을 변경했습니다.');}
        catch(e){el('persist-active').checked=!el('persist-active').checked;throw e;}
    }));
    try{if(settings.enabled)disableOld();apply(await api('/status'));if(connected)await refresh();}catch(e){show(e.message);}
});
