import React from 'react';
type D = Record<string, any>;
export default function Rehearsal({state, code, token, api, enter, refresh, act, busy, lang}: D) {
  const t = (ko:string,en:string) => lang === 'ko' ? ko : en;
  const saved = JSON.parse(sessionStorage.getItem('duo-rehearsal') || 'null');
  const enabled = saved?.code === code;
  const root = '/workshops/' + code;
  async function toggle() {
    if (enabled) { sessionStorage.removeItem('duo-rehearsal'); enter(token,saved.previous); return; }
    const room = await api('/workshops',{name:'REHEARSAL · 예시 데이터',demo:true});
    sessionStorage.setItem('duo-rehearsal',JSON.stringify({code:room.id,previous:code,people:[]}));
    enter(token,room.id);
  }
  async function step() {
    const rooms = await api('/workshops');
    if (!enabled || !rooms.some((r:D)=>r.id===code && r.demo)) throw Error('Rehearsal room required');
    if (state.phase === 'lobby') {
      for (const [group,nickname] of [['KR','예시 민지'],['KR','예시 준'],['US','Sample Alex'],['US','Sample Sam']]) {
        if (saved.people.some((p:D)=>p.nickname===nickname)) continue;
        const p = await api(root+'/join',{group,nickname,consent:true,language:group==='KR'?'ko':'en'});
        saved.people.push({...p,group,nickname});
        sessionStorage.setItem('duo-rehearsal',JSON.stringify(saved));
      }
      await api(root+'/control',{action:'draw',card:0,minutes:5});
    } else if (state.phase === 'discussion') {
      for (const [i,p] of saved.people.entries()) {
        const mine = await api(root,undefined,p.token);
        const old = mine.edits.find((e:D)=>e.round===state.round && e.participant===mine.participant);
        if (old) continue;
        await api(root+'/edit',{round:state.round,base_version:0,language:p.group==='KR'?'ko':'en',answers:{choice:i%2?'both':'other',meaning:i%2?'They might mean it literally; I would ask first.':'괜찮다고 하지만 도움이 필요한 것 같아요.',certainty:'3',familiarity:'4',reply:'Would you like a hand?',action:'I would pause and ask before helping.'}},p.token);
      }
    } else if (state.phase === 'round_closed') {
      await api(root+'/control',{action:'prepare'});
    } else if (state.phase === 'prepare') {
      for (const round of state.rounds) for (const group of ['KR','US']) {
        const old=state.conclusions.find((n:D)=>n.round===round.id && n.group===group);
        if (old?.approved) continue;
        await api(root+'/conclusion',{round:round.id,group,base_version:old?.version||0,original:'리허설용 가상 결론 — 실제 참여자 의견이 아닙니다.',english:group==='KR'?'Sample notes: Offer practical help gently and check what the speaker wants.':'Sample notes: Ask whether the speaker means it literally before deciding how to respond.',approved:true});
      }
      await api(root+'/personas',{});
    }
    await refresh();
  }
  const answered=enabled && state.phase==='discussion' && saved.people.length>0 && state.edits.filter((e:D)=>e.round===state.round).length>=saved.people.length;
  const labels:D={lobby:t('1 · 예시 4명 입장 + 카드 공개','1 · Join 4 samples & reveal card'),discussion:t('2 · 예시 답변 채우기','2 · Fill sample responses'),round_closed:t('4 · 결론 확인으로 이동','4 · Review group notes'),prepare:t('5 · 예시 결론 확정 + 페르소나 준비','5 · Confirm sample notes & prepare personas')};
  return <section className="rehearsal-panel">
    <label><input type="checkbox" role="switch" checked={enabled} disabled={busy} onChange={()=>act(toggle)}/><b>{t('로컬 리허설','Local rehearsal')}</b></label>
    {enabled && <><p>{t('별도 예시 방 · 실제 참가자 데이터와 분리','Separate sample room · isolated from real participants')} · {code}</p>
      <div className="rehearsal-actions">
      {labels[state.phase] && !answered && <button disabled={busy} onClick={()=>act(step)}>{labels[state.phase]}</button>}
      {answered && <button disabled={busy} onClick={()=>act(async()=>{await api(root+'/control',{action:'close'});await refresh();})}>{t('3 · 토론 종료','3 · End discussion')}</button>}
      </div>
      <small>{state.phase==='compare'?t('준비 완료. 아래 질문창은 실제 AI 연결을 사용합니다. 예시 AI 답변은 만들지 않습니다.','Ready. The question form uses a real AI connection; no simulated AI answers.'):t('일반 진행 콘솔도 그대로 사용할 수 있어요. 타이머를 누르면 카드가 크게 열립니다.','You can also use the regular controls. Click the timer to expand the card.')}</small>
    </>}
  </section>;
}
