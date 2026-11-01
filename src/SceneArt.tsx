import React from "react";
export default function SceneArt({card,lang}:{card:number;lang:string}) {
 const names=[['밤의 작업실과 두 팀원','Two teammates in a studio at night'],['캠퍼스에서 마주친 두 사람','Two people meeting on campus'],['교수와 학생의 첫 만남','A professor meeting a student'],['작품 앞에서 이야기하는 두 학생','Two students beside an artwork'],['작업 중인 친구에게 다가온 사람','A person approaching a friend at work'],['선물을 건네는 두 사람','Two people exchanging a gift'],['달력 앞에서 회의하는 세 사람','Three people arranging a meeting'],['선생님과 학생, 연락을 위한 전화기','A teacher, a student, and a telephone']];
 return <figure className="scene-art scene-illustration"><img src={`/scenes/scene-${card}-v2.webp`} alt={names[card]?.[lang==='ko'?0:1] || 'Workshop scene'} width="1536" height="1024" decoding="async" /></figure>;
}

