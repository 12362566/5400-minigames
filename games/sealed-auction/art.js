// Original vector illustrations. No external artwork or fonts.
const paths={
 vase:`<path d="M25 14h14l-2 12c-1 6 12 11 12 22 0 10-34 10-34 0 0-11 13-16 12-22z"/><path d="M23 38q9 8 18 0M23 43q9 8 18 0" class="detail"/><path d="M24 13h16" class="line"/>`,
 coin:`<circle cx="32" cy="32" r="22"/><circle cx="32" cy="32" r="16" class="detail"/><path d="M26 26h12v12H26z" class="cut"/><path d="M32 13v5m0 28v5M13 32h5m28 0h5" class="line"/>`,
 ring:`<ellipse cx="32" cy="40" rx="15" ry="16" class="detail"/><path d="M20 19l7-8h10l7 8-12 16z"/><path d="M20 19h24M27 11l5 24 5-24" class="detail"/>`,
 scroll:`<path d="M18 12h30v40H18z"/><path d="M16 10v44m33-44v44M24 22l7-5 10 8-7 6 5 9-14 4" class="detail"/><path d="M12 10h8m-8 44h8m25-44h8m-8 44h8" class="line"/>`,
 camera:`<rect x="10" y="22" width="44" height="28" rx="5"/><path d="M18 22l3-8h13l4 8"/><circle cx="33" cy="36" r="11" class="detail"/><circle cx="33" cy="36" r="6" class="cut"/><path d="M14 27h6m25 1h4" class="line"/>`,
 watch:`<path d="M25 6h14l3 18H22zM22 40h20l-3 18H25z"/><circle cx="32" cy="32" r="17"/><circle cx="32" cy="32" r="13" class="detail"/><path d="M32 22v11l7 4" class="line"/>`,
 bottle:`<path d="M25 8h14v15l7 12v19H18V35l7-12z"/><path d="M25 15h14M20 39h24v11H20" class="detail"/><path d="M27 26l-5 11" class="line"/>`,
 cup:`<path d="M12 19h33v21c0 15-33 15-33 0z"/><path d="M45 22h6c11 0 7 20-6 20M10 55h40" class="line"/><path d="M19 27v13" class="detail"/>`,
 statue:`<path d="M18 53h28v5H18zM23 50l3-17-7-6 7-7h12l7 7-7 6 3 17z"/><circle cx="32" cy="12" r="8"/><path d="M29 29l3 8 4-8M26 47h12" class="detail"/>`,
 gem:`<path d="M12 25l12-14h16l12 14-20 30z"/><path d="M12 25h40M24 11l-2 14 10 30 10-30-2-14M24 11l8 14 8-14" class="detail"/>`,
 unknown:`<path d="M16 16h32v32H16z" class="detail"/><path d="M26 27a6 6 0 0 1 12 0c0 5-6 4-6 10" class="line"/><circle cx="32" cy="43" r="1.7"/>`,
 gavel:`<path d="M18 14l10-9 20 22-10 9z"/><path d="M31 28L12 48l6 6 19-20M31 51h22v6H31z"/><path d="M22 10l20 22" class="detail"/>`,
 eye:`<path d="M5 32q27-33 54 0-27 33-54 0z" class="detail"/><circle cx="32" cy="32" r="10"/><circle cx="32" cy="32" r="4" class="cut"/>`,
 chart:`<path d="M12 52V37h9v15zm16 0V24h9v28zm16 0V10h9v42z"/><path d="M9 27l15-11 9 1L50 5" class="line"/>`
};
export function art(kind='unknown',cls=''){return `<svg class="art ${cls}" viewBox="0 0 64 64" aria-hidden="true" xmlns="http://www.w3.org/2000/svg">${paths[kind]||paths.unknown}</svg>`}
export function avatar(i=0){const hair=['M14 28q-3-25 18-23 21-2 18 23l-9-14-23 7z','M13 31q-4-28 19-26 24 0 20 28l-6-14-6 4-18-5z','M11 31Q5 4 29 3q29-3 24 33l-8-12-4-11-14 7-8 15z','M11 32q0-30 23-27 25 4 16 32l-4-19-12-7-8 12-8 3z'];return `<svg class="avatar-art" viewBox="0 0 64 72" aria-hidden="true"><path d="M7 72V60q2-15 25-15t25 15v12" fill="currentColor" opacity=".55"/><path d="M23 45v10l9 7 10-7V43" fill="#caa98a"/><ellipse cx="32" cy="30" rx="17" ry="23" fill="#ddbd9c"/><path d="${hair[i%4]}" fill="${['#e6e4d8','#353c44','#bcb6cf','#342f2c'][i%4]}"/><path d="M22 30h4m13 0h4M29 40q4 3 7 0" fill="none" stroke="#51483e" stroke-width="2" stroke-linecap="round"/><path d="M21 53l11 9-10 8-5-15m25-2-10 9 10 8 6-15" fill="currentColor"/></svg>`}
