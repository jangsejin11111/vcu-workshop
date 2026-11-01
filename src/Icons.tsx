import React from "react";
type Name = "cards" | "people" | "chat" | "check" | "clock" | "expand" | "pen" | "spark" | "screen";
const paths: Record<Name,string> = {
 cards:"M8 3h11v15H8z M5 6H3v15h11v-1 M11 7h5 M11 11h5",
 people:"M9 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6 M3 20v-2a6 6 0 0 1 12 0v2 M16 5a3 3 0 0 1 0 6 M18 14a5 5 0 0 1 3 4v2",
 chat:"M4 4h16v12H9l-5 4z M8 8h8 M8 12h5",
 check:"m5 12 4 4L19 6",
 clock:"M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18 M12 7v5l3 2",
 expand:"M8 3H3v5 M16 3h5v5 M3 16v5h5 M21 16v5h-5",
 pen:"m4 16 11-11 4 4L8 20H4z M13 7l4 4 M4 20h16",
 spark:"m12 2 3 7 7 3-7 3-3 7-3-7-7-3 7-3z",
 screen:"M3 4h18v13H3z M12 17v4 M8 21h8"
};
export function Icon({name}:{name:Name}) {return <svg className="ui-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false"><path d={paths[name]}/></svg>;}
export function CardMark(){return <div className="card-mark" aria-hidden="true"><span className="mark-card back"><Icon name="chat"/></span><span className="mark-card front"><Icon name="spark"/><b>“ ”</b><span>ONE SCENE<br/>DIFFERENT FEELINGS</span></span><i>+</i></div>;}
